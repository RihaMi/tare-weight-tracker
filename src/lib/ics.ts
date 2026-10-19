// A calendar file with a daily weigh-in reminder. Web apps can't reliably
// schedule notifications by themselves, but every phone calendar can.

const pad = (n: number): string => String(n).padStart(2, '0');

/** iCalendar text values escape backslashes, commas, semicolons and newlines. */
const icsText = (s: string): string => s.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');

export interface ReminderEvent {
  startDate: string;   // YYYY-MM-DD, first day of the reminder
  time: string;        // HH:MM, local time
  title: string;
  description: string;
  uid: string;
  now?: Date;
}

/** One daily repeating event with an alert at the start time. Lines end in CRLF as the format requires. */
export function dailyReminderICS({ startDate, time, title, description, uid, now = new Date() }: ReminderEvent): string {
  const [h, m] = time.split(':').map(Number);
  const start = startDate.replace(/-/g, '') + `T${pad(h)}${pad(m)}00`; // floating local time
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tare//Weight Tracker//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    'DURATION:PT5M',
    'RRULE:FREQ=DAILY',
    `SUMMARY:${icsText(title)}`,
    `DESCRIPTION:${icsText(description)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(title)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n') + '\r\n';
}

/** True once the local clock has passed `time` (HH:MM). */
export function isPastTime(time: string, now = new Date()): boolean {
  const [h, m] = time.split(':').map(Number);
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
}
