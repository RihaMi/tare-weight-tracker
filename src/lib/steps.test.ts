import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, migrate, type Entry, type GoalStep } from '../data/schema';
import { addDays } from './dates';
import { milestones, orderedSteps } from './insights';
import { nextStep, stepsReached, suggestSteps } from './steps';
import { LB } from './units';

const e = (date: string, kg: number): Entry => ({ id: date, date, kg, updatedAt: 0 });
const st = (id: string, kg: number, date: string | null = null): GoalStep => ({ id, kg, date });
const E = [e('2026-01-01', 95), e('2026-02-01', 91), e('2026-03-01', 88.5)];

describe('goal steps', () => {
  it('keeps only steps on the way, nearest the start first', () => {
    const steps = [st('a', 85), st('b', 90), st('c', 100), st('d', 75), st('e', 80)];
    expect(orderedSteps(steps, 95, 80).map(s => s.id)).toEqual(['b', 'a']);
    // Gaining: the other way round.
    expect(orderedSteps([st('x', 60), st('y', 58)], 55, 62).map(s => s.id)).toEqual(['y', 'x']);
  });

  it('counts reaching a step as a milestone, and offers the next one', () => {
    const { achieved, next } = milestones({ entries: E, goalKg: 80, heightCm: null, unit: 'kg', steps: [st('a', 90), st('b', 88)] });
    expect(achieved.filter(m => m.kind === 'step')).toEqual([{ key: 'sa', kind: 'step', kg: 90, date: '2026-03-01' }]);
    // The nearest milestone ahead: the 88 kg step (0.5 to go) before "50% of the way" (87.5 kg).
    expect(next).toMatchObject({ kind: 'step', stepKg: 88, fromKg: 90 });
    expect(next!.remainingKg).toBeCloseTo(0.5);
  });

  it('works out the next step and the pace its date needs', () => {
    const n = nextStep([st('a', 90), st('b', 85, addDays('2026-03-01', 35))], E, 80)!;
    expect(n.step.id).toBe('b');
    expect(n.remainingKg).toBeCloseTo(3.5);
    expect(n.daysLeft).toBe(35);
    expect(n.needPerWeekKg).toBeCloseTo(0.7);
    expect(nextStep([st('a', 90)], E, 80)).toBeNull();
    expect([...stepsReached([st('a', 90), st('b', 85)], E, 80)]).toEqual(['a']);
  });

  it('suggests round steps in the unit in use', () => {
    expect(suggestSteps(92.4, 80, 'kg')).toEqual([90, 85]);
    expect(suggestSteps(92.4, 75, 'kg')).toEqual([90, 85, 80]);
    expect(suggestSteps(60, 70, 'kg')).toEqual([65]);
    expect(suggestSteps(200 * LB, 170 * LB, 'lb').map(kg => Math.round(kg / LB))).toEqual([190, 180]);
  });

  it('is saved with the profile, and older data upgrades with none', () => {
    const base = { version: 4, unit: 'kg', profiles: [{ id: 'p', name: 'P', entries: [{ date: '2026-01-01', kg: 80 }] }] };
    const d = migrate(base);
    expect(d.version).toBe(SCHEMA_VERSION);
    expect(d.profiles[0].goalSteps).toEqual([]);
    const kept = migrate({ ...base, version: 5, profiles: [{ ...base.profiles[0], goalSteps: [{ id: 's', kg: 75, date: '2026-05-01' }, { kg: 'heavy' }, { kg: 72, date: '2026-02-30' }] }] });
    expect(kept.profiles[0].goalSteps.map(s => [s.kg, s.date])).toEqual([[75, '2026-05-01'], [72, null]]);
  });
});
