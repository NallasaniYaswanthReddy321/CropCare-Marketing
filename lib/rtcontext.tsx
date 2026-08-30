/**
 * App-wide realtime provider.
 *
 * Owns one RealtimeClient for the whole process, keeps a rolling event log,
 * exposes live metrics, and turns device activity into real bus events so the
 * UI is driven by the same stream whether the edge server is reachable or not.
 */
import React from 'react';
import { AppState } from 'react-native';
import { RealtimeClient, RtEvent, RtMetrics, RtState, RtTopic } from './realtime';
import { issueToken } from './security';
import { useApp } from './store';
import { activeField, fieldIrrigation } from './derive';
import { compareMarkets } from './price';

export type RtCtxValue = {
  state: RtState;
  reason: string | null;
  nextRetryMs: number | null;
  metrics: RtMetrics;
  log: RtEvent[];
  publish: (topic: RtTopic, payload: any) => void;
  reconnect: () => void;
  stop: () => void;
  subscribe: (topic: RtTopic | '*', fn: (e: RtEvent) => void) => () => void;
  clearLog: () => void;
};

const noop = () => {};
export const RtCtx = React.createContext<RtCtxValue>({
  state: 'idle', reason: null, nextRetryMs: null,
  metrics: {} as RtMetrics, log: [], publish: noop, reconnect: noop, stop: noop,
  subscribe: () => noop, clearLog: noop,
});

export const useRealtime = () => React.useContext(RtCtx);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { s, set, audit } = useApp();
  const [state, setState] = React.useState<RtState>('idle');
  const [reason, setReason] = React.useState<string | null>(null);
  const [nextRetryMs, setNextRetryMs] = React.useState<number | null>(null);
  const [log, setLog] = React.useState<RtEvent[]>([]);
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const clientRef = React.useRef<RealtimeClient | null>(null);

  const tenant = s.profile.village || 'village';
  const actor = s.profile.id;
  const url = s.settings.airplane ? null : s.settings.realtimeUrl;

  /* one client for the app lifetime; rebuilt when identity or endpoint moves */
  React.useEffect(() => {
    if (!s.ready) return;
    const key = s.security.keys[0];
    const { token } = issueToken(key, { sub: actor, tenant, role: s.profile.role }, 3600);
    const c = new RealtimeClient({
      url,
      token,
      tenant,
      actor,
      scopes: ['scan:read', 'advisor:read', 'sync:read', 'outbreak:read', 'field:read', 'market:read', 'weather:read', 'presence:read'],
    });
    clientRef.current = c;

    const offState = c.onState((st, info) => {
      setState(st);
      setReason(info.reason ?? null);
      setNextRetryMs(info.nextRetryMs ?? null);
      force();
    });
    const offEvent = c.on('*', (e) => {
      setLog((prev) => [e, ...prev].slice(0, 200));
      force();
    });
    c.connect();

    return () => { offState(); offEvent(); c.close(); };
  }, [s.ready, url, actor, tenant]);

  /* reconnect immediately when the app returns to the foreground */
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && clientRef.current && clientRef.current.state !== 'live') clientRef.current.connect();
    });
    return () => sub.remove();
  }, []);

  /* device-originated events: these are real, they simply originate here */
  React.useEffect(() => {
    if (!s.ready || !clientRef.current) return;
    const c = clientRef.current;
    const f = activeField(s);

    const emitTicks = () => {
      try {
        const irr = fieldIrrigation(f);
        c.publish('weather.tick', {
          field: f.id, et0: irr.et0, etc: irr.etc, depletionPct: irr.depletionPct,
          irrigateNow: irr.irrigateNow, stage: irr.stage,
        });
        const mk = compareMarkets({ crop: f.crop, qualityScore: 74, grade: 'B', quantityQuintal: 20, vehicleId: 'tempo' });
        c.publish('price.tick', {
          crop: f.crop, best: mk[0].mandi.name, netPerQ: mk[0].netPerQ, net: mk[0].net, rank: mk.slice(0, 3).map((m) => m.mandi.name),
        });
        c.publish('sync.status', {
          pending: s.outbox.filter((o) => o.status === 'pending').length,
          sent: s.outbox.filter((o) => o.status === 'sent').length,
          peers: s.peers.length,
        });
      } catch { /* a tick must never crash the app */ }
    };

    emitTicks();
    const id = setInterval(emitTicks, 20000);
    return () => clearInterval(id);
  }, [s.ready, s.activeFieldId, s.outbox.length]);

  const value: RtCtxValue = {
    state,
    reason,
    nextRetryMs,
    metrics: clientRef.current?.metrics ?? ({} as RtMetrics),
    log,
    publish: (topic, payload) => {
      clientRef.current?.publish(topic, payload);
      audit({ actor, action: `rt:${topic}`, resource: `tenant:${tenant}`, outcome: 'info' });
    },
    reconnect: () => clientRef.current?.connect(),
    stop: () => clientRef.current?.close(),
    subscribe: (topic, fn) => clientRef.current?.on(topic, fn) ?? noop,
    clearLog: () => setLog([]),
  };

  return <RtCtx.Provider value={value}>{children}</RtCtx.Provider>;
}
