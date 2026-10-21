import type { AppData } from '../data/schema';

// Browsers may clear a site's saved data when the device runs low on space. Persistent
// storage stops that. It's asked for only once there's something of the person's own to keep:
// Firefox shows a prompt for it, which on a first visit, with only the example, makes no sense.

type KeepState = 'unknown' | 'kept' | 'notKept';
let state: KeepState = 'unknown';
let checked: Promise<void> | null = null;
let asked = false;

export const keepState = (): KeepState => state;

function check(): Promise<void> {
  return checked ??= (async () => {
    try { if (navigator.storage?.persisted) state = (await navigator.storage.persisted()) ? 'kept' : 'notKept'; } catch { /* unknown */ }
  })();
}

/** Asks once per visit, when there are weigh-ins to keep. True when the answer changed what Profile shows. */
export async function askToKeep(data: AppData): Promise<boolean> {
  const before = state;
  await check();
  if (!asked && state === 'notKept' && data.profiles.some(p => !p.sample && p.entries.length)) {
    asked = true;
    try { if (await navigator.storage.persist()) state = 'kept'; } catch { /* stays notKept */ }
  }
  return state !== before;
}
