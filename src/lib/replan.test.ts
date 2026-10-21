import { describe, expect, it } from 'vitest';
import type { Entry, Profile } from '../data/schema';
import { calc } from './calc';
import { addDays } from './dates';
import { replan } from './replan';

const TODAY = '2026-10-20';

/** A weigh-in every day for `days` days up to `end`, changing by `perWeek` kg a week from `startKg`. */
function daily(startKg: number, perWeek: number, days: number, end = TODAY): Entry[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(end, i - days + 1);
    return { id: date, date, kg: +(startKg + (perWeek / 7) * i).toFixed(2), updatedAt: 0 };
  });
}

function profile(entries: Entry[], goalDate: string, goalKg = 80): Profile {
  return {
    id: 'p', name: 'Test', unit: 'kg', sex: 'm', birthYear: 1988, heightCm: 180, frame: 'medium', activity: 1.375,
    goalKg, goalDate, updatedAt: 0, events: [], goalSteps: [], cycleTracking: false, periodStarts: [], pastGoals: [], entries,
  };
}
const plan = (p: Profile) => replan(p.goalKg ?? undefined, p.goalDate ?? undefined, calc(p, new Date(TODAY + 'T12:00:00Z')), TODAY);

describe('re-planning a goal that has fallen behind', () => {
  it('shows the pace the date now needs, and a later date at the recent pace', () => {
    const p = profile(daily(90, -0.25, 80), '2026-12-31');      // about 87.2 kg now, 7.2 kg to go in 10 weeks
    const r = plan(p)!;
    expect(r.basis).toBe('recent');
    expect(r.perWeekKg).toBeCloseTo(0.25, 1);
    expect(r.needPerWeekKg).toBeCloseTo(0.7, 1);
    expect(r.tooFast).toBe(false);
    expect(r.newDate > '2027-04-01').toBe(true);
  });

  it('says when keeping the date would take an unhealthy pace', () => {
    const r = plan(profile(daily(90, -0.25, 80), '2026-11-15'))!;
    expect(r.needPerWeekKg!).toBeGreaterThan(1);
    expect(r.tooFast).toBe(true);
  });

  it('falls back to a steady pace when the trend is going the wrong way', () => {
    const r = plan(profile(daily(86, 0.2, 60), '2026-12-31'))!;
    expect(r.basis).toBe('steady');
    expect(r.perWeekKg).toBe(0.5);
    expect(r.newDate).toBe(addDays(TODAY, Math.ceil(((86 + (0.2 / 7) * 59) - 80) / 0.5 * 7)));
  });

  it('offers a new date once the goal date has passed, without a pace for the old one', () => {
    const r = plan(profile(daily(90, -0.25, 80), '2026-10-01'))!;
    expect(r.needPerWeekKg).toBeNull();
    expect(r.tooFast).toBe(false);
    expect(r.newDate > TODAY).toBe(true);
  });

  it('says nothing when on pace, with under three weeks of data, or with no recent weigh-in', () => {
    expect(plan(profile(daily(90, -0.6, 80), '2026-12-31'))).toBeNull();   // 83.1 kg now: on pace, not yet there
    expect(plan(profile(daily(90, -0.25, 14), '2026-12-31'))).toBeNull();
    expect(plan(profile(daily(90, -0.25, 80, '2026-09-30'), '2026-12-31'))).toBeNull();
  });

  it('says nothing without a goal date', () => {
    expect(replan(80, undefined, calc(profile(daily(90, -0.25, 80), '2026-12-31')), TODAY)).toBeNull();
  });
});
