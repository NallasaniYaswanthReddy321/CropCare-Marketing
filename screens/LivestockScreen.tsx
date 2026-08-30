import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Bar, Btn, Card, Divider, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, Slider, Sparkline, Stat, T } from '../components/ui';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { inr } from '../lib/price';
import { seededRandom } from '../lib/crypto';

const VACCINE_INTERVAL: Record<string, { name: string; days: number }[]> = {
  cow: [{ name: 'FMD', days: 180 }, { name: 'HS + BQ', days: 365 }, { name: 'Deworming', days: 90 }],
  buffalo: [{ name: 'FMD', days: 180 }, { name: 'HS', days: 365 }, { name: 'Deworming', days: 90 }],
  goat: [{ name: 'PPR', days: 1095 }, { name: 'ET', days: 365 }, { name: 'Deworming', days: 90 }],
  poultry: [{ name: 'Newcastle (RDV)', days: 60 }, { name: 'IBD', days: 120 }],
};

export default function LivestockScreen() {
  const { p } = useTheme();
  const { s, set, push, audit } = useApp();
  const [feedMilk, setFeedMilk] = React.useState(11);
  const [bodyWt, setBodyWt] = React.useState(450);

  // Dry-matter requirement: 2.5% body weight maintenance + 0.4 kg concentrate per litre
  const dmMaintenance = +(bodyWt * 0.025).toFixed(1);
  const concentrate = +(feedMilk * 0.4).toFixed(1);
  const greenFodder = +(dmMaintenance * 2.6).toFixed(1);
  const feedCost = Math.round(concentrate * 28 + greenFodder * 2.2 + 20);
  const milkValue = Math.round(feedMilk * 38);
  const margin = milkValue - feedCost;

  const herdMilk = s.livestock.reduce((a, x) => a + (x.milkL ?? 0), 0);
  const trend = React.useMemo(() => {
    const rnd = seededRandom('milk');
    return Array.from({ length: 14 }, (_, i) => +(herdMilk * (0.92 + rnd() * 0.16) - i * 0.05).toFixed(1));
  }, [herdMilk]);

  return (
    <Screen>
      <ScreenHeader title="Livestock" sub="Herd health, feed economics and vaccination" icon="paw" right={<Pill text={`${s.livestock.length} ANIMALS`} color={p.soil} />} />

      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <Stat label="Daily milk" value={`${herdMilk.toFixed(1)} L`} sub={`≈ ${inr(herdMilk * 38)}/day`} color={p.primary} icon="water" />
        <Stat label="Open alerts" value={`${s.livestock.reduce((a, x) => a + x.alerts.length, 0)}`} sub="health actions" color={p.warn} icon="alert" />
        <Stat label="Feed margin" value={inr(margin)} sub="per animal/day" color={margin > 0 ? p.ok : p.danger} icon="cash" />
      </Row>

      <Card><Sparkline data={trend} height={70} color={p.primary} labels={['14 d ago', 'today']} /></Card>

      {s.livestock.map((a) => {
        const sched = VACCINE_INTERVAL[a.species] ?? [];
        const lastV = Date.parse(a.lastVaccine);
        return (
          <Card key={a.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={10} style={{ flex: 1 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: p.soil + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="paw" size={19} color={p.soil} />
                </View>
                <View style={{ flex: 1 }}>
                  <T variant="h3">{a.name}</T>
                  <T variant="micro" color={p.textDim}>{a.species} · {Math.floor(a.ageM / 12)} y {a.ageM % 12} m{a.milkL ? ` · ${a.milkL} L/day` : ''}</T>
                </View>
              </Row>
              {a.alerts.length ? <Pill text={`${a.alerts.length} ALERT`} color={p.warn} icon="warning" /> : <Pill text="HEALTHY" color={p.ok} icon="checkmark-circle" />}
            </Row>
            <Divider />
            {sched.map((v) => {
              const due = lastV + v.days * 86400000;
              const daysLeft = Math.round((due - Date.now()) / 86400000);
              return (
                <Row key={v.name} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
                  <Row gap={8}>
                    <Ionicons name={daysLeft < 0 ? 'alert-circle' : daysLeft < 15 ? 'time' : 'checkmark-circle'} size={13} color={daysLeft < 0 ? p.danger : daysLeft < 15 ? p.warn : p.ok} />
                    <T variant="small">{v.name}</T>
                  </Row>
                  <T variant="micro" color={daysLeft < 0 ? p.danger : p.textDim}>{daysLeft < 0 ? `overdue by ${-daysLeft} d` : `due in ${daysLeft} d`}</T>
                </Row>
              );
            })}
            {a.alerts.map((al) => <T key={al} variant="micro" color={p.warn} style={{ marginTop: 4 }}>⚠ {al}</T>)}
            <Btn
              small
              kind="soft"
              icon="medkit"
              title="Record treatment"
              style={{ marginTop: space.sm }}
              onPress={() => {
                set((d) => ({ ...d, livestock: d.livestock.map((x) => (x.id === a.id ? { ...x, lastVaccine: new Date().toISOString().slice(0, 10), alerts: [] } : x)) }));
                push('livestock_treatment', { id: a.id });
                audit({ actor: s.profile.id, action: 'livestock:treat', resource: `animal:${a.id}`, outcome: 'allow' });
              }}
            />
          </Card>
        );
      })}

      <SectionTitle title="Feed calculator" icon="nutrition" />
      <Card>
        <Slider label="Body weight" value={bodyWt} min={150} max={700} step={10} unit=" kg" onChange={setBodyWt} color={p.soil} />
        <Slider label="Milk yield" value={feedMilk} min={0} max={30} step={0.5} unit=" L/day" onChange={setFeedMilk} color={p.primary} />
        <Divider />
        <KV k="Dry matter for maintenance" v={`${dmMaintenance} kg/day (2.5% body weight)`} />
        <KV k="Concentrate for production" v={`${concentrate} kg/day (0.4 kg per litre)`} />
        <KV k="Green fodder" v={`${greenFodder} kg/day fresh`} />
        <KV k="Feed cost" v={inr(feedCost)} color={p.danger} />
        <KV k="Milk revenue at ₹38/L" v={inr(milkValue)} color={p.ok} />
        <KV k="Daily margin" v={inr(margin)} color={margin > 0 ? p.ok : p.danger} />
        <Bar value={Math.max(0, margin)} max={Math.max(1, milkValue)} color={p.ok} height={7} />
        <Banner kind="info" icon="bulb" text="Test for sub-clinical mastitis monthly with the California Mastitis Test — it silently removes 10–20% of yield long before clots are visible in the strip cup." />
      </Card>
    </Screen>
  );
}
