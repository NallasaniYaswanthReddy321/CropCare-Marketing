/**
 * Village weather mesh — Kalman-filtered fusion of neighbouring phone/sensor
 * reports into one village estimate, plus an offline climatology prior so the
 * app still forecasts with zero connectivity.
 */
import { seededRandom } from './crypto';
import type { WeatherDay } from './agro';

export type Observation = { node: string; value: number; sigma: number; at: number; distanceKm: number };

/** Scalar Kalman filter with distance-inflated measurement noise. */
export function kalmanFuse(prior: { x: number; p: number }, obs: Observation[], processNoise = 0.35) {
  let x = prior.x, p = prior.p + processNoise;
  const steps: { node: string; gain: number; before: number; after: number; r: number }[] = [];
  for (const o of obs.sort((a, b) => a.at - b.at)) {
    const r = o.sigma ** 2 * (1 + o.distanceKm / 6); // trust nearby nodes more
    const k = p / (p + r);
    const before = x;
    x = x + k * (o.value - x);
    p = (1 - k) * p;
    steps.push({ node: o.node, gain: +k.toFixed(3), before: +before.toFixed(2), after: +x.toFixed(2), r: +r.toFixed(2) });
  }
  return { x: +x.toFixed(2), p: +p.toFixed(3), steps, confidence: +Math.max(0, Math.min(100, 100 * (1 - p / 6))).toFixed(0) };
}

/** Deterministic monsoon-shaped climatology used as the offline prior. */
export function climatology(seed: string, days: number, startDoy: number, latitude = 18.5): WeatherDay[] {
  const rnd = seededRandom(seed);
  const out: WeatherDay[] = [];
  for (let i = 0; i < days; i++) {
    const doy = ((startDoy + i - 1) % 365) + 1;
    const seasonal = Math.sin((2 * Math.PI * (doy - 100)) / 365);
    const monsoon = Math.exp(-Math.pow(doy - 200, 2) / 3000);
    const tMax = 30 + 6 * seasonal - 4 * monsoon + (rnd() - 0.5) * 3;
    const tMin = tMax - (9 + 3 * (1 - monsoon)) + (rnd() - 0.5) * 2;
    const rhMean = 45 + 40 * monsoon + (rnd() - 0.5) * 10;
    const rainMm = monsoon > 0.25 && rnd() < 0.45 ? +(rnd() * 38 * monsoon).toFixed(1) : rnd() < 0.05 ? +(rnd() * 6).toFixed(1) : 0;
    const radMJ = 24 - 8 * monsoon - (rainMm > 5 ? 4 : 0) + (rnd() - 0.5) * 2;
    const windMs = 1.3 + rnd() * 2.4 + monsoon * 1.2;
    const date = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
    out.push({
      date, tMax: +tMax.toFixed(1), tMin: +tMin.toFixed(1), rhMean: +Math.max(20, Math.min(98, rhMean)).toFixed(0),
      windMs: +windMs.toFixed(1), radMJ: +Math.max(4, radMJ).toFixed(1), rainMm,
    });
  }
  return out;
}

export type FrostRisk = { day: string; risk: number; note: string };
export function riskWindow(days: WeatherDay[]) {
  const frost: FrostRisk[] = [];
  const heat: FrostRisk[] = [];
  const disease: FrostRisk[] = [];
  days.forEach((d) => {
    if (d.tMin < 6) frost.push({ day: d.date, risk: +Math.min(1, (6 - d.tMin) / 6).toFixed(2), note: `T-min ${d.tMin} °C — cover nursery beds, run sprinklers pre-dawn.` });
    if (d.tMax > 38) heat.push({ day: d.date, risk: +Math.min(1, (d.tMax - 38) / 8).toFixed(2), note: `T-max ${d.tMax} °C — irrigate at night, avoid midday spraying.` });
    const wet = Math.max(0, (d.rhMean - 70) / 30);
    const tempOk = Math.exp(-Math.pow(d.tMax - 24, 2) / 60);
    const r = wet * tempOk;
    if (r > 0.25) disease.push({ day: d.date, risk: +r.toFixed(2), note: `RH ${d.rhMean}% at ${d.tMax} °C — high infection pressure window.` });
  });
  return { frost, heat, disease };
}
