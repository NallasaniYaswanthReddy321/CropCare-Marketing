/**
 * Derived state: shared computations used by Home, Irrigation, Twin and Advisor
 * so every screen shows exactly the same numbers from the same models.
 */
import { CROPS, IrrigationResult, WeatherDay, irrigationAdvice, phenology, SOILS } from './agro';
import { climatology, riskWindow } from './weather';
import type { Field, State } from './store';

export const EFFICIENCY = { drip: 0.9, sprinkler: 0.75, furrow: 0.6 } as const;

export function daysAfterSowing(f: Field) {
  return Math.max(0, Math.round((Date.now() - Date.parse(f.sowDate)) / 86400000));
}

export function fieldWeather(f: Field, days = 10): WeatherDay[] {
  const startDoy = Math.floor((Date.now() - +new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return climatology(`${f.id}:${new Date().toDateString()}`, days, startDoy, f.lat);
}

export function fieldIrrigation(f: Field, weather?: WeatherDay[]): IrrigationResult {
  const w = weather ?? fieldWeather(f);
  return irrigationAdvice({
    crop: CROPS[f.crop],
    soil: f.soil,
    das: daysAfterSowing(f),
    weather: w,
    elevationM: 560,
    latitude: f.lat,
    currentDepletionMm: f.depletionMm,
    efficiency: EFFICIENCY[f.irrigationType],
    systemLph: f.irrigationType === 'drip' ? 12000 : 26000,
    areaHa: f.areaHa,
  });
}

export function fieldPhenology(f: Field) {
  const das = daysAfterSowing(f);
  const hist = climatology(`${f.id}:hist`, Math.max(1, das), 1, f.lat);
  return phenology(CROPS[f.crop], hist.map((d) => ({ tMin: d.tMin, tMax: d.tMax })));
}

export function activeField(s: State): Field {
  return s.fields.find((f) => f.id === s.activeFieldId) ?? s.fields[0];
}

export function fieldSummary(f: Field) {
  const w = fieldWeather(f);
  const irr = fieldIrrigation(f, w);
  const ph = fieldPhenology(f);
  const risk = riskWindow(w);
  const soil = SOILS[f.soil];
  return { weather: w, irr, ph, risk, soil, das: daysAfterSowing(f), crop: CROPS[f.crop] };
}

export function greeting() {
  const h = new Date().getHours();
  // Farmers are up before dawn; anything from 04:00 counts as morning, and the
  // small hours are greeted as evening rather than a wrong "good morning".
  if (h >= 4 && h < 12) return 'goodMorning';
  if (h >= 12 && h < 17) return 'goodAfternoon';
  return 'goodEvening';
}

export const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
export const ago = (ts: number) => {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};
