/**
 * CropCare agronomy engines — all deterministic, offline, unit-tested math.
 *  • FAO-56 Penman-Monteith reference evapotranspiration + dual crop coefficient
 *  • FAO-56 soil water balance (TAW / RAW / depletion) irrigation scheduler
 *  • Wang-Engel beta thermal-response phenology
 *  • SEIR epidemiology for foliar disease spread
 *  • AquaCrop-lite canopy-cover → biomass → yield water-productivity model
 */

export type CropKey = 'tomato' | 'wheat' | 'rice' | 'onion' | 'potato' | 'cotton' | 'chilli' | 'maize' | 'banana' | 'grape';

export type CropSpec = {
  key: CropKey;
  name: string;
  emoji: string;
  kc: { ini: number; mid: number; end: number };
  stages: { ini: number; dev: number; mid: number; late: number }; // days
  rootDepth: number; // m
  depletionFraction: number; // p
  tBase: number; tOpt: number; tMax: number; // Wang-Engel cardinal temps (°C)
  gddToMaturity: number;
  wp: number; // normalised water productivity g/m²
  hi: number; // harvest index
  refPrice: number; // ₹/quintal baseline
  shelfLifeH: number; // ambient shelf life hours
  idealHue: [number, number]; // ripe hue window (HSV degrees)
  coldChain: { tempC: [number, number]; rh: [number, number]; ethyleneSensitive: boolean };
};

export const CROPS: Record<CropKey, CropSpec> = {
  tomato: { key: 'tomato', name: 'Tomato', emoji: '\u{1F345}', kc: { ini: 0.6, mid: 1.15, end: 0.8 }, stages: { ini: 30, dev: 40, mid: 45, late: 30 }, rootDepth: 0.9, depletionFraction: 0.4, tBase: 10, tOpt: 25, tMax: 35, gddToMaturity: 1400, wp: 18, hi: 0.6, refPrice: 1800, shelfLifeH: 96, idealHue: [0, 18], coldChain: { tempC: [10, 13], rh: [85, 95], ethyleneSensitive: true } },
  wheat: { key: 'wheat', name: 'Wheat', emoji: '\u{1F33E}', kc: { ini: 0.4, mid: 1.15, end: 0.35 }, stages: { ini: 20, dev: 60, mid: 60, late: 30 }, rootDepth: 1.5, depletionFraction: 0.55, tBase: 0, tOpt: 22, tMax: 35, gddToMaturity: 2100, wp: 15, hi: 0.45, refPrice: 2300, shelfLifeH: 8760, idealHue: [35, 55], coldChain: { tempC: [10, 20], rh: [50, 60], ethyleneSensitive: false } },
  rice: { key: 'rice', name: 'Rice', emoji: '\u{1F35A}', kc: { ini: 1.05, mid: 1.2, end: 0.75 }, stages: { ini: 30, dev: 30, mid: 60, late: 30 }, rootDepth: 0.6, depletionFraction: 0.2, tBase: 10, tOpt: 28, tMax: 40, gddToMaturity: 2000, wp: 19, hi: 0.45, refPrice: 2100, shelfLifeH: 8760, idealHue: [40, 60], coldChain: { tempC: [10, 20], rh: [50, 65], ethyleneSensitive: false } },
  onion: { key: 'onion', name: 'Onion', emoji: '\u{1F9C5}', kc: { ini: 0.7, mid: 1.05, end: 0.75 }, stages: { ini: 20, dev: 35, mid: 110, late: 45 }, rootDepth: 0.5, depletionFraction: 0.3, tBase: 6, tOpt: 20, tMax: 32, gddToMaturity: 1600, wp: 14, hi: 0.7, refPrice: 1500, shelfLifeH: 2160, idealHue: [20, 45], coldChain: { tempC: [0, 4], rh: [65, 70], ethyleneSensitive: false } },
  potato: { key: 'potato', name: 'Potato', emoji: '\u{1F954}', kc: { ini: 0.5, mid: 1.15, end: 0.75 }, stages: { ini: 25, dev: 30, mid: 45, late: 30 }, rootDepth: 0.6, depletionFraction: 0.35, tBase: 7, tOpt: 21, tMax: 30, gddToMaturity: 1500, wp: 17, hi: 0.75, refPrice: 1200, shelfLifeH: 4320, idealHue: [25, 50], coldChain: { tempC: [4, 8], rh: [90, 95], ethyleneSensitive: true } },
  cotton: { key: 'cotton', name: 'Cotton', emoji: '\u{1F9F5}', kc: { ini: 0.35, mid: 1.18, end: 0.6 }, stages: { ini: 30, dev: 50, mid: 60, late: 55 }, rootDepth: 1.4, depletionFraction: 0.65, tBase: 15, tOpt: 30, tMax: 40, gddToMaturity: 2400, wp: 15, hi: 0.35, refPrice: 7000, shelfLifeH: 8760, idealHue: [0, 60], coldChain: { tempC: [15, 25], rh: [50, 65], ethyleneSensitive: false } },
  chilli: { key: 'chilli', name: 'Chilli', emoji: '\u{1F336}', kc: { ini: 0.6, mid: 1.05, end: 0.9 }, stages: { ini: 30, dev: 35, mid: 40, late: 20 }, rootDepth: 0.8, depletionFraction: 0.3, tBase: 12, tOpt: 27, tMax: 38, gddToMaturity: 1450, wp: 16, hi: 0.5, refPrice: 9000, shelfLifeH: 120, idealHue: [0, 20], coldChain: { tempC: [7, 10], rh: [90, 95], ethyleneSensitive: true } },
  maize: { key: 'maize', name: 'Maize', emoji: '\u{1F33D}', kc: { ini: 0.35, mid: 1.2, end: 0.6 }, stages: { ini: 25, dev: 40, mid: 45, late: 30 }, rootDepth: 1.2, depletionFraction: 0.55, tBase: 8, tOpt: 28, tMax: 38, gddToMaturity: 1700, wp: 33, hi: 0.5, refPrice: 1900, shelfLifeH: 8760, idealHue: [40, 60], coldChain: { tempC: [10, 20], rh: [55, 65], ethyleneSensitive: false } },
  banana: { key: 'banana', name: 'Banana', emoji: '\u{1F34C}', kc: { ini: 0.5, mid: 1.1, end: 1.0 }, stages: { ini: 120, dev: 90, mid: 120, late: 60 }, rootDepth: 0.7, depletionFraction: 0.35, tBase: 14, tOpt: 27, tMax: 38, gddToMaturity: 3200, wp: 20, hi: 0.6, refPrice: 1400, shelfLifeH: 168, idealHue: [45, 62], coldChain: { tempC: [13, 15], rh: [85, 95], ethyleneSensitive: true } },
  grape: { key: 'grape', name: 'Grape', emoji: '\u{1F347}', kc: { ini: 0.3, mid: 0.85, end: 0.45 }, stages: { ini: 20, dev: 50, mid: 75, late: 60 }, rootDepth: 1.2, depletionFraction: 0.45, tBase: 10, tOpt: 25, tMax: 35, gddToMaturity: 1800, wp: 14, hi: 0.55, refPrice: 5500, shelfLifeH: 336, idealHue: [270, 320], coldChain: { tempC: [-1, 0], rh: [90, 95], ethyleneSensitive: false } },
};

export const SOILS = {
  sandy: { name: 'Sandy', fc: 0.12, pwp: 0.05, infil: 30 },
  loam: { name: 'Loam', fc: 0.26, pwp: 0.12, infil: 15 },
  clay_loam: { name: 'Clay loam', fc: 0.32, pwp: 0.18, infil: 8 },
  clay: { name: 'Clay', fc: 0.4, pwp: 0.25, infil: 3 },
  black_cotton: { name: 'Black cotton', fc: 0.45, pwp: 0.28, infil: 2 },
} as const;
export type SoilKey = keyof typeof SOILS;

/* ------------------------- FAO-56 Penman-Monteith ------------------------- */
export type WeatherDay = {
  date: string;
  tMin: number; tMax: number; rhMean: number; windMs: number; radMJ: number; rainMm: number;
};

export function et0PenmanMonteith(d: WeatherDay, elevationM: number, latitudeDeg: number, doy: number): number {
  const tMean = (d.tMax + d.tMin) / 2;
  const P = 101.3 * Math.pow((293 - 0.0065 * elevationM) / 293, 5.26); // kPa
  const gamma = 0.000665 * P;
  const esat = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
  const es = (esat(d.tMax) + esat(d.tMin)) / 2;
  const ea = (es * d.rhMean) / 100;
  const delta = (4098 * esat(tMean)) / Math.pow(tMean + 237.3, 2);
  const lat = (latitudeDeg * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365);
  const decl = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39);
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(decl))));
  const Ra = ((24 * 60) / Math.PI) * 0.082 * dr * (ws * Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.sin(ws));
  const Rso = (0.75 + 2e-5 * elevationM) * Ra;
  const Rs = Math.min(d.radMJ, Rso);
  const Rns = 0.77 * Rs;
  const sb = 4.903e-9;
  const Rnl = sb * ((Math.pow(d.tMax + 273.16, 4) + Math.pow(d.tMin + 273.16, 4)) / 2) * (0.34 - 0.14 * Math.sqrt(ea)) * (1.35 * (Rs / Math.max(0.1, Rso)) - 0.35);
  const Rn = Rns - Rnl;
  const u2 = d.windMs;
  const num = 0.408 * delta * Rn + gamma * (900 / (tMean + 273)) * u2 * (es - ea);
  const den = delta + gamma * (1 + 0.34 * u2);
  return Math.max(0, num / den);
}

/** Hargreaves-Samani fallback when radiation is unavailable (FAO-56 eq. 52). */
export function et0Hargreaves(d: WeatherDay, latitudeDeg: number, doy: number): number {
  const lat = (latitudeDeg * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365);
  const decl = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39);
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(decl))));
  const Ra = ((24 * 60) / Math.PI) * 0.082 * dr * (ws * Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.sin(ws));
  const tMean = (d.tMax + d.tMin) / 2;
  return 0.0023 * (tMean + 17.8) * Math.sqrt(Math.max(0, d.tMax - d.tMin)) * Ra * 0.408;
}

export function kcForDay(crop: CropSpec, das: number): { kc: number; stage: string } {
  const { ini, dev, mid } = crop.stages;
  if (das <= ini) return { kc: crop.kc.ini, stage: 'Initial' };
  if (das <= ini + dev) {
    const f = (das - ini) / dev;
    return { kc: crop.kc.ini + f * (crop.kc.mid - crop.kc.ini), stage: 'Development' };
  }
  if (das <= ini + dev + mid) return { kc: crop.kc.mid, stage: 'Mid-season' };
  const f = Math.min(1, (das - ini - dev - mid) / crop.stages.late);
  return { kc: crop.kc.mid + f * (crop.kc.end - crop.kc.mid), stage: 'Late season' };
}

export type IrrigationResult = {
  et0: number; etc: number; kc: number; stage: string;
  taw: number; raw: number; depletion: number; depletionPct: number;
  irrigateNow: boolean; netDepthMm: number; grossDepthMm: number; litresPerHa: number;
  hoursToRun: number; nextCheckDays: number; reason: string; stress: number;
};

export function irrigationAdvice(args: {
  crop: CropSpec; soil: SoilKey; das: number; weather: WeatherDay[]; elevationM: number; latitude: number;
  currentDepletionMm: number; efficiency: number; systemLph: number; areaHa: number;
}): IrrigationResult {
  const today = args.weather[0];
  const doy = Math.floor((Date.parse(today.date) - Date.parse(today.date.slice(0, 4) + '-01-01')) / 86400000) + 1;
  const et0 = et0PenmanMonteith(today, args.elevationM, args.latitude, doy);
  const { kc, stage } = kcForDay(args.crop, args.das);
  const soil = SOILS[args.soil];
  const rootDepth = Math.min(args.crop.rootDepth, 0.25 + (args.das / 60) * args.crop.rootDepth);
  const taw = 1000 * (soil.fc - soil.pwp) * rootDepth;
  const raw = taw * args.crop.depletionFraction;
  const etc = et0 * kc;
  const effRain = Math.max(0, today.rainMm * 0.8 - 2);
  const depletion = Math.max(0, Math.min(taw, args.currentDepletionMm + etc - effRain));
  const stress = depletion > raw ? Math.min(1, (depletion - raw) / Math.max(1, taw - raw)) : 0;
  const irrigateNow = depletion >= raw * 0.92;
  const netDepth = irrigateNow ? Math.round(depletion) : 0;
  const grossDepth = irrigateNow ? Math.round(netDepth / args.efficiency) : 0;
  const litresPerHa = grossDepth * 10000;
  const hoursToRun = args.systemLph > 0 ? (litresPerHa * args.areaHa) / args.systemLph : 0;
  const forecastRain = args.weather.slice(1, 4).reduce((s, w) => s + w.rainMm, 0);
  let reason: string;
  if (forecastRain > 15 && depletion < taw * 0.8) reason = `Hold — ${forecastRain.toFixed(0)} mm rain forecast in 72 h covers the ${depletion.toFixed(0)} mm deficit.`;
  else if (irrigateNow) reason = `Root-zone depletion ${depletion.toFixed(0)} mm has reached RAW (${raw.toFixed(0)} mm). Irrigating now avoids yield-limiting stress.`;
  else reason = `Depletion ${depletion.toFixed(0)} mm of ${raw.toFixed(0)} mm readily-available water — soil buffer is sufficient.`;
  const daysToRaw = etc > 0 ? Math.max(0, (raw - depletion) / etc) : 3;
  return {
    et0: +et0.toFixed(2), etc: +etc.toFixed(2), kc: +kc.toFixed(2), stage,
    taw: +taw.toFixed(0), raw: +raw.toFixed(0), depletion: +depletion.toFixed(1),
    depletionPct: +((depletion / taw) * 100).toFixed(0),
    irrigateNow: irrigateNow && forecastRain <= 15,
    netDepthMm: netDepth, grossDepthMm: grossDepth, litresPerHa,
    hoursToRun: +hoursToRun.toFixed(1), nextCheckDays: Math.max(1, Math.round(daysToRaw)),
    reason, stress: +stress.toFixed(2),
  };
}

/* ------------------------- Wang-Engel phenology --------------------------- */
/** Beta temperature-response function (Wang & Engel 1998), 0..1. */
export function wangEngel(t: number, tBase: number, tOpt: number, tMax: number): number {
  if (t <= tBase || t >= tMax) return 0;
  const alpha = Math.log(2) / Math.log((tMax - tBase) / (tOpt - tBase));
  const a = Math.pow(tOpt - tBase, alpha);
  const num = 2 * Math.pow(t - tBase, alpha) * a - Math.pow(t - tBase, 2 * alpha);
  return Math.max(0, num / (a * a));
}

export type PhenologyPoint = { day: number; gdd: number; cum: number; f: number; stage: string };

export function phenology(crop: CropSpec, temps: { tMin: number; tMax: number }[]): { series: PhenologyPoint[]; maturityDay: number | null; pct: number } {
  let cum = 0;
  const series: PhenologyPoint[] = [];
  let maturityDay: number | null = null;
  temps.forEach((t, i) => {
    const tMean = (t.tMin + t.tMax) / 2;
    const f = wangEngel(tMean, crop.tBase, crop.tOpt, crop.tMax);
    const gdd = f * (crop.tOpt - crop.tBase);
    cum += gdd;
    const pct = cum / crop.gddToMaturity;
    const stage = pct < 0.15 ? 'Emergence' : pct < 0.35 ? 'Vegetative' : pct < 0.55 ? 'Flowering' : pct < 0.8 ? 'Fruit fill' : pct < 1 ? 'Ripening' : 'Mature';
    if (!maturityDay && cum >= crop.gddToMaturity) maturityDay = i + 1;
    series.push({ day: i + 1, gdd: +gdd.toFixed(2), cum: +cum.toFixed(1), f: +f.toFixed(3), stage });
  });
  return { series, maturityDay, pct: Math.min(1, cum / crop.gddToMaturity) };
}

/* --------------------------- SEIR disease model --------------------------- */
export type SeirState = { S: number; E: number; I: number; R: number };
export type SeirPoint = SeirState & { day: number; newInfections: number };

/**
 * Foliar-disease SEIR on a per-plant-unit basis. Transmission is modulated by
 * leaf-wetness/RH and temperature suitability, damped by fungicide protection.
 */
export function seir(args: {
  days: number; beta0: number; sigma: number; gamma: number; initialInfected: number;
  rh: number[]; temp: number[]; protection: number; tOpt?: number;
}): { series: SeirPoint[]; peakDay: number; peakInfected: number; finalLoss: number; r0: number } {
  const N = 1;
  let S = N - args.initialInfected, E = 0, I = args.initialInfected, R = 0;
  const series: SeirPoint[] = [];
  let peakDay = 0, peakInfected = 0;
  const tOpt = args.tOpt ?? 22;
  for (let d = 0; d < args.days; d++) {
    const rh = args.rh[d % args.rh.length];
    const t = args.temp[d % args.temp.length];
    const wetness = Math.max(0, Math.min(1, (rh - 60) / 35));
    const tempFactor = Math.exp(-Math.pow(t - tOpt, 2) / 50);
    const beta = args.beta0 * wetness * tempFactor * (1 - args.protection);
    const newInf = beta * S * I;
    const newI = args.sigma * E;
    const newR = args.gamma * I;
    S = Math.max(0, S - newInf);
    E = Math.max(0, E + newInf - newI);
    I = Math.max(0, I + newI - newR);
    R = Math.min(N, R + newR);
    if (I > peakInfected) { peakInfected = I; peakDay = d + 1; }
    series.push({ day: d + 1, S: +S.toFixed(4), E: +E.toFixed(4), I: +I.toFixed(4), R: +R.toFixed(4), newInfections: +newInf.toFixed(4) });
  }
  const meanBeta = args.beta0 * (1 - args.protection) * 0.6;
  return { series, peakDay, peakInfected: +peakInfected.toFixed(3), finalLoss: +(R + I).toFixed(3), r0: +(meanBeta / args.gamma).toFixed(2) };
}

/* ---------------------------- AquaCrop-lite ------------------------------- */
export type TwinDay = { day: number; cc: number; tr: number; biomass: number; ks: number; depletion: number };

/**
 * Canopy-cover driven biomass accumulation (AquaCrop simplification):
 *   Tr = Ks · CC* · Kc,tr · ET0 ;  B = WP* · Σ(Tr/ET0) ;  Y = HI·B
 */
export function aquaCropLite(args: {
  crop: CropSpec; soil: SoilKey; days: number; weather: WeatherDay[];
  irrigationMm: (day: number) => number; latitude: number; elevationM: number;
  ccMax?: number; nutrientStress?: number; pestLoss?: number;
}): { series: TwinDay[]; yieldTHa: number; waterUsedMm: number; wue: number; stressDays: number } {
  const soil = SOILS[args.soil];
  const taw = 1000 * (soil.fc - soil.pwp) * args.crop.rootDepth;
  const raw = taw * args.crop.depletionFraction;
  let depletion = taw * 0.25;
  let biomass = 0, waterUsed = 0, stressDays = 0;
  const series: TwinDay[] = [];
  const ccMax = args.ccMax ?? 0.92;
  const totalDays = args.days;
  for (let d = 0; d < totalDays; d++) {
    const w = args.weather[d % args.weather.length];
    const doy = (d % 365) + 1;
    const et0 = et0PenmanMonteith(w, args.elevationM, args.latitude, doy);
    // logistic canopy growth then senescence
    const grow = ccMax / (1 + Math.exp(-0.11 * (d - totalDays * 0.28)));
    const sen = d > totalDays * 0.75 ? Math.max(0, 1 - (d - totalDays * 0.75) / (totalDays * 0.3)) : 1;
    const ccPot = grow * sen;
    const ks = depletion <= raw ? 1 : Math.max(0, (taw - depletion) / (taw - raw));
    const cc = ccPot * (0.55 + 0.45 * ks);
    const kcTr = args.crop.kc.mid * cc;
    const tr = ks * kcTr * et0;
    const irr = args.irrigationMm(d);
    const effRain = Math.max(0, w.rainMm * 0.8 - 2);
    depletion = Math.max(0, Math.min(taw, depletion + tr + et0 * 0.1 * (1 - cc) - effRain - irr));
    waterUsed += irr + effRain;
    if (ks < 0.95) stressDays++;
    biomass += args.crop.wp * (tr / Math.max(0.5, et0));
    series.push({ day: d + 1, cc: +cc.toFixed(3), tr: +tr.toFixed(2), biomass: +biomass.toFixed(1), ks: +ks.toFixed(2), depletion: +depletion.toFixed(1) });
  }
  const nutrientFactor = 1 - (args.nutrientStress ?? 0);
  const pestFactor = 1 - (args.pestLoss ?? 0);
  const yieldTHa = (biomass * args.crop.hi * nutrientFactor * pestFactor) / 100;
  return {
    series,
    yieldTHa: +yieldTHa.toFixed(2),
    waterUsedMm: +waterUsed.toFixed(0),
    wue: +(yieldTHa * 1000 / Math.max(1, waterUsed * 10)).toFixed(2),
    stressDays,
  };
}

/* ------------------------- intercropping / rotation ----------------------- */
export type Companion = { a: CropKey; b: string; ler: number; why: string; spacing: string };
export const COMPANIONS: Companion[] = [
  { a: 'tomato', b: 'Marigold', ler: 1.24, why: 'Root exudates suppress Meloidogyne nematodes; traps thrips away from fruit.', spacing: '1 marigold row per 4 tomato rows' },
  { a: 'tomato', b: 'Basil', ler: 1.16, why: 'Volatiles repel whitefly; shares canopy layer without competing for light.', spacing: 'Alternating in-row, 30 cm' },
  { a: 'maize', b: 'Cowpea', ler: 1.42, why: 'Legume fixes 40-60 kg N/ha; maize provides shade, cowpea covers soil.', spacing: '2 maize : 2 cowpea strips' },
  { a: 'cotton', b: 'Pigeon pea', ler: 1.31, why: 'Deep taproot draws water from below cotton zone; harbours predatory spiders.', spacing: '6 cotton : 1 pigeon pea' },
  { a: 'wheat', b: 'Mustard', ler: 1.18, why: 'Mustard trap-crops aphids and breaks take-all cycle.', spacing: '9 wheat : 1 mustard' },
  { a: 'onion', b: 'Carrot', ler: 1.22, why: 'Onion odour masks carrot fly; carrot foliage repels onion thrips.', spacing: 'Paired beds' },
  { a: 'rice', b: 'Azolla', ler: 1.27, why: 'Azolla-Anabaena fixes N in standing water and suppresses weeds.', spacing: 'Broadcast at 200 kg/ha fresh' },
  { a: 'chilli', b: 'Coriander', ler: 1.19, why: 'Umbels feed hoverflies whose larvae eat aphids; quick cash from greens.', spacing: 'Border + every 5th row' },
  { a: 'potato', b: 'Bean', ler: 1.21, why: 'Beans fix N and deter Colorado beetle; different rooting depth.', spacing: 'Alternate rows' },
  { a: 'banana', b: 'Turmeric', ler: 1.35, why: 'Shade-loving rhizome uses understorey light, extra income before banana canopy closes.', spacing: 'Between banana mats' },
  { a: 'grape', b: 'Clover cover', ler: 1.12, why: 'Living mulch cuts soil evaporation and hosts predatory mites.', spacing: 'Inter-row strips' },
];
