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

/** Null until there are two weigh-ins: one point isn't progress. */
export function cardModel(p: Profile, u: Unit, today: string): CardModel | null {
  const r = calc(p);
  if (r.E.length < 2) return null;
  const first = r.E[0].date, last = r.E[r.E.length - 1].date;
  const span = daysBetween(first, last) || 1;
  const at = (date: string) => daysBetween(first, date) / span;
  const { achieved } = milestones({ entries: r.E, goalKg: p.goalKg, heightCm: p.heightCm, unit: u });
  return {
    from: first, to: last, days: r.days!,
    changeKg: r.change!, perWeekKg: r.perDay! * 7,
    count: r.E.length, longestStreak: streaks(r.E, today).longestDays,
    dir: r.dir, goalKg: r.hasGoal ? p.goalKg : null, progress: r.hasGoal ? Math.max(0, Math.min(1, r.progress!)) : null, reached: !!r.reached,
    startKg: r.start!, curKg: r.cur!,
    trend: trendSeries(r.E).map(e => ({ x: at(e.date), kg: e.kg })),
    points: r.E.map(e => ({ x: at(e.date), kg: e.kg })),
    recent: achieved.filter(x => x.kind !== 'progress').slice(-3).reverse(),
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
