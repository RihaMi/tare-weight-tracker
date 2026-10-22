import { describe, expect, it } from 'vitest';
import type { Entry, Profile } from '../data/schema';
import { calc, navyBodyFat, paceState, quality } from './calc';
import { idealFromHeight, bmiCategory } from './health';

const entry = (date: string, kg: number): Entry => ({ id: date, date, kg, updatedAt: 0 });

function profile(over: Partial<Profile> = {}): Profile {
  return {
    id: 'p', name: 'Test', unit: 'kg', sex: 'm', birthYear: 1988, heightCm: 180, frame: 'medium', activity: 1.375,
    goalKg: 80, goalDate: '2026-07-20', updatedAt: 0, events: [], goalSteps: [], cycleTracking: false, periodStarts: [], pastGoals: [], deleted: [],
    entries: [entry('2026-01-01', 100), entry('2026-02-20', 95), entry('2026-04-11', 90)],
    ...over,
  };
}

describe('calc', () => {
  const now = new Date('2026-04-11T12:00:00Z');

  it('works out change, pace and progress toward a weight-loss goal', () => {
    const r = calc(profile(), now);
    expect(r.change).toBe(-10);
    expect(r.days).toBe(100);
    expect(r.perDay).toBeCloseTo(-0.1, 5);
    expect(r.dir).toBe(-1);
    expect(r.remaining).toBe(-10);
    expect(r.progress).toBeCloseTo(0.5, 5);
    expect(r.reached).toBe(false);
    expect(r.bmi).toBeCloseTo(90 / 3.24, 5);
    expect(r.age).toBe(38);
  });

  it('is safe with no weigh-ins', () => {
    const r = calc(profile({ entries: [] }), now);
    expect(r.E).toEqual([]);
    expect(r.bmi).toBeNull();
  });

  it('marks a gain goal as direction +1', () => {
    const r = calc(profile({ goalKg: 110 }), now);
    expect(r.dir).toBe(1);
    expect(r.progress).toBe(0);
  });

  it('notices when the goal is reached', () => {
    const r = calc(profile({ goalKg: 92 }), now);
    expect(r.reached).toBe(true);
    expect(paceState(r)?.code).toBe('reached');
  });

  it('sorts entries regardless of storage order', () => {
    const p = profile();
    p.entries.reverse();
    expect(calc(p, now).first?.date).toBe('2026-01-01');
  });
});

describe('daily quality', () => {
  const plan = -0.1;
  it('rates each weigh-in against the planned pace', () => {
    const prev = entry('2026-01-01', 100);
    expect(quality(undefined, prev, plan)).toBe('');
    expect(quality(prev, entry('2026-01-06', 99), plan)).toBe('good');
    expect(quality(prev, entry('2026-01-06', 99.9), plan)).toBe('warn');
    expect(quality(prev, entry('2026-01-06', 101), plan)).toBe('bad');
  });
});

describe('health formulas', () => {
  it('estimates body fat with the US Navy tape method', () => {
    const bf = navyBodyFat('m', 180, 94, 39);
    expect(bf).toBeGreaterThan(20);
    expect(bf).toBeLessThan(24);
    expect(navyBodyFat('m', 180, 30, 39)).toBeNull(); // waist smaller than neck: not a valid measurement
  });

  it('computes Devine ideal weight with frame adjustment', () => {
    expect(idealFromHeight('m', 180)).toBeCloseTo(50 + 2.3 * (180 / 2.54 - 60), 5);
    expect(idealFromHeight('f', 165, 'small')).toBeCloseTo((45.5 + 2.3 * (165 / 2.54 - 60)) * 0.9, 5);
  });

  it('puts BMI values in the right category', () => {
    expect(bmiCategory(18.4).name).toBe('Underweight');
    expect(bmiCategory(24.9).name).toBe('Normal');
    expect(bmiCategory(25).name).toBe('Overweight');
    expect(bmiCategory(41).name).toBe('Obese III');
  });
});
