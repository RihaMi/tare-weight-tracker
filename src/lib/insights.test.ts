import { describe, expect, it } from 'vitest';
import type { Entry } from '../data/schema';
import { milestones, newMilestones, streaks, weekStart, weeklyAverages } from './insights';
import { LB } from './units';

const e = (date: string, kg: number): Entry => ({ id: date, date, kg, updatedAt: 0 });

describe('weekStart', () => {
  it('finds the Monday of the week', () => {
    expect(weekStart('2026-10-19')).toBe('2026-10-19'); // Monday
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // Sunday
    expect(weekStart('2026-10-18')).toBe('2026-10-12'); // previous Sunday
  });
});

describe('weeklyAverages', () => {
  it('averages each week and compares with the week before, newest first', () => {
    const w = weeklyAverages([e('2026-10-12', 90), e('2026-10-14', 89), e('2026-10-19', 88.5), e('2026-10-21', 87.5)]);
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ week: '2026-10-19', avg: 88, n: 2 });
    expect(w[0].change).toBeCloseTo(-1.5, 5);
    expect(w[1].change).toBeNull();
  });

  it('compares across a week with no weigh-ins', () => {
    const w = weeklyAverages([e('2026-10-05', 90), e('2026-10-19', 89)]);
    expect(w[0].change).toBeCloseTo(-1, 5);
  });
});

describe('streaks', () => {
  const entries = [e('2026-10-01', 1), e('2026-10-02', 1), e('2026-10-03', 1), e('2026-10-04', 1), e('2026-10-10', 1), e('2026-10-17', 1), e('2026-10-18', 1)];

  it('counts the current run, allowing today to be not logged yet', () => {
    const s = streaks(entries, '2026-10-19');
    expect(s.days).toBe(2);
    expect(s.loggedToday).toBe(false);
    expect(s.longestDays).toBe(4);
  });

  it('drops to zero after a missed day', () => {
    expect(streaks(entries, '2026-10-20').days).toBe(0);
  });

  it('counts weeks with at least one weigh-in', () => {
    // Weeks starting 28 Sep (1–4 Oct), 5 Oct (10 Oct), 12 Oct (17–18 Oct); 19 Oct has nothing yet.
    expect(streaks(entries, '2026-10-19').weeks).toBe(3);
    expect(streaks([], '2026-10-19')).toEqual({ days: 0, longestDays: 0, weeks: 0, loggedToday: false });
  });
});

describe('milestones', () => {
  const losing = [e('2026-01-01', 100), e('2026-02-01', 95), e('2026-03-01', 94), e('2026-04-01', 89.9), e('2026-05-01', 85)];

  it('marks every 5 kg lost and progress toward the goal', () => {
    const { achieved, next } = milestones({ entries: losing, goalKg: 80, heightCm: null, unit: 'kg' });
    expect(achieved.map(m => m.key)).toEqual(['w1', 'p25', 'w2', 'p50', 'w3', 'p75']);
    expect(achieved[2].date).toBe('2026-04-01');
    expect(next).toMatchObject({ kind: 'weight', amountKg: 20 });
    expect(next!.remainingKg).toBeCloseTo(5, 5);
  });

  it('uses 10 lb steps when the unit is pounds', () => {
    const { achieved } = milestones({ entries: losing, goalKg: null, heightCm: null, unit: 'lb' });
    // 15 kg lost = 33 lb → three 10 lb steps
    expect(achieved.filter(m => m.kind === 'weight')).toHaveLength(3);
    expect(achieved[0].kind === 'weight' && achieved[0].amountKg).toBeCloseTo(10 * LB, 5);
  });

  it('celebrates reaching the goal, then stops suggesting more', () => {
    const { achieved, next } = milestones({ entries: [...losing, e('2026-06-01', 79.8)], goalKg: 80, heightCm: null, unit: 'kg' });
    expect(achieved.at(-1)?.kind).toBe('goal');
    expect(next).toBeNull();
  });

  it('notices moving into a better BMI category', () => {
    // 180 cm: BMI 30 at 97.2 kg, 25 at 81 kg.
    const { achieved } = milestones({ entries: [e('2026-01-01', 99), e('2026-02-01', 96), e('2026-03-01', 80.5)], goalKg: 78, heightCm: 180, unit: 'kg' });
    expect(achieved.filter(m => m.kind === 'bmi').map(m => m.kind === 'bmi' && m.category)).toEqual(['over', 'normal']);
  });

  it('works for a weight-gain goal', () => {
    // 55 → 60.2 toward 61.5 is 80 % of the way.
    const { achieved } = milestones({ entries: [e('2026-01-01', 55), e('2026-03-01', 60.2)], goalKg: 61.5, heightCm: null, unit: 'kg' });
    expect(achieved.map(m => m.key)).toEqual(['w1', 'p25', 'p50', 'p75']);
  });

  it('finds the milestones a new weigh-in just reached', () => {
    const before = milestones({ entries: losing.slice(0, 3), goalKg: 80, heightCm: null, unit: 'kg' }).achieved;
    const after = milestones({ entries: losing.slice(0, 4), goalKg: 80, heightCm: null, unit: 'kg' }).achieved;
    expect(newMilestones(before, after).map(m => m.key)).toEqual(['w2', 'p50']);
  });
});
