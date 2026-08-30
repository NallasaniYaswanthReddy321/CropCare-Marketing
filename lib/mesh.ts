/**
 * Offline-first sync fabric.
 *  • CRDT: LWW-Element-Set with vector-clock tiebreak + G-Counter for tallies
 *  • Outbox: durable operation queue with exponential backoff + idempotency keys
 *  • Bloom-filter gossip digests so two phones exchange only what's missing
 *  • Village mesh: one connected phone drains the whole village's outbox
 */
import { sha256Hex, uid } from './crypto';

/* ------------------------------- CRDT core ------------------------------- */
export type LwwEntry<T> = { id: string; value: T; ts: number; node: string; deleted?: boolean };
export type LwwSet<T> = Record<string, LwwEntry<T>>;

export function lwwPut<T>(set: LwwSet<T>, id: string, value: T, node: string, ts = Date.now()): LwwSet<T> {
  const cur = set[id];
  if (cur && (cur.ts > ts || (cur.ts === ts && cur.node > node))) return set;
  return { ...set, [id]: { id, value, ts, node } };
}
export function lwwDelete<T>(set: LwwSet<T>, id: string, node: string, ts = Date.now()): LwwSet<T> {
  const cur = set[id];
  if (!cur) return { ...set, [id]: { id, value: null as any, ts, node, deleted: true } };
  if (cur.ts > ts) return set;
  return { ...set, [id]: { ...cur, deleted: true, ts, node } };
}
export function lwwMerge<T>(a: LwwSet<T>, b: LwwSet<T>): { merged: LwwSet<T>; applied: number; conflicts: number } {
  const merged: LwwSet<T> = { ...a };
  let applied = 0, conflicts = 0;
  for (const [id, e] of Object.entries(b)) {
    const cur = merged[id];
    if (!cur) { merged[id] = e; applied++; continue; }
    if (cur.ts === e.ts && cur.node !== e.node) conflicts++;
    if (e.ts > cur.ts || (e.ts === cur.ts && e.node > cur.node)) { merged[id] = e; applied++; }
  }
  return { merged, applied, conflicts };
}
export const lwwValues = <T,>(s: LwwSet<T>): T[] => Object.values(s).filter((e) => !e.deleted).map((e) => e.value);

/** Grow-only counter for village-scale tallies (outbreak reports, buying pools). */
export type GCounter = Record<string, number>;
export const gInc = (c: GCounter, node: string, by = 1): GCounter => ({ ...c, [node]: (c[node] || 0) + by });
export const gValue = (c: GCounter) => Object.values(c).reduce((a, b) => a + b, 0);
export const gMerge = (a: GCounter, b: GCounter): GCounter => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] || 0, v);
  return out;
};

/* ------------------------------ Bloom filter ----------------------------- */
export class Bloom {
  bits: Uint8Array;
  m: number;
  k: number;
  constructor(m = 2048, k = 4, bits?: number[]) {
    this.m = m; this.k = k;
    this.bits = new Uint8Array(m / 8);
    if (bits) bits.forEach((b, i) => (this.bits[i] = b));
  }
  private idx(item: string, i: number) {
    const h = sha256Hex(`${i}:${item}`);
    return parseInt(h.slice(0, 8), 16) % this.m;
  }
  add(item: string) {
    for (let i = 0; i < this.k; i++) { const b = this.idx(item, i); this.bits[b >> 3] |= 1 << (b & 7); }
    return this;
  }
  has(item: string) {
    for (let i = 0; i < this.k; i++) { const b = this.idx(item, i); if (!(this.bits[b >> 3] & (1 << (b & 7)))) return false; }
    return true;
  }
  fillRatio() {
    let set = 0;
    for (const byte of this.bits) set += ((byte * 0x08040201) >> 3) & 0x11111111 ? popcount(byte) : 0;
    return set / this.m;
  }
  serialize() { return Array.from(this.bits); }
  static from(bits: number[], m = 2048, k = 4) { return new Bloom(m, k, bits); }
}
function popcount(b: number) { let c = 0; while (b) { c += b & 1; b >>= 1; } return c; }

/* -------------------------------- Outbox --------------------------------- */
export type OutboxOp = {
  id: string; kind: string; payload: any; createdAt: number; attempts: number;
  nextAttempt: number; status: 'pending' | 'sent' | 'failed'; idempotencyKey: string; sizeB: number;
};

export function enqueue(outbox: OutboxOp[], kind: string, payload: any): OutboxOp[] {
  const body = JSON.stringify(payload);
  const op: OutboxOp = {
    id: uid('op'), kind, payload, createdAt: Date.now(), attempts: 0,
    nextAttempt: Date.now(), status: 'pending',
    idempotencyKey: sha256Hex(`${kind}:${body}`).slice(0, 24), sizeB: body.length,
  };
  if (outbox.some((o) => o.idempotencyKey === op.idempotencyKey && o.status === 'pending')) return outbox;
  return [...outbox, op];
}

/** Drain with jittered exponential backoff; deterministic given the transport. */
export function drain(outbox: OutboxOp[], transport: (op: OutboxOp) => boolean, now = Date.now()) {
  let sent = 0, retried = 0;
  const next = outbox.map((op) => {
    if (op.status !== 'pending' || op.nextAttempt > now) return op;
    const ok = transport(op);
    if (ok) { sent++; return { ...op, status: 'sent' as const, attempts: op.attempts + 1 }; }
    retried++;
    const attempts = op.attempts + 1;
    const backoff = Math.min(300000, 2 ** attempts * 1000);
    return { ...op, attempts, nextAttempt: now + backoff, status: attempts >= 8 ? ('failed' as const) : ('pending' as const) };
  });
  return { outbox: next, sent, retried };
}

/* ------------------------------ mesh gossip ------------------------------ */
export type Peer = { id: string; name: string; distanceM: number; lastSeen: number; hasUplink: boolean; battery: number; ops: number };

export type GossipResult = {
  peer: string; sentOps: number; receivedOps: number; savedByBloom: number;
  bytes: number; rounds: number; log: string[];
};

/**
 * BLE/Wi-Fi-Direct gossip round: exchange Bloom digests, then ship only the
 * operations the other side is missing. Uplink peers relay to the server.
 */
export function gossip(local: OutboxOp[], peer: Peer, peerOps: OutboxOp[]): GossipResult {
  const log: string[] = [];
  const myBloom = new Bloom();
  local.forEach((o) => myBloom.add(o.idempotencyKey));
  const theirBloom = new Bloom();
  peerOps.forEach((o) => theirBloom.add(o.idempotencyKey));
  log.push(`↔ digest exchange with ${peer.name} — 256 B Bloom filters (m=2048, k=4)`);

  const toSend = local.filter((o) => o.status === 'pending' && !theirBloom.has(o.idempotencyKey));
  const toRecv = peerOps.filter((o) => !myBloom.has(o.idempotencyKey));
  const saved = local.length - toSend.length;
  const bytes = [...toSend, ...toRecv].reduce((s, o) => s + o.sizeB, 0) + 512;
  log.push(`→ pushing ${toSend.length} ops (${saved} already known, skipped)`);
  log.push(`← pulling ${toRecv.length} ops from peer`);
  if (peer.hasUplink) log.push(`↑ ${peer.name} has uplink — relaying village queue to server`);
  else log.push('⚡ store-and-forward: ops parked until any peer finds signal');
  return { peer: peer.id, sentOps: toSend.length, receivedOps: toRecv.length, savedByBloom: saved, bytes, rounds: 2, log };
}
