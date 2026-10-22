import { MAX_DELETIONS, type AppData, type Profile } from '../data/schema';

// Remembering deletes, so merging a backup from another device keeps them deleted
// (src/data/merge.ts). Each is kept once, with the time of the latest delete.

export function entryDeleted(p: Profile, date: string, at = Date.now()): void {
  p.deleted = [...p.deleted.filter(d => !(d.kind === 'entry' && d.date === date)), { kind: 'entry' as const, date, at }].slice(-MAX_DELETIONS);
}

export function eventDeleted(p: Profile, id: string, at = Date.now()): void {
  p.deleted = [...p.deleted.filter(d => !(d.kind === 'event' && d.id === id)), { kind: 'event' as const, id, at }].slice(-MAX_DELETIONS);
}

export function profileDeleted(data: AppData, id: string, at = Date.now()): void {
  data.deletedProfiles = [...data.deletedProfiles.filter(d => d.id !== id), { id, at }].slice(-MAX_DELETIONS);
}

/** Undoing a profile delete: forget it, or a later merge would delete the profile again. */
export function profileRestored(data: AppData, id: string): void {
  data.deletedProfiles = data.deletedProfiles.filter(d => d.id !== id);
}
