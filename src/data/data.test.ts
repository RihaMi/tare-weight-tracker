import { describe, expect, it } from 'vitest';
import { mergeEntries, parseBackup, restoredData, toBackupJSON, toCSV } from './backup';
import { guessUnit, parseAnyCSV, toEntries } from './importers';
import { DataError, SCHEMA_VERSION, defaultSettings, migrate, type Profile } from './schema';
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

  it('gives older data default settings', () => {
    const d = migrate(v1);
    expect(d.settings).toEqual(defaultSettings());
  });

  it('keeps valid settings and drops invalid ones', () => {
    const pin = { hash: 'h', salt: 's', iterations: 150000, length: 4 };
    const d = migrate({ ...v1, version: 3, settings: { lang: 'cs', theme: 'dark', pin, autoLockMinutes: 5, reminder: { enabled: true, time: '06:45' }, badge: 'remaining', quickLog: false, rhythm: { weekly: true, day: 2 }, lastBackupAt: 123, backupSnoozeUntil: 456 } });
    expect(d.settings).toEqual({ lang: 'cs', theme: 'dark', pin, autoLockMinutes: 5, reminder: { enabled: true, time: '06:45' }, badge: 'remaining', quickLog: false, rhythm: { weekly: true, day: 2 }, lastBackupAt: 123, backupSnoozeUntil: 456 });
    const bad = migrate({ ...v1, version: 3, settings: { lang: 'de', theme: 'sepia', pin: { hash: 1 }, autoLockMinutes: -3, reminder: { enabled: 'yes', time: '25:00' }, badge: 'x', rhythm: { weekly: 'yes', day: 9 } } });
    expect(bad.settings).toEqual(defaultSettings());
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

  it('never puts the PIN in a backup, and keeps the device PIN on restore', () => {
    const pin = { hash: 'h', salt: 's', iterations: 1, length: 6 };
    const d = migrate(v1);
    d.settings.pin = pin;
    const restored = parseBackup(toBackupJSON(d));
    expect(restored.settings.pin).toBeNull();
    expect(restoredData(restored, d).settings.pin).toEqual(pin);
    const unlocked = migrate(v1);
    expect(restoredData({ ...restored, settings: { ...restored.settings, pin } }, unlocked).settings.pin).toBeNull();
  });

  it('explains a file that is not JSON', () => {
    expect(() => parseBackup('weight,date')).toThrow(/not a Tare backup/);
  });
});

/** Import a CSV the way the app does, accepting the suggested unit. */
const parseCSV = (text: string) => {
  const p = parseAnyCSV(text), r = toEntries(p, guessUnit(p));
  return { entries: r.entries, skipped: p.skipped + r.outOfRange };
};

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

describe('units per profile', () => {
  it('gives each profile the app-wide unit it had before, and keeps its own after', () => {
    const old = migrate({ version: 7, unit: 'st', profiles: [{ id: 'a', name: 'A', entries: [] }, { id: 'b', name: 'B', entries: [] }] });
    expect(old.profiles.map(p => p.unit)).toEqual(['st', 'st']);
    const now = migrate({ version: 8, unit: 'kg', profiles: [{ id: 'a', name: 'A', unit: 'lb', entries: [] }, { id: 'b', name: 'B', unit: 'grams', entries: [] }] });
    expect(now.profiles.map(p => p.unit)).toEqual(['lb', 'kg']);
  });
});

describe('CSV export and spreadsheet formulas', () => {
  it('keeps notes that look like formulas as text, and leaves numbers alone', () => {
    const p = sampleProfile('2026-10-20');
    p.entries = [
      { id: 'a', date: '2026-10-19', kg: 80, note: '=HYPERLINK("https://example.com","x")', updatedAt: 0 },
      { id: 'b', date: '2026-10-20', kg: 79.8, note: '-tired today', updatedAt: 0 },
      { id: 'c', date: '2026-10-21', kg: 79.6, note: '+1 kg after pizza', updatedAt: 0 },
    ];
    const lines = toCSV(p).trim().split('\n').slice(1);
    expect(lines[0]).toContain(`"'=HYPERLINK(""https://example.com"",""x"")"`);
    expect(lines[1]).toContain(",'-tired today");
    expect(lines[2]).toContain(",'+1 kg after pizza");
    expect(lines[0].startsWith('2026-10-19,80,')).toBe(true);
  });
});

describe('goal history', () => {
  it('starts empty for older data, keeps valid past goals and drops broken ones', () => {
    expect(migrate({ version: 8, unit: 'kg', profiles: [{ id: 'a', name: 'A', entries: [] }] }).profiles[0].pastGoals).toEqual([]);
    const goal = { id: 'g1', from: '2026-01-05', to: '2026-04-02', startKg: 92.4, goalKg: 85, endKg: 84.6, reached: '2026-03-03' };
    const data = migrate({ version: 9, unit: 'kg', profiles: [{ id: 'a', name: 'A', entries: [], pastGoals: [goal, { ...goal, id: 'bad', goalKg: 'x' }, { ...goal, id: 'no-date', to: 'soon' }] }] });
    expect(data.profiles[0].pastGoals).toEqual([goal]);
  });
});

describe('remembered deletes', () => {
  it('start empty for older data, and keep only valid ones', () => {
    const old = migrate({ version: 9, unit: 'kg', profiles: [{ id: 'a', name: 'A', entries: [] }] });
    expect(old.profiles[0].deleted).toEqual([]);
    expect(old.deletedProfiles).toEqual([]);
    const now = migrate({
      version: 10, unit: 'kg', deletedProfiles: [{ id: 'p1', at: 5 }, { id: '', at: 1 }],
      profiles: [{ id: 'a', name: 'A', entries: [], deleted: [{ kind: 'entry', date: '2026-10-02', at: 7 }, { kind: 'event', id: 'x', at: 3 }, { kind: 'entry', date: 'soon', at: 1 }, { kind: 'other', at: 2 }] }],
    });
    expect(now.profiles[0].deleted).toEqual([{ kind: 'event', id: 'x', at: 3 }, { kind: 'entry', date: '2026-10-02', at: 7 }]);
    expect(now.deletedProfiles).toEqual([{ id: 'p1', at: 5 }]);
  });
});
