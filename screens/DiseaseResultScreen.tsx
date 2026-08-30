import React from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AnswerCard, Banner, Bar, Btn, Card, Divider, HeatMap, KV, MultiLine, Pill, Row, Screen, SectionTitle, T } from '../components/ui';
import { TILE } from '../lib/images';
import { speak } from '../lib/voice';
import { voiceLocale } from '../lib/i18n';
import { radius, space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { CROPS, seir } from '../lib/agro';
import { activeField, fieldWeather } from '../lib/derive';
import type { DiseaseResult } from '../lib/vision';
import { uid } from '../lib/crypto';

export default function DiseaseResultScreen({ route, navigation }: any) {
  const { p } = useTheme();
  const { s, set, push, audit } = useApp();
  const scan = s.scans.find((x) => x.id === route.params?.scanId) ?? s.scans.find((x) => x.kind === 'disease');
  const [showHeat, setShowHeat] = React.useState(true);
  const [protection, setProtection] = React.useState(0);
  const f = activeField(s);

  if (!scan) {
    return <Screen><Card><T>No scan found.</T><Btn title="Scan a leaf" onPress={() => navigation.navigate('Tabs', { screen: 'Scan' })} style={{ marginTop: 12 }} /></Card></Screen>;
  }
  const d: DiseaseResult & { spoof?: any } = scan.detail;
  const weather = React.useMemo(() => fieldWeather(f, 21), [f.id]);
  const sev = d.top.score;

  const runs = React.useMemo(() => {
    const base = { days: 21, beta0: 0.5 + sev * 0.35, sigma: 0.33, gamma: 0.11, initialInfected: Math.max(0.01, sev * 0.06), rh: weather.map((w) => w.rhMean), temp: weather.map((w) => w.tMax) };
    return {
      none: seir({ ...base, protection: 0 }),
      today: seir({ ...base, protection: 0.72 }),
      late: seir({ ...base, protection: 0.72 * 0.45 }),
    };
  }, [scan.id, sev]);

  const lossNone = runs.none.finalLoss, lossToday = runs.today.finalLoss, lossLate = runs.late.finalLoss;
  const spraySoon = weather.slice(0, 5).map((w, i) => ({ i, w, ok: w.rainMm < 2 && w.windMs < 4.5 }));
  const firstGood = spraySoon.find((x) => x.ok);

  const plain = `${d.top.name}, about ${(d.top.score * 100).toFixed(0)} percent sure. ${d.top.action} Cheapest option first: ${d.top.organic}`;

  return (
    <Screen>
      <AnswerCard
        tone={d.top.severity === 'high' ? 'danger' : d.top.severity === 'medium' ? 'warn' : 'ok'}
        headline={`${d.top.name} · ${(d.top.score * 100).toFixed(0)}% likely`}
        detail={`${d.top.action} Start with the cheap option: ${d.top.organic}`}
        image={TILE.doctor}
        onSpeak={() => speak(plain, voiceLocale(s.profile.lang))}
      />

      <Card pad={space.md}>
        <View style={{ aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden' }}>
          {scan.uri ? <Image source={{ uri: scan.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
          {showHeat ? <HeatFill grid={d.heat} /> : null}
          <View style={{ position: 'absolute', top: 10, left: 10 }}>
            <Pill text={`${d.top.name.toUpperCase()} · ${(d.top.score * 100).toFixed(0)}%`} color={d.top.severity === 'high' ? p.danger : d.top.severity === 'medium' ? p.warn : p.ok} icon="bug" />
          </View>
          <Pressable onPress={() => setShowHeat((v) => !v)} style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#000A', borderRadius: 18, padding: 8 }}>
            <Ionicons name={showHeat ? 'eye-off' : 'eye'} size={16} color="#fff" />
          </Pressable>
        </View>
        <Row style={{ marginTop: space.sm, justifyContent: 'space-between' }}>
          <T variant="micro" color={p.textDim}>GRAD-CAM ACTIVATION · {d.modelSize}</T>
          <T variant="micro" color={p.textFaint}>{d.msInference} ms · leaf {Math.round(d.leafFraction * 100)}% of frame</T>
        </Row>
      </Card>

      <Banner kind={d.msInference < 2000 ? 'ok' : 'warn'} icon="hardware-chip" text={`${d.note} Inference finished in ${(d.msInference / 1000).toFixed(2)} s (target < 2 s).`} />

      {d.spoof?.flags?.length ? <Banner kind="danger" icon="warning" text={`Anti-fraud: ${d.spoof.flags.join(' · ')}`} /> : null}

      <SectionTitle title="Multi-label findings" icon="list" />
      <Card>
        {d.labels.map((l) => (
          <View key={l.id} style={{ marginBottom: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T variant="h3">{l.name}</T>
                <T variant="micro" color={p.textFaint}>{l.local} · {l.evidence}</T>
              </View>
              <T variant="h3" color={l.score > 0.66 ? p.danger : l.score > 0.4 ? p.warn : p.textDim}>{(l.score * 100).toFixed(0)}%</T>
            </Row>
            <Bar value={l.score} color={l.score > 0.66 ? p.danger : l.score > 0.4 ? p.warn : p.textFaint} height={5} />
          </View>
        ))}
        <Divider />
        <KV k="Healthy-tissue confidence" v={`${(d.healthyScore * 100).toFixed(0)}%`} color={d.healthyScore > 0.6 ? p.ok : p.warn} />
      </Card>

      <SectionTitle title={`Treatment — ${d.top.name}`} icon="medkit" />
      <Card>
        <Row gap={8} style={{ alignItems: 'flex-start', marginBottom: space.sm }}>
          <Ionicons name="alert-circle" size={15} color={p.warn} style={{ marginTop: 2 }} />
          <T variant="small" style={{ flex: 1 }}>{d.top.action}</T>
        </Row>
        <Card pad={space.md} style={{ backgroundColor: p.ok + '14', borderColor: p.ok + '44' }}>
          <Row gap={6}><Ionicons name="leaf" size={14} color={p.ok} /><T variant="small" color={p.ok}>ORGANIC FIRST</T></Row>
          <T variant="small" style={{ marginTop: 4 }}>{d.top.organic}</T>
        </Card>
        <Card pad={space.md} style={{ backgroundColor: p.warn + '12', borderColor: p.warn + '44', marginBottom: 0 }}>
          <Row gap={6}><Ionicons name="flask" size={14} color={p.warn} /><T variant="small" color={p.warn}>CHEMICAL OPTION</T></Row>
          <T variant="small" style={{ marginTop: 4 }}>{d.top.chemical}</T>
          <T variant="micro" color={p.textFaint} style={{ marginTop: 4 }}>Observe the pre-harvest interval on the label. Log the application in your Farm Passport for traceability.</T>
        </Card>
      </Card>

      <SectionTitle title="Spread simulation (SEIR)" icon="analytics" />
      <Card>
        <MultiLine
          height={150}
          series={[
            { data: runs.none.series.map((x) => x.I * 100), color: p.danger, name: 'No action' },
            { data: runs.late.series.map((x) => x.I * 100), color: p.warn, name: 'Spray in 4 days' },
            { data: runs.today.series.map((x) => x.I * 100), color: p.ok, name: 'Spray today' },
          ]}
          labels={['today', 'day 7', 'day 14', 'day 21']}
        />
        <Divider />
        <KV k="Basic reproduction number R₀" v={`${runs.none.r0}`} color={runs.none.r0 > 1 ? p.danger : p.ok} />
        <KV k="Epidemic peak if untreated" v={`day ${runs.none.peakDay} · ${(runs.none.peakInfected * 100).toFixed(0)}% tissue infected`} />
        <KV k="Tissue lost — no action" v={`${(lossNone * 100).toFixed(0)}%`} color={p.danger} />
        <KV k="Tissue lost — spray today" v={`${(lossToday * 100).toFixed(0)}%`} color={p.ok} />
        <KV k="Tissue lost — spray in 4 days" v={`${(lossLate * 100).toFixed(0)}%`} color={p.warn} />
        <Banner
          kind="info"
          icon="calculator"
          text={`Acting today instead of in four days protects about ${((lossLate - lossToday) * 100).toFixed(0)}% of canopy on ${f.areaHa} ha — roughly ₹${Math.round((lossLate - lossToday) * f.areaHa * CROPS[scan.crop].refPrice * 12).toLocaleString('en-IN')} of crop value at current price estimates.`}
        />
      </Card>

      <SectionTitle title="Spray window" icon="rainy" />
      <Card>
        {spraySoon.map((x) => (
          <Row key={x.i} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
            <Row gap={8}>
              <Ionicons name={x.ok ? 'checkmark-circle' : 'close-circle'} size={15} color={x.ok ? p.ok : p.danger} />
              <T variant="small">{x.i === 0 ? 'Today' : new Date(x.w.date).toLocaleDateString('en-IN', { weekday: 'long' })}</T>
            </Row>
            <T variant="micro" color={p.textDim}>{x.w.rainMm} mm rain · {x.w.windMs} m/s wind · {x.w.tMax}°C</T>
          </Row>
        ))}
        <Divider />
        <T variant="small" color={p.textDim}>
          {firstGood ? `Best window: ${firstGood.i === 0 ? 'today' : new Date(firstGood.w.date).toLocaleDateString('en-IN', { weekday: 'long' })} — dry and low wind, so droplets stay on the leaf.` : 'No dry low-wind window in the next 5 days — use a rain-fast formulation or wait for the front to pass.'}
        </T>
      </Card>

      <Row gap={space.sm} style={{ marginBottom: space.xl }}>
        <Btn
          title="Report to village"
          icon="megaphone"
          style={{ flex: 1 }}
          onPress={() => {
            set((prev) => ({
              ...prev,
              outbreaks: [{ id: uid('ob'), disease: d.top.name, lat: f.lat, lon: f.lon, at: Date.now(), severity: d.top.score, village: prev.profile.village, confirmed: false }, ...prev.outbreaks],
              swarmCounter: { ...prev.swarmCounter, node_self: (prev.swarmCounter.node_self || 0) + 1 },
            }));
            push('outbreak_report', { disease: d.top.id, lat: f.lat, lon: f.lon, severity: d.top.score });
            audit({ actor: s.profile.id, action: 'scouting:report', resource: `field:${f.id}`, outcome: 'allow' });
            navigation.navigate('Outbreak');
          }}
        />
        <Btn title="AR spray check" kind="ghost" icon="scan-circle" style={{ flex: 1 }} onPress={() => navigation.navigate('ARSpray')} />
      </Row>
    </Screen>
  );
}

function HeatFill({ grid }: { grid: number[][] }) {
  const [size, setSize] = React.useState(300);
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onLayout={(e) => setSize(e.nativeEvent.layout.width)}>
      <HeatMap grid={grid} size={size} opacity={0.5} />
    </View>
  );
}
