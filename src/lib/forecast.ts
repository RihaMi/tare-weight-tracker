import type { Entry } from '../data/schema';
import { addDays, daysBetween } from './dates';
import { trendSeries } from './insights';

// When the goal is likely to be reached, as a range rather than one date.
// Weight comes off unevenly, so a single date jumps around from week to week;
// a range says honestly how sure the estimate is, and narrows as the pace
// becomes more consistent.

export interface GoalRange {
  from: string;          // earliest likely date (the faster pace)
  mid: string;           // at the average pace
  to: string;            // latest likely date (the slower pace)
  perWeekKg: number;     // average weekly change of the trend, signed
}

const MIN_WEEKS = 3, MAX_WEEKS = 8;
const MAX_DAYS_AHEAD = 2 * 365; // further out than this, a date means little

/** The trend's value on `date`: the last trend point on or before it. */
function trendAt(trend: Array<{ date: string; kg: number }>, date: string): number | null {
  let v: number | null = null;
  for (const p of trend) { if (p.date > date) break; v = p.kg; }
  return v;
}

/**
 * Likely goal date range from the smoothed trend's week-by-week changes over
 * the last 3–8 weeks. Null when there's too little data, the trend is flat or
 * moving away from the goal, the goal is reached, or the date is too far off.
 */
export function goalDateRange(entries: Entry[], goalKg: number): GoalRange | null {
  if (entries.length < 6) return null;
  const trend = trendSeries(entries);
  const last = trend[trend.length - 1];
  const remaining = goalKg - last.kg;
  if (Math.abs(remaining) < 0.05) return null;

  const weeksOfData = Math.floor(daysBetween(entries[0].date, last.date) / 7);
  const n = Math.min(MAX_WEEKS, weeksOfData);
  if (n < MIN_WEEKS) return null;
  const changes: number[] = [];
  for (let k = 1; k <= n; k++) {
    const a = trendAt(trend, addDays(last.date, -7 * k)), b = trendAt(trend, addDays(last.date, -7 * (k - 1)));
    if (a == null || b == null) return null;
    changes.push(b - a);
  }
  const mean = changes.reduce((s, c) => s + c, 0) / n;
  if (Math.sign(mean) !== Math.sign(remaining) || Math.abs(mean) < 0.05) return null;
  const sd = Math.sqrt(changes.reduce((s, c) => s + (c - mean) ** 2, 0) / (n - 1));
  // Spread of the average pace: uncertainty shrinks with more weeks, but never
  // below ±15 %, since no forecast of a body is that precise.
  const half = Math.max((1.5 * sd) / Math.sqrt(n), Math.abs(mean) * 0.15);
  const fast = Math.abs(mean) + half, slow = Math.abs(mean) - half;
  if (slow < 0.05) return null;
  const days = (perWeek: number) => Math.round((Math.abs(remaining) / perWeek) * 7);
  if (days(slow) > MAX_DAYS_AHEAD) return null;
  return {
    from: addDays(last.date, days(fast)),
    mid: addDays(last.date, days(Math.abs(mean))),
    to: addDays(last.date, days(slow)),
    perWeekKg: mean,
  };
}
