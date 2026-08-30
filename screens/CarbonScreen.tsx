import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Bar, Btn, Card, Divider, Gauge, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, Stat, T } from '../components/ui';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { inr } from '../lib/price';
import { activeField } from '../lib/derive';

const POLLINATOR_CRITERIA = [
  { id: 'no_bloom_spray', label: 'No insecticide during bloom', weight: 30, met: true, detail: 'Spray log shows zero insecticide applications in the flowering window.' },
  { id: 'flower_strip', label: 'Flowering border strip ≥ 2 m', weight: 22, met: true, detail: 'Coriander + marigold border recorded in the intercropping plan.' },
  { id: 'timing', label: 'Sprays outside 08:00–16:00', weight: 18, met: true, detail: 'All applications logged before 07:30 or after 17:30.' },
  { id: 'nesting', label: 'Undisturbed nesting habitat', weight: 15, met: false, detail: 'No bare-soil or bund refuge declared for ground-nesting bees.' },
  { id: 'diverse', label: '≥ 3 crop families per year', weight: 15, met: true, detail: 'Solanaceae, Poaceae and Alliaceae recorded across seasons.' },
];

export default function CarbonScreen() {
  const { p } = useTheme();
  const { s, set, push, audit } = useApp();
  const f = activeField(s);
  const [criteria, setCriteria] = React.useState(POLLINATOR_CRITERIA);

  const adopted = s.carbon.filter((c) => c.adopted);
  const tCO2e = adopted.reduce((a, c) => a + c.tCO2ePerHa, 0) * f.areaHa;
  const potential = s.carbon.reduce((a, c) => a + c.tCO2ePerHa, 0) * f.areaHa;
  const pricePerT = 1450;
  const badgeScore = criteria.filter((c) => c.met).reduce((a, c) => a + c.weight, 0);
  const badge = badgeScore >= 85 ? 'Gold' : badgeScore >= 70 ? 'Silver' : badgeScore >= 50 ? 'Bronze' : 'Not yet';

  return (
    <Screen>
      <ScreenHeader title="Carbon & pollinators" sub="Measured, reported, verifiable — MRV that runs offline" icon="earth-outline" right={<Pill text={`${badge.toUpperCase()} BADGE`} color={badge === 'Gold' ? p.sun : badge === 'Silver' ? p.textDim : p.soil} icon="ribbon" />} />

      <Card glow>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T variant="micro" color={p.textDim}>SEQUESTERED / AVOIDED THIS SEASON</T>
            <T variant="h1" color={p.ok}>{tCO2e.toFixed(2)} tCO₂e</T>
            <T variant="small" color={p.textDim}>≈ {inr(tCO2e * pricePerT)} at ₹{pricePerT}/t · {((tCO2e / Math.max(0.01, potential)) * 100).toFixed(0)}% of your potential</T>
          </View>
          <Gauge value={tCO2e} max={Math.max(0.1, potential)} label="tCO₂e" color={p.ok} size={120} />
        </Row>
        <Bar value={tCO2e} max={Math.max(0.1, potential)} color={p.ok} height={8} />
      </Card>

      <SectionTitle title="Practices" icon="leaf" />
      {s.carbon.map((c) => (
        <Card key={c.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={10} style={{ flex: 1 }}>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: (c.adopted ? p.ok : p.textFaint) + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={c.adopted ? 'checkmark-circle' : 'ellipse-outline'} size={17} color={c.adopted ? p.ok : p.textFaint} />
              </View>
              <View style={{ flex: 1 }}>
                <T variant="h3">{c.name}</T>
                <T variant="micro" color={p.textDim}>{c.tCO2ePerHa} tCO₂e/ha/yr · evidence: {c.evidence}</T>
              </View>
            </Row>
            <Btn
              small
              kind={c.adopted ? 'ghost' : 'soft'}
              title={c.adopted ? 'Adopted' : 'Adopt'}
              icon={c.adopted ? 'checkmark' : 'add'}
              onPress={() => {
                set((d) => ({ ...d, carbon: d.carbon.map((x) => (x.id === c.id ? { ...x, adopted: !x.adopted } : x)) }));
                push('carbon_practice', { id: c.id });
                audit({ actor: s.profile.id, action: 'carbon:adopt', resource: `practice:${c.id}`, outcome: 'allow' });
              }}
            />
          </Row>
        </Card>
      ))}

      <Card>
        <SectionTitle title="MRV evidence pipeline" icon="documents" />
        <KV k="Measurement" v="Geo-tagged photos + Sentinel-2 residue/burn-scar checks" />
        <KV k="Reporting" v="Hash-chained practice log signed by the device key" />
        <KV k="Verification" v="Auditor role gets read-only, row-level scoped access" />
        <KV k="Buffer pool" v="20% of credits withheld against reversal risk" />
        <KV k="Payment" v="Released to wallet after third-party sampling of 5% of farms" />
      </Card>

      <SectionTitle title="Pollinator-positive badge" icon="flower" />
      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
          <T variant="h3">{badge} · {badgeScore}/100</T>
          <Pill text={badge === 'Gold' ? 'PREMIUM BUYER LANE' : 'IN PROGRESS'} color={badge === 'Gold' ? p.sun : p.textDim} />
        </Row>
        <Bar value={badgeScore} max={100} color={badgeScore >= 85 ? p.sun : p.accent} height={8} />
        <Divider />
        {criteria.map((c) => (
          <Row key={c.id} style={{ justifyContent: 'space-between', paddingVertical: 7 }}>
            <Row gap={9} style={{ flex: 1 }}>
              <Ionicons name={c.met ? 'checkmark-circle' : 'close-circle'} size={15} color={c.met ? p.ok : p.textFaint} />
              <View style={{ flex: 1 }}>
                <T variant="small">{c.label}</T>
                <T variant="micro" color={p.textFaint}>{c.detail}</T>
              </View>
            </Row>
            <Btn small kind="ghost" title={c.met ? '−' : '+'} onPress={() => setCriteria((v) => v.map((x) => (x.id === c.id ? { ...x, met: !x.met } : x)))} />
          </Row>
        ))}
        <Banner kind="info" icon="bulb" text="Insect pollination lifts fruit set 18–35% in cucurbits, mustard and mango. The badge is verified from your own spray log timings and intercropping plan — no extra paperwork, and buyers pay a premium for it." />
      </Card>
    </Screen>
  );
}
