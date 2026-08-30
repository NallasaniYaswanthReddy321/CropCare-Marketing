"""SQLite persistence with a hash-chained audit trail (SQLCipher-compatible schema)."""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import time
from typing import Any, Dict, List, Optional

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("CROPCARE_DB", os.path.join(HERE, "cropcare.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS scans (
    id            TEXT PRIMARY KEY,
    created_at    REAL NOT NULL,
    kind          TEXT NOT NULL CHECK (kind IN ('quality','disease')),
    crop          TEXT NOT NULL,
    filename      TEXT NOT NULL,
    sha256        TEXT NOT NULL,
    phash         TEXT NOT NULL,
    score         INTEGER,
    grade         TEXT,
    quantity_q    REAL,
    price_low     INTEGER,
    price_mid     INTEGER,
    price_high    INTEGER,
    best_mandi    TEXT,
    best_net      INTEGER,
    payload       TEXT NOT NULL,
    owner_id      TEXT NOT NULL DEFAULT 'local'
);
CREATE INDEX IF NOT EXISTS idx_scans_created ON scans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_owner   ON scans(owner_id);

CREATE TABLE IF NOT EXISTS audit (
    seq       INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        REAL NOT NULL,
    actor     TEXT NOT NULL,
    action    TEXT NOT NULL,
    resource  TEXT NOT NULL,
    outcome   TEXT NOT NULL,
    meta      TEXT,
    prev_hash TEXT NOT NULL,
    hash      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS security_events (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    ts       REAL NOT NULL,
    ip       TEXT,
    kind     TEXT NOT NULL,
    detail   TEXT,
    severity TEXT NOT NULL DEFAULT 'medium'
);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)


def insert_scan(row: Dict[str, Any]) -> None:
    with connect() as conn:
        conn.execute(
            """INSERT INTO scans (id, created_at, kind, crop, filename, sha256, phash, score, grade,
                                  quantity_q, price_low, price_mid, price_high, best_mandi, best_net, payload, owner_id)
               VALUES (:id, :created_at, :kind, :crop, :filename, :sha256, :phash, :score, :grade,
                       :quantity_q, :price_low, :price_mid, :price_high, :best_mandi, :best_net, :payload, :owner_id)""",
            row,
        )


def get_scan(scan_id: str) -> Optional[dict]:
    with connect() as conn:
        r = conn.execute("SELECT * FROM scans WHERE id = ?", (scan_id,)).fetchone()
        return dict(r) if r else None


def list_scans(limit: int = 40) -> List[dict]:
    with connect() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM scans ORDER BY created_at DESC LIMIT ?", (limit,))]


def known_phashes() -> List[str]:
    with connect() as conn:
        return [r[0] for r in conn.execute("SELECT phash FROM scans")]


def audit(actor: str, action: str, resource: str, outcome: str, meta: Any = None) -> str:
    """Append to the hash-chained audit log; returns the new head hash."""
    with connect() as conn:
        row = conn.execute("SELECT hash FROM audit ORDER BY seq DESC LIMIT 1").fetchone()
        prev = row["hash"] if row else "0" * 64
        ts = time.time()
        body = json.dumps(
            {"ts": ts, "actor": actor, "action": action, "resource": resource, "outcome": outcome,
             "meta": meta, "prev": prev},
            sort_keys=True, separators=(",", ":"),
        )
        h = hashlib.sha256(body.encode()).hexdigest()
        conn.execute(
            "INSERT INTO audit (ts, actor, action, resource, outcome, meta, prev_hash, hash) VALUES (?,?,?,?,?,?,?,?)",
            (ts, actor, action, resource, outcome, json.dumps(meta) if meta is not None else None, prev, h),
        )
        return h


def verify_audit() -> dict:
    with connect() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM audit ORDER BY seq ASC")]
    prev = "0" * 64
    for r in rows:
        body = json.dumps(
            {"ts": r["ts"], "actor": r["actor"], "action": r["action"], "resource": r["resource"],
             "outcome": r["outcome"], "meta": json.loads(r["meta"]) if r["meta"] else None, "prev": prev},
            sort_keys=True, separators=(",", ":"),
        )
        if hashlib.sha256(body.encode()).hexdigest() != r["hash"] or r["prev_hash"] != prev:
            return {"ok": False, "broken_at": r["seq"], "blocks": len(rows)}
        prev = r["hash"]
    return {"ok": True, "broken_at": None, "blocks": len(rows)}


def security_event(ip: str, kind: str, detail: str, severity: str = "medium") -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO security_events (ts, ip, kind, detail, severity) VALUES (?,?,?,?,?)",
            (time.time(), ip, kind, detail, severity),
        )


def recent_security_events(limit: int = 20) -> List[dict]:
    with connect() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM security_events ORDER BY ts DESC LIMIT ?", (limit,))]
