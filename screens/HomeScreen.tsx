import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Bar, Btn, Card, Chip, Divider, Gauge, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, Skeleton, Sparkline, Stat, T } from '../components/ui';
import { radius, space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { activeField, ago, fieldSummary, greeting } from '../lib/derive';
import { makeT } from '../lib/i18n';
import { compareMarkets, inr } from '../lib/price';
import { CROPS } from '../lib/agro';
import { seir } from '../lib/agro';

export default function HomeScreen({ navigation }: any) {
  const { p } = useTheme();
  const { s, set } = useApp();
  const t = makeT(s.profile.lang);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const t0 = setTimeout(() => setLoading(false), 550);
    return () => clearTimeout(t0);
  }, []);

  const f = activeField(s);
  const sum = React.useMemo(() => fieldSummary(f), [f.id, f.depletionMm]);
  const lastQuality = s.scans.filter((x) => x.kind === 'quality')[0];
  const market = React.useMemo(
    () => compareMarkets({ crop: f.crop, qualityScore: lastQuality?.score ?? 74, grade: (lastQuality?.grade as any) ?? 'B', quantityQuintal: 20, vehicleId: 'tempo' }),
    [f.crop, lastQuality?.score],
  );
  const epi = React.useMemo(
    () => seir({ days: 14, beta0: 0.55, sigma: 0.32, gamma: 0.12, initialInfected: 0.02, rh: sum.weather.map((w) => w.rhMean), temp: sum.weather.map((w) => w.tMax), protection: 0.2, tOpt: 18 }),
    [f.id],
  );
  const outbreaksNear = s.outbreaks.filter((o) => Date.now() - o.at < 5 * 86400000);
  const pendingOps = s.outbox.filter((o) => o.status === 'pending').length;

  if (loading) {
    return (
      <Screen>
        <Skeleton h={70} />
        <Skeleton h={190} />
        <Row gap={space.sm}><Skeleton h={92} style={{ flex: 1 }} /><Skeleton h={92} style={{ flex: 1 }} /></Row>
        <Skeleton h={150} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
        <View style={{ flex: 1 }}>
          <T variant="small" color={p.textDim}>{t(greeting())}, {s.profile.name.split(' ')[0]}</T>
          <T variant="h1">{s.profile.village} · {s.fields.length} fields</T>
        </View>
        <Row gap={6}>
          <Pill text={s.settings.airplane ? t('offline') : t('online')} color={s.settings.airplane ? p.warn : p.ok} icon={s.settings.airplane ? 'airplane' : 'cloud-done'} />
          <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={8}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: p.primary + '22', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: p.glassBorder }}>
              <T variant="h3" color={p.primary}>{s.profile.name[0]}</T>
            </View>
          </Pressable>
        </Row>
      </Row>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: space.md }}>
        {s.fields.map((fl) => (
          <Chip key={fl.id} label={`${CROPS[fl.crop].emoji} ${fl.name}`} active={fl.id === s.activeFieldId} onPress={() => set((d) => ({ ...d, activeFieldId: fl.id }))} />
        ))}
        <Chip label="+ Add field" icon="add" onPress={() => navigation.navigate('Twin')} />
      </ScrollView>

      {/* HERO */}
      <Card glow>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T variant="micro" color={p.textDim}>{f.name.toUpperCase()} · {f.areaHa} HA · {f.variety}</T>
            <T variant="h1" style={{ marginTop: 2 }}>{CROPS[f.crop].emoji} {CROPS[f.crop].name}</T>
            <Row gap={6} style={{ marginTop: 6 }} wrap>
              <Pill text={`Day ${sum.das}`} color={p.water} icon="calendar" />
              <Pill text={sum.ph.series[sum.ph.series.length - 1]?.stage ?? 'Emergence'} color={p.accent} icon="leaf" />
              <Pill text={`${(sum.ph.pct * 100).toFixed(0)}% to maturity`} color={p.sun} icon="flame" />
            </Row>
          </View>
          <Gauge value={f.ndvi[f.ndvi.length - 1] * 100} label="NDVI" size={116} color={p.primary} />
        </Row>
        <Divider />
        <T variant="micro" color={p.textDim}>CANOPY VIGOUR · SENTINEL-2 10 M, LAST 10 PASSES</T>
        <Sparkline data={f.ndvi} height={54} color={p.primary} />
        <Row gap={8} style={{ marginTop: space.sm }}>
          <Btn small icon="scan" title="Scan crop" onPress={() => navigation.navigate('Tabs', { screen: 'Scan' })} style={{ flex: 1 }} />
          <Btn small kind="ghost" icon="water" title="Irrigation" onPress={() => navigation.navigate('Irrigation')} style={{ flex: 1 }} />
        </Row>
      </Card>

      {/* TODAY */}
      <SectionTitle title="Today's decisions" icon="today" />
      <Card onPress={() => navigation.navigate('Irrigation')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={10} style={{ flex: 1 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: (sum.irr.irrigateNow ? p.water : p.ok) + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={sum.irr.irrigateNow ? 'water' : 'checkmark-done'} size={19} color={sum.irr.irrigateNow ? p.water : p.ok} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="h3">{sum.irr.irrigateNow ? `Irrigate ${sum.irr.grossDepthMm} mm today` : 'No irrigation needed today'}</T>
              <T variant="small" color={p.textDim} numberOfLines={2}>{sum.irr.reason}</T>
            </View>
          </Row>
          <Ionicons name="chevron-forward" size={18} color={p.textFaint} />
        </Row>
        <Row gap={space.sm} style={{ marginTop: space.md }}>
          <Stat label="ET₀" value={`${sum.irr.et0}`} sub="mm/day FAO-56" icon="sunny" color={p.sun} />
          <Stat label="ETc" value={`${sum.irr.etc}`} sub={`Kc ${sum.irr.kc} · ${sum.irr.stage}`} icon="leaf" color={p.primary} />
          <Stat label="Depletion" value={`${sum.irr.depletionPct}%`} sub={`${sum.irr.depletion} of ${sum.irr.taw} mm TAW`} icon="speedometer" color={sum.irr.depletionPct > 60 ? p.warn : p.textDim} />
        </Row>
      </Card>

      <Card onPress={() => navigation.navigate('Tabs', { screen: 'Market' })}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={10} style={{ flex: 1 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: p.accent + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="trending-up" size={19} color={p.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="h3">Best net outlet: {market[0].mandi.name}</T>
              <T variant="small" color={p.textDim}>{inr(market[0].netPerQ)}/quintal net · after ₹{market[0].transport.toLocaleString('en-IN')} transport, {market[0].lossPct}% transit loss</T>
            </View>
          </Row>
          <Ionicons name="chevron-forward" size={18} color={p.textFaint} />
        </Row>
        <Banner kind="info" icon="sparkles" text="AI estimate from a price RANGE — never a guaranteed price. Ranking is by NET value (revenue − transport − commission − loss)." />
      </Card>

      <Card onPress={() => navigation.navigate('Outbreak')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={10} style={{ flex: 1 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: p.danger + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="pulse" size={19} color={p.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="h3">{outbreaksNear.length} outbreak reports within 5 km</T>
              <T variant="small" color={p.textDim}>SEIR peak in {epi.peakDay} days if unprotected · R₀ {epi.r0}</T>
            </View>
          </Row>
          <Ionicons name="chevron-forward" size={18} color={p.textFaint} />
        </Row>
        <Bar value={epi.peakInfected} max={1} color={p.danger} label={`Modelled peak infected tissue ${(epi.peakInfected * 100).toFixed(0)}%`} />
      </Card>

      {/* WEATHER */}
      <SectionTitle title="Village weather mesh" icon="partly-sunny" right={<Pressable onPress={() => navigation.navigate('Mesh')}><T variant="micro" color={p.primary}>KALMAN DETAIL →</T></Pressable>} />
      <Card>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {sum.weather.slice(0, 7).map((w, i) => (
            <View key={w.date} style={{ alignItems: 'center', backgroundColor: p.surface, borderRadius: radius.md, padding: 10, minWidth: 74, borderWidth: 1, borderColor: p.glassBorder }}>
              <T variant="micro" color={p.textDim}>{i === 0 ? 'TODAY' : new Date(w.date).toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase()}</T>
              <Ionicons name={w.rainMm > 8 ? 'rainy' : w.rainMm > 0 ? 'cloudy' : 'sunny'} size={22} color={w.rainMm > 8 ? p.water : w.rainMm > 0 ? p.textDim : p.sun} style={{ marginVertical: 6 }} />
              <T variant="small">{w.tMax}°</T>
              <T variant="micro" color={p.textFaint}>{w.tMin}° · {w.rainMm}mm</T>
            </View>
          ))}
        </ScrollView>
        {sum.risk.disease.length ? (
          <Banner kind="warn" icon="thunderstorm" text={`${sum.risk.disease.length} high infection-pressure days ahead. ${sum.risk.disease[0].note}`} />
        ) : null}
      </Card>

      {/* SYNC */}
      <SectionTitle title="Offline queue" icon="git-network" />
      <Card onPress={() => navigation.navigate('Mesh')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T variant="h3">{pendingOps} operations waiting</T>
            <T variant="small" color={p.textDim}>{s.peers.length} mesh peers seen · nearest {Math.min(...s.peers.map((x) => x.distanceM))} m · {ago(Math.max(...s.peers.map((x) => x.lastSeen)))}</T>
          </View>
          <Ionicons name="chevron-forward" size={18} color={p.textFaint} />
        </Row>
      </Card>

      <SectionTitle title="Jump to" icon="apps" />
      <Row gap={space.sm} wrap>
        {[
          { icon: 'chatbubbles', label: 'Agronomist', to: 'Advisor', c: p.primary },
          { icon: 'qr-code', label: 'Passport', to: 'Passport', c: p.accent },
          { icon: 'wallet', label: 'FarmScore', to: 'Finance', c: p.sun },
          { icon: 'shield-checkmark', label: 'Security', to: 'Security', c: p.water },
        ].map((q) => (
          <Card key={q.to} onPress={() => navigation.navigate(q.to)} style={{ width: '47.6%', alignItems: 'center', paddingVertical: space.lg }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: q.c + '1F', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <Ionicons name={q.icon as any} size={21} color={q.c} />
            </View>
            <T variant="small">{q.label}</T>
          </Card>
        ))}
      </Row>

      <Card>
        <KV k="Data residency" v="100% on-device (SQLCipher AES-256)" />
        <KV k="Model bundle" v="7.4 MB INT8 · disease + quality" />
        <KV k="Last audit block" v={s.audit.length ? `#${s.audit.length - 1} · ${s.audit[s.audit.length - 1].hash.slice(0, 10)}…` : 'genesis'} />
      </Card>
    </Screen>
  );
}
