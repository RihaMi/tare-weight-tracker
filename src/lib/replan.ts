import { addDays, daysBetween } from './dates';
import { goalDateRange } from './forecast';
import { paceState, type Stats } from './calc';

// When the pace has fallen behind the goal date, two honest ways on: keep the date and
// see the weekly pace that now takes, or keep a realistic pace and move the date. The
// new date comes from the same forecast as "Likely goal date", or, when the trend isn't
// heading to the goal at all, from a steady, healthy pace.

const MIN_DAYS_OF_DATA = 21;   // three weeks before calling anyone behind
const MAX_DAYS_SINCE = 14;     // a stale trend says little about the pace now
const STEADY_LOSE_KG = 0.5;    // a week, when there's no pace to go by
const STEADY_GAIN_KG = 0.25;

export interface Replan {
  /** The weekly change needed to still reach the goal by its date (absolute kg); null once the date has passed. */
  needPerWeekKg: number | null;
  /** Whether that pace is faster than is healthy: over 1 % of body weight (or 1 kg) a week when losing, 0.5 kg when gaining. */
  tooFast: boolean;
  /** A realistic new goal date. */
  newDate: string;
  /** The weekly change behind it (absolute kg). */
  perWeekKg: number;
  /** Where that pace comes from: the recent trend, or a steady pace because the trend isn't heading to the goal. */
  basis: 'recent' | 'steady';
}

/** A re-plan for a goal that has fallen behind its date, or null when there's nothing to re-plan. */
export function replan(goalKg: number | undefined, goalDate: string | undefined, r: Stats, today: string): Replan | null {
  if (goalKg == null || !goalDate || !r.hasGoal || r.reached || r.maintenance) return null;
  const pace = paceState(r);
  if (!pace || (pace.code !== 'behind' && pace.code !== 'away')) return null;
  const first = r.first!, last = r.last!;
  if (daysBetween(first.date, last.date) < MIN_DAYS_OF_DATA || daysBetween(last.date, today) > MAX_DAYS_SINCE) return null;

  const remaining = Math.abs(goalKg - last.kg);
  const daysLeft = daysBetween(today, goalDate);
  const needPerWeekKg = daysLeft > 0 ? (remaining / daysLeft) * 7 : null;
  const limit = r.dir < 0 ? Math.min(1, last.kg * 0.01) : 0.5;
  const tooFast = needPerWeekKg != null && needPerWeekKg > limit;

  const likely = goalDateRange(r.E, goalKg);
  let newDate: string, perWeekKg: number, basis: Replan['basis'];
  if (likely) {
    newDate = likely.mid; perWeekKg = Math.abs(likely.perWeekKg); basis = 'recent';
  } else {
    perWeekKg = r.dir < 0 ? STEADY_LOSE_KG : STEADY_GAIN_KG;
    newDate = addDays(today, Math.ceil((remaining / perWeekKg) * 7)); basis = 'steady';
  }
  // Only worth offering when it really is later; otherwise the forecast and the badge disagree.
  if (newDate <= goalDate) return null;
  return { needPerWeekKg, tooFast, newDate, perWeekKg, basis };
}
