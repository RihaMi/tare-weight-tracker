import { describe, expect, it } from 'vitest';
import { blankProfile, freshData, type Entry, type Profile } from './schema';
import { sampleProfile } from './sample';
import { mergeBackup } from './merge';

const e = (date: string, kg: number, updatedAt = 1, id = date): Entry => ({ id, date, kg, updatedAt });
const prof = (id: string, entries: Entry[], over: Partial<Profile> = {}): Profile => ({ ...blankProfile('P'), id, entries, updatedAt: 1, ...over });

describe('merging a backup', () => {
  it('adds new profiles and new weigh-ins, and keeps what is only here', () => {
    const here = freshData([prof('a', [e('2026-10-01', 80), e('2026-10-02', 79.8)])]);
    const there = freshData([prof('a', [e('2026-10-02', 79.8), e('2026-10-03', 79.6)]), prof('b', [e('2026-10-01', 60)])]);
    const { data, counts } = mergeBackup(here, there);
    expect(data.profiles.map(p => p.id)).toEqual(['a', 'b']);
    expect(data.profiles[0].entries.map(x => x.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(counts).toEqual({ profiles: 1, entries: 2, events: 0, updated: 0, removed: 0 });
  });

  it('takes the more recently changed weigh-in for the same date, keeping its id here', () => {
    const here = freshData([prof('a', [e('2026-10-01', 80, 5, 'mine'), e('2026-10-02', 79, 9, 'mine2')])]);
    const there = freshData([prof('a', [e('2026-10-01', 80.4, 7, 'theirs'), e('2026-10-02', 78, 3, 'theirs2')])]);
    const { data, counts } = mergeBackup(here, there);
    expect(data.profiles[0].entries.map(x => [x.id, x.kg])).toEqual([['mine', 80.4], ['mine2', 79]]);
    expect(counts.updated).toBe(1);
  });

  it('takes profile details from the side changed last, and combines period starts and events', () => {
    const ev = (id: string, label: string, updatedAt: number) => ({ id, kind: 'holiday' as const, label, start: '2026-09-01', end: null, updatedAt });
    const here = freshData([prof('a', [], { name: 'Old name', goalKg: 70, updatedAt: 1, periodStarts: ['2026-09-01'], events: [ev('x', 'Crete', 1)] })]);
    const there = freshData([prof('a', [], { name: 'New name', goalKg: 68, updatedAt: 2, periodStarts: ['2026-09-29'], events: [ev('x', 'Crete trip', 2), ev('y', 'Rome', 2)] })]);
    const { data, counts } = mergeBackup(here, there);
    expect(data.profiles[0]).toMatchObject({ name: 'New name', goalKg: 68, periodStarts: ['2026-09-01', '2026-09-29'] });
    expect(data.profiles[0].events.map(x => x.label)).toEqual(['Crete trip', 'Rome']);
    expect(counts).toMatchObject({ events: 1, updated: 2 });
  });

  it('leaves settings alone, ignores the example in the backup, and never deletes', () => {
    const here = freshData([prof('a', [e('2026-10-01', 80)])]);
    here.settings.theme = 'dark';
    const there = freshData([sampleProfile('2026-10-20'), prof('a', [])]);
    there.settings.theme = 'light';
    const { data, counts } = mergeBackup(here, there);
    expect(data.settings.theme).toBe('dark');
    expect(data.profiles.map(p => p.id)).toEqual(['a']);
    expect(data.profiles[0].entries).toHaveLength(1);
    expect(counts).toEqual({ profiles: 0, entries: 0, events: 0, updated: 0, removed: 0 });
  });

  it('adds past goals from the backup by id, keeping the ones here', () => {
    const g = (id: string, to: string) => ({ id, from: '2026-01-01', to, startKg: 90, goalKg: 85, endKg: 86, reached: null });
    const here = freshData([prof('a', [], { pastGoals: [g('g1', '2026-03-01')] })]);
    const there = freshData([prof('a', [], { pastGoals: [g('g1', '2026-03-01'), g('g0', '2026-02-01')] })]);
    expect(mergeBackup(here, there).data.profiles[0].pastGoals.map(x => x.id)).toEqual(['g0', 'g1']);
  });

  describe('with deletes remembered', () => {
    const ev = (id: string, updatedAt: number) => ({ id, kind: 'holiday' as const, label: id, start: '2026-09-01', end: null, updatedAt });

    it('keeps a weigh-in deleted here deleted, unless the backup changed it after the delete', () => {
      const here = freshData([prof('a', [e('2026-10-01', 80, 1)], { deleted: [{ kind: 'entry', date: '2026-10-02', at: 5 }, { kind: 'entry', date: '2026-10-03', at: 5 }] })]);
      const there = freshData([prof('a', [e('2026-10-01', 80, 1), e('2026-10-02', 79.8, 3), e('2026-10-03', 79.6, 9)])]);
      const { data, counts } = mergeBackup(here, there);
      expect(data.profiles[0].entries.map(x => x.date)).toEqual(['2026-10-01', '2026-10-03']);   // the 3rd changed after
      expect(counts).toMatchObject({ entries: 1, removed: 0 });
    });

    it('deletes here what was deleted on the other device, unless changed here after', () => {
      const here = freshData([prof('a', [e('2026-10-01', 80, 1), e('2026-10-02', 79.8, 3), e('2026-10-03', 79.6, 9)], { events: [ev('x', 2)] })]);
      const there = freshData([prof('a', [e('2026-10-01', 80, 1)], { deleted: [{ kind: 'entry', date: '2026-10-02', at: 5 }, { kind: 'entry', date: '2026-10-03', at: 5 }, { kind: 'event', id: 'x', at: 5 }] })]);
      const { data, counts } = mergeBackup(here, there);
      expect(data.profiles[0].entries.map(x => x.date)).toEqual(['2026-10-01', '2026-10-03']);
      expect(data.profiles[0].events).toEqual([]);
      expect(counts.removed).toBe(2);
      expect(data.profiles[0].deleted.length).toBe(3);   // remembered here too, for the next merge
    });

    it('keeps a deleted profile deleted, and deletes one deleted on the other device, but never the last', () => {
      const here = freshData([prof('a', []), prof('b', [], { updatedAt: 1 })]);
      here.deletedProfiles = [{ id: 'c', at: 10 }];
      const there = freshData([prof('a', []), prof('c', [], { updatedAt: 5 })]);
      there.deletedProfiles = [{ id: 'b', at: 10 }];
      const { data, counts } = mergeBackup(here, there);
      expect(data.profiles.map(p => p.id)).toEqual(['a']);
      expect(counts).toMatchObject({ profiles: 0, removed: 1 });
      expect(data.deletedProfiles.map(d => d.id).sort()).toEqual(['b', 'c']);

    });

    it('never deletes the last profile here', () => {
      const only = freshData([prof('b', [], { updatedAt: 1 })]);
      const there = freshData([sampleProfile('2026-10-20')]);   // the example is always left out
      there.deletedProfiles = [{ id: 'b', at: 10 }];
      const { data, counts } = mergeBackup(only, there);
      expect(data.profiles.map(p => p.id)).toEqual(['b']);
      expect(counts.removed).toBe(0);
    });
  });

  it('adds past goals from the backup by id, keeping the ones here', () => {
    const g = (id: string, to: string) => ({ id, from: '2026-01-01', to, startKg: 90, goalKg: 85, endKg: 86, reached: null });
    const here = freshData([prof('a', [], { pastGoals: [g('g1', '2026-03-01')] })]);
    const there = freshData([prof('a', [], { pastGoals: [g('g1', '2026-03-01'), g('g0', '2026-02-01')] })]);
    expect(mergeBackup(here, there).data.profiles[0].pastGoals.map(x => x.id)).toEqual(['g0', 'g1']);
  });
});
