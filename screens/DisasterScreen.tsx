import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Bar, Btn, Card, Chip, Divider, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, Stat, T } from '../components/ui';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { activeField, fieldWeather } from '../lib/derive';
import { riskWindow } from '../lib/weather';
import { inr, priceRange } from '../lib/price';
import { CROPS } from '../lib/agro';

const HAZARDS = {
  cyclone: {
    label: 'Cyclone / high wind', icon: 'thunderstorm', color: '#4CC9F0',
    before: [
      'Harvest anything within 7 days of maturity — a mature crop on the plant is a total loss risk.',
      'Stake and tie tall crops; open drainage channels to the lowest point of the field.',
      'Move machinery, pumps and stored produce above the historic flood line.',
      'Charge every phone and power bank; the mesh needs at least one live radio.',
    ],
    after: [
      'Photograph damage before touching anything — geo-tagged, time-stamped photos are the claim evidence.',
      'Drain standing water within 48 h; roots suffocate after that.',
      'Apply a foliar 1% urea + 0.5% KNO₃ spray to restart stalled canopies.',
      'Do not re-sow until the water table drops below 30 cm.',
    ],
  },
  flood: {
    label: 'Flood / waterlogging', icon: 'water', color: '#1B7FA8',
    before: [
      'Open field drains and clear culverts now, not when the water arrives.',
      'Raise seed, fertiliser and fodder stocks onto platforms.',
      'Shift livestock to the highest bund with three days of dry fodder.',
    ],
    after: [
      'Record water depth and duration per plot — parametric cover pays on the index, not on argument.',
      'Top-dress nitrogen once the soil is workable; leaching removes 30–50% of applied N.',
      'Watch for root rot and bacterial wilt for 14 days after the water leaves.',
    ],
  },
  heat: {
    label: 'Heat wave', icon: 'flame', color: '#FFB347',
    before: [
      'Irrigate at night to pre-cool the canopy and soil.',
      'Apply kaolin clay or a 3% shade spray on horticultural crops.',
      'Postpone all spraying above 34 °C — it burns leaves and evaporates before uptake.',
    ],
    after: [
      'Assess flower and fruit drop before deciding to continue with the crop.',
      'A 6% potassium nitrate spray helps recover from heat-induced sterility.',
    ],
  },
  hail: {
    label: 'Hailstorm', icon: 'snow', color: '#9BB1FF',
    before: [
      'Deploy anti-hail netting on horticulture blocks if you have it.',
      'Harvest mature fruit immediately — hail scars destroy the market grade.',
    ],
    after: [
      'Photograph every block for the claim, including a wide shot with a landmark.',
      'Spray a protectant fungicide within 24 h: hail wounds are open doors for bacteria.',
      'Do not remove damaged leaves; they still photosynthesise while the plant recovers.',
    ],
  },
} as const;

export default function DisasterScreen({ navigation }: any) {
  const { p } = useTheme();
  const { s, set, push, audit } = useApp();
  const f = activeField(s);
  const weather = React.useMemo(() => fieldWeather(f, 10), [f.id]);
  const risks = riskWindow(weather);
  const [hazard, setHazard] = React.useState<keyof typeof HAZARDS>('cyclone');
  const [armed, setArmed] = React.useState(false);
  const [phase, setPhase] = React.useState<'before' | 'after'>('before');
  const [checked, setChecked] = React.useState<Record<string, boolean>>({});

  const h = HAZARDS[hazard];
  const items = h[phase];
  const doneCount = items.filter((i) => checked[i]).length;
  const cropValue = priceRange({ crop: f.crop, qualityScore: 74, grade: 'B', quantityQuintal: 1 }).mid * 18 * f.areaHa;

  return (
    <Screen>
      <ScreenHeader title="Disaster mode" sub="Battery-saving, offline, one-tap protocols" icon="thunderstorm" right={<Pill text={armed ? 'ARMED' : 'STANDBY'} color={armed ? p.danger : p.textDim} icon={armed ? 'flash' : 'moon'} />} />

      <Card glow={armed}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T variant="h3">{armed ? 'Disaster mode is ON' : 'Arm disaster mode'}</T>
            <T variant="small" color={p.textDim}>
              {armed
                ? 'Background sync paused, screen dimmed, mesh beacons every 15 min, advisories cached for 7 days. Battery lasts ~3× longer.'
                : 'Cuts battery use, caches a week of advisories and switches the mesh to low-power beaconing.'}
            </T>
          </View>
          <Chip label={armed ? 'ON' : 'OFF'} active={armed} color={p.danger} onPress={() => { setArmed((v) => !v); set((d) => ({ ...d, settings: { ...d.settings, airplane: !armed } })); audit({ actor: s.profile.id, action: 'disaster:arm', resource: 'device', outcome: 'allow' }); }} />
        </Row>
      </Card>

      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <Stat label="Crop at risk" value={inr(cropValue)} sub={`${CROPS[f.crop].name} · ${f.areaHa} ha`} color={p.warn} icon="basket" />
        <Stat label="Heat days" value={`${risks.heat.length}`} sub="next 10 days" color={risks.heat.length ? p.danger : p.ok} icon="flame" />
        <Stat label="Heavy rain" value={`${weather.filter((w) => w.rainMm > 25).length}`} sub="days > 25 mm" color={p.water} icon="rainy" />
      </Row>

      <Row gap={8} wrap style={{ marginBottom: space.md }}>
        {(Object.keys(HAZARDS) as (keyof typeof HAZARDS)[]).map((k) => (
          <Chip key={k} label={HAZARDS[k].label} icon={HAZARDS[k].icon} active={hazard === k} onPress={() => setHazard(k)} color={HAZARDS[k].color} />
        ))}
      </Row>

      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
          <T variant="h3">{h.label} protocol</T>
          <Row gap={6}>
            <Chip label="Before" active={phase === 'before'} onPress={() => setPhase('before')} />
            <Chip label="After" active={phase === 'after'} onPress={() => setPhase('after')} />
          </Row>
        </Row>
        <Bar value={doneCount} max={items.length} color={p.ok} height={7} label={`${doneCount} of ${items.length} actions complete`} />
        <Divider />
        {items.map((i) => (
          <Row key={i} gap={9} style={{ paddingVertical: 8, alignItems: 'flex-start' }}>
            <Ionicons
              name={checked[i] ? 'checkbox' : 'square-outline'}
              size={18}
              color={checked[i] ? p.ok : p.textFaint}
              onPress={() => setChecked((c) => ({ ...c, [i]: !c[i] }))}
            />
            <T variant="small" color={checked[i] ? p.textDim : p.text} style={{ flex: 1, lineHeight: 20 }}>{i}</T>
          </Row>
        ))}
      </Card>

      <SectionTitle title="Emergency actions" icon="alert-circle" />
      <Row gap={space.sm} wrap style={{ marginBottom: space.md }}>
        <Btn
          small
          kind="danger"
          icon="megaphone"
          title="Broadcast village alert"
          onPress={() => { push('disaster_broadcast', { hazard, at: Date.now() }); audit({ actor: s.profile.id, action: 'disaster:broadcast', resource: 'village', outcome: 'allow' }); }}
        />
        <Btn small kind="soft" icon="camera" title="Capture damage evidence" onPress={() => navigation.navigate('Tabs', { screen: 'Scan' })} />
        <Btn small kind="soft" icon="umbrella" title="Open insurance claim" onPress={() => navigation.navigate('Finance')} />
      </Row>

      <Card>
        <SectionTitle title="Offline contacts" icon="call" />
        {[
          { n: 'District agriculture officer', v: '1800-180-1551 (Kisan Call Centre)' },
          { n: 'Disaster helpline', v: '1077 / 112' },
          { n: 'Veterinary emergency', v: '1962' },
          { n: 'Shirur FPO coordinator', v: 'Mesh peer — FPO tablet (uplink)' },
        ].map((c) => <KV key={c.n} k={c.n} v={c.v} />)}
        <Banner kind="info" icon="cloud-offline" text="These protocols, contacts and the last 7 days of advisories are stored on the device. They stay readable with no signal, no data pack and no charge left in the tower." />
      </Card>
    </Screen>
  );
}
