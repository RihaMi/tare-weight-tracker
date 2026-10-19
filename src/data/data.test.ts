import { describe, expect, it } from 'vitest';
import { mergeEntries, parseBackup, parseCSV, toBackupJSON, toCSV } from './backup';
import { DataError, SCHEMA_VERSION, migrate, type Profile } from './schema';
import { sampleProfile } from './sample';

// Data saved by the original single-file version (no version number, entries without ids).
const v1 = {
  unit: 'lb',
  activeId: 'pA',
  profiles: [{
    id: 'pA', name: 'Alex', sex: 'm', birthYear: 1990, heightCm: 180, frame: 'medium', activity: 1.375, goalKg: 80, goalDate: '2026-12-01',
    entries: [
      { date: '2026-01-02', kg: 90.5, note: 'hi' },
      { date: '2026-01-01', kg: 91 },
      { date: '2026-01-01', kg: 91.2 },
      { date: 'not a date', kg: 90 },
      { date: '2026-01-03', kg: 5 },
      { date: '2026-01-04', kg: 90, measures: { waist: 100, neck: 'x' } },
    ],
  }],
};

describe('migrate', () => {
  it('upgrades version 1 data', () => {
    const d = migrate(v1, 1000);
    expect(d.version).toBe(SCHEMA_VERSION);
    expect(d.unit).toBe('lb');
    const e = d.profiles[0].entries;
    expect(e.map(x => x.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-04']);
    expect(e.every(x => x.id && x.updatedAt === 1000)).toBe(true);
    expect(e[2].measures).toEqual({ waist: 100 });
  });

  it('rejects files that are not Tare data', () => {
    expect(() => migrate(null)).toThrow(DataError);
    expect(() => migrate({ hello: 1 })).toThrow(DataError);
    expect(() => migrate({ profiles: [] })).toThrow(/no profiles/);
  });

  it('rejects backups from a newer version', () => {
    expect(() => migrate({ ...v1, version: SCHEMA_VERSION + 1 })).toThrow(/newer version/);
  });

  it('falls back to the first profile when the active one is missing', () => {
    expect(migrate({ ...v1, activeId: 'gone' }).activeId).toBe('pA');
  });

  it('accepts the built-in example profile', () => {
    const d = migrate({ version: 2, unit: 'kg', activeId: 'sample', profiles: [sampleProfile('2026-10-19')] });
    expect(d.profiles[0].sample).toBe(true);
    expect(d.profiles[0].entries.length).toBeGreaterThan(40);
  });
});

describe('backup files', () => {
  it('round-trips a full backup', () => {
    const d = migrate(v1);
    expect(parseBackup(toBackupJSON(d))).toEqual(d);
  });

  it('explains a file that is not JSON', () => {
    expect(() => parseBackup('weight,date')).toThrow(/not a Tare backup/);
  });
});

describe('CSV', () => {
  const p: Profile = migrate(v1).profiles[0];
  p.entries[0].note = 'Dinner, "big" one; ok';

  it('round-trips weigh-ins, notes and measurements', () => {
    const { entries, skipped } = parseCSV(toCSV(p));
    expect(skipped).toBe(0);
    expect(entries.map(e => [e.date, e.kg, e.note ?? null])).toEqual(p.entries.map(e => [e.date, e.kg, e.note ?? null]));
    expect(entries[2].measures).toEqual({ waist: 100 });
  });

  it('reads semicolon files with pounds and decimal commas', () => {
    const { entries } = parseCSV('Date;Weight_lb\r\n2026-03-01;"176,4"\r\n2026-03-02;176\r\n');
    expect(entries).toHaveLength(2);
    expect(entries[0].kg).toBeCloseTo(80.01, 1);
  });

  it('skips unusable rows and reports them', () => {
    const r = parseCSV('date,weight_kg\n2026-03-01,80\nyesterday,80\n2026-03-03,\n');
    expect(r.entries).toHaveLength(1);
    expect(r.skipped).toBe(2);
  });

  it('needs date and weight columns', () => {
    expect(() => parseCSV('when,how much\n1,2\n')).toThrow(/date/);
  });

  it('merges by date, replacing same-day weigh-ins', () => {
    const target = structuredClone(p);
    const { entries } = parseCSV('date,weight_kg\n2026-01-01,88\n2026-05-01,85\n');
    expect(mergeEntries(target, entries)).toEqual({ added: 1, replaced: 1 });
    expect(target.entries.find(e => e.date === '2026-01-01')?.kg).toBe(88);
    expect(target.entries.find(e => e.date === '2026-01-01')?.id).toBe(p.entries[0].id);
  });
});
