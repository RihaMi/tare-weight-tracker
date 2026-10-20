import { describe, expect, it } from 'vitest';
import type { Entry } from '../data/schema';
import { addDays } from './dates';
import { maintenance, maintenanceBand, milestones } from './insights';

/** Daily weigh-ins from 1 Jan 2026, given as a function of the day. */
const days = (n: number, kg: (d: number) => number): Entry[] =>
  Array.from({ length: n }, (_, d) => { const date = addDays('2026-01-01', d); return { id: date, date, kg: +kg(d).toFixed(2), updatedAt: 0 }; });

// Down from 90 to 80 over 50 days, then `after(d)` for the rest.
const journey = (total: number, after: (d: number) => number) => days(total, d => (d <= 50 ? 90 - d * 0.2 : after(d)));

describe('maintenance', () => {
  it('uses a range of ±2 % of the goal, at least 1 kg', () => {
    expect(maintenanceBand(80)).toBeCloseTo(1.6);
    expect(maintenanceBand(45)).toBe(1);
  });

  it('waits until the goal is reached and the trend has come into the range', () => {
    // Weekly weigh-ins dropping fast: 80 is reached, but the smoothed trend is still well above.
    const fast: Entry[] = [90, 85, 80].map((kg, i) => ({ id: String(i), date: addDays('2026-01-01', i * 7), kg, updatedAt: 0 }));
    expect(maintenance(fast, 80)).toBeNull();
    // Coming down steadily, the trend enters the range before the goal itself: not yet maintaining.
    expect(maintenance(days(45, d => 90 - d * 0.2), 80)).toBeNull();
  });

  it('counts the days in a row the trend stays in the range', () => {
    const m = maintenance(journey(100, () => 80.3), 80)!;
    expect(m.inBand).toBe(true);
    expect(m.streakDays).toBeGreaterThan(40);
    expect(m.milestones.map(x => x.days)).toEqual([28]);
  });

  it('notices when the trend drifts above the range, and starts counting again', () => {
    const m = maintenance(journey(120, d => (d < 100 ? 80 : 83)), 80)!;
    expect(m.inBand).toBe(false);
    expect(m.offKg).toBeGreaterThan(m.bandKg);
    expect(m.streakDays).toBe(0);
  });

  it('adds time at the goal to the milestones', () => {
    const { achieved, next } = milestones({ entries: journey(160, () => 80), goalKg: 80, heightCm: null, unit: 'kg' });
    expect(next).toBeNull();
    expect(achieved.filter(m => m.kind === 'maintain').map(m => m.key)).toEqual(['m28', 'm91']);
    // Still in date order.
    expect(achieved.map(m => m.date)).toEqual([...achieved.map(m => m.date)].sort());
  });
});
