import type { Unit } from '../data/schema';

// Everything is stored in kilograms and centimetres; these helpers convert for display.

export const LB = 0.45359237;
export const CM_IN = 2.54;

export const isMetric = (u: Unit): boolean => u === 'kg';
/** Weight in the display unit (kg, or lb for both lb and st). */
export const disp = (kg: number, u: Unit): number => (u === 'kg' ? kg : kg / LB);
export const fromDisp = (v: number, u: Unit): number => (u === 'kg' ? v : v * LB);
/** Unit used for single numbers and differences: stones show differences in pounds. */
export const deltaUnit = (u: Unit): 'kg' | 'lb' => (u === 'kg' ? 'kg' : 'lb');

export function splitStone(kg: number): { st: number; lb: number } {
  const total = kg / LB;
  let st = Math.floor(total / 14);
  let lb = Math.round((total - st * 14) * 10) / 10;
  if (lb >= 14) { st++; lb = 0; }
  return { st, lb };
}

export function fmtW(kg: number | null | undefined, u: Unit, withUnit = true): string {
  if (kg == null || isNaN(kg)) return '—';
  if (u === 'kg') return kg.toFixed(1) + (withUnit ? ' kg' : '');
  if (u === 'lb') return (kg / LB).toFixed(1) + (withUnit ? ' lb' : '');
  const { st, lb } = splitStone(kg);
  return `${st} st ${lb.toFixed(1)} lb`;
}

export function fmtDelta(kg: number, u: Unit, digits = 1): string {
  const v = disp(kg, u);
  const z = 0.5 * Math.pow(10, -digits);
  const sign = v >= z ? '+' : v <= -z ? '−' : '±';
  return sign + Math.abs(v).toFixed(digits) + ' ' + deltaUnit(u);
}

/** A weekly pace such as 0.25 kg or 0.55 lb: up to two decimals, no trailing zeros. */
export function fmtPace(kg: number, u: Unit, signed = false): string {
  const v = disp(Math.abs(kg), u);
  const sign = !signed || Math.abs(kg) < 1e-9 ? '' : kg < 0 ? '−' : '+';
  return sign + String(+v.toFixed(2)) + ' ' + deltaUnit(u);
}

export const fmtLen =(cm: number | null | undefined, u: Unit): string =>
  cm == null ? '—' : isMetric(u) ? cm.toFixed(1) + ' cm' : (cm / CM_IN).toFixed(1) + ' in';

export function lenDelta(cm: number, u: Unit): string {
  const v = isMetric(u) ? cm : cm / CM_IN;
  return (v >= 0.05 ? '+' : v <= -0.05 ? '−' : '±') + Math.abs(v).toFixed(1) + (isMetric(u) ? ' cm' : ' in');
}
