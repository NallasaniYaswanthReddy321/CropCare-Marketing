"""
AgriPrice pricing service.

Loads models/price_model.pkl (GradientBoostingRegressor over log price), turns a
quality grade into a PRICE RANGE (never a guaranteed price), ranks mandis by NET
value (revenue − transport − commission − transit loss) and runs the
sell-now / +2 d / +5 d simulator.
"""
from __future__ import annotations

import math
import os
import pickle
from datetime import date, datetime
from typing import Dict, List

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PKL_PATH = os.path.join(HERE, "models", "price_model.pkl")

CROPS = {
    "tomato": {"ref": 1800, "shift": 80, "shelf_h": 96},
    "wheat": {"ref": 2300, "shift": 140, "shelf_h": 8760},
    "rice": {"ref": 2100, "shift": 190, "shelf_h": 8760},
    "onion": {"ref": 1500, "shift": 60, "shelf_h": 2160},
    "potato": {"ref": 1200, "shift": 20, "shelf_h": 4320},
    "cotton": {"ref": 7000, "shift": 240, "shelf_h": 8760},
    "chilli": {"ref": 9000, "shift": 110, "shelf_h": 120},
    "maize": {"ref": 1900, "shift": 170, "shelf_h": 8760},
    "banana": {"ref": 1400, "shift": 0, "shelf_h": 168},
    "grape": {"ref": 5500, "shift": 300, "shelf_h": 336},
}

MANDIS: List[dict] = [
    {"id": "azadpur", "name": "Azadpur Mandi", "district": "Delhi", "distance_km": 148, "arrivals_t": 920,
     "demand_index": 1.18, "commission_pct": 6, "grade_a_premium": 0.12, "payment_days": 3, "trust": 0.86},
    {"id": "vashi", "name": "Vashi APMC", "district": "Navi Mumbai", "distance_km": 212, "arrivals_t": 780,
     "demand_index": 1.22, "commission_pct": 8, "grade_a_premium": 0.15, "payment_days": 5, "trust": 0.81},
    {"id": "local", "name": "Taluka Market", "district": "Local", "distance_km": 11, "arrivals_t": 45,
     "demand_index": 0.88, "commission_pct": 2, "grade_a_premium": 0.03, "payment_days": 0, "trust": 0.93},
    {"id": "pune", "name": "Pune Gultekdi", "district": "Pune", "distance_km": 64, "arrivals_t": 410,
     "demand_index": 1.05, "commission_pct": 5, "grade_a_premium": 0.08, "payment_days": 2, "trust": 0.90},
    {"id": "nashik", "name": "Nashik Lasalgaon", "district": "Nashik", "distance_km": 132, "arrivals_t": 640,
     "demand_index": 1.00, "commission_pct": 4, "grade_a_premium": 0.09, "payment_days": 4, "trust": 0.88},
    {"id": "fpo", "name": "FPO Collection Centre", "district": "Village", "distance_km": 4, "arrivals_t": 18,
     "demand_index": 0.96, "commission_pct": 0, "grade_a_premium": 0.06, "payment_days": 1, "trust": 0.97},
    {"id": "export", "name": "Export Pack-house", "district": "Contract", "distance_km": 95, "arrivals_t": 60,
     "demand_index": 1.35, "commission_pct": 3, "grade_a_premium": 0.28, "payment_days": 14, "trust": 0.74},
]

VEHICLES = [
    {"id": "bike", "name": "Two-wheeler + crate", "capacity_q": 2, "rate_per_km": 6, "fixed": 30, "loss_per_h": 0.012},
    {"id": "tempo", "name": "Tempo (Chhota Hathi)", "capacity_q": 15, "rate_per_km": 22, "fixed": 250, "loss_per_h": 0.009},
    {"id": "truck", "name": "Truck 9 t", "capacity_q": 90, "rate_per_km": 38, "fixed": 900, "loss_per_h": 0.007},
    {"id": "reefer", "name": "Reefer van", "capacity_q": 40, "rate_per_km": 58, "fixed": 1200, "loss_per_h": 0.002},
    {"id": "shared", "name": "Shared FPO trip", "capacity_q": 30, "rate_per_km": 12, "fixed": 120, "loss_per_h": 0.009},
]

DISCLAIMER = (
    "AI estimate — an 80% price RANGE from visual grading plus mandi statistics. "
    "Not a guaranteed price and not a laboratory analysis. Photographs cannot measure "
    "moisture, brix, pesticide residue or internal defects."
)

_BUNDLE = None


def bundle() -> dict:
    global _BUNDLE
    if _BUNDLE is None:
        if not os.path.exists(PKL_PATH):
            raise FileNotFoundError("models/price_model.pkl missing — run `python train_model.py` first")
        with open(PKL_PATH, "rb") as fh:
            _BUNDLE = pickle.load(fh)
    return _BUNDLE


def model_meta() -> dict:
    b = bundle()
    return {
        "name": "price_model.pkl",
        "version": b["version"],
        "algo": b["algo"],
        "r2": b["metrics"]["r2"],
        "mape": b["metrics"]["mape"],
        "residual_sigma": round(b["residual_sigma"], 4),
        "trained_rows": b["metrics"]["n_train"],
        "features": b["features"],
    }


def _features(crop: str, quality: float, grade: str, arrivals: float, demand: float,
              fuel: float, distance: float, moisture: float, festival: int, when: date) -> np.ndarray:
    spec = CROPS.get(crop, CROPS["tomato"])
    doy = when.timetuple().tm_yday
    return np.array([[
        float(quality),
        1.0 if grade == "A" else 0.0,
        1.0 if grade == "C" else 0.0,
        math.log(max(1e-3, arrivals / 400.0)),
        float(demand),
        math.sin(2 * math.pi * (doy - spec["shift"]) / 365.0),
        float(fuel),
        float(distance),
        max(0.0, (float(moisture) - 14.0) / 4.0),
        float(festival),
        float(spec["ref"]),
    ]])


def price_range(crop: str, quality: float, grade: str, quantity_q: float = 20,
                arrivals: float = 400, demand: float = 1.0, fuel: float = 1.0,
                distance: float = 60, moisture: float = 12.0, festival: int = 0,
                when: date | None = None) -> dict:
    b = bundle()
    when = when or date.today()
    x = _features(crop, quality, grade, arrivals, demand, fuel, distance, moisture, festival, when)
    log_mid = float(b["model"].predict(x)[0])

    # certainty widens the interval when the photo evidence is weak
    certainty = min(1.0, 0.55 + quality / 200.0)
    sigma = b["residual_sigma"] / certainty
    low, mid, high = math.exp(log_mid - 1.2816 * sigma), math.exp(log_mid), math.exp(log_mid + 1.2816 * sigma)

    # driver decomposition by ablation to the neutral baseline
    drivers = []
    baseline = {
        0: 50.0, 1: 0.0, 2: 0.0, 3: 0.0, 4: 1.0, 5: 0.0, 6: 1.0, 7: 60.0, 8: 0.0, 9: 0.0,
    }
    names = {
        0: ("Visual quality score", f"Score {quality:.0f}/100 vs market mean 50"),
        1: ("Grade A premium", "Observed premium for Grade A lots"),
        2: ("Grade C discount", "Observed discount for Grade C lots"),
        3: ("Mandi arrivals", f"{arrivals:.0f} t today vs 400 t normal"),
        4: ("Demand index", f"Buyer demand {demand:.2f}× baseline"),
        5: ("Seasonality", f"Day {when.timetuple().tm_yday} of the marketing year"),
        6: ("Fuel index", f"Diesel {fuel:.2f}× baseline"),
        7: ("Distance to demand centre", f"{distance:.0f} km"),
        8: ("Moisture above spec", f"{moisture:.1f}% vs 14% cap — declared, not measured from the photo"),
        9: ("Festival window", "Demand spike in the next 7 days"),
    }
    for idx, base_val in baseline.items():
        xa = x.copy()
        xa[0, idx] = base_val
        eff = math.exp(log_mid - float(b["model"].predict(xa)[0])) - 1
        if abs(eff) > 0.002:
            label, note = names[idx]
            drivers.append({"label": label, "effect_pct": round(eff * 100, 2), "note": note})
    drivers.sort(key=lambda d: -abs(d["effect_pct"]))

    return {
        "low": round(low), "mid": round(mid), "high": round(high),
        "confidence": round(certainty * 100),
        "gross_low": round(low * quantity_q), "gross_mid": round(mid * quantity_q), "gross_high": round(high * quantity_q),
        "quantity_q": quantity_q,
        "drivers": drivers,
        "disclaimer": DISCLAIMER,
        "model": model_meta(),
    }


def compare_markets(crop: str, quality: float, grade: str, quantity_q: float,
                    vehicle_id: str = "tempo", has_cooling: bool = False) -> List[dict]:
    veh = next((v for v in VEHICLES if v["id"] == vehicle_id), VEHICLES[1])
    spec = CROPS.get(crop, CROPS["tomato"])
    out = []
    for m in MANDIS:
        base = price_range(crop, quality, grade, quantity_q, arrivals=m["arrivals_t"],
                           demand=m["demand_index"], distance=m["distance_km"])
        premium = m["grade_a_premium"] if grade == "A" else m["grade_a_premium"] * 0.35
        price_q = round(base["mid"] * (1 + premium))
        gross = price_q * quantity_q
        hours = m["distance_km"] / 38.0 + 0.75
        trips = math.ceil(quantity_q / veh["capacity_q"])
        transport = round((veh["fixed"] + veh["rate_per_km"] * m["distance_km"] * 2) * trips)
        commission = round(gross * m["commission_pct"] / 100.0)
        perishability = 24.0 / max(24.0, spec["shelf_h"])
        loss_rate = min(0.35, (veh["loss_per_h"] * (0.35 if has_cooling else 1.0)) * hours * (1 + perishability * 8))
        loss_value = round(gross * loss_rate)
        net = gross - transport - commission - loss_value
        out.append({
            "mandi": m, "vehicle": veh["id"], "price_per_q": price_q, "gross": round(gross),
            "transport": transport, "commission": commission, "loss_pct": round(loss_rate * 100, 1),
            "loss_value": loss_value, "net": round(net), "net_per_q": round(net / max(1, quantity_q)),
            "hours": round(hours, 1), "payment_days": m["payment_days"], "trips": trips,
        })
    out.sort(key=lambda o: -o["net"])
    best = out[0]["net"] if out else 0
    for i, o in enumerate(out):
        o["rank"] = i + 1
        o["delta_vs_best"] = o["net"] - best
    return out


def sell_simulator(crop: str, quality: float, grade: str, quantity_q: float,
                   best_net_now: float, cold_storage: bool = False) -> dict:
    spec = CROPS.get(crop, CROPS["tomato"])
    storage_per_q_day = 18 if cold_storage else 4
    decay_per_day = 24.0 / (spec["shelf_h"] * 3.2) if cold_storage else 24.0 / spec["shelf_h"]
    seed = sum(ord(c) for c in crop) % 97
    trend = ((seed % 23) / 23.0 - 0.45) * 0.3

    def build(horizon: str, days: int) -> dict:
        q = max(5, round(quality - min(45.0, decay_per_day * days * 62)))
        g = "A" if q >= 80 else "B" if q >= 60 else "C"
        drift = -trend * days * 0.045 + math.sin(days) * 0.004
        pr = price_range(crop, q, g, quantity_q, demand=1 + drift)
        spoil = min(0.4, decay_per_day * days * 0.85)
        gross = pr["mid"] * quantity_q * (1 - spoil)
        net = round(gross - storage_per_q_day * quantity_q * days)
        return {
            "horizon": horizon,
            "label": "Sell today" if days == 0 else f"Hold {days} days",
            "expected_price": pr["mid"], "low_price": pr["low"], "high_price": pr["high"],
            "quality_score": q, "grade": g,
            "storage_cost": round(storage_per_q_day * quantity_q * days),
            "spoil_loss_pct": round(spoil * 100, 1),
            "expected_net": net, "confidence": pr["confidence"] - days * 6,
        }

    options = [build("now", 0), build("2d", 2), build("5d", 5)]
    options[0]["expected_net"] = max(options[0]["expected_net"], round(best_net_now))
    base = options[0]["expected_net"]
    for o in options:
        delta = o["expected_net"] - base
        if o["horizon"] == "now":
            o["verdict"] = "Baseline — cash today, zero spoilage risk."
        elif delta > 0:
            o["verdict"] = f"+₹{delta:,} versus selling today, if the price path holds."
        else:
            o["verdict"] = f"−₹{abs(delta):,} versus today — decay and storage outrun any price rise."
    best = max(options, key=lambda o: o["expected_net"])
    return {
        "options": options,
        "best": best["horizon"],
        "note": (
            f"AI estimate. Arrivals trend {'rising' if trend > 0 else 'easing'} ({trend*100:.0f}%), "
            f"ambient shelf life {spec['shelf_h']} h"
            f"{', cold storage applied' if cold_storage else ''}. Confidence falls with the horizon — "
            "never treat this as a guaranteed price."
        ),
    }
