import type { Frame, Profile, Sex } from '../data/schema';
import { CM_IN } from './units';
import { caloriePlan, type CaloriePlan } from './calories';

export { CM_IN };

export type BmiId = 'under' | 'normal' | 'over' | 'obese1' | 'obese2' | 'obese3';
export interface BmiCategory { id: BmiId; max: number; name: string; tone: 'good' | 'warn' | 'bad' }

export const BMI_CATS: ReadonlyArray<BmiCategory> = [
  { id: 'under', max: 18.5, name: 'Underweight', tone: 'warn' },
  { id: 'normal', max: 25, name: 'Normal', tone: 'good' },
  { id: 'over', max: 30, name: 'Overweight', tone: 'warn' },
  { id: 'obese1', max: 35, name: 'Obese I', tone: 'bad' },
  { id: 'obese2', max: 40, name: 'Obese II', tone: 'bad' },
  { id: 'obese3', max: Infinity, name: 'Obese III', tone: 'bad' },
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
