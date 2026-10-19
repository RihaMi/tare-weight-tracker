import type { Frame, Profile, Sex } from '../data/schema';
import { CM_IN } from './units';
import { caloriePlan, type CaloriePlan } from './calories';

export { CM_IN };

export interface BmiCategory { max: number; name: string; tone: 'good' | 'warn' | 'bad' }

export const BMI_CATS: ReadonlyArray<BmiCategory> = [
  { max: 18.5, name: 'Underweight', tone: 'warn' },
  { max: 25, name: 'Normal', tone: 'good' },
  { max: 30, name: 'Overweight', tone: 'warn' },
  { max: 35, name: 'Obese I', tone: 'bad' },
  { max: 40, name: 'Obese II', tone: 'bad' },
  { max: Infinity, name: 'Obese III', tone: 'bad' },
];

export const bmiCategory = (bmi: number): BmiCategory => BMI_CATS.find(c => bmi < c.max) ?? BMI_CATS[BMI_CATS.length - 1];

/** Devine formula, adjusted ±10 % for a small or large body frame. */
export function idealFromHeight(sex: Sex, heightCm: number, frame: Frame = 'medium'): number {
  const inches = heightCm / CM_IN;
  const base = (sex === 'm' ? 50 : 45.5) + 2.3 * Math.max(0, inches - 60);
  return base * { small: 0.9, medium: 1, large: 1.1 }[frame];
}

export const idealKg = (p: Profile): number | null => (p.heightCm ? idealFromHeight(p.sex, p.heightCm, p.frame) : null);

export const caloriePlanFor = (p: Profile, kg: number, age: number, weeklyKg: number): CaloriePlan =>
  caloriePlan({ sex: p.sex, kg, heightCm: p.heightCm ?? 0, age, activity: p.activity, weeklyKg });
