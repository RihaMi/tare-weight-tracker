import type { Entry } from '../data/schema';
import { trendSeries } from './insights';

// Body composition from a smart scale. Bioimpedance readings jump around from
// day to day (hydration, the time of day, a meal), so trends are smoothed
// like weight, and single readings aren't shown on their own.

export interface CompositionSeries {
  first: { date: string; value: number };
  latest: number;               // smoothed
  change: number;               // smoothed latest − first reading
  values: number[];             // raw readings, oldest first (for a sparkline)
}

function series(entries: Entry[], pick: (e: Entry) => number | undefined): CompositionSeries | null {
  const pts = entries.flatMap(e => { const v = pick(e); return v == null ? [] : [{ date: e.date, kg: v }]; });
  if (!pts.length) return null;
  const tr = trendSeries(pts);
  const latest = tr[tr.length - 1].kg;
  return { first: { date: pts[0].date, value: pts[0].kg }, latest, change: latest - pts[0].kg, values: pts.map(p => p.kg) };
}

export interface CompositionSummary {
  fat: CompositionSeries | null;      // %
  muscle: CompositionSeries | null;   // kg
  water: CompositionSeries | null;    // %
  /** Since the first body fat reading: how much of the weight change was fat, and how much lean mass. */
  split: { since: string; weightChange: number; fatChange: number; leanChange: number } | null;
}

export function compositionSummary(entries: Entry[]): CompositionSummary {
  const fat = series(entries, e => e.composition?.fatPct);
  const muscle = series(entries, e => e.composition?.muscleKg);
  const water = series(entries, e => e.composition?.waterPct);
  let split: CompositionSummary['split'] = null;
  const withFat = entries.filter(e => e.composition?.fatPct != null);
  if (withFat.length >= 2) {
    // Fat and lean mass from the smoothed weight and smoothed body fat, so one odd reading doesn't swing it.
    const w = trendSeries(withFat), f = trendSeries(withFat.map(e => ({ date: e.date, kg: e.composition!.fatPct! })));
    const fatMass = (i: number) => (w[i].kg * f[i].kg) / 100;
    const a = 0, b = withFat.length - 1;
    const fatChange = fatMass(b) - fatMass(a);
    const weightChange = w[b].kg - w[a].kg;
    split = { since: withFat[0].date, weightChange, fatChange, leanChange: weightChange - fatChange };
  }
  return { fat, muscle, water, split };
}
