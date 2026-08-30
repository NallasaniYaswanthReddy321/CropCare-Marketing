/**
 * Local LLM agronomist.
 *  • Primary: Ollama on the handset / village edge box (llama3.2, gemma2, qwen2.5)
 *    reached over the loopback allowlist. Streaming disabled for battery.
 *  • Fallback (default, always available): an on-device retrieval agronomist —
 *    TF-IDF + BM25 retrieval over a curated knowledge base, grounded with the
 *    farmer's live field state, with conversation memory.
 */
import { Lang } from './i18n';
import { ssrfCheck } from './security';

export type KbDoc = { id: string; topic: string; tags: string[]; text: string; source: string };

export const KB: KbDoc[] = [
  { id: 'kb_irrigation_1', topic: 'Irrigation scheduling', tags: ['water', 'irrigation', 'drip', 'schedule', 'et0', 'depletion'], source: 'FAO-56 ch. 8', text: 'Irrigate when root-zone depletion reaches readily available water (RAW = p x TAW). For drip, apply the net depletion depth divided by system efficiency (0.9 drip, 0.75 sprinkler, 0.6 furrow). Splitting a large dose into two shorter runs on sandy soil prevents deep percolation losses below the root zone.' },
  { id: 'kb_blight_1', topic: 'Late blight management', tags: ['late blight', 'phytophthora', 'tomato', 'potato', 'fungus', 'spray'], source: 'ICAR advisory', text: 'Late blight explodes when leaf wetness exceeds 8 hours at 12-20 C. Protective copper before infection is far cheaper than curative systemics after. Remove and bury infected haulm; never compost it. Rotate cymoxanil+mancozeb with dimethomorph to avoid resistance. Stop irrigation in the evening.' },
  { id: 'kb_nutrient_1', topic: 'Nitrogen management', tags: ['nitrogen', 'urea', 'yellow', 'chlorosis', 'fertiliser', 'dose'], source: 'Soil Health Card guidance', text: 'Yellowing that starts on older, lower leaves indicates mobile-nutrient (N) deficiency. Split N: 40% basal, 30% at active vegetative, 30% at flowering. Foliar 2% urea gives visible response in 4-6 days. Over-application past 120 kg N/ha usually lowers net margin and raises pest pressure.' },
  { id: 'kb_market_1', topic: 'Selling decisions', tags: ['price', 'mandi', 'sell', 'hold', 'transport', 'net'], source: 'AgriPrice engine notes', text: 'Compare mandis on NET value: price x quantity minus transport, commission and transit loss. A mandi paying 8% more but 140 km away often nets less than the local market for perishables. Payment lag matters: 14-day payment at a pack-house is a real cost if you borrow at 18% annually.' },
  { id: 'kb_grading_1', topic: 'Grading and sorting', tags: ['grade', 'quality', 'sorting', 'premium', 'defect'], source: 'AgriPrice engine notes', text: 'Sorting out the visibly damaged 5-10% before sale usually raises the lot price by 6-11% because buyers price to the worst visible unit. Uniform size within a crate matters as much as colour. Grade A lots should be packed separately, never mixed to raise average weight.' },
  { id: 'kb_soil_1', topic: 'Soil health', tags: ['soil', 'organic carbon', 'compost', 'ph', 'salinity'], source: 'Regenerative practice guide', text: 'Target 0.75% soil organic carbon. Each 0.1% increase holds roughly 1.5 mm extra plant-available water per 10 cm depth. Green manure (dhaincha, sunn hemp) before a main crop adds 60-80 kg N/ha. Gypsum corrects sodicity; it does not correct simple alkaline pH.' },
  { id: 'kb_ipm_1', topic: 'Integrated pest management', tags: ['pest', 'ipm', 'trap', 'spray', 'resistance', 'bollworm'], source: 'IPM handbook', text: 'Use pheromone traps at 8/ha as an early warning; spray only when the economic threshold is crossed (e.g. 5-8% fruit damage). Rotate insecticide modes of action (IRAC groups) every generation. Never tank-mix two products from the same IRAC group - it accelerates resistance.' },
  { id: 'kb_frost_1', topic: 'Frost and heat protection', tags: ['frost', 'cold', 'heat', 'weather', 'protect'], source: 'Agromet advisory', text: 'On radiation frost nights, irrigate the evening before: wet soil stores 4x more heat than dry soil. Light smoke or sprinklers running through dawn keep the canopy at 0 C via latent heat of fusion. In heat waves, shift irrigation to night and avoid spraying above 34 C.' },
  { id: 'kb_storage_1', topic: 'Post-harvest storage', tags: ['storage', 'cold chain', 'shelf life', 'ethylene', 'ripening'], source: 'Post-harvest handbook', text: 'Every hour of field heat left in produce costs shelf life. Pre-cool within 2 hours of harvest. Never store ethylene producers (banana, tomato) with ethylene-sensitive crops (leafy greens). Onion needs 65-70% RH, potato 90-95% - the same store cannot serve both.' },
  { id: 'kb_credit_1', topic: 'Credit and insurance', tags: ['loan', 'credit', 'insurance', 'claim', 'kcc', 'interest'], source: 'FarmScore documentation', text: 'FarmScore turns verifiable farm behaviour - timely scouting, irrigation discipline, sale receipts, repayment - into collateral-free credit limits. Parametric insurance pays on a measured index (rainfall, temperature) rather than a loss adjuster visit, so claims settle in about 72 hours.' },
  { id: 'kb_livestock_1', topic: 'Livestock', tags: ['cattle', 'buffalo', 'milk', 'fodder', 'mastitis', 'goat'], source: 'Veterinary extension', text: 'A 450 kg crossbred cow yielding 12 L needs about 6 kg dry matter maintenance plus 0.4 kg concentrate per litre. Test for sub-clinical mastitis monthly with the California Mastitis Test; it silently cuts yield by 10-20% before any visible clots appear.' },
  { id: 'kb_carbon_1', topic: 'Carbon and sustainability', tags: ['carbon', 'credit', 'emission', 'awd', 'residue'], source: 'MRV protocol', text: 'Alternate wetting and drying in paddy cuts methane 30-48% and water use 25% with no yield penalty when the field is re-flooded before the water table drops below 15 cm. Residue incorporation instead of burning adds roughly 0.3 t CO2e/ha/yr of soil carbon.' },
  { id: 'kb_pollinator_1', topic: 'Pollinators', tags: ['bee', 'pollinator', 'flower', 'spray timing', 'yield'], source: 'Pollination services study', text: 'Insect pollination lifts fruit set 18-35% in cucurbits, mustard and mango. Never spray insecticide during bloom or between 08:00-16:00 when bees forage. A 2 m flowering border strip (coriander, marigold, sunflower) supports pollinators and predatory hoverflies.' },
  { id: 'kb_variety_1', topic: 'Variety selection', tags: ['variety', 'seed', 'hybrid', 'duration', 'resistance'], source: 'Seed selection guide', text: 'Match variety duration to your assured water window, not to the highest advertised yield. A 120-day hybrid that runs out of water at grain fill nets less than a 95-day variety that finishes. Check the resistance package against the two diseases that actually recur in your village.' },
];

/* ------------------------------ BM25 retrieval ---------------------------- */
const tokenize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0900-\u0d7f ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);

export function retrieve(query: string, k = 3): { doc: KbDoc; score: number }[] {
  const q = tokenize(query);
  const docsTokens = KB.map((d) => tokenize(`${d.topic} ${d.tags.join(' ')} ${d.text}`));
  const avgLen = docsTokens.reduce((s, t) => s + t.length, 0) / docsTokens.length;
  const df = (term: string) => docsTokens.filter((t) => t.includes(term)).length;
  const scored = KB.map((doc, i) => {
    const tokens = docsTokens[i];
    let score = 0;
    for (const term of q) {
      const tf = tokens.filter((t) => t === term || t.startsWith(term.slice(0, 5))).length;
      if (!tf) continue;
      const idf = Math.log(1 + (KB.length - df(term) + 0.5) / (df(term) + 0.5));
      score += idf * ((tf * 2.5) / (tf + 1.2 * (0.25 + 0.75 * (tokens.length / avgLen))));
    }
    const tagBoost = doc.tags.filter((t) => query.toLowerCase().includes(t)).length * 1.4;
    return { doc, score: score + tagBoost };
  });
  return scored.sort((a, b) => b.score - a.score).filter((s) => s.score > 0.2).slice(0, k);
}

/* ------------------------------ farm grounding ---------------------------- */
export type FarmContext = {
  farmName: string; crop: string; areaHa: number; das: number; stage: string;
  depletionPct: number; irrigateNow: boolean; lastScan?: string; lastGrade?: string;
  bestMandi?: string; bestNet?: number; weather: string; lang: Lang; memory: string[];
};

export function localAgronomist(question: string, ctx: FarmContext): { answer: string; cites: string[]; used: 'offline-rag' } {
  const hits = retrieve(question, 3);
  const lower = question.toLowerCase();
  const lines: string[] = [];

  // 1) Direct, field-specific answer from live state.
  if (/water|irrig|\u092a\u093e\u0928\u0940|\u0938\u093f\u0902\u091a/.test(lower)) {
    lines.push(ctx.irrigateNow
      ? `Your ${ctx.crop} is at ${ctx.depletionPct}% root-zone depletion — irrigate today. Waiting another day at this stage (${ctx.stage}) costs yield you cannot recover.`
      : `Hold irrigation. ${ctx.crop} sits at ${ctx.depletionPct}% depletion, still inside the buffer. Re-check tomorrow evening.`);
  } else if (/price|sell|mandi|market|\u092c\u0947\u091a|\u092e\u0902\u0921\u0940/.test(lower)) {
    lines.push(ctx.bestMandi
      ? `On net value (after transport, commission and transit loss) ${ctx.bestMandi} is your best outlet right now at about ₹${(ctx.bestNet ?? 0).toLocaleString('en-IN')} for the lot. That is an AI estimate from a price range, not a guaranteed price.`
      : 'Grade a photo of the produce first — I need a quality score before I can rank mandis by net value.');
  } else if (/disease|spot|blight|fungus|\u0930\u094b\u0917|\u092c\u093f\u092e\u093e\u0930/.test(lower)) {
    lines.push(ctx.lastScan
      ? `Your last scan flagged ${ctx.lastScan}. With ${ctx.weather}, infection pressure is the deciding factor — protect before the next wet window, not after symptoms spread.`
      : 'Take a leaf photo in open shade, filling about half the frame. I run the detector on the phone — nothing is uploaded.');
  } else if (/yield|harvest|when|\u0915\u092c|\u0915\u091f\u093e\u0908/.test(lower)) {
    lines.push(`${ctx.crop} is ${ctx.das} days after sowing and in the ${ctx.stage} stage. The digital twin projects maturity from accumulated thermal time — open the Twin tab and drag the temperature slider to see how a warm spell shifts your harvest date.`);
  }

  // 2) Knowledge-base grounding.
  hits.forEach((h) => lines.push(h.doc.text));

  // 3) Memory continuity.
  if (ctx.memory.length) lines.push(`Earlier you told me: ${ctx.memory.slice(-2).join('; ')}. I have kept that in mind.`);
  if (!lines.length) lines.push(`I can help with irrigation, disease, nutrition, storage, pricing and credit for your ${ctx.areaHa} ha of ${ctx.crop}. Ask me in any of the 9 supported languages — or hold the mic button and speak.`);

  return { answer: lines.join('\n\n'), cites: hits.map((h) => `${h.doc.topic} — ${h.doc.source}`), used: 'offline-rag' };
}

/* -------------------------------- Ollama --------------------------------- */
export async function askOllama(endpoint: string, model: string, prompt: string, system: string, timeoutMs = 12000) {
  const check = ssrfCheck(endpoint);
  if (!check.allow) throw new Error(`egress blocked: ${check.reason}`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, system, stream: false, options: { temperature: 0.3, num_ctx: 4096 } }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`ollama ${res.status}`);
    const json = await res.json();
    return String(json.response ?? '').trim();
  } finally {
    clearTimeout(timer);
  }
}

export const SYSTEM_PROMPT = `You are CropCare's agronomist. You advise smallholder farmers.
Rules:
1. Never invent laboratory values (moisture, brix, residue) from a photograph.
2. Price answers are ESTIMATED RANGES, never guarantees.
3. Prefer the cheapest effective intervention and always give an organic option first.
4. Answer in the farmer's language, in short sentences, with numbers they can act on.
5. Ground every recommendation in the field state provided in the context block.`;
