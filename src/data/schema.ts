import { isISODate } from '../lib/dates';

// The saved data format. Bump SCHEMA_VERSION whenever its shape changes and
// teach migrate() how to upgrade the previous version, so old data and old
// backup files keep loading.
export const SCHEMA_VERSION = 2;

export type Unit = 'kg' | 'lb' | 'st';
export type Sex = 'f' | 'm';
export type Frame = 'small' | 'medium' | 'large';
export type MeasureKey = 'waist' | 'hips' | 'chest' | 'neck' | 'arm' | 'thigh';
export type Measures = Partial<Record<MeasureKey, number>>;

export const MEASURES: ReadonlyArray<readonly [MeasureKey, string]> = [
  ['waist', 'Waist'], ['hips', 'Hips'], ['chest', 'Chest'], ['neck', 'Neck'], ['arm', 'Upper arm'], ['thigh', 'Thigh'],
];

export interface Entry {
  id: string;
  date: string;      // YYYY-MM-DD
  kg: number;
  note?: string;
  measures?: Measures; // centimetres
  updatedAt: number;   // ms since epoch; lets a future sync pick the newest copy
}

export interface Profile {
  id: string;
  name: string;
  sex: Sex;
  birthYear: number | null;
  heightCm: number | null;
  frame: Frame;
  activity: number;  // activity multiplier, see ACTIVITY in calories.ts
  goalKg: number | null;
  goalDate: string | null;
  entries: Entry[];
  sample?: boolean;
  updatedAt: number;
}

export interface AppData {
  version: typeof SCHEMA_VERSION;
  unit: Unit;
  activeId: string;
  profiles: Profile[];
}

export const newId = (prefix = ''): string =>
  prefix + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

export function blankProfile(name = 'Me'): Profile {
  return {
    id: newId('p_'), name, sex: 'f', birthYear: null, heightCm: null, frame: 'medium', activity: 1.375,
    goalKg: null, goalDate: null, entries: [], updatedAt: Date.now(),
  };
}

export class DataError extends Error {}

const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function cleanMeasures(v: unknown): Measures | undefined {
  const o = obj(v);
  if (!o) return undefined;
  const out: Measures = {};
  for (const [k] of MEASURES) { const n = num(o[k]); if (n != null && n > 0 && n < 400) out[k] = n; }
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
  return e;
}

function cleanProfile(v: unknown, now: number): Profile | null {
  const o = obj(v);
  if (!o) return null;
  const entries = (Array.isArray(o.entries) ? o.entries : []).map(e => cleanEntry(e, now)).filter((e): e is Entry => !!e);
  // One weigh-in per date: keep the most recently updated.
  const byDate = new Map<string, Entry>();
  for (const e of entries) { const prev = byDate.get(e.date); if (!prev || e.updatedAt >= prev.updatedAt) byDate.set(e.date, e); }
  const p: Profile = {
    id: typeof o.id === 'string' && o.id ? o.id : newId('p_'),
    name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 40) : 'Unnamed',
    sex: o.sex === 'm' ? 'm' : 'f',
    birthYear: num(o.birthYear),
    heightCm: num(o.heightCm),
    frame: o.frame === 'small' || o.frame === 'large' ? o.frame : 'medium',
    activity: num(o.activity) ?? 1.375,
    goalKg: num(o.goalKg),
    goalDate: isISODate(o.goalDate) ? o.goalDate : null,
    entries: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    updatedAt: num(o.updatedAt) ?? now,
  };
  if (o.sample === true) p.sample = true;
  return p;
}

/**
 * Turns anything that was saved or imported (any earlier version) into
 * valid current data. Throws DataError when it isn't Tare data at all.
 */
export function migrate(raw: unknown, now = Date.now()): AppData {
  const o = obj(raw);
  if (!o || !Array.isArray(o.profiles)) throw new DataError('This file is not a Tare backup.');
  const version = num(o.version) ?? 1;
  if (version > SCHEMA_VERSION) throw new DataError('This backup comes from a newer version of Tare. Update the app and try again.');
  // v1 (the original single-file app) had no ids on entries and no timestamps;
  // cleanProfile/cleanEntry fill those in, so v1 → v2 needs no extra step.
  const profiles = o.profiles.map(p => cleanProfile(p, now)).filter((p): p is Profile => !!p);
  if (!profiles.length) throw new DataError('This backup has no profiles in it.');
  const unit: Unit = o.unit === 'lb' || o.unit === 'st' ? o.unit : 'kg';
  const activeId = profiles.some(p => p.id === o.activeId) ? (o.activeId as string) : profiles[0].id;
  return { version: SCHEMA_VERSION, unit, activeId, profiles };
}
