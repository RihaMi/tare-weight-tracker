import { describe, expect, it } from 'vitest';
import { blankProfile, type Entry } from '../data/schema';
import { cardModel, chartRange } from './progressCard';

const e = (date: string, kg: number): Entry => ({ id: date, date, kg, updatedAt: 0 });
const profile = (entries: Entry[], goalKg: number | null = null) => ({ ...blankProfile('P'), entries, goalKg, heightCm: 180 });

describe('progress card', () => {
  it('needs two weigh-ins', () => {
    expect(cardModel(profile([e('2026-01-01', 90)]), 'kg', '2026-01-10')).toBeNull();
  });

  it('sums up the change, pace and goal progress', () => {
    const m = cardModel(profile([e('2026-01-01', 90), e('2026-01-02', 89.6), e('2026-01-03', 89.5), e('2026-01-15', 88)], 80), 'kg', '2026-01-15')!;
    expect(m).toMatchObject({ from: '2026-01-01', to: '2026-01-15', days: 14, count: 4, longestStreak: 3, dir: -1, goalKg: 80, reached: false });
    expect(m.changeKg).toBeCloseTo(-2, 5);
    expect(m.perWeekKg).toBeCloseTo(-1, 5);
    expect(m.progress).toBeCloseTo(0.2, 5);
    expect(m.points.map(p => p.x)).toEqual([0, 1 / 14, 2 / 14, 1]);
    expect(m.trend).toHaveLength(4);
  });

  it('keeps the goal inside the chart', () => {
    const m = cardModel(profile([e('2026-01-01', 90), e('2026-02-01', 88)], 80), 'kg', '2026-02-01')!;
    const { lo, hi } = chartRange(m);
    expect(lo).toBeLessThan(80);
    expect(hi).toBeGreaterThan(90);
  });

  it('shows the latest milestones first, leaving out "x% of the way"', () => {
    const m = cardModel(profile([e('2026-01-01', 90), e('2026-02-01', 84), e('2026-03-01', 79)], 80), 'kg', '2026-03-01')!;
    expect(m.recent.map(x => x.date)).toEqual(['2026-03-01', '2026-03-01', '2026-03-01']);
    expect(m.recent.map(x => x.kind).sort()).toEqual(['bmi', 'goal', 'weight']);
  });

  it('can cover just one period, such as a year, keeping the goal from the whole history', () => {
    const p = profile([e('2025-11-01', 96), e('2025-12-20', 94), e('2026-01-05', 93.5), e('2026-06-01', 88), e('2026-12-28', 85), e('2027-01-03', 84.8)], 80);
    const m = cardModel(p, 'kg', '2027-01-04', { from: '2026-01-01', to: '2026-12-31' })!;
    expect([m.from, m.to, m.count]).toEqual(['2026-01-05', '2026-12-28', 3]);
    expect([m.startKg, m.curKg]).toEqual([93.5, 85]);
    expect(m.changeKg).toBeCloseTo(-8.5, 5);
    expect(m.progress).toBeCloseTo((96 - 84.8) / (96 - 80), 5);   // still from the whole history
    expect(m.recent.every(x => x.date >= '2026-01-05' && x.date <= '2026-12-28')).toBe(true);
    expect(cardModel(p, 'kg', '2027-01-04', { from: '2024-01-01', to: '2024-12-31' })).toBeNull();
  });
});
