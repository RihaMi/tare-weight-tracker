import { describe, expect, it } from 'vitest';
import type { Entry } from '../data/schema';
import { addDays } from './dates';
import { yearReview } from './yearReview';

/** Weigh-ins every `step` days from `start`, `n` of them, changing by `perDay` kg a day. */
function series(start: string, n: number, step: number, startKg: number, perDay: number): Entry[] {
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(start, i * step);
    return { id: date, date, kg: +(startKg + perDay * i * step).toFixed(2), updatedAt: 0 };
  });
}

// Mid-December 2025, then 2026: slow in spring, fastest in June, flat in autumn.
const entries: Entry[] = [
  ...series('2025-12-15', 5, 3, 95, -0.02),
  ...series('2026-03-01', 30, 3, 94.7, -0.02),   // March–May: about −0.6 kg a month
  ...series('2026-06-01', 30, 1, 92.9, -0.08),   // June: daily, about −2.4 kg
  ...series('2026-07-01', 40, 4, 90.5, 0),        // July to early December: flat
];

describe('a year in review', () => {
  it('sums up the year: trend change, weigh-ins, best month and longest streak', () => {
    const r = yearReview(entries, '2026', -1)!;
    expect(r.year).toBe('2026');
    expect(r.changeKg).toBeLessThan(-3);
    expect(r.weighIns).toBe(100);
    expect(r.bestMonth?.month).toBe('2026-06');
    expect(r.longestStreak).toBe(31);                // all of June, plus the first July weigh-in
    expect(r.from).toBe('2026-03-01');
  });

  it('has no best month when nothing moved toward the goal', () => {
    expect(yearReview(entries, '2026', 1)!.bestMonth?.month).not.toBe('2026-06');
  });

  it('needs at least 12 weigh-ins spread over two months', () => {
    expect(yearReview(entries, '2025', -1)).toBeNull();                              // 5 weigh-ins
    expect(yearReview(series('2026-01-01', 20, 1, 80, 0), '2026', -1)).toBeNull();   // 20 days only
  });
});
