import type { Entry } from '../data/schema';
import { daysBetween } from './dates';
import { trendSeries } from './insights';

// A weight far from where the trend stands is most likely a typo: "94.1" for "84.1", or a
// slipped decimal. The log form asks once before saving it. The margin allows for a normal
// day-to-day swing (water, salt, a big meal) and grows with the days since the nearest weigh-in.

const SWING_KG = 3;          // at least this much either way is never questioned
const SWING_SHARE = 0.04;    // or 4 % of body weight, for heavier people
const PER_DAY_KG = 0.15;     // plus this much for each day between weigh-ins
const MAX_GAP_DAYS = 60;     // after a longer break, anything goes

export interface Unlikely {
  /** The trend the weight was compared with, in kg. */
  trendKg: number;
  /** The weight minus that trend, in kg. */
  diffKg: number;
}

/**
 * Whether `kg` on `date` is far enough from the trend to ask about it. `entries` are the
 * other weigh-ins (any on the same date are ignored). The trend just before the date is
 * used, or the first weigh-in after it when the date comes before all of them.
 */
export function unlikelyWeight(entries: Entry[], date: string, kg: number): Unlikely | null {
  const others = entries.filter(e => e.date !== date).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (others.length < 2) return null;
  const trend = trendSeries(others);
  const ref = [...trend].reverse().find(t => t.date < date) ?? trend.find(t => t.date > date)!;
  const gap = Math.abs(daysBetween(ref.date, date));
  if (gap > MAX_GAP_DAYS) return null;
  const diffKg = kg - ref.kg;
  const margin = Math.max(SWING_KG, ref.kg * SWING_SHARE) + PER_DAY_KG * gap;
  return Math.abs(diffKg) > margin ? { trendKg: ref.kg, diffKg } : null;
}
