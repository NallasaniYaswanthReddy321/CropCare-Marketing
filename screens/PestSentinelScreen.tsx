import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Bar, Btn, Card, Chip, Divider, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, Stat, T } from '../components/ui';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { activeField } from '../lib/derive';
import { uid } from '../lib/crypto';

type Spray = { id: string; product: string; irac: string; mode: string; at: number; target: string };

const PRODUCTS = [
  { product: 'Imidacloprid 17.8 SL', irac: '4A', mode: 'Nicotinic acetylcholine receptor agonist', target: 'Sucking pests' },
  { product: 'Thiamethoxam 25 WG', irac: '4A', mode: 'Nicotinic acetylcholine receptor agonist', target: 'Sucking pests' },
  { product: 'Spinosad 45 SC', irac: '5', mode: 'nAChR allosteric modulator', target: 'Thrips, borers' },
  { product: 'Emamectin benzoate 5 SG', irac: '6', mode: 'Chloride channel activator', target: 'Lepidoptera' },
  { product: 'Chlorantraniliprole 18.5 SC', irac: '28', mode: 'Ryanodine receptor modulator', target: 'Borers' },
  { product: 'Neem (azadirachtin 1500 ppm)', irac: 'UN', mode: 'Botanical, multi-site', target: 'Broad, soft' },
  { product: 'Bacillus thuringiensis kurstaki', irac: '11A', mode: 'Microbial midgut disruptor', target: 'Caterpillars' },
];

export default function PestSentinelScreen() {
  const { p } = useTheme();
  const { s, set, push, audit } = useApp();
  const f = activeField(s);
  const [sprays, setSprays] = React.useState<Spray[]>([
    { id: 'sp1', product: 'Imidacloprid 17.8 SL', irac: '4A', mode: PRODUCTS[0].mode, at: Date.now() - 26 * 86400000, target: 'Whitefly' },
    { id: 'sp2', product: 'Thiamethoxam 25 WG', irac: '4A', mode: PRODUCTS[1].mode, at: Date.now() - 13 * 86400000, target: 'Whitefly' },
    { id: 'sp3', product: 'Imidacloprid 17.8 SL', irac: '4A', mode: PRODUCTS[0].mode, at: Date.now() - 4 * 86400000, target: 'Thrips' },
  ]);

  // Resistance pressure: consecutive same-IRAC applications within one pest generation (~21 d)
  const window = sprays.filter((x) => Date.now() - x.at < 75 * 86400000).sort((a, b) => a.at - b.at);
  const groups = window.map((x) => x.irac);
  let maxRun = 0, run = 0;
  groups.forEach((g, i) => { run = i > 0 && g === groups[i - 1] ? run + 1 : 1; maxRun = Math.max(maxRun, run); });
  const uniqueGroups = new Set(groups).size;
  const shortIntervals = window.filter((x, i) => i > 0 && x.at - window[i - 1].at < 21 * 86400000 && x.irac === window[i - 1].irac).length;
  const risk = Math.min(100, maxRun * 22 + shortIntervals * 18 + (uniqueGroups <= 1 ? 25 : 0));
  const status = risk > 66 ? 'Critical' : risk > 38 ? 'Elevated' : 'Healthy';

  const lastGroup = window[window.length - 1]?.irac;
  const suggestions = PRODUCTS.filter((x) => x.irac !== lastGroup);

  const addSpray = (prod: typeof PRODUCTS[number]) => {
    const sp = { id: uid('sp'), product: prod.product, irac: prod.irac, mode: prod.mode, at: Date.now(), target: 'Field-wide' };
    setSprays((v) => [...v, sp]);
    push('spray_log', { product: prod.product, irac: prod.irac });
    audit({ actor: s.profile.id, action: 'spray:log', resource: `field:${f.id}`, outcome: 'allow', meta: { irac: prod.irac } });
  };

  return (
    <Screen>
      <ScreenHeader title="Pest-resistance sentinel" sub="Stop breeding resistance in your own field" icon="shield-half" right={<Pill text={status.toUpperCase()} color={risk > 66 ? p.danger : risk > 38 ? p.warn : p.ok} />} />

      <Card glow>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T variant="micro" color={p.textDim}>RESISTANCE PRESSURE INDEX</T>
            <T variant="h1" color={risk > 66 ? p.danger : risk > 38 ? p.warn : p.ok}>{risk}/100</T>
            <T variant="small" color={p.textDim}>{maxRun} consecutive sprays from IRAC group {lastGroup} · {uniqueGroups} distinct modes in 75 days</T>
          </View>
          <Ionicons name={risk > 66 ? 'skull' : 'shield-checkmark'} size={38} color={risk > 66 ? p.danger : p.ok} />
        </Row>
        <Bar value={risk} max={100} color={risk > 66 ? p.danger : risk > 38 ? p.warn : p.ok} height={9} />
        <Banner
          kind={risk > 38 ? 'danger' : 'ok'}
          icon="bug"
          text={risk > 38
            ? `Repeating IRAC ${lastGroup} inside one pest generation selects hard for survivors. Whitefly populations can lose neonicotinoid sensitivity in 3–4 seasons of this pattern — and every neighbour inherits it.`
            : 'Mode-of-action rotation looks healthy. Keep alternating IRAC groups between pest generations (roughly every 21 days).'}
        />
      </Card>

      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <Stat label="Sprays / 75 d" value={`${window.length}`} sub="logged applications" color={p.textDim} icon="water" />
        <Stat label="Distinct modes" value={`${uniqueGroups}`} sub="IRAC groups used" color={uniqueGroups > 2 ? p.ok : p.warn} icon="shuffle" />
        <Stat label="Repeat runs" value={`${maxRun}`} sub="same group in a row" color={maxRun > 2 ? p.danger : p.ok} icon="repeat" />
      </Row>

      <SectionTitle title="Spray history" icon="time" />
      <Card>
        {window.map((x) => (
          <Row key={x.id} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
            <Row gap={8} style={{ flex: 1 }}>
              <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: (x.irac === lastGroup ? p.warn : p.primary) + '22', alignItems: 'center', justifyContent: 'center' }}>
                <T variant="micro" color={x.irac === lastGroup ? p.warn : p.primary}>{x.irac}</T>
              </View>
              <View style={{ flex: 1 }}>
                <T variant="small">{x.product}</T>
                <T variant="micro" color={p.textFaint}>{x.mode} · {x.target}</T>
              </View>
            </Row>
            <T variant="micro" color={p.textDim}>{Math.round((Date.now() - x.at) / 86400000)} d ago</T>
          </Row>
        ))}
      </Card>

      <SectionTitle title="Recommended next rotation" icon="shuffle" />
      {suggestions.slice(0, 4).map((sug) => (
        <Card key={sug.product}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Row gap={6}><T variant="h3">{sug.product}</T><Pill text={`IRAC ${sug.irac}`} color={p.primary} /></Row>
              <T variant="micro" color={p.textDim}>{sug.mode} · {sug.target}</T>
            </View>
            <Btn small kind="soft" title="Log" icon="add" onPress={() => addSpray(sug)} />
          </Row>
        </Card>
      ))}

      <Card>
        <SectionTitle title="Village resistance watch" icon="people" />
        <T variant="small" color={p.textDim}>
          Resistance is a shared resource problem: if every farm in Shirur sprays IRAC 4A for whitefly, the whole village loses the chemistry together. CropCare aggregates anonymised spray logs over the mesh and warns when a group is being overused within 3 km.
        </T>
        <Divider />
        <KV k="Village IRAC 4A share" v="58% of logged sprays — above the 40% safe ceiling" color={p.warn} />
        <KV k="Suggested village rotation" v="4A → 28 → 5 → biological (Bt / neem)" />
        <KV k="Refuge strategy" v="Leave 5% unsprayed refuge rows to keep susceptible genes in the population" />
      </Card>
    </Screen>
  );
}
