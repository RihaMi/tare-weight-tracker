import { newId, type PastGoal, type Profile } from '../data/schema';
import { sortedEntries } from './calc';

// Goal history: when a new goal weight replaces one, the old goal is kept, with where
// it started, where it got to and when (if ever) it was reached. Moving only the date
// doesn't count as a new goal.

/**
 * The goal `newGoalKg` replaces, as a past goal; null when there's nothing to keep: no goal
 * before, the same weight, or no weigh-ins since that goal began.
 */
export function retireGoal(p: Profile, newGoalKg: number | null, today: string): PastGoal | null {
  const goalKg = p.goalKg;
  if (goalKg == null || (newGoalKg != null && Math.abs(newGoalKg - goalKg) < 0.05)) return null;
  const E = sortedEntries(p);
  const from = p.pastGoals.at(-1)?.to ?? E[0]?.date;
  if (!from) return null;
  const during = E.filter(e => e.date >= from && e.date <= today);
  if (!during.length) return null;
  const startKg = during[0].kg;
  const dir = goalKg < startKg ? -1 : 1;
  const reached = during.find(e => dir * (e.kg - goalKg) >= 0)?.date ?? null;
  return { id: newId('g_'), from, to: today, startKg, goalKg, endKg: during[during.length - 1].kg, reached };
}

/** How far along a past goal got, 0..1, when it wasn't reached. */
export const pastProgress = (g: PastGoal): number =>
  Math.abs(g.goalKg - g.startKg) < 0.05 ? 1 : Math.max(0, Math.min(1, (g.endKg - g.startKg) / (g.goalKg - g.startKg)));
