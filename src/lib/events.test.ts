import { describe, expect, it } from 'vitest';
import { migrate, type Entry, type WeightEvent } from '../data/schema';
import { addDays } from './dates';
import { eventEffect, eventsOn } from './events';

const ev = (start: string, end: string | null = null, over: Partial<WeightEvent> = {}): WeightEvent =>
  ({ id: 'ev', kind: 'medication', label: 'Started medication', start, end, updatedAt: 0, ...over });

/** Daily weigh-ins from 1 Jul 2026: flat for `flatDays`, then losing `perWeek` kg a week. */
function series(flatDays: number, days: number, perWeek: number): Entry[] {
  return Array.from({ length: days }, (_, d) => {
    const date = addDays('2026-07-01', d);
    return { id: date, date, kg: +(90 + (d > flatDays ? (perWeek / 7) * (d - flatDays) : 0)).toFixed(2), updatedAt: 0 };
  });
}

describe('events', () => {
  it('knows which events cover a date', () => {
    const away = ev('2026-08-01', '2026-08-03', { id: 'a' }), meds = ev('2026-08-02', null, { id: 'm' });
    expect(eventsOn([away, meds], '2026-07-31')).toEqual([]);
    expect(eventsOn([away, meds], '2026-08-02').map(e => e.id)).toEqual(['a', 'm']);
    expect(eventsOn([away, meds], '2026-12-24').map(e => e.id)).toEqual(['m']);
  });

  it('compares the trend before and after an event started', () => {
    // Flat for 5 weeks, then 0.5 kg a week down after starting medication.
    const E = series(35, 35 + 70, -0.5);
    const fx = eventEffect(E, ev(E[35].date))!;
    expect(fx.weeksBefore).toBe(4);
    expect(fx.weeksAfter).toBe(9);
    expect(fx.beforePerWeek).toBeCloseTo(0, 1);
    expect(fx.afterPerWeek).toBeCloseTo(-0.5, 1);
  });

  it('stops at the end of an event that ended', () => {
    const E = series(35, 35 + 70, -0.5);
    expect(eventEffect(E, ev(E[35].date, E[35 + 27].date))!.weeksAfter).toBe(3);
  });

  it('says nothing with under 3 weeks on either side', () => {
    const E = series(35, 35 + 70, -0.5);
    expect(eventEffect(E, ev(E[14].date))).toBeNull();   // only 2 weeks before
    expect(eventEffect(E, ev(E[90].date))).toBeNull();   // only 2 weeks since
  });
});

describe('events in saved data', () => {
  const base = { version: 3, unit: 'kg', profiles: [{ id: 'p', name: 'P', entries: [{ date: '2026-07-01', kg: 80 }] }] };

  it('upgrades older data with no events', () => {
    const d = migrate(base);
    expect(d.version).toBe(4);
    expect(d.profiles[0].events).toEqual([]);
  });

  it('keeps valid events in date order and drops broken ones', () => {
    const d = migrate({ ...base, version: 4, profiles: [{ ...base.profiles[0], events: [
      { id: 'b', kind: 'holiday', label: ' Crete ', start: '2026-08-10', end: '2026-08-17', updatedAt: 1 },
      { id: 'a', kind: 'nonsense', label: 'Started running', start: '2026-07-20', end: '2026-07-01' },
      { id: 'x', kind: 'illness', label: '', start: '2026-07-05' },
      { id: 'y', kind: 'illness', label: 'Flu', start: '2026-02-30' },
    ] }] });
    expect(d.profiles[0].events.map(e => [e.id, e.kind, e.label, e.start, e.end])).toEqual([
      ['a', 'other', 'Started running', '2026-07-20', null], // unknown kind → other; an end before the start is dropped
      ['b', 'holiday', 'Crete', '2026-08-10', '2026-08-17'],
    ]);
  });
});
