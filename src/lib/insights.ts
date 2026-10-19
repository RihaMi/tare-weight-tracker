import type { Entry, Unit } from '../data/schema';
import { addDays, daysBetween, toD } from './dates';
import { BMI_CATS, bmiCategory } from './health';
import { LB } from './units';

// Motivation: weekly averages, logging streaks and milestones. All pure
// functions over sorted entries, so they are easy to test.

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
  | { key: string; kind: 'bmi'; category: string; date: string };

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
      if (better) { bestBmiIdx = idx; achieved.push({ key: `bmi-${BMI_CATS[idx].name}`, kind: 'bmi', category: BMI_CATS[idx].name, date: e.date }); }
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
  // Past the goal, extra weight steps aren't worth celebrating.
  const next = goalDone ? null : ahead[0] ?? null;
  return { achieved, next };
}

/** Milestones in `after` that weren't in `before`, for a "you just hit…" message. */
export const newMilestones = (before: Milestone[], after: Milestone[]): Milestone[] => {
  const seen = new Set(before.map(m => m.key));
  return after.filter(m => !seen.has(m.key));
};
