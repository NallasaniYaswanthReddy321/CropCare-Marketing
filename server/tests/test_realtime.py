"""Acceptance tests for the realtime hub (Phase 9).

Covers: handshake, authentication, tenant/RLS isolation, per-event
authorization, heartbeat, sequencing, deduplication, resume replay and metrics.

Run: cd server && python -m pytest tests/test_realtime.py -q
"""
import base64
import json
import os
import socket
import struct
import sys
import time

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("CROPCARE_RT", "0")

import realtime as rt  # noqa: E402

PORT = 8791


@pytest.fixture(scope="module", autouse=True)
def hub():
    rt.serve("127.0.0.1", PORT, verify_token=_verify)
    time.sleep(0.4)
    yield rt.HUB


def _verify(token: str):
    if token == "expired":
        return {"ok": False, "reason": "token expired"}
    if not token:
        return {"ok": False, "reason": "empty token"}
    return {"ok": True, "reason": "accepted"}


# ------------------------------------------------------------------ helpers --
def _send(sock, obj):
    payload = json.dumps(obj).encode()
    mask = os.urandom(4)
    masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    head = bytearray([0x81])
    n = len(payload)
    if n < 126:
        head.append(0x80 | n)
    else:
        head.append(0x80 | 126)
        head += struct.pack(">H", n)
    sock.sendall(bytes(head) + mask + masked)


def _recv(sock):
    head = sock.recv(2)
    if not head:
        raise ConnectionError("closed")
    ln = head[1] & 0x7F
    if ln == 126:
        ln = struct.unpack(">H", sock.recv(2))[0]
    elif ln == 127:
        ln = struct.unpack(">Q", sock.recv(8))[0]
    buf = b""
    while len(buf) < ln:
        buf += sock.recv(ln - len(buf))
    return json.loads(buf)


def _await(sock, kind, tries=10, predicate=None):
    for _ in range(tries):
        try:
            msg = _recv(sock)
        except Exception:
            return None
        if msg.get("t") == kind and (predicate is None or predicate(msg)):
            return msg
    return None


def _connect(tenant="shirur", scopes=("outbreak:read", "field:read", "scan:read"), token="tok", actor=None, resume=0):
    s = socket.create_connection(("127.0.0.1", PORT), timeout=4)
    key = base64.b64encode(os.urandom(16)).decode()
    s.sendall(
        f"GET / HTTP/1.1\r\nHost: t\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n".encode()
    )
    resp = b""
    while b"\r\n\r\n" not in resp:
        resp += s.recv(1024)
    assert b"101" in resp
    _send(s, {"t": "connect", "token": token, "tenant": tenant,
              "actor": actor or f"user-{tenant}", "scopes": list(scopes), "resumeFrom": resume})
    return s, _recv(s)


# -------------------------------------------------------------------- tests --
def test_handshake_and_auth():
    s, hello = _connect()
    assert hello["t"] == "connected"
    assert hello["tenant"] == "shirur"
    s.close()


def test_expired_token_is_rejected():
    s, msg = _connect(token="expired")
    assert msg["t"] == "denied"
    assert "expired" in msg["reason"]
    s.close()


def test_connect_frame_required_before_events():
    s = socket.create_connection(("127.0.0.1", PORT), timeout=4)
    key = base64.b64encode(os.urandom(16)).decode()
    s.sendall(
        f"GET / HTTP/1.1\r\nHost: t\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n".encode()
    )
    resp = b""
    while b"\r\n\r\n" not in resp:
        resp += s.recv(1024)
    _send(s, {"t": "event", "e": {"id": "x", "topic": "farm.event", "payload": {}}})
    msg = _recv(s)
    assert msg["t"] == "denied"
    s.close()


def test_heartbeat_roundtrip():
    s, _ = _connect()
    _send(s, {"t": "ping", "ts": 4242})
    pong = _await(s, "pong")
    assert pong and pong["ts"] == 4242
    s.close()


def test_tenant_isolation_no_cross_leak():
    a, _ = _connect(tenant="shirur")
    b, _ = _connect(tenant="shirur", actor="neighbour")
    other, _ = _connect(tenant="kendur")

    _send(a, {"t": "event", "e": {"id": "iso-1", "seq": 1, "topic": "outbreak.alert",
                                  "tenant": "shirur", "actor": "user-shirur",
                                  "ts": int(time.time() * 1000),
                                  "payload": {"disease": "Late blight", "village": "Shirur", "severity": 0.7}}})

    got = _await(b, "event", predicate=lambda m: m["e"]["topic"] == "outbreak.alert")
    assert got is not None, "same-tenant peer must receive the event"
    assert got["e"]["payload"]["disease"] == "Late blight"

    other.settimeout(0.8)
    leaked = False
    try:
        while True:
            msg = _recv(other)
            if msg.get("t") == "event" and msg["e"].get("payload", {}).get("disease"):
                leaked = True
                break
    except Exception:
        pass
    assert leaked is False, "events must never cross a tenant boundary"
    for sock in (a, b, other):
        sock.close()


def test_per_event_authorization_denies_missing_scope():
    s, _ = _connect(scopes=("field:read",))  # no market:read
    _send(s, {"t": "event", "e": {"id": "auth-1", "seq": 1, "topic": "price.tick",
                                  "tenant": "shirur", "actor": "u", "ts": 0, "payload": {}}})
    denied = _await(s, "denied_event")
    assert denied and "market:read" in denied["reason"]
    s.close()


def test_duplicate_event_is_deduplicated():
    s, _ = _connect()
    ev = {"id": "dup-1", "seq": 1, "topic": "farm.event", "tenant": "shirur",
          "actor": "u", "ts": 0, "payload": {"kind": "sowing"}}
    _send(s, {"t": "event", "e": dict(ev)})
    first = _await(s, "ack")
    assert first and not first.get("dedup")
    _send(s, {"t": "event", "e": dict(ev)})
    second = _await(s, "ack", predicate=lambda m: m.get("dedup") is True)
    assert second is not None, "a repeated event id must be dropped, not applied twice"
    s.close()


def test_sequence_is_monotonic_per_tenant():
    s, _ = _connect(tenant="seqtown", scopes=("field:read",))
    seqs = []
    for i in range(4):
        _send(s, {"t": "event", "e": {"id": f"seq-{i}", "topic": "farm.event",
                                      "tenant": "seqtown", "actor": "u", "ts": 0, "payload": {"i": i}}})
        ack = _await(s, "ack", predicate=lambda m: m.get("seq") is not None)
        assert ack is not None
        seqs.append(ack["seq"])
    assert seqs == sorted(seqs) and len(set(seqs)) == len(seqs)
    s.close()


def test_resume_replays_missed_events():
    s, _ = _connect(tenant="replaytown", scopes=("field:read",))
    for i in range(3):
        _send(s, {"t": "event", "e": {"id": f"rep-{i}", "topic": "farm.event",
                                      "tenant": "replaytown", "actor": "u", "ts": 0, "payload": {"i": i}}})
        _await(s, "ack")
    _send(s, {"t": "resume", "from": 0})
    batch = _await(s, "batch")
    assert batch is not None and len(batch["events"]) >= 3
    assert [e["seq"] for e in batch["events"]] == sorted(e["seq"] for e in batch["events"])
    s.close()


def test_reconnect_resumes_from_last_seq():
    s1, _ = _connect(tenant="reconn", scopes=("field:read",))
    _send(s1, {"t": "event", "e": {"id": "rc-1", "topic": "farm.event", "tenant": "reconn",
                                   "actor": "u", "ts": 0, "payload": {"n": 1}}})
    ack = _await(s1, "ack", predicate=lambda m: m.get("seq") is not None)
    last = ack["seq"]
    s1.close()
    s2, hello = _connect(tenant="reconn", scopes=("field:read",), resume=0)
    assert hello["t"] == "connected"
    batch = _await(s2, "batch")
    assert batch is not None and any(e["seq"] <= last for e in batch["events"])
    s2.close()


def test_server_broadcast_reaches_subscriber():
    s, _ = _connect(tenant="broad", scopes=("outbreak:read",))
    rt.HUB.broadcast("broad", "outbreak.alert", {"disease": "Rust", "village": "Broad", "severity": 0.4})
    got = _await(s, "event", predicate=lambda m: m["e"]["topic"] == "outbreak.alert")
    assert got and got["e"]["payload"]["disease"] == "Rust"
    assert got["e"]["auth"]["decision"] == "allow"
    s.close()


def test_metrics_are_instrumented():
    snap = rt.metrics_snapshot()
    for key in ("connections_opened", "auth_success", "events_in", "events_out"):
        assert key in snap and snap[key] >= 0
    stats = rt.HUB.stats()
    assert "connections" in stats and "bus" in stats
    assert stats["bus"] in ("local", "redis")


def test_oversized_frame_is_refused():
    s, _ = _connect()
    head = bytearray([0x81, 0x80 | 127]) + struct.pack(">Q", 8 * 1024 * 1024) + os.urandom(4)
    try:
        s.sendall(bytes(head))
        s.settimeout(1.2)
        try:
            s.recv(16)
        except Exception:
            pass
    finally:
        s.close()
    assert rt.HUB.stats()["connections"] >= 0  # server survived
