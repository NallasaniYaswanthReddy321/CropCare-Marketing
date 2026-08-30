import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Bar, Btn, Card, Divider, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, Stat, T } from '../components/ui';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { gValue, gInc } from '../lib/mesh';
import { haversine } from '../lib/security';
import { activeField, ago } from '../lib/derive';
import { inr } from '../lib/price';
import { OverflowMenu } from '../components/Menu';
import { useRealtime } from '../lib/rtcontext';
import { getFix } from '../lib/geo';
import { uid } from '../lib/crypto';

export default function OutbreakScreen({ navigation }: any) {
  const { p } = useTheme();
  const { s, set, push, audit } = useApp();
  const rt = useRealtime();
  const f = activeField(s);
  const [fix, setFix] = React.useState<{ lat: number; lon: number; km: number; district: string } | null>(null);
  const [geoNote, setGeoNote] = React.useState<string | null>(null);

  const locate = async () => {
    setGeoNote('Reading GPS…');
    const r = await getFix();
    if (!r.ok) { setGeoNote(r.reason); return; }
    setFix({ lat: r.fix.lat, lon: r.fix.lon, km: r.fix.km, district: r.fix.place.d });
    setGeoNote(`You are ${r.fix.km} km from ${r.fix.place.d}, ${r.fix.place.s}. Distances below are measured from this fix.`);
    set((d) => ({
      ...d,
      geo: { lat: r.fix.lat, lon: r.fix.lon, district: r.fix.place.d, state: r.fix.place.s, zone: r.fix.place.z, soil: r.fix.place.soil, rain: r.fix.place.rain, source: 'gps', accuracy: r.fix.accuracy, at: Date.now() },
    }));
  };

  const reportHere = () => {
    const origin = fix ?? { lat: f.lat, lon: f.lon };
    const rep = { id: uid('ob'), disease: s.scans[0]?.title ?? 'Unconfirmed sighting', lat: origin.lat, lon: origin.lon, at: Date.now(), severity: 0.5, village: s.profile.village || 'my village', confirmed: false };
    set((d) => ({ ...d, outbreaks: [rep, ...d.outbreaks], swarmCounter: gInc(d.swarmCounter, 'node_self') }));
    push('outbreak_report', rep);
    rt.publish('outbreak.alert', { disease: rep.disease, village: rep.village, severity: rep.severity, lat: rep.lat, lon: rep.lon });
    audit({ actor: s.profile.id, action: 'outbreak:report', resource: 'village', outcome: 'allow' });
  };

  const reports = s.outbreaks.map((o) => ({
    ...o,
    distanceKm: haversine(f.lat, f.lon, o.lat, o.lon),
    bearing: Math.atan2(o.lon - f.lon, o.lat - f.lat),
  }));
  const within5 = reports.filter((r) => r.distanceKm <= 5);
  const byDisease = Array.from(
    reports.reduce((m, r) => m.set(r.disease, [...(m.get(r.disease) || []), r]), new Map<string, typeof reports>()).entries(),
  ).sort((a, b) => b[1].length - a[1].length);

  const swarmTotal = gValue(s.swarmCounter);
  const nearest = reports.slice().sort((a, b) => a.distanceKm - b.distanceKm)[0];
  const windDays = 2.5; // typical spore front speed in the mesh record
  const eta = nearest ? Math.max(0.5, nearest.distanceKm / windDays) : 0;

  const commit = (poolId: string, qty: number) => {
    set((d) => ({
      ...d,
      buyingPool: d.buyingPool.map((b) =>
        b.id === poolId ? { ...b, committed: [...b.committed.filter((c) => c.member !== d.profile.name), { member: d.profile.name, qty }] } : b,
      ),
    }));
    push('buying_commit', { poolId, qty });
    audit({ actor: s.profile.id, action: 'buying:commit', resource: `pool:${poolId}`, outcome: 'allow', meta: { qty } });
  };

  return (
    <Screen>
      <ScreenHeader
        title="Disease Watch"
        sub="Warnings from farms around you, updated as neighbours scan"
        icon="warning"
        right={
          <Row gap={6}>
            <Pill text={`${swarmTotal} REPORTS`} color={p.danger} icon="pulse" />
            <OverflowMenu
              items={[
                { icon: 'navigate', label: 'Use my location', hint: 'Recentre the map on your GPS position', onPress: locate, tone: 'primary' },
                { icon: 'megaphone', label: 'Report what I see', hint: 'Warn the village in one tap', onPress: reportHere },
                { icon: 'camera', label: 'Scan my crop first', onPress: () => navigation.navigate('Tabs', { screen: 'Scan' }) },
                { icon: 'pulse', label: 'Open live stream', onPress: () => navigation.navigate('Live') },
                { icon: 'git-network', label: 'Mesh sync', onPress: () => navigation.navigate('Mesh') },
              ]}
            />
          </Row>
        }
      />

      {geoNote ? <Banner kind={fix ? 'ok' : 'warn'} icon="location" text={geoNote} /> : null}

      <Card pad={space.md}>
        <Radar reports={reports} />
        <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
          <T variant="micro" color={p.textDim}>{within5.length} REPORTS WITHIN 5 KM · CENTRE = YOUR FIELD</T>
          <T variant="micro" color={p.textFaint}>RINGS AT 2 / 5 / 10 KM</T>
        </Row>
      </Card>

      {nearest ? (
        <Banner
          kind={nearest.distanceKm < 3 ? 'danger' : 'warn'}
          icon="warning"
          text={`${nearest.disease} confirmed ${nearest.distanceKm.toFixed(1)} km away in ${nearest.village} (${ago(nearest.at)}). At the observed front speed of ${windDays} km/day, spores reach your boundary in about ${eta.toFixed(1)} day(s). Protect the upwind edge first.`}
        />
      ) : null}

      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <Stat label="Within 5 km" value={`${within5.length}`} sub="active reports" color={p.danger} icon="location" />
        <Stat label="Confirmed" value={`${reports.filter((r) => r.confirmed).length}`} sub="peer-verified scans" color={p.warn} icon="checkmark-done" />
        <Stat label="Mesh nodes" value={`${Object.keys(s.swarmCounter).length}`} sub="G-Counter replicas" color={p.water} icon="git-network" />
      </Row>

      <SectionTitle title="Outbreak clusters" icon="bug" />
      {byDisease.map(([disease, list]) => (
        <Card key={disease}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T variant="h3">{disease}</T>
              <T variant="micro" color={p.textDim}>{list.length} reports · nearest {Math.min(...list.map((l) => l.distanceKm)).toFixed(1)} km · villages: {Array.from(new Set(list.map((l) => l.village))).join(', ')}</T>
            </View>
            <T variant="h3" color={p.danger}>{(Math.max(...list.map((l) => l.severity)) * 100).toFixed(0)}%</T>
          </Row>
          <Bar value={Math.max(...list.map((l) => l.severity))} color={p.danger} height={6} />
          <Row gap={space.sm} style={{ marginTop: space.sm }}>
            <Btn small kind="soft" icon="shield" title="Protect my field" style={{ flex: 1 }} onPress={() => navigation.navigate('Twin')} />
            <Btn small kind="ghost" icon="megaphone" title="Confirm sighting" style={{ flex: 1 }} onPress={() => { set((d) => ({ ...d, swarmCounter: gInc(d.swarmCounter, 'node_self') })); push('outbreak_confirm', { disease }); }} />
          </Row>
        </Card>
      ))}

      <SectionTitle title="Collective buying" icon="cart" />
      {s.buyingPool.map((pool) => {
        const committed = pool.committed.reduce((a, c) => a + c.qty, 0);
        const pct = committed / pool.targetQty;
        const mine = pool.committed.find((c) => c.member === s.profile.name)?.qty ?? 0;
        return (
          <Card key={pool.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T variant="h3">{pool.item}</T>
                <T variant="micro" color={p.textDim}>{committed} of {pool.targetQty} units committed by {pool.committed.length} farmers</T>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <T variant="h3" color={p.ok}>{inr(pool.bulkPrice)}</T>
                <T variant="micro" color={p.textFaint} style={{ textDecorationLine: 'line-through' }}>{inr(pool.unitPrice)}</T>
              </View>
            </Row>
            <Bar value={pct} color={pct >= 1 ? p.ok : p.accent} height={8} />
            <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <T variant="micro" color={p.textFaint}>{(pct * 100).toFixed(0)}% of pool</T>
              <T variant="micro" color={p.ok}>saves {inr((pool.unitPrice - pool.bulkPrice) * Math.max(1, mine))} on your {mine || 1} unit(s)</T>
            </Row>
            <Row gap={space.sm} style={{ marginTop: space.sm }}>
              <Btn small kind="soft" title="Commit 2" icon="add" style={{ flex: 1 }} onPress={() => commit(pool.id, mine + 2)} />
              <Btn small kind="soft" title="Commit 5" icon="add-circle" style={{ flex: 1 }} onPress={() => commit(pool.id, mine + 5)} />
              {mine ? <Btn small kind="ghost" title="Withdraw" icon="remove" style={{ flex: 1 }} onPress={() => commit(pool.id, 0)} /> : null}
            </Row>
          </Card>
        );
      })}

      <Card>
        <SectionTitle title="How the swarm stays honest" icon="shield-checkmark" />
        <KV k="Counter type" v="G-Counter CRDT — merges by max per replica, never double-counts" />
        <KV k="Spoof resistance" v="pHash duplicate check + GPS velocity + capture freshness" />
        <KV k="Privacy" v="Reports carry a 500 m geohash, never your exact plot" />
        <KV k="Escalation" v="3 confirmations within 3 km triggers a village-wide push over the mesh" />
      </Card>
    </Screen>
  );
}

function Radar({ reports }: { reports: { distanceKm: number; bearing: number; severity: number; disease: string; confirmed: boolean }[] }) {
  const { p } = useTheme();
  const [w, setW] = React.useState(300);
  const size = w;
  const cx = size / 2, cy = size / 2;
  const maxKm = 10;
  const r = (km: number) => (Math.min(km, maxKm) / maxKm) * (size / 2 - 18);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width="100%" height={size}>
        <G>
          {[2, 5, 10].map((km) => (
            <G key={km}>
              <Circle cx={cx} cy={cy} r={r(km)} stroke={p.glassBorder} strokeWidth={1} fill="none" />
              <SvgText x={cx + 4} y={cy - r(km) + 12} fontSize={9} fill={p.textFaint}>{km} km</SvgText>
            </G>
          ))}
          <Line x1={cx} y1={12} x2={cx} y2={size - 12} stroke={p.glassBorder} strokeWidth={0.6} />
          <Line x1={12} y1={cy} x2={size - 12} y2={cy} stroke={p.glassBorder} strokeWidth={0.6} />
          {reports.map((rep, i) => {
            const x = cx + Math.sin(rep.bearing) * r(rep.distanceKm);
            const y = cy - Math.cos(rep.bearing) * r(rep.distanceKm);
            const col = rep.severity > 0.6 ? '#FF6B6B' : rep.severity > 0.4 ? '#FFB347' : '#FFD966';
            return (
              <G key={i}>
                <Circle cx={x} cy={y} r={12 + rep.severity * 10} fill={col} opacity={0.16} />
                <Circle cx={x} cy={y} r={5 + rep.severity * 4} fill={col} opacity={0.9} />
                {rep.confirmed ? <Circle cx={x} cy={y} r={9 + rep.severity * 5} stroke={col} strokeWidth={1.4} fill="none" /> : null}
              </G>
            );
          })}
          <Circle cx={cx} cy={cy} r={7} fill={p.primary} />
          <Circle cx={cx} cy={cy} r={14} stroke={p.primary} strokeWidth={1.5} fill="none" opacity={0.6} />
        </G>
      </Svg>
    </View>
  );
}
