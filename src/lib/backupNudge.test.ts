import { describe, expect, it } from 'vitest';
import { defaultSettings, type AppData, type Entry, type Profile } from '../data/schema';
import { backupNudge } from './backupNudge';

const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 20, 12);
const entries = (n: number, loggedDaysAgo: number): Entry[] =>
  Array.from({ length: n }, (_, i) => ({ id: `e${i}`, date: `2026-09-${String(i + 1).padStart(2, '0')}`, kg: 80, updatedAt: NOW - loggedDaysAgo * DAY }));
const profile = (e: Entry[], sample = false): Profile => ({
  id: sample ? 'sample' : 'p', name: 'P', unit: 'kg', sex: 'm', birthYear: null, heightCm: null, frame: 'medium', activity: 1.375,
  goalKg: null, goalDate: null, entries: e, events: [], goalSteps: [], cycleTracking: false, periodStarts: [], pastGoals: [], updatedAt: 0, ...(sample ? { sample: true } : {}),
});
const data = (profiles: Profile[], s: Partial<AppData['settings']> = {}): AppData =>
  ({ version: 9, unit: 'kg', activeId: profiles[0].id, profiles, settings: { ...defaultSettings(), ...s } });

describe('backup reminder', () => {
  it('waits for real data: none for the example profile or a handful of entries', () => {
    expect(backupNudge(data([profile(entries(50, 60), true)]), NOW)).toBeNull();
    expect(backupNudge(data([profile(entries(4, 60))]), NOW)).toBeNull();
  });

  it('asks for a first backup two weeks after logging started', () => {
    expect(backupNudge(data([profile(entries(10, 13))]), NOW)).toBeNull();
    expect(backupNudge(data([profile(entries(10, 14))]), NOW)).toEqual({ kind: 'never' });
  });

  it('reminds again when the last backup is 30 days old', () => {
    expect(backupNudge(data([profile(entries(10, 90))], { lastBackupAt: NOW - 29 * DAY }), NOW)).toBeNull();
    expect(backupNudge(data([profile(entries(10, 90))], { lastBackupAt: NOW - 34 * DAY }), NOW)).toEqual({ kind: 'stale', days: 34 });
  });

  it('stays quiet while snoozed', () => {
    const d = data([profile(entries(10, 90))], { backupSnoozeUntil: NOW + DAY });
    expect(backupNudge(d, NOW)).toBeNull();
    expect(backupNudge(d, NOW + 2 * DAY)).toEqual({ kind: 'never' });
  });
});
