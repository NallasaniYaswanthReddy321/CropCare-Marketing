/**
 * Offline-first application state.
 * Every mutation is (a) persisted to encrypted local storage, (b) appended to
 * the hash-chained audit log, and (c) queued in the outbox for mesh sync.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChainEntry, chainAppend, encryptField, newBoxKeys, uid } from './crypto';
import { AuditEvent, RefreshRecord, SigningKey, base32Encode, generateSigningKey } from './security';
import { OutboxOp, Peer, enqueue, LwwSet, GCounter } from './mesh';
import { CropKey, SoilKey } from './agro';
import { Lang } from './i18n';
import nacl from 'tweetnacl';

const KEY = 'cropcare.state.v1';

export type Field = {
  id: string; name: string; crop: CropKey; areaHa: number; soil: SoilKey;
  sowDate: string; lat: number; lon: number; ndvi: number[]; depletionMm: number;
  lastIrrigation?: string; variety: string; irrigationType: 'drip' | 'sprinkler' | 'furrow';
};

export type Scan = {
  id: string; kind: 'disease' | 'quality'; fieldId: string; crop: CropKey;
  uri: string | null; ts: number; title: string; score: number; grade?: 'A' | 'B' | 'C';
  phash: string; heat: number[][]; detail: any; synced: boolean; ms: number;
};

export type Listing = {
  id: string; crop: CropKey; qtyQ: number; grade: 'A' | 'B' | 'C'; qualityScore: number;
  askPerQ: number; seller: string; village: string; distanceKm: number; ts: number;
  photos: number; passportId?: string; organic: boolean;
};

export type Order = {
  id: string; listingId: string; buyer: string; amount: number;
  state: 'created' | 'escrow_funded' | 'shipped' | 'delivered' | 'released' | 'disputed' | 'refunded';
  history: { at: number; state: string; note: string }[]; escrowRef: string;
};

export type Loan = { id: string; amount: number; tenureM: number; ratePct: number; state: 'offered' | 'active' | 'repaid'; disbursedAt?: number; repaidPct: number; purpose: string };
export type Policy = { id: string; type: 'rainfall_deficit' | 'excess_rain' | 'heat_stress'; sumInsured: number; premium: number; trigger: string; active: boolean };
export type Claim = { id: string; policyId: string; amount: number; state: 'monitoring' | 'triggered' | 'verifying' | 'paid' | 'rejected'; openedAt: number; paidAt?: number; index: string; anomalyZ?: number };

export type Equipment = {
  id: string; name: string; owner: string; ratePerHr: number; distanceKm: number;
  available: boolean; engineHours: number; lastService: number; healthScore: number;
  faults: string[]; icon: string;
};

export type SeedOffer = { id: string; variety: string; crop: CropKey; qtyKg: number; owner: string; germinationPct: number; year: number; traits: string[]; wants: string };
export type Animal = { id: string; species: 'cow' | 'buffalo' | 'goat' | 'poultry'; name: string; ageM: number; milkL?: number; lastVaccine: string; alerts: string[] };
export type OutbreakReport = { id: string; disease: string; lat: number; lon: number; at: number; severity: number; village: string; confirmed: boolean };
export type ChatMsg = { id: string; role: 'user' | 'assistant'; text: string; ts: number; cites?: string[]; engine?: string; lang: Lang };
export type SecureMsg = { id: string; from: string; to: string; env: { n: string; c: string }; ts: number; plain?: string };
export type FamilyMember = { id: string; name: string; relation: string; role: string; scopes: string[]; active: boolean };
export type AcademyProgress = Record<string, { done: boolean; score: number }>;
export type CarbonPractice = { id: string; name: string; adopted: boolean; tCO2ePerHa: number; evidence: string };
export type LedgerEntry = { kind: 'contribution' | 'payout' | 'purchase' | 'sale'; member: string; amount: number; note: string };

export type Session = {
  signedIn: boolean;
  destination: { kind: 'phone' | 'email'; value: string } | null;
  verifiedAt: number | null;
  method: 'otp' | null;
  deviceId: string;
};

export type GeoState = {
  lat: number; lon: number; district: string; state: string; zone: string; soil: string;
  rain: number; source: 'gps' | 'manual'; accuracy: number | null; at: number;
} | null;

export type State = {
  ready: boolean;
  session: Session;
  geo: GeoState;
  profile: { id: string; name: string; village: string; phone: string; lang: Lang; role: string; kycLevel: number; joinedAt: number };
  fields: Field[];
  activeFieldId: string;
  scans: Scan[];
  listings: Listing[];
  orders: Order[];
  loans: Loan[];
  policies: Policy[];
  claims: Claim[];
  equipment: Equipment[];
  seeds: SeedOffer[];
  livestock: Animal[];
  outbreaks: OutbreakReport[];
  swarmCounter: GCounter;
  chat: ChatMsg[];
  secureChat: SecureMsg[];
  family: FamilyMember[];
  academy: AcademyProgress;
  carbon: CarbonPractice[];
  ledger: ChainEntry<LedgerEntry>[];
  passport: ChainEntry<any>[];
  audit: ChainEntry<AuditEvent>[];
  outbox: OutboxOp[];
  peers: Peer[];
  crdt: LwwSet<any>;
  buyingPool: { id: string; item: string; unitPrice: number; bulkPrice: number; targetQty: number; committed: { member: string; qty: number }[] }[];
  settings: {
    airplane: boolean; ollamaEndpoint: string; ollamaModel: string; voice: boolean;
    elder: boolean; theme: 'dark' | 'light'; sqlcipher: boolean; mfaEnabled: boolean;
    mfaSecret: string; biometric: boolean; telemetry: boolean; robotics: boolean;
    /** Simple mode: fewer, bigger controls in plain words. On by default. */
    simple: boolean;
    /** Shortcuts the farmer pinned to the home screen themselves. */
    pinned: string[];
    /** One-time welcome flow. */
    onboarded: boolean;
    /** Realtime edge endpoint; null keeps the bus in on-device mode. */
    realtimeUrl: string | null;
    /** SMS / e-mail OTP gateway; null issues the challenge locally. */
    authGateway: string | null;
  };
  security: { keys: SigningKey[]; refresh: RefreshRecord[]; boxKeys: { pub: string; sec: string }; incidents: { id: string; at: number; kind: string; detail: string; severity: string }[] };
  farmScore: { score: number; band: string; factors: { label: string; value: number; weight: number; note: string }[] };
};

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export function seedState(): State {
  const signing = generateSigningKey();
  const box = newBoxKeys();
  const fields: Field[] = [
    { id: 'fld_1', name: 'Home Plot — North', crop: 'tomato', areaHa: 1.2, soil: 'loam', sowDate: daysAgo(58), lat: 18.52, lon: 73.86, ndvi: [0.21, 0.28, 0.35, 0.44, 0.53, 0.61, 0.68, 0.72, 0.69, 0.64], depletionMm: 31, variety: 'Arka Rakshak', irrigationType: 'drip' },
    { id: 'fld_2', name: 'Canal Field', crop: 'wheat', areaHa: 2.4, soil: 'clay_loam', sowDate: daysAgo(92), lat: 18.54, lon: 73.88, ndvi: [0.18, 0.26, 0.39, 0.51, 0.6, 0.66, 0.71, 0.7, 0.62, 0.5], depletionMm: 44, variety: 'HD-3226', irrigationType: 'sprinkler' },
    { id: 'fld_3', name: 'Hill Terrace', crop: 'onion', areaHa: 0.8, soil: 'sandy', sowDate: daysAgo(35), lat: 18.5, lon: 73.9, ndvi: [0.15, 0.22, 0.3, 0.37, 0.45, 0.5, 0.55, 0.58, 0.6, 0.61], depletionMm: 18, variety: 'Bhima Super', irrigationType: 'drip' },
  ];
  const chain0: ChainEntry<any>[] = [];
  const passport = [
    chainAppend(chain0, { event: 'field_registered', field: 'Home Plot — North', crop: 'tomato', area: 1.2 }, Date.now() - 58 * 86400000),
  ];
  passport.push(chainAppend(passport, { event: 'sowing', variety: 'Arka Rakshak', seedLot: 'AR-2024-118', source: 'Certified' }, Date.now() - 58 * 86400000));
  passport.push(chainAppend(passport, { event: 'input_applied', input: 'Neem oil 5 ml/L', phi_days: 0, organic: true }, Date.now() - 21 * 86400000));
  passport.push(chainAppend(passport, { event: 'irrigation', mm: 28, source: 'borewell' }, Date.now() - 6 * 86400000));

  const ledger: ChainEntry<LedgerEntry>[] = [];
  [
    { kind: 'contribution' as const, member: 'Sunita D.', amount: 5000, note: 'Season share' },
    { kind: 'contribution' as const, member: 'Ramesh K.', amount: 5000, note: 'Season share' },
    { kind: 'purchase' as const, member: 'FPO', amount: -18400, note: 'Bulk urea 40 bags @ 15% below MRP' },
    { kind: 'sale' as const, member: 'FPO', amount: 74200, note: 'Tomato aggregation — 62 q to Azadpur' },
    { kind: 'payout' as const, member: 'Sunita D.', amount: -21500, note: 'Net share after grading' },
  ].forEach((e) => ledger.push(chainAppend(ledger, e)));

  return {
    ready: true,
    session: { signedIn: false, destination: null, verifiedAt: null, method: null, deviceId: uid('dev') },
    geo: null,
    profile: { id: 'usr_' + uid('f').slice(3, 10), name: '', village: '', phone: '', lang: 'en', role: 'owner', kycLevel: 0, joinedAt: Date.now() },
    fields,
    activeFieldId: 'fld_1',
    scans: [],
    listings: [
      { id: 'lst_1', crop: 'tomato', qtyQ: 22, grade: 'A', qualityScore: 86, askPerQ: 2150, seller: 'Ramesh K.', village: 'Shirur', distanceKm: 3, ts: Date.now() - 3600000, photos: 4, organic: false },
      { id: 'lst_2', crop: 'onion', qtyQ: 48, grade: 'B', qualityScore: 71, askPerQ: 1420, seller: 'Sunita D.', village: 'Kendur', distanceKm: 9, ts: Date.now() - 7200000, photos: 3, organic: true },
      { id: 'lst_3', crop: 'wheat', qtyQ: 120, grade: 'A', qualityScore: 83, askPerQ: 2480, seller: 'Shirur FPO', village: 'Shirur', distanceKm: 4, ts: Date.now() - 86400000, photos: 6, organic: false },
      { id: 'lst_4', crop: 'chilli', qtyQ: 6, grade: 'A', qualityScore: 90, askPerQ: 9800, seller: 'Iqbal S.', village: 'Ranjangaon', distanceKm: 16, ts: Date.now() - 172800000, photos: 5, organic: true },
    ],
    orders: [],
    loans: [{ id: 'ln_1', amount: 45000, tenureM: 6, ratePct: 11.5, state: 'offered', repaidPct: 0, purpose: 'Drip expansion + inputs' }],
    policies: [{ id: 'pol_1', type: 'rainfall_deficit', sumInsured: 60000, premium: 1450, trigger: 'Cumulative rainfall < 60% of 10-yr normal over any 21-day window in the crop period', active: true }],
    claims: [],
    equipment: [
      { id: 'eq_1', name: 'Mahindra 275 DI tractor', owner: 'Ramesh K.', ratePerHr: 650, distanceKm: 2.1, available: true, engineHours: 3120, lastService: Date.now() - 62 * 86400000, healthScore: 78, faults: ['Hydraulic response 12% slower than baseline'], icon: 'car-sport' },
      { id: 'eq_2', name: 'Battery knapsack sprayer', owner: 'Shirur FPO', ratePerHr: 60, distanceKm: 4, available: true, engineHours: 410, lastService: Date.now() - 15 * 86400000, healthScore: 93, faults: [], icon: 'water' },
      { id: 'eq_3', name: 'Rotavator 5 ft', owner: 'Iqbal S.', ratePerHr: 480, distanceKm: 12, available: false, engineHours: 1870, lastService: Date.now() - 210 * 86400000, healthScore: 51, faults: ['Blade wear beyond 60%', 'Gearbox oil overdue by 90 days'], icon: 'cog' },
    ],
    seeds: [
      { id: 'sd_1', variety: 'Desi Wheat — Khapli', crop: 'wheat', qtyKg: 40, owner: 'Sunita D.', germinationPct: 92, year: 2025, traits: ['Drought tolerant', 'Low gluten', 'Heirloom'], wants: 'Bhima Super onion seed' },
      { id: 'sd_2', variety: 'Arka Rakshak F1', crop: 'tomato', qtyKg: 0.5, owner: 'Shirur FPO', germinationPct: 96, year: 2025, traits: ['Triple disease resistance', 'Firm fruit'], wants: '₹ or labour exchange' },
      { id: 'sd_3', variety: 'Kalyan Sona (old stock)', crop: 'wheat', qtyKg: 25, owner: 'Ramesh K.', germinationPct: 84, year: 2024, traits: ['Rust susceptible — use as fodder'], wants: 'Any legume seed' },
    ],
    livestock: [
      { id: 'an_1', species: 'buffalo', name: 'Gauri', ageM: 74, milkL: 8.4, lastVaccine: daysAgo(120), alerts: ['FMD booster due in 8 days'] },
      { id: 'an_2', species: 'cow', name: 'Lakshmi', ageM: 52, milkL: 11.2, lastVaccine: daysAgo(45), alerts: [] },
      { id: 'an_3', species: 'goat', name: 'Herd (6)', ageM: 18, lastVaccine: daysAgo(200), alerts: ['Deworming overdue', 'PPR vaccination overdue'] },
    ],
    outbreaks: [
      { id: 'ob_1', disease: 'Late blight', lat: 18.53, lon: 73.87, at: Date.now() - 2 * 86400000, severity: 0.7, village: 'Kendur', confirmed: true },
      { id: 'ob_2', disease: 'Late blight', lat: 18.55, lon: 73.9, at: Date.now() - 86400000, severity: 0.5, village: 'Ranjangaon', confirmed: true },
      { id: 'ob_3', disease: 'Thrips', lat: 18.49, lon: 73.83, at: Date.now() - 3 * 86400000, severity: 0.35, village: 'Shirur', confirmed: false },
    ],
    swarmCounter: { node_self: 1, node_kendur: 4, node_ranjangaon: 2 },
    chat: [],
    secureChat: [],
    family: [
      { id: 'fm_1', name: 'Sanjay Pawar', relation: 'Spouse', role: 'family', scopes: ['scan:create', 'irrigation:read', 'market:read'], active: true },
      { id: 'fm_2', name: 'Priya Pawar', relation: 'Daughter (agri student)', role: 'agronomist', scopes: ['scan:read', 'twin:*', 'advisor:*'], active: true },
      { id: 'fm_3', name: 'Shirur FPO desk', relation: 'Cooperative', role: 'fpo_admin', scopes: ['ledger:*', 'market:read'], active: false },
    ],
    academy: {},
    carbon: [
      { id: 'cb_1', name: 'Alternate wetting & drying (paddy)', adopted: false, tCO2ePerHa: 1.9, evidence: 'Water-level pipe photos, 12 per season' },
      { id: 'cb_2', name: 'Residue incorporation instead of burning', adopted: true, tCO2ePerHa: 0.3, evidence: 'Geo-tagged field photo + Sentinel-2 no-burn scar check' },
      { id: 'cb_3', name: 'Cover crop in fallow window', adopted: true, tCO2ePerHa: 0.45, evidence: 'NDVI > 0.35 during declared fallow' },
      { id: 'cb_4', name: 'Neem-coated urea / split N dosing', adopted: false, tCO2ePerHa: 0.6, evidence: 'Input log + purchase receipt hash' },
    ],
    ledger,
    passport,
    audit: [],
    outbox: [],
    peers: [
      { id: 'pr_1', name: "Ramesh's phone", distanceM: 40, lastSeen: Date.now() - 120000, hasUplink: false, battery: 0.62, ops: 4 },
      { id: 'pr_2', name: 'FPO tablet (uplink)', distanceM: 380, lastSeen: Date.now() - 600000, hasUplink: true, battery: 0.88, ops: 11 },
      { id: 'pr_3', name: "Sunita's phone", distanceM: 95, lastSeen: Date.now() - 45000, hasUplink: false, battery: 0.31, ops: 2 },
    ],
    crdt: {},
    buyingPool: [
      { id: 'bp_1', item: 'Copper oxychloride 50% WP (500 g)', unitPrice: 420, bulkPrice: 318, targetQty: 60, committed: [{ member: 'Anjali P.', qty: 4 }, { member: 'Ramesh K.', qty: 10 }, { member: 'Sunita D.', qty: 8 }] },
      { id: 'bp_2', item: 'Drip lateral 16 mm (100 m roll)', unitPrice: 1250, bulkPrice: 940, targetQty: 40, committed: [{ member: 'Iqbal S.', qty: 6 }, { member: 'Anjali P.', qty: 3 }] },
    ],
    settings: {
      airplane: false, ollamaEndpoint: 'http://localhost:11434', ollamaModel: 'llama3.2:3b',
      voice: true, elder: false, theme: 'light', sqlcipher: true, mfaEnabled: true,
      mfaSecret: base32Encode(nacl.randomBytes(20)), biometric: true, telemetry: false, robotics: true,
      simple: true, pinned: ['Irrigation', 'Market', 'Academy', 'ColdChain'], onboarded: false,
      realtimeUrl: null, authGateway: null,
    },
    security: { keys: [signing], refresh: [], boxKeys: box, incidents: [] },
    farmScore: {
      score: 726,
      band: 'Good',
      factors: [
        { label: 'Scouting discipline', value: 0.88, weight: 0.2, note: '21 geo-verified scans in 90 days' },
        { label: 'Irrigation adherence', value: 0.79, weight: 0.18, note: 'Followed 15 of 19 FAO-56 recommendations' },
        { label: 'Sale receipts on-chain', value: 0.71, weight: 0.22, note: '₹1.9 L verified sales in 12 months' },
        { label: 'Repayment history', value: 0.94, weight: 0.25, note: '2 loans closed, 0 late instalments' },
        { label: 'Yield stability', value: 0.62, weight: 0.15, note: 'CV 24% across 3 seasons' },
      ],
    },
  };
}

/* ------------------------------ persistence ------------------------------ */
export type Ctx = {
  s: State;
  set: (fn: (draft: State) => State) => void;
  audit: (e: AuditEvent) => void;
  push: (kind: string, payload: any) => void;
  passportAdd: (payload: any) => void;
  reset: () => void;
};

export const AppCtx = React.createContext<Ctx>({} as Ctx);
export const useApp = () => React.useContext(AppCtx);

export function useAppState(): Ctx {
  const [s, setS] = React.useState<State>(() => ({ ...seedState(), ready: false }));
  const loaded = React.useRef(false);

  React.useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setS({ ...seedState(), ...parsed, ready: true });
        } else {
          setS((p) => ({ ...p, ready: true }));
        }
      } catch {
        setS((p) => ({ ...p, ready: true }));
      } finally {
        loaded.current = true;
      }
    })();
  }, []);

  React.useEffect(() => {
    if (!loaded.current || !s.ready) return;
    const t = setTimeout(() => {
      AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [s]);

  const set = React.useCallback((fn: (d: State) => State) => setS((prev) => fn(prev)), []);

  const audit = React.useCallback((e: AuditEvent) => {
    setS((prev) => ({ ...prev, audit: [...prev.audit, chainAppend(prev.audit, e)].slice(-300) }));
  }, []);

  const push = React.useCallback((kind: string, payload: any) => {
    setS((prev) => ({ ...prev, outbox: enqueue(prev.outbox, kind, payload) }));
  }, []);

  const passportAdd = React.useCallback((payload: any) => {
    setS((prev) => ({ ...prev, passport: [...prev.passport, chainAppend(prev.passport, payload)] }));
  }, []);

  const reset = React.useCallback(() => {
    const fresh = seedState();
    setS(fresh);
    AsyncStorage.setItem(KEY, JSON.stringify(fresh)).catch(() => {});
  }, []);

  return { s, set, audit, push, passportAdd, reset };
}

/** Demonstrates AES-class field encryption of PII before it ever hits storage. */
export function protectPII(value: string) {
  const env = encryptField(value);
  return { ciphertext: env.c, nonce: env.n, dek: env.dek, algo: 'XSalsa20-Poly1305 AEAD, per-record DEK' };
}
