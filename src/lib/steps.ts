import type { Entry, GoalStep, Unit } from '../data/schema';
import { daysBetween } from './dates';
import { orderedSteps } from './insights';
import { LB } from './units';

// Goal steps: weights to reach on the way to the goal, some with a date.

export interface NextStep {
  step: GoalStep;
  remainingKg: number;          // still to go, always positive
  daysLeft: number | null;      // to the step's date, if it has one (negative when past)
  needPerWeekKg: number | null; // the pace that date needs, when it's still ahead
}

const reached = (entries: Entry[], s: GoalStep, dir: number) => entries.some(e => dir * (e.kg - s.kg) >= 0);

/** The first step not reached yet, and what it takes to get there. */
export function nextStep(steps: GoalStep[], entries: Entry[], goalKg: number | null): NextStep | null {
  if (!entries.length || !steps.length) return null;
  const start = entries[0].kg, dir = goalKg != null && goalKg > start ? 1 : -1;
  const step = orderedSteps(steps, start, goalKg).find(s => !reached(entries, s, dir));
  if (!step) return null;
  const last = entries[entries.length - 1];
  const remainingKg = Math.abs(step.kg - last.kg);
  if (!step.date) return { step, remainingKg, daysLeft: null, needPerWeekKg: null };
  const daysLeft = daysBetween(last.date, step.date);
  return { step, remainingKg, daysLeft, needPerWeekKg: daysLeft > 0 ? (remainingKg / daysLeft) * 7 : null };
}

/** Which steps have been reached, for marking them on the progress ruler. */
export function stepsReached(steps: GoalStep[], entries: Entry[], goalKg: number | null): Set<string> {
  if (!entries.length) return new Set();
  const start = entries[0].kg, dir = goalKg != null && goalKg > start ? 1 : -1;
  return new Set(steps.filter(s => reached(entries, s, dir)).map(s => s.id));
}

/**
 * Even steps between the start and the goal in the unit people think in:
 * every 5 kg, 10 lb or 1 st, on round numbers, leaving out any too close
 * (within a third of a step) to the start or the goal.
 */
export function suggestSteps(startKg: number, goalKg: number, u: Unit): number[] {
  const stepKg = u === 'kg' ? 5 : u === 'lb' ? 10 * LB : 14 * LB;
  const dir = goalKg > startKg ? 1 : -1;
  const out: number[] = [];
  let at = dir < 0 ? Math.floor(startKg / stepKg) * stepKg : Math.ceil(startKg / stepKg) * stepKg;
  for (let i = 0; i < 40; i++, at += dir * stepKg) {
    if (Math.abs(at - startKg) < stepKg / 3) continue;
    if (dir * (goalKg - at) < stepKg / 3) break;
    out.push(Math.round(at * 100) / 100);
  }
  return out;
}
