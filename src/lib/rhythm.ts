import type { Settings } from '../data/schema';
import { addDays, toD } from './dates';

// How often someone weighs in: every day, or once a week on a chosen day. Reminders,
// quick log and the icon badge only ask for a weigh-in on a weigh day.

type Rhythm = Settings['rhythm'];

/** Day of the week of a YYYY-MM-DD date, Monday = 0 … Sunday = 6. */
export const weekdayOf = (date: string): number => (toD(date).getUTCDay() + 6) % 7;

/** Whether `date` is a day to weigh in on: every day, or the chosen weekday when weighing weekly. */
export const isWeighDay = (r: Rhythm, date: string): boolean => !r.weekly || weekdayOf(date) === r.day;

/** Whether a weigh-in is due on `today`: a weigh day without one yet. */
export const weighInDue = (r: Rhythm, entries: ReadonlyArray<{ date: string }>, today: string): boolean =>
  isWeighDay(r, today) && !entries.some(e => e.date === today);

/** The first weigh day on or after `date`. */
export const nextWeighDay = (r: Rhythm, date: string): string =>
  r.weekly ? addDays(date, (r.day - weekdayOf(date) + 7) % 7) : date;
