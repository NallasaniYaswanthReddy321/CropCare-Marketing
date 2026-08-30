/**
 * Deterministic synthetic sample captures for the web demo.
 * Everything is drawn with the Canvas 2D API (origin-clean, no network), so the
 * REAL vision pipeline runs on real pixels when a device camera is unavailable.
 */
import { Platform } from 'react-native';
import { seededRandom } from './crypto';

export type DemoKind = 'tomato_a' | 'tomato_c' | 'leaf_blight' | 'leaf_mildew' | 'leaf_healthy' | 'onion_b';

export const DEMOS: { kind: DemoKind; label: string; use: 'quality' | 'disease'; crop: any; icon: string }[] = [
  { kind: 'tomato_a', label: 'Premium tomato lot', use: 'quality', crop: 'tomato', icon: 'nutrition' },
  { kind: 'tomato_c', label: 'Blemished tomato lot', use: 'quality', crop: 'tomato', icon: 'alert-circle' },
  { kind: 'onion_b', label: 'Onion lot', use: 'quality', crop: 'onion', icon: 'ellipse' },
  { kind: 'leaf_blight', label: 'Leaf with lesions', use: 'disease', crop: 'tomato', icon: 'bug' },
  { kind: 'leaf_mildew', label: 'Leaf with white coating', use: 'disease', crop: 'grape', icon: 'snow' },
  { kind: 'leaf_healthy', label: 'Healthy leaf', use: 'disease', crop: 'tomato', icon: 'leaf' },
];

export const canDemo = () => Platform.OS === 'web' && typeof (globalThis as any).document !== 'undefined';

export function makeDemoImage(kind: DemoKind, size = 420): string | null {
  if (!canDemo()) return null;
  const doc = (globalThis as any).document;
  const canvas = doc.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  const rnd = seededRandom(kind);

  // hessian-cloth background
  const bg = c.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#b8a689');
  bg.addColorStop(1, '#8d7c60');
  c.fillStyle = bg;
  c.fillRect(0, 0, size, size);
  for (let i = 0; i < 3200; i++) {
    c.fillStyle = `rgba(${90 + rnd() * 60},${80 + rnd() * 50},${60 + rnd() * 40},0.18)`;
    c.fillRect(rnd() * size, rnd() * size, 2 + rnd() * 3, 1.4);
  }

  const blob = (cx: number, cy: number, r: number, hue: number, sat: number, light: number, wobble = 0.1) => {
    c.beginPath();
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const rr = r * (1 + Math.sin(a * 3 + hue) * wobble * 0.5 + (rnd() - 0.5) * wobble);
      const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a) * 0.94;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath();
    const g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    g.addColorStop(0, `hsl(${hue},${sat}%,${Math.min(88, light + 22)}%)`);
    g.addColorStop(0.65, `hsl(${hue},${sat}%,${light}%)`);
    g.addColorStop(1, `hsl(${hue},${sat - 8}%,${Math.max(12, light - 18)}%)`);
    c.fillStyle = g;
    c.fill();
  };

  const speck = (cx: number, cy: number, r: number, style: string) => {
    c.beginPath();
    c.ellipse(cx, cy, r, r * (0.6 + rnd() * 0.8), rnd() * 3, 0, Math.PI * 2);
    c.fillStyle = style;
    c.fill();
  };

  if (kind === 'tomato_a' || kind === 'tomato_c' || kind === 'onion_b') {
    const bad = kind === 'tomato_c';
    const onion = kind === 'onion_b';
    const positions = [
      [0.3, 0.32, 0.17], [0.68, 0.28, 0.155], [0.5, 0.55, 0.185],
      [0.24, 0.7, 0.15], [0.75, 0.68, 0.16],
    ];
    positions.forEach(([fx, fy, fr], i) => {
      const cx = fx * size, cy = fy * size, r = fr * size * (bad ? 0.82 + rnd() * 0.5 : 0.98 + rnd() * 0.08);
      const hue = onion ? 32 + rnd() * 8 : bad ? (i % 3 === 0 ? 68 + rnd() * 20 : 6 + rnd() * 12) : 5 + rnd() * 6;
      const sat = onion ? 46 : bad ? 52 : 78;
      const light = onion ? 44 : bad ? 34 : 46;
      blob(cx, cy, r, hue, sat, light, bad ? 0.22 : 0.07);
      // specular highlight
      c.beginPath();
      c.ellipse(cx - r * 0.32, cy - r * 0.38, r * 0.19, r * 0.11, -0.6, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.fill();
      if (!onion) {
        c.fillStyle = 'hsl(105,45%,28%)';
        for (let k = 0; k < 5; k++) {
          c.beginPath();
          const a = (k / 5) * Math.PI * 2;
          c.ellipse(cx + Math.cos(a) * r * 0.28, cy - r * 0.72 + Math.sin(a) * r * 0.1, r * 0.22, r * 0.09, a, 0, Math.PI * 2);
          c.fill();
        }
      }
      if (bad) {
        for (let k = 0; k < 9 + rnd() * 8; k++) {
          const a = rnd() * Math.PI * 2, d = rnd() * r * 0.82;
          speck(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.05 + rnd() * 0.11), `rgba(${30 + rnd() * 30},${18 + rnd() * 14},${10},0.82)`);
        }
        c.strokeStyle = 'rgba(40,20,10,0.7)';
        c.lineWidth = 2.4;
        c.beginPath();
        c.moveTo(cx - r * 0.5, cy - r * 0.1);
        c.quadraticCurveTo(cx, cy + r * 0.2, cx + r * 0.55, cy - r * 0.25);
        c.stroke();
      } else if (onion) {
        c.strokeStyle = 'rgba(120,80,40,0.35)';
        c.lineWidth = 1.4;
        for (let k = 0; k < 7; k++) {
          c.beginPath();
          c.moveTo(cx, cy - r);
          c.quadraticCurveTo(cx + (rnd() - 0.5) * r * 1.6, cy, cx + (rnd() - 0.5) * r * 0.6, cy + r);
          c.stroke();
        }
      }
    });
  } else {
    // single leaf
    const cx = size / 2, cy = size / 2, r = size * 0.36;
    c.save();
    c.translate(cx, cy);
    c.rotate(-0.25);
    c.beginPath();
    c.moveTo(0, -r * 1.15);
    c.bezierCurveTo(r * 1.05, -r * 0.5, r * 0.85, r * 0.75, 0, r * 1.15);
    c.bezierCurveTo(-r * 0.85, r * 0.75, -r * 1.05, -r * 0.5, 0, -r * 1.15);
    c.closePath();
    const lg = c.createLinearGradient(-r, -r, r, r);
    lg.addColorStop(0, 'hsl(105,52%,34%)');
    lg.addColorStop(0.5, 'hsl(112,58%,29%)');
    lg.addColorStop(1, 'hsl(98,45%,22%)');
    c.fillStyle = lg;
    c.fill();
    c.clip();
    // veins
    c.strokeStyle = 'rgba(200,235,170,0.5)';
    c.lineWidth = 2.6;
    c.beginPath(); c.moveTo(0, -r * 1.1); c.lineTo(0, r * 1.1); c.stroke();
    c.lineWidth = 1.4;
    for (let i = -5; i <= 5; i++) {
      c.beginPath();
      c.moveTo(0, i * r * 0.18);
      c.quadraticCurveTo(r * 0.4 * Math.sign(i || 1), i * r * 0.18 + r * 0.12, r * 0.85 * (i % 2 ? 1 : -1), i * r * 0.18 + r * 0.3);
      c.stroke();
    }
    if (kind === 'leaf_blight') {
      for (let k = 0; k < 13; k++) {
        const a = rnd() * Math.PI * 2, d = rnd() * r * 0.85;
        const x = Math.cos(a) * d, y = Math.sin(a) * d, rr = r * (0.07 + rnd() * 0.15);
        c.beginPath(); c.ellipse(x, y, rr * 1.5, rr * 1.2, rnd() * 3, 0, Math.PI * 2);
        c.fillStyle = 'rgba(215,190,60,0.55)'; c.fill();
        c.beginPath(); c.ellipse(x, y, rr, rr * 0.85, rnd() * 3, 0, Math.PI * 2);
        c.fillStyle = `rgba(${45 + rnd() * 30},${28 + rnd() * 18},${12},0.93)`; c.fill();
        c.beginPath(); c.ellipse(x, y, rr * 0.5, rr * 0.42, 0, 0, Math.PI * 2);
        c.fillStyle = 'rgba(20,12,6,0.95)'; c.fill();
      }
    } else if (kind === 'leaf_mildew') {
      for (let k = 0; k < 26; k++) {
        const a = rnd() * Math.PI * 2, d = rnd() * r * 0.95;
        c.beginPath();
        c.ellipse(Math.cos(a) * d, Math.sin(a) * d, r * (0.06 + rnd() * 0.13), r * (0.05 + rnd() * 0.1), rnd() * 3, 0, Math.PI * 2);
        c.fillStyle = `rgba(248,248,244,${0.5 + rnd() * 0.42})`;
        c.fill();
      }
    }
    c.restore();
  }

  // sensor noise for realistic texture statistics
  const img = c.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 13;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  c.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}
