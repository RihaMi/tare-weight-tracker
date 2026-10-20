import { describe, expect, it } from 'vitest';
import { cleanComposition, migrate, type Entry } from '../data/schema';
import { guessUnit, parseAnyCSV, parseHealthXML, toEntries } from '../data/importers';
import { toCSV } from '../data/backup';
import { addDays } from './dates';
import { compositionSummary } from './composition';

const day = (i: number, kg: number, fatPct?: number, muscleKg?: number): Entry =>
  ({ id: String(i), date: addDays('2026-01-01', i), kg, updatedAt: 0, ...(fatPct != null || muscleKg != null ? { composition: { fatPct, muscleKg } } : {}) });

describe('body composition', () => {
  it('keeps only believable values', () => {
    expect(cleanComposition({ fatPct: 24.5, muscleKg: 60, waterPct: 55 }, 84)).toEqual({ fatPct: 24.5, muscleKg: 60, waterPct: 55 });
    expect(cleanComposition({ fatPct: 90, muscleKg: 90, waterPct: 5 }, 84)).toBeUndefined();
    expect(cleanComposition('nope', 84)).toBeUndefined();
  });

  it('is saved with weigh-ins, and older data upgrades without it', () => {
    const d = migrate({ version: 5, profiles: [{ id: 'p', name: 'P', entries: [
      { date: '2026-01-01', kg: 84, composition: { fatPct: 24, muscleKg: 300 } }, { date: '2026-01-02', kg: 84 }] }] });
    expect(d.profiles[0].entries.map(e => e.composition)).toEqual([{ fatPct: 24 }, undefined]);
  });

  it('shows how much of a loss was fat and how much lean mass', () => {
    // 90 → 84 kg over 60 days while body fat goes 30 % → 26 %: fat mass 27 → ~21.8 kg.
    const E = Array.from({ length: 61 }, (_, i) => day(i, 90 - i * 0.1, 30 - (i / 60) * 4, 58 - i * 0.01));
    const s = compositionSummary(E);
    expect(s.fat!.first.value).toBe(30);
    expect(s.fat!.latest).toBeLessThan(27);
    expect(s.split!.weightChange).toBeLessThan(-5);
    // Most of the loss was fat.
    expect(s.split!.fatChange).toBeLessThan(s.split!.leanChange);
    expect(s.split!.fatChange + s.split!.leanChange).toBeCloseTo(s.split!.weightChange);
    expect(s.muscle!.values).toHaveLength(61);
    expect(s.water).toBeNull();
  });

  it('needs two body fat readings for the split', () => {
    expect(compositionSummary([day(0, 90, 30), day(1, 89.8)]).split).toBeNull();
  });
});

describe('importing body composition', () => {
  it('reads smart-scale columns from another app, skipping fat mass in kg', () => {
    const p = parseAnyCSV('Date,Weight (kg),Body Fat (%),Fat mass (kg),Muscle Mass (kg),Body Water (%),BMI\n2026-01-05,84.2,24.1,20.3,60.5,55.2,26\n');
    const [e] = toEntries(p, guessUnit(p)).entries;
    expect(e.composition).toEqual({ fatPct: 24.1, muscleKg: 60.5, waterPct: 55.2 });
  });

  it('reads Czech headers, fractions as percentages, and muscle in pounds', () => {
    const p = parseAnyCSV('Datum;Hmotnost (lb);Tělesný tuk;Svalová hmota (lb)\n5.1.2026;185,6;0,241;133,4\n');
    const [e] = toEntries(p, guessUnit(p)).entries;
    expect(e.composition!.fatPct).toBeCloseTo(24.1);
    expect(e.composition!.muscleKg).toBeCloseTo(60.5, 1);
  });

  it('round-trips through Tare\'s own CSV', () => {
    const profile = { ...migrate({ profiles: [{ id: 'p', name: 'P', entries: [] }] }).profiles[0], entries: [day(0, 84, 24.5, 60)] };
    const p = parseAnyCSV(toCSV(profile));
    expect(toEntries(p, guessUnit(p)).entries[0].composition).toEqual({ fatPct: 24.5, muscleKg: 60 });
  });

  it('takes body fat from an Apple Health export, matched to the day\'s weigh-in', async () => {
    const rec = (type: string, date: string, value: number, unit: string) =>
      ` <Record type="${type}" sourceName="Scale" unit="${unit}" startDate="${date} 07:00:00 +0100" value="${value}"/>`;
    const xml = `<?xml version="1.0"?>\n<HealthData locale="en_US">\n${[
      rec('HKQuantityTypeIdentifierBodyMass', '2026-01-05', 84.2, 'kg'),
      rec('HKQuantityTypeIdentifierBodyFatPercentage', '2026-01-05', 0.241, '%'),
      rec('HKQuantityTypeIdentifierBodyFatPercentage', '2026-01-06', 0.24, '%'), // no weigh-in that day
    ].join('\n')}\n</HealthData>`;
    const stream = new ReadableStream<string>({ start(c) { c.enqueue(xml); c.close(); } });
    const p = await parseHealthXML(stream);
    expect(p.rows).toHaveLength(1);
    expect(toEntries(p, 'kg').entries[0].composition).toEqual({ fatPct: 24.1 });
  });
});
