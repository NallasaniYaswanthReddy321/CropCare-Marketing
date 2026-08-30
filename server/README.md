# CropCare · AgriPrice — standalone Flask + SQLite app

Photo → visual quality grade → **price range** → net-value market ranking → sell/hold simulator.
Runs entirely on one machine. No third-party API, no image ever leaves the host.

```
server/
  app.py                 Flask application (HTML UI + JSON API + security middleware)
  vision.py              OpenCV-equivalent quality grader + multi-label disease inference (NumPy/Pillow)
  price.py               price_model.pkl loader, price range, market NET ranking, sell simulator
  db.py                  SQLite schema + hash-chained audit log
  train_model.py         generates data/market_prices.csv and trains models/price_model.pkl
  templates/  static/    server-rendered UI (night-farm dark theme, zero JS dependencies)
  uploads/               validated user uploads
  models/price_model.pkl GradientBoostingRegressor over log price
  data/market_prices.csv 18 240 mandi records
  tests/test_app.py      pytest suite (pipeline, security, pricing invariants)
  openapi.json           OpenAPI 3 contract, rendered offline at /api/docs
```

## Run it

```bash
cd server
pip install -r requirements.txt
python train_model.py      # writes data/market_prices.csv + models/price_model.pkl
python app.py              # http://127.0.0.1:5000
```

Docker, one command:

```bash
docker compose up --build  # trains the model during the image build
```

## Tests

```bash
cd server && python -m pytest -q
```

Covers: full quality pipeline, disease multi-label output, blemished-vs-clean ordering,
upload malware/polyglot rejection, WAF SQL-injection block, SSRF allowlist, HMAC webhook
verification (valid + forged), audit-chain integrity, rate limiting, price monotonicity in
quality, transport cost by distance and the three sell horizons.

## API

| Endpoint | Purpose |
|---|---|
| `GET  /api/v1/health` | liveness, model card, audit chain state |
| `POST /api/v1/analyze` | multipart photo → grade + price range + markets + simulator |
| `POST /api/v1/price` | price range for an explicit feature vector |
| `POST /api/v1/markets` | mandis ranked by NET value |
| `POST /api/v1/sell-simulator` | sell today / +2 d / +5 d |
| `GET  /api/v1/scans` `GET /api/v1/audit` | history and tamper-evident log |
| `POST /api/v1/egress-check` | SSRF allowlist decision |
| `POST /api/v1/webhooks/receive` | HMAC-signed webhook receiver |

Example:

```bash
curl -F photo=@lot.jpg -F crop=tomato -F quantity=20 http://127.0.0.1:5000/api/v1/analyze | jq '.price'
```

## Honesty contract

* Photographs give **visual** evidence only — moisture, brix, residue and internal rot are never inferred.
* Prices are an **80% estimated range**, labelled *AI estimate*, never a guaranteed price.
* Markets are ranked on **net** value: gross − transport − commission − transit loss, with payment lag shown.

## Security controls (all executing, not documentation)

Upload magic-byte/polyglot/EICAR scanning with an 8 MB cap · per-IP token-bucket rate limiting ·
WAF signatures (SQLi, XSS, traversal, command and template injection) · SSRF egress allowlist ·
HMAC-SHA256 webhooks with a 300 s replay window and constant-time comparison · hash-chained audit log ·
parameterised SQL only · CSP/HSTS/nosniff/DENY-framing/no-referrer headers · secrets from the environment.
