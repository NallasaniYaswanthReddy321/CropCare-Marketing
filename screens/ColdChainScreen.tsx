import React from 'react';
import { ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Bar, Btn, Card, Chip, Divider, KV, MultiLine, Pill, Row, Screen, ScreenHeader, SectionTitle, Slider, Stat, T } from '../components/ui';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { CROPS, CropKey } from '../lib/agro';
import { inr, priceRange, sellSimulator } from '../lib/price';
import { activeField, fieldWeather } from '../lib/derive';

/** Q10 respiration model: shelf life roughly halves for every 10 °C above optimum. */
function shelfLife(crop: CropKey, tempC: number, rh: number) {
  const spec = CROPS[crop];
  const [tLo, tHi] = spec.coldChain.tempC;
  const opt = (tLo + tHi) / 2;
  const q10 = 2.6;
  const factor = Math.pow(q10, (tempC - opt) / 10);
  const chillInjury = tempC < tLo - 2 ? 0.55 : 1;
  const rhPenalty = rh < spec.coldChain.rh[0] - 10 ? 0.78 : rh > spec.coldChain.rh[1] + 8 ? 0.85 : 1;
  const hours = (spec.shelfLifeH * 3.4 / Math.max(0.25, factor)) * chillInjury * rhPenalty;
  return { hours: Math.round(hours), factor: +factor.toFixed(2), chillInjury: chillInjury < 1, rhPenalty: rhPenalty < 1, opt };
}

export default function ColdChainScreen({ navigation }: any) {
  const { p } = useTheme();
  const { s } = useApp();
  const f = activeField(s);
  const [crop, setCrop] = React.useState<CropKey>(f.crop);
  const [qty, setQty] = React.useState(20);
  const [temp, setTemp] = React.useState(12);
  const [rh, setRh] = React.useState(88);
  const [days, setDays] = React.useState(5);

  const spec = CROPS[crop];
  const weather = fieldWeather(f, 7);
  const ambient = weather[0].tMax;
  const cold = shelfLife(crop, temp, rh);
  const room = shelfLife(crop, ambient, 55);

  const storagePerQPerDay = 18;
  const pr = priceRange({ crop, qualityScore: 78, grade: 'A', quantityQuintal: qty });
  const sim = sellSimulator({ crop, qualityScore: 78, grade: 'A', quantityQuintal: qty, bestNetNow: pr.grossMid, coldStorage: true, seed: crop });

  const lossRoom = Math.min(0.85, (days * 24) / Math.max(1, room.hours));
  const lossCold = Math.min(0.85, (days * 24) / Math.max(1, cold.hours));
  const savedValue = (lossRoom - lossCold) * pr.grossMid;
  const storageCost = storagePerQPerDay * qty * days;
  const net = savedValue - storageCost;
  const breakEvenDays = savedValue > 0 ? Math.max(1, Math.round((storageCost / Math.max(1, savedValue)) * days)) : 99;

  const curve = (h: number) => Array.from({ length: 10 }, (_, i) => Math.max(0, 100 * (1 - (i * 24) / Math.max(1, h))));

  return (
    <Screen>
      <ScreenHeader title="Cold-chain advisor" sub="Store or sell — the arithmetic, not a hunch" icon="snow" right={<Pill text="Q10 MODEL" color={p.water} />} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: space.md }}>
        {Object.values(CROPS).map((c) => <Chip key={c.key} label={`${c.emoji} ${c.name}`} active={crop === c.key} onPress={() => { setCrop(c.key); setTemp((CROPS[c.key].coldChain.tempC[0] + CROPS[c.key].coldChain.tempC[1]) / 2); setRh(CROPS[c.key].coldChain.rh[0]); }} />)}
      </ScrollView>

      <Card glow>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T variant="micro" color={p.textDim}>RECOMMENDED FOR {spec.name.toUpperCase()}</T>
            <T variant="h2" color={p.water}>{spec.coldChain.tempC[0]}–{spec.coldChain.tempC[1]} °C · {spec.coldChain.rh[0]}–{spec.coldChain.rh[1]}% RH</T>
            <T variant="small" color={p.textDim}>{spec.coldChain.ethyleneSensitive ? 'Ethylene-active: keep away from leafy greens and cut flowers.' : 'Not ethylene sensitive — safe to co-store with most produce.'}</T>
          </View>
          <Ionicons name="thermometer" size={34} color={p.water} />
        </Row>
      </Card>

      <SectionTitle title="Your storage conditions" icon="options" />
      <Card>
        <Slider label="Store temperature" value={temp} min={-2} max={35} step={0.5} unit=" °C" onChange={setTemp} color={p.water} />
        <Slider label="Relative humidity" value={rh} min={40} max={98} step={1} unit="%" onChange={setRh} color={p.accent} />
        <Slider label="Quantity" value={qty} min={1} max={120} step={1} unit=" q" onChange={setQty} />
        <Slider label="Planned hold" value={days} min={1} max={21} step={1} unit=" days" onChange={setDays} color={p.sun} />
      </Card>

      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <Stat label="Cold store life" value={`${Math.round(cold.hours / 24)} d`} sub={`${cold.hours} h at ${temp} °C`} color={p.water} icon="snow" />
        <Stat label="Ambient life" value={`${Math.round(room.hours / 24)} d`} sub={`${ambient} °C field heat`} color={p.warn} icon="sunny" />
        <Stat label="Q10 factor" value={`${cold.factor}×`} sub="respiration rate" color={p.textDim} icon="pulse" />
      </Row>

      {cold.chillInjury ? <Banner kind="danger" icon="snow" text={`${temp} °C is below the chilling-injury threshold for ${spec.name.toLowerCase()} (${spec.coldChain.tempC[0]} °C). Tissue breakdown appears after removal — pitting, failure to ripen and off-flavour.`} /> : null}
      {cold.rhPenalty ? <Banner kind="warn" icon="water" text={`Humidity is outside the ${spec.coldChain.rh[0]}–${spec.coldChain.rh[1]}% band — expect extra weight loss from transpiration.`} /> : null}

      <Card>
        <MultiLine
          height={140}
          series={[
            { data: curve(cold.hours), color: p.water, name: 'Cold store quality %' },
            { data: curve(room.hours), color: p.warn, name: 'Ambient quality %' },
          ]}
          labels={['day 0', 'day 3', 'day 6', 'day 9']}
        />
      </Card>

      <SectionTitle title="Store-or-sell economics" icon="calculator" />
      <Card glow={net > 0}>
        <KV k={`Spoilage if held ${days} d at ambient`} v={`${(lossRoom * 100).toFixed(0)}% · ${inr(lossRoom * pr.grossMid)}`} color={p.danger} />
        <KV k={`Spoilage if held ${days} d in cold store`} v={`${(lossCold * 100).toFixed(0)}% · ${inr(lossCold * pr.grossMid)}`} color={p.warn} />
        <KV k="Produce value saved" v={inr(savedValue)} color={p.ok} />
        <KV k={`Storage cost (₹${storagePerQPerDay}/q/day)`} v={`− ${inr(storageCost)}`} color={p.danger} />
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="h3">Net benefit of cold storage</T>
          <T variant="h2" color={net > 0 ? p.ok : p.danger}>{net > 0 ? '+' : '−'}{inr(Math.abs(net))}</T>
        </Row>
        <Bar value={Math.max(0, Math.min(1, net / Math.max(1, savedValue)))} color={net > 0 ? p.ok : p.danger} height={7} />
        <Banner
          kind={net > 0 ? 'ok' : 'warn'}
          icon="bulb"
          text={net > 0
            ? `Cold storage pays here. Break-even is around day ${breakEvenDays}; beyond that every extra day is profit as long as the price estimate holds.`
            : `Cold storage does not pay for this lot. Selling within ${Math.max(1, Math.round(room.hours / 24))} day(s) beats paying ${inr(storageCost)} in rent.`}
        />
        <Row gap={space.sm}>
          <Btn small title="Compare mandis" icon="git-compare" style={{ flex: 1 }} onPress={() => navigation.navigate('Tabs', { screen: 'Market' })} />
          <Btn small kind="ghost" title="Best hold horizon" icon="time" style={{ flex: 1 }} onPress={() => navigation.navigate('Tabs', { screen: 'Market' })} />
        </Row>
        <T variant="micro" color={p.textFaint} style={{ marginTop: 6 }}>Simulator says: {sim.best.label.toLowerCase()} · {sim.best.verdict}</T>
      </Card>

      <SectionTitle title="Pre-cooling checklist" icon="list" />
      <Card>
        {[
          'Harvest in the cool hours before 09:00 — every hour of field heat costs shelf life.',
          'Pre-cool within 2 hours: shade, forced air or a simple evaporative room.',
          'Never stack warm crates solid — leave 5 cm air gaps for the cold to reach the core.',
          `Keep ${spec.coldChain.ethyleneSensitive ? 'this crop away from ethylene-sensitive greens' : 'ethylene producers out of this room'}.`,
          'Line crates with a moist liner if humidity is below the recommended band.',
        ].map((c) => (
          <Row key={c} gap={8} style={{ paddingVertical: 5, alignItems: 'flex-start' }}>
            <Ionicons name="checkmark-circle" size={14} color={p.ok} style={{ marginTop: 2 }} />
            <T variant="small" color={p.textDim} style={{ flex: 1 }}>{c}</T>
          </Row>
        ))}
      </Card>
    </Screen>
  );
}
