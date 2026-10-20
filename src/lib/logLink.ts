import type { Unit } from '../data/schema';
import { isISODate } from './dates';
import { LB } from './units';

// Logging a weight from a link, e.g. ?log=84.2 or ?log=185.6&unit=lb&date=2026-10-20&note=after+run.
// Lets iOS Shortcuts, Siri, Android automation or an NFC tag fill in the entry form.
// The weigh-in is only saved once the person taps Save.

export interface LinkedWeighIn { kg: number; date: string; note?: string }

const UNITS: Record<string, Unit> = { kg: 'kg', kgs: 'kg', lb: 'lb', lbs: 'lb', st: 'st' };
const TO_KG: Record<Unit, number> = { kg: 1, lb: LB, st: 14 * LB };

/**
 * The weigh-in a link asks for. Undefined when the link has no `log` value;
 * null when it has one that can't be used (not a number, an unknown unit,
 * outside 20–400 kg, or a date that's invalid or in the future).
 */
export function parseLogLink(params: URLSearchParams, appUnit: Unit, today: string): LinkedWeighIn | null | undefined {
  const raw = params.get('log');
  if (raw == null) return undefined;
  const value = raw.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d+)?$/.test(value)) return null;
  const unitParam = params.get('unit')?.trim().toLowerCase();
  const unit = unitParam ? UNITS[unitParam] : appUnit;
  if (!unit) return null;
  const kg = Math.round(parseFloat(value) * TO_KG[unit] * 100) / 100;
  if (kg < 20 || kg > 400) return null;
  const date = params.get('date')?.trim() || today;
  if (!isISODate(date) || date > today || date < '1900-01-01') return null;
  const note = params.get('note')?.trim().slice(0, 500);
  return note ? { kg, date, note } : { kg, date };
}
