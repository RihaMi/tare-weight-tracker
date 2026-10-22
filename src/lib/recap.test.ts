import { describe, expect, it } from 'vitest';
import type { Entry } from '../data/schema';
import { monthRecap, previousMonth } from './recap';

const e = (date: string, kg: number): Entry => ({ id: date, date, kg, updatedAt: 0 });

// End of September, then October: steady, a good week from Oct 12, then a slip.
const entries: Entry[] = [
  e('2026-09-28', 86.0), e('2026-09-30', 85.8),
  e('2026-10-01', 85.8), e('2026-10-03', 85.6), e('2026-10-06', 85.6), e('2026-10-08', 85.5),
  e('2026-10-13', 84.9), e('2026-10-15', 84.7), e('2026-10-20', 84.9), e('2026-10-22', 85.0),
  e('2026-10-27', 84.8), e('2026-10-29', 84.7),
  e('2026-11-02', 84.6),
];

describe('a month recap', () => {
  it('sums up the month: trend change, average, days logged and the best week', () => {
    const r = monthRecap(entries, '2026-10', -1)!;
    expect(r.month).toBe('2026-10');
    expect(r.changeKg).toBeLessThan(-0.5);           // the trend came down over October
    expect(r.avgKg).toBeCloseTo(85.15, 2);           // 851.5 kg over 10 weigh-ins
    expect(r).toMatchObject({ daysLogged: 10, daysInMonth: 31 });
    expect(r.bestWeek).toMatchObject({ week: '2026-10-12' });
    expect(r.bestWeek!.changeKg).toBeLessThan(0);
  });

  it('counts the best week toward the goal, so for gaining it is the week that went up most', () => {
    const r = monthRecap(entries, '2026-10', 1)!;
    expect(r.bestWeek?.week).toBe('2026-10-19');
    expect(r.bestWeek!.changeKg).toBeGreaterThan(0);
  });

  it('uses the first weigh-in of the month when there is none before it', () => {
    const october = entries.filter(x => x.date.startsWith('2026-10'));
    expect(monthRecap(october, '2026-10', -1)!.changeKg).toBeLessThan(0);
  });

  it('needs at least four weigh-ins in the month', () => {
    expect(monthRecap(entries, '2026-11', -1)).toBeNull();
    expect(monthRecap(entries, '2026-09', -1)).toBeNull();
  });

  it('knows the length of every month', () => {
    const days = (m: string) => monthRecap(['01', '02', '03', '04'].map(d => e(`${m}-${d}`, 80)), m, -1)!.daysInMonth;
    expect([days('2026-02'), days('2028-02'), days('2026-04'), days('2026-12')]).toEqual([28, 29, 30, 31]);
  });

  it('finds the previous month, across a new year too', () => {
    expect(previousMonth('2026-11-03')).toBe('2026-10');
    expect(previousMonth('2027-01-01')).toBe('2026-12');
  });
});
