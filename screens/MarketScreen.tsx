import React from 'react';
import { ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { AnswerCard, Banner, Btn, Card, Chip, Divider, HeroImage, KV, PicturePicker, Pill, Row, Screen, ScreenHeader, SectionTitle, Sheet, Slider, T, gradeColor } from '../components/ui';
import { CROP_IMG, HERO, avatarFor } from '../lib/images';
import { speak } from '../lib/voice';
import { voiceLocale } from '../lib/i18n';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { CROPS, CropKey } from '../lib/agro';
import { MANDIS, VEHICLES, compareMarkets, inr, priceRange, sellSimulator } from '../lib/price';
import { activeField, ago } from '../lib/derive';
import { uid } from '../lib/crypto';

export default function MarketScreen({ navigation }: any) {
  const { p } = useTheme();
  const { s, set, push, audit } = useApp();
  const f = activeField(s);
  const [crop, setCrop] = React.useState<CropKey>(f.crop);
  const [qty, setQty] = React.useState(20);
  const [grade, setGrade] = React.useState<'A' | 'B' | 'C'>('B');
  const [vehicle, setVehicle] = React.useState('tempo');
  const [order, setOrder] = React.useState<any>(null);

  const lastQuality = s.scans.find((x) => x.kind === 'quality' && x.crop === crop);
  const qs = lastQuality?.score ?? (grade === 'A' ? 85 : grade === 'B' ? 70 : 52);
  const markets = React.useMemo(() => compareMarkets({ crop, qualityScore: qs, grade, quantityQuintal: qty, vehicleId: vehicle }), [crop, qs, grade, qty, vehicle]);
  const pr = React.useMemo(() => priceRange({ crop, qualityScore: qs, grade, quantityQuintal: qty }), [crop, qs, grade, qty]);
  const sim = React.useMemo(() => sellSimulator({ crop, qualityScore: qs, grade, quantityQuintal: qty, bestNetNow: markets[0].net, seed: crop + qty }), [crop, qs, grade, qty, markets[0].net]);

  const createOrder = (listing: any) => {
    const o = {
      id: uid('ord'), listingId: listing.id, buyer: s.profile.name, amount: listing.askPerQ * listing.qtyQ,
      state: 'escrow_funded' as const, escrowRef: uid('esc'),
      history: [
        { at: Date.now() - 1, state: 'created', note: 'Buyer accepted the listed price' },
        { at: Date.now(), state: 'escrow_funded', note: 'Funds locked in escrow — released only on delivery confirmation' },
      ],
    };
    set((d) => ({ ...d, orders: [o, ...d.orders] }));
    push('order_create', { id: o.id, amount: o.amount });
    audit({ actor: s.profile.id, action: 'order:create', resource: `listing:${listing.id}`, outcome: 'allow', meta: { amount: o.amount } });
    setOrder(o);
  };

  const advance = (id: string, state: string, note: string) => {
    set((d) => ({
      ...d,
      orders: d.orders.map((o) => (o.id === id ? { ...o, state: state as any, history: [...o.history, { at: Date.now(), state, note }] } : o)),
    }));
    setOrder((prev: any) => (prev && prev.id === id ? { ...prev, state, history: [...prev.history, { at: Date.now(), state, note }] } : prev));
    audit({ actor: s.profile.id, action: 'escrow:transition', resource: `order:${id}`, outcome: 'allow', meta: { state } });
  };

  return (
    <Screen>
      <ScreenHeader
        title={s.settings.simple ? 'Best price' : 'Market'}
        sub={s.settings.simple ? 'Where you keep the most money after transport and spoilage' : 'Net-value ranking, escrow trades and collective buying'}
        icon="pricetag"
        right={<Pill text="AI ESTIMATE" color={p.warn} icon="sparkles" />}
      />

      <HeroImage source={HERO.market} height={130} />

      <AnswerCard
        tone="info"
        headline={`Take it to ${markets[0].mandi.name}`}
        detail={`You keep about ${inr(markets[0].netPerQ)} per quintal there — ${inr(markets[0].net)} for ${qty} quintal after ${inr(markets[0].transport)} transport, commission and ${markets[0].lossPct}% spoilage on the road. It is an estimate, not a promise.`}
        image={CROP_IMG[crop]}
        onSpeak={() => speak(`Take it to ${markets[0].mandi.name}. You keep about ${markets[0].netPerQ} rupees per quintal after costs. This is an estimate, not a fixed price.`, voiceLocale(s.profile.lang))}
      />

      <SectionTitle title={s.settings.simple ? 'Which crop?' : 'Crop'} icon="leaf" />
      <PicturePicker
        value={crop}
        onChange={(k) => setCrop(k as CropKey)}
        items={Object.values(CROPS).map((c) => ({ key: c.key, label: c.name, image: CROP_IMG[c.key] }))}
      />

      <Card glow>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T variant="micro" color={p.textDim}>ESTIMATED RANGE · ₹/QUINTAL</T>
            <Row gap={8} style={{ alignItems: 'flex-end', marginTop: 4 }}>
              <T variant="h1" color={p.primary}>{inr(pr.mid)}</T>
              <T variant="small" color={p.textDim}>{inr(pr.low)} – {inr(pr.high)}</T>
            </Row>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T variant="micro" color={p.textDim}>CONFIDENCE</T>
            <T variant="h2" color={p.accent}>{pr.confidence}%</T>
          </View>
        </Row>
        <Divider />
        <Row gap={8} wrap style={{ marginBottom: space.sm }}>
          {(['A', 'B', 'C'] as const).map((g) => <Chip key={g} label={`Grade ${g}`} active={grade === g} onPress={() => setGrade(g)} color={gradeColor(p, g)} />)}
          {lastQuality ? <Pill text={`FROM SCAN: ${lastQuality.score}/100`} color={p.primary} icon="camera" /> : null}
        </Row>
        <Slider label="Quantity" value={qty} min={1} max={200} step={1} unit=" q" onChange={setQty} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {VEHICLES.map((v) => <Chip key={v.id} label={`${v.name} · ₹${v.ratePerKm}/km`} active={vehicle === v.id} onPress={() => setVehicle(v.id)} />)}
        </ScrollView>
        <Banner kind="warn" icon="alert-circle" text={pr.disclaimer} />
      </Card>

      <SectionTitle title="Net value ranking" icon="podium" />
      {markets.slice(0, 4).map((m) => (
        <Card key={m.mandi.id} glow={m.rank === 1}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Row gap={6}><T variant="h3">{m.rank}. {m.mandi.name}</T>{m.rank === 1 ? <Pill text="BEST" color={p.primary} icon="trophy" /> : null}</Row>
              <T variant="micro" color={p.textDim}>{m.mandi.distanceKm} km · arrivals {m.mandi.arrivalsT} t · commission {m.mandi.commissionPct}% · trust {(m.mandi.trust * 100).toFixed(0)}%</T>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T variant="h2" color={m.rank === 1 ? p.primary : p.text}>{inr(m.net)}</T>
              <T variant="micro" color={p.textFaint}>net for {qty} q</T>
            </View>
          </Row>
          <Row gap={6} wrap style={{ marginTop: 8 }}>
            <Pill text={`gross ${inr(m.gross)}`} color={p.textDim} />
            <Pill text={`transport −${inr(m.transport)}`} color={p.danger} />
            <Pill text={`loss ${m.lossPct}%`} color={p.warn} />
            <Pill text={`pay in ${m.paymentDays} d`} color={p.water} />
          </Row>
        </Card>
      ))}

      <SectionTitle title="Sell today or hold?" icon="hourglass" />
      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        {sim.options.map((o) => (
          <Card key={o.horizon} glow={o.horizon === sim.best.horizon} style={{ flex: 1, marginBottom: 0 }} pad={space.md}>
            <T variant="micro" color={p.textDim}>{o.label.toUpperCase()}</T>
            <T variant="h3" color={o.horizon === sim.best.horizon ? p.primary : p.text}>{inr(o.expectedNet)}</T>
            <T variant="micro" color={p.textFaint}>{o.spoilLossPct}% spoilage</T>
          </Card>
        ))}
      </Row>

      <SectionTitle title="Village marketplace" icon="people" right={<Chip label="Escrow protected" icon="lock-closed" color={p.ok} active />} />
      {s.listings.map((l) => (
        <Card key={l.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Image source={CROP_IMG[l.crop]} style={{ width: 62, height: 62, borderRadius: 14, marginRight: 10 }} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <Row gap={6}>
                <T variant="h3">{l.qtyQ} q {CROPS[l.crop].name}</T>
                <Pill text={`GRADE ${l.grade}`} color={gradeColor(p, l.grade)} />
                {l.organic ? <Pill text="ORGANIC" color={p.ok} icon="leaf" /> : null}
              </Row>
              <Row gap={6} style={{ marginTop: 3 }}>
                <Image source={avatarFor(l.seller)} style={{ width: 20, height: 20, borderRadius: 10 }} contentFit="cover" />
                <T variant="micro" color={p.textDim} style={{ flex: 1 }}>{l.seller} · {l.village} · {l.distanceKm} km · {ago(l.ts)} · quality {l.qualityScore}/100</T>
              </Row>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T variant="h3" color={p.primary}>{inr(l.askPerQ)}</T>
              <T variant="micro" color={p.textFaint}>per quintal</T>
            </View>
          </Row>
          <Row gap={space.sm} style={{ marginTop: space.sm }}>
            <Btn small kind="soft" icon="chatbubble-ellipses" title="Encrypted chat" style={{ flex: 1 }} onPress={() => navigation.navigate('SecureChat', { peer: l.seller })} />
            <Btn small icon="lock-closed" title={`Buy ${inr(l.askPerQ * l.qtyQ)}`} style={{ flex: 1.3 }} onPress={() => createOrder(l)} />
          </Row>
        </Card>
      ))}

      {s.orders.length ? (
        <>
          <SectionTitle title="Your escrow orders" icon="receipt" />
          {s.orders.map((o) => (
            <Card key={o.id} onPress={() => setOrder(o)}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T variant="h3">{inr(o.amount)}</T>
                <Pill text={o.state.replace('_', ' ').toUpperCase()} color={o.state === 'released' ? p.ok : o.state === 'disputed' ? p.danger : p.warn} />
              </Row>
              <T variant="micro" color={p.textDim}>{o.escrowRef} · {o.history.length} state transitions</T>
            </Card>
          ))}
        </>
      ) : null}

      <Card onPress={() => navigation.navigate('Outbreak')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T variant="h3">Collective buying pools</T>
            <T variant="small" color={p.textDim}>{s.buyingPool.length} open pools · save up to 25% on inputs</T>
          </View>
          <Ionicons name="chevron-forward" size={18} color={p.textFaint} />
        </Row>
      </Card>

      <Sheet visible={!!order} onClose={() => setOrder(null)} title="Escrow order">
        {order ? (
          <View>
            <KV k="Order" v={order.id} />
            <KV k="Escrow reference" v={order.escrowRef} />
            <KV k="Amount held" v={inr(order.amount)} color={p.primary} />
            <KV k="State" v={order.state} />
            <Divider />
            <SectionTitle title="State machine" icon="git-commit" />
            {order.history.map((h: any, i: number) => (
              <Row key={i} gap={8} style={{ marginBottom: 8, alignItems: 'flex-start' }}>
                <Ionicons name="ellipse" size={9} color={p.primary} style={{ marginTop: 5 }} />
                <View style={{ flex: 1 }}>
                  <T variant="small">{h.state.replace('_', ' ')}</T>
                  <T variant="micro" color={p.textFaint}>{h.note}</T>
                </View>
              </Row>
            ))}
            <Divider />
            {order.state === 'escrow_funded' ? <Btn title="Mark shipped" icon="cube" onPress={() => advance(order.id, 'shipped', 'Lot dispatched with QR passport attached')} /> : null}
            {order.state === 'shipped' ? <Btn title="Confirm delivery" icon="checkmark-done" onPress={() => advance(order.id, 'delivered', 'Buyer confirmed weight and grade at gate')} /> : null}
            {order.state === 'delivered' ? (
              <Row gap={space.sm}>
                <Btn title="Release funds" icon="cash" style={{ flex: 1 }} onPress={() => advance(order.id, 'released', 'Escrow released to seller wallet')} />
                <Btn title="Dispute" kind="danger" icon="alert" style={{ flex: 1 }} onPress={() => advance(order.id, 'disputed', 'Dispute opened — FPO arbitrator notified, funds frozen')} />
              </Row>
            ) : null}
            {order.state === 'disputed' ? <Btn title="Arbitrator refunds buyer" kind="ghost" icon="refresh" onPress={() => advance(order.id, 'refunded', 'Arbitrator ruled for buyer — funds returned')} /> : null}
            <Banner kind="info" icon="shield-checkmark" text="Funds never touch the counterparty until delivery is confirmed. Every transition is written to the hash-chained audit log and signed by both device keys." />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
