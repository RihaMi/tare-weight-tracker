// Locale-aware number formatting. The app sets the locale once from the
// chosen language; tests run with the default (US English) for stable output.

let locale = 'en-US';
const cache = new Map<string, Intl.NumberFormat>();

export function setFormatLocale(l: string): void {
  locale = l;
  cache.clear();
}
export const formatLocale = (): string => locale;

function nf(min: number, max: number, grouping: boolean): Intl.NumberFormat {
  const key = `${min}|${max}|${grouping}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: grouping });
    cache.set(key, f);
  }
  return f;
}

/** Fixed decimals, no thousands separator: 84.1 / 84,1. */
export const fmtNum = (v: number, digits = 1): string => nf(digits, digits, false).format(v);
/** Up to `max` decimals, trailing zeros dropped: 0.25, 0.5. */
export const fmtNumMax = (v: number, max = 2): string => nf(0, max, false).format(v);
/** Whole number with thousands separator: 1,840 / 1 840. */
export const fmtInt = (v: number): string => nf(0, 0, true).format(Math.round(v));
