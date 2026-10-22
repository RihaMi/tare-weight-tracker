import { MAX_DELETIONS, type AppData, type Deletion, type Entry, type Profile, type ProfileDeletion, type WeightEvent } from './schema';

// Merging a backup into what's on this device, instead of replacing it: a
// simple way to bring two devices together (#19). New profiles, weigh-ins and
// events are added; where both have the same one, the more recently changed
// copy wins. Deletes are remembered on both sides (since v10): something deleted
// on either device stays deleted, unless it was changed after the delete.
// Settings and the PIN stay as they are on this device.

export interface MergeCounts { profiles: number; entries: number; events: number; updated: number; removed: number }

const deletionKey = (d: Deletion) => (d.kind === 'entry' ? 'entry:' + d.date : 'event:' + d.id);

/** Both sides' deletions, each once with its latest time. */
function mergeDeletions<T>(a: T[], b: T[], key: (d: T) => string, at: (d: T) => number): T[] {
  const byKey = new Map<string, T>();
  for (const d of [...a, ...b]) { const k = key(d), prev = byKey.get(k); if (!prev || at(d) > at(prev)) byKey.set(k, d); }
  return [...byKey.values()].sort((x, y) => at(x) - at(y)).slice(-MAX_DELETIONS);
}

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
  p.deleted = mergeDeletions(here.deleted, there.deleted, deletionKey, d => d.at);
  const deletedAt = new Map(p.deleted.map(d => [deletionKey(d), d.at]));
  const gone = (key: string, updatedAt: number) => (deletedAt.get(key) ?? -Infinity) >= updatedAt;
  // Weigh-ins: one per date; the more recently changed one wins. One deleted after its last change stays deleted.
  const byDate = new Map(p.entries.map(e => [e.date, e]));
  for (const e of there.entries) {
    if (gone('entry:' + e.date, e.updatedAt)) continue;
    const mine = byDate.get(e.date);
    if (!mine) { byDate.set(e.date, structuredClone(e)); counts.entries++; }
    else if (e.updatedAt > mine.updatedAt && !sameEntry(e, mine)) { byDate.set(e.date, { ...structuredClone(e), id: mine.id }); counts.updated++; }
  }
  for (const [date, e] of byDate) if (gone('entry:' + date, e.updatedAt)) { byDate.delete(date); counts.removed++; }
  p.entries = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  // Events by id, the same way.
  const byId = new Map(p.events.map(e => [e.id, e]));
  for (const ev of there.events) {
    if (gone('event:' + ev.id, ev.updatedAt)) continue;
    const mine = byId.get(ev.id);
    if (!mine) { byId.set(ev.id, structuredClone(ev)); counts.events++; }
    else if (ev.updatedAt > mine.updatedAt && !sameEvent(ev, mine)) { byId.set(ev.id, structuredClone(ev)); counts.updated++; }
  }
  for (const [id, ev] of byId) if (gone('event:' + id, ev.updatedAt)) { byId.delete(id); counts.removed++; }
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
  const counts: MergeCounts = { profiles: 0, entries: 0, events: 0, updated: 0, removed: 0 };
  const data = structuredClone(current);
  data.deletedProfiles = mergeDeletions<ProfileDeletion>(current.deletedProfiles, incoming.deletedProfiles, d => d.id, d => d.at);
  const profileGone = (p: Profile) => (data.deletedProfiles.find(d => d.id === p.id)?.at ?? -Infinity) >= p.updatedAt;
  for (const there of incoming.profiles) {
    if (there.sample || profileGone(there)) continue;
    const i = data.profiles.findIndex(p => p.id === there.id);
    if (i < 0) {
      data.profiles.push(structuredClone(there));
      counts.profiles++;
      counts.entries += there.entries.length;
      counts.events += there.events.length;
    } else data.profiles[i] = mergeProfile(data.profiles[i], there, counts);
  }
  // Profiles deleted on the other device, unless changed here since, or the only one left.
  for (const p of [...data.profiles]) {
    if (!p.sample && profileGone(p) && data.profiles.length > 1) { data.profiles = data.profiles.filter(x => x !== p); counts.removed++; }
  }
  if (!data.profiles.some(p => p.id === data.activeId)) data.activeId = data.profiles[0].id;
  return { data, counts };
}

export const changedAnything = (c: MergeCounts): boolean => c.profiles + c.entries + c.events + c.updated + c.removed > 0;
