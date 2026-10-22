import { describe, expect, it } from 'vitest';
import { blankProfile, type Entry, type PastGoal } from '../data/schema';
import { pastProgress, retireGoal } from './goals';

const e = (date: string, kg: number): Entry => ({ id: date, date, kg, updatedAt: 0 });
const profile = (goalKg: number | null, entries: Entry[], pastGoals: PastGoal[] = []) => ({ ...blankProfile('P'), goalKg, entries, pastGoals });

describe('goal history', () => {
  const entries = [e('2026-01-05', 92.4), e('2026-02-10', 88.9), e('2026-03-03', 84.9), e('2026-04-01', 84.6)];

  it('keeps a reached goal, with when it was first reached', () => {
    const g = retireGoal(profile(85, entries), 80, '2026-04-02')!;
    expect(g).toMatchObject({ from: '2026-01-05', to: '2026-04-02', startKg: 92.4, goalKg: 85, endKg: 84.6, reached: '2026-03-03' });
    expect(g.id).toMatch(/^g_/);
  });

  it('keeps an unreached goal, with how far it got', () => {
    const g = retireGoal(profile(80, entries), 82, '2026-04-02')!;
    expect(g.reached).toBeNull();
    expect(pastProgress(g)).toBeCloseTo((84.6 - 92.4) / (80 - 92.4), 5);
  });

  it('starts the next goal where the last one was replaced', () => {
    const before: PastGoal = { id: 'g1', from: '2026-01-05', to: '2026-02-10', startKg: 92.4, goalKg: 90, endKg: 88.9, reached: '2026-02-10' };
    const g = retireGoal(profile(85, entries, [before]), 80, '2026-04-02')!;
    expect(g).toMatchObject({ from: '2026-02-10', startKg: 88.9, reached: '2026-03-03' });
  });

  it('works for gaining too', () => {
    const up = [e('2026-01-01', 55), e('2026-03-01', 58.2), e('2026-04-01', 58.6)];
    expect(retireGoal(profile(58, up), 60, '2026-04-02')!.reached).toBe('2026-03-01');
  });

  it('keeps nothing without a goal, for the same weight, or without weigh-ins', () => {
    expect(retireGoal(profile(null, entries), 80, '2026-04-02')).toBeNull();
    expect(retireGoal(profile(85, entries), 85.02, '2026-04-02')).toBeNull();
    expect(retireGoal(profile(85, []), 80, '2026-04-02')).toBeNull();
  });

  it('keeps a goal that is removed, not only one that is changed', () => {
    expect(retireGoal(profile(85, entries), null, '2026-04-02')?.goalKg).toBe(85);
  });
});
