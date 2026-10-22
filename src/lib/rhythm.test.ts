import { describe, expect, it } from 'vitest';
import { isWeighDay, nextWeighDay, weekdayOf, weighInDue } from './rhythm';

const daily = { weekly: false, day: 0 };
const mondays = { weekly: true, day: 0 };
const sundays = { weekly: true, day: 6 };

describe('weigh-in rhythm', () => {
  it('knows the day of the week, Monday first', () => {
    expect(['2026-10-19', '2026-10-21', '2026-10-25'].map(weekdayOf)).toEqual([0, 2, 6]);   // Mon, Wed, Sun
  });

  it('weighs in every day, or only on the chosen day', () => {
    expect(isWeighDay(daily, '2026-10-21')).toBe(true);
    expect(isWeighDay(mondays, '2026-10-19')).toBe(true);
    expect(isWeighDay(mondays, '2026-10-21')).toBe(false);
    expect(isWeighDay(sundays, '2026-10-25')).toBe(true);
  });

  it('asks for a weigh-in only on a weigh day without one yet', () => {
    const logged = [{ date: '2026-10-19' }];
    expect(weighInDue(mondays, [], '2026-10-19')).toBe(true);
    expect(weighInDue(mondays, logged, '2026-10-19')).toBe(false);
    expect(weighInDue(mondays, [], '2026-10-20')).toBe(false);   // Tuesday: not due when weighing on Mondays
    expect(weighInDue(daily, logged, '2026-10-20')).toBe(true);
  });

  it('finds the next weigh day, today included', () => {
    expect(nextWeighDay(mondays, '2026-10-19')).toBe('2026-10-19');
    expect(nextWeighDay(mondays, '2026-10-21')).toBe('2026-10-26');
    expect(nextWeighDay(sundays, '2026-10-21')).toBe('2026-10-25');
    expect(nextWeighDay(daily, '2026-10-21')).toBe('2026-10-21');
  });
});
