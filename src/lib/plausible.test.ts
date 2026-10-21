import { describe, expect, it } from 'vitest';
import type { Entry } from '../data/schema';
import { addDays } from './dates';
import { unlikelyWeight } from './plausible';

/** Daily weigh-ins from `start`, one per value. */
const days = (start: string, kgs: number[]): Entry[] => kgs.map((kg, i) => ({ id: `e${i}`, date: addDays(start, i), kg, updatedAt: 1 }));
const steady = days('2026-10-01', [84.6, 84.4, 84.5, 84.2, 84.3, 84.1, 84.0]); // up to Oct 7

describe('an unlikely weight', () => {
  it('is a typo far from the trend, in either direction', () => {
    expect(unlikelyWeight(steady, '2026-10-08', 94.1)).toMatchObject({ diffKg: expect.closeTo(9.9, 0) });
    expect(unlikelyWeight(steady, '2026-10-08', 48.1)?.diffKg).toBeLessThan(-30);
  });

  it('is not a normal swing, even a big one after a weekend away', () => {
    expect(unlikelyWeight(steady, '2026-10-08', 84.9)).toBeNull();
    expect(unlikelyWeight(steady, '2026-10-08', 86.9)).toBeNull();
    expect(unlikelyWeight(steady, '2026-10-08', 81.5)).toBeNull();
  });

  it('allows more the longer it has been since the last weigh-in, and anything after a long break', () => {
    expect(unlikelyWeight(steady, '2026-10-08', 89)).not.toBeNull();
    expect(unlikelyWeight(steady, '2026-10-30', 89)).toBeNull();   // 23 days: about 3.5 kg more allowed
    expect(unlikelyWeight(steady, '2027-01-15', 70)).toBeNull();   // over 60 days
  });

  it('allows a larger swing for a heavier person', () => {
    const heavy = days('2026-10-01', [150, 150.4, 149.8, 150.2]);
    expect(unlikelyWeight(heavy, '2026-10-05', 155.5)).toBeNull();  // within 4 % of 150 kg
    expect(unlikelyWeight(heavy, '2026-10-05', 158)).not.toBeNull();
  });

  it('ignores the weigh-in being replaced, and checks a date before all the others too', () => {
    const withTypo = [...steady, { id: 'x', date: '2026-10-08', kg: 94.1, updatedAt: 1 }];
    expect(unlikelyWeight(withTypo, '2026-10-08', 84.0)).toBeNull();      // fixing the typo is fine
    expect(unlikelyWeight(steady, '2026-09-30', 64.6)).not.toBeNull();
  });

  it('says nothing with fewer than two other weigh-ins', () => {
    expect(unlikelyWeight(days('2026-10-01', [84]), '2026-10-02', 99)).toBeNull();
  });
});
