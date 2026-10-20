import type { Entry, WeightEvent } from '../data/schema';
import { addDays, daysBetween } from './dates';
import { trendSeries } from './insights';

// Events (medication, a holiday, an illness…) explain changes in the trend.
// These helpers say which events cover a date and how the trend moved before
// and after one started.

/** Events covering `date`. One without an end covers every day from its start. */
export const eventsOn = (events: WeightEvent[], date: string): WeightEvent[] =>
  events.filter(e => e.start <= date && (e.end == null || e.end >= date));

export interface EventEffect {
  weeksBefore: number;
  weeksAfter: number;
  beforePerWeek: number; // kg a week, signed
  afterPerWeek: number;
}

/**
 * The trend's weekly change in the weeks before an event started (up to 4)
 * compared with since it started (up to 12, or until it ended). Needs at
 * least 3 weeks on each side, so a few days of noise can't make a claim.
 */
export function eventEffect(entries: Entry[], ev: WeightEvent): EventEffect | null {
  if (entries.length < 6) return null;
  const trend = trendSeries(entries);
  const at = (date: string): number | null => {
    let v: number | null = null;
    for (const p of trend) { if (p.date > date) break; v = p.kg; }
    return v;
  };
  const last = entries[entries.length - 1].date;
  const until = ev.end && ev.end < last ? ev.end : last;
  const weeksAfter = Math.min(12, Math.floor(daysBetween(ev.start, until) / 7));
  const weeksBefore = Math.min(4, Math.floor(daysBetween(entries[0].date, ev.start) / 7));
  if (weeksAfter < 3 || weeksBefore < 3) return null;
  const before = at(addDays(ev.start, -7 * weeksBefore)), start = at(ev.start), after = at(addDays(ev.start, 7 * weeksAfter));
  if (before == null || start == null || after == null) return null;
  return { weeksBefore, weeksAfter, beforePerWeek: (start - before) / weeksBefore, afterPerWeek: (after - start) / weeksAfter };
}
