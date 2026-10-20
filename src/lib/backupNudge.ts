import type { AppData } from '../data/schema';

// When to remind people to download a backup. Tare keeps data only in the
// browser, so a backup is the only copy that survives clearing it.

const DAY = 864e5;
/** Wait this long after the first real weigh-in before the first reminder. */
export const FIRST_NUDGE_DAYS = 14;
/** Remind again when the last backup is this old. */
export const STALE_DAYS = 30;
/** Need at least this many real weigh-ins before it's worth bothering anyone. */
const MIN_ENTRIES = 5;

export type BackupNudge = { kind: 'never' } | { kind: 'stale'; days: number } | null;

export function backupNudge(data: AppData, now = Date.now()): BackupNudge {
  const s = data.settings;
  if (s.backupSnoozeUntil && s.backupSnoozeUntil > now) return null;
  const entries = data.profiles.filter(p => !p.sample).flatMap(p => p.entries);
  if (entries.length < MIN_ENTRIES) return null;
  if (s.lastBackupAt == null) {
    const firstLogged = Math.min(...entries.map(e => e.updatedAt));
    return now - firstLogged >= FIRST_NUDGE_DAYS * DAY ? { kind: 'never' } : null;
  }
  const days = Math.floor((now - s.lastBackupAt) / DAY);
  return days >= STALE_DAYS ? { kind: 'stale', days } : null;
}

/** iPhone/iPad Safari deletes a site's storage after 7 days without a visit, unless it's added to the Home Screen. */
export function isIOSBrowserTab(nav: Navigator = navigator, standalone = matchMedia('(display-mode: standalone)').matches): boolean {
  const ios = /iP(hone|ad|od)/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  return ios && !standalone && !(nav as Navigator & { standalone?: boolean }).standalone;
}
