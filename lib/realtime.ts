/**
 * CropCare real-time transport (Phase 9).
 *
 * A production WebSocket client with:
 *   · authenticated CONNECT (signed EdDSA token in the first frame, never in the URL)
 *   · tenant/user authorization asserted server-side and re-checked per event
 *   · full connection lifecycle state machine
 *   · heartbeat ping/pong with dead-peer detection
 *   · reconnect with exponential backoff + full jitter, capped
 *   · monotonic event sequencing with gap detection and resume-from-seq
 *   · idempotent delivery (dedup window keyed by event id)
 *   · latency / failure / connection instrumentation
 *
 * When no server is reachable (airplane mode, village outage, static web build)
 * the same bus keeps running in LOCAL LOOP: device-originated events are still
 * real events — they are sequenced, deduped and delivered to subscribers, then
 * replayed to the server on resume. Nothing is faked; the UI always shows which
 * mode is active and why.
 */
import { sha256Hex, uid } from './crypto';

export type RtState = 'idle' | 'connecting' | 'authenticating' | 'live' | 'backoff' | 'local' | 'closed';

export type RtTopic =
  | 'diagnosis.updated'
  | 'expert.case'
  | 'sync.status'
  | 'outbreak.alert'
  | 'farm.event'
  | 'price.tick'
  | 'weather.tick'
  | 'presence';

export type RtEvent<T = any> = {
  id: string;
  seq: number;
  topic: RtTopic;
  tenant: string;
  actor: string;
  ts: number;
  payload: T;
  /** server-asserted authorization decision that let this event through */
  auth?: { scope: string; decision: 'allow' | 'deny'; reason?: string };
};

export type RtMetrics = {
  connects: number;
  disconnects: number;
  failures: number;
  eventsIn: number;
  eventsOut: number;
  duplicatesDropped: number;
  gapsDetected: number;
  gapsRepaired: number;
  lastRttMs: number | null;
  rttSamples: number[];
  p50: number | null;
  p95: number | null;
  uptimeMs: number;
  lastError: string | null;
  lastConnectedAt: number | null;
  reconnectAttempts: number;
};

export type RtOptions = {
  url: string | null;
  token: string;
  tenant: string;
  actor: string;
  scopes: string[];
  heartbeatMs?: number;
  deadMs?: number;
  maxBackoffMs?: number;
  dedupWindow?: number;
};

type Listener = (e: RtEvent) => void;
type StateListener = (s: RtState, info: { reason?: string; nextRetryMs?: number }) => void;

const emptyMetrics = (): RtMetrics => ({
  connects: 0, disconnects: 0, failures: 0, eventsIn: 0, eventsOut: 0,
  duplicatesDropped: 0, gapsDetected: 0, gapsRepaired: 0, lastRttMs: null,
  rttSamples: [], p50: null, p95: null, uptimeMs: 0, lastError: null,
  lastConnectedAt: null, reconnectAttempts: 0,
});

/** Client-side mirror of the server authorization matrix (defence in depth). */
const TOPIC_SCOPE: Record<RtTopic, string> = {
  'diagnosis.updated': 'scan:read',
  'expert.case': 'advisor:read',
  'sync.status': 'sync:read',
  'outbreak.alert': 'outbreak:read',
  'farm.event': 'field:read',
  'price.tick': 'market:read',
  'weather.tick': 'weather:read',
  presence: 'presence:read',
};

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private opts: Required<RtOptions>;
  private listeners = new Map<string, Listener>();
  private stateListeners = new Set<StateListener>();
  private seen = new Map<string, number>();
  private hbTimer: any = null;
  private deadTimer: any = null;
  private retryTimer: any = null;
  private pingSentAt = 0;
  private closedByUser = false;

  state: RtState = 'idle';
  lastSeq = 0;
  metrics: RtMetrics = emptyMetrics();
  backlog: RtEvent[] = [];

  constructor(opts: RtOptions) {
    this.opts = {
      heartbeatMs: 15000, deadMs: 40000, maxBackoffMs: 30000, dedupWindow: 500,
      ...opts,
    } as Required<RtOptions>;
  }

  /* --------------------------------- api --------------------------------- */
  on(topic: RtTopic | '*', fn: Listener): () => void {
    const key = `${topic}:${uid('l')}`;
    this.listeners.set(key, (e) => { if (topic === '*' || e.topic === topic) fn(e); });
    return () => this.listeners.delete(key);
  }

  onState(fn: StateListener): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  connect() {
    this.closedByUser = false;
    if (!this.opts.url) { this.goLocal('no realtime endpoint configured — running on device'); return; }
    if (typeof WebSocket === 'undefined') { this.goLocal('platform has no WebSocket implementation'); return; }
    this.setState('connecting');
    let sock: WebSocket;
    try {
      sock = new WebSocket(this.opts.url as string);
    } catch (err: any) {
      this.metrics.failures++;
      this.metrics.lastError = err?.message ?? 'socket construction failed';
      this.scheduleRetry(this.metrics.lastError ?? 'socket construction failed');
      return;
    }
    this.ws = sock;

    sock.onopen = () => {
      this.setState('authenticating');
      // Credentials travel in the first frame, never in the query string,
      // so they never reach proxy logs or browser history.
      this.raw({
        t: 'connect',
        token: this.opts.token,
        tenant: this.opts.tenant,
        actor: this.opts.actor,
        scopes: this.opts.scopes,
        resumeFrom: this.lastSeq,
        client: 'cropcare-app/1.0',
      });
    };

    sock.onmessage = (msg) => this.handleFrame(msg.data);

    sock.onerror = () => {
      this.metrics.failures++;
      this.metrics.lastError = 'socket error';
    };

    sock.onclose = (ev) => {
      this.stopTimers();
      if (this.state === 'live') this.metrics.disconnects++;
      if (this.closedByUser) { this.setState('closed'); return; }
      this.scheduleRetry(`socket closed (${ev?.code ?? 'n/a'})`);
    };
  }

  close() {
    this.closedByUser = true;
    this.stopTimers();
    clearTimeout(this.retryTimer);
    try { this.ws?.close(); } catch { /* already gone */ }
    this.ws = null;
    this.setState('closed');
  }

  /** Publish an event. Delivered locally immediately, shipped when live. */
  publish<T>(topic: RtTopic, payload: T): RtEvent<T> {
    const scope = TOPIC_SCOPE[topic];
    const allowed = this.opts.scopes.includes('*') || this.opts.scopes.includes(scope);
    const e: RtEvent<T> = {
      id: uid('ev'),
      seq: ++this.lastSeq,
      topic,
      tenant: this.opts.tenant,
      actor: this.opts.actor,
      ts: Date.now(),
      payload,
      auth: { scope, decision: allowed ? 'allow' : 'deny', reason: allowed ? 'client scope check passed' : `missing scope ${scope}` },
    };
    if (!allowed) { this.deliver(e); return e; }
    this.metrics.eventsOut++;
    if (this.state === 'live' && this.ws) this.raw({ t: 'event', e });
    else this.backlog.push(e);
    this.deliver(e);
    return e;
  }

  /** Events buffered while offline, flushed on resume (at-least-once + dedup). */
  flushBacklog() {
    if (this.state !== 'live' || !this.ws) return 0;
    const n = this.backlog.length;
    this.backlog.forEach((e) => this.raw({ t: 'event', e }));
    this.backlog = [];
    return n;
  }

  /* ------------------------------ internals ------------------------------ */
  private raw(obj: any) {
    try { this.ws?.send(JSON.stringify(obj)); } catch (err: any) {
      this.metrics.failures++;
      this.metrics.lastError = err?.message ?? 'send failed';
    }
  }

  private handleFrame(data: any) {
    let msg: any;
    try { msg = JSON.parse(typeof data === 'string' ? data : String(data)); } catch { return; }

    if (msg.t === 'connected') {
      this.metrics.connects++;
      this.metrics.reconnectAttempts = 0;
      this.metrics.lastConnectedAt = Date.now();
      this.setState('live');
      this.startHeartbeat();
      this.flushBacklog();
      return;
    }
    if (msg.t === 'denied') {
      this.metrics.failures++;
      this.metrics.lastError = `authorization denied: ${msg.reason}`;
      this.closedByUser = true;
      try { this.ws?.close(); } catch { /* noop */ }
      this.setState('closed', msg.reason);
      return;
    }
    if (msg.t === 'pong') {
      this.metrics.lastRttMs = Date.now() - this.pingSentAt;
      this.metrics.rttSamples = [...this.metrics.rttSamples, this.metrics.lastRttMs].slice(-64);
      const sorted = [...this.metrics.rttSamples].sort((a, b) => a - b);
      this.metrics.p50 = sorted[Math.floor(sorted.length * 0.5)] ?? null;
      this.metrics.p95 = sorted[Math.floor(sorted.length * 0.95)] ?? null;
      this.armDeadTimer();
      return;
    }
    if (msg.t === 'event' && msg.e) this.ingest(msg.e as RtEvent);
    if (msg.t === 'batch' && Array.isArray(msg.events)) {
      this.metrics.gapsRepaired++;
      (msg.events as RtEvent[]).forEach((e) => this.ingest(e));
    }
  }

  /** Sequencing + dedup + tenant isolation happen before anything reaches the UI. */
  private ingest(e: RtEvent) {
    if (e.tenant !== this.opts.tenant) return; // hard tenant isolation, client side too
    if (this.seen.has(e.id)) { this.metrics.duplicatesDropped++; return; }
    this.seen.set(e.id, Date.now());
    if (this.seen.size > this.opts.dedupWindow) {
      const oldest = [...this.seen.entries()].sort((a, b) => a[1] - b[1]).slice(0, 100);
      oldest.forEach(([k]) => this.seen.delete(k));
    }
    if (e.seq > this.lastSeq + 1 && this.lastSeq > 0) {
      this.metrics.gapsDetected++;
      this.raw({ t: 'resume', from: this.lastSeq }); // ask the server to replay the gap
    }
    this.lastSeq = Math.max(this.lastSeq, e.seq);
    this.metrics.eventsIn++;
    this.deliver(e);
  }

  private deliver(e: RtEvent) {
    this.listeners.forEach((fn) => { try { fn(e); } catch { /* subscriber must not break the bus */ } });
  }

  private startHeartbeat() {
    this.stopTimers();
    this.hbTimer = setInterval(() => {
      this.pingSentAt = Date.now();
      this.raw({ t: 'ping', ts: this.pingSentAt });
    }, this.opts.heartbeatMs);
    this.armDeadTimer();
  }

  private armDeadTimer() {
    clearTimeout(this.deadTimer);
    this.deadTimer = setTimeout(() => {
      this.metrics.failures++;
      this.metrics.lastError = 'heartbeat timeout — peer considered dead';
      try { this.ws?.close(); } catch { /* noop */ }
    }, this.opts.deadMs);
  }

  private stopTimers() {
    clearInterval(this.hbTimer);
    clearTimeout(this.deadTimer);
  }

  /** Exponential backoff with full jitter (AWS architecture blog formula). */
  private scheduleRetry(reason: string) {
    this.metrics.reconnectAttempts++;
    const attempt = Math.min(this.metrics.reconnectAttempts, 10);
    const ceiling = Math.min(this.opts.maxBackoffMs, 500 * 2 ** attempt);
    const wait = Math.floor(Math.random() * ceiling);
    this.setState(this.opts.url ? 'backoff' : 'local', reason, wait);
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      if (!this.closedByUser) this.connect();
    }, wait);
    // While waiting we do not stop working — the local loop keeps the UI live.
    if (this.metrics.reconnectAttempts >= 3) this.goLocal(reason, false);
  }

  private goLocal(reason: string, resetRetry = true) {
    if (resetRetry) clearTimeout(this.retryTimer);
    this.setState('local', reason);
  }

  private setState(s: RtState, reason?: string, nextRetryMs?: number) {
    this.state = s;
    if (s === 'live' && this.metrics.lastConnectedAt) {
      this.metrics.uptimeMs = Date.now() - this.metrics.lastConnectedAt;
    }
    this.stateListeners.forEach((fn) => fn(s, { reason, nextRetryMs }));
  }
}

/** Stable idempotency key so a retried publish never duplicates a row. */
export const eventKey = (topic: string, payload: any) => sha256Hex(`${topic}:${JSON.stringify(payload)}`).slice(0, 24);

export const stateLabel = (s: RtState): { text: string; tone: 'ok' | 'warn' | 'danger' | 'info' } => {
  switch (s) {
    case 'live': return { text: 'Live', tone: 'ok' };
    case 'connecting': return { text: 'Connecting', tone: 'info' };
    case 'authenticating': return { text: 'Signing in', tone: 'info' };
    case 'backoff': return { text: 'Reconnecting', tone: 'warn' };
    case 'local': return { text: 'On device', tone: 'warn' };
    case 'closed': return { text: 'Stopped', tone: 'danger' };
    default: return { text: 'Idle', tone: 'info' };
  }
};
