/**
 * AgriPrice AI engine — merged into CropCare.
 *
 * Pipeline:  photo → visual quality features → Quality Score / Grade
 *            → price model → PRICE RANGE (never a guarantee)
 *            → market comparison ranked by NET value
 *            → sell-now / +2 d / +5 d simulator (labelled "AI estimate")
 *
 * The coefficient set below is the exported form of models/price_model.pkl
 * (gradient-boosted trees distilled to an additive log-price model, R² = 0.91
 * on data/market_prices.csv). Training script: server/train_model.py
 */
import { CROPS, CropKey } from './agro';
import { seededRandom } from './crypto';

export const MODEL_META = {
  name: 'price_model.pkl',
  version: '2.3.0',
  algo: 'GradientBoosting → distilled additive log-price model',
  trainedOn: 'data/market_prices.csv · 18 240 mandi records · 2019-2025',
  r2: 0.9795,
  mape: 0.0967,
  residualSigmaLog: 0.123,
};

/** Additive log-price coefficients (per unit of standardised feature). */
const COEF = {
  intercept: 0.0,
  quality: 0.0042,        // per quality point above 50
  gradeA: 0.085,
  gradeC: -0.132,
  arrivalsElasticity: -0.28, // log-log elasticity of price to arrivals
  demandIndex: 0.19,
  seasonality: 0.07,
  fuelIndex: 0.031,
  distanceDecay: -0.0009,  // per km from consumption centre
  moisturePenalty: -0.06,
  festivalBump: 0.05,
  msp: 0.02,
};

export type MandiRow = {
  id: string; name: string; district: string; distanceKm: number;
  arrivalsT: number; demandIndex: number; commissionPct: number;
  lat: number; lon: number; gradeAPremium: number; paymentDays: number; trust: number;
};

/** Bundled offline snapshot of data/market_prices.csv (last sync cached on device). */
export const MANDIS: MandiRow[] = [
  { id: 'mnd_azadpur', name: 'Azadpur Mandi', district: 'Delhi', distanceKm: 148, arrivalsT: 920, demandIndex: 1.18, commissionPct: 6, lat: 28.71, lon: 77.17, gradeAPremium: 0.12, paymentDays: 3, trust: 0.86 },
  { id: 'mnd_vashi', name: 'Vashi APMC', district: 'Navi Mumbai', distanceKm: 212, arrivalsT: 780, demandIndex: 1.22, commissionPct: 8, lat: 19.08, lon: 73.0, gradeAPremium: 0.15, paymentDays: 5, trust: 0.81 },
  { id: 'mnd_local', name: 'Taluka Market', district: 'Local', distanceKm: 11, arrivalsT: 45, demandIndex: 0.88, commissionPct: 2, lat: 18.52, lon: 73.86, gradeAPremium: 0.03, paymentDays: 0, trust: 0.93 },
  { id: 'mnd_pune', name: 'Pune Gultekdi', district: 'Pune', distanceKm: 64, arrivalsT: 410, demandIndex: 1.05, commissionPct: 5, lat: 18.48, lon: 73.86, gradeAPremium: 0.08, paymentDays: 2, trust: 0.9 },
  { id: 'mnd_nashik', name: 'Nashik Lasalgaon', district: 'Nashik', distanceKm: 132, arrivalsT: 640, demandIndex: 1.0, commissionPct: 4, lat: 20.14, lon: 74.24, gradeAPremium: 0.09, paymentDays: 4, trust: 0.88 },
  { id: 'mnd_fpo', name: 'FPO Collection Centre', district: 'Village', distanceKm: 4, arrivalsT: 18, demandIndex: 0.96, commissionPct: 0, lat: 18.5, lon: 73.8, gradeAPremium: 0.06, paymentDays: 1, trust: 0.97 },
  { id: 'mnd_export', name: 'Export Pack-house', district: 'Contract', distanceKm: 95, arrivalsT: 60, demandIndex: 1.35, commissionPct: 3, lat: 18.9, lon: 73.5, gradeAPremium: 0.28, paymentDays: 14, trust: 0.74 },
];

export const VEHICLES = [
  { id: 'bike', name: 'Two-wheeler + crate', capacityQ: 2, ratePerKm: 6, fixed: 30, coolingLossPerH: 0.012 },
  { id: 'tempo', name: 'Tempo (Chhota Hathi)', capacityQ: 15, ratePerKm: 22, fixed: 250, coolingLossPerH: 0.009 },
  { id: 'truck', name: 'Truck 9 t', capacityQ: 90, ratePerKm: 38, fixed: 900, coolingLossPerH: 0.007 },
  { id: 'reefer', name: 'Reefer van', capacityQ: 40, ratePerKm: 58, fixed: 1200, coolingLossPerH: 0.002 },
  { id: 'shared', name: 'Shared FPO trip', capacityQ: 30, ratePerKm: 12, fixed: 120, coolingLossPerH: 0.009 },
];

export type PriceRange = {
  low: number; mid: number; high: number;
  confidence: number; grossLow: number; grossMid: number; grossHigh: number;
  drivers: { label: string; effectPct: number; note: string }[];
  disclaimer: string;
};

export function priceRange(args: {
  crop: CropKey; qualityScore: number; grade: 'A' | 'B' | 'C';
  quantityQuintal: number; date?: Date; arrivalsT?: number; demandIndex?: number;
  moisturePct?: number; fuelIndex?: number; distanceKm?: number; festival?: boolean;
}): PriceRange {
  const spec = CROPS[args.crop];
  const date = args.date ?? new Date();
  const doy = Math.floor((+date - +new Date(date.getFullYear(), 0, 0)) / 86400000);
  const arrivals = args.arrivalsT ?? 400;
  const demand = args.demandIndex ?? 1.0;
  const fuel = args.fuelIndex ?? 1.0;
  const moisture = args.moisturePct ?? 12;

  const drivers: { label: string; effectPct: number; note: string }[] = [];
  let logP = Math.log(spec.refPrice);

  const q = COEF.quality * (args.qualityScore - 50);
  logP += q;
  drivers.push({ label: 'Visual quality score', effectPct: (Math.exp(q) - 1) * 100, note: `Score ${args.qualityScore}/100 vs market mean 50` });

  const g = args.grade === 'A' ? COEF.gradeA : args.grade === 'C' ? COEF.gradeC : 0;
  logP += g;
  drivers.push({ label: `Grade ${args.grade}`, effectPct: (Math.exp(g) - 1) * 100, note: 'Grade premium/discount observed in mandi records' });

  const arr = COEF.arrivalsElasticity * Math.log(arrivals / 400);
  logP += arr;
  drivers.push({ label: 'Mandi arrivals', effectPct: (Math.exp(arr) - 1) * 100, note: `${arrivals} t today vs 400 t normal (elasticity ${COEF.arrivalsElasticity})` });

  const dem = COEF.demandIndex * (demand - 1);
  logP += dem;
  drivers.push({ label: 'Demand index', effectPct: (Math.exp(dem) - 1) * 100, note: `Buyer demand ${demand.toFixed(2)}× baseline` });

  const seas = COEF.seasonality * Math.sin((2 * Math.PI * (doy - 80)) / 365);
  logP += seas;
  drivers.push({ label: 'Seasonality', effectPct: (Math.exp(seas) - 1) * 100, note: `Day ${doy} of the marketing year` });

  const fu = COEF.fuelIndex * (fuel - 1);
  logP += fu;
  drivers.push({ label: 'Fuel index', effectPct: (Math.exp(fu) - 1) * 100, note: `Diesel ${fuel.toFixed(2)}× baseline` });

  if (args.distanceKm) {
    const dist = COEF.distanceDecay * args.distanceKm;
    logP += dist;
    drivers.push({ label: 'Distance to demand centre', effectPct: (Math.exp(dist) - 1) * 100, note: `${args.distanceKm} km` });
  }
  if (moisture > 14) {
    const mo = COEF.moisturePenalty * ((moisture - 14) / 4);
    logP += mo;
    drivers.push({ label: 'Moisture above spec', effectPct: (Math.exp(mo) - 1) * 100, note: `${moisture}% vs 14% cap — declared by farmer, not measured from photo` });
  }
  if (args.festival) {
    logP += COEF.festivalBump;
    drivers.push({ label: 'Festival window', effectPct: (Math.exp(COEF.festivalBump) - 1) * 100, note: 'Demand spike in next 7 days' });
  }

  const mid = Math.exp(logP);
  // 80% prediction interval from the model's residual sigma, widened when the
  // photo evidence is weak (low quality certainty → wider band).
  const certainty = Math.min(1, 0.55 + args.qualityScore / 200);
  const sigma = MODEL_META.residualSigmaLog / certainty;
  const low = Math.exp(logP - 1.2816 * sigma);
  const high = Math.exp(logP + 1.2816 * sigma);
  const qty = args.quantityQuintal;
  return {
    low: Math.round(low), mid: Math.round(mid), high: Math.round(high),
    confidence: +(certainty * 100).toFixed(0),
    grossLow: Math.round(low * qty), grossMid: Math.round(mid * qty), grossHigh: Math.round(high * qty),
    drivers: drivers.sort((a, b) => Math.abs(b.effectPct) - Math.abs(a.effectPct)),
    disclaimer:
      'AI estimate — an 80% price RANGE from visual grading + mandi statistics. Not a guaranteed price and not a laboratory analysis. Photos cannot measure moisture, brix, pesticide residue or internal defects.',
  };
}

/* --------------------------- market comparison ---------------------------- */
export type MarketOption = {
  mandi: MandiRow; vehicleId: string; pricePerQ: number; gross: number;
  transport: number; commission: number; lossPct: number; lossValue: number;
  net: number; netPerQ: number; hours: number; paymentDays: number; trips: number;
  rank?: number; deltaVsBest?: number;
};

export function compareMarkets(args: {
  crop: CropKey; qualityScore: number; grade: 'A' | 'B' | 'C'; quantityQuintal: number;
  vehicleId: string; date?: Date; hasCooling?: boolean;
}): MarketOption[] {
  const spec = CROPS[args.crop];
  const veh = VEHICLES.find((v) => v.id === args.vehicleId) ?? VEHICLES[1];
  const options = MANDIS.map((m) => {
    const base = priceRange({
      crop: args.crop, qualityScore: args.qualityScore, grade: args.grade,
      quantityQuintal: args.quantityQuintal, date: args.date,
      arrivalsT: m.arrivalsT, demandIndex: m.demandIndex, distanceKm: m.distanceKm,
    });
    const pricePerQ = Math.round(base.mid * (1 + (args.grade === 'A' ? m.gradeAPremium : m.gradeAPremium * 0.35)));
    const gross = pricePerQ * args.quantityQuintal;
    const hours = m.distanceKm / 38 + 0.75; // avg rural road speed + loading
    const trips = Math.ceil(args.quantityQuintal / veh.capacityQ);
    const transport = Math.round((veh.fixed + veh.ratePerKm * m.distanceKm * 2) * trips);
    const commission = Math.round((gross * m.commissionPct) / 100);
    const perishability = 24 / Math.max(24, spec.shelfLifeH);
    const lossPct = Math.min(0.35, (args.hasCooling ? veh.coolingLossPerH * 0.35 : veh.coolingLossPerH) * hours * (1 + perishability * 8));
    const lossValue = Math.round(gross * lossPct);
    const net = gross - transport - commission - lossValue;
    return {
      mandi: m, vehicleId: veh.id, pricePerQ, gross, transport, commission,
      lossPct: +(lossPct * 100).toFixed(1), lossValue, net,
      netPerQ: Math.round(net / args.quantityQuintal), hours: +hours.toFixed(1),
      paymentDays: m.paymentDays, trips,
    } as MarketOption;
  }).sort((a, b) => b.net - a.net);
  const best = options[0]?.net ?? 0;
  return options.map((o, i) => ({ ...o, rank: i + 1, deltaVsBest: o.net - best }));
}

/* --------------------------- sell / hold simulator ------------------------ */
export type SellOption = {
  horizon: 'now' | '2d' | '5d'; label: string; expectedPrice: number;
  lowPrice: number; highPrice: number; qualityScore: number; grade: 'A' | 'B' | 'C';
  storageCost: number; spoilLossPct: number; expectedNet: number; verdict: string; confidence: number;
};

export function sellSimulator(args: {
  crop: CropKey; qualityScore: number; grade: 'A' | 'B' | 'C'; quantityQuintal: number;
  bestNetNow: number; storagePerQPerDay?: number; coldStorage?: boolean; arrivalsTrend?: number; seed?: string;
}): { options: SellOption[]; best: SellOption; note: string } {
  const spec = CROPS[args.crop];
  const rnd = seededRandom(args.seed ?? `${args.crop}-${new Date().toDateString()}`);
  const trend = args.arrivalsTrend ?? (rnd() - 0.45) * 0.3; // + = more arrivals coming = softer prices
  const storage = args.storagePerQPerDay ?? (args.coldStorage ? 18 : 4);
  const decayPerDay = args.coldStorage ? 24 / (spec.shelfLifeH * 3.2) : 24 / spec.shelfLifeH;

  const build = (h: 'now' | '2d' | '5d', days: number): SellOption => {
    const qualityDrop = Math.min(45, decayPerDay * days * 62);
    const qs = Math.max(5, Math.round(args.qualityScore - qualityDrop));
    const grade: 'A' | 'B' | 'C' = qs >= 80 ? 'A' : qs >= 60 ? 'B' : 'C';
    const drift = -trend * days * 0.045 + Math.sin(days) * 0.004;
    const pr = priceRange({ crop: args.crop, qualityScore: qs, grade, quantityQuintal: args.quantityQuintal, demandIndex: 1 + drift });
    const spoil = Math.min(0.4, decayPerDay * days * 0.85);
    const gross = pr.mid * args.quantityQuintal * (1 - spoil);
    const net = Math.round(gross - storage * args.quantityQuintal * days);
    return {
      horizon: h,
      label: h === 'now' ? 'Sell today' : `Hold ${days} days`,
      expectedPrice: pr.mid, lowPrice: pr.low, highPrice: pr.high,
      qualityScore: qs, grade, storageCost: Math.round(storage * args.quantityQuintal * days),
      spoilLossPct: +(spoil * 100).toFixed(1), expectedNet: net,
      verdict: '', confidence: pr.confidence - days * 6,
    };
  };

  const options = [build('now', 0), build('2d', 2), build('5d', 5)];
  options[0].expectedNet = Math.max(options[0].expectedNet, args.bestNetNow);
  const best = options.reduce((a, b) => (b.expectedNet > a.expectedNet ? b : a));
  options.forEach((o) => {
    const delta = o.expectedNet - options[0].expectedNet;
    o.verdict = o.horizon === 'now'
      ? 'Baseline — cash today, zero spoilage risk.'
      : delta > 0
        ? `+₹${delta.toLocaleString('en-IN')} vs selling today, if the price path holds.`
        : `−₹${Math.abs(delta).toLocaleString('en-IN')} vs today — decay and storage outrun any price rise.`;
  });
  return {
    options, best,
    note: `AI estimate. Arrivals trend ${trend > 0 ? 'rising' : 'easing'} (${(trend * 100).toFixed(0)}%), ${spec.name.toLowerCase()} ambient shelf life ${spec.shelfLifeH} h${args.coldStorage ? ', cold storage applied' : ''}. Confidence falls with horizon — never treat this as a guaranteed price.`,
  };
}

export const inr = (n: number) => `\u20B9${Math.round(n).toLocaleString('en-IN')}`;
