"""End-to-end tests for the standalone CropCare / AgriPrice service.

Run:  cd server && python -m pytest -q
"""
import hashlib
import hmac
import io
import os
import sys
import time

import pytest
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app as flask_app  # noqa: E402
import price as price_engine  # noqa: E402
import vision  # noqa: E402


@pytest.fixture()
def client():
    flask_app.app.config["TESTING"] = True
    flask_app._BUCKETS.clear()
    with flask_app.app.test_client() as c:
        yield c


def make_photo(kind="good") -> io.BytesIO:
    img = Image.new("RGB", (320, 320), (176, 158, 128))
    d = ImageDraw.Draw(img)
    for cx, cy, r in ((110, 110, 58), (215, 120, 52), (150, 225, 62)):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(206, 44, 30) if kind == "good" else (120, 84, 40))
        if kind == "bad":
            for k in range(9):
                d.ellipse([cx - r + k * 9, cy, cx - r + k * 9 + 12, cy + 14], fill=(28, 18, 10))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    buf.seek(0)
    return buf


def test_health_and_model(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    body = r.get_json()
    assert body["status"] == "ok"
    assert body["model"]["r2"] > 0.8
    assert body["audit"]["ok"] is True


def test_home_page_renders(client):
    r = client.get("/")
    assert r.status_code == 200
    assert b"price range" in r.data.lower()


def test_security_headers(client):
    r = client.get("/")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert "default-src 'self'" in r.headers["Content-Security-Policy"]
    assert r.headers["X-Frame-Options"] == "DENY"


def test_quality_pipeline_end_to_end(client):
    data = {"photo": (make_photo("good"), "lot.jpg"), "crop": "tomato", "kind": "quality", "quantity": "20"}
    r = client.post("/api/v1/analyze", data=data, content_type="multipart/form-data")
    assert r.status_code == 200
    body = r.get_json()
    assert 0 <= body["quality"]["score"] <= 100
    assert body["quality"]["grade"] in ("A", "B", "C")
    assert body["price"]["low"] < body["price"]["mid"] < body["price"]["high"]
    assert "not a guaranteed price" in body["price"]["disclaimer"].lower()
    # markets must be ranked by descending NET value
    nets = [m["net"] for m in body["markets"]]
    assert nets == sorted(nets, reverse=True)
    assert len(body["simulator"]["options"]) == 3
    assert len(body["quality"]["explanation"]) >= 2


def test_blemished_lot_scores_lower_than_clean_lot():
    import tempfile

    paths = []
    for kind in ("good", "bad"):
        f = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
        f.write(make_photo(kind).read())
        f.close()
        paths.append(f.name)
    clean = vision.grade_produce(paths[0], "tomato")
    dirty = vision.grade_produce(paths[1], "tomato")
    assert clean["score"] >= dirty["score"]
    assert clean["ms"] < 2000


def test_disease_pipeline(client):
    data = {"photo": (make_photo("bad"), "leaf.jpg"), "crop": "tomato", "kind": "disease"}
    r = client.post("/api/v1/analyze", data=data, content_type="multipart/form-data")
    assert r.status_code == 200
    body = r.get_json()
    assert len(body["disease"]["labels"]) == 7
    assert all(0 <= lbl["score"] <= 1 for lbl in body["disease"]["labels"])


def test_upload_scanner_blocks_polyglot(client):
    evil = io.BytesIO(b"<?php system($_GET['c']); ?>" + b"A" * 400)
    r = client.post("/api/v1/analyze", data={"photo": (evil, "evil.jpg")}, content_type="multipart/form-data")
    assert r.status_code == 400
    assert "magic-byte" in r.get_json()["detail"]


def test_waf_blocks_sql_injection(client):
    r = client.post("/api/v1/price", json={"crop": "tomato' UNION SELECT * FROM users--"})
    assert r.status_code == 403
    assert r.get_json()["rules"][0]["id"] == "CC-SQLI-01"


def test_price_range_monotonic_in_quality():
    low = price_engine.price_range("tomato", 40, "C", 20)
    high = price_engine.price_range("tomato", 92, "A", 20)
    assert high["mid"] > low["mid"]
    assert high["confidence"] >= low["confidence"]


def test_net_ranking_accounts_for_distance():
    markets = price_engine.compare_markets("tomato", 85, "A", 5, "bike")
    local = next(m for m in markets if m["mandi"]["id"] == "local")
    far = next(m for m in markets if m["mandi"]["id"] == "vashi")
    assert far["transport"] > local["transport"]


def test_sell_simulator_has_three_horizons():
    sim = price_engine.sell_simulator("tomato", 80, "A", 20, 40000)
    assert [o["horizon"] for o in sim["options"]] == ["now", "2d", "5d"]
    assert sim["options"][2]["quality_score"] <= sim["options"][0]["quality_score"]
    assert "ai estimate" in sim["note"].lower()


def test_ssrf_allowlist(client):
    blocked = client.post("/api/v1/egress-check", json={"url": "http://169.254.169.254/latest/meta-data/"})
    assert blocked.get_json()["allow"] is False
    allowed = client.post("/api/v1/egress-check", json={"url": "http://localhost:11434/api/tags"})
    assert allowed.get_json()["allow"] is True


def test_webhook_signature(client):
    body = '{"event":"claim.paid"}'
    ts = int(time.time() * 1000)
    sig = hmac.new(flask_app.WEBHOOK_SECRET.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
    ok = client.post("/api/v1/webhooks/receive", data=body, content_type="application/json",
                     headers={"X-Signature": f"t={ts},v1={sig}"})
    assert ok.status_code == 200
    bad = client.post("/api/v1/webhooks/receive", data=body, content_type="application/json",
                      headers={"X-Signature": f"t={ts},v1={'0'*64}"})
    assert bad.status_code == 401


def test_audit_chain_verifies(client):
    r = client.get("/api/v1/audit")
    assert r.get_json()["ok"] is True


def test_rate_limiter_eventually_429s(client):
    flask_app._BUCKETS.clear()
    codes = [client.get("/api/v1/model").status_code for _ in range(40)]
    assert 429 in codes
