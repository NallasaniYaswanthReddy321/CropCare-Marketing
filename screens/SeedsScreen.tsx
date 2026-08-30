import React from 'react';
import { ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Bar, Btn, Card, Chip, Divider, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, Slider, T } from '../components/ui';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { CROPS, CropKey } from '../lib/agro';
import { activeField } from '../lib/derive';
import { uid } from '../lib/crypto';

type Variety = {
  name: string; crop: CropKey; durationD: number; waterNeed: number; heatTol: number;
  diseasePkg: string[]; yieldPot: number; marketPref: number; seedCostPerHa: number; note: string;
};

const VARIETIES: Variety[] = [
  { name: 'Arka Rakshak (F1)', crop: 'tomato', durationD: 145, waterNeed: 0.8, heatTol: 0.6, diseasePkg: ['Late blight', 'Bacterial wilt', 'ToLCV'], yieldPot: 0.95, marketPref: 0.8, seedCostPerHa: 9500, note: 'Triple resistance, firm fruit, travels well to distant mandis.' },
  { name: 'Arka Samrat (F1)', crop: 'tomato', durationD: 140, waterNeed: 0.78, heatTol: 0.65, diseasePkg: ['Late blight', 'Bacterial wilt'], yieldPot: 0.9, marketPref: 0.75, seedCostPerHa: 8800, note: 'High yield with good fruit set under mild heat.' },
  { name: 'Pusa Ruby (OP)', crop: 'tomato', durationD: 120, waterNeed: 0.62, heatTol: 0.5, diseasePkg: [], yieldPot: 0.62, marketPref: 0.55, seedCostPerHa: 1600, note: 'Open-pollinated — save your own seed, low input cost.' },
  { name: 'HD-3226 (Pusa Yashasvi)', crop: 'wheat', durationD: 145, waterNeed: 0.72, heatTol: 0.55, diseasePkg: ['Yellow rust', 'Brown rust', 'Karnal bunt'], yieldPot: 0.93, marketPref: 0.85, seedCostPerHa: 3200, note: 'High protein, strong rust package for irrigated timely sowing.' },
  { name: 'HD-3298', crop: 'wheat', durationD: 125, waterNeed: 0.55, heatTol: 0.85, diseasePkg: ['Yellow rust'], yieldPot: 0.78, marketPref: 0.7, seedCostPerHa: 3000, note: 'Late-sown and terminal-heat tolerant; finishes before the March heat.' },
  { name: 'Khapli (emmer, heirloom)', crop: 'wheat', durationD: 135, waterNeed: 0.45, heatTol: 0.8, diseasePkg: ['Rust (field tolerance)'], yieldPot: 0.55, marketPref: 0.95, seedCostPerHa: 2600, note: 'Low-gluten niche market at a 60–90% price premium.' },
  { name: 'Bhima Super', crop: 'onion', durationD: 120, waterNeed: 0.65, heatTol: 0.7, diseasePkg: ['Purple blotch (tolerant)'], yieldPot: 0.88, marketPref: 0.82, seedCostPerHa: 5200, note: 'Good keeping quality — holds 4–5 months in a ventilated store.' },
  { name: 'Bhima Kiran', crop: 'onion', durationD: 130, waterNeed: 0.7, heatTol: 0.75, diseasePkg: ['Purple blotch', 'Thrips (partial)'], yieldPot: 0.82, marketPref: 0.9, seedCostPerHa: 5600, note: 'Best storage life of the Bhima series; ideal for hold-and-sell.' },
  { name: 'Kufri Jyoti', crop: 'potato', durationD: 110, waterNeed: 0.75, heatTol: 0.45, diseasePkg: ['Late blight (moderate)'], yieldPot: 0.85, marketPref: 0.7, seedCostPerHa: 42000, note: 'Reliable table potato, widely accepted by traders.' },
  { name: 'Suvarna (local landrace)', crop: 'rice', durationD: 105, waterNeed: 0.6, heatTol: 0.7, diseasePkg: ['Blast (tolerant)'], yieldPot: 0.65, marketPref: 0.72, seedCostPerHa: 2200, note: 'Short duration — fits a late monsoon and saves one irrigation.' },
  { name: 'Pusa Basmati 1509', crop: 'rice', durationD: 120, waterNeed: 0.8, heatTol: 0.6, diseasePkg: ['Bacterial blight (partial)'], yieldPot: 0.8, marketPref: 0.95, seedCostPerHa: 3400, note: 'Export-grade aroma; needs clean water and careful drying.' },
];

export default function SeedsScreen() {
  const { p } = useTheme();
  const { s, set, push, audit } = useApp();
  const f = activeField(s);
  const [crop, setCrop] = React.useState<CropKey>(f.crop);
  const [water, setWater] = React.useState(0.7);
  const [season, setSeason] = React.useState(130);
  const [disease, setDisease] = React.useState(0.6);
  const [premium, setPremium] = React.useState(0.5);

  const ranked = VARIETIES.filter((v) => v.crop === crop).map((v) => {
    const waterFit = 1 - Math.max(0, v.waterNeed - water) * 1.8;
    const timeFit = v.durationD <= season ? 1 : 1 - (v.durationD - season) / 40;
    const diseaseFit = 0.35 + Math.min(1, v.diseasePkg.length / 3) * 0.65 * (0.4 + disease);
    const marketFit = 1 - Math.abs(v.marketPref - (0.55 + premium * 0.45));
    const yieldFit = v.yieldPot;
    const score = Math.max(0, Math.min(1,
      waterFit * 0.3 + timeFit * 0.25 + diseaseFit * 0.2 + marketFit * 0.13 + yieldFit * 0.12));
    const reasons = [
      waterFit < 0.75 ? `needs more water than your ${(water * 100).toFixed(0)}% assured supply` : 'water requirement fits your supply',
      timeFit < 0.9 ? `${v.durationD} d is longer than your ${season} d window` : `${v.durationD} d fits the ${season} d window`,
      v.diseasePkg.length ? `resistant to ${v.diseasePkg.join(', ')}` : 'no resistance package — needs a spray programme',
    ];
    return { ...v, score: +score.toFixed(3), reasons };
  }).sort((a, b) => b.score - a.score);

  return (
    <Screen>
      <ScreenHeader title="Seeds & varieties" sub="Variety doctor + village seed exchange" icon="flower" right={<Pill text={`${ranked.length} MATCHES`} color={p.accent} />} />

      <SectionTitle title="Variety doctor" icon="flask" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: space.md }}>
        {Array.from(new Set(VARIETIES.map((v) => v.crop))).map((c) => (
          <Chip key={c} label={`${CROPS[c].emoji} ${CROPS[c].name}`} active={crop === c} onPress={() => setCrop(c)} />
        ))}
      </ScrollView>
      <Card>
        <Slider label="Assured water supply" value={water} min={0.2} max={1} step={0.05} onChange={setWater} color={p.water} />
        <Slider label="Days available before next crop" value={season} min={90} max={170} step={5} unit=" d" onChange={setSeason} color={p.accent} />
        <Slider label="Local disease pressure" value={disease} min={0} max={1} step={0.05} onChange={setDisease} color={p.danger} />
        <Slider label="Preference for premium market" value={premium} min={0} max={1} step={0.05} onChange={setPremium} color={p.sun} />
      </Card>

      {ranked.map((v, i) => (
        <Card key={v.name} glow={i === 0}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Row gap={6}><T variant="h3">{v.name}</T>{i === 0 ? <Pill text="BEST FIT" color={p.primary} icon="ribbon" /> : null}</Row>
              <T variant="micro" color={p.textDim}>{v.durationD} d · seed cost {v.seedCostPerHa.toLocaleString('en-IN')}/ha</T>
            </View>
            <T variant="h2" color={i === 0 ? p.primary : p.text}>{(v.score * 100).toFixed(0)}</T>
          </Row>
          <Bar value={v.score} color={i === 0 ? p.primary : p.textDim} height={6} />
          <T variant="small" color={p.textDim} style={{ marginTop: 8 }}>{v.note}</T>
          {v.reasons.map((r) => (
            <Row key={r} gap={6} style={{ marginTop: 4 }}>
              <Ionicons name="ellipse" size={7} color={p.textFaint} />
              <T variant="micro" color={p.textFaint} style={{ flex: 1 }}>{r}</T>
            </Row>
          ))}
        </Card>
      ))}

      <SectionTitle title="Seed exchange" icon="swap-horizontal" />
      <Banner kind="info" icon="leaf" text="Farmer-to-farmer seed barter with a germination log. Each exchange is written to both Farm Passports, so a landrace keeps its provenance across seasons." />
      {s.seeds.map((sd) => (
        <Card key={sd.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T variant="h3">{sd.variety}</T>
              <T variant="micro" color={p.textDim}>{sd.owner} · {sd.qtyKg} kg · harvest {sd.year} · germination {sd.germinationPct}%</T>
              <Row gap={6} wrap style={{ marginTop: 6 }}>
                {sd.traits.map((tr) => <Pill key={tr} text={tr} color={tr.toLowerCase().includes('suscept') ? p.warn : p.accent} />)}
              </Row>
            </View>
            <Ionicons name="leaf" size={22} color={p.accent} />
          </Row>
          <Divider />
          <KV k="Wants in exchange" v={sd.wants} />
          <Btn
            small
            kind="soft"
            icon="swap-horizontal"
            title="Propose exchange"
            style={{ marginTop: space.sm }}
            onPress={() => { push('seed_exchange', { id: sd.id, with: sd.owner }); audit({ actor: s.profile.id, action: 'seed:exchange', resource: `seed:${sd.id}`, outcome: 'allow' }); }}
          />
        </Card>
      ))}
      <Card>
        <Btn
          small
          icon="add-circle"
          title="Offer my saved seed"
          onPress={() => set((d) => ({
            ...d,
            seeds: [...d.seeds, { id: uid('sd'), variety: 'Own saved tomato line', crop: 'tomato', qtyKg: 1.2, owner: d.profile.name, germinationPct: 89, year: new Date().getFullYear(), traits: ['Locally adapted'], wants: 'Onion or legume seed' }],
          }))}
        />
      </Card>
    </Screen>
  );
}
