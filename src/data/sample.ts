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

export interface SampleText { name: string; notes: Record<number, string>; events: { away: string; runs: string } }

const ENGLISH: SampleText = {
  name: 'Alex (example)',
  notes: {
    0: 'Day one. Weighed after waking up.', 9: 'Swapped soda for sparkling water', 23: 'Weekend away, lots of restaurant food',
    41: 'Back to morning runs', 64: 'Stalled this week, kept going anyway', 88: 'Birthday dinner', 110: 'Jeans fit loose now',
  },
  events: { away: 'Weekend away', runs: 'Morning runs' },
};

export function sampleProfile(today = todayISO(), text: SampleText = ENGLISH): Profile {
  const span = 126, start = addDays(today, -span), rnd = mulberry(11), entries: Entry[] = [];
  // A separate sequence for the smart-scale readings, so the weights stay the same as before they existed.
  const scale = mulberry(23);
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
    // Smart-scale readings: body fat slowly down, muscle nearly steady, with the day-to-day noise such scales have.
    const f = d / span, noise = () => scale() - 0.5;
    e.composition = {
      fatPct: +(30.5 - 4.4 * f + noise() * 1.2).toFixed(1),
      muscleKg: +(59 - 0.6 * f + noise() * 0.8).toFixed(1),
      waterPct: +(51.5 + 1.8 * f + noise() * 1).toFixed(1),
    };
    entries.push(e);
    d += 1 + Math.floor(rnd() * 2.6);
  }
  return {
    id: 'sample', sample: true, name: text.name, sex: 'm', birthYear: new Date().getFullYear() - 38, heightCm: 180,
    frame: 'medium', activity: 1.375, goalKg: 80, goalDate: addDays(today, 110), entries, updatedAt: now,
    events: [
      { id: 'sample_ev_away', kind: 'holiday', label: text.events.away, start: addDays(start, 22), end: addDays(start, 24), updatedAt: now },
      { id: 'sample_ev_runs', kind: 'training', label: text.events.runs, start: addDays(start, 41), end: null, updatedAt: now },
    ],
    // Two steps toward the 80 kg goal: one already behind, one still ahead.
    goalSteps: [{ id: 'sample_st_85', kg: 85, date: null }, { id: 'sample_st_82', kg: 82, date: addDays(today, 42) }],
    cycleTracking: false,
    periodStarts: [],
  };
}
