import { describe, expect, it } from 'vitest';
import { migrate } from '../data/schema';
import { aroundDates, cycleLength, nextExpected, startsFromFlowDays } from './cycle';

describe('cycle', () => {
  it('finds the typical cycle length, ignoring gaps that are not one cycle', () => {
    expect(cycleLength(['2026-07-01'])).toBeNull();
    expect(cycleLength(['2026-07-01', '2026-07-29', '2026-08-27', '2026-09-24'])).toBe(28);
    // A missed log makes a 57-day gap; it's left out.
    expect(cycleLength(['2026-07-01', '2026-08-27', '2026-09-24'])).toBe(28);
  });

  it('expects the next start one cycle after the last', () => {
    expect(nextExpected(['2026-09-24', '2026-08-27'])).toBe('2026-10-22');
    expect(nextExpected(['2026-09-24'])).toBeNull();
  });

  it('marks 3 days before to 2 days after each start', () => {
    expect([...aroundDates(['2026-10-10'])].sort()).toEqual(['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12']);
  });

  it('turns days with flow into period starts', () => {
    expect(startsFromFlowDays(['2026-08-28', '2026-08-27', '2026-08-29', '2026-09-24', '2026-09-25'])).toEqual(['2026-08-27', '2026-09-24']);
  });

  it('is saved per profile, off unless turned on, and older data upgrades without it', () => {
    const base = { version: 6, profiles: [{ id: 'p', name: 'P', entries: [] }] };
    expect(migrate(base).profiles[0]).toMatchObject({ cycleTracking: false, periodStarts: [] });
    const kept = migrate({ ...base, version: 7, profiles: [{ id: 'p', name: 'P', entries: [], cycleTracking: true, periodStarts: ['2026-09-24', 'nope', '2026-08-27', '2026-09-24'] }] });
    expect(kept.profiles[0]).toMatchObject({ cycleTracking: true, periodStarts: ['2026-08-27', '2026-09-24'] });
  });
});

describe('cycle-aware insights', () => {
  it('leaves days around a period out of the recent pace', async () => {
    const { calc } = await import('./calc');
    const { blankProfile } = await import('../data/schema');
    const { addDays } = await import('./dates');
    // Losing 0.1 kg a day, but 1.5 kg of water around a period that started 2 days before the last weigh-in.
    const entries = Array.from({ length: 30 }, (_, i) => {
      const date = addDays('2026-10-01', i);
      return { id: date, date, kg: +(80 - i * 0.1 + (i >= 25 ? 1.5 : 0)).toFixed(2), updatedAt: 0 };
    });
    const p = { ...blankProfile('P'), sex: 'f' as const, entries, goalKg: 70 };
    const off = calc(p);
    const on = calc({ ...p, cycleTracking: true, periodStarts: ['2026-10-28'] });
    expect(off.recentPerDay!).toBeGreaterThan(-0.05); // the water hides the loss
    expect(on.recentPerDay!).toBeCloseTo(-0.1, 2);    // without those days it shows
    expect(on.aroundPeriod.has('2026-10-30')).toBe(true);
    expect(on.steadyE).toHaveLength(24); // 25–30 Oct are around the period
  });

  it('reads period starts from an Apple Health export', async () => {
    const { parseHealthXML } = await import('../data/importers');
    const rec = (type: string, date: string, value: string) => ` <Record type="${type}" sourceName="Health" startDate="${date} 08:00:00 +0100" value="${value}"/>`;
    const xml = `<?xml version="1.0"?>\n<HealthData locale="en_US">\n${[
      rec('HKQuantityTypeIdentifierBodyMass', '2026-09-01', '62'),
      ...['2026-08-27', '2026-08-28', '2026-08-29'].map(d => rec('HKCategoryTypeIdentifierMenstrualFlow', d, 'HKCategoryValueMenstrualFlowMedium')),
      rec('HKCategoryTypeIdentifierMenstrualFlow', '2026-09-10', 'HKCategoryValueMenstrualFlowNone'),
      rec('HKCategoryTypeIdentifierMenstrualFlow', '2026-09-24', 'HKCategoryValueMenstrualFlowLight'),
    ].join('\n')}\n</HealthData>`;
    const p = await parseHealthXML(new ReadableStream<string>({ start(c) { c.enqueue(xml); c.close(); } }));
    expect(p.periodStarts).toEqual(['2026-08-27', '2026-09-24']);
  });
});
