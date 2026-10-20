import { describe, expect, it } from 'vitest';
import type { Entry } from '../data/schema';
import { addDays, daysBetween } from './dates';
import { goalDateRange } from './forecast';

/** Daily weigh-ins from 1 Sep 2026: `perDay` kg a day, plus a repeating wobble. */
function series(days: number, perDay: number, wobble: (d: number) => number = () => 0, start = 90): Entry[] {
  return Array.from({ length: days }, (_, d) => {
    const date = addDays('2026-09-01', d);
    return { id: date, date, kg: +(start + perDay * d + wobble(d)).toFixed(2), updatedAt: 0 };
  });
}
const width = (r: { from: string; to: string }) => daysBetween(r.from, r.to);

describe('goal date range', () => {
  it('gives a range around the date at the average pace for a steady loss', () => {
    const E = series(56, -0.5 / 7); // 0.5 kg a week for 8 weeks
    const r = goalDateRange(E, 80)!;
    expect(r.perWeekKg).toBeCloseTo(-0.5, 1);
    expect(r.from < r.mid && r.mid < r.to).toBe(true);
    // The trend is about 86.3 kg (it runs a little behind the daily weights), so
    // some 6.3 kg to go at 0.5 kg a week: about 12½ weeks.
    expect(daysBetween(E[E.length - 1].date, r.mid)).toBeGreaterThan(80);
    expect(daysBetween(E[E.length - 1].date, r.mid)).toBeLessThan(95);
  });

  it('is wider when the weekly pace is uneven', () => {
    const steady = goalDateRange(series(56, -0.5 / 7), 80)!;
    // Same average, but alternating fast and slow fortnights.
    const uneven = goalDateRange(series(56, -0.5 / 7, d => (Math.floor(d / 14) % 2 ? -0.6 : 0.6) * ((d % 14) / 14)), 80)!;
    expect(width(uneven)).toBeGreaterThan(width(steady));
  });

  it('narrows as more weeks of data come in', () => {
    // Weekly wobble big enough to widen the range beyond its ±15 % floor.
    const wobble = (d: number) => [0, 0.5, -0.4, 0.3, -0.5, 0.2, 0.4][Math.floor(d / 7) % 7] * 0.25;
    const fourE = series(28, -0.5 / 7, wobble), eightE = series(56, -0.5 / 7, wobble);
    const four = goalDateRange(fourE, 80)!, eight = goalDateRange(eightE, 80)!;
    // Relative width, since the longer series has less left to go.
    const rel = (r: NonNullable<typeof four>, E: Entry[]) => width(r) / daysBetween(E[E.length - 1].date, r.mid);
    expect(rel(eight, eightE)).toBeLessThan(rel(four, fourE));
  });

  it('works for a weight-gain goal', () => {
    const r = goalDateRange(series(42, 0.3 / 7, () => 0, 60), 66)!;
    expect(r.perWeekKg).toBeCloseTo(0.3, 1);
    expect(r.from < r.to).toBe(true);
  });

  it('gives nothing when flat, moving away, too new, reached, or too far off', () => {
    expect(goalDateRange(series(56, 0), 80)).toBeNull();
    expect(goalDateRange(series(56, 0.2 / 7), 80)).toBeNull();
    expect(goalDateRange(series(14, -0.5 / 7), 80)).toBeNull();
    // Already past the goal.
    const E = series(56, -0.5 / 7);
    expect(goalDateRange(E, E[E.length - 1].kg + 0.5)).toBeNull();
    expect(goalDateRange(series(56, -0.1 / 7), 40)).toBeNull();
  });
});
