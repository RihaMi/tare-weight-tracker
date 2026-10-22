import type { Entry } from '../data/schema';
import { daysBetween } from './dates';
import { streaks, trendSeries } from './insights';
import { monthRecap } from './recap';

// A look back at one calendar year: how the trend moved, how often you weighed in,
// the month that went best and the longest streak. Shown in the first weeks of January.

const MIN_WEIGH_INS = 12;  // and at least two months between the first and the last,
const MIN_SPAN_DAYS = 60;  // or a "year" says too little

export interface YearReview {
  year: string;
  /** How far the trend moved over the year, in kg (signed). */
  changeKg: number;
  weighIns: number;
  /** The month with the biggest trend move toward the goal; null when none moved that way. */
  bestMonth: { month: string; changeKg: number } | null;
  /** The longest run of days in a row with a weigh-in. */
  longestStreak: number;
  /** The year's first and last weigh-in dates. */
  from: string;
  to: string;
}

/** A review of `year` (YYYY), or null with too little data in it. `dir` is −1 when the goal is to lose. */
export function yearReview(entries: Entry[], year: string, dir: -1 | 1): YearReview | null {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  const inYear = sorted.filter(e => e.date.startsWith(year + '-'));
  if (inYear.length < MIN_WEIGH_INS) return null;
  const from = inYear[0].date, to = inYear.at(-1)!.date;
  if (daysBetween(from, to) < MIN_SPAN_DAYS) return null;

  // The trend from the last weigh-in before the year (or the year's first) to the year's last.
  const trend = trendSeries(sorted);
  const trendOn = (date: string) => trend.find(t => t.date === date)!.kg;
  const before = sorted.filter(e => e.date < from).at(-1);
  const changeKg = trendOn(to) - trendOn((before ?? inYear[0]).date);

  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const best = months
    .map(month => monthRecap(sorted, month, dir))
    .filter(r => r != null && dir * r.changeKg > 0)
    .sort((a, b) => dir * b!.changeKg - dir * a!.changeKg)[0];

  return {
    year, changeKg, weighIns: inYear.length, from, to,
    bestMonth: best ? { month: best.month, changeKg: best.changeKg } : null,
    // Counted back from the year's last weigh-in, over the year's weigh-ins only.
    longestStreak: streaks(inYear, to).longestDays,
  };
}
