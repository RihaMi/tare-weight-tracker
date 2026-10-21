import type { AppData, Entry, Profile, WeightEvent } from './schema';

// Merging a backup into what's on this device, instead of replacing it: a
// simple way to bring two devices together (#19). New profiles, weigh-ins and
// events are added; where both have the same one, the more recently changed
// copy wins. Nothing is ever deleted, so something removed here but still in
// the backup comes back. Settings and the PIN stay as they are on this device.

export interface MergeCounts { profiles: number; entries: number; events: number; updated: number }

/** Profile details (not weigh-ins or events), taken from whichever side changed the profile last. */
const DETAILS = ['name', 'unit', 'sex', 'birthYear', 'heightCm', 'frame', 'activity', 'goalKg', 'goalDate', 'goalSteps', 'cycleTracking'] as const;

const sameEntry = (a: Entry, b: Entry) => JSON.stringify({ ...a, id: '', updatedAt: 0 }) === JSON.stringify({ ...b, id: '', updatedAt: 0 });
const sameEvent = (a: WeightEvent, b: WeightEvent) => JSON.stringify({ ...a, updatedAt: 0 }) === JSON.stringify({ ...b, updatedAt: 0 });

function mergeProfile(here: Profile, there: Profile, counts: MergeCounts): Profile {
  const p: Profile = structuredClone(here);
  if (there.updatedAt > here.updatedAt) {
    const changed = DETAILS.some(k => JSON.stringify(here[k]) !== JSON.stringify(there[k]));
    for (const k of DETAILS) (p as unknown as Record<string, unknown>)[k] = structuredClone(there[k]);
    if (changed) counts.updated++;
  }
  // Weigh-ins: one per date; the more recently changed one wins.
  const byDate = new Map(p.entries.map(e => [e.date, e]));
  for (const e of there.entries) {
    const mine = byDate.get(e.date);
    if (!mine) { byDate.set(e.date, structuredClone(e)); counts.entries++; }
    else if (e.updatedAt > mine.updatedAt && !sameEntry(e, mine)) { byDate.set(e.date, { ...structuredClone(e), id: mine.id }); counts.updated++; }
  }
  p.entries = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  // Events by id, the same way.
  const byId = new Map(p.events.map(e => [e.id, e]));
  for (const ev of there.events) {
    const mine = byId.get(ev.id);
    if (!mine) { byId.set(ev.id, structuredClone(ev)); counts.events++; }
    else if (ev.updatedAt > mine.updatedAt && !sameEvent(ev, mine)) { byId.set(ev.id, structuredClone(ev)); counts.updated++; }
  }
  p.events = [...byId.values()].sort((a, b) => (a.start < b.start ? -1 : 1));
  p.periodStarts = [...new Set([...p.periodStarts, ...there.periodStarts])].sort();
  // Past goals by id; they don't change once kept.
  const goalIds = new Set(p.pastGoals.map(g => g.id));
  p.pastGoals = [...p.pastGoals, ...there.pastGoals.filter(g => !goalIds.has(g.id)).map(g => structuredClone(g))].sort((a, b) => (a.to < b.to ? -1 : 1));
  p.updatedAt = Math.max(here.updatedAt, there.updatedAt);
  return p;
}

/** `current` with `incoming` merged in, and what changed. The example profile in a backup is left out. */
export function mergeBackup(current: AppData, incoming: AppData): { data: AppData; counts: MergeCounts } {
  const counts: MergeCounts = { profiles: 0, entries: 0, events: 0, updated: 0 };
  const data = structuredClone(current);
  for (const there of incoming.profiles) {
    if (there.sample) continue;
    const i = data.profiles.findIndex(p => p.id === there.id);
    if (i < 0) {
      data.profiles.push(structuredClone(there));
      counts.profiles++;
      counts.entries += there.entries.length;
      counts.events += there.events.length;
    } else data.profiles[i] = mergeProfile(data.profiles[i], there, counts);
  }
  return { data, counts };
}

export const changedAnything = (c: MergeCounts): boolean => c.profiles + c.entries + c.events + c.updated > 0;
