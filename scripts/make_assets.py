#!/usr/bin/env python3
"""
CropCare — pastel illustration generator.

Draws every image the app ships with (hero scenes, crop cards, feature tiles,
weather icons, empty states, badges, avatars) as flat pastel artwork using
Pillow only. Run once; the PNGs are committed into assets/images/ and bundled
with the app so the UI has real pictures offline.

    python scripts/make_assets.py
"""
from __future__ import annotations

import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "images")
os.makedirs(OUT, exist_ok=True)

# ----------------------------------------------------------------- palette --
CREAM = (255, 249, 240)
MINT = (205, 239, 216)
SAGE = (168, 213, 186)
DEEPGREEN = (46, 107, 79)
LEAF = (124, 187, 142)
SKY = (205, 231, 245)
SKY2 = (176, 216, 238)
BLUSH = (248, 214, 208)
PEACH = (251, 217, 183)
LILAC = (222, 211, 240)
BUTTER = (251, 239, 192)
SUN = (253, 217, 122)
SOIL = (199, 161, 122)
SOIL_DARK = (166, 128, 92)
TOMATO = (240, 129, 118)
TOMATO_D = (214, 92, 84)
INK = (58, 74, 64)
WHITE = (255, 255, 255)


def canvas(w=512, h=512, top=CREAM, bottom=MINT):
    """Vertical pastel gradient base."""
    img = Image.new("RGB", (w, h), top)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return img


def layer(img):
    return Image.new("RGBA", img.size, (0, 0, 0, 0))


def paste(base, over):
    base.paste(Image.alpha_composite(base.convert("RGBA"), over).convert("RGB"), (0, 0))


def soft_shadow(img, shape_fn, blur=14, alpha=52, offset=(0, 10)):
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    shape_fn(ImageDraw.Draw(sh), (0, 0, 0, alpha))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0)).__class__.alpha_composite(
        Image.new("RGBA", img.size, (0, 0, 0, 0)), sh.transform(img.size, Image.AFFINE, (1, 0, -offset[0], 0, 1, -offset[1]))
    )
    paste(img, sh)


def hill(d, y, h, color, w=512, wobble=0.0, seed=1):
    rnd = random.Random(seed)
    pts = [(0, h)]
    for x in range(0, w + 16, 16):
        yy = y + math.sin(x / w * math.pi * 2 + seed) * 10 * wobble + rnd.random() * 3 * wobble
        pts.append((x, yy))
    pts += [(w, h), (0, h)]
    d.polygon(pts, fill=color)


def sun(d, cx, cy, r, color=SUN, glow=True):
    if glow:
        for i in range(5, 0, -1):
            d.ellipse([cx - r - i * 9, cy - r - i * 9, cx + r + i * 9, cy + r + i * 9],
                      fill=(color[0], color[1], color[2], 16))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)


def cloud(d, cx, cy, s, color=(255, 255, 255, 225)):
    for dx, dy, rr in ((-s * 0.6, 0, s * 0.55), (0, -s * 0.22, s * 0.72), (s * 0.62, 0.02 * s, s * 0.5)):
        d.ellipse([cx + dx - rr, cy + dy - rr, cx + dx + rr, cy + dy + rr], fill=color)
    d.rounded_rectangle([cx - s * 1.15, cy - s * 0.1, cx + s * 1.12, cy + s * 0.52], radius=s * 0.3, fill=color)


def leaf(d, cx, cy, w, h, angle, color=LEAF, vein=(255, 255, 255, 110)):
    pts = []
    for i in range(41):
        t = i / 40
        x = (t - 0.5) * w
        y = math.sin(t * math.pi) * h / 2
        pts.append((x, y))
    for i in range(40, -1, -1):
        t = i / 40
        x = (t - 0.5) * w
        y = -math.sin(t * math.pi) * h / 2 * 0.55
        pts.append((x, y))
    a = math.radians(angle)
    rot = [(cx + x * math.cos(a) - y * math.sin(a), cy + x * math.sin(a) + y * math.cos(a)) for x, y in pts]
    d.polygon(rot, fill=color)
    x0 = (cx + (-w / 2) * math.cos(a), cy + (-w / 2) * math.sin(a))
    x1 = (cx + (w / 2) * math.cos(a), cy + (w / 2) * math.sin(a))
    d.line([x0, x1], fill=vein, width=max(2, int(h * 0.06)))


def sphere(d, cx, cy, r, color, dark, highlight=True):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=dark)
    d.ellipse([cx - r, cy - r, cx + r * 0.86, cy + r * 0.86], fill=color)
    if highlight:
        d.ellipse([cx - r * 0.55, cy - r * 0.62, cx - r * 0.08, cy - r * 0.18], fill=(255, 255, 255, 120))


def grain(img, amount=6, seed=3):
    rnd = random.Random(seed)
    px = img.load()
    w, h = img.size
    for _ in range(int(w * h * 0.06)):
        x, y = rnd.randrange(w), rnd.randrange(h)
        r, g, b = px[x, y][:3]
        n = rnd.randint(-amount, amount)
        px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
    return img


def save(img, name):
    path = os.path.join(OUT, name)
    img.convert("RGB").save(path, "PNG", optimize=True)
    print(f"  · {name} ({os.path.getsize(path)//1024} KB)")


# ------------------------------------------------------------------ scenes --
def hero_farm(w=1024, h=560):
    img = canvas(w, h, (255, 246, 232), (198, 231, 243))
    L = layer(img)
    d = ImageDraw.Draw(L)
    sun(d, w * 0.79, h * 0.24, 62)
    cloud(d, w * 0.2, h * 0.2, 42)
    cloud(d, w * 0.46, h * 0.13, 30, (255, 255, 255, 190))
    hill(d, h * 0.56, h, (198, 226, 205), w, 1.2, 2)
    hill(d, h * 0.66, h, (168, 213, 186), w, 1.6, 5)
    # striped fields
    for i, y in enumerate(range(int(h * 0.72), h, 26)):
        c = (150, 203, 168) if i % 2 == 0 else (168, 213, 186)
        d.polygon([(0, y), (w, y - 8), (w, y + 20), (0, y + 28)], fill=c)
    # crop rows
    rnd = random.Random(7)
    for i in range(34):
        x = rnd.randrange(20, w - 20)
        y = rnd.randrange(int(h * 0.74), h - 14)
        s = 12 + (y - h * 0.7) / 12
        d.line([(x, y), (x, y - s)], fill=(70, 138, 100), width=3)
        leaf(d, x - s * 0.35, y - s * 0.8, s * 0.9, s * 0.5, -25, (108, 176, 128))
        leaf(d, x + s * 0.35, y - s * 0.85, s * 0.9, s * 0.5, 205, (124, 187, 142))
    # tree
    d.rounded_rectangle([w * 0.13 - 9, h * 0.5, w * 0.13 + 9, h * 0.75], radius=8, fill=SOIL_DARK)
    for dx, dy, r in ((-32, -14, 44), (26, -20, 40), (0, -46, 46)):
        d.ellipse([w * 0.13 + dx - r, h * 0.5 + dy - r, w * 0.13 + dx + r, h * 0.5 + dy + r], fill=(126, 186, 143))
    paste(img, L)
    return grain(img)


def hero_market(w=1024, h=560):
    img = canvas(w, h, (255, 247, 236), (250, 224, 214))
    L = layer(img)
    d = ImageDraw.Draw(L)
    sun(d, w * 0.15, h * 0.2, 46, (253, 226, 160))
    # stall canopy
    N = 10
    bx0, bx1, tx0, tx1 = w * 0.1, w * 0.9, w * 0.14, w * 0.86
    yb, yt = h * 0.42, h * 0.28
    for i in range(N):
        f0, f1 = i / N, (i + 1) / N
        d.polygon([(bx0 + (bx1 - bx0) * f0, yb), (bx0 + (bx1 - bx0) * f1, yb),
                   (tx0 + (tx1 - tx0) * f1, yt), (tx0 + (tx1 - tx0) * f0, yt)],
                  fill=(255, 240, 234) if i % 2 == 0 else (244, 194, 183))
    # scalloped valance hanging below the canopy edge
    step = (bx1 - bx0) / N
    for i in range(N):
        cxv = bx0 + step * (i + 0.5)
        d.pieslice([cxv - step * 0.5, yb - step * 0.42, cxv + step * 0.5, yb + step * 0.42], 0, 180,
                   fill=(255, 240, 234) if i % 2 == 0 else (244, 194, 183))
    d.rounded_rectangle([w * 0.12, h * 0.42, w * 0.16, h * 0.82], radius=6, fill=SOIL)
    d.rounded_rectangle([w * 0.84, h * 0.42, w * 0.88, h * 0.82], radius=6, fill=SOIL)
    # crates
    for i, (cx, col, dcol) in enumerate([(0.3, TOMATO, TOMATO_D), (0.5, (247, 205, 118), (222, 178, 92)),
                                         (0.7, (183, 210, 140), (150, 180, 112))]):
        x = w * cx
        d.rounded_rectangle([x - 96, h * 0.62, x + 96, h * 0.84], radius=16, fill=SOIL)
        d.rounded_rectangle([x - 96, h * 0.62, x + 96, h * 0.68], radius=14, fill=SOIL_DARK)
        rnd = random.Random(i + 3)
        for k in range(11):
            cx2 = x - 74 + (k % 6) * 30 + rnd.randint(-4, 4)
            cy2 = h * 0.6 - (k // 6) * 24 + rnd.randint(-3, 3)
            sphere(d, cx2, cy2, 19, col, dcol)
    d.rectangle([0, h * 0.84, w, h], fill=(233, 219, 200))
    for i in range(9):
        d.line([(i * w / 9, h * 0.86), (i * w / 9 + 60, h)], fill=(224, 208, 188), width=6)
    paste(img, L)
    return grain(img)


def hero_help(w=1024, h=520):
    img = canvas(w, h, (255, 248, 238), (222, 211, 240))
    L = layer(img)
    d = ImageDraw.Draw(L)
    sun(d, w * 0.85, h * 0.2, 40, (252, 231, 176))
    hill(d, h * 0.78, h, (206, 232, 214), w, 0.8, 3)
    hill(d, h * 0.86, h, (176, 216, 190), w, 1.1, 6)
    # speech bubbles first, so heads overlap them naturally
    d.rounded_rectangle([w * 0.13, h * 0.08, w * 0.41, h * 0.26], radius=28, fill=(255, 255, 255, 240))
    d.polygon([(w * 0.28, h * 0.25), (w * 0.35, h * 0.25), (w * 0.32, h * 0.35)], fill=(255, 255, 255, 240))
    d.rounded_rectangle([w * 0.6, h * 0.04, w * 0.88, h * 0.22], radius=28, fill=(255, 255, 255, 240))
    d.polygon([(w * 0.64, h * 0.21), (w * 0.71, h * 0.21), (w * 0.66, h * 0.31)], fill=(255, 255, 255, 240))
    for x0, y0, cols in ((0.17, 0.135, ((176, 208, 190), (238, 200, 176), (196, 214, 202))),
                         (0.64, 0.095, ((238, 200, 176), (196, 214, 202), (176, 208, 190)))):
        for k in range(3):
            d.rounded_rectangle([w * x0 + k * 30, h * y0, w * x0 + 22 + k * 30, h * y0 + 12], radius=6, fill=cols[k])
    # two farmers (abstract, friendly shapes)
    for cx, shirt, cap in ((w * 0.33, (150, 196, 224), (86, 140, 176)), (w * 0.66, (243, 175, 160), (206, 122, 112))):
        d.rounded_rectangle([cx - 64, h * 0.47, cx + 64, h * 1.02], radius=44, fill=shirt)
        d.ellipse([cx - 44, h * 0.38 - 44, cx + 44, h * 0.38 + 44], fill=(238, 199, 165))
        d.chord([cx - 50, h * 0.38 - 60, cx + 50, h * 0.38 + 14], 180, 360, fill=cap)
        d.rounded_rectangle([cx - 62, h * 0.38 - 12, cx + 62, h * 0.38 - 2], radius=6, fill=cap)
        d.ellipse([cx - 18, h * 0.38 + 2, cx - 8, h * 0.38 + 12], fill=INK)
        d.ellipse([cx + 8, h * 0.38 + 2, cx + 18, h * 0.38 + 12], fill=INK)
        d.arc([cx - 16, h * 0.38 + 12, cx + 16, h * 0.38 + 34], 20, 160, fill=(168, 110, 96), width=5)
    # small plant between them
    px_, py_ = w * 0.5, h * 0.96
    d.line([(px_, py_), (px_, py_ - 42)], fill=(96, 156, 112), width=7)
    leaf(d, px_ - 22, py_ - 40, 52, 26, -24, (128, 190, 140))
    leaf(d, px_ + 22, py_ - 46, 52, 26, 206, (150, 205, 158))
    paste(img, L)
    return grain(img)


# ------------------------------------------------------------- crop cards ---
def crop_card(kind, w=440, h=340):
    bgs = {
        "tomato": ((255, 244, 238), (250, 215, 208)),
        "wheat": ((255, 250, 234), (250, 232, 186)),
        "rice": ((252, 250, 240), (231, 236, 210)),
        "onion": ((255, 245, 236), (244, 218, 196)),
        "potato": ((252, 246, 236), (231, 214, 190)),
        "chilli": ((255, 243, 238), (248, 205, 196)),
        "maize": ((255, 250, 232), (249, 228, 172)),
        "banana": ((255, 251, 232), (250, 236, 178)),
        "grape": ((250, 245, 255), (222, 211, 240)),
        "cotton": ((252, 250, 248), (226, 231, 236)),
    }
    top, bottom = bgs.get(kind, (CREAM, MINT))
    img = canvas(w, h, top, bottom)
    L = layer(img)
    d = ImageDraw.Draw(L)
    d.ellipse([w * 0.62, -h * 0.28, w * 1.3, h * 0.52], fill=(255, 255, 255, 90))
    hill(d, h * 0.78, h, (255, 255, 255, 120), w, 0.8, 3)
    cx, cy = w / 2, h * 0.56

    if kind == "tomato":
        for dx, dy, r in ((-92, 26, 54), (92, 22, 50), (0, -6, 70)):
            sphere(d, cx + dx, cy + dy, r, TOMATO, TOMATO_D)
            for k in range(5):
                a = k / 5 * math.tau
                leaf(d, cx + dx + math.cos(a) * r * 0.3, cy + dy - r * 0.82 + math.sin(a) * r * 0.12,
                     r * 0.5, r * 0.24, math.degrees(a), (110, 173, 112))
    elif kind in ("wheat", "rice", "maize"):
        stalk = (198, 160, 74) if kind == "wheat" else ((214, 197, 140) if kind == "rice" else (240, 200, 92))
        for i, x in enumerate((cx - 96, cx - 30, cx + 40, cx + 104)):
            top_y = cy - 100 - (i % 2) * 16
            d.line([(x, cy + 96), (x, top_y)], fill=(140, 172, 108), width=8)
            for k in range(7):
                yy = top_y + k * 15
                leaf(d, x - 15, yy, 34, 17, -28, stalk)
                leaf(d, x + 15, yy, 34, 17, 208, stalk)
            if kind == "maize":
                d.rounded_rectangle([x - 17, top_y + 16, x + 17, top_y + 92], radius=17, fill=(247, 214, 106))
                for r_ in range(5):
                    for c_ in range(3):
                        d.ellipse([x - 12 + c_ * 11, top_y + 24 + r_ * 14, x - 4 + c_ * 11, top_y + 33 + r_ * 14],
                                  fill=(255, 235, 160))
    elif kind == "onion":
        for dx, dy, r in ((-88, 24, 52), (88, 20, 48), (0, -4, 66)):
            sphere(d, cx + dx, cy + dy, r, (232, 186, 140), (206, 158, 112))
            for k in range(5):
                d.arc([cx + dx - r * 0.9, cy + dy - r, cx + dx + r * 0.9, cy + dy + r], 250 + k * 10, 290 + k * 10,
                      fill=(190, 146, 104), width=3)
            d.line([(cx + dx, cy + dy - r), (cx + dx - 8, cy + dy - r - 34)], fill=(150, 186, 120), width=6)
    elif kind == "potato":
        for dx, dy, rw, rh in ((-84, 30, 58, 44), (84, 24, 52, 40), (0, -10, 74, 54)):
            d.ellipse([cx + dx - rw, cy + dy - rh, cx + dx + rw, cy + dy + rh], fill=(190, 152, 108))
            d.ellipse([cx + dx - rw, cy + dy - rh, cx + dx + rw * 0.86, cy + dy + rh * 0.84], fill=(212, 175, 128))
            rnd = random.Random(int(dx))
            for _ in range(5):
                px_, py_ = cx + dx + rnd.randint(-int(rw * 0.6), int(rw * 0.6)), cy + dy + rnd.randint(-20, 20)
                d.ellipse([px_ - 5, py_ - 4, px_ + 5, py_ + 4], fill=(174, 138, 96))
    elif kind == "chilli":
        for dx, ang in ((-90, 18), (0, -4), (92, -20)):
            pts = []
            for i in range(30):
                t = i / 29
                x = cx + dx + math.sin(t * 2.2) * 26 - 8
                y = cy - 74 + t * 150
                pts.append((x + math.sin(t * math.pi) * 20, y))
            for i in range(29, -1, -1):
                t = i / 29
                x = cx + dx + math.sin(t * 2.2) * 26 - 8
                y = cy - 74 + t * 150
                pts.append((x - math.sin(t * math.pi) * 20, y))
            d.polygon(pts, fill=(226, 76, 66))
            d.line([(cx + dx - 8, cy - 74), (cx + dx - 12, cy - 108)], fill=(112, 170, 104), width=8)
            leaf(d, cx + dx - 12, cy - 108, 40, 20, ang, (128, 182, 116))
    elif kind == "banana":
        for i, (dx, dy, a) in enumerate(((-40, 10, -18), (0, -6, -8), (44, 6, 4))):
            pts = []
            for k in range(26):
                t = k / 25
                ang = math.radians(-150 + t * 110 + a)
                pts.append((cx + dx + math.cos(ang) * 92, cy + dy + math.sin(ang) * 92 + 40))
            for k in range(25, -1, -1):
                t = k / 25
                ang = math.radians(-150 + t * 110 + a)
                pts.append((cx + dx + math.cos(ang) * 66, cy + dy + math.sin(ang) * 66 + 40))
            d.polygon(pts, fill=(247, 216, 96) if i != 1 else (250, 226, 122))
    elif kind == "grape":
        for row in range(5):
            for col in range(5 - row):
                gx = cx - (4 - row) * 22 + col * 44
                gy = cy - 60 + row * 34
                sphere(d, gx, gy, 21, (168, 140, 208), (136, 110, 176))
        leaf(d, cx - 60, cy - 96, 84, 46, -18, (128, 182, 128))
        leaf(d, cx + 58, cy - 100, 78, 42, 200, (146, 194, 142))
    elif kind == "cotton":
        for dx, dy in ((-88, 18), (88, 12), (0, -14)):
            for a in range(5):
                ang = a / 5 * math.tau
                d.ellipse([cx + dx + math.cos(ang) * 26 - 32, cy + dy + math.sin(ang) * 26 - 32,
                           cx + dx + math.cos(ang) * 26 + 32, cy + dy + math.sin(ang) * 26 + 32], fill=(252, 251, 248))
            d.ellipse([cx + dx - 30, cy + dy - 30, cx + dx + 30, cy + dy + 30], fill=WHITE)
            for a in range(5):
                ang = a / 5 * math.tau + 0.4
                leaf(d, cx + dx + math.cos(ang) * 44, cy + dy + math.sin(ang) * 44, 40, 20,
                     math.degrees(ang), (168, 146, 118))
    paste(img, L)
    return grain(img, 4)


# ------------------------------------------------------------ feature tiles -
def tile(kind, w=360, h=280):
    schemes = {
        "scan": ((255, 246, 238), BLUSH), "price": ((255, 251, 235), BUTTER),
        "water": ((240, 250, 255), SKY), "doctor": ((244, 255, 246), MINT),
        "market": ((255, 247, 240), PEACH), "learn": ((250, 245, 255), LILAC),
        "village": ((255, 250, 240), (250, 226, 190)), "money": ((248, 255, 246), (206, 240, 206)),
        "passport": ((252, 248, 255), (223, 214, 244)), "weather": ((240, 249, 255), (198, 226, 245)),
        "animal": ((255, 248, 240), (243, 220, 192)), "seed": ((247, 255, 245), (205, 238, 205)),
    }
    top, bottom = schemes.get(kind, (CREAM, MINT))
    img = canvas(w, h, top, bottom)
    L = layer(img)
    d = ImageDraw.Draw(L)
    d.ellipse([-w * 0.2, -h * 0.4, w * 0.55, h * 0.5], fill=(255, 255, 255, 105))
    cx, cy = w / 2, h * 0.52

    if kind == "scan":
        d.rounded_rectangle([cx - 74, cy - 84, cx + 74, cy + 74], radius=26, fill=WHITE)
        d.rounded_rectangle([cx - 58, cy - 66, cx + 58, cy + 44], radius=18, fill=(226, 240, 230))
        leaf(d, cx, cy - 12, 92, 52, -16, LEAF)
        d.line([(cx - 74, cy - 6), (cx + 74, cy - 6)], fill=(240, 130, 120), width=6)
        br = (58, 74, 64, 90)
        for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            ax, ay = cx + sx * 104, cy + sy * 100
            d.line([(ax, ay), (ax - sx * 34, ay)], fill=br, width=8)
            d.line([(ax, ay), (ax, ay - sy * 34)], fill=br, width=8)
    elif kind == "price":
        for i, (bx, bh) in enumerate(((-70, 52), (-24, 88), (24, 66), (70, 116))):
            d.rounded_rectangle([cx + bx - 18, cy + 60 - bh, cx + bx + 18, cy + 60], radius=10,
                                fill=(247, 205, 118) if i % 2 else (245, 182, 108))
        d.line([(cx - 92, cy + 8), (cx - 30, cy - 24), (cx + 20, cy - 4), (cx + 92, cy - 70)],
               fill=(64, 148, 106), width=8, joint="curve")
        d.ellipse([cx + 82, cy - 80, cx + 102, cy - 60], fill=(64, 148, 106))
    elif kind == "water":
        for dx, dy, s in ((-56, 10, 30), (56, 4, 26), (0, -22, 40)):
            d.polygon([(cx + dx, cy + dy - s * 1.5), (cx + dx + s, cy + dy + s * 0.4),
                       (cx + dx, cy + dy + s * 1.1), (cx + dx - s, cy + dy + s * 0.4)], fill=(126, 194, 232))
            d.ellipse([cx + dx - s * 0.5, cy + dy - s * 0.2, cx + dx + s * 0.2, cy + dy + s * 0.6],
                      fill=(178, 220, 245))
        for i in range(3):
            d.arc([cx - 104 + i * 22, cy + 60 + i * 16, cx + 104 - i * 22, cy + 104 + i * 16], 200, 340,
                  fill=(154, 208, 236), width=6)
    elif kind == "doctor":
        leaf(d, cx, cy, 190, 108, -12, (140, 198, 152))
        rnd = random.Random(9)
        for _ in range(7):
            sx = cx + rnd.randint(-70, 70)
            sy = cy + rnd.randint(-28, 28)
            d.ellipse([sx - 15, sy - 12, sx + 15, sy + 12], fill=(238, 200, 120))
            d.ellipse([sx - 9, sy - 7, sx + 9, sy + 7], fill=(186, 122, 78))
        d.ellipse([cx + 44, cy - 60, cx + 116, cy + 12], outline=(96, 132, 112), width=8)
        d.line([(cx + 110, cy + 6), (cx + 138, cy + 34)], fill=(96, 132, 112), width=9)
    elif kind == "market":
        d.polygon([(cx - 100, cy + 4), (cx + 100, cy + 4), (cx + 84, cy - 44), (cx - 84, cy - 44)], fill=(244, 186, 172))
        for i in range(6):
            x0 = cx - 100 + i * 34
            d.polygon([(x0, cy + 4), (x0 + 17, cy + 4), (x0 + 15, cy - 44), (x0 + 2, cy - 44)], fill=(255, 240, 232))
        d.rounded_rectangle([cx - 84, cy + 4, cx + 84, cy + 74], radius=14, fill=SOIL)
        for k in range(6):
            sphere(d, cx - 64 + k * 26, cy + 2, 15, TOMATO, TOMATO_D)
    elif kind == "learn":
        d.rounded_rectangle([cx - 96, cy - 56, cx + 96, cy + 66], radius=16, fill=WHITE)
        d.polygon([(cx, cy - 56), (cx, cy + 66), (cx - 96, cy + 54), (cx - 96, cy - 64)], fill=(238, 233, 250))
        d.polygon([(cx, cy - 56), (cx, cy + 66), (cx + 96, cy + 54), (cx + 96, cy - 64)], fill=(248, 245, 255))
        for k in range(4):
            d.line([(cx - 80, cy - 32 + k * 22), (cx - 18, cy - 34 + k * 22)], fill=(196, 186, 224), width=6)
            d.line([(cx + 18, cy - 34 + k * 22), (cx + 80, cy - 32 + k * 22)], fill=(210, 202, 234), width=6)
    elif kind == "village":
        for dx, col in ((-88, (246, 210, 186)), (0, (250, 226, 190)), (88, (243, 200, 176))):
            d.rounded_rectangle([cx + dx - 44, cy - 6, cx + dx + 44, cy + 74], radius=10, fill=col)
            d.polygon([(cx + dx - 54, cy - 6), (cx + dx + 54, cy - 6), (cx + dx, cy - 58)], fill=(206, 148, 122))
            d.rounded_rectangle([cx + dx - 12, cy + 30, cx + dx + 12, cy + 74], radius=6, fill=(238, 234, 226))
        hill(d, cy + 74, h, (176, 216, 190), w, 0.6, 4)
    elif kind == "money":
        for i in range(3):
            d.rounded_rectangle([cx - 92 + i * 8, cy - 44 + i * 18, cx + 92 - i * 8, cy + 22 + i * 18],
                                radius=12, fill=(180 + i * 18, 220 + i * 10, 186 + i * 14))
        d.ellipse([cx - 26, cy + 2, cx + 26, cy + 54], fill=(247, 205, 118))
        d.ellipse([cx - 18, cy + 10, cx + 18, cy + 46], fill=(252, 226, 160))
    elif kind == "passport":
        d.rounded_rectangle([cx - 68, cy - 76, cx + 68, cy + 72], radius=16, fill=WHITE)
        for r_ in range(5):
            for c_ in range(5):
                if (r_ * 5 + c_ * 3) % 4 < 2:
                    d.rounded_rectangle([cx - 50 + c_ * 21, cy - 56 + r_ * 21, cx - 34 + c_ * 21, cy - 40 + r_ * 21],
                                        radius=3, fill=(90, 108, 96))
        d.rounded_rectangle([cx - 50, cy + 50, cx + 50, cy + 60], radius=5, fill=(198, 212, 202))
    elif kind == "weather":
        sun(d, cx + 44, cy - 34, 40, (253, 214, 118), glow=False)
        cloud(d, cx - 26, cy + 2, 46)
        for i, x in enumerate((-52, -14, 24, 60)):
            d.line([(cx + x, cy + 54), (cx + x - 10, cy + 84)], fill=(140, 198, 235), width=7)
    elif kind == "animal":
        d.ellipse([cx - 92, cy - 20, cx + 52, cy + 62], fill=(248, 240, 230))
        d.ellipse([cx + 18, cy - 62, cx + 108, cy + 20], fill=(248, 240, 230))
        d.ellipse([cx + 44, cy - 40, cx + 58, cy - 26], fill=INK)
        d.ellipse([cx + 82, cy - 34, cx + 96, cy - 20], fill=INK)
        d.polygon([(cx + 96, cy - 62), (cx + 118, cy - 84), (cx + 112, cy - 52)], fill=(232, 214, 198))
        for x in (-70, -40, 6, 34):
            d.rounded_rectangle([cx + x - 9, cy + 50, cx + x + 9, cy + 96], radius=8, fill=(238, 228, 216))
        d.ellipse([cx - 40, cy + 6, cx - 4, cy + 34], fill=(240, 206, 198))
    elif kind == "seed":
        for i, (dx, dy) in enumerate(((-64, 20), (0, -10), (64, 24))):
            d.ellipse([cx + dx - 26, cy + dy - 34, cx + dx + 26, cy + dy + 34], fill=(196, 162, 116))
            d.ellipse([cx + dx - 20, cy + dy - 28, cx + dx + 18, cy + dy + 26], fill=(220, 190, 144))
            d.line([(cx + dx, cy + dy - 34), (cx + dx, cy + dy - 62)], fill=(120, 178, 118), width=6)
            leaf(d, cx + dx - 16, cy + dy - 64, 40, 22, -30, (140, 198, 140))
            leaf(d, cx + dx + 16, cy + dy - 68, 40, 22, 206, (160, 210, 156))
    paste(img, L)
    return grain(img, 4)


# ---------------------------------------------------------------- weather ---
def weather_icon(kind, s=180):
    img = canvas(s, s, (247, 252, 255), (222, 240, 250))
    L = layer(img)
    d = ImageDraw.Draw(L)
    if kind == "sunny":
        sun(d, s / 2, s / 2, s * 0.24)
        for i in range(8):
            a = i / 8 * math.tau
            d.line([(s / 2 + math.cos(a) * s * 0.31, s / 2 + math.sin(a) * s * 0.31),
                    (s / 2 + math.cos(a) * s * 0.42, s / 2 + math.sin(a) * s * 0.42)], fill=SUN, width=9)
    elif kind == "cloudy":
        sun(d, s * 0.62, s * 0.38, s * 0.18, (253, 222, 140), glow=False)
        cloud(d, s * 0.46, s * 0.56, s * 0.24)
    elif kind == "rainy":
        cloud(d, s / 2, s * 0.42, s * 0.26, (206, 224, 236, 245))
        for i, x in enumerate((0.32, 0.46, 0.6, 0.72)):
            d.line([(s * x, s * 0.66), (s * x - s * 0.05, s * 0.86)], fill=(126, 186, 226), width=9)
    elif kind == "storm":
        cloud(d, s / 2, s * 0.4, s * 0.26, (186, 196, 214, 245))
        d.polygon([(s * 0.52, s * 0.58), (s * 0.4, s * 0.58), (s * 0.5, s * 0.98),
                   (s * 0.56, s * 0.74), (s * 0.66, s * 0.74)], fill=(250, 206, 108))
    paste(img, L)
    return img


def avatar(seed, s=200):
    rnd = random.Random(seed)
    tones = [(238, 199, 165), (226, 178, 140), (206, 156, 118), (246, 214, 186)]
    shirts = [(150, 196, 224), (243, 175, 160), (183, 214, 170), (222, 200, 240), (247, 214, 150)]
    bgs = [MINT, SKY, BLUSH, LILAC, BUTTER, PEACH]
    img = canvas(s, s, CREAM, bgs[seed % len(bgs)])
    L = layer(img)
    d = ImageDraw.Draw(L)
    skin = tones[seed % len(tones)]
    shirt = shirts[(seed * 3) % len(shirts)]
    d.rounded_rectangle([s * 0.18, s * 0.66, s * 0.82, s * 1.1], radius=s * 0.3, fill=shirt)
    d.ellipse([s * 0.28, s * 0.22, s * 0.72, s * 0.7], fill=skin)
    if seed % 2 == 0:
        d.chord([s * 0.24, s * 0.14, s * 0.76, s * 0.6], 180, 360, fill=(90, 108, 96))
    else:
        d.chord([s * 0.2, s * 0.16, s * 0.8, s * 0.56], 180, 360, fill=shirts[(seed + 2) % len(shirts)])
    d.ellipse([s * 0.4, s * 0.42, s * 0.45, s * 0.48], fill=INK)
    d.ellipse([s * 0.55, s * 0.42, s * 0.6, s * 0.48], fill=INK)
    d.arc([s * 0.42, s * 0.48, s * 0.58, s * 0.6], 20, 160, fill=(150, 96, 84), width=4)
    paste(img, L)
    return img


def badge_pollinator(s=360):
    img = canvas(s, s, (255, 252, 236), (250, 232, 186))
    L = layer(img)
    d = ImageDraw.Draw(L)
    cx = cy = s / 2
    for i in range(6):
        a = i / 6 * math.tau
        d.ellipse([cx + math.cos(a) * 62 - 46, cy + math.sin(a) * 62 - 46,
                   cx + math.cos(a) * 62 + 46, cy + math.sin(a) * 62 + 46], fill=(250, 206, 206))
    d.ellipse([cx - 44, cy - 44, cx + 44, cy + 44], fill=(252, 226, 150))
    # bee
    d.ellipse([cx - 20, cy - 16, cx + 22, cy + 18], fill=(250, 206, 108))
    for k in range(3):
        d.line([(cx - 10 + k * 12, cy - 14), (cx - 14 + k * 12, cy + 16)], fill=(76, 66, 58), width=6)
    d.ellipse([cx - 26, cy - 34, cx + 6, cy - 8], fill=(255, 255, 255, 190))
    d.ellipse([cx + 4, cy - 34, cx + 34, cy - 8], fill=(255, 255, 255, 190))
    paste(img, L)
    return img


def empty_state(kind, w=420, h=300):
    img = canvas(w, h, CREAM, MINT if kind != "market" else PEACH)
    L = layer(img)
    d = ImageDraw.Draw(L)
    cx, cy = w / 2, h * 0.54
    d.ellipse([cx - 120, cy + 52, cx + 120, cy + 92], fill=(255, 255, 255, 120))
    if kind == "scan":
        d.rounded_rectangle([cx - 78, cy - 76, cx + 78, cy + 62], radius=24, fill=WHITE)
        d.ellipse([cx - 34, cy - 34, cx + 34, cy + 30], fill=(226, 240, 230))
        d.ellipse([cx - 18, cy - 18, cx + 18, cy + 14], fill=(196, 222, 206))
        d.rounded_rectangle([cx - 26, cy - 92, cx + 26, cy - 70], radius=10, fill=WHITE)
    elif kind == "market":
        d.rounded_rectangle([cx - 84, cy - 20, cx + 84, cy + 58], radius=16, fill=SOIL)
        d.line([(cx - 84, cy - 20), (cx + 84, cy - 20)], fill=SOIL_DARK, width=10)
        d.arc([cx - 54, cy - 78, cx + 54, cy + 6], 180, 360, fill=SOIL_DARK, width=10)
    else:
        leaf(d, cx, cy, 168, 96, -14, (168, 213, 186))
        d.line([(cx - 84, cy + 8), (cx + 84, cy + 8)], fill=(255, 255, 255, 160), width=5)
    paste(img, L)
    return img


def splash(w=1024, h=1024):
    img = canvas(w, h, (255, 250, 240), (198, 231, 210))
    L = layer(img)
    d = ImageDraw.Draw(L)
    sun(d, w * 0.5, h * 0.36, 150, (253, 226, 150))
    hill(d, h * 0.62, h, (198, 230, 208), w, 1.0, 2)
    hill(d, h * 0.72, h, (168, 213, 186), w, 1.4, 6)
    leaf(d, w * 0.5, h * 0.44, 420, 240, -14, (110, 176, 132))
    leaf(d, w * 0.5, h * 0.44, 340, 180, 166, (134, 194, 150))
    d.line([(w * 0.5 - 200, h * 0.5), (w * 0.5 + 210, h * 0.38)], fill=(255, 255, 255, 150), width=10)
    paste(img, L)
    return grain(img)


if __name__ == "__main__":
    print("CropCare pastel assets →", OUT)
    save(hero_farm(), "hero_farm.png")
    save(hero_market(), "hero_market.png")
    save(hero_help(), "hero_help.png")
    save(splash(), "hero_splash.png")
    for c in ("tomato", "wheat", "rice", "onion", "potato", "chilli", "maize", "banana", "grape", "cotton"):
        save(crop_card(c), f"crop_{c}.png")
    for t in ("scan", "price", "water", "doctor", "market", "learn", "village", "money",
              "passport", "weather", "animal", "seed"):
        save(tile(t), f"tile_{t}.png")
    for wkind in ("sunny", "cloudy", "rainy", "storm"):
        save(weather_icon(wkind), f"wx_{wkind}.png")
    for i in range(1, 5):
        save(avatar(i), f"avatar_{i}.png")
    save(badge_pollinator(), "badge_pollinator.png")
    for e in ("scan", "market", "leaf"):
        save(empty_state(e), f"empty_{e}.png")
    print("done.")
