import React from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Bar, Btn, Card, Chip, Divider, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, Stat, T } from '../components/ui';
import { font, space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { Bloom, OutboxOp, drain, enqueue, gossip, lwwMerge, lwwPut, lwwValues } from '../lib/mesh';
import { kalmanFuse } from '../lib/weather';
import { ago } from '../lib/derive';
import { sha256Hex, uid } from '../lib/crypto';

export default function MeshScreen() {
  const { p } = useTheme();
  const { s, set, audit } = useApp();
  const [log, setLog] = React.useState<string[]>([]);
  const [merge, setMerge] = React.useState<any>(null);

  const pending = s.outbox.filter((o) => o.status === 'pending');
  const sent = s.outbox.filter((o) => o.status === 'sent');
  const failed = s.outbox.filter((o) => o.status === 'failed');
  const bloom = React.useMemo(() => {
    const b = new Bloom();
    s.outbox.forEach((o) => b.add(o.idempotencyKey));
    return b;
  }, [s.outbox.length]);

  const peerOps = (peerId: string): OutboxOp[] =>
    Array.from({ length: 3 }, (_, i) => {
      const payload = { peer: peerId, seq: i, kind: 'village_obs' };
      const body = JSON.stringify(payload);
      return {
        id: `${peerId}_op${i}`, kind: 'peer_op', payload, createdAt: Date.now() - i * 60000, attempts: 0,
        nextAttempt: 0, status: 'pending', idempotencyKey: sha256Hex(`peer_op:${body}`).slice(0, 24), sizeB: body.length,
      };
    });

  const syncWith = (peerId: string) => {
    const peer = s.peers.find((x) => x.id === peerId)!;
    const g = gossip(s.outbox, peer, peerOps(peerId));
    const res = drain(s.outbox, () => peer.hasUplink, Date.now());
    set((d) => ({
      ...d,
      outbox: res.outbox,
      peers: d.peers.map((x) => (x.id === peerId ? { ...x, lastSeen: Date.now(), ops: x.ops + g.receivedOps } : x)),
      scans: d.scans.map((sc) => (peer.hasUplink ? { ...sc, synced: true } : sc)),
    }));
    audit({ actor: s.profile.id, action: 'mesh:gossip', resource: `peer:${peerId}`, outcome: 'allow', meta: { sent: g.sentOps, recv: g.receivedOps } });
    setLog([
      ...g.log,
      peer.hasUplink ? `✔ uplink relay: ${res.sent} operations acknowledged by server` : `… ${res.retried} operations re-queued with exponential backoff`,
      `payload ${g.bytes} B · Bloom filter saved ${g.savedByBloom} redundant transfers`,
    ]);
  };

  const runCrdt = () => {
    const t0 = Date.now();
    const mine = lwwPut({}, 'fld_1:variety', 'Arka Rakshak (my edit)', 'device_self', t0);
    const theirs = lwwPut({}, 'fld_1:variety', 'Arka Samrat (Ramesh edit)', 'device_ramesh', t0 + 1200);
    const alsoMine = lwwPut<any>(mine as any, 'fld_1:area', 1.2, 'device_self', t0 + 300);
    const merged = lwwMerge(alsoMine, theirs);
    setMerge({ merged: merged.merged, applied: merged.applied, conflicts: merged.conflicts, values: lwwValues(merged.merged) });
    audit({ actor: s.profile.id, action: 'crdt:merge', resource: 'field:fld_1', outcome: 'info', meta: { applied: merged.applied } });
  };

  const observations = s.peers.map((peer, i) => ({
    node: peer.name, value: 31.2 + (i - 1) * 1.4 + (peer.hasUplink ? -0.6 : 0.4), sigma: 0.9 + i * 0.25,
    at: peer.lastSeen, distanceKm: peer.distanceM / 1000,
  }));
  const fused = kalmanFuse({ x: 30.4, p: 2.2 }, observations);

  return (
    <Screen>
      <ScreenHeader title="Mesh sync" sub="One connected phone syncs the whole village" icon="git-network" right={<Pill text={s.settings.airplane ? 'AIRPLANE' : 'RADIO ON'} color={s.settings.airplane ? p.warn : p.ok} icon={s.settings.airplane ? 'airplane' : 'wifi'} />} />

      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <Stat label="Pending" value={`${pending.length}`} sub="in durable outbox" color={p.warn} icon="hourglass" />
        <Stat label="Delivered" value={`${sent.length}`} sub="acknowledged" color={p.ok} icon="checkmark-done" />
        <Stat label="Failed" value={`${failed.length}`} sub="after 8 retries" color={failed.length ? p.danger : p.textDim} icon="alert" />
      </Row>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="h3">Airplane-mode test</T>
          <Chip label={s.settings.airplane ? 'Radios OFF' : 'Radios ON'} active={s.settings.airplane} icon="airplane" onPress={() => set((d) => ({ ...d, settings: { ...d.settings, airplane: !d.settings.airplane } }))} color={p.warn} />
        </Row>
        <T variant="small" color={p.textDim} style={{ marginTop: 6 }}>
          Turn radios off and keep using every screen: scanning, grading, pricing, irrigation, the twin and the advisor all run locally. Writes accumulate in the outbox and reconcile later without duplicates (idempotency keys + CRDT merge).
        </T>
        <Btn small kind="soft" icon="add-circle" title="Queue a test operation" style={{ marginTop: space.sm }} onPress={() => set((d) => ({ ...d, outbox: enqueue(d.outbox, 'field_note', { at: Date.now(), note: 'manual test write', id: uid('note') }) }))} />
      </Card>

      <SectionTitle title="Nearby peers" icon="bluetooth" />
      {s.peers.map((peer) => (
        <Card key={peer.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Row gap={6}>
                <T variant="h3">{peer.name}</T>
                {peer.hasUplink ? <Pill text="UPLINK" color={p.ok} icon="cloud-upload" /> : null}
              </Row>
              <T variant="micro" color={p.textDim}>{peer.distanceM} m · seen {ago(peer.lastSeen)} · battery {(peer.battery * 100).toFixed(0)}% · {peer.ops} ops held</T>
            </View>
            <Btn small title="Gossip" icon="swap-horizontal" onPress={() => syncWith(peer.id)} />
          </Row>
          <Bar value={peer.battery} color={peer.battery < 0.35 ? p.danger : p.ok} height={5} />
        </Card>
      ))}

      {log.length ? (
        <Card>
          <SectionTitle title="Sync trace" icon="terminal" />
          {log.map((l, i) => <T key={i} variant="mono" color={p.textDim} style={{ marginBottom: 3 }}>{l}</T>)}
        </Card>
      ) : null}

      <SectionTitle title="Outbox" icon="cube" />
      <Card>
        {s.outbox.length === 0 ? (
          <T variant="small" color={p.textDim}>Empty — every local write has been reconciled.</T>
        ) : (
          s.outbox.slice(-8).reverse().map((o) => (
            <Row key={o.id} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
              <Row gap={8} style={{ flex: 1 }}>
                <Ionicons name={o.status === 'sent' ? 'checkmark-circle' : o.status === 'failed' ? 'close-circle' : 'ellipse-outline'} size={14} color={o.status === 'sent' ? p.ok : o.status === 'failed' ? p.danger : p.warn} />
                <View style={{ flex: 1 }}>
                  <T variant="small">{o.kind}</T>
                  <T variant="micro" color={p.textFaint}>idem {o.idempotencyKey.slice(0, 12)}… · {o.sizeB} B · {o.attempts} attempts</T>
                </View>
              </Row>
              <T variant="micro" color={p.textDim}>{ago(o.createdAt)}</T>
            </Row>
          ))
        )}
        <Divider />
        <KV k="Bloom digest" v={`m=2048 bits, k=4 hashes, ${(bloom.fillRatio() * 100).toFixed(1)}% full`} />
        <KV k="Wire cost per round" v="256 B digest + only the missing operations" />
      </Card>

      <SectionTitle title="CRDT conflict resolution" icon="git-merge" />
      <Card>
        <T variant="small" color={p.textDim}>
          Two phones edit the same field offline. Last-writer-wins registers with a node-id tiebreak converge to the same state on every device — no server arbitration, no lost writes.
        </T>
        <Btn small kind="soft" icon="play" title="Run merge" style={{ marginTop: space.sm }} onPress={runCrdt} />
        {merge ? (
          <>
            <Divider />
            <KV k="Operations applied" v={`${merge.applied}`} color={p.ok} />
            <KV k="Simultaneous-timestamp conflicts" v={`${merge.conflicts}`} />
            {Object.entries(merge.merged).map(([k, v]: any) => (
              <KV key={k} k={k} v={`${v.value} · ${v.node} @ ${new Date(v.ts).toLocaleTimeString('en-IN')}`} />
            ))}
          </>
        ) : null}
      </Card>

      <SectionTitle title="Village weather mesh (Kalman)" icon="thermometer" />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T variant="micro" color={p.textDim}>FUSED VILLAGE TEMPERATURE</T>
            <T variant="h1" color={p.sun}>{fused.x} °C</T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T variant="micro" color={p.textDim}>CONFIDENCE</T>
            <T variant="h2" color={p.ok}>{fused.confidence}%</T>
          </View>
        </Row>
        <Divider />
        {fused.steps.map((st, i) => (
          <Row key={i} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
            <T variant="small" color={p.textDim} style={{ flex: 1 }}>{st.node}</T>
            <T variant="micro" color={p.textFaint}>K={st.gain} · R={st.r} · {st.before}→{st.after} °C</T>
          </Row>
        ))}
        <Banner kind="info" icon="information-circle" text="Each neighbour's reading is weighted by its sensor noise and distance. Nearby, low-noise nodes move the estimate most; a single bad thermometer cannot poison the village forecast." />
      </Card>
    </Screen>
  );
}
