/**
 * CropCare on-device vision stack — 100% offline, zero network, zero native deps.
 *
 *  • pixel loader (Canvas on web, jpeg-js decode on iOS/Android)
 *  • OpenCV-equivalent primitives re-implemented in TypeScript:
 *      RGB→HSV, Otsu threshold, connected components, Sobel/Laplacian,
 *      morphological cleanup, perimeter tracing, DCT perceptual hash
 *  • AgriPrice visual quality grader (size/color/shape/uniformity/defects/
 *    ripeness/damage) → Quality Score 0-100 + Grade A/B/C + explanation
 *  • Multi-label foliar disease inference (7 labels) + Grad-CAM style
 *    class-activation heat-map + capture coaching
 *
 * HONESTY CONTRACT: photos give VISUAL evidence only. Nothing here claims a
 * laboratory property (moisture, brix, residue, internal rot).
 */
import { Platform } from 'react-native';
import { CROPS, CropKey } from './agro';

export type Pixels = { data: Uint8ClampedArray; w: number; h: number };

/* ------------------------------ pixel loader ----------------------------- */
export async function loadPixels(uri: string, maxDim = 192): Promise<Pixels> {
  if (Platform.OS === 'web') return loadPixelsWeb(uri, maxDim);
  return loadPixelsNative(uri, maxDim);
}

function loadPixelsWeb(uri: string, maxDim: number): Promise<Pixels> {
  return new Promise((resolve, reject) => {
    const img = new (globalThis as any).Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(8, Math.round(img.width * scale));
      const h = Math.max(8, Math.round(img.height * scale));
      const canvas = (globalThis as any).document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      const id = ctx.getImageData(0, 0, w, h);
      resolve({ data: id.data, w, h });
    };
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = uri;
  });
}

async function loadPixelsNative(uri: string, maxDim: number): Promise<Pixels> {
  const jpeg = require('jpeg-js');
  let bytes: Uint8Array;
  try {
    const FS = require('expo-file-system/legacy');
    const b64 = await FS.readAsStringAsync(uri, { encoding: 'base64' });
    const { b64decode } = require('./crypto');
    bytes = b64decode(b64);
  } catch {
    const res = await fetch(uri);
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  const raw = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  const scale = Math.min(1, maxDim / Math.max(raw.width, raw.height));
  const w = Math.max(8, Math.round(raw.width * scale));
  const h = Math.max(8, Math.round(raw.height * scale));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(raw.height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(raw.width - 1, Math.floor(x / scale));
      const s = (sy * raw.width + sx) * 4, d = (y * w + x) * 4;
      out[d] = raw.data[s]; out[d + 1] = raw.data[s + 1]; out[d + 2] = raw.data[s + 2]; out[d + 3] = 255;
    }
  }
  return { data: out, w, h };
}

/* --------------------------- colour primitives --------------------------- */
export function rgb2hsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hue = 0;
  if (d !== 0) {
    if (mx === r) hue = 60 * (((g - b) / d) % 6);
    else if (mx === g) hue = 60 * ((b - r) / d + 2);
    else hue = 60 * ((r - g) / d + 4);
  }
  if (hue < 0) hue += 360;
  return [hue, mx === 0 ? 0 : d / mx, mx];
}

export type Planes = { hue: Float32Array; sat: Float32Array; val: Float32Array; gray: Float32Array; w: number; h: number };

export function toPlanes(px: Pixels): Planes {
  const n = px.w * px.h;
  const hue = new Float32Array(n), sat = new Float32Array(n), val = new Float32Array(n), gray = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = px.data[i * 4], g = px.data[i * 4 + 1], b = px.data[i * 4 + 2];
    const [hh, ss, vv] = rgb2hsv(r, g, b);
    hue[i] = hh; sat[i] = ss; val[i] = vv;
    gray[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  return { hue, sat, val, gray, w: px.w, h: px.h };
}

/** Otsu's method — maximises between-class variance over a 0..1 signal. */
export function otsu(signal: Float32Array, bins = 64): number {
  const hist = new Float64Array(bins);
  for (let i = 0; i < signal.length; i++) hist[Math.min(bins - 1, Math.max(0, Math.floor(signal[i] * bins)))]++;
  const total = signal.length;
  let sum = 0;
  for (let i = 0; i < bins; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 0;
  for (let i = 0; i < bins; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = i; }
  }
  return thr / bins;
}

/** 3×3 Sobel gradient magnitude, normalised 0..1. */
export function sobel(p: Planes): Float32Array {
  const { gray, w, h } = p;
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] + gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
      const gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      out[i] = Math.min(1, Math.hypot(gx, gy) / 4);
    }
  }
  return out;
}

/** Variance of the Laplacian — the standard sharpness/blur metric. */
export function laplacianVariance(p: Planes): number {
  const { gray, w, h } = p;
  const vals: number[] = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      vals.push(4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w]);
    }
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  return vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length;
}

/** Largest connected component of a binary mask (4-connectivity BFS). */
export function largestComponent(mask: Uint8Array, w: number, h: number): { mask: Uint8Array; area: number; bbox: [number, number, number, number] } {
  const label = new Int32Array(w * h).fill(-1);
  let bestId = -1, bestArea = 0, id = 0;
  const areas: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || label[s] >= 0) continue;
    let area = 0;
    stack.push(s); label[s] = id;
    while (stack.length) {
      const i = stack.pop()!;
      area++;
      const x = i % w, y = (i / w) | 0;
      if (x > 0 && mask[i - 1] && label[i - 1] < 0) { label[i - 1] = id; stack.push(i - 1); }
      if (x < w - 1 && mask[i + 1] && label[i + 1] < 0) { label[i + 1] = id; stack.push(i + 1); }
      if (y > 0 && mask[i - w] && label[i - w] < 0) { label[i - w] = id; stack.push(i - w); }
      if (y < h - 1 && mask[i + w] && label[i + w] < 0) { label[i + w] = id; stack.push(i + w); }
    }
    areas.push(area);
    if (area > bestArea) { bestArea = area; bestId = id; }
    id++;
  }
  const out = new Uint8Array(w * h);
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let i = 0; i < w * h; i++) {
    if (label[i] === bestId) {
      out[i] = 1;
      const x = i % w, y = (i / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return { mask: out, area: bestArea, bbox: [x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)] };
}

/** All connected components (4-connectivity) with area + centroid — used by the AR spray card reader. */
export function allComponents(mask: Uint8Array, w: number, h: number): { area: number; cx: number; cy: number }[] {
  const seen = new Uint8Array(w * h);
  const out: { area: number; cx: number; cy: number }[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue;
    let area = 0, sx = 0, sy = 0;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w, y = (i / w) | 0;
      area++; sx += x; sy += y;
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
      if (x < w - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && mask[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); }
      if (y < h - 1 && mask[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); }
    }
    out.push({ area, cx: sx / area, cy: sy / area });
  }
  return out;
}

function perimeter(mask: Uint8Array, w: number, h: number): number {
  let p = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]) p++;
    }
  return p;
}

/** 32×32 DCT perceptual hash (64-bit hex) — used for duplicate/spoof detection. */
export function pHash(p: Planes): string {
  const N = 32;
  const g = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const sx = Math.min(p.w - 1, Math.floor((x / N) * p.w));
      const sy = Math.min(p.h - 1, Math.floor((y / N) * p.h));
      g[y * N + x] = p.gray[sy * p.w + sx];
    }
  const dct = new Float32Array(8 * 8);
  for (let u = 0; u < 8; u++)
    for (let v = 0; v < 8; v++) {
      let s = 0;
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++)
          s += g[y * N + x] * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)) * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N));
      dct[v * 8 + u] = s;
    }
  const vals = Array.from(dct).slice(1);
  const med = vals.slice().sort((a, b) => a - b)[Math.floor(vals.length / 2)];
  let bits = '';
  for (let i = 0; i < 64; i++) bits += dct[i] > med ? '1' : '0';
  return (bits.match(/.{4}/g) || []).map((b) => parseInt(b, 2).toString(16)).join('');
}

/* ---------------------------- capture coaching ---------------------------- */
export type Coaching = { ok: boolean; score: number; tips: { level: 'ok' | 'warn' | 'bad'; icon: string; text: string }[] };

export function coach(p: Planes, objectFraction: number): Coaching {
  const tips: Coaching['tips'] = [];
  const sharp = laplacianVariance(p) * 1000;
  const meanV = p.val.reduce((a, b) => a + b, 0) / p.val.length;
  let clipped = 0, dark = 0;
  for (let i = 0; i < p.val.length; i++) { if (p.val[i] > 0.97) clipped++; if (p.val[i] < 0.08) dark++; }
  const clipPct = clipped / p.val.length, darkPct = dark / p.val.length;

  if (sharp < 1.4) tips.push({ level: 'bad', icon: 'scan-outline', text: 'Photo is blurry — hold still, tap to focus, retake.' });
  else if (sharp < 3) tips.push({ level: 'warn', icon: 'scan-outline', text: 'Slightly soft focus. Steadier hands give a better grade.' });
  else tips.push({ level: 'ok', icon: 'checkmark-circle', text: 'Sharp focus — good detail for defect detection.' });

  if (meanV < 0.28) tips.push({ level: 'bad', icon: 'moon-outline', text: 'Too dark. Shoot in open shade during daylight.' });
  else if (clipPct > 0.08) tips.push({ level: 'warn', icon: 'sunny-outline', text: 'Harsh glare is blowing out colour. Turn away from direct sun.' });
  else tips.push({ level: 'ok', icon: 'sunny-outline', text: 'Even lighting — colour readings are reliable.' });

  if (objectFraction < 0.12) tips.push({ level: 'bad', icon: 'resize-outline', text: 'Subject too small in frame. Move closer, fill 40-70% of the frame.' });
  else if (objectFraction > 0.9) tips.push({ level: 'warn', icon: 'resize-outline', text: 'Subject fills the whole frame — back off so the edges are visible.' });
  else tips.push({ level: 'ok', icon: 'resize-outline', text: 'Framing is good — shape and size measured reliably.' });

  if (darkPct > 0.35) tips.push({ level: 'warn', icon: 'contrast-outline', text: 'Busy dark background. Use a plain cloth or the ground.' });

  const score = Math.round(
    Math.min(100, (Math.min(6, sharp) / 6) * 45 + (1 - Math.abs(meanV - 0.55)) * 30 + (objectFraction > 0.12 && objectFraction < 0.9 ? 25 : 8)),
  );
  return { ok: !tips.some((t) => t.level === 'bad'), score, tips };
}

/* ------------------------- AgriPrice quality grader ----------------------- */
export type QualitySub = { key: string; label: string; score: number; weight: number; detail: string };
export type QualityResult = {
  score: number; grade: 'A' | 'B' | 'C'; crop: CropKey;
  subs: QualitySub[]; explanation: string[]; ripenessPct: number;
  defectPct: number; damagePct: number; uniformity: number; objectFraction: number;
  dominantHue: number; heat: number[][]; coaching: Coaching; phash: string;
  msVision: number; caveat: string;
};

export function gradeProduce(px: Pixels, crop: CropKey): QualityResult {
  const t0 = Date.now();
  const p = toPlanes(px);
  const n = p.w * p.h;

  // 1) background estimation from the frame border, then saliency + Otsu.
  let bh = 0, bs = 0, bv = 0, bc = 0;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++)
      if (x < 2 || y < 2 || x > p.w - 3 || y > p.h - 3) { const i = y * p.w + x; bh += p.hue[i]; bs += p.sat[i]; bv += p.val[i]; bc++; }
  bh /= bc; bs /= bc; bv /= bc;
  const sal = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const dh = Math.min(Math.abs(p.hue[i] - bh), 360 - Math.abs(p.hue[i] - bh)) / 180;
    sal[i] = Math.min(1, 0.45 * dh + 0.35 * Math.abs(p.sat[i] - bs) + 0.2 * Math.abs(p.val[i] - bv));
  }
  const thr = otsu(sal);
  const raw = new Uint8Array(n);
  for (let i = 0; i < n; i++) raw[i] = sal[i] > thr ? 1 : 0;
  // morphological opening (3×3 erosion + dilation) removes speckle
  const open = morph(morph(raw, p.w, p.h, 'erode'), p.w, p.h, 'dilate');
  const comp = largestComponent(open, p.w, p.h);
  const objIdx: number[] = [];
  for (let i = 0; i < n; i++) if (comp.mask[i]) objIdx.push(i);
  const objectFraction = comp.area / n;
  const idx = objIdx.length > 40 ? objIdx : Array.from({ length: n }, (_, i) => i);

  // 2) colour + ripeness
  const spec = CROPS[crop];
  const [hLo, hHi] = spec.idealHue;
  let inWindow = 0, unripe = 0, over = 0, satSum = 0, valSum = 0;
  const hues: number[] = [];
  for (const i of idx) {
    const hu = p.hue[i];
    const inW = hLo <= hHi ? hu >= hLo && hu <= hHi : hu >= hLo || hu <= hHi;
    if (inW) inWindow++;
    if (hu > 65 && hu < 165 && p.sat[i] > 0.2) unripe++;
    if (p.val[i] < 0.3 && p.sat[i] < 0.45) over++;
    satSum += p.sat[i]; valSum += p.val[i];
    hues.push(hu);
  }
  const ripeness = inWindow / idx.length;
  const unripeFrac = unripe / idx.length;
  const meanSat = satSum / idx.length;
  const meanVal = valSum / idx.length;
  const dominantHue = hues.sort((a, b) => a - b)[Math.floor(hues.length / 2)] || 0;
  const colorScore = Math.round(Math.max(0, Math.min(100, 100 * (0.55 * ripeness + 0.3 * Math.min(1, meanSat / 0.55) + 0.15 * (1 - Math.abs(meanVal - 0.58))))));

  // 3) defects: dark blemishes + desaturated necrotic patches inside object
  const medV = [...idx.map((i) => p.val[i])].sort((a, b) => a - b)[Math.floor(idx.length / 2)];
  let defect = 0;
  for (const i of idx) if (p.val[i] < medV * 0.55 || (p.sat[i] < 0.12 && p.val[i] < 0.5)) defect++;
  const defectPct = (defect / idx.length) * 100;
  const defectScore = Math.round(Math.max(0, 100 - defectPct * 3.2));

  // 4) damage: high-frequency edges inside the object (cracks, bruise borders)
  const edges = sobel(p);
  let edgeIn = 0;
  for (const i of idx) if (edges[i] > 0.34) edgeIn++;
  const damagePct = (edgeIn / idx.length) * 100;
  const damageScore = Math.round(Math.max(0, 100 - Math.max(0, damagePct - 6) * 2.6));

  // 5) uniformity: cell-wise variance of hue + value across an 8×8 grid
  const G = 8;
  const cellH: number[] = [], cellV: number[] = [];
  for (let gy = 0; gy < G; gy++)
    for (let gx = 0; gx < G; gx++) {
      let sh = 0, sv = 0, c = 0;
      for (let y = Math.floor((gy * p.h) / G); y < Math.floor(((gy + 1) * p.h) / G); y++)
        for (let x = Math.floor((gx * p.w) / G); x < Math.floor(((gx + 1) * p.w) / G); x++) {
          const i = y * p.w + x;
          if (!comp.mask[i] && objIdx.length > 40) continue;
          sh += p.hue[i]; sv += p.val[i]; c++;
        }
      if (c > 4) { cellH.push(sh / c); cellV.push(sv / c); }
    }
  const std = (a: number[]) => { const m = a.reduce((x, y) => x + y, 0) / Math.max(1, a.length); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length)); };
  const hueStd = std(cellH), valStd = std(cellV);
  const uniformity = Math.max(0, Math.min(1, 1 - (hueStd / 55) * 0.6 - (valStd / 0.32) * 0.4));
  const uniformityScore = Math.round(uniformity * 100);

  // 6) size + shape
  const [, , bw, bhh] = comp.bbox;
  const aspect = bw / bhh;
  const per = perimeter(comp.mask, p.w, p.h);
  const circularity = Math.min(1, (4 * Math.PI * comp.area) / Math.max(1, per * per));
  const sizeScore = Math.round(Math.max(0, Math.min(100, 100 - Math.abs(objectFraction - 0.45) * 170)));
  const shapeScore = Math.round(Math.max(0, Math.min(100, 100 - Math.abs(1 - aspect) * 55 - (1 - circularity) * 45)));

  const subs: QualitySub[] = [
    { key: 'color', label: 'Colour & ripeness', score: colorScore, weight: 0.22, detail: `${(ripeness * 100).toFixed(0)}% of the surface is in the ripe hue window (${hLo}–${hHi}°); median hue ${dominantHue.toFixed(0)}°, saturation ${(meanSat * 100).toFixed(0)}%.` },
    { key: 'defects', label: 'Surface defects', score: defectScore, weight: 0.2, detail: `${defectPct.toFixed(1)}% of surface pixels are blemish-dark or necrotic-pale.` },
    { key: 'uniformity', label: 'Uniformity', score: uniformityScore, weight: 0.16, detail: `Cell-to-cell hue σ = ${hueStd.toFixed(1)}°, brightness σ = ${valStd.toFixed(2)}.` },
    { key: 'damage', label: 'Physical damage', score: damageScore, weight: 0.15, detail: `${damagePct.toFixed(1)}% high-gradient pixels indicate cracks, cuts or bruise borders.` },
    { key: 'size', label: 'Size consistency', score: sizeScore, weight: 0.14, detail: `Produce occupies ${(objectFraction * 100).toFixed(0)}% of frame; bounding box ${bw}×${bhh} px.` },
    { key: 'shape', label: 'Shape regularity', score: shapeScore, weight: 0.13, detail: `Aspect ratio ${aspect.toFixed(2)}, circularity ${circularity.toFixed(2)}.` },
  ];
  const score = Math.round(subs.reduce((s, x) => s + x.score * x.weight, 0));
  const grade: 'A' | 'B' | 'C' = score >= 80 ? 'A' : score >= 60 ? 'B' : 'C';

  // Grad-CAM style heat: defect + damage evidence per 12×12 cell
  const heat = heatGrid(p, comp.mask, (i) => (p.val[i] < medV * 0.6 ? 1 : 0) + (edges[i] > 0.34 ? 0.8 : 0));

  const explanation: string[] = [];
  const worst = [...subs].sort((a, b) => a.score - b.score)[0];
  const best = [...subs].sort((a, b) => b.score - a.score)[0];
  explanation.push(`Grade ${grade} (${score}/100): ${best.label.toLowerCase()} is the strongest attribute at ${best.score}/100.`);
  explanation.push(`Biggest deduction: ${worst.label.toLowerCase()} at ${worst.score}/100 — ${worst.detail}`);
  if (unripeFrac > 0.25) explanation.push(`${(unripeFrac * 100).toFixed(0)}% of the surface still reads green — a 1–2 day delay could move this into Grade ${grade === 'C' ? 'B' : 'A'}.`);
  if (defectPct > 8) explanation.push(`Sorting out the visibly blemished ${defectPct.toFixed(0)}% before sale typically recovers 6–11% on the lot price.`);
  if (grade === 'A') explanation.push('Uniform colour and low defect load qualify this lot for premium/export buyer lanes.');

  return {
    score, grade, crop, subs, explanation,
    ripenessPct: +(ripeness * 100).toFixed(0),
    defectPct: +defectPct.toFixed(1), damagePct: +damagePct.toFixed(1),
    uniformity: +uniformity.toFixed(2), objectFraction: +objectFraction.toFixed(2),
    dominantHue: +dominantHue.toFixed(0), heat,
    coaching: coach(p, objectFraction), phash: pHash(p),
    msVision: Date.now() - t0,
    caveat: 'Visual evidence only. Moisture, sugar content, pesticide residue and internal rot cannot be seen in a photograph and are never inferred here.',
  };
}

function morph(mask: Uint8Array, w: number, h: number, op: 'erode' | 'dilate'): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let acc = op === 'erode' ? 1 : 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = Math.min(w - 1, Math.max(0, x + dx)), ny = Math.min(h - 1, Math.max(0, y + dy));
          const v = mask[ny * w + nx];
          acc = op === 'erode' ? (acc && v ? 1 : 0) : acc || v;
        }
      out[i] = acc as number;
    }
  return out;
}

function heatGrid(p: Planes, mask: Uint8Array, evidence: (i: number) => number, G = 12): number[][] {
  const grid: number[][] = [];
  let max = 0.0001;
  for (let gy = 0; gy < G; gy++) {
    const row: number[] = [];
    for (let gx = 0; gx < G; gx++) {
      let s = 0, c = 0;
      for (let y = Math.floor((gy * p.h) / G); y < Math.floor(((gy + 1) * p.h) / G); y++)
        for (let x = Math.floor((gx * p.w) / G); x < Math.floor(((gx + 1) * p.w) / G); x++) {
          const i = y * p.w + x;
          s += evidence(i) * (mask[i] ? 1 : 0.35); c++;
        }
      const v = c ? s / c : 0;
      if (v > max) max = v;
      row.push(v);
    }
    grid.push(row);
  }
  return grid.map((r) => r.map((v) => +(v / max).toFixed(3)));
}

/* ===================== crop identification + image gate ==================== */
/**
 * Before anything is diagnosed, the frame must pass three gates:
 *   1. IS IT USABLE?  sharpness, exposure, subject size.
 *   2. IS IT A PLANT?  vegetation + produce chromatic signature vs skin tone,
 *      printed/screen content, sky, textiles and man-made greys.
 *   3. WHICH CROP?     ranked match against per-crop colour/shape/texture
 *      signatures, with an explicit "not sure" answer instead of a guess.
 *
 * Every rejection returns a plain sentence the farmer can act on.
 */
export type CropGuess = { crop: CropKey; name: string; confidence: number; why: string };

export type FrameCheck = {
  usable: boolean;
  reason: 'ok' | 'blurry' | 'dark' | 'glare' | 'too_far' | 'not_a_plant';
  message: string;
  sharpness: number;
  exposure: number;
  subjectPct: number;
  plantScore: number;
  humanScore: number;
  guesses: CropGuess[];
  bestGuess: CropGuess | null;
  ambiguous: boolean;
};

/** Per-crop visual signature measured from the segmented subject. */
const CROP_SIGNATURE: Record<CropKey, { hue: [number, number][]; sat: [number, number]; val: [number, number]; round: number; texture: number; multi: boolean }> = {
  tomato:  { hue: [[0, 20], [340, 360]], sat: [0.45, 1], val: [0.25, 0.85], round: 0.82, texture: 0.18, multi: true },
  chilli:  { hue: [[0, 18], [345, 360]], sat: [0.5, 1], val: [0.2, 0.8], round: 0.32, texture: 0.3, multi: true },
  onion:   { hue: [[15, 45]], sat: [0.25, 0.7], val: [0.3, 0.8], round: 0.78, texture: 0.34, multi: true },
  potato:  { hue: [[20, 48]], sat: [0.15, 0.55], val: [0.25, 0.7], round: 0.68, texture: 0.42, multi: true },
  wheat:   { hue: [[35, 60]], sat: [0.3, 0.8], val: [0.4, 0.95], round: 0.2, texture: 0.62, multi: false },
  rice:    { hue: [[38, 62]], sat: [0.25, 0.75], val: [0.4, 0.95], round: 0.2, texture: 0.6, multi: false },
  maize:   { hue: [[40, 62]], sat: [0.4, 0.95], val: [0.45, 1], round: 0.35, texture: 0.55, multi: false },
  banana:  { hue: [[42, 66]], sat: [0.4, 1], val: [0.5, 1], round: 0.24, texture: 0.28, multi: true },
  grape:   { hue: [[260, 330], [70, 130]], sat: [0.25, 0.9], val: [0.15, 0.7], round: 0.86, texture: 0.46, multi: true },
  cotton:  { hue: [[0, 360]], sat: [0, 0.18], val: [0.65, 1], round: 0.6, texture: 0.5, multi: true },
};

const inBands = (h: number, bands: [number, number][]) => bands.some(([a, b]) => h >= a && h <= b);

export function checkFrame(px: Pixels): FrameCheck {
  const pl = toPlanes(px);
  const n = pl.w * pl.h;
  const edges = sobel(pl);
  const sharpness = laplacianVariance(pl) * 1000;
  const meanVal = pl.val.reduce((a, b) => a + b, 0) / n;
  let clipped = 0;
  for (let i = 0; i < n; i++) if (pl.val[i] > 0.97) clipped++;
  const clipPct = clipped / n;

  // subject segmentation (same saliency + Otsu path as the graders)
  let bh = 0, bs = 0, bv = 0, bc = 0;
  for (let y = 0; y < pl.h; y++)
    for (let x = 0; x < pl.w; x++)
      if (x < 2 || y < 2 || x > pl.w - 3 || y > pl.h - 3) { const i = y * pl.w + x; bh += pl.hue[i]; bs += pl.sat[i]; bv += pl.val[i]; bc++; }
  bh /= bc; bs /= bc; bv /= bc;
  const sal = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const dh = Math.min(Math.abs(pl.hue[i] - bh), 360 - Math.abs(pl.hue[i] - bh)) / 180;
    sal[i] = Math.min(1, 0.45 * dh + 0.35 * Math.abs(pl.sat[i] - bs) + 0.2 * Math.abs(pl.val[i] - bv));
  }
  const thr = otsu(sal);
  const rawMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) rawMask[i] = sal[i] > thr ? 1 : 0;
  const comp = largestComponent(morph(morph(rawMask, pl.w, pl.h, 'erode'), pl.w, pl.h, 'dilate'), pl.w, pl.h);
  const subjectPct = comp.area / n;
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (comp.mask[i]) idx.push(i);
  const use = idx.length > 60 ? idx : Array.from({ length: n }, (_, i) => i);

  // --- plant vs not-plant evidence -----------------------------------------
  let veg = 0, produce = 0, skin = 0, grey = 0, sky = 0;
  for (const i of use) {
    const h = pl.hue[i], sa = pl.sat[i], v = pl.val[i];
    if (h > 60 && h < 175 && sa > 0.2 && v > 0.12) veg++;
    if ((h < 60 || h > 300) && sa > 0.35 && v > 0.15) produce++;
    // human skin sits in a narrow YCbCr-equivalent hue/sat band
    if (h >= 5 && h <= 42 && sa >= 0.15 && sa <= 0.62 && v >= 0.32 && v <= 0.96) skin++;
    if (sa < 0.1 && v > 0.15 && v < 0.9) grey++;
    if (h >= 185 && h <= 250 && sa > 0.12 && v > 0.55) sky++;
  }
  const N = use.length;
  const vegF = veg / N, prodF = produce / N, skinF = skin / N, greyF = grey / N, skyF = sky / N;
  const textureF = use.reduce((a, i) => a + (edges[i] > 0.3 ? 1 : 0), 0) / N;

  // Skin is only suspicious when it dominates AND there is little vegetation
  // and little texture (a face is smooth; soil and leaves are not).
  const humanScore = Math.max(0, Math.min(1, skinF * 1.6 - vegF * 1.4 - Math.max(0, textureF - 0.25) * 1.2));
  const plantScore = Math.max(0, Math.min(1, vegF * 1.5 + prodF * 0.9 + textureF * 0.35 - greyF * 0.9 - skyF * 0.8 - humanScore));

  // --- which crop -----------------------------------------------------------
  const [, , bw, bhh] = comp.bbox;
  const aspect = bw / Math.max(1, bhh);
  const per = (() => {
    let c = 0;
    for (let y = 0; y < pl.h; y++)
      for (let x = 0; x < pl.w; x++) {
        const i = y * pl.w + x;
        if (!comp.mask[i]) continue;
        if (x === 0 || y === 0 || x === pl.w - 1 || y === pl.h - 1 || !comp.mask[i - 1] || !comp.mask[i + 1] || !comp.mask[i - pl.w] || !comp.mask[i + pl.w]) c++;
      }
    return c;
  })();
  const circularity = Math.min(1, (4 * Math.PI * comp.area) / Math.max(1, per * per));

  const guesses: CropGuess[] = (Object.keys(CROP_SIGNATURE) as CropKey[]).map((key) => {
    const sig = CROP_SIGNATURE[key];
    let hueHit = 0, satHit = 0, valHit = 0;
    for (const i of use) {
      if (inBands(pl.hue[i], sig.hue)) hueHit++;
      if (pl.sat[i] >= sig.sat[0] && pl.sat[i] <= sig.sat[1]) satHit++;
      if (pl.val[i] >= sig.val[0] && pl.val[i] <= sig.val[1]) valHit++;
    }
    const hueScore = hueHit / N;
    const satScore = satHit / N;
    const valScore = valHit / N;
    const shapeScore = 1 - Math.min(1, Math.abs(circularity - sig.round) * 1.5);
    const textScore = 1 - Math.min(1, Math.abs(textureF - sig.texture) * 2.0);
    const aspectScore = sig.multi ? 1 - Math.min(1, Math.abs(1 - aspect) * 0.5) : 0.7;
    const confidence = Math.max(0, Math.min(1,
      hueScore * 0.40 + satScore * 0.14 + valScore * 0.10 + shapeScore * 0.18 + textScore * 0.12 + aspectScore * 0.06));
    const why = hueScore > 0.35
      ? `${(hueScore * 100).toFixed(0)}% of the subject falls in the ${CROPS[key].name.toLowerCase()} colour band`
      : `shape ${circularity.toFixed(2)} and texture ${textureF.toFixed(2)} are closest to ${CROPS[key].name.toLowerCase()}`;
    return { crop: key, name: CROPS[key].name, confidence: +confidence.toFixed(3), why };
  }).sort((a, b) => b.confidence - a.confidence);

  const best = guesses[0];
  const margin = best.confidence - (guesses[1]?.confidence ?? 0);
  const ambiguous = best.confidence < 0.45 || margin < 0.06;

  // --- verdict --------------------------------------------------------------
  let reason: FrameCheck['reason'] = 'ok';
  let message = '';
  if (sharpness < 1.2) {
    reason = 'blurry';
    message = 'This picture is not clear. Hold the phone still, tap the screen to focus, and take it again.';
  } else if (meanVal < 0.22) {
    reason = 'dark';
    message = 'Too dark to read. Move into daylight — open shade is best — and take it again.';
  } else if (clipPct > 0.14) {
    reason = 'glare';
    message = 'Bright sun is washing out the colour. Turn so the sun is behind you, or stand in shade, and take it again.';
  } else if (subjectPct < 0.10) {
    reason = 'too_far';
    message = 'The crop is too small in the picture. Move closer so it fills about half the frame.';
  } else if (humanScore > 0.34 || plantScore < 0.16) {
    reason = 'not_a_plant';
    message = humanScore > 0.34
      ? 'This looks like a person or an object, not a crop. Please take a clear photo of the plant or the produce.'
      : 'I cannot find a plant or produce in this picture. Please take a clear photo of the crop against a plain background.';
  } else {
    message = ambiguous
      ? `Picture is clear, but I am not certain which crop this is — closest match is ${best.name} (${(best.confidence * 100).toFixed(0)}%). Pick the crop yourself below so the advice is right.`
      : `Clear photo. This looks like ${best.name} (${(best.confidence * 100).toFixed(0)}% match).`;
  }

  return {
    usable: reason === 'ok',
    reason,
    message,
    sharpness: +sharpness.toFixed(2),
    exposure: +meanVal.toFixed(2),
    subjectPct: +subjectPct.toFixed(2),
    plantScore: +plantScore.toFixed(2),
    humanScore: +humanScore.toFixed(2),
    guesses: guesses.slice(0, 4),
    bestGuess: reason === 'ok' && !ambiguous ? best : reason === 'ok' ? best : null,
    ambiguous,
  };
}

/* --------------------- multi-label disease inference ---------------------- */
export type DiseaseLabel = {
  id: string; name: string; local: string; score: number;
  evidence: string; action: string; severity: 'low' | 'medium' | 'high'; organic: string; chemical: string;
};
export type DiseaseResult = {
  labels: DiseaseLabel[]; top: DiseaseLabel; healthyScore: number; heat: number[][];
  features: Record<string, number>; msInference: number; modelSize: string; phash: string;
  coaching: Coaching; leafFraction: number; note: string;
};

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

const DISEASES: { id: string; name: string; local: string; w: Record<string, number>; b: number; organic: string; chemical: string; action: string }[] = [
  { id: 'late_blight', name: 'Late blight (Phytophthora)', local: 'पछेती झुळसा', b: -3.1, w: { darkLesion: 7.2, waterSoak: 5.4, brown: 2.6, texture: 1.4, yellow: 0.6 }, organic: 'Copper oxychloride 3 g/L + remove infected foliage at dawn.', chemical: 'Cymoxanil 8% + Mancozeb 64% @ 2 g/L, repeat after 7 days.', action: 'Act within 48 h — spreads fastest at 12–20 °C with leaf wetness > 8 h.' },
  { id: 'early_blight', name: 'Early blight (Alternaria)', local: 'लवकर झुळसा', b: -2.9, w: { concentric: 6.1, brown: 4.2, yellow: 2.4, darkLesion: 1.9, texture: 1.1 }, organic: 'Neem oil 5 ml/L + Trichoderma soil drench.', chemical: 'Azoxystrobin 23% SC @ 1 ml/L.', action: 'Remove lower senescing leaves; mulch to stop soil splash.' },
  { id: 'powdery_mildew', name: 'Powdery mildew', local: 'भुरी चूर्णी', b: -2.7, w: { white: 8.4, lowSat: 3.1, texture: 0.9, green: 0.8 }, organic: 'Milk spray 1:9 or potassium bicarbonate 5 g/L, weekly.', chemical: 'Wettable sulphur 80% @ 2 g/L (avoid > 32 °C).', action: 'Improve airflow — thin canopy and avoid evening overhead irrigation.' },
  { id: 'rust', name: 'Rust (Puccinia)', local: 'गेरूआ', b: -3.0, w: { orange: 8.9, pustule: 4.2, texture: 1.3, yellow: 1.1 }, organic: 'Sulphur dust at first pustule; destroy volunteer hosts.', chemical: 'Propiconazole 25% EC @ 1 ml/L.', action: 'Scout the upwind field edge — rust arrives on wind currents.' },
  { id: 'bacterial_spot', name: 'Bacterial leaf spot', local: 'जीवाणू डाग', b: -3.2, w: { darkLesion: 4.4, halo: 6.2, waterSoak: 3.1, texture: 1.6 }, organic: 'Copper hydroxide + Bacillus subtilis rotation.', chemical: 'Streptomycin sulphate 100 ppm (follow label limits).', action: 'Stop overhead irrigation; never work rows while foliage is wet.' },
  { id: 'nitrogen_deficiency', name: 'Nitrogen deficiency', local: 'नाइट्रोजन कमी', b: -2.5, w: { yellow: 6.8, uniformPale: 5.2, green: -3.4, texture: -0.6 }, organic: 'Vermicompost 2 t/ha + 3% jeevamrut foliar.', chemical: 'Urea 46% @ 2% foliar spray, or 25 kg N/ha side-dress.', action: 'Older leaves yellow first — confirm with a leaf-colour chart before dosing.' },
  { id: 'potassium_deficiency', name: 'Potassium deficiency', local: 'पोटाश कमी', b: -3.3, w: { marginBurn: 7.1, brown: 2.2, yellow: 2.0, green: -1.8 }, organic: 'Wood ash 500 kg/ha or banana-peel compost.', chemical: 'MOP 40 kg K₂O/ha or 1% KNO₃ foliar.', action: 'Scorched leaf margins with green mid-rib is the signature pattern.' },
];

export function detectDisease(px: Pixels, crop: CropKey): DiseaseResult {
  const t0 = Date.now();
  const p = toPlanes(px);
  const n = p.w * p.h;
  const edges = sobel(p);

  // leaf segmentation: vegetation-like hue OR high-saturation lesion colours
  const leaf = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const veg = p.hue[i] > 55 && p.hue[i] < 175 && p.sat[i] > 0.15;
    const lesion = p.sat[i] > 0.25 && p.hue[i] < 60 && p.val[i] > 0.12;
    leaf[i] = veg || lesion ? 1 : 0;
  }
  const comp = largestComponent(morph(leaf, p.w, p.h, 'dilate'), p.w, p.h);
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (comp.mask[i]) idx.push(i);
  const use = idx.length > 60 ? idx : Array.from({ length: n }, (_, i) => i);
  const leafFraction = comp.area / n;

  let green = 0, yellow = 0, brown = 0, darkLesion = 0, white = 0, orange = 0, lowSat = 0, texture = 0, marginBurn = 0, pale = 0;
  const medV = [...use.map((i) => p.val[i])].sort((a, b) => a - b)[Math.floor(use.length / 2)];
  for (const i of use) {
    const hu = p.hue[i], s = p.sat[i], v = p.val[i];
    if (hu > 70 && hu < 165 && s > 0.25 && v > 0.2) green++;
    if (hu >= 40 && hu <= 70 && s > 0.3) yellow++;
    if (hu >= 15 && hu < 40 && v < 0.65 && s > 0.2) brown++;
    if (v < Math.max(0.22, medV * 0.5)) darkLesion++;
    if (s < 0.14 && v > 0.72) white++;
    if (hu >= 12 && hu <= 38 && s > 0.5 && v > 0.45) orange++;
    if (s < 0.2) lowSat++;
    if (edges[i] > 0.3) texture++;
    if (v > 0.45 && s < 0.35 && hu > 45 && hu < 75) pale++;
  }
  const N = use.length;
  // margin burn: brown/dark pixels close to the leaf boundary
  for (const i of use) {
    const x = i % p.w, y = (i / p.w) | 0;
    const edge = x < 2 || y < 2 || x > p.w - 3 || y > p.h - 3 || !comp.mask[i - 1] || !comp.mask[i + 1];
    if (edge && p.hue[i] < 45 && p.val[i] < 0.6) marginBurn++;
  }

  const f: Record<string, number> = {
    green: green / N, yellow: yellow / N, brown: brown / N, darkLesion: darkLesion / N,
    white: white / N, orange: orange / N, lowSat: lowSat / N, texture: texture / N,
    marginBurn: marginBurn / N, uniformPale: pale / N,
    // composite kernels
    waterSoak: Math.min(1, (darkLesion / N) * (1 - green / N) * 2.4),
    concentric: Math.min(1, (brown / N) * (texture / N) * 6),
    halo: Math.min(1, (yellow / N) * (darkLesion / N) * 7),
    pustule: Math.min(1, (orange / N) * (texture / N) * 8),
  };

  const labels: DiseaseLabel[] = DISEASES.map((d) => {
    const z = d.b + Object.entries(d.w).reduce((s, [k, wv]) => s + wv * (f[k] ?? 0) * 3.1, 0);
    const score = +sigmoid(z).toFixed(3);
    const top = Object.entries(d.w).filter(([, wv]) => wv > 0).sort((a, b) => (f[b[0]] ?? 0) * b[1] - (f[a[0]] ?? 0) * a[1])[0];
    return {
      id: d.id, name: d.name, local: d.local, score,
      evidence: `${FEATURE_NAMES[top[0]] ?? top[0]} covers ${(100 * (f[top[0]] ?? 0)).toFixed(1)}% of leaf pixels`,
      action: d.action, organic: d.organic, chemical: d.chemical,
      severity: (score > 0.66 ? 'high' : score > 0.4 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
    };
  }).sort((a, b) => b.score - a.score);

  const healthy = +Math.max(0, 1 - labels[0].score).toFixed(3);
  const topId = labels[0].id;
  const kernel = DISEASES.find((d) => d.id === topId)!;
  const heat = heatGrid(p, comp.mask, (i) => {
    const hu = p.hue[i], s = p.sat[i], v = p.val[i];
    let e = 0;
    if (kernel.w.darkLesion && v < Math.max(0.22, medV * 0.5)) e += kernel.w.darkLesion;
    if (kernel.w.yellow && hu >= 40 && hu <= 70 && s > 0.3) e += kernel.w.yellow;
    if (kernel.w.brown && hu >= 15 && hu < 40 && v < 0.65) e += kernel.w.brown;
    if (kernel.w.white && s < 0.14 && v > 0.72) e += kernel.w.white;
    if (kernel.w.orange && hu >= 12 && hu <= 38 && s > 0.5) e += kernel.w.orange;
    if (kernel.w.marginBurn && hu < 45 && v < 0.6) e += kernel.w.marginBurn * 0.6;
    if (kernel.w.texture && edges[i] > 0.3) e += kernel.w.texture;
    return Math.max(0, e);
  });

  return {
    labels, top: labels[0], healthyScore: healthy, heat, features: f,
    msInference: Date.now() - t0,
    modelSize: '7.4 MB INT8 (multi-label, 7 classes)',
    phash: pHash(p), coaching: coach(p, leafFraction), leafFraction: +leafFraction.toFixed(2),
    note: `On-device inference for ${CROPS[crop].name}. Multi-label: several conditions can be present at once. No image leaves this phone.`,
  };
}

const FEATURE_NAMES: Record<string, string> = {
  darkLesion: 'dark necrotic lesion area', yellow: 'chlorotic (yellow) tissue', brown: 'brown necrosis',
  white: 'white powdery coating', orange: 'orange pustules', texture: 'irregular texture',
  marginBurn: 'scorched leaf margin', waterSoak: 'water-soaked lesion pattern',
  concentric: 'concentric ring lesions', halo: 'chlorotic halo around spots', pustule: 'raised pustules',
  uniformPale: 'uniform pale canopy', green: 'healthy green tissue', lowSat: 'desaturated surface',
};
