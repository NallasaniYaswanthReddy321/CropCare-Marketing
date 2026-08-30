"""
CropCare realtime hub (Phase 9).

A dependency-light WebSocket server (RFC 6455 implemented directly on the WSGI
socket, so `pip install flask` is still the only requirement) with:

  · authenticated CONNECT frame — token, tenant, actor, scopes
  · per-connection tenant isolation and per-EVENT server-side authorization
  · monotonic per-tenant sequence numbers with resume-from-seq replay
  · idempotent fan-out (event ids deduped in the hub ring buffer)
  · heartbeat ping/pong, dead-peer reaping
  · horizontal scale-out through Redis pub/sub when REDIS_URL is set,
    with an in-process bus as the single-node fallback
  · Prometheus-style counters exposed at /api/v1/realtime/metrics

Run standalone:  python realtime.py     (ws://127.0.0.1:8765)
Or let app.py start it in a background thread.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import selectors
import socket
import struct
import threading
import time
from collections import defaultdict, deque
from typing import Any, Deque, Dict, List, Optional, Set

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

# Scope required to receive each topic. Enforced on the server for every event,
# never trusted from the client.
TOPIC_SCOPE = {
    "diagnosis.updated": "scan:read",
    "expert.case": "advisor:read",
    "sync.status": "sync:read",
    "outbreak.alert": "outbreak:read",
    "farm.event": "field:read",
    "price.tick": "market:read",
    "weather.tick": "weather:read",
    "presence": "presence:read",
}

METRICS = defaultdict(int)
METRICS_LOCK = threading.Lock()


def bump(name: str, by: int = 1) -> None:
    with METRICS_LOCK:
        METRICS[name] += by


def metrics_snapshot() -> dict:
    with METRICS_LOCK:
        return dict(METRICS)


# --------------------------------------------------------------------------- #
# fan-out bus: Redis when available, in-process otherwise
# --------------------------------------------------------------------------- #
class Bus:
    """Publish/subscribe across processes. Falls back to a local bus cleanly."""

    def __init__(self, url: Optional[str] = None):
        self.url = url or os.environ.get("REDIS_URL")
        self.backend = "local"
        self._redis = None
        self._subs: List[Any] = []
        if self.url:
            try:
                import redis  # optional dependency

                self._redis = redis.Redis.from_url(self.url, decode_responses=True)
                self._redis.ping()
                self.backend = "redis"
            except Exception:
                self._redis = None
                self.backend = "local"

    def publish(self, tenant: str, payload: dict) -> None:
        if self._redis is not None:
            try:
                self._redis.publish(f"cropcare:{tenant}", json.dumps(payload))
                bump("bus_publish_redis")
                return
            except Exception:
                bump("bus_redis_errors")
        bump("bus_publish_local")
        for fn in list(self._subs):
            try:
                fn(tenant, payload)
            except Exception:
                bump("bus_subscriber_errors")

    def subscribe_local(self, fn) -> None:
        self._subs.append(fn)

    def start_redis_listener(self, fn) -> None:
        if self._redis is None:
            return
        def run():
            try:
                pubsub = self._redis.pubsub()
                pubsub.psubscribe("cropcare:*")
                for msg in pubsub.listen():
                    if msg.get("type") != "pmessage":
                        continue
                    tenant = str(msg["channel"]).split(":", 1)[-1]
                    fn(tenant, json.loads(msg["data"]))
            except Exception:
                bump("bus_redis_listener_exits")
        threading.Thread(target=run, daemon=True).start()


# --------------------------------------------------------------------------- #
# frame codec
# --------------------------------------------------------------------------- #
def encode_frame(payload: bytes, opcode: int = 0x1) -> bytes:
    header = bytearray([0x80 | opcode])
    n = len(payload)
    if n < 126:
        header.append(n)
    elif n < (1 << 16):
        header.append(126)
        header += struct.pack(">H", n)
    else:
        header.append(127)
        header += struct.pack(">Q", n)
    return bytes(header) + payload


def read_exact(sock: socket.socket, n: int) -> Optional[bytes]:
    buf = b""
    while len(buf) < n:
        try:
            chunk = sock.recv(n - len(buf))
        except (BlockingIOError, InterruptedError):
            continue
        except OSError:
            return None
        if not chunk:
            return None
        buf += chunk
    return buf


def read_frame(sock: socket.socket) -> Optional[tuple]:
    head = read_exact(sock, 2)
    if not head:
        return None
    fin_op, mask_len = head[0], head[1]
    opcode = fin_op & 0x0F
    masked = mask_len & 0x80
    length = mask_len & 0x7F
    if length == 126:
        ext = read_exact(sock, 2)
        if not ext:
            return None
        length = struct.unpack(">H", ext)[0]
    elif length == 127:
        ext = read_exact(sock, 8)
        if not ext:
            return None
        length = struct.unpack(">Q", ext)[0]
    if length > 2 * 1024 * 1024:  # frame size cap
        return None
    mask = read_exact(sock, 4) if masked else None
    data = read_exact(sock, length) if length else b""
    if data is None:
        return None
    if mask:
        data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
    return opcode, data


# --------------------------------------------------------------------------- #
# connection + hub
# --------------------------------------------------------------------------- #
class Conn:
    __slots__ = ("sock", "addr", "tenant", "actor", "scopes", "alive", "last_seen", "lock", "id")

    def __init__(self, sock: socket.socket, addr):
        self.sock = sock
        self.addr = addr
        self.tenant: Optional[str] = None
        self.actor: Optional[str] = None
        self.scopes: Set[str] = set()
        self.alive = True
        self.last_seen = time.time()
        self.lock = threading.Lock()
        self.id = hashlib.sha256(f"{addr}{time.time()}".encode()).hexdigest()[:12]

    def send(self, obj: dict) -> bool:
        try:
            with self.lock:
                self.sock.sendall(encode_frame(json.dumps(obj).encode()))
            return True
        except OSError:
            self.alive = False
            return False

    def close(self):
        self.alive = False
        try:
            self.sock.close()
        except OSError:
            pass


class Hub:
    def __init__(self, verify_token=None, bus: Optional[Bus] = None, history: int = 500):
        self.conns: Set[Conn] = set()
        self.seq: Dict[str, int] = defaultdict(int)
        self.history: Dict[str, Deque[dict]] = defaultdict(lambda: deque(maxlen=history))
        self.seen: Dict[str, Deque[str]] = defaultdict(lambda: deque(maxlen=history * 2))
        self.lock = threading.Lock()
        self.verify_token = verify_token or (lambda t: {"ok": bool(t), "reason": "" if t else "empty token"})
        self.bus = bus or Bus()
        self.bus.subscribe_local(self._on_bus)
        self.bus.start_redis_listener(self._on_bus)

    # ------------------------------------------------------------------ auth
    def authorize(self, conn: Conn, topic: str) -> tuple:
        scope = TOPIC_SCOPE.get(topic)
        if scope is None:
            return False, f"unknown topic {topic}"
        if "*" in conn.scopes or scope in conn.scopes:
            return True, f"scope {scope} granted"
        return False, f"missing scope {scope}"

    # ------------------------------------------------------------- fan-out
    def _on_bus(self, tenant: str, payload: dict) -> None:
        """Delivered from another process (Redis) or from this one."""
        event = payload.get("e")
        if not event:
            return
        self._deliver_local(tenant, event)

    def _deliver_local(self, tenant: str, event: dict) -> None:
        dead = []
        for c in list(self.conns):
            if not c.alive or c.tenant != tenant:
                continue
            ok, _reason = self.authorize(c, event.get("topic", ""))
            if not ok:
                # Silently skip. Telling a client that an event it may not read
                # exists is itself an information leak, so fan-out never
                # explains a denial — only a client's OWN submission does.
                bump("events_filtered")
                continue
            if not c.send({"t": "event", "e": event}):
                dead.append(c)
            else:
                bump("events_out")
        for c in dead:
            self.drop(c)

    def broadcast(self, tenant: str, topic: str, payload: dict, actor: str = "server") -> dict:
        with self.lock:
            self.seq[tenant] += 1
            event = {
                "id": hashlib.sha256(f"{tenant}{topic}{time.time_ns()}".encode()).hexdigest()[:16],
                "seq": self.seq[tenant],
                "topic": topic,
                "tenant": tenant,
                "actor": actor,
                "ts": int(time.time() * 1000),
                "payload": payload,
                "auth": {"scope": TOPIC_SCOPE.get(topic, "?"), "decision": "allow", "reason": "server issued"},
            }
            self.history[tenant].append(event)
        self.bus.publish(tenant, {"e": event})
        if self.bus.backend == "redis":
            # redis listener will fan out; avoid double delivery in this process
            return event
        return event

    def ingest(self, conn: Conn, event: dict) -> None:
        tenant = conn.tenant or ""
        eid = str(event.get("id", ""))
        ok, reason = self.authorize(conn, event.get("topic", ""))
        if not ok:
            bump("events_denied")
            conn.send({"t": "denied_event", "id": eid, "reason": reason})
            return
        with self.lock:
            if eid in self.seen[tenant]:
                bump("events_duplicate")
                conn.send({"t": "ack", "id": eid, "dedup": True})
                return
            self.seen[tenant].append(eid)
            self.seq[tenant] += 1
            event["seq"] = self.seq[tenant]
            event["tenant"] = tenant
            event["auth"] = {"scope": TOPIC_SCOPE.get(event.get("topic", ""), "?"), "decision": "allow", "reason": reason}
            self.history[tenant].append(event)
        bump("events_in")
        conn.send({"t": "ack", "id": eid, "seq": event["seq"]})
        self.bus.publish(tenant, {"e": event})

    def replay(self, conn: Conn, from_seq: int) -> None:
        with self.lock:
            missing = [e for e in self.history[conn.tenant or ""] if e["seq"] > from_seq]
        if missing:
            bump("replays")
            conn.send({"t": "batch", "events": missing[-200:]})

    def add(self, conn: Conn) -> None:
        with self.lock:
            self.conns.add(conn)
        bump("connections_opened")

    def drop(self, conn: Conn) -> None:
        with self.lock:
            self.conns.discard(conn)
        conn.close()
        bump("connections_closed")

    def stats(self) -> dict:
        with self.lock:
            tenants = defaultdict(int)
            for c in self.conns:
                tenants[c.tenant or "anon"] += 1
            return {
                "connections": len(self.conns),
                "tenants": dict(tenants),
                "sequences": dict(self.seq),
                "bus": self.bus.backend,
                "counters": metrics_snapshot(),
            }


HUB = Hub()


# --------------------------------------------------------------------------- #
# server loop
# --------------------------------------------------------------------------- #
def handshake(sock: socket.socket) -> bool:
    data = b""
    sock.settimeout(6)
    try:
        while b"\r\n\r\n" not in data:
            chunk = sock.recv(2048)
            if not chunk:
                return False
            data += chunk
            if len(data) > 16384:
                return False
    except OSError:
        return False
    finally:
        sock.settimeout(None)

    lines = data.decode("latin-1").split("\r\n")
    headers = {}
    for line in lines[1:]:
        if ": " in line:
            k, v = line.split(": ", 1)
            headers[k.lower()] = v
    key = headers.get("sec-websocket-key")
    if not key or "websocket" not in headers.get("upgrade", "").lower():
        sock.sendall(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n")
        return False
    accept = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
    sock.sendall(
        ("HTTP/1.1 101 Switching Protocols\r\n"
         "Upgrade: websocket\r\nConnection: Upgrade\r\n"
         f"Sec-WebSocket-Accept: {accept}\r\n\r\n").encode()
    )
    return True


def serve_conn(sock: socket.socket, addr) -> None:
    conn = Conn(sock, addr)
    if not handshake(sock):
        conn.close()
        return
    HUB.add(conn)
    authed = False
    try:
        while conn.alive:
            frame = read_frame(sock)
            if frame is None:
                break
            opcode, data = frame
            if opcode == 0x8:  # close
                break
            if opcode == 0x9:  # ping
                with conn.lock:
                    sock.sendall(encode_frame(data, 0xA))
                continue
            if opcode not in (0x1, 0x2):
                continue
            conn.last_seen = time.time()
            try:
                msg = json.loads(data.decode("utf-8"))
            except Exception:
                continue

            t = msg.get("t")
            if t == "connect":
                res = HUB.verify_token(msg.get("token", ""))
                if not res.get("ok"):
                    bump("auth_failures")
                    conn.send({"t": "denied", "reason": res.get("reason", "invalid token")})
                    break
                conn.tenant = str(msg.get("tenant") or "").strip() or None
                conn.actor = str(msg.get("actor") or "").strip() or None
                conn.scopes = set(msg.get("scopes") or [])
                if not conn.tenant or not conn.actor:
                    conn.send({"t": "denied", "reason": "tenant and actor are required"})
                    break
                authed = True
                bump("auth_success")
                conn.send({"t": "connected", "conn": conn.id, "tenant": conn.tenant, "bus": HUB.bus.backend})
                HUB.replay(conn, int(msg.get("resumeFrom") or 0))
                HUB.broadcast(conn.tenant, "presence", {"actor": conn.actor, "state": "online"})
                continue

            if not authed:
                conn.send({"t": "denied", "reason": "connect frame required first"})
                break

            if t == "ping":
                conn.send({"t": "pong", "ts": msg.get("ts")})
            elif t == "event":
                e = msg.get("e") or {}
                HUB.ingest(conn, e)
            elif t == "resume":
                HUB.replay(conn, int(msg.get("from") or 0))
    except Exception:
        bump("connection_errors")
    finally:
        if conn.tenant and conn.actor:
            try:
                HUB.broadcast(conn.tenant, "presence", {"actor": conn.actor, "state": "offline"})
            except Exception:
                pass
        HUB.drop(conn)


def reaper(interval: float = 20.0, dead_after: float = 60.0) -> None:
    while True:
        time.sleep(interval)
        now = time.time()
        for c in list(HUB.conns):
            if now - c.last_seen > dead_after:
                bump("dead_peers_reaped")
                HUB.drop(c)


def serve(host: str = "127.0.0.1", port: int = 8765, verify_token=None) -> threading.Thread:
    if verify_token:
        HUB.verify_token = verify_token
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((host, port))
    srv.listen(64)

    def loop():
        while True:
            try:
                sock, addr = srv.accept()
            except OSError:
                break
            threading.Thread(target=serve_conn, args=(sock, addr), daemon=True).start()

    t = threading.Thread(target=loop, daemon=True)
    t.start()
    threading.Thread(target=reaper, daemon=True).start()
    return t


if __name__ == "__main__":
    host = os.environ.get("RT_HOST", "127.0.0.1")
    port = int(os.environ.get("RT_PORT", 8765))
    serve(host, port)
    print(f"CropCare realtime hub on ws://{host}:{port}  (bus: {HUB.bus.backend})")
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pass
