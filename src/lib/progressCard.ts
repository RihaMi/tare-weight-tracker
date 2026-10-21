import type { Profile, Unit } from '../data/schema';
import { calc } from './calc';
import { daysBetween } from './dates';
import { milestones, streaks, trendSeries, type Milestone } from './insights';

// What goes on the shareable progress picture. Kept apart from the drawing so
// it can be tested without a canvas.

export interface CardPoint { x: number; kg: number } // x: 0 at the first weigh-in, 1 at the last

export interface CardModel {
  from: string;
  to: string;
  days: number;
  changeKg: number;          // latest − first
  perWeekKg: number;
  count: number;             // weigh-ins
  longestStreak: number;     // days in a row
  dir: -1 | 1;               // −1 when losing is the goal (or there's no goal)
  goalKg: number | null;
  progress: number | null;   // 0..1 toward the goal
  reached: boolean;
  startKg: number;
  curKg: number;
  trend: CardPoint[];
  points: CardPoint[];
  recent: Milestone[];       // newest first, at most three; "x% of the way" left out, since the card shows the progress itself
}

/** A stretch of time the picture covers instead of the whole history, such as one year. */
export interface CardPeriod { from: string; to: string }

/**
 * Null until there are two weigh-ins (in the period, if given): one point isn't progress.
 * With a period, the chart, change, pace, streak and milestones cover only it; the goal
 * and how far along it you are still come from the whole history.
 */
export function cardModel(p: Profile, u: Unit, today: string, period?: CardPeriod): CardModel | null {
  const r = calc(p);
  const E = period ? r.E.filter(e => e.date >= period.from && e.date <= period.to) : r.E;
  if (E.length < 2) return null;
  const first = E[0].date, last = E[E.length - 1].date;
  const span = daysBetween(first, last) || 1;
  const at = (date: string) => daysBetween(first, date) / span;
  const change = E[E.length - 1].kg - E[0].kg;
  const { achieved } = milestones({ entries: r.E, goalKg: p.goalKg, heightCm: p.heightCm, unit: u, steps: p.goalSteps });
  return {
    from: first, to: last, days: Math.max(1, daysBetween(first, last)),
    changeKg: change, perWeekKg: (change / span) * 7,
    count: E.length, longestStreak: streaks(E, period ? last : today).longestDays,
    dir: r.dir, goalKg: r.hasGoal ? p.goalKg : null, progress: r.hasGoal ? Math.max(0, Math.min(1, r.progress!)) : null, reached: !!r.reached,
    startKg: E[0].kg, curKg: E[E.length - 1].kg,
    trend: trendSeries(E).map(e => ({ x: at(e.date), kg: e.kg })),
    points: E.map(e => ({ x: at(e.date), kg: e.kg })),
    recent: achieved.filter(x => x.kind !== 'progress' && x.date >= first && x.date <= last).slice(-3).reverse(),
  };
}

/** The weight range the chart shows: every point and the goal, with a little room above and below. */
export function chartRange(m: CardModel): { lo: number; hi: number } {
  const all = [...m.points.map(p => p.kg), ...(m.goalKg != null ? [m.goalKg] : [])];
  let lo = Math.min(...all), hi = Math.max(...all);
  const pad = Math.max(0.5, (hi - lo) * 0.08);
  lo -= pad; hi += pad;
  return { lo, hi };
}
