import { isISODate } from '../lib/dates';

// The saved data format. Bump SCHEMA_VERSION whenever its shape changes and
// teach migrate() how to upgrade the previous version, so old data and old
// backup files keep loading.
// v1: original single-file app. v2: entry ids and timestamps. v3: app settings.
// v4: events on each profile (medication, holiday…). v5: goal steps on each profile.
// v6: body composition (body fat, muscle, water) on weigh-ins.
// v7: cycle tracking and period start days on each profile.
// v8: a unit (kg / lb / st) on each profile; AppData.unit is now the one new profiles start with.
export const SCHEMA_VERSION = 8;

export type Unit = 'kg' | 'lb' | 'st';
export type Sex = 'f' | 'm';
export type Frame = 'small' | 'medium' | 'large';
export type MeasureKey = 'waist' | 'hips' | 'chest' | 'neck' | 'arm' | 'thigh';
export type Measures = Partial<Record<MeasureKey, number>>;

export const MEASURES: ReadonlyArray<readonly [MeasureKey, string]> = [
  ['waist', 'Waist'], ['hips', 'Hips'], ['chest', 'Chest'], ['neck', 'Neck'], ['arm', 'Upper arm'], ['thigh', 'Thigh'],
];

/** What a smart scale measures besides weight. Any of them may be missing. */
export interface Composition {
  fatPct?: number;    // body fat, % of weight
  muscleKg?: number;  // muscle mass
  waterPct?: number;  // body water, % of weight
}

export interface Entry {
  id: string;
  date: string;      // YYYY-MM-DD
  kg: number;
  note?: string;
  measures?: Measures; // centimetres
  composition?: Composition;
  updatedAt: number;   // ms since epoch; lets a future sync pick the newest copy
}

export type EventKind = 'medication' | 'holiday' | 'illness' | 'training' | 'diet' | 'other';
export const EVENT_KINDS: readonly EventKind[] = ['medication', 'holiday', 'illness', 'training', 'diet', 'other'];

/** Something that may explain a change in the trend, marked on the chart. */
export interface WeightEvent {
  id: string;
  kind: EventKind;
  label: string;        // short, e.g. "Started Wegovy", "Holiday in Crete"
  start: string;        // YYYY-MM-DD
  end: string | null;   // YYYY-MM-DD, or null while it's still going / for a one-off change
  updatedAt: number;
}

/** A weight to reach on the way to the goal, optionally by a date. */
export interface GoalStep { id: string; kg: number; date: string | null }

export interface Profile {
  id: string;
  name: string;
  unit: Unit;            // how this person's weights are shown and entered
  sex: Sex;
  birthYear: number | null;
  heightCm: number | null;
  frame: Frame;
  activity: number;  // activity multiplier, see ACTIVITY in calories.ts
  goalKg: number | null;
  goalDate: string | null;
  entries: Entry[];
  events: WeightEvent[]; // oldest first
  goalSteps: GoalStep[]; // in any order; see orderedSteps()
  cycleTracking: boolean; // off by default; see src/lib/cycle.ts
  periodStarts: string[]; // YYYY-MM-DD, oldest first
  sample?: boolean;
  updatedAt: number;
}

export type Lang = 'auto' | 'en' | 'cs';
export type BadgeMode = 'off' | 'remaining' | 'reminder';
export type Theme = 'auto' | 'light' | 'dark';

/** A PIN is never stored, only a salted PBKDF2 hash of it. */
export interface PinHash { hash: string; salt: string; iterations: number; length: number }

export interface Settings {
  lang: Lang;
  theme: Theme;                                     // 'auto' follows the device's light/dark setting
  pin: PinHash | null;
  autoLockMinutes: number;                          // lock again after the app was hidden this long; 0 = immediately
  reminder: { enabled: boolean; time: string };     // "HH:MM", local time
  badge: BadgeMode;                                 // what the installed app's icon shows
  quickLog: boolean;                                // open the log dialog when today has no weigh-in yet
  lastBackupAt: number | null;                      // ms since epoch of the last full backup download
  backupSnoozeUntil: number | null;                 // "Later" on the backup reminder hides it until then
}

export const defaultSettings = (): Settings => ({
  lang: 'auto', theme: 'auto', pin: null, autoLockMinutes: 1, reminder: { enabled: false, time: '07:30' }, badge: 'off',
  quickLog: true, lastBackupAt: null, backupSnoozeUntil: null,
});

export interface AppData {
  version: typeof SCHEMA_VERSION;
  unit: Unit;
  activeId: string;
  profiles: Profile[];
  settings: Settings;
}

export const newId = (prefix = ''): string =>
  prefix + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

export function blankProfile(name = 'Me', unit: Unit = 'kg'): Profile {
  return {
    id: newId('p_'), name, unit, sex: 'f', birthYear: null, heightCm: null, frame: 'medium', activity: 1.375,
    goalKg: null, goalDate: null, entries: [], events: [], goalSteps: [], cycleTracking: false, periodStarts: [], updatedAt: Date.now(),
  };
}

export type DataErrorCode = 'notBackup' | 'newerVersion' | 'noProfiles' | 'csvEmpty' | 'csvColumns' | 'notHealth' | 'notZip';
export class DataError extends Error {
  constructor(public code: DataErrorCode, message: string) { super(message); }
}

const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function cleanMeasures(v: unknown): Measures | undefined {
  const o = obj(v);
  if (!o) return undefined;
  const out: Measures = {};
  for (const [k] of MEASURES) { const n = num(o[k]); if (n != null && n > 0 && n < 400) out[k] = n; }
  return Object.keys(out).length ? out : undefined;
}

/** Keeps only believable values: body fat 2–75 %, muscle up to the weight itself, water 20–85 %. */
export function cleanComposition(v: unknown, kg: number): Composition | undefined {
  const o = obj(v);
  if (!o) return undefined;
  const out: Composition = {};
  const fat = num(o.fatPct), muscle = num(o.muscleKg), water = num(o.waterPct);
  if (fat != null && fat >= 2 && fat <= 75) out.fatPct = fat;
  if (muscle != null && muscle >= 5 && muscle < kg) out.muscleKg = muscle;
  if (water != null && water >= 20 && water <= 85) out.waterPct = water;
  return Object.keys(out).length ? out : undefined;
}

function cleanEntry(v: unknown, now: number): Entry | null {
  const o = obj(v);
  if (!o || !isISODate(o.date)) return null;
  const kg = num(o.kg);
  if (kg == null || kg < 20 || kg > 400) return null;
  const e: Entry = { id: typeof o.id === 'string' && o.id ? o.id : newId('e_'), date: o.date, kg, updatedAt: num(o.updatedAt) ?? now };
  if (typeof o.note === 'string' && o.note.trim()) e.note = o.note.trim().slice(0, 500);
  const m = cleanMeasures(o.measures);
  if (m) e.measures = m;
  // Before v6 there was no body composition.
  const c = cleanComposition(o.composition, kg);
  if (c) e.composition = c;
  return e;
}

function cleanEvent(v: unknown, now: number): WeightEvent | null {
  const o = obj(v);
  if (!o || !isISODate(o.start) || typeof o.label !== 'string' || !o.label.trim()) return null;
  const end = isISODate(o.end) && o.end >= o.start ? o.end : null;
  return {
    id: typeof o.id === 'string' && o.id ? o.id : newId('ev_'),
    kind: EVENT_KINDS.includes(o.kind as EventKind) ? (o.kind as EventKind) : 'other',
    label: o.label.trim().slice(0, 60),
    start: o.start,
    end,
    updatedAt: num(o.updatedAt) ?? now,
  };
}

function cleanStep(v: unknown): GoalStep | null {
  const o = obj(v);
  const kg = o ? num(o.kg) : null;
  if (!o || kg == null || kg < 20 || kg > 400) return null;
  return { id: typeof o.id === 'string' && o.id ? o.id : newId('st_'), kg, date: isISODate(o.date) ? o.date : null };
}

const asUnit = (v: unknown, fallback: Unit): Unit => (v === 'kg' || v === 'lb' || v === 'st' ? v : fallback);

function cleanProfile(v: unknown, now: number, appUnit: Unit): Profile | null {
  const o = obj(v);
  if (!o) return null;
  const entries = (Array.isArray(o.entries) ? o.entries : []).map(e => cleanEntry(e, now)).filter((e): e is Entry => !!e);
  // One weigh-in per date: keep the most recently updated.
  const byDate = new Map<string, Entry>();
  for (const e of entries) { const prev = byDate.get(e.date); if (!prev || e.updatedAt >= prev.updatedAt) byDate.set(e.date, e); }
  const p: Profile = {
    id: typeof o.id === 'string' && o.id ? o.id : newId('p_'),
    name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 40) : 'Unnamed',
    // Before v8 the unit was app-wide; each profile takes it over.
    unit: asUnit(o.unit, appUnit),
    sex: o.sex === 'm' ? 'm' : 'f',
    birthYear: num(o.birthYear),
    heightCm: num(o.heightCm),
    frame: o.frame === 'small' || o.frame === 'large' ? o.frame : 'medium',
    activity: num(o.activity) ?? 1.375,
    goalKg: num(o.goalKg),
    goalDate: isISODate(o.goalDate) ? o.goalDate : null,
    entries: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    // Before v4 there were no events.
    events: (Array.isArray(o.events) ? o.events : []).map(e => cleanEvent(e, now)).filter((e): e is WeightEvent => !!e)
      .sort((a, b) => (a.start < b.start ? -1 : 1)),
    // Before v5 there were no goal steps.
    goalSteps: (Array.isArray(o.goalSteps) ? o.goalSteps : []).map(cleanStep).filter((s): s is GoalStep => !!s).slice(0, 20),
    // Before v7 there was no cycle tracking.
    cycleTracking: o.cycleTracking === true,
    periodStarts: [...new Set((Array.isArray(o.periodStarts) ? o.periodStarts : []).filter(isISODate))].sort(),
    updatedAt: num(o.updatedAt) ?? now,
  };
  if (o.sample === true) p.sample = true;
  return p;
}

function cleanSettings(v: unknown): Settings {
  const d = defaultSettings();
  const o = obj(v);
  if (!o) return d; // v1 and v2 had no settings
  const pin = obj(o.pin);
  const reminder = obj(o.reminder);
  const time = typeof reminder?.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(reminder.time) ? reminder.time : d.reminder.time;
  const lock = num(o.autoLockMinutes);
  return {
    lang: o.lang === 'en' || o.lang === 'cs' ? o.lang : 'auto',
    theme: o.theme === 'light' || o.theme === 'dark' ? o.theme : 'auto',
    pin: pin && typeof pin.hash === 'string' && typeof pin.salt === 'string' && num(pin.iterations) && [4, 5, 6].includes(num(pin.length) ?? 0)
      ? { hash: pin.hash, salt: pin.salt, iterations: num(pin.iterations)!, length: num(pin.length)! } : null,
    autoLockMinutes: lock != null && lock >= 0 && lock <= 60 ? lock : d.autoLockMinutes,
    reminder: { enabled: reminder?.enabled === true, time },
    badge: o.badge === 'remaining' || o.badge === 'reminder' ? o.badge : 'off',
    quickLog: o.quickLog !== false,
    lastBackupAt: num(o.lastBackupAt),
    backupSnoozeUntil: num(o.backupSnoozeUntil),
  };
}

/**
 * Turns anything that was saved or imported (any earlier version) into
 * valid current data. Throws DataError when it isn't Tare data at all.
 */
export function migrate(raw: unknown, now = Date.now()): AppData {
  const o = obj(raw);
  if (!o || !Array.isArray(o.profiles)) throw new DataError('notBackup', 'This file is not a Tare backup.');
  const version = num(o.version) ?? 1;
  if (version > SCHEMA_VERSION) throw new DataError('newerVersion', 'This backup comes from a newer version of Tare. Update the app and try again.');
  // v1 (the original single-file app) had no ids on entries and no timestamps;
  // cleanProfile/cleanEntry fill those in, so v1 → v2 needs no extra step.
  const unit: Unit = asUnit(o.unit, 'kg');
  const profiles = o.profiles.map(p => cleanProfile(p, now, unit)).filter((p): p is Profile => !!p);
  if (!profiles.length) throw new DataError('noProfiles', 'This backup has no profiles in it.');
  const activeId = profiles.some(p => p.id === o.activeId) ? (o.activeId as string) : profiles[0].id;
  return { version: SCHEMA_VERSION, unit, activeId, profiles, settings: cleanSettings(o.settings) };
}

export const freshData = (profiles: Profile[]): AppData => ({
  version: SCHEMA_VERSION, unit: 'kg', activeId: profiles[0].id, profiles, settings: defaultSettings(),
});
