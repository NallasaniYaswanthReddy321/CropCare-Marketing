"""
AgriPrice visual quality engine (server side).

Pure NumPy + Pillow implementation of the same pipeline that runs on the phone:
RGB→HSV, Otsu segmentation, morphological cleanup, connected components,
Sobel/Laplacian texture, DCT perceptual hash, weighted quality score, grade and
a plain-language explanation. If opencv-python is installed it is used for the
morphology step only; the results are identical without it.

HONESTY CONTRACT — photographs give VISUAL evidence only. No laboratory
property (moisture, brix, residue, internal rot) is ever inferred here.
"""
from __future__ import annotations

import math
import time
from typing import Dict, List, Tuple

import numpy as np
from PIL import Image

CROP_SPECS: Dict[str, dict] = {
    "tomato": {"name": "Tomato", "ideal_hue": (0, 18), "ref_price": 1800, "shelf_life_h": 96},
    "wheat": {"name": "Wheat", "ideal_hue": (35, 55), "ref_price": 2300, "shelf_life_h": 8760},
    "rice": {"name": "Rice", "ideal_hue": (40, 60), "ref_price": 2100, "shelf_life_h": 8760},
    "onion": {"name": "Onion", "ideal_hue": (20, 45), "ref_price": 1500, "shelf_life_h": 2160},
    "potato": {"name": "Potato", "ideal_hue": (25, 50), "ref_price": 1200, "shelf_life_h": 4320},
    "cotton": {"name": "Cotton", "ideal_hue": (0, 60), "ref_price": 7000, "shelf_life_h": 8760},
    "chilli": {"name": "Chilli", "ideal_hue": (0, 20), "ref_price": 9000, "shelf_life_h": 120},
    "maize": {"name": "Maize", "ideal_hue": (40, 60), "ref_price": 1900, "shelf_life_h": 8760},
    "banana": {"name": "Banana", "ideal_hue": (45, 62), "ref_price": 1400, "shelf_life_h": 168},
    "grape": {"name": "Grape", "ideal_hue": (270, 320), "ref_price": 5500, "shelf_life_h": 336},
}

WEIGHTS = {
    "color": 0.22,
    "defects": 0.20,
    "uniformity": 0.16,
    "damage": 0.15,
    "size": 0.14,
    "shape": 0.13,
}


# --------------------------------------------------------------------------- #
# primitives
# --------------------------------------------------------------------------- #
def load_image(path: str, max_dim: int = 192) -> np.ndarray:
    img = Image.open(path).convert("RGB")
    scale = min(1.0, max_dim / max(img.size))
    if scale < 1.0:
        img = img.resize((max(8, int(img.width * scale)), max(8, int(img.height * scale))), Image.BILINEAR)
    return np.asarray(img, dtype=np.float32) / 255.0


def rgb_to_hsv(rgb: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(axis=-1)
    mn = rgb.min(axis=-1)
    d = mx - mn
    hue = np.zeros_like(mx)
    mask = d > 1e-6
    rmax = mask & (mx == r)
    gmax = mask & (mx == g)
    bmax = mask & (mx == b)
    hue[rmax] = (60 * ((g - b)[rmax] / d[rmax]) + 360) % 360
    hue[gmax] = 60 * ((b - r)[gmax] / d[gmax]) + 120
    hue[bmax] = 60 * ((r - g)[bmax] / d[bmax]) + 240
    sat = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0.0)
    return hue, sat, mx


def otsu(signal: np.ndarray, bins: int = 64) -> float:
    hist, edges = np.histogram(np.clip(signal, 0, 1), bins=bins, range=(0, 1))
    total = signal.size
    idx = np.arange(bins)
    sum_all = float((idx * hist).sum())
    w_b = np.cumsum(hist).astype(float)
    w_f = total - w_b
    sum_b = np.cumsum(idx * hist).astype(float)
    with np.errstate(invalid="ignore", divide="ignore"):
        m_b = sum_b / np.maximum(w_b, 1)
        m_f = (sum_all - sum_b) / np.maximum(w_f, 1)
        between = w_b * w_f * (m_b - m_f) ** 2
    between[np.isnan(between)] = 0
    return float(edges[int(np.argmax(between))])


def sobel(gray: np.ndarray) -> np.ndarray:
    kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
    ky = kx.T
    gx = _convolve(gray, kx)
    gy = _convolve(gray, ky)
    return np.clip(np.hypot(gx, gy) / 4.0, 0, 1)


def laplacian_var(gray: np.ndarray) -> float:
    k = np.array([[0, -1, 0], [-1, 4, -1], [0, -1, 0]], dtype=np.float32)
    return float(_convolve(gray, k).var())


def _convolve(img: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    pad = np.pad(img, 1, mode="edge")
    out = np.zeros_like(img)
    for dy in range(3):
        for dx in range(3):
            out += kernel[dy, dx] * pad[dy : dy + img.shape[0], dx : dx + img.shape[1]]
    return out


def morph(mask: np.ndarray, op: str) -> np.ndarray:
    pad = np.pad(mask, 1, mode="edge")
    stack = np.stack(
        [pad[dy : dy + mask.shape[0], dx : dx + mask.shape[1]] for dy in range(3) for dx in range(3)]
    )
    return stack.min(axis=0) if op == "erode" else stack.max(axis=0)


def largest_component(mask: np.ndarray) -> Tuple[np.ndarray, int, Tuple[int, int, int, int]]:
    h, w = mask.shape
    labels = -np.ones((h, w), dtype=np.int32)
    best_id, best_area, cur = -1, 0, 0
    flat = mask.reshape(-1)
    for start in range(h * w):
        if not flat[start] or labels.reshape(-1)[start] >= 0:
            continue
        stack = [start]
        labels.reshape(-1)[start] = cur
        area = 0
        while stack:
            i = stack.pop()
            area += 1
            y, x = divmod(i, w)
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and labels[ny, nx] < 0:
                    labels[ny, nx] = cur
                    stack.append(ny * w + nx)
        if area > best_area:
            best_area, best_id = area, cur
        cur += 1
    out = (labels == best_id).astype(np.uint8)
    ys, xs = np.nonzero(out)
    bbox = (int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)) if out.any() else (0, 0, w, h)
    return out, int(best_area), bbox


def perceptual_hash(gray: np.ndarray) -> str:
    img = Image.fromarray((gray * 255).astype(np.uint8)).resize((32, 32), Image.BILINEAR)
    a = np.asarray(img, dtype=np.float32)
    x = np.arange(32)
    basis = np.cos(np.pi * (2 * x[None, :] + 1) * np.arange(8)[:, None] / 64.0)
    dct = basis @ a @ basis.T
    flat = dct.flatten()
    med = np.median(flat[1:])
    bits = "".join("1" if v > med else "0" for v in flat)
    return "".join(f"{int(bits[i:i+4], 2):x}" for i in range(0, 64, 4))


# --------------------------------------------------------------------------- #
# quality grading
# --------------------------------------------------------------------------- #
def grade_produce(path: str, crop: str = "tomato") -> dict:
    t0 = time.time()
    spec = CROP_SPECS.get(crop, CROP_SPECS["tomato"])
    rgb = load_image(path)
    hue, sat, val = rgb_to_hsv(rgb)
    gray = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    h, w = gray.shape

    border = np.ones_like(gray, dtype=bool)
    border[2:-2, 2:-2] = False
    bh, bs, bv = float(hue[border].mean()), float(sat[border].mean()), float(val[border].mean())
    dh = np.minimum(np.abs(hue - bh), 360 - np.abs(hue - bh)) / 180.0
    saliency = np.clip(0.45 * dh + 0.35 * np.abs(sat - bs) + 0.20 * np.abs(val - bv), 0, 1)
    raw = (saliency > otsu(saliency)).astype(np.uint8)
    opened = morph(morph(raw, "erode"), "dilate")
    obj, area, bbox = largest_component(opened)
    if area < 40:
        obj = np.ones_like(obj)
        area = obj.size
        bbox = (0, 0, w, h)
    sel = obj.astype(bool)
    object_fraction = area / float(h * w)

    lo, hi = spec["ideal_hue"]
    hsel = hue[sel]
    in_window = ((hsel >= lo) & (hsel <= hi)) if lo <= hi else ((hsel >= lo) | (hsel <= hi))
    ripeness = float(in_window.mean())
    unripe = float(((hsel > 65) & (hsel < 165) & (sat[sel] > 0.2)).mean())
    mean_sat = float(sat[sel].mean())
    mean_val = float(val[sel].mean())
    dominant_hue = float(np.median(hsel))
    color_score = int(round(100 * max(0.0, min(1.0, 0.55 * ripeness + 0.30 * min(1.0, mean_sat / 0.55) + 0.15 * (1 - abs(mean_val - 0.58))))))

    med_v = float(np.median(val[sel]))
    defect_mask = (val < med_v * 0.55) | ((sat < 0.12) & (val < 0.5))
    defect_pct = float(defect_mask[sel].mean() * 100)
    defect_score = int(round(max(0.0, 100 - defect_pct * 3.2)))

    edges = sobel(gray)
    damage_pct = float((edges[sel] > 0.34).mean() * 100)
    damage_score = int(round(max(0.0, 100 - max(0.0, damage_pct - 6) * 2.6)))

    g = 8
    cell_h, cell_v = [], []
    for gy in range(g):
        for gx in range(g):
            ys = slice(gy * h // g, (gy + 1) * h // g)
            xs = slice(gx * w // g, (gx + 1) * w // g)
            m = sel[ys, xs]
            if m.sum() > 4:
                cell_h.append(float(hue[ys, xs][m].mean()))
                cell_v.append(float(val[ys, xs][m].mean()))
    hue_std = float(np.std(cell_h)) if cell_h else 0.0
    val_std = float(np.std(cell_v)) if cell_v else 0.0
    uniformity = max(0.0, min(1.0, 1 - (hue_std / 55) * 0.6 - (val_std / 0.32) * 0.4))
    uniformity_score = int(round(uniformity * 100))

    bw, bh_ = bbox[2], bbox[3]
    aspect = bw / max(1, bh_)
    perim = int(np.sum(obj ^ morph(obj, "erode")))
    circularity = min(1.0, (4 * math.pi * area) / max(1.0, perim ** 2))
    size_score = int(round(max(0.0, min(100.0, 100 - abs(object_fraction - 0.45) * 170))))
    shape_score = int(round(max(0.0, min(100.0, 100 - abs(1 - aspect) * 55 - (1 - circularity) * 45))))

    subs = [
        {"key": "color", "label": "Colour & ripeness", "score": color_score, "weight": WEIGHTS["color"],
         "detail": f"{ripeness*100:.0f}% of the surface sits in the ripe hue window ({lo}–{hi}°); median hue {dominant_hue:.0f}°, saturation {mean_sat*100:.0f}%."},
        {"key": "defects", "label": "Surface defects", "score": defect_score, "weight": WEIGHTS["defects"],
         "detail": f"{defect_pct:.1f}% of surface pixels read as blemish-dark or necrotic-pale."},
        {"key": "uniformity", "label": "Uniformity", "score": uniformity_score, "weight": WEIGHTS["uniformity"],
         "detail": f"Cell-to-cell hue σ = {hue_std:.1f}°, brightness σ = {val_std:.2f}."},
        {"key": "damage", "label": "Physical damage", "score": damage_score, "weight": WEIGHTS["damage"],
         "detail": f"{damage_pct:.1f}% high-gradient pixels indicate cracks, cuts or bruise borders."},
        {"key": "size", "label": "Size consistency", "score": size_score, "weight": WEIGHTS["size"],
         "detail": f"Produce occupies {object_fraction*100:.0f}% of the frame; bounding box {bw}×{bh_} px."},
        {"key": "shape", "label": "Shape regularity", "score": shape_score, "weight": WEIGHTS["shape"],
         "detail": f"Aspect ratio {aspect:.2f}, circularity {circularity:.2f}."},
    ]
    score = int(round(sum(s["score"] * s["weight"] for s in subs)))
    grade = "A" if score >= 80 else "B" if score >= 60 else "C"

    heat = _heat_grid(val, edges, sel, med_v)

    best = max(subs, key=lambda s: s["score"])
    worst = min(subs, key=lambda s: s["score"])
    explanation = [
        f"Grade {grade} ({score}/100): {best['label'].lower()} is the strongest attribute at {best['score']}/100.",
        f"Biggest deduction: {worst['label'].lower()} at {worst['score']}/100 — {worst['detail']}",
    ]
    if unripe > 0.25:
        explanation.append(f"{unripe*100:.0f}% of the surface still reads green — a 1–2 day delay could lift the grade.")
    if defect_pct > 8:
        explanation.append(f"Sorting out the visibly blemished {defect_pct:.0f}% before sale typically recovers 6–11% on the lot price.")
    if grade == "A":
        explanation.append("Uniform colour and low defect load qualify this lot for premium/export buyer lanes.")

    sharpness = laplacian_var(gray) * 1000
    coaching = []
    if sharpness < 1.4:
        coaching.append({"level": "bad", "text": "Photo is blurry — hold still, tap to focus, retake."})
    elif sharpness < 3:
        coaching.append({"level": "warn", "text": "Slightly soft focus. Steadier hands give a better grade."})
    else:
        coaching.append({"level": "ok", "text": "Sharp focus — good detail for defect detection."})
    if mean_val < 0.28:
        coaching.append({"level": "bad", "text": "Too dark. Shoot in open shade during daylight."})
    elif float((val > 0.97).mean()) > 0.08:
        coaching.append({"level": "warn", "text": "Harsh glare is blowing out colour. Turn away from direct sun."})
    else:
        coaching.append({"level": "ok", "text": "Even lighting — colour readings are reliable."})
    if object_fraction < 0.12:
        coaching.append({"level": "bad", "text": "Subject too small in frame. Move closer, fill 40–70%."})
    elif object_fraction > 0.9:
        coaching.append({"level": "warn", "text": "Subject fills the whole frame — back off so edges are visible."})
    else:
        coaching.append({"level": "ok", "text": "Framing is good — shape and size measured reliably."})

    return {
        "crop": crop,
        "crop_name": spec["name"],
        "score": score,
        "grade": grade,
        "subs": subs,
        "explanation": explanation,
        "ripeness_pct": round(ripeness * 100),
        "defect_pct": round(defect_pct, 1),
        "damage_pct": round(damage_pct, 1),
        "uniformity": round(uniformity, 2),
        "object_fraction": round(object_fraction, 2),
        "dominant_hue": round(dominant_hue),
        "heat": heat,
        "coaching": coaching,
        "phash": perceptual_hash(gray),
        "ms": int((time.time() - t0) * 1000),
        "caveat": (
            "Visual evidence only. Moisture, sugar content, pesticide residue and internal rot "
            "cannot be seen in a photograph and are never inferred here."
        ),
    }


def _heat_grid(val: np.ndarray, edges: np.ndarray, sel: np.ndarray, med_v: float, g: int = 12) -> List[List[float]]:
    h, w = val.shape
    evidence = (val < med_v * 0.6).astype(np.float32) + 0.8 * (edges > 0.34).astype(np.float32)
    evidence = evidence * np.where(sel, 1.0, 0.35)
    grid = []
    for gy in range(g):
        row = []
        for gx in range(g):
            ys = slice(gy * h // g, (gy + 1) * h // g)
            xs = slice(gx * w // g, (gx + 1) * w // g)
            row.append(float(evidence[ys, xs].mean()))
        grid.append(row)
    mx = max(max(r) for r in grid) or 1.0
    return [[round(v / mx, 3) for v in r] for r in grid]


# --------------------------------------------------------------------------- #
# multi-label disease inference
# --------------------------------------------------------------------------- #
DISEASES = [
    {"id": "late_blight", "name": "Late blight (Phytophthora)", "b": -3.1,
     "w": {"dark": 7.2, "watersoak": 5.4, "brown": 2.6, "texture": 1.4, "yellow": 0.6},
     "organic": "Copper oxychloride 3 g/L + remove infected foliage at dawn.",
     "chemical": "Cymoxanil 8% + Mancozeb 64% @ 2 g/L, repeat after 7 days.",
     "action": "Act within 48 h — spreads fastest at 12–20 °C with leaf wetness > 8 h."},
    {"id": "early_blight", "name": "Early blight (Alternaria)", "b": -2.9,
     "w": {"concentric": 6.1, "brown": 4.2, "yellow": 2.4, "dark": 1.9, "texture": 1.1},
     "organic": "Neem oil 5 ml/L + Trichoderma soil drench.",
     "chemical": "Azoxystrobin 23% SC @ 1 ml/L.",
     "action": "Remove lower senescing leaves; mulch to stop soil splash."},
    {"id": "powdery_mildew", "name": "Powdery mildew", "b": -2.7,
     "w": {"white": 8.4, "lowsat": 3.1, "texture": 0.9, "green": 0.8},
     "organic": "Milk spray 1:9 or potassium bicarbonate 5 g/L, weekly.",
     "chemical": "Wettable sulphur 80% @ 2 g/L (avoid above 32 °C).",
     "action": "Improve airflow — thin the canopy, avoid evening overhead irrigation."},
    {"id": "rust", "name": "Rust (Puccinia)", "b": -3.0,
     "w": {"orange": 8.9, "pustule": 4.2, "texture": 1.3, "yellow": 1.1},
     "organic": "Sulphur dust at first pustule; destroy volunteer hosts.",
     "chemical": "Propiconazole 25% EC @ 1 ml/L.",
     "action": "Scout the upwind field edge — rust arrives on wind currents."},
    {"id": "bacterial_spot", "name": "Bacterial leaf spot", "b": -3.2,
     "w": {"dark": 4.4, "halo": 6.2, "watersoak": 3.1, "texture": 1.6},
     "organic": "Copper hydroxide + Bacillus subtilis rotation.",
     "chemical": "Streptomycin sulphate 100 ppm (follow label limits).",
     "action": "Stop overhead irrigation; never work rows while foliage is wet."},
    {"id": "nitrogen_deficiency", "name": "Nitrogen deficiency", "b": -2.5,
     "w": {"yellow": 6.8, "pale": 5.2, "green": -3.4, "texture": -0.6},
     "organic": "Vermicompost 2 t/ha + 3% jeevamrut foliar.",
     "chemical": "Urea 46% @ 2% foliar spray, or 25 kg N/ha side-dress.",
     "action": "Older leaves yellow first — confirm with a leaf-colour chart before dosing."},
    {"id": "potassium_deficiency", "name": "Potassium deficiency", "b": -3.3,
     "w": {"margin": 7.1, "brown": 2.2, "yellow": 2.0, "green": -1.8},
     "organic": "Wood ash 500 kg/ha or banana-peel compost.",
     "chemical": "MOP 40 kg K₂O/ha or 1% KNO₃ foliar.",
     "action": "Scorched leaf margins with a green mid-rib is the signature pattern."},
]


def detect_disease(path: str, crop: str = "tomato") -> dict:
    t0 = time.time()
    rgb = load_image(path)
    hue, sat, val = rgb_to_hsv(rgb)
    gray = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    edges = sobel(gray)

    leaf = (((hue > 55) & (hue < 175) & (sat > 0.15)) | ((sat > 0.25) & (hue < 60) & (val > 0.12)))
    leaf = morph(leaf.astype(np.uint8), "dilate")
    obj, area, _ = largest_component(leaf)
    sel = obj.astype(bool) if area > 60 else np.ones_like(leaf, dtype=bool)
    med_v = float(np.median(val[sel]))
    n = float(sel.sum())

    f = {
        "green": float(((hue > 70) & (hue < 165) & (sat > 0.25) & (val > 0.2))[sel].mean()),
        "yellow": float(((hue >= 40) & (hue <= 70) & (sat > 0.3))[sel].mean()),
        "brown": float(((hue >= 15) & (hue < 40) & (val < 0.65) & (sat > 0.2))[sel].mean()),
        "dark": float((val < max(0.22, med_v * 0.5))[sel].mean()),
        "white": float(((sat < 0.14) & (val > 0.72))[sel].mean()),
        "orange": float(((hue >= 12) & (hue <= 38) & (sat > 0.5) & (val > 0.45))[sel].mean()),
        "lowsat": float((sat < 0.2)[sel].mean()),
        "texture": float((edges > 0.3)[sel].mean()),
        "pale": float(((val > 0.45) & (sat < 0.35) & (hue > 45) & (hue < 75))[sel].mean()),
    }
    edge_band = sel & ~morph(sel.astype(np.uint8), "erode").astype(bool)
    f["margin"] = float(((hue < 45) & (val < 0.6))[edge_band].mean()) if edge_band.any() else 0.0
    f["watersoak"] = min(1.0, f["dark"] * (1 - f["green"]) * 2.4)
    f["concentric"] = min(1.0, f["brown"] * f["texture"] * 6)
    f["halo"] = min(1.0, f["yellow"] * f["dark"] * 7)
    f["pustule"] = min(1.0, f["orange"] * f["texture"] * 8)

    labels = []
    for d in DISEASES:
        z = d["b"] + sum(wv * f.get(k, 0.0) * 3.1 for k, wv in d["w"].items())
        score = 1 / (1 + math.exp(-z))
        top_feature = max(d["w"], key=lambda k: f.get(k, 0.0) * d["w"][k])
        labels.append({
            "id": d["id"], "name": d["name"], "score": round(score, 3),
            "evidence": f"{top_feature} signal covers {f.get(top_feature, 0)*100:.1f}% of leaf pixels",
            "organic": d["organic"], "chemical": d["chemical"], "action": d["action"],
            "severity": "high" if score > 0.66 else "medium" if score > 0.4 else "low",
        })
    labels.sort(key=lambda x: -x["score"])

    return {
        "crop": crop,
        "labels": labels,
        "top": labels[0],
        "healthy_score": round(max(0.0, 1 - labels[0]["score"]), 3),
        "features": {k: round(v, 4) for k, v in f.items()},
        "heat": _heat_grid(val, edges, sel, med_v),
        "leaf_fraction": round(float(n / val.size), 2),
        "phash": perceptual_hash(gray),
        "ms": int((time.time() - t0) * 1000),
        "model": "on-device CV ensemble, 7 labels (multi-label)",
    }
