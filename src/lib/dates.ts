import { formatLocale } from './format';

// Dates are stored as ISO "YYYY-MM-DD" strings and handled in UTC so a
// weigh-in never shifts to another day when the time zone changes.

export const DAY = 864e5;

export const toD = (s: string): Date => new Date(s + 'T00:00:00Z');
export const iso = (d: Date): string => d.toISOString().slice(0, 10);

export function todayISO(now: Date = new Date()): string {
  return iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export const daysBetween = (a: string, b: string): number =>
  Math.round((toD(b).getTime() - toD(a).getTime()) / DAY);

export const addDays = (s: string, n: number): string => iso(new Date(toD(s).getTime() + n * DAY));

export function fmtDate(s: string, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  return toD(s).toLocaleDateString(formatLocale(), { ...o, timeZone: 'UTC' });
}

/** A real calendar date as YYYY-MM-DD. Rejects dates like 2026-02-30, which Date would quietly roll over to March. */
export const isISODate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(toD(s).getTime()) && iso(toD(s)) === s;
