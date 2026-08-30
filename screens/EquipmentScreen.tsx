import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Bar, Btn, Card, Divider, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, Sheet, Slider, Stat, T } from '../components/ui';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { inr } from '../lib/price';
import { fmtDate } from '../lib/derive';
import { uid } from '../lib/crypto';

/** Maintenance model: interval-based service debt + wear-driven failure risk. */
function healthPassport(e: { engineHours: number; lastService: number; healthScore: number; faults: string[] }) {
  const daysSinceService = Math.round((Date.now() - e.lastService) / 86400000);
  const hoursSinceService = Math.round(e.engineHours % 250);
  const oilDue = Math.max(0, 250 - hoursSinceService);
  const serviceDebt = Math.max(0, daysSinceService - 180) / 180 + Math.max(0, hoursSinceService - 250) / 250;
  const failureRisk = Math.min(0.95, 0.05 + serviceDebt * 0.35 + (100 - e.healthScore) / 180 + e.faults.length * 0.08);
  const remainingLife = Math.max(0, Math.round((10000 - e.engineHours) / 900));
  const items = [
    { part: 'Engine oil + filter', dueIn: `${oilDue} h`, urgent: oilDue < 40, cost: 1800 },
    { part: 'Air filter', dueIn: `${Math.max(0, 500 - (e.engineHours % 500))} h`, urgent: e.engineHours % 500 > 460, cost: 650 },
    { part: 'Hydraulic oil', dueIn: `${Math.max(0, 1000 - (e.engineHours % 1000))} h`, urgent: e.engineHours % 1000 > 950, cost: 4200 },
    { part: 'Annual service', dueIn: `${Math.max(0, 365 - daysSinceService)} days`, urgent: daysSinceService > 330, cost: 3500 },
  ];
  return { daysSinceService, failureRisk: +failureRisk.toFixed(2), remainingLife, items, serviceDebt: +serviceDebt.toFixed(2) };
}

export default function EquipmentScreen() {
  const { p } = useTheme();
  const { s, set, push, audit } = useApp();
  const [detail, setDetail] = React.useState<any>(null);
  const [hours, setHours] = React.useState(4);

  return (
    <Screen>
      <ScreenHeader title="Equipment" sub="Share machines · verifiable health passport" icon="construct" right={<Pill text={`${s.equipment.filter((e) => e.available).length} FREE`} color={p.ok} />} />

      <Banner kind="info" icon="information-circle" text="Every machine carries a hash-chained service record. A renter sees real engine hours and open faults before booking, so nobody pays for a broken rotavator." />

      {s.equipment.map((e) => {
        const hp = healthPassport(e);
        return (
          <Card key={e.id} onPress={() => setDetail({ e, hp })}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={10} style={{ flex: 1 }}>
                <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: p.soil + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={e.icon as any} size={19} color={p.soil} />
                </View>
                <View style={{ flex: 1 }}>
                  <T variant="h3">{e.name}</T>
                  <T variant="micro" color={p.textDim}>{e.owner} · {e.distanceKm} km · {e.engineHours.toLocaleString('en-IN')} h · serviced {fmtDate(e.lastService)}</T>
                </View>
              </Row>
              <View style={{ alignItems: 'flex-end' }}>
                <T variant="h3" color={p.primary}>{inr(e.ratePerHr)}</T>
                <T variant="micro" color={p.textFaint}>per hour</T>
              </View>
            </Row>
            <Row gap={space.sm} style={{ marginTop: space.sm }}>
              <View style={{ flex: 1 }}>
                <Bar value={e.healthScore} max={100} color={e.healthScore > 75 ? p.ok : e.healthScore > 55 ? p.warn : p.danger} height={6} label={`Health ${e.healthScore}/100 · failure risk ${(hp.failureRisk * 100).toFixed(0)}%`} />
              </View>
              <Pill text={e.available ? 'AVAILABLE' : 'BOOKED'} color={e.available ? p.ok : p.textFaint} />
            </Row>
            {e.faults.length ? <T variant="micro" color={p.warn} style={{ marginTop: 6 }}>⚠ {e.faults.join(' · ')}</T> : null}
          </Card>
        );
      })}

      <SectionTitle title="Your machine" icon="settings" />
      <Card>
        <T variant="small" color={p.textDim}>List your equipment to earn on idle days. CropCare logs each rental hour to the machine's passport automatically, which raises its resale value and your FarmScore.</T>
        <Btn
          small
          icon="add-circle"
          title="List a machine"
          style={{ marginTop: space.sm }}
          onPress={() => {
            set((d) => ({
              ...d,
              equipment: [...d.equipment, { id: uid('eq'), name: 'Power tiller 8 HP', owner: d.profile.name, ratePerHr: 380, distanceKm: 0, available: true, engineHours: 640, lastService: Date.now() - 40 * 86400000, healthScore: 88, faults: [], icon: 'cog' }],
            }));
            push('equipment_list', { at: Date.now() });
          }}
        />
      </Card>

      <Sheet visible={!!detail} onClose={() => setDetail(null)} title={detail?.e.name ?? ''}>
        {detail ? (
          <View>
            <Row gap={space.sm} style={{ marginBottom: space.md }}>
              <Stat label="Health" value={`${detail.e.healthScore}`} sub="/100" color={detail.e.healthScore > 75 ? p.ok : p.warn} icon="pulse" />
              <Stat label="Failure risk" value={`${(detail.hp.failureRisk * 100).toFixed(0)}%`} sub="next 100 h" color={detail.hp.failureRisk > 0.4 ? p.danger : p.ok} icon="alert" />
              <Stat label="Life left" value={`${detail.hp.remainingLife} yr`} sub="at 900 h/yr" color={p.textDim} icon="hourglass" />
            </Row>
            <SectionTitle title="Service schedule" icon="build" />
            {detail.hp.items.map((it: any) => (
              <Row key={it.part} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
                <Row gap={8}>
                  <Ionicons name={it.urgent ? 'alert-circle' : 'checkmark-circle'} size={14} color={it.urgent ? p.warn : p.ok} />
                  <T variant="small">{it.part}</T>
                </Row>
                <T variant="micro" color={it.urgent ? p.warn : p.textDim}>due in {it.dueIn} · {inr(it.cost)}</T>
              </Row>
            ))}
            <Divider />
            <SectionTitle title="Book this machine" icon="calendar" />
            <Slider label="Hours needed" value={hours} min={1} max={16} step={1} unit=" h" onChange={setHours} />
            <KV k="Rental" v={inr(detail.e.ratePerHr * hours)} />
            <KV k="Travel surcharge" v={inr(Math.round(detail.e.distanceKm * 18))} />
            <KV k="Escrow total" v={inr(detail.e.ratePerHr * hours + Math.round(detail.e.distanceKm * 18))} color={p.primary} />
            <Btn
              title="Book with escrow"
              icon="lock-closed"
              style={{ marginTop: space.sm }}
              onPress={() => {
                set((d) => ({ ...d, equipment: d.equipment.map((x) => (x.id === detail.e.id ? { ...x, available: false } : x)) }));
                push('equipment_booking', { id: detail.e.id, hours });
                audit({ actor: s.profile.id, action: 'equipment:book', resource: `equipment:${detail.e.id}`, outcome: 'allow', meta: { hours } });
                setDetail(null);
              }}
            />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
