import type { Entry } from '../data/schema';
import { addDays } from './dates';
import { trendSeries, weeklyAverages } from './insights';

// A look back at one calendar month: how the trend moved, the average, how often you
// weighed in, and the week that went best. Shown at the start of the next month.

const MIN_WEIGH_INS = 4;   // fewer than this in a month says too little to sum up

export interface MonthRecap {
  /** YYYY-MM */
  month: string;
  /** How far the trend moved over the month, in kg (signed). */
  changeKg: number;
  /** Average of the month's weigh-ins, in kg. */
  avgKg: number;
  /** Days with a weigh-in, and days in the month. */
  daysLogged: number;
  daysInMonth: number;
  /** The week starting in this month whose average moved most toward the goal; null when none did. */
  bestWeek: { week: string; changeKg: number } | null;
}

/** The month before the one `today` falls in, as YYYY-MM. */
export const previousMonth = (today: string): string => addDays(today.slice(0, 7) + '-01', -1).slice(0, 7);

/** A recap of `month` (YYYY-MM), or null with fewer than four weigh-ins in it. `dir` is −1 when the goal is to lose. */
export function monthRecap(entries: Entry[], month: string, dir: -1 | 1): MonthRecap | null {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  const inMonth = sorted.filter(e => e.date.startsWith(month));
  if (inMonth.length < MIN_WEIGH_INS) return null;

  // The trend from the last weigh-in before the month (or the month's first) to the month's last.
  const trend = trendSeries(sorted);
  const trendOn = (date: string) => trend.find(t => t.date === date)!.kg;
  const before = sorted.filter(e => e.date < month + '-01').at(-1);
  const changeKg = trendOn(inMonth.at(-1)!.date) - trendOn((before ?? inMonth[0]).date);

  // 32 days after the 1st is always in the next month; the day before that month's 1st is this one's last.
  const nextMonth = addDays(month + '-01', 32).slice(0, 7);
  const daysInMonth = Number(addDays(nextMonth + '-01', -1).slice(8, 10));
  const best = weeklyAverages(sorted)
    .filter(w => w.week.startsWith(month) && w.change != null && dir * w.change > 0)
    .sort((a, b) => dir * b.change! - dir * a.change!)[0];

  return {
    month,
    changeKg,
    avgKg: inMonth.reduce((s, e) => s + e.kg, 0) / inMonth.length,
    daysLogged: new Set(inMonth.map(e => e.date)).size,
    daysInMonth,
    bestWeek: best ? { week: best.week, changeKg: best.change! } : null,
  };
}
