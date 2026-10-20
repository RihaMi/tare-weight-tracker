import type { Entry, Unit } from '../data/schema';
import { addDays, daysBetween, toD } from './dates';
import { BMI_CATS, bmiCategory, type BmiId } from './health';
import { LB } from './units';

// Motivation: weekly averages, logging streaks and milestones. All pure
// functions over sorted entries, so they are easy to test.

/** Exponentially smoothed trend: each weigh-in moves the trend a quarter of the way toward it. */
export function trendSeries(entries: { date: string; kg: number }[], alpha = 0.25): { date: string; kg: number }[] {
  let t: number | null = null;
  return entries.map(e => { t = t == null ? e.kg : t + alpha * (e.kg - t); return { date: e.date, kg: t }; });
}

/** Monday of the week containing `date` (ISO weeks start on Monday). */
export const weekStart = (date: string): string => addDays(date, -((toD(date).getUTCDay() + 6) % 7));

export interface WeekAverage {
  week: string;          // Monday, YYYY-MM-DD
  avg: number;           // kg
  n: number;             // weigh-ins that week
  change: number | null; // kg vs the previous week that has data
}

/** Average weight per calendar week, newest first. Averages even out day-to-day water swings. */
export function weeklyAverages(entries: Entry[]): WeekAverage[] {
  const byWeek = new Map<string, { sum: number; n: number }>();
  for (const e of entries) {
    const w = weekStart(e.date);
    const cur = byWeek.get(w) ?? { sum: 0, n: 0 };
    cur.sum += e.kg; cur.n++;
    byWeek.set(w, cur);
  }
  const weeks = [...byWeek.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([week, { sum, n }]) => ({ week, avg: sum / n, n }));
  return weeks.map((w, i) => ({ ...w, change: i ? w.avg - weeks[i - 1].avg : null })).reverse();
}

export interface Streaks {
  days: number;        // consecutive days with a weigh-in, ending today (or yesterday, if today isn't logged yet)
  longestDays: number;
  weeks: number;       // consecutive weeks with at least one weigh-in, ending this week (or last week)
  loggedToday: boolean;
}

export function streaks(entries: Entry[], today: string): Streaks {
  const dates = new Set(entries.map(e => e.date));
  const loggedToday = dates.has(today);

  let days = 0;
  for (let d = loggedToday ? today : addDays(today, -1); dates.has(d); d = addDays(d, -1)) days++;

  let longestDays = 0, run = 0, prev: string | null = null;
  for (const d of [...dates].sort()) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    longestDays = Math.max(longestDays, run);
    prev = d;
  }

  const weeksSet = new Set([...dates].map(weekStart));
  const thisWeek = weekStart(today);
  let weeks = 0;
  for (let w = weeksSet.has(thisWeek) ? thisWeek : addDays(thisWeek, -7); weeksSet.has(w); w = addDays(w, -7)) weeks++;

  return { days, longestDays, weeks, loggedToday };
}

export type Milestone =
  | { key: string; kind: 'weight'; steps: number; amountKg: number; date: string }
  | { key: string; kind: 'progress'; pct: 25 | 50 | 75; date: string }
  | { key: string; kind: 'goal'; date: string }
  | { key: string; kind: 'bmi'; category: BmiId; date: string }
  | { key: string; kind: 'maintain'; days: MaintainDays; date: string };

/** Time spent at the goal (in the maintenance range) that counts as a milestone. */
export type MaintainDays = 28 | 91 | 365;
const MAINTAIN_DAYS: readonly MaintainDays[] = [28, 91, 365];

export interface NextMilestone {
  kind: 'weight' | 'progress' | 'goal';
  amountKg?: number;
  pct?: number;
  remainingKg: number; // still to change, always positive
}

/** Weight milestones come in steps that read naturally in each unit: 5 kg, 10 lb or 1 stone. */
export const milestoneStepKg = (u: Unit): number => (u === 'kg' ? 5 : u === 'lb' ? 10 * LB : 14 * LB);

export interface MilestoneInput {
  entries: Entry[];       // sorted oldest first
  goalKg: number | null;
  heightCm: number | null;
  unit: Unit;
}

/** Milestones reached so far (oldest first) and the closest one still ahead. */
export function milestones({ entries, goalKg, heightCm, unit }: MilestoneInput): { achieved: Milestone[]; next: NextMilestone | null } {
  if (!entries.length) return { achieved: [], next: null };
  const start = entries[0].kg, cur = entries[entries.length - 1].kg;
  const hasGoal = goalKg != null && Math.abs(goalKg - start) > 0.05;
  const dir = hasGoal && goalKg! > start ? 1 : -1;
  const step = milestoneStepKg(unit);
  const toward = (kg: number) => dir * (kg - start); // positive = moved toward the goal direction
  const achieved: Milestone[] = [];

  let stepsDone = 0;
  const pctDone = new Set<number>();
  let goalDone = false;
  const h2 = heightCm ? (heightCm / 100) ** 2 : 0;
  const normalIdx = 1;
  let bestBmiIdx = h2 ? BMI_CATS.indexOf(bmiCategory(start / h2)) : -1;

  for (const e of entries.slice(1)) {
    const moved = toward(e.kg);
    while (moved >= (stepsDone + 1) * step - 1e-9) {
      stepsDone++;
      achieved.push({ key: `w${stepsDone}`, kind: 'weight', steps: stepsDone, amountKg: stepsDone * step, date: e.date });
    }
    if (hasGoal) {
      const progress = (e.kg - start) / (goalKg! - start);
      for (const pct of [25, 50, 75] as const) {
        if (!pctDone.has(pct) && progress >= pct / 100) { pctDone.add(pct); achieved.push({ key: `p${pct}`, kind: 'progress', pct, date: e.date }); }
      }
      if (!goalDone && progress >= 1) { goalDone = true; achieved.push({ key: 'goal', kind: 'goal', date: e.date }); }
    }
    if (h2) {
      const idx = BMI_CATS.indexOf(bmiCategory(e.kg / h2));
      const better = dir < 0 ? idx < bestBmiIdx && idx >= normalIdx : idx > bestBmiIdx && idx <= normalIdx;
      if (better) { bestBmiIdx = idx; achieved.push({ key: `bmi-${BMI_CATS[idx].id}`, kind: 'bmi', category: BMI_CATS[idx].id, date: e.date }); }
    }
  }

  // The nearest milestone still ahead, measured from the current weight.
  const candidates: NextMilestone[] = [];
  const movedNow = toward(cur);
  candidates.push({ kind: 'weight', amountKg: (stepsDone + 1) * step, remainingKg: (stepsDone + 1) * step - movedNow });
  if (hasGoal && !goalDone) {
    const span = Math.abs(goalKg! - start);
    for (const pct of [25, 50, 75]) if (!pctDone.has(pct)) candidates.push({ kind: 'progress', pct, remainingKg: (span * pct) / 100 - movedNow });
    candidates.push({ kind: 'goal', remainingKg: span - movedNow });
  }
  const ahead = candidates.filter(c => c.remainingKg > 0.05).sort((a, b) => a.remainingKg - b.remainingKg);
  // Past the goal, extra weight steps aren't worth celebrating; staying there is.
  const next = goalDone ? null : ahead[0] ?? null;
  if (goalDone) {
    const m = maintenance(entries, goalKg!);
    for (const ms of m?.milestones ?? []) achieved.push({ key: `m${ms.days}`, kind: 'maintain', days: ms.days, date: ms.date });
    achieved.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  return { achieved, next };
}

/** How far the trend may drift from the goal and still count as maintaining: ±2 % of it, at least 1 kg. */
export const maintenanceBand = (goalKg: number): number => Math.max(1, goalKg * 0.02);

export interface Maintenance {
  since: string;           // when the goal was first reached
  bandKg: number;          // ± around the goal
  trendKg: number;         // latest smoothed weight
  offKg: number;           // trend − goal; positive means above
  inBand: boolean;
  streakDays: number;      // days in a row the trend has been in the range, up to the latest weigh-in
  milestones: Array<{ days: MaintainDays; date: string }>; // first time each length of stay was reached
}

/**
 * Staying at the goal once it's been reached. Uses the smoothed trend, so a
 * heavy day or two doesn't count as leaving the range. Starts once the trend
 * itself has come into the range: right after a first weigh-in at the goal
 * the trend still lags behind, and calling that "outside your range" would be
 * wrong. Null until then.
 */
export function maintenance(entries: Entry[], goalKg: number): Maintenance | null {
  if (entries.length < 2) return null;
  const start = entries[0].kg, dir = goalKg > start ? 1 : -1;
  if (Math.abs(goalKg - start) <= 0.05) return null;
  const band = maintenanceBand(goalKg);
  // Both: a weigh-in has reached the goal, and since then the trend has come into the range.
  // (Coming down steadily, the trend can enter the range a little before the goal itself.)
  const hit = entries.find(e => dir * (e.kg - goalKg) >= 0);
  if (!hit) return null;
  const all = trendSeries(entries);
  const reached = all.find(p => p.date >= hit.date && dir * (p.kg - goalKg) >= -band);
  if (!reached) return null;
  const trend = all.filter(p => p.date >= reached.date);
  const milestones: Maintenance['milestones'] = [];
  let runStart: string | null = null;
  for (const p of trend) {
    if (Math.abs(p.kg - goalKg) <= band) {
      runStart ??= p.date;
      const days = daysBetween(runStart, p.date);
      for (const d of MAINTAIN_DAYS) if (days >= d && !milestones.some(m => m.days === d)) milestones.push({ days: d, date: p.date });
    } else runStart = null;
  }
  const last = trend[trend.length - 1];
  const inBand = Math.abs(last.kg - goalKg) <= band;
  return {
    since: reached.date, bandKg: band, trendKg: last.kg, offKg: last.kg - goalKg, inBand,
    streakDays: inBand && runStart ? daysBetween(runStart, last.date) : 0, milestones,
  };
}

/** Milestones in `after` that weren't in `before`, for a "you just hit…" message. */
export const newMilestones = (before: Milestone[], after: Milestone[]): Milestone[] => {
  const seen = new Set(before.map(m => m.key));
  return after.filter(m => !seen.has(m.key));
};

export interface Plateau { days: number; since: string; changeKg: number }

/**
 * A plateau: the smoothed trend has stayed within a narrow band (0.3 kg, or
 * 0.4 % of body weight if that's more) for at least two weeks and five
 * weigh-ins. Uses the trend, so one heavy or light day can't trigger it.
 */
export function plateau(entries: Entry[]): Plateau | null {
  if (entries.length < 6) return null;
  const tr = trendSeries(entries);
  const last = tr[tr.length - 1];
  const band = Math.max(0.3, last.kg * 0.004);
  let i = tr.length - 1;
  while (i > 0 && Math.abs(tr[i - 1].kg - last.kg) <= band) i--;
  const days = daysBetween(tr[i].date, last.date);
  if (days < 14 || tr.length - i < 5) return null;
  return { days, since: tr[i].date, changeKg: last.kg - tr[i].kg };
}

export interface WeekdayPattern {
  /** Average kg above (+) or below (−) a typical day, Monday first; null where there's too little data. */
  byDay: Array<number | null>;
  heaviest: number;  // 0 = Monday
  lightest: number;
  spread: number;    // kg between the heaviest and lightest day
}

/**
 * Weight expected on an entry's date from a straight line fitted through the
 * weigh-ins within a week either side. Centred, so unlike the smoothed trend
 * it doesn't lag behind during a loss or gain. Null if too few neighbours.
 */
function localLevel(entries: Entry[], i: number, halfWindowDays = 7): number | null {
  const pts: Array<[number, number]> = [];
  for (const e of entries) {
    const x = daysBetween(entries[i].date, e.date);
    if (Math.abs(x) <= halfWindowDays) pts.push([x, e.kg]);
  }
  if (pts.length < 4) return null;
  const n = pts.length, sx = pts.reduce((s, p) => s + p[0], 0), sy = pts.reduce((s, p) => s + p[1], 0);
  const sxx = pts.reduce((s, p) => s + p[0] * p[0], 0), sxy = pts.reduce((s, p) => s + p[0] * p[1], 0);
  const den = n * sxx - sx * sx;
  const slope = den ? (n * sxy - sx * sy) / den : 0;
  return (sy - slope * sx) / n; // the line's value at this entry's date (x = 0)
}

/**
 * How each day of the week compares with the local level around it. Using a
 * centred local fit (not the lagging trend, and not the overall average)
 * keeps a steady loss or gain from making every day look lighter or heavier.
 * Values are centred so the days average to zero.
 * Needs six weeks of data and at least three weigh-ins on four different weekdays.
 */
export function weekdayPattern(entries: Entry[]): WeekdayPattern | null {
  if (entries.length < 21 || daysBetween(entries[0].date, entries[entries.length - 1].date) < 42) return null;
  const sums = Array<number>(7).fill(0), counts = Array<number>(7).fill(0);
  entries.forEach((e, i) => {
    const level = localLevel(entries, i);
    if (level == null) return;
    const dow = (toD(e.date).getUTCDay() + 6) % 7;
    sums[dow] += e.kg - level;
    counts[dow]++;
  });
  const raw = sums.map((s, d) => (counts[d] >= 3 ? s / counts[d] : null));
  const present = raw.filter((v): v is number => v != null);
  const mean = present.length ? present.reduce((a, b) => a + b, 0) / present.length : 0;
  const byDay = raw.map(v => (v == null ? null : v - mean));
  const known = byDay.flatMap((v, d) => (v == null ? [] : [[v, d] as const]));
  if (known.length < 4) return null;
  const [maxV, heaviest] = known.reduce((a, b) => (b[0] > a[0] ? b : a));
  const [minV, lightest] = known.reduce((a, b) => (b[0] < a[0] ? b : a));
  return { byDay, heaviest, lightest, spread: maxV - minV };
}
