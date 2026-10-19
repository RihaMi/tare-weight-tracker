import type { Entry, Profile } from '../data/schema';
import { addDays, daysBetween } from './dates';
import { CM_IN, caloriePlanFor, idealKg } from './health';

export { idealKg, bmiCategory, BMI_CATS } from './health';

export interface Stats {
  E: Entry[];
  first?: Entry;
  last?: Entry;
  start?: number;
  cur?: number;
  change?: number;
  days?: number;
  perDay?: number;
  recentPerDay?: number;
  age: number | null;
  bmi: number | null;
  hasGoal: boolean;
  dir: -1 | 1;           // −1 when the goal is to lose weight
  remaining?: number;    // goal − current (signed)
  progress?: number;     // 0..1
  reached?: boolean;
  planPerDay: number;    // planned kg/day from first weigh-in to goal date
  needPerDay?: number;   // kg/day still needed to hit the goal date
  daysLeft?: number;
  eta?: string;
  bodyFat?: number;      // BMI-based estimate
  navyBF?: number;       // tape-measure estimate
  navyDate?: string;
  healthyLo?: number;
  healthyHi?: number;
  ideal: number | null;
  tdee?: number;
  target?: number;
  weeklyPlan?: number;
}

export const sortedEntries = (p: Profile): Entry[] => [...p.entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

export const ageOf = (p: Profile, now = new Date()): number | null => (p.birthYear ? now.getFullYear() - p.birthYear : null);

/** US Navy tape-measure body fat estimate. Inputs in centimetres. */
export function navyBodyFat(sex: 'f' | 'm', heightCm: number, waistCm: number, neckCm: number, hipsCm = 0): number | null {
  const w = waistCm / CM_IN, n = neckCm / CM_IN, hp = hipsCm / CM_IN, ht = heightCm / CM_IN;
  const bf = sex === 'm'
    ? 86.010 * Math.log10(w - n) - 70.041 * Math.log10(ht) + 36.76
    : 163.205 * Math.log10(w + hp - n) - 97.684 * Math.log10(ht) - 78.387;
  return isFinite(bf) && bf > 2 && bf < 70 ? bf : null;
}

export function calc(p: Profile, now = new Date()): Stats {
  const E = sortedEntries(p);
  const age = ageOf(p, now);
  const ideal = idealKg(p);
  const base: Stats = { E, age, bmi: null, hasGoal: false, dir: -1, planPerDay: -0.5 / 7, ideal };
  if (!E.length) return base;

  const first = E[0], last = E[E.length - 1], goal = p.goalKg;
  const r: Stats = { ...base, first, last, start: first.kg, cur: last.kg };
  r.change = last.kg - first.kg;
  r.days = Math.max(1, daysBetween(first.date, last.date));
  r.perDay = E.length > 1 ? r.change / r.days : 0;
  const h = (p.heightCm ?? 0) / 100;
  r.bmi = h ? last.kg / (h * h) : null;
  r.hasGoal = goal != null && !isNaN(goal) && Math.abs(goal - first.kg) > 0.05;
  r.dir = r.hasGoal && goal! > first.kg ? 1 : -1;

  if (r.hasGoal) {
    r.remaining = goal! - last.kg;
    r.progress = Math.min(1, Math.max(0, (last.kg - first.kg) / (goal! - first.kg)));
    r.reached = r.dir * r.remaining <= 0;
  }

  // Recent pace: the last three weeks of entries.
  const cutoff = addDays(last.date, -21);
  const recent = E.filter(e => e.date >= cutoff);
  r.recentPerDay = recent.length > 1
    ? (recent[recent.length - 1].kg - recent[0].kg) / Math.max(1, daysBetween(recent[0].date, recent[recent.length - 1].date))
    : r.perDay;

  if (r.hasGoal && p.goalDate) {
    r.planPerDay = (goal! - first.kg) / Math.max(1, daysBetween(first.date, p.goalDate));
    r.daysLeft = daysBetween(last.date, p.goalDate);
    if (r.daysLeft > 0 && !r.reached) r.needPerDay = r.remaining! / r.daysLeft;
  } else {
    r.planPerDay = (r.dir * 0.5) / 7;
  }

  if (r.hasGoal && !r.reached && Math.sign(r.recentPerDay) === r.dir && Math.abs(r.recentPerDay) > 0.002) {
    r.eta = addDays(last.date, Math.ceil(r.remaining! / r.recentPerDay));
  }

  if (r.bmi && age) r.bodyFat = 1.2 * r.bmi + 0.23 * age - 10.8 * (p.sex === 'm' ? 1 : 0) - 5.4; // Deurenberg

  if (h) { r.healthyLo = 18.5 * h * h; r.healthyHi = 24.9 * h * h; }

  const m = [...E].reverse().find(e => e.measures?.waist && e.measures?.neck && (p.sex === 'm' || e.measures?.hips));
  if (m && p.heightCm) {
    const bf = navyBodyFat(p.sex, p.heightCm, m.measures!.waist!, m.measures!.neck!, m.measures!.hips);
    if (bf != null) { r.navyBF = bf; r.navyDate = m.date; }
  }

  if (p.heightCm && age) {
    let wk = r.hasGoal && !r.reached ? (r.needPerDay != null ? r.needPerDay * 7 : r.dir * 0.5) : 0;
    wk = Math.min(0.5, Math.max(-1, wk));
    const plan = caloriePlanFor(p, last.kg, age, wk);
    r.tdee = plan.tdee; r.target = plan.target; r.weeklyPlan = wk;
  }
  return r;
}

export type Quality = '' | 'good' | 'warn' | 'bad';

/**
 * How one weigh-in compares with the planned pace since the previous one:
 * good = at or ahead of plan, warn = right direction but slower, bad = moved away from the goal.
 */
export function quality(prev: Entry | undefined, e: Entry, planPerDay: number): Quality {
  if (!prev) return '';
  const rate = (e.kg - prev.kg) / Math.max(1, daysBetween(prev.date, e.date));
  const dir = Math.sign(planPerDay) || -1;
  const toward = rate * dir;
  if (toward >= Math.abs(planPerDay) * 0.95) return 'good';
  if (toward >= -0.02) return 'warn';
  return 'bad';
}

export function paceState(r: Stats): { cls: 'good' | 'warn' | 'bad'; text: string } | null {
  if (!r.hasGoal || r.E.length < 2) return null;
  if (r.reached) return { cls: 'good', text: 'Goal reached' };
  const toward = (r.recentPerDay ?? 0) * r.dir;
  const need = Math.abs(r.needPerDay ?? r.planPerDay);
  if (toward >= need * 0.9) return { cls: 'good', text: 'On pace' };
  if (toward > 0) return { cls: 'warn', text: 'Behind pace' };
  return { cls: 'bad', text: 'Moving away from goal' };
}
