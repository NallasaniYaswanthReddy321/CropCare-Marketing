/**
 * Crop knowledge base — the agronomic detail behind every recommendation.
 * Values are drawn from FAO-56 (Kc, rooting depth, depletion fraction, yield
 * response factor Ky), ICAR package-of-practice guidance for Indian conditions,
 * and standard post-harvest handling tables.
 */
import { CROPS, CropKey } from './agro';

export type Nutrient = { n: number; p: number; k: number };

export type CropInfo = {
  key: CropKey;
  family: string;
  season: string[];
  sowing: string;
  spacing: string;
  seedRate: string;
  /** kg/ha of N, P2O5, K2O */
  nutrients: Nutrient;
  nutrientSplit: string;
  /** Yield response factor to water (FAO-33 Ky) */
  ky: number;
  /** total seasonal water requirement, mm */
  waterMm: [number, number];
  criticalStages: { stage: string; why: string }[];
  pests: { name: string; sign: string; act: string }[];
  diseases: { name: string; sign: string; act: string }[];
  harvest: string;
  yieldTHa: [number, number];
  storage: string;
  rotation: string;
  mistakes: string[];
};

export const CROP_INFO: Record<CropKey, CropInfo> = {
  tomato: {
    key: 'tomato', family: 'Solanaceae (nightshade)', season: ['Kharif', 'Rabi', 'Summer'],
    sowing: 'Raise a nursery for 25–30 days, then transplant seedlings with 4–5 true leaves.',
    spacing: '60 cm between rows × 45 cm between plants (≈ 37 000 plants/ha)',
    seedRate: '250–400 g/ha for hybrids, 500 g/ha for open-pollinated',
    nutrients: { n: 120, p: 60, k: 60 }, nutrientSplit: '50% N basal, 25% at flowering, 25% at first fruit set',
    ky: 1.05, waterMm: [400, 600],
    criticalStages: [
      { stage: 'Transplanting', why: 'Roots must not dry out in the first week or the stand is lost.' },
      { stage: 'Flowering', why: 'Water stress now drops flowers and directly cuts the number of fruit.' },
      { stage: 'Fruit development', why: 'Uneven watering here causes cracking and blossom-end rot.' },
    ],
    pests: [
      { name: 'Fruit borer (Helicoverpa)', sign: 'Round holes in fruit, larva inside', act: 'Pheromone traps 8/ha; spray only past 5% damage' },
      { name: 'Whitefly', sign: 'Tiny white flies under leaves, sticky leaves', act: 'Yellow sticky traps; rotate IRAC groups — it spreads leaf curl virus' },
    ],
    diseases: [
      { name: 'Late blight', sign: 'Water-soaked dark patches, white mould underneath in damp weather', act: 'Copper before infection; remove and bury infected foliage' },
      { name: 'Bacterial wilt', sign: 'Sudden wilt with the plant still green; cut stem oozes white in water', act: 'No cure — rotate away from solanaceae for 3 years' },
    ],
    harvest: 'Pick at breaker or pink stage for distant markets, red-ripe only for local sale. Harvest every 2–3 days.',
    yieldTHa: [25, 60],
    storage: '10–13 °C at 85–95% RH. Never below 10 °C — the flavour never comes back.',
    rotation: 'Follow with a cereal or legume. Never tomato → potato → chilli in sequence.',
    mistakes: ['Overhead irrigation in the evening — leaves stay wet all night and blight follows.',
               'Picking fully red for a 5-hour journey — it arrives as pulp.'],
  },
  wheat: {
    key: 'wheat', family: 'Poaceae (grass)', season: ['Rabi'],
    sowing: 'Sow 1 Nov – 25 Nov for the full-season yield. Every week later costs roughly 1% of yield.',
    spacing: '20–22.5 cm between rows, seed 5 cm deep',
    seedRate: '100 kg/ha timely sown, 125 kg/ha late sown',
    nutrients: { n: 120, p: 60, k: 40 }, nutrientSplit: '50% N basal, 25% at first irrigation, 25% at second',
    ky: 1.15, waterMm: [350, 500],
    criticalStages: [
      { stage: 'Crown root initiation (21 days)', why: 'The single most important irrigation of the whole season.' },
      { stage: 'Booting and heading', why: 'Stress here reduces the number of grains per ear.' },
      { stage: 'Grain filling', why: 'Water and heat here decide grain weight.' },
    ],
    pests: [
      { name: 'Aphid', sign: 'Sticky ears, black sooty mould, ants climbing', act: 'Usually controlled by ladybirds; spray only past 10 aphids per ear' },
      { name: 'Termite', sign: 'Plants dry from the base and pull out easily', act: 'Treat seed; never apply raw farmyard manure just before sowing' },
    ],
    diseases: [
      { name: 'Yellow rust', sign: 'Yellow powder stripes along the leaf veins', act: 'Propiconazole at first pustule; scout the upwind edge weekly' },
      { name: 'Karnal bunt', sign: 'Black powder inside grain with a fishy smell', act: 'Certified seed; avoid heavy irrigation at flowering' },
    ],
    harvest: 'Cut when grain is hard and moisture is 14% — the ear snaps rather than bends.',
    yieldTHa: [4, 6.5],
    storage: 'Dry to 10–12% moisture before bagging. Above 14% the whole bag heats up and moulds.',
    rotation: 'Wheat → legume (moong) → rice keeps take-all and soil-borne rots down.',
    mistakes: ['Missing the crown-root irrigation at day 21 — it cannot be made up later.',
               'Sowing too deep — emergence is patchy and thin.'],
  },
  rice: {
    key: 'rice', family: 'Poaceae (grass)', season: ['Kharif', 'Rabi (irrigated)'],
    sowing: 'Transplant 21–25 day-old seedlings, 2–3 per hill. Direct seeding saves water and labour.',
    spacing: '20 × 15 cm (≈ 33 hills/m²)',
    seedRate: '20–25 kg/ha transplanted, 60 kg/ha direct seeded',
    nutrients: { n: 120, p: 60, k: 40 }, nutrientSplit: '50% N basal, 25% at tillering, 25% at panicle initiation',
    ky: 1.1, waterMm: [900, 1400],
    criticalStages: [
      { stage: 'Tillering', why: 'Decides how many productive stems the plant makes.' },
      { stage: 'Panicle initiation', why: 'Stress here reduces the number of grains per panicle.' },
      { stage: 'Flowering', why: 'The most sensitive stage of all — even short stress causes empty grain.' },
    ],
    pests: [
      { name: 'Stem borer', sign: 'Dead heart in young plants, white ear later', act: 'Trichogramma cards; clip seedling tips before transplanting' },
      { name: 'Brown planthopper', sign: 'Circular patches of dried "hopper burn"', act: 'Drain the field for 3 days; avoid excess nitrogen' },
    ],
    diseases: [
      { name: 'Blast', sign: 'Spindle-shaped spots with grey centres', act: 'Avoid excess N; tricyclazole at first sign in a wet spell' },
      { name: 'Bacterial leaf blight', sign: 'Yellow wavy margins drying from the leaf tip', act: 'Drain the field; never apply nitrogen while it is spreading' },
    ],
    harvest: 'Harvest when 80% of grains are straw-coloured and the top grains are hard.',
    yieldTHa: [4, 7],
    storage: 'Dry to 12–14% before milling. Sun-dry on a mat, not on bare tar.',
    rotation: 'Rice → pulse → rice restores nitrogen and breaks the nematode cycle.',
    mistakes: ['Keeping the field flooded all season — wastes water and produces methane for no extra yield.',
               'Transplanting seedlings older than 30 days — tillering never recovers.'],
  },
  onion: {
    key: 'onion', family: 'Amaryllidaceae', season: ['Kharif', 'Late Kharif', 'Rabi'],
    sowing: 'Nursery for 6–7 weeks, then transplant. Rabi crop stores best.',
    spacing: '15 × 10 cm on raised beds',
    seedRate: '8–10 kg/ha',
    nutrients: { n: 100, p: 50, k: 50 }, nutrientSplit: '50% N basal, 25% at 30 days, 25% at 45 days. Stop N after bulbing starts.',
    ky: 1.1, waterMm: [350, 550],
    criticalStages: [
      { stage: 'Transplanting to establishment', why: 'Shallow roots dry out fast in the first two weeks.' },
      { stage: 'Bulb development', why: 'Uneven water here splits bulbs and ruins storage life.' },
    ],
    pests: [
      { name: 'Thrips', sign: 'Silvery streaks and twisted leaf tips', act: 'Blue sticky traps; spray at 30 thrips per plant, rotate modes of action' },
    ],
    diseases: [
      { name: 'Purple blotch', sign: 'Purple centres in oval spots on leaves', act: 'Mancozeb with a sticker; wide spacing for airflow' },
      { name: 'Basal rot', sign: 'Bulb rots from the base, roots go pink', act: 'Rotate 3 years; never plant into waterlogged beds' },
    ],
    harvest: 'Stop irrigation when 50% of tops fall. Lift, cure in shade for 10–15 days before bagging.',
    yieldTHa: [20, 35],
    storage: 'Cool and DRY — 0–4 °C at 65–70% RH. High humidity is what rots stored onion, not heat alone.',
    rotation: 'Onion → cereal → legume. Avoid onion after onion or garlic.',
    mistakes: ['Irrigating right up to harvest — the bulbs will not keep for even a month.',
               'Bagging without curing — the neck stays wet and the whole bag rots.'],
  },
  potato: {
    key: 'potato', family: 'Solanaceae', season: ['Rabi'],
    sowing: 'Plant well-sprouted seed tubers 5–6 cm deep when soil is below 30 °C.',
    spacing: '60 × 20 cm, earth up twice',
    seedRate: '2 500–3 000 kg/ha of seed tubers',
    nutrients: { n: 150, p: 80, k: 100 }, nutrientSplit: '50% N basal, 50% at earthing up',
    ky: 1.1, waterMm: [400, 600],
    criticalStages: [
      { stage: 'Stolon formation', why: 'Sets the number of tubers you will lift.' },
      { stage: 'Tuber bulking', why: 'Irregular water here causes hollow heart and second growth.' },
    ],
    pests: [
      { name: 'Potato tuber moth', sign: 'Tunnels in exposed tubers', act: 'Earth up properly so no tuber sees light; never leave harvested tubers in the field overnight' },
    ],
    diseases: [
      { name: 'Late blight', sign: 'Dark water-soaked patches spreading in cool damp weather', act: 'Protective spray before the first cold foggy spell — not after' },
    ],
    harvest: 'Dehaulm 10–15 days before lifting so the skin sets. Lift on a dry day.',
    yieldTHa: [20, 35],
    storage: '4–8 °C at 90–95% RH in the dark. Light turns tubers green and bitter.',
    rotation: 'Never potato after tomato, chilli or brinjal — they share every soil disease.',
    mistakes: ['Lifting immediately after dehaulming — the skin scuffs and rot follows in storage.'],
  },
  cotton: {
    key: 'cotton', family: 'Malvaceae', season: ['Kharif'],
    sowing: 'Sow with the onset of monsoon or under assured irrigation. Keep a refuge row.',
    spacing: '90 × 60 cm rainfed, 120 × 45 cm irrigated',
    seedRate: '1.5–2.5 kg/ha for Bt hybrids',
    nutrients: { n: 150, p: 75, k: 75 }, nutrientSplit: '25% basal, then split at squaring, flowering and boll development',
    ky: 0.85, waterMm: [700, 1000],
    criticalStages: [
      { stage: 'Squaring', why: 'Stress drops squares before they ever become bolls.' },
      { stage: 'Flowering and boll development', why: 'The heaviest water demand and the biggest yield lever.' },
    ],
    pests: [
      { name: 'Pink bollworm', sign: 'Rosetted flowers, damaged lint inside green bolls', act: 'Pheromone traps from squaring; destroy stubble after harvest — this breaks the cycle' },
      { name: 'Whitefly', sign: 'Sticky honeydew and sooty mould on leaves', act: 'Avoid excess nitrogen; rotate IRAC groups strictly' },
    ],
    diseases: [
      { name: 'Bacterial blight', sign: 'Angular water-soaked spots bounded by veins', act: 'Acid-delinted certified seed; copper spray' },
    ],
    harvest: 'Pick in 3–4 rounds when bolls are fully open and dry. Pick in the morning after dew lifts.',
    yieldTHa: [1.5, 3],
    storage: 'Keep lint dry; store away from oil and rodents. Moisture stains lint and cuts the price.',
    rotation: 'Cotton → pulse or cereal. Continuous cotton builds up wilt and nematodes.',
    mistakes: ['Leaving stubble standing after harvest — it carries pink bollworm to next season.'],
  },
  chilli: {
    key: 'chilli', family: 'Solanaceae', season: ['Kharif', 'Rabi'],
    sowing: 'Nursery 35–40 days, then transplant healthy stocky seedlings.',
    spacing: '60 × 45 cm',
    seedRate: '1–1.5 kg/ha',
    nutrients: { n: 100, p: 50, k: 50 }, nutrientSplit: '50% basal, 25% at flowering, 25% after first picking',
    ky: 1.1, waterMm: [500, 700],
    criticalStages: [
      { stage: 'Flowering', why: 'Stress causes heavy flower drop and a thin first picking.' },
      { stage: 'Fruit development', why: 'Water swings cause fruit drop and poor colour.' },
    ],
    pests: [
      { name: 'Thrips', sign: 'Leaves curl upward like a boat', act: 'Blue traps; avoid repeated use of the same insecticide group' },
      { name: 'Mites', sign: 'Leaves curl downward and go leathery', act: 'A miticide, not an insecticide — they are different chemistry' },
    ],
    diseases: [
      { name: 'Anthracnose (die-back)', sign: 'Sunken dark spots on ripe fruit; twigs die from the tip', act: 'Remove infected fruit from the field; do not dry them with the good crop' },
    ],
    harvest: 'Green chilli every 8–10 days; for dry chilli let fruit ripen fully then sun-dry on a clean mat.',
    yieldTHa: [1.5, 3],
    storage: 'Dry chilli to 10% moisture; 7–10 °C at 90–95% RH for green chilli.',
    rotation: 'Never after tomato, potato or brinjal.',
    mistakes: ['Drying chilli on bare ground — grit and aflatoxin both cut the price sharply.'],
  },
  maize: {
    key: 'maize', family: 'Poaceae (grass)', season: ['Kharif', 'Rabi', 'Spring'],
    sowing: 'Sow on ridges in kharif so water drains away from the stem.',
    spacing: '60 × 20 cm (≈ 83 000 plants/ha)',
    seedRate: '20 kg/ha',
    nutrients: { n: 150, p: 75, k: 60 }, nutrientSplit: '30% basal, 40% at knee height, 30% at tasselling',
    ky: 1.25, waterMm: [500, 700],
    criticalStages: [
      { stage: 'Tasselling and silking', why: 'The most water-sensitive week of any cereal — stress here can halve the yield.' },
      { stage: 'Grain filling', why: 'Decides grain weight and final tonnage.' },
    ],
    pests: [
      { name: 'Fall armyworm', sign: 'Ragged holes and wet sawdust-like frass in the whorl', act: 'Scout twice weekly; apply into the whorl at 5% damage, rotate modes of action' },
    ],
    diseases: [
      { name: 'Turcicum leaf blight', sign: 'Long cigar-shaped grey-green lesions', act: 'Resistant hybrids; mancozeb if it appears before tasselling' },
    ],
    harvest: 'Harvest when the black layer forms at the kernel base and husks are dry.',
    yieldTHa: [5, 9],
    storage: 'Dry to 13% before shelling. Above 15% aflatoxin develops within weeks.',
    rotation: 'Maize → legume restores nitrogen and breaks armyworm carry-over.',
    mistakes: ['Missing water at silking to save a single irrigation — it is the costliest saving in farming.'],
  },
  banana: {
    key: 'banana', family: 'Musaceae', season: ['Year-round with irrigation'],
    sowing: 'Plant tissue-culture plants or healthy sword suckers in pits of 45 × 45 × 45 cm.',
    spacing: '1.8 × 1.8 m (≈ 3 000 plants/ha)',
    seedRate: '3 000 suckers or plantlets/ha',
    nutrients: { n: 200, p: 60, k: 300 }, nutrientSplit: 'Split into 6–8 doses; potassium is the yield driver in banana',
    ky: 1.2, waterMm: [1200, 2200],
    criticalStages: [
      { stage: 'Shooting (bunch emergence)', why: 'Stress here reduces hands per bunch permanently.' },
      { stage: 'Bunch filling', why: 'Water and potassium here decide finger size and grade.' },
    ],
    pests: [
      { name: 'Pseudostem weevil', sign: 'Oozing holes in the pseudostem, plant topples', act: 'Remove old sheaths; trap with split pseudostem pieces' },
    ],
    diseases: [
      { name: 'Panama wilt (Fusarium)', sign: 'Yellowing from older leaves, split pseudostem base', act: 'No cure — use resistant varieties and never move soil from an infected block' },
    ],
    harvest: 'Harvest at 75–80% maturity when fingers are still angular for distant markets.',
    yieldTHa: [40, 70],
    storage: '13–15 °C at 85–95% RH. Below 13 °C the peel blackens and never ripens properly.',
    rotation: 'Replant after a fallow with a non-host crop if Panama wilt has appeared.',
    mistakes: ['Storing banana with leafy vegetables — its ethylene yellows them within a day.'],
  },
  grape: {
    key: 'grape', family: 'Vitaceae', season: ['Perennial, pruned twice a year'],
    sowing: 'Plant rooted cuttings or grafts on a trellis; the pruning calendar decides everything.',
    spacing: '3 × 1.8 m on a Y trellis or bower',
    seedRate: '1 850 vines/ha',
    nutrients: { n: 100, p: 60, k: 150 }, nutrientSplit: 'Split by growth phase; potassium heavy before veraison',
    ky: 0.85, waterMm: [500, 800],
    criticalStages: [
      { stage: 'Flowering', why: 'Rain or stress here causes poor berry set.' },
      { stage: 'Berry development to veraison', why: 'Water swings split berries and drop the grade.' },
    ],
    pests: [
      { name: 'Thrips', sign: 'Scarring and corky patches on berries', act: 'Spray at bloom only; avoid it once berries are colouring' },
    ],
    diseases: [
      { name: 'Downy mildew', sign: 'Oily patches on top of leaves, white growth underneath', act: 'Protective spray before rain — curative sprays rarely save the bunch' },
      { name: 'Powdery mildew', sign: 'White powder on leaves and berries', act: 'Sulphur below 32 °C, improve canopy airflow' },
    ],
    harvest: 'Harvest by taste and total soluble solids (16–18 °Brix for table grapes), not by calendar.',
    yieldTHa: [20, 30],
    storage: '−1 to 0 °C at 90–95% RH with SO₂ pads for long storage.',
    rotation: 'Perennial — manage soil health with cover crops between rows.',
    mistakes: ['Irrigating heavily just before harvest — berries split and the whole bunch is downgraded.'],
  },
};

/** Live water requirement summary for a crop at a given day after sowing. */
export function waterNeedNow(crop: CropKey, das: number, etcMmDay: number, areaHa: number) {
  const info = CROP_INFO[crop];
  const spec = CROPS[crop];
  const season = spec.stages.ini + spec.stages.dev + spec.stages.mid + spec.stages.late;
  const remaining = Math.max(0, season - das);
  const litresPerDay = etcMmDay * 10000 * areaHa;
  const seasonMid = (info.waterMm[0] + info.waterMm[1]) / 2;
  return {
    perDayMm: etcMmDay,
    perDayLitres: Math.round(litresPerDay),
    seasonRange: info.waterMm,
    seasonTotalLitres: Math.round(seasonMid * 10000 * areaHa),
    remainingDays: remaining,
    remainingMm: Math.round(etcMmDay * remaining),
    ky: info.ky,
    /** FAO-33: relative yield loss for a given relative water deficit. */
    lossIfShort: (deficitPct: number) => Math.min(100, Math.round(info.ky * deficitPct)),
  };
}
