import { addDays, daysBetween } from './dates';

// Cycle-aware weigh-ins. Around a period many women hold 1–2 kg of extra
// water for a few days, which reads as a setback on the chart and skews the
// pace check, plateau detection and weekday pattern. With cycle tracking on,
// those days are marked and left out of those insights.

/** Days around a period start that count as "around your period": 3 before to 2 after. */
export const BEFORE = 3, AFTER = 2;

/** Typical cycle length from the starts logged: the middle gap of those 18–45 days apart. Null with too few. */
export function cycleLength(starts: string[]): number | null {
  const s = [...new Set(starts)].sort();
  const gaps = s.slice(1).map((d, i) => daysBetween(s[i], d)).filter(g => g >= 18 && g <= 45).sort((a, b) => a - b);
  if (!gaps.length) return null;
  return gaps[Math.floor(gaps.length / 2)];
}

/** The next expected start after the last one logged, if a cycle length is known. */
export function nextExpected(starts: string[]): string | null {
  const len = cycleLength(starts);
  if (!len) return null;
  const last = [...starts].sort().pop()!;
  return addDays(last, len);
}

/** Every date around the given starts. */
export function aroundDates(starts: string[]): Set<string> {
  const out = new Set<string>();
  for (const s of starts) for (let d = -BEFORE; d <= AFTER; d++) out.add(addDays(s, d));
  return out;
}

/** Period starts from days with menstrual flow (as Apple Health records them): a flow day after a day without. */
export function startsFromFlowDays(days: string[]): string[] {
  const set = new Set(days);
  return [...set].sort().filter(d => !set.has(addDays(d, -1)));
}
