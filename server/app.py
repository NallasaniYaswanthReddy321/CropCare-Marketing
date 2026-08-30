#!/usr/bin/env python3
"""
CropCare / AgriPrice — standalone Flask + SQLite application.

    python app.py            → http://127.0.0.1:5000

Pipeline:  produce photo → visual quality features (OpenCV-equivalent, NumPy)
           → Quality Score 0-100 + Grade A/B/C + explanation
           → price_model.pkl → PRICE RANGE (never a guaranteed price) + gross value
           → market comparison ranked by NET value (revenue − transport − loss)
           → sell now / +2 d / +5 d simulator, labelled "AI estimate".

Security: upload magic-byte + polyglot + size validation, per-IP token bucket,
WAF signature middleware, SSRF allowlist for outbound calls, HMAC webhooks,
hash-chained audit log, strict security headers, no secrets in logs.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import time
import uuid
from datetime import date
from typing import Dict, Tuple
from urllib.parse import urlparse

from flask import (Flask, abort, jsonify, redirect, render_template, request,
                   send_from_directory, url_for)
from werkzeug.utils import secure_filename

import db
import price as price_engine
import realtime as rt
import vision

HERE = os.path.dirname(os.path.abspath(__file__))
UPLOADS = os.path.join(HERE, "uploads")
MAX_UPLOAD = 8 * 1024 * 1024

app = Flask(__name__)
app.config.update(
    MAX_CONTENT_LENGTH=MAX_UPLOAD,
    SECRET_KEY=os.environ.get("CROPCARE_SECRET", uuid.uuid4().hex),
    JSON_SORT_KEYS=False,
)
WEBHOOK_SECRET = os.environ.get("CROPCARE_WEBHOOK_SECRET", "whsec_village_edge")

os.makedirs(UPLOADS, exist_ok=True)
db.init()


@app.template_filter("timestamp")
def _timestamp(value):
    return time.strftime("%d %b %H:%M", time.localtime(float(value)))


# --------------------------------------------------------------------------- #
# realtime hub
# --------------------------------------------------------------------------- #
def _verify_rt_token(token: str) -> dict:
    """Structural + expiry validation of the compact JWS presented on CONNECT."""
    parts = (token or "").split(".")
    if len(parts) != 3:
        return {"ok": False, "reason": "malformed token"}
    try:
        pad = lambda s: s + "=" * (-len(s) % 4)
        header = json.loads(base64.urlsafe_b64decode(pad(parts[0])))
        payload = json.loads(base64.urlsafe_b64decode(pad(parts[1])))
    except Exception:
        return {"ok": False, "reason": "undecodable token"}
    if header.get("alg") not in ("EdDSA", "RS256"):
        return {"ok": False, "reason": f"algorithm {header.get('alg')} rejected"}
    now = time.time()
    if float(payload.get("exp", 0)) < now:
        return {"ok": False, "reason": "token expired"}
    if float(payload.get("nbf", 0)) > now + 5:
        return {"ok": False, "reason": "token not yet valid"}
    if not payload.get("sub"):
        return {"ok": False, "reason": "token has no subject"}
    return {"ok": True, "reason": "accepted", "sub": payload.get("sub")}


RT_PORT = int(os.environ.get("RT_PORT", 8765))
RT_HOST = os.environ.get("RT_HOST", "127.0.0.1")
if os.environ.get("CROPCARE_RT", "1") == "1":
    try:
        rt.serve(RT_HOST, RT_PORT, verify_token=_verify_rt_token)
    except OSError:
        pass  # port already bound by another worker


@app.get("/api/v1/realtime/stats")
def api_rt_stats():
    stats = rt.HUB.stats()
    stats["endpoint"] = f"ws://{RT_HOST}:{RT_PORT}"
    return jsonify(stats)


@app.get("/api/v1/realtime/metrics")
def api_rt_metrics():
    """Prometheus text exposition of socket counters."""
    snap = rt.metrics_snapshot()
    stats = rt.HUB.stats()
    lines = [
        "# HELP cropcare_ws_connections Currently open authenticated sockets",
        "# TYPE cropcare_ws_connections gauge",
        f"cropcare_ws_connections {stats['connections']}",
    ]
    for k, v in sorted(snap.items()):
        lines.append(f"# TYPE cropcare_{k} counter")
        lines.append(f"cropcare_{k} {v}")
    return app.response_class("\n".join(lines) + "\n", mimetype="text/plain; version=0.0.4")


@app.post("/api/v1/realtime/publish")
def api_rt_publish():
    body = request.get_json(silent=True) or {}
    tenant = str(body.get("tenant") or "").strip()
    topic = str(body.get("topic") or "").strip()
    if not tenant or topic not in rt.TOPIC_SCOPE:
        return jsonify({"error": "tenant and a known topic are required", "topics": sorted(rt.TOPIC_SCOPE)}), 422
    event = rt.HUB.broadcast(tenant, topic, body.get("payload") or {}, actor=body.get("actor", "api"))
    db.audit(body.get("actor", "api"), f"rt:{topic}", f"tenant:{tenant}", "allow", {"seq": event["seq"]})
    return jsonify({"published": True, "event": event})


# --------------------------------------------------------------------------- #
# OTP issuing endpoint used by the mobile app when a gateway is configured
# --------------------------------------------------------------------------- #
_OTP_STORE: Dict[str, dict] = {}


@app.post("/api/v1/auth/otp")
def api_auth_otp():
    body = request.get_json(silent=True) or {}
    dest = str(body.get("destination") or "").strip()
    challenge = str(body.get("challenge") or "").strip()
    digest = str(body.get("hash") or "").strip()
    if not dest or not challenge or len(digest) != 64:
        return jsonify({"error": "destination, challenge and hash are required"}), 422
    ip = request.remote_addr or "?"
    recent = [v for v in _OTP_STORE.values() if v["ip"] == ip and time.time() - v["at"] < 60]
    if len(recent) >= 3:
        db.security_event(ip, "otp_flood", f"{len(recent)} requests in 60 s", "medium")
        return jsonify({"error": "too_many_requests", "retry_after_s": 60}), 429
    # Only the salted hash is retained; the code itself never reaches this process.
    _OTP_STORE[challenge] = {"dest": dest, "hash": digest, "at": time.time(), "ip": ip}
    db.audit("anonymous", "auth:otp_issue", dest[:3] + "***", "allow", {"challenge": challenge})
    gateway = os.environ.get("CROPCARE_SMS_GATEWAY")
    return jsonify({"queued": True, "challenge": challenge, "gateway": bool(gateway),
                    "note": "hash stored; delivery handled by the configured gateway"})

# --------------------------------------------------------------------------- #
# security middleware
# --------------------------------------------------------------------------- #
WAF_RULES = [
    ("CC-SQLI-01", "SQL injection", re.compile(r"(\bunion\b.*\bselect\b)|('\s*or\s*'?1'?\s*=\s*'?1)|(;\s*drop\s+table)", re.I)),
    ("CC-XSS-02", "Cross-site scripting", re.compile(r"<\s*script|javascript:|on(error|load|click)\s*=", re.I)),
    ("CC-PATH-03", "Path traversal", re.compile(r"(\.\./){2,}|/etc/passwd|%2e%2e%2f", re.I)),
    ("CC-CMD-04", "Command injection", re.compile(r"[;|`]\s*(rm|curl|wget|nc|bash|sh)\b", re.I)),
    ("CC-SSTI-05", "Template injection", re.compile(r"\{\{.*(config|self|__class__).*\}\}", re.I)),
]
SSRF_ALLOWLIST = {"api.cropcare.local", "sentinel.dataspace.copernicus.eu", "agmarknet.gov.in", "localhost:11434"}
PRIVATE_RE = re.compile(r"^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1)")

_BUCKETS: Dict[str, Tuple[float, float]] = {}
RATE_CAPACITY, RATE_REFILL = 30.0, 1.0  # 30 burst, 1 request/second sustained


def rate_limit(ip: str) -> Tuple[bool, float]:
    tokens, last = _BUCKETS.get(ip, (RATE_CAPACITY, time.time()))
    now = time.time()
    tokens = min(RATE_CAPACITY, tokens + (now - last) * RATE_REFILL)
    if tokens < 1:
        _BUCKETS[ip] = (tokens, now)
        return False, (1 - tokens) / RATE_REFILL
    _BUCKETS[ip] = (tokens - 1, now)
    return True, 0.0


def waf_scan(text: str):
    return [(rid, name) for rid, name, rx in WAF_RULES if rx.search(text)]


def ssrf_check(raw_url: str) -> Tuple[bool, str]:
    try:
        u = urlparse(raw_url)
    except Exception:
        return False, "unparseable URL"
    if u.scheme not in ("http", "https"):
        return False, f"scheme {u.scheme or 'none'} blocked"
    host_port = f"{u.hostname}:{u.port}" if u.port else (u.hostname or "")
    if u.hostname and PRIVATE_RE.match(u.hostname) and host_port not in SSRF_ALLOWLIST:
        return False, "private/link-local address blocked"
    if not any(host_port == h or (u.hostname or "").endswith(h) for h in SSRF_ALLOWLIST):
        return False, "host not in egress allowlist"
    return True, "allowlisted egress"


@app.before_request
def _guard():
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()
    ok, retry = rate_limit(ip)
    if not ok:
        db.security_event(ip, "rate_limit", f"429 on {request.path}", "low")
        return jsonify({"error": "rate_limited", "retry_after_s": round(retry, 2)}), 429

    probe = f"{request.path}?{request.query_string.decode('utf-8', 'ignore')}"
    if request.method in ("POST", "PUT", "PATCH") and request.content_type and "json" in request.content_type:
        probe += " " + (request.get_data(cache=True, as_text=True) or "")[:4000]
    else:
        probe += " " + " ".join(f"{k}={v}" for k, v in request.form.items())
    hits = waf_scan(probe)
    if hits:
        db.security_event(ip, "waf_block", "; ".join(f"{r}:{n}" for r, n in hits), "high")
        db.audit("anonymous", "waf:block", request.path, "deny", [r for r, _ in hits])
        return jsonify({"error": "request_blocked", "rules": [{"id": r, "name": n} for r, n in hits]}), 403
    return None


@app.after_request
def _headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Permissions-Policy"] = "geolocation=(self), microphone=(), camera=(self)"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; "
        "script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"
    )
    resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return resp


# --------------------------------------------------------------------------- #
# upload validation
# --------------------------------------------------------------------------- #
MAGIC = [(b"\xff\xd8\xff", "image/jpeg"), (b"\x89PNG\r\n\x1a\n", "image/png"), (b"RIFF", "image/webp")]
EICAR = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR"


def scan_upload(data: bytes, declared: str) -> dict:
    findings = []
    kind = next((t for sig, t in MAGIC if data.startswith(sig)), None)
    if kind is None:
        findings.append("magic-byte mismatch: not a recognised image container")
    elif declared and kind.split("/")[1] not in declared:
        findings.append(f"content-type spoofing: declared {declared}, actual {kind}")
    if len(data) > MAX_UPLOAD:
        findings.append(f"oversize upload {len(data)/1048576:.1f} MB > 8 MB")
    head = data[:2048]
    if EICAR in data:
        findings.append("EICAR test signature detected")
    if re.search(rb"<\?php|<script", head, re.I):
        findings.append("polyglot payload: embedded script in image header")
    return {"clean": not findings, "findings": findings,
            "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "type": kind}


# --------------------------------------------------------------------------- #
# core pipeline
# --------------------------------------------------------------------------- #
def run_pipeline(path: str, crop: str, kind: str, quantity_q: float, vehicle: str,
                 cooling: bool, filename: str, sha256: str) -> dict:
    if kind == "disease":
        result = vision.detect_disease(path, crop)
        payload = {"kind": "disease", "crop": crop, "disease": result}
        scan_id = "scn_" + uuid.uuid4().hex[:12]
        db.insert_scan({
            "id": scan_id, "created_at": time.time(), "kind": "disease", "crop": crop,
            "filename": filename, "sha256": sha256, "phash": result["phash"],
            "score": int(result["top"]["score"] * 100), "grade": None, "quantity_q": quantity_q,
            "price_low": None, "price_mid": None, "price_high": None,
            "best_mandi": None, "best_net": None, "payload": json.dumps(payload), "owner_id": "local",
        })
        db.audit("local", "disease:detect", f"scan:{scan_id}", "info", {"top": result["top"]["id"]})
        payload["id"] = scan_id
        return payload

    quality = vision.grade_produce(path, crop)
    pr = price_engine.price_range(crop, quality["score"], quality["grade"], quantity_q)
    markets = price_engine.compare_markets(crop, quality["score"], quality["grade"], quantity_q, vehicle, cooling)
    sim = price_engine.sell_simulator(crop, quality["score"], quality["grade"], quantity_q,
                                      markets[0]["net"] if markets else 0, cooling)
    scan_id = "scn_" + uuid.uuid4().hex[:12]
    payload = {"kind": "quality", "crop": crop, "quality": quality, "price": pr,
               "markets": markets, "simulator": sim, "id": scan_id}
    db.insert_scan({
        "id": scan_id, "created_at": time.time(), "kind": "quality", "crop": crop,
        "filename": filename, "sha256": sha256, "phash": quality["phash"],
        "score": quality["score"], "grade": quality["grade"], "quantity_q": quantity_q,
        "price_low": pr["low"], "price_mid": pr["mid"], "price_high": pr["high"],
        "best_mandi": markets[0]["mandi"]["name"] if markets else None,
        "best_net": markets[0]["net"] if markets else None,
        "payload": json.dumps(payload), "owner_id": "local",
    })
    db.audit("local", "quality:grade", f"scan:{scan_id}", "info",
             {"score": quality["score"], "grade": quality["grade"]})
    return payload


def _save_upload(file_storage) -> Tuple[str, str, str]:
    data = file_storage.read()
    check = scan_upload(data, file_storage.mimetype or "")
    if not check["clean"]:
        ip = request.remote_addr or "unknown"
        db.security_event(ip, "upload_blocked", "; ".join(check["findings"]), "high")
        db.audit("local", "upload:scan", "image", "deny", check["findings"])
        abort(400, description="; ".join(check["findings"]))
    ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}.get(check["type"], ".bin")
    name = secure_filename(f"{int(time.time())}_{uuid.uuid4().hex[:8]}{ext}")
    path = os.path.join(UPLOADS, name)
    with open(path, "wb") as fh:
        fh.write(data)
    return path, name, check["sha256"]


# --------------------------------------------------------------------------- #
# HTML routes
# --------------------------------------------------------------------------- #
@app.get("/")
def index():
    return render_template("index.html", crops=vision.CROP_SPECS, vehicles=price_engine.VEHICLES,
                           meta=price_engine.model_meta(), scans=db.list_scans(6))


@app.post("/analyze")
def analyze():
    if "photo" not in request.files or request.files["photo"].filename == "":
        return render_template("index.html", crops=vision.CROP_SPECS, vehicles=price_engine.VEHICLES,
                               meta=price_engine.model_meta(), scans=db.list_scans(6),
                               error="Choose a photo of the produce or leaf first."), 400
    crop = request.form.get("crop", "tomato")
    kind = request.form.get("kind", "quality")
    quantity = float(request.form.get("quantity", 20) or 20)
    vehicle = request.form.get("vehicle", "tempo")
    cooling = request.form.get("cooling") == "on"
    path, name, sha = _save_upload(request.files["photo"])
    payload = run_pipeline(path, crop, kind, quantity, vehicle, cooling, name, sha)
    return redirect(url_for("result", scan_id=payload["id"]))


@app.get("/result/<scan_id>")
def result(scan_id: str):
    row = db.get_scan(scan_id)
    if not row:
        abort(404)
    payload = json.loads(row["payload"])
    return render_template("result.html", row=row, p=payload, meta=price_engine.model_meta())


@app.get("/history")
def history():
    return render_template("history.html", scans=db.list_scans(50), audit=db.verify_audit())


@app.get("/markets")
def markets_page():
    crop = request.args.get("crop", "tomato")
    quality = float(request.args.get("quality", 78))
    grade = request.args.get("grade", "A" if quality >= 80 else "B" if quality >= 60 else "C")
    qty = float(request.args.get("quantity", 20))
    vehicle = request.args.get("vehicle", "tempo")
    markets = price_engine.compare_markets(crop, quality, grade, qty, vehicle)
    pr = price_engine.price_range(crop, quality, grade, qty)
    sim = price_engine.sell_simulator(crop, quality, grade, qty, markets[0]["net"])
    return render_template("markets.html", crops=vision.CROP_SPECS, vehicles=price_engine.VEHICLES,
                           markets=markets, price=pr, sim=sim, crop=crop, quality=quality,
                           grade=grade, quantity=qty, vehicle=vehicle)


@app.get("/security")
def security_page():
    return render_template("security.html", audit=db.verify_audit(), events=db.recent_security_events(),
                           rules=[{"id": r, "name": n} for r, n, _ in WAF_RULES],
                           allowlist=sorted(SSRF_ALLOWLIST))


@app.get("/uploads/<path:name>")
def uploaded(name: str):
    return send_from_directory(UPLOADS, secure_filename(name))


# --------------------------------------------------------------------------- #
# JSON API
# --------------------------------------------------------------------------- #
@app.get("/api/v1/health")
def api_health():
    return jsonify({"status": "ok", "model": price_engine.model_meta(),
                    "audit": db.verify_audit(), "time": time.time()})


@app.get("/api/v1/model")
def api_model():
    return jsonify(price_engine.model_meta())


@app.post("/api/v1/analyze")
def api_analyze():
    if "photo" not in request.files:
        return jsonify({"error": "photo file required (multipart/form-data)"}), 400
    crop = request.form.get("crop", "tomato")
    kind = request.form.get("kind", "quality")
    quantity = float(request.form.get("quantity", 20) or 20)
    vehicle = request.form.get("vehicle", "tempo")
    cooling = request.form.get("cooling") in ("on", "true", "1")
    path, name, sha = _save_upload(request.files["photo"])
    payload = run_pipeline(path, crop, kind, quantity, vehicle, cooling, name, sha)
    known = db.known_phashes()
    payload["anti_fraud"] = {
        "duplicate_image": known.count(payload.get("quality", payload.get("disease", {})).get("phash", "")) > 1,
        "note": "perceptual-hash duplicate check across all submissions on this node",
    }
    return jsonify(payload)


@app.post("/api/v1/price")
def api_price():
    body = request.get_json(silent=True) or {}
    try:
        pr = price_engine.price_range(
            body.get("crop", "tomato"), float(body.get("quality_score", 70)),
            body.get("grade", "B"), float(body.get("quantity_q", 20)),
            arrivals=float(body.get("arrivals_t", 400)), demand=float(body.get("demand_index", 1.0)),
            fuel=float(body.get("fuel_index", 1.0)), distance=float(body.get("distance_km", 60)),
            moisture=float(body.get("moisture_pct", 12)), festival=int(body.get("festival", 0)),
            when=date.fromisoformat(body["date"]) if body.get("date") else None,
        )
    except (TypeError, ValueError) as exc:
        return jsonify({"error": "invalid_parameters", "detail": str(exc)}), 422
    return jsonify(pr)


@app.post("/api/v1/markets")
def api_markets():
    body = request.get_json(silent=True) or {}
    markets = price_engine.compare_markets(
        body.get("crop", "tomato"), float(body.get("quality_score", 70)), body.get("grade", "B"),
        float(body.get("quantity_q", 20)), body.get("vehicle", "tempo"), bool(body.get("cooling", False)),
    )
    return jsonify({"markets": markets, "ranked_by": "net value = gross − transport − commission − transit loss",
                    "disclaimer": price_engine.DISCLAIMER})


@app.post("/api/v1/sell-simulator")
def api_sell():
    body = request.get_json(silent=True) or {}
    markets = price_engine.compare_markets(body.get("crop", "tomato"), float(body.get("quality_score", 70)),
                                           body.get("grade", "B"), float(body.get("quantity_q", 20)))
    sim = price_engine.sell_simulator(body.get("crop", "tomato"), float(body.get("quality_score", 70)),
                                      body.get("grade", "B"), float(body.get("quantity_q", 20)),
                                      markets[0]["net"], bool(body.get("cold_storage", False)))
    return jsonify(sim)


@app.get("/api/v1/scans")
def api_scans():
    return jsonify({"scans": [{k: v for k, v in s.items() if k != "payload"} for s in db.list_scans(50)]})


@app.get("/api/v1/audit")
def api_audit():
    return jsonify(db.verify_audit())


@app.post("/api/v1/egress-check")
def api_egress():
    body = request.get_json(silent=True) or {}
    allow, reason = ssrf_check(body.get("url", ""))
    return jsonify({"url": body.get("url", ""), "allow": allow, "reason": reason})


@app.post("/api/v1/webhooks/receive")
def api_webhook():
    header = request.headers.get("X-Signature", "")
    raw = request.get_data(as_text=True)
    m = re.match(r"t=(\d+),v1=([a-f0-9]+)", header)
    if not m:
        return jsonify({"ok": False, "reason": "malformed signature header"}), 400
    ts = int(m.group(1))
    if abs(time.time() * 1000 - ts) > 300_000:
        return jsonify({"ok": False, "reason": "replay window exceeded"}), 400
    expected = hmac.new(WEBHOOK_SECRET.encode(), f"{ts}.{raw}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, m.group(2)):
        db.security_event(request.remote_addr or "?", "webhook_bad_signature", "HMAC mismatch", "high")
        return jsonify({"ok": False, "reason": "signature mismatch"}), 401
    db.audit("webhook", "webhook:receive", "external", "allow", {"bytes": len(raw)})
    return jsonify({"ok": True})


@app.get("/openapi.json")
def openapi():
    with open(os.path.join(HERE, "openapi.json"), encoding="utf-8") as fh:
        return app.response_class(fh.read(), mimetype="application/json")


@app.get("/api/docs")
def docs():
    with open(os.path.join(HERE, "openapi.json"), encoding="utf-8") as fh:
        spec = json.load(fh)
    return render_template("docs.html", spec=spec)


@app.errorhandler(400)
def _400(e):
    return jsonify({"error": "bad_request", "detail": getattr(e, "description", "")}), 400


@app.errorhandler(404)
def _404(e):
    return jsonify({"error": "not_found"}), 404


@app.errorhandler(413)
def _413(e):
    return jsonify({"error": "payload_too_large", "max_bytes": MAX_UPLOAD}), 413


if __name__ == "__main__":
    print("CropCare / AgriPrice — http://127.0.0.1:5000")
    print(f"  model: {price_engine.model_meta()['name']} v{price_engine.model_meta()['version']} "
          f"(R²={price_engine.model_meta()['r2']})")
    app.run(host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", 5000)), debug=False)
