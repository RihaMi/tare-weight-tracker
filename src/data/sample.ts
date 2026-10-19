import { addDays, daysBetween, todayISO } from '../lib/dates';
import type { Entry, Profile } from './schema';

// A made-up profile shown on first visit so the app doesn't open empty.
// It is clearly labelled as an example and can be removed in one click.

function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SampleText { name: string; notes: Record<number, string> }

const ENGLISH: SampleText = {
  name: 'Alex (example)',
  notes: {
    0: 'Day one. Weighed after waking up.', 9: 'Swapped soda for sparkling water', 23: 'Weekend away, lots of restaurant food',
    41: 'Back to morning runs', 64: 'Stalled this week, kept going anyway', 88: 'Birthday dinner', 110: 'Jeans fit loose now',
  },
};

export function sampleProfile(today = todayISO(), text: SampleText = ENGLISH): Profile {
  const span = 126, start = addDays(today, -span), rnd = mulberry(11), entries: Entry[] = [];
  const notes = text.notes;
  const used = new Set<number>();
  const now = Date.now();
  let d = 0;
  while (d <= span) {
    const trend = 92.4 - 0.074 * d + (d > 58 && d < 76 ? (d - 58) * 0.05 : d >= 76 ? 0.9 : 0);
    const kg = Math.round((trend + (rnd() - 0.5) * 0.9) * 10) / 10;
    const date = addDays(start, d);
    const e: Entry = { id: `sample_${d}`, date, kg, updatedAt: now };
    for (const k of Object.keys(notes).map(Number)) if (Math.abs(d - k) <= 1 && !used.has(k)) { e.note = notes[k]; used.add(k); }
    if (d % 14 < 2 && !entries.some(x => x.measures && daysBetween(x.date, date) < 10)) {
      const f = d / span;
      e.measures = {
        waist: +(102 - 8.5 * f).toFixed(1), hips: +(106 - 5 * f).toFixed(1), chest: +(108 - 4 * f).toFixed(1),
        neck: +(40.5 - 1.6 * f).toFixed(1), arm: +(34 - 1.2 * f).toFixed(1), thigh: +(60 - 3.5 * f).toFixed(1),
      };
    }
    entries.push(e);
    d += 1 + Math.floor(rnd() * 2.6);
  }
  return {
    id: 'sample', sample: true, name: text.name, sex: 'm', birthYear: new Date().getFullYear() - 38, heightCm: 180,
    frame: 'medium', activity: 1.375, goalKg: 80, goalDate: addDays(today, 110), entries, updatedAt: now,
  };
}
