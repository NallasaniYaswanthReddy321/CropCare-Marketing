#!/usr/bin/env python3
"""
CropCare / AgriPrice — price model training.

1. Generates data/market_prices.csv if it does not exist (18 240 mandi records
   built from a documented log-additive generative process with heteroscedastic
   noise, so the CSV is reproducible and inspectable).
2. Trains a GradientBoostingRegressor on log(modal_price).
3. Writes models/price_model.pkl containing the fitted estimator, the feature
   order, the residual sigma used for prediction intervals and the metrics.

Run:  python train_model.py
"""
from __future__ import annotations

import json
import math
import os
import pickle
import random
from datetime import date, timedelta

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
MODELS = os.path.join(HERE, "models")
CSV_PATH = os.path.join(DATA, "market_prices.csv")
PKL_PATH = os.path.join(MODELS, "price_model.pkl")

CROPS = {
    # crop: (reference price per quintal, seasonal phase shift in days)
    "tomato": (1800, 80),
    "wheat": (2300, 140),
    "rice": (2100, 190),
    "onion": (1500, 60),
    "potato": (1200, 20),
    "cotton": (7000, 240),
    "chilli": (9000, 110),
    "maize": (1900, 170),
    "banana": (1400, 0),
    "grape": (5500, 300),
}

MANDIS = {
    "Azadpur": (148, 920, 1.18),
    "Vashi APMC": (212, 780, 1.22),
    "Taluka Market": (11, 45, 0.88),
    "Pune Gultekdi": (64, 410, 1.05),
    "Lasalgaon": (132, 640, 1.00),
    "FPO Centre": (4, 18, 0.96),
    "Export Packhouse": (95, 60, 1.35),
}

COEF = dict(
    quality=0.0042,
    grade_a=0.085,
    grade_c=-0.132,
    arrivals=-0.28,
    demand=0.19,
    seasonality=0.07,
    fuel=0.031,
    distance=-0.0009,
    moisture=-0.06,
    festival=0.05,
)

FEATURES = [
    "quality_score",
    "grade_a",
    "grade_c",
    "log_arrivals_ratio",
    "demand_index",
    "seasonality",
    "fuel_index",
    "distance_km",
    "moisture_excess",
    "festival",
    "ref_price",
]


def generate_csv(rows: int = 18240, seed: int = 20250101) -> None:
    os.makedirs(DATA, exist_ok=True)
    rnd = random.Random(seed)
    start = date(2019, 1, 1)
    with open(CSV_PATH, "w", encoding="utf-8") as fh:
        fh.write(
            "date,crop,mandi,distance_km,arrivals_t,demand_index,quality_score,grade,"
            "moisture_pct,fuel_index,festival,modal_price\n"
        )
        for i in range(rows):
            d = start + timedelta(days=rnd.randint(0, 2190))
            crop = rnd.choice(list(CROPS))
            ref, shift = CROPS[crop]
            mandi = rnd.choice(list(MANDIS))
            dist, base_arr, demand_base = MANDIS[mandi]

            arrivals = max(5.0, rnd.gauss(base_arr, base_arr * 0.28))
            demand = max(0.55, rnd.gauss(demand_base, 0.09))
            quality = min(99, max(12, rnd.gauss(66, 15)))
            grade = "A" if quality >= 80 else "B" if quality >= 60 else "C"
            moisture = max(6.0, rnd.gauss(12.5, 2.4))
            fuel = max(0.7, rnd.gauss(1.0, 0.08))
            doy = d.timetuple().tm_yday
            festival = 1 if rnd.random() < 0.07 else 0

            log_p = math.log(ref)
            log_p += COEF["quality"] * (quality - 50)
            log_p += COEF["grade_a"] if grade == "A" else (COEF["grade_c"] if grade == "C" else 0.0)
            log_p += COEF["arrivals"] * math.log(arrivals / 400.0)
            log_p += COEF["demand"] * (demand - 1.0)
            log_p += COEF["seasonality"] * math.sin(2 * math.pi * (doy - shift) / 365.0)
            log_p += COEF["fuel"] * (fuel - 1.0)
            log_p += COEF["distance"] * dist
            log_p += COEF["moisture"] * max(0.0, (moisture - 14.0) / 4.0)
            log_p += COEF["festival"] * festival
            # heteroscedastic market noise: thin markets are noisier
            sigma = 0.09 + 0.06 * math.exp(-arrivals / 300.0)
            log_p += rnd.gauss(0.0, sigma)

            price = round(math.exp(log_p), 2)
            fh.write(
                f"{d.isoformat()},{crop},{mandi},{dist},{arrivals:.1f},{demand:.3f},"
                f"{quality:.1f},{grade},{moisture:.1f},{fuel:.3f},{festival},{price}\n"
            )


def load_csv():
    import csv

    X, y = [], []
    with open(CSV_PATH, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            ref = CROPS[r["crop"]][0]
            shift = CROPS[r["crop"]][1]
            doy = date.fromisoformat(r["date"]).timetuple().tm_yday
            X.append(
                [
                    float(r["quality_score"]),
                    1.0 if r["grade"] == "A" else 0.0,
                    1.0 if r["grade"] == "C" else 0.0,
                    math.log(float(r["arrivals_t"]) / 400.0),
                    float(r["demand_index"]),
                    math.sin(2 * math.pi * (doy - shift) / 365.0),
                    float(r["fuel_index"]),
                    float(r["distance_km"]),
                    max(0.0, (float(r["moisture_pct"]) - 14.0) / 4.0),
                    float(r["festival"]),
                    float(ref),
                ]
            )
            y.append(math.log(float(r["modal_price"])))
    return np.array(X), np.array(y)


def main() -> None:
    from sklearn.ensemble import GradientBoostingRegressor
    from sklearn.model_selection import train_test_split

    if not os.path.exists(CSV_PATH):
        print("· generating data/market_prices.csv …")
        generate_csv()

    X, y = load_csv()
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42)

    model = GradientBoostingRegressor(
        n_estimators=320, learning_rate=0.06, max_depth=3, subsample=0.9, random_state=42
    )
    model.fit(Xtr, ytr)

    pred = model.predict(Xte)
    ss_res = float(np.sum((yte - pred) ** 2))
    ss_tot = float(np.sum((yte - np.mean(yte)) ** 2))
    r2 = 1 - ss_res / ss_tot
    mape = float(np.mean(np.abs(np.exp(pred) - np.exp(yte)) / np.exp(yte)))
    residual_sigma = float(np.std(yte - pred))

    bundle = {
        "model": model,
        "features": FEATURES,
        "crops": CROPS,
        "residual_sigma": residual_sigma,
        "metrics": {"r2": round(r2, 4), "mape": round(mape, 4), "n_train": len(Xtr), "n_test": len(Xte)},
        "version": "2.3.0",
        "algo": "GradientBoostingRegressor(320, lr=0.06, depth=3) on log price",
    }
    os.makedirs(MODELS, exist_ok=True)
    with open(PKL_PATH, "wb") as fh:
        pickle.dump(bundle, fh)
    with open(os.path.join(MODELS, "price_model_meta.json"), "w", encoding="utf-8") as fh:
        json.dump({k: v for k, v in bundle.items() if k != "model"}, fh, indent=2)

    print(f"✔ trained on {len(Xtr)} rows · R²={r2:.4f} · MAPE={mape*100:.2f}% · σ(log)={residual_sigma:.4f}")
    print(f"✔ wrote {PKL_PATH}")


if __name__ == "__main__":
    main()
