import { describe, expect, it } from 'vitest';
import { bmrKatch, bmrMifflin, caloriePlan, macros, roundKcal, weeksToGoal } from './calories';

describe('resting metabolism', () => {
  it('matches the published Mifflin–St Jeor formula', () => {
    expect(bmrMifflin('m', 80, 180, 38)).toBeCloseTo(1740, 5);
    expect(bmrMifflin('f', 60, 165, 30)).toBeCloseTo(1320.25, 5);
  });

  it('matches the published Katch–McArdle formula', () => {
    expect(bmrKatch(80, 20)).toBeCloseTo(1752.4, 5);
  });
});

describe('calorie plan', () => {
  const man = { sex: 'm' as const, kg: 80, heightCm: 180, age: 38, activity: 1.375, weeklyKg: -0.5 };

  it('removes 7,700 kcal per kg from maintenance', () => {
    const p = caloriePlan(man);
    expect(p.tdee).toBeCloseTo(2392.5, 5);
    expect(p.dailyChange).toBeCloseTo(-550, 5);
    expect(p.target).toBeCloseTo(1842.5, 5);
    expect(p.floored).toBe(false);
    expect(p.tooFast).toBe(false);
  });

  it('maintains at zero pace and adds a surplus for gain', () => {
    expect(caloriePlan({ ...man, weeklyKg: 0 }).target).toBeCloseTo(2392.5, 5);
    expect(caloriePlan({ ...man, weeklyKg: 0.25 }).target).toBeCloseTo(2667.5, 5);
  });

  it('never suggests less than the safe minimum, and flags fast loss', () => {
    const p = caloriePlan({ sex: 'f', kg: 50, heightCm: 155, age: 60, activity: 1.2, weeklyKg: -1 });
    expect(p.raw).toBeLessThan(1200);
    expect(p.target).toBe(1200);
    expect(p.floored).toBe(true);
    expect(p.tooFast).toBe(true);
  });

  it('uses Katch–McArdle only when a body fat value is given', () => {
    expect(caloriePlan({ ...man, formula: 'katch', bodyFatPct: 20 }).formula).toBe('katch');
    expect(caloriePlan({ ...man, formula: 'katch', bodyFatPct: null }).formula).toBe('mifflin');
  });
});

describe('macros', () => {
  it('splits a weight-loss target into protein, fat and carbs', () => {
    expect(macros(1842.5, 80, 180, -0.5)).toEqual({ proteinG: 160, fatG: 57, carbsG: 172 });
  });

  it('caps the protein reference weight at BMI 27', () => {
    // 120 kg at 180 cm: reference is 27 × 1.8² = 87.48 kg, so 175 g rather than 240 g.
    expect(macros(2500, 120, 180, -0.5).proteinG).toBe(175);
  });

  it('adds up to roughly the target', () => {
    const m = macros(2200, 70, 170, 0);
    expect(m.proteinG * 4 + m.fatG * 9 + m.carbsG * 4).toBeGreaterThan(2180);
    expect(m.proteinG * 4 + m.fatG * 9 + m.carbsG * 4).toBeLessThan(2220);
  });
});

describe('time to goal', () => {
  it('counts whole weeks in the right direction only', () => {
    expect(weeksToGoal(90, 80, -0.5)).toBe(20);
    expect(weeksToGoal(90, 80, -0.75)).toBe(14);
    expect(weeksToGoal(80, 90, -0.5)).toBeNull();
    expect(weeksToGoal(80, 80.01, -0.5)).toBe(0);
    expect(weeksToGoal(90, 80, 0)).toBeNull();
  });

  it('rounds kcal to the nearest 10', () => {
    expect(roundKcal(1842.5)).toBe(1840);
    expect(roundKcal(1845)).toBe(1850);
  });
});
