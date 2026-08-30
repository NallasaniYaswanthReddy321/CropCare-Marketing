import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AnswerCard, Bar, Btn, Card, Chip, Divider, KV, MultiLine, Pill, Row, Screen, ScreenHeader,
  SectionTitle, Sparkline, Stat, T,
} from '../components/ui';
import { OverflowMenu } from '../components/Menu';
import { radius, space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { useRealtime } from '../lib/rtcontext';
import { RtEvent, RtTopic, stateLabel } from '../lib/realtime';
import { fmtTime } from '../lib/derive';

const TOPIC_META: Record<RtTopic, { label: string; icon: string; color: (p: any) => string }> = {
  'diagnosis.updated': { label: 'Crop check', icon: 'camera', color: (p) => p.primary },
  'expert.case': { label: 'Expert case', icon: 'medkit', color: (p) => p.accent },
  'sync.status': { label: 'Sync', icon: 'git-network', color: (p) => p.water },
  'outbreak.alert': { label: 'Disease alert', icon: 'warning', color: (p) => p.danger },
  'farm.event': { label: 'Farm event', icon: 'leaf', color: (p) => p.ok },
  'price.tick': { label: 'Price', icon: 'pricetag', color: (p) => p.sun },
  'weather.tick': { label: 'Field & weather', icon: 'partly-sunny', color: (p) => p.water },
  presence: { label: 'Presence', icon: 'people', color: (p) => p.textDim },
};

export default function LiveScreen({ navigation }: any) {
  const { p } = useTheme();
  const { s, set } = useApp();
  const rt = useRealtime();
  const [filter, setFilter] = React.useState<RtTopic | 'all'>('all');
  const [, force] = React.useReducer((x: number) => x + 1, 0);

  React.useEffect(() => {
    const id = setInterval(force, 1000);
    return () => clearInterval(id);
  }, []);

  const label = stateLabel(rt.state);
  const m = rt.metrics ?? ({} as any);
  const events = filter === 'all' ? rt.log : rt.log.filter((e) => e.topic === filter);

  const counts = React.useMemo(() => {
    const c = new Map<RtTopic, number>();
    rt.log.forEach((e) => c.set(e.topic, (c.get(e.topic) ?? 0) + 1));
    return c;
  }, [rt.log.length]);

  const rttSeries = (m.rttSamples ?? []).length > 1 ? m.rttSamples : null;
  const throughput = React.useMemo(() => {
    const buckets = new Array(12).fill(0);
    const now = Date.now();
    rt.log.forEach((e) => {
      const age = Math.floor((now - e.ts) / 10000);
      if (age >= 0 && age < 12) buckets[11 - age]++;
    });
    return buckets;
  }, [rt.log.length]);

  const denied = rt.log.filter((e) => e.auth?.decision === 'deny');
  const latest = (topic: RtTopic) => rt.log.find((e) => e.topic === topic);
  const wx = latest('weather.tick')?.payload;
  const pr = latest('price.tick')?.payload;
  const sy = latest('sync.status')?.payload;

  return (
    <Screen>
      <ScreenHeader
        title="Live"
        sub="Every event flowing through this device, in real time"
        icon="pulse"
        right={
          <Row gap={6}>
            <Pill text={label.text.toUpperCase()} color={label.tone === 'ok' ? p.ok : label.tone === 'warn' ? p.warn : label.tone === 'danger' ? p.danger : p.water} icon="ellipse" />
            <OverflowMenu
              items={[
                { icon: 'refresh', label: 'Reconnect now', hint: 'Force a fresh handshake', onPress: rt.reconnect, tone: 'primary' },
                { icon: 'stop-circle', label: 'Stop the stream', hint: 'Close the socket', onPress: rt.stop, tone: 'danger' },
                { icon: 'trash', label: 'Clear event log', onPress: rt.clearLog },
                { icon: 'airplane', label: 'Airplane mode', hint: 'Cut every radio and prove offline works', check: s.settings.airplane, onPress: () => set((d) => ({ ...d, settings: { ...d.settings, airplane: !d.settings.airplane } })) },
                { icon: 'git-network', label: 'Open mesh sync', onPress: () => navigation.navigate('Mesh') },
                { icon: 'shield-checkmark', label: 'Security centre', onPress: () => navigation.navigate('Security') },
              ]}
            />
          </Row>
        }
      />

      <AnswerCard
        tone={rt.state === 'live' ? 'ok' : rt.state === 'local' ? 'warn' : 'info'}
        headline={
          rt.state === 'live' ? 'Connected to the village server'
            : rt.state === 'local' ? 'Working on this device'
              : rt.state === 'backoff' ? 'Reconnecting…'
                : 'Starting up'
        }
        detail={
          rt.state === 'live'
            ? `Authenticated stream open. ${m.eventsIn ?? 0} events received, ${m.eventsOut ?? 0} sent, round trip ${m.lastRttMs ?? '—'} ms.`
            : rt.reason
              ? `${rt.reason}. Every screen keeps working — events are sequenced here and replayed the moment a server answers.${rt.nextRetryMs ? ` Next try in ${Math.ceil(rt.nextRetryMs / 1000)} s.` : ''}`
              : 'Bringing the stream up.'
        }
        onSpeak={undefined}
        action={<Row gap={space.sm}><Btn small title="Reconnect" icon="refresh" onPress={rt.reconnect} /><Btn small kind="ghost" title="Mesh sync" icon="git-network" onPress={() => navigation.navigate('Mesh')} /></Row>}
      />

      {/* live cards driven purely by the bus */}
      <SectionTitle title="Latest values on the wire" icon="flash" />
      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <Stat label="Water need" value={wx ? `${wx.etc} mm` : '—'} sub={wx ? `${wx.stage} · ${wx.depletionPct}% used` : 'waiting'} color={p.water} icon="water" />
        <Stat label="Best net price" value={pr ? `₹${pr.netPerQ}` : '—'} sub={pr ? `${pr.best}` : 'waiting'} color={p.sun} icon="pricetag" />
        <Stat label="Queued writes" value={sy ? `${sy.pending}` : '—'} sub={sy ? `${sy.peers} peers` : 'waiting'} color={p.accent} icon="cloud-upload" />
      </Row>

      {/* connection metrics */}
      <SectionTitle title="Connection health" icon="speedometer" />
      <Card>
        <Row gap={space.sm} style={{ marginBottom: space.md }}>
          <Stat label="Connects" value={`${m.connects ?? 0}`} sub={`${m.reconnectAttempts ?? 0} retries`} color={p.ok} icon="link" />
          <Stat label="Drops" value={`${m.disconnects ?? 0}`} sub={`${m.failures ?? 0} failures`} color={(m.disconnects ?? 0) > 0 ? p.warn : p.textDim} icon="unlink" />
          <Stat label="RTT p50" value={m.p50 != null ? `${m.p50} ms` : '—'} sub={m.p95 != null ? `p95 ${m.p95} ms` : 'no samples'} color={p.water} icon="timer" />
        </Row>
        {rttSeries ? (
          <>
            <T variant="micro" color={p.textDim}>ROUND-TRIP LATENCY (LAST {rttSeries.length} HEARTBEATS)</T>
            <Sparkline data={rttSeries} height={56} color={p.water} />
          </>
        ) : (
          <T variant="small" color={p.textDim}>No heartbeat samples yet — the socket measures round-trip time every 15 seconds once connected.</T>
        )}
        <Divider />
        <T variant="micro" color={p.textDim}>EVENTS PER 10 SECONDS (LAST 2 MINUTES)</T>
        <Sparkline data={throughput} height={54} color={p.primary} labels={['-2 min', 'now']} />
      </Card>

      {/* correctness counters */}
      <SectionTitle title="Delivery correctness" icon="checkmark-done" />
      <Card>
        <KV k="Events received" v={`${m.eventsIn ?? 0}`} />
        <KV k="Events published" v={`${m.eventsOut ?? 0}`} />
        <KV k="Duplicates dropped" v={`${m.duplicatesDropped ?? 0}`} color={p.ok} />
        <KV k="Sequence gaps detected" v={`${m.gapsDetected ?? 0}`} color={(m.gapsDetected ?? 0) > 0 ? p.warn : p.ok} />
        <KV k="Gaps repaired by replay" v={`${m.gapsRepaired ?? 0}`} color={p.ok} />
        <KV k="Authorization denials" v={`${denied.length}`} color={denied.length ? p.danger : p.ok} />
        <KV k="Last error" v={m.lastError ?? 'none'} color={m.lastError ? p.warn : p.ok} />
        <Divider />
        <T variant="micro" color={p.textFaint}>
          Every inbound event is checked for tenant match, then for a duplicate id, then for a sequence gap. A gap triggers a
          resume request so nothing is silently lost; a duplicate is counted and dropped so nothing is applied twice.
        </T>
      </Card>

      {/* live table */}
      <SectionTitle title="Event stream" icon="list" right={<T variant="micro" color={p.textFaint}>{rt.log.length} HELD</T>} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: space.sm }}>
        <Chip label={`All (${rt.log.length})`} active={filter === 'all'} onPress={() => setFilter('all')} />
        {(Object.keys(TOPIC_META) as RtTopic[]).map((tp) => (
          <Chip
            key={tp}
            label={`${TOPIC_META[tp].label} (${counts.get(tp) ?? 0})`}
            icon={TOPIC_META[tp].icon}
            active={filter === tp}
            color={TOPIC_META[tp].color(p)}
            onPress={() => setFilter(tp)}
          />
        ))}
      </ScrollView>

      <Card pad={space.md}>
        <Row style={{ paddingBottom: 8, borderBottomWidth: 1, borderColor: p.glassBorder }}>
          <T variant="micro" color={p.textFaint} style={{ width: 54 }}>SEQ</T>
          <T variant="micro" color={p.textFaint} style={{ width: 62 }}>TIME</T>
          <T variant="micro" color={p.textFaint} style={{ flex: 1 }}>EVENT</T>
          <T variant="micro" color={p.textFaint} style={{ width: 52, textAlign: 'right' }}>AUTH</T>
        </Row>
        {events.length === 0 ? (
          <T variant="small" color={p.textDim} style={{ paddingVertical: space.lg }}>
            No events yet. The device publishes field, price and sync ticks every 20 seconds — one will appear shortly.
          </T>
        ) : (
          events.slice(0, 40).map((e) => <EventRow key={e.id} e={e} />)
        )}
      </Card>

      <Card>
        <SectionTitle title="How this stream is secured" icon="lock-closed" />
        <KV k="Handshake" v="Signed EdDSA token in the first frame, never in the URL" />
        <KV k="Tenant isolation" v={`Only events for “${s.profile.village || 'this village'}” are accepted`} />
        <KV k="Per-event authorization" v="Server decides, client re-checks the scope before delivery" />
        <KV k="Heartbeat" v="Ping every 15 s, peer declared dead after 40 s" />
        <KV k="Reconnect" v="Exponential backoff with full jitter, capped at 30 s" />
        <KV k="Replay safety" v="Idempotent event ids + monotonic sequence + resume-from-seq" />
      </Card>
    </Screen>
  );
}

function EventRow({ e }: { e: RtEvent }) {
  const { p } = useTheme();
  const [open, setOpen] = React.useState(false);
  const meta = TOPIC_META[e.topic];
  const c = meta.color(p);
  const summary = summarise(e);
  return (
    <View style={{ borderBottomWidth: 1, borderColor: p.glassBorder + '55' }}>
      <Row
        style={{ paddingVertical: 9 }}
        gap={0}
      >
        <T variant="mono" color={p.textFaint} style={{ width: 54 }}>#{e.seq}</T>
        <T variant="mono" color={p.textDim} style={{ width: 62 }}>{fmtTime(e.ts)}</T>
        <Row gap={7} style={{ flex: 1 }}>
          <Ionicons name={meta.icon as any} size={13} color={c} />
          <View style={{ flex: 1 }}>
            <T variant="small" numberOfLines={1}>{meta.label}</T>
            <T variant="micro" color={p.textFaint} numberOfLines={open ? 8 : 1}>{summary}</T>
          </View>
        </Row>
        <Pressable onPress={() => setOpen((v) => !v)} hitSlop={8} style={{ width: 52 }}>
          <T variant="micro" color={e.auth?.decision === 'deny' ? p.danger : p.ok} style={{ textAlign: 'right' }}>
            {e.auth?.decision === 'deny' ? 'DENY' : 'ALLOW'}
          </T>
        </Pressable>
      </Row>
      {open ? (
        <View style={{ paddingBottom: 10, paddingLeft: 116 }}>
          <T variant="mono" color={p.textFaint}>{JSON.stringify(e.payload, null, 1)}</T>
          <T variant="micro" color={p.textFaint} style={{ marginTop: 4 }}>scope {e.auth?.scope} · {e.auth?.reason}</T>
        </View>
      ) : null}
    </View>
  );
}

function summarise(e: RtEvent): string {
  const pl = e.payload ?? {};
  switch (e.topic) {
    case 'weather.tick': return `ET₀ ${pl.et0} · ETc ${pl.etc} mm · ${pl.depletionPct}% depleted · ${pl.irrigateNow ? 'irrigate now' : 'hold'}`;
    case 'price.tick': return `${pl.best} · ₹${pl.netPerQ}/q net · ${(pl.rank ?? []).join(' > ')}`;
    case 'sync.status': return `${pl.pending} pending · ${pl.sent} sent · ${pl.peers} peers`;
    case 'diagnosis.updated': return `${pl.label ?? pl.grade ?? 'result'} · ${pl.score ?? ''}`;
    case 'outbreak.alert': return `${pl.disease} · ${pl.village} · ${(pl.severity * 100).toFixed(0)}% severity`;
    case 'farm.event': return `${pl.kind ?? 'event'} on ${pl.field ?? 'farm'}`;
    case 'expert.case': return `${pl.status ?? 'update'} · ${pl.subject ?? ''}`;
    default: return JSON.stringify(pl).slice(0, 90);
  }
}
