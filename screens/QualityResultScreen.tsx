import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AnswerCard, Banner, Bar, Btn, Card, Chip, Divider, Gauge, HeatMap, KV, Pill, Row, Screen, SectionTitle, Sheet, Slider, T, gradeColor } from '../components/ui';
import { radius, space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { CROPS } from '../lib/agro';
import { MODEL_META, VEHICLES, compareMarkets, inr, priceRange, sellSimulator } from '../lib/price';
import type { QualityResult } from '../lib/vision';
import { CROP_IMG } from '../lib/images';
import { speak } from '../lib/voice';
import { voiceLocale } from '../lib/i18n';

export default function QualityResultScreen({ route, navigation }: any) {
  const { p } = useTheme();
  const { s, push, audit } = useApp();
  const scan = s.scans.find((x) => x.id === route.params?.scanId) ?? s.scans.find((x) => x.kind === 'quality');
  const [qty, setQty] = React.useState(20);
  const [vehicle, setVehicle] = React.useState('tempo');
  const [cooling, setCooling] = React.useState(false);
  const [showHeat, setShowHeat] = React.useState(true);
  const [drivers, setDrivers] = React.useState(false);

  if (!scan) {
    return (
      <Screen>
        <Card><T>No scan found. Grade a photo first.</T><Btn title="Go to Scan" onPress={() => navigation.navigate('Tabs', { screen: 'Scan' })} style={{ marginTop: 12 }} /></Card>
      </Screen>
    );
  }
  const q: QualityResult = scan.detail;
  const spec = CROPS[scan.crop];
  const gc = gradeColor(p, q.grade);

  const pr = React.useMemo(() => priceRange({ crop: scan.crop, qualityScore: q.score, grade: q.grade, quantityQuintal: qty }), [scan.id, qty]);
  const markets = React.useMemo(() => compareMarkets({ crop: scan.crop, qualityScore: q.score, grade: q.grade, quantityQuintal: qty, vehicleId: vehicle, hasCooling: cooling }), [scan.id, qty, vehicle, cooling]);
  const sim = React.useMemo(() => sellSimulator({ crop: scan.crop, qualityScore: q.score, grade: q.grade, quantityQuintal: qty, bestNetNow: markets[0].net, coldStorage: cooling, seed: scan.id }), [scan.id, qty, cooling, markets[0].net]);

  const plain = `Your ${spec.name.toLowerCase()} is grade ${q.grade}, ${q.score} out of 100. Expect about ${inr(pr.low)} to ${inr(pr.high)} per quintal. Best market is ${markets[0].mandi.name}, roughly ${inr(markets[0].net)} in hand for ${qty} quintal. This is an estimate, not a fixed price.`;

  return (
    <Screen>
      {/* ONE-LINE ANSWER FOR THE FARMER */}
      <AnswerCard
        tone={q.grade === 'A' ? 'ok' : q.grade === 'B' ? 'info' : 'warn'}
        headline={`Grade ${q.grade} · about ${inr(pr.mid)} per quintal`}
        detail={`${spec.name} scored ${q.score}/100. Sell at ${markets[0].mandi.name} to keep about ${inr(markets[0].net)} for ${qty} quintal after transport and spoilage. Price is a range, not a promise.`}
        image={CROP_IMG[scan.crop]}
        onSpeak={() => speak(plain, voiceLocale(s.profile.lang))}
      />

      {/* PHOTO + GRADE */}
      <Card pad={space.md}>
        <View style={{ aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden' }}>
          {scan.uri ? <Image source={{ uri: scan.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
          {showHeat ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
              <HeatGridFill grid={q.heat} />
            </View>
          ) : null}
          <View style={{ position: 'absolute', top: 10, left: 10 }}>
            <Pill text={`GRADE ${q.grade} · ${q.score}/100`} color={gc} icon="ribbon" />
          </View>
          <Pressable onPress={() => setShowHeat((v) => !v)} style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#000A', borderRadius: 18, padding: 8 }}>
            <Ionicons name={showHeat ? 'eye-off' : 'eye'} size={16} color="#fff" />
          </Pressable>
        </View>
        <Row style={{ marginTop: space.sm, justifyContent: 'space-between' }}>
          <T variant="micro" color={p.textDim}>DEFECT ACTIVATION MAP · {q.heat.length}×{q.heat.length} CELLS</T>
          <T variant="micro" color={p.textFaint}>{q.msVision} ms on device</T>
        </Row>
      </Card>

      <Row gap={space.md} style={{ marginBottom: space.md }}>
        <Card style={{ flex: 1, marginBottom: 0, alignItems: 'center' }}>
          <Gauge value={q.score} label="QUALITY" color={gc} size={132} />
          <T variant="small" color={p.textDim} center>{spec.emoji} {spec.name} · {q.ripenessPct}% ripe hue</T>
        </Card>
        <View style={{ flex: 1, gap: space.sm }}>
          <Card pad={space.md} style={{ marginBottom: 0 }}>
            <T variant="micro" color={p.textDim}>DEFECT LOAD</T>
            <T variant="h2" color={q.defectPct > 8 ? p.warn : p.ok}>{q.defectPct}%</T>
          </Card>
          <Card pad={space.md} style={{ marginBottom: 0 }}>
            <T variant="micro" color={p.textDim}>UNIFORMITY</T>
            <T variant="h2" color={p.text}>{(q.uniformity * 100).toFixed(0)}%</T>
          </Card>
          <Card pad={space.md} style={{ marginBottom: 0 }}>
            <T variant="micro" color={p.textDim}>DAMAGE INDEX</T>
            <T variant="h2" color={q.damagePct > 12 ? p.warn : p.ok}>{q.damagePct}%</T>
          </Card>
        </View>
      </Row>

      {/* EXPLANATION */}
      <SectionTitle title="Why this grade" icon="information-circle" />
      <Card>
        {q.subs.map((sub) => (
          <View key={sub.key} style={{ marginBottom: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="small">{sub.label}</T>
              <T variant="small" color={sub.score >= 75 ? p.ok : sub.score >= 55 ? p.warn : p.danger}>{sub.score}/100 · w{(sub.weight * 100).toFixed(0)}%</T>
            </Row>
            <Bar value={sub.score} max={100} color={sub.score >= 75 ? p.ok : sub.score >= 55 ? p.warn : p.danger} height={6} />
            <T variant="micro" color={p.textFaint} style={{ marginTop: 4 }}>{sub.detail}</T>
          </View>
        ))}
        <Divider />
        {q.explanation.map((e, i) => (
          <Row key={i} gap={8} style={{ alignItems: 'flex-start', marginBottom: 6 }}>
            <Ionicons name="chevron-forward-circle" size={14} color={p.primary} style={{ marginTop: 3 }} />
            <T variant="small" style={{ flex: 1, lineHeight: 20 }}>{e}</T>
          </Row>
        ))}
        <Banner kind="warn" icon="alert-circle" text={q.caveat} />
      </Card>

      {/* CAPTURE COACHING */}
      <SectionTitle title="Capture coaching" icon="camera" />
      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
          <T variant="small" color={p.textDim}>Photo quality score</T>
          <T variant="h3" color={q.coaching.score > 70 ? p.ok : p.warn}>{q.coaching.score}/100</T>
        </Row>
        {q.coaching.tips.map((tip, i) => (
          <Row key={i} gap={8} style={{ marginBottom: 6, alignItems: 'flex-start' }}>
            <Ionicons name={tip.icon as any} size={14} color={tip.level === 'ok' ? p.ok : tip.level === 'warn' ? p.warn : p.danger} style={{ marginTop: 2 }} />
            <T variant="small" color={p.textDim} style={{ flex: 1 }}>{tip.text}</T>
          </Row>
        ))}
      </Card>

      {/* PRICE RANGE */}
      <SectionTitle title="Price range (AI estimate)" icon="pricetag" right={<Pressable onPress={() => setDrivers(true)}><T variant="micro" color={p.primary}>DRIVERS →</T></Pressable>} />
      <Card glow>
        <Slider label="Quantity to sell" value={qty} min={1} max={200} step={1} unit=" q" onChange={setQty} />
        <View style={{ alignItems: 'center', marginVertical: space.sm }}>
          <T variant="micro" color={p.textDim}>80% PREDICTION INTERVAL · ₹/QUINTAL</T>
          <Row gap={10} style={{ marginTop: 6, alignItems: 'flex-end' }}>
            <T variant="h3" color={p.textDim}>{inr(pr.low)}</T>
            <T variant="h1" color={p.primary} style={{ fontSize: 34 }}>{inr(pr.mid)}</T>
            <T variant="h3" color={p.textDim}>{inr(pr.high)}</T>
          </Row>
          <View style={{ width: '100%', height: 10, backgroundColor: p.surfaceStrong, borderRadius: 6, marginTop: 12, overflow: 'hidden' }}>
            <View style={{ position: 'absolute', left: '12%', right: '12%', top: 0, bottom: 0, backgroundColor: p.primary + '55' }} />
            <View style={{ position: 'absolute', left: '49%', top: -3, width: 3, height: 16, backgroundColor: p.primary }} />
          </View>
          <T variant="micro" color={p.textFaint} style={{ marginTop: 8 }}>MODEL {MODEL_META.name} v{MODEL_META.version} · R² {MODEL_META.r2} · MAPE {(MODEL_META.mape * 100).toFixed(1)}% · CONFIDENCE {pr.confidence}%</T>
        </View>
        <Divider />
        <KV k={`Gross value (${qty} q)`} v={`${inr(pr.grossLow)} – ${inr(pr.grossHigh)}`} />
        <KV k="Most likely gross" v={inr(pr.grossMid)} color={p.primary} />
        <Banner kind="warn" icon="alert-circle" text={pr.disclaimer} />
      </Card>

      {/* MARKET COMPARISON */}
      <SectionTitle title="Markets ranked by NET value" icon="git-compare" />
      <Card pad={space.md}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: space.sm }}>
          {VEHICLES.map((v) => <Chip key={v.id} label={v.name} active={vehicle === v.id} onPress={() => setVehicle(v.id)} />)}
          <Chip label="Cold chain" icon="snow" active={cooling} onPress={() => setCooling((c) => !c)} color={p.water} />
        </ScrollView>
      </Card>
      {markets.map((m) => (
        <Card key={m.mandi.id} glow={m.rank === 1}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Row gap={6}>
                <T variant="h3">{m.rank}. {m.mandi.name}</T>
                {m.rank === 1 ? <Pill text="BEST NET" color={p.primary} icon="trophy" /> : null}
              </Row>
              <T variant="micro" color={p.textDim}>{m.mandi.district} · {m.mandi.distanceKm} km · {m.hours} h transit · pays in {m.paymentDays} d</T>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T variant="h2" color={m.rank === 1 ? p.primary : p.text}>{inr(m.net)}</T>
              <T variant="micro" color={p.textFaint}>{inr(m.netPerQ)}/q net</T>
            </View>
          </Row>
          <Divider />
          <KV k="Gross at estimated price" v={`${inr(m.gross)} (${inr(m.pricePerQ)}/q)`} />
          <KV k={`Transport · ${m.trips} trip(s)`} v={`− ${inr(m.transport)}`} color={p.danger} />
          <KV k={`Commission ${m.mandi.commissionPct}%`} v={`− ${inr(m.commission)}`} color={p.danger} />
          <KV k={`Transit loss ${m.lossPct}%`} v={`− ${inr(m.lossValue)}`} color={p.danger} />
          {m.rank !== 1 ? <KV k="Versus best option" v={inr(m.deltaVsBest ?? 0)} color={p.warn} /> : null}
        </Card>
      ))}

      {/* SELL SIMULATOR */}
      <SectionTitle title="Sell now or hold? (AI estimate)" icon="time" />
      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        {sim.options.map((o) => (
          <Card key={o.horizon} glow={o.horizon === sim.best.horizon} style={{ flex: 1, marginBottom: 0 }} pad={space.md}>
            <T variant="micro" color={p.textDim}>{o.label.toUpperCase()}</T>
            <T variant="h2" color={o.horizon === sim.best.horizon ? p.primary : p.text} style={{ marginTop: 4 }}>{inr(o.expectedNet)}</T>
            <T variant="micro" color={p.textFaint}>{inr(o.lowPrice)}–{inr(o.highPrice)}/q</T>
            <Divider />
            <T variant="micro" color={p.textDim}>Grade {o.grade} · {o.qualityScore}/100</T>
            <T variant="micro" color={p.textDim}>Spoilage {o.spoilLossPct}%</T>
            <T variant="micro" color={p.textDim}>Storage {inr(o.storageCost)}</T>
          </Card>
        ))}
      </Row>
      <Card>
        {sim.options.map((o) => (
          <Row key={o.horizon} gap={8} style={{ alignItems: 'flex-start', marginBottom: 6 }}>
            <Ionicons name={o.horizon === sim.best.horizon ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={o.horizon === sim.best.horizon ? p.ok : p.textFaint} style={{ marginTop: 2 }} />
            <T variant="small" color={p.textDim} style={{ flex: 1 }}><T variant="small">{o.label}: </T>{o.verdict}</T>
          </Row>
        ))}
        <Banner kind="info" icon="sparkles" text={sim.note} />
        <Row gap={space.sm}>
          <Btn
            title="List on marketplace"
            icon="storefront"
            style={{ flex: 1 }}
            onPress={() => {
              push('listing_create', { crop: scan.crop, qty, grade: q.grade, score: q.score, ask: pr.mid });
              audit({ actor: s.profile.id, action: 'order:create', resource: 'marketplace', outcome: 'allow', meta: { crop: scan.crop, qty } });
              navigation.navigate('Tabs', { screen: 'Market' });
            }}
          />
          <Btn title="Passport" kind="ghost" icon="qr-code" style={{ flex: 1 }} onPress={() => navigation.navigate('Passport')} />
        </Row>
      </Card>

      <Sheet visible={drivers} onClose={() => setDrivers(false)} title="What moved the price">
        <T variant="small" color={p.textDim} style={{ marginBottom: space.md }}>
          Additive log-price decomposition from {MODEL_META.name} ({MODEL_META.algo}). Trained on {MODEL_META.trainedOn}.
        </T>
        {pr.drivers.map((d) => (
          <Card key={d.label} pad={space.md}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="small">{d.label}</T>
              <T variant="h3" color={d.effectPct >= 0 ? p.ok : p.danger}>{d.effectPct >= 0 ? '+' : ''}{d.effectPct.toFixed(1)}%</T>
            </Row>
            <T variant="micro" color={p.textFaint}>{d.note}</T>
          </Card>
        ))}
      </Sheet>
    </Screen>
  );
}

function HeatGridFill({ grid }: { grid: number[][] }) {
  const [size, setSize] = React.useState(300);
  return (
    <View style={{ flex: 1 }} onLayout={(e) => setSize(e.nativeEvent.layout.width)}>
      <HeatMap grid={grid} size={size} opacity={0.55} />
    </View>
  );
}
