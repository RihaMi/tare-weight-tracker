import type { Sex } from '../data/schema';

// Energy estimates. These are population formulas: good starting points,
// not measurements. The page says so wherever it shows them.

export const ACTIVITY: ReadonlyArray<readonly [number, string, string]> = [
  [1.2, 'Mostly sitting', 'Desk job, little or no exercise'],
  [1.375, 'Lightly active', 'Exercise 1–3 days a week'],
  [1.55, 'Moderately active', 'Exercise 3–5 days a week'],
  [1.725, 'Very active', 'Hard exercise 6–7 days a week'],
  [1.9, 'Extremely active', 'Physical job plus training'],
];

/** Energy in one kilogram of body weight change (mostly fat tissue). */
export const KCAL_PER_KG = 7700;

/** Weekly change options in kg; negative is loss. */
export const PACES = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5] as const;

/** Lowest daily intake the app will suggest without medical supervision. */
export const calorieFloor = (sex: Sex): number => (sex === 'm' ? 1500 : 1200);

/** Mifflin–St Jeor resting energy, kcal/day. */
export const bmrMifflin = (sex: Sex, kg: number, heightCm: number, age: number): number =>
  10 * kg + 6.25 * heightCm - 5 * age + (sex === 'm' ? 5 : -161);

/** Katch–McArdle resting energy from lean mass, kcal/day. */
export const bmrKatch = (kg: number, bodyFatPct: number): number => 370 + 21.6 * kg * (1 - bodyFatPct / 100);

export type Formula = 'mifflin' | 'katch';

export interface CalorieInput {
  sex: Sex;
  kg: number;
  heightCm: number;
  age: number;
  activity: number;
  weeklyKg: number;
  formula?: Formula;
  bodyFatPct?: number | null;
}

export interface Macros { proteinG: number; fatG: number; carbsG: number }

export interface CaloriePlan {
  formula: Formula;
  bmr: number;
  tdee: number;           // maintenance
  dailyChange: number;    // kcal/day added (+) or removed (−) for the chosen pace
  raw: number;            // tdee + dailyChange before the safety floor
  target: number;         // what to eat
  floored: boolean;       // target was raised to the floor
  tooFast: boolean;       // loss faster than 1 % of body weight a week
  macros: Macros;
}

/**
 * Protein scales with a reference weight: current weight, capped at the
 * weight for BMI 27 so the target stays realistic at higher body weights.
 * Fat gets about 28 % of calories (at least 0.6 g/kg); carbohydrate fills the rest.
 */
export function macros(kcal: number, kg: number, heightCm: number, weeklyKg: number): Macros {
  const ref = heightCm > 0 ? Math.min(kg, 27 * (heightCm / 100) ** 2) : kg;
  const perKg = weeklyKg < 0 ? 2.0 : weeklyKg > 0 ? 1.8 : 1.6;
  const proteinG = ref * perKg;
  const fatG = Math.max((kcal * 0.28) / 9, 0.6 * ref);
  const carbsG = Math.max(0, (kcal - proteinG * 4 - fatG * 9) / 4);
  return { proteinG: Math.round(proteinG), fatG: Math.round(fatG), carbsG: Math.round(carbsG) };
}

export function caloriePlan(i: CalorieInput): CaloriePlan {
  const formula: Formula = i.formula === 'katch' && i.bodyFatPct != null && i.bodyFatPct > 0 ? 'katch' : 'mifflin';
  const bmr = formula === 'katch' ? bmrKatch(i.kg, i.bodyFatPct as number) : bmrMifflin(i.sex, i.kg, i.heightCm, i.age);
  const tdee = bmr * i.activity;
  const dailyChange = (i.weeklyKg * KCAL_PER_KG) / 7;
  const raw = tdee + dailyChange;
  const floor = calorieFloor(i.sex);
  const target = Math.max(floor, raw);
  return {
    formula, bmr, tdee, dailyChange, raw, target,
    floored: raw < floor,
    tooFast: i.weeklyKg < -0.01 * i.kg,
    macros: macros(target, i.kg, i.heightCm, i.weeklyKg),
  };
}

/** Whole weeks to go from `cur` to `goal` at `weeklyKg`, or null if that pace never gets there. */
export function weeksToGoal(cur: number, goal: number, weeklyKg: number): number | null {
  const diff = goal - cur;
  if (Math.abs(diff) < 0.05) return 0;
  if (!weeklyKg || Math.sign(diff) !== Math.sign(weeklyKg)) return null;
  return Math.ceil(diff / weeklyKg);
}

/** Rounds kcal the way nutrition labels do: to the nearest 10. */
export const roundKcal = (k: number): number => Math.round(k / 10) * 10;
