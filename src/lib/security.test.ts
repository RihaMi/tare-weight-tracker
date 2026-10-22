import { describe, expect, it } from 'vitest';
import { dailyReminderICS, isPastTime } from './ics';
import { hashPin, isValidPin, lockoutMs, verifyPin } from './pin';

describe('PIN', () => {
  it('accepts 4 to 6 digits only', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('1234567')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });

  it('verifies the right PIN and rejects others, without storing the PIN', async () => {
    const stored = await hashPin('4821', 1000);
    expect(stored.hash).not.toContain('4821');
    expect(await verifyPin('4821', stored)).toBe(true);
    expect(await verifyPin('4822', stored)).toBe(false);
  });

  it('salts each hash differently', async () => {
    const a = await hashPin('0000', 1000), b = await hashPin('0000', 1000);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('slows down repeated wrong guesses', () => {
    expect(lockoutMs(4)).toBe(0);
    expect(lockoutMs(5)).toBe(30_000);
    expect(lockoutMs(6)).toBe(60_000);
    expect(lockoutMs(20)).toBe(15 * 60_000);
  });
});

describe('calendar reminder', () => {
  const ics = dailyReminderICS({
    startDate: '2026-10-20', time: '07:05', title: 'Weigh in; Tare', description: 'Step on the scale,\nthen log it.',
    uid: 'tare-test@tare', now: new Date('2026-10-19T12:34:56.789Z'),
  });

  it('repeats daily at the chosen local time with an alert', () => {
    expect(ics).toContain('DTSTART:20261020T070500\r\n');
    expect(ics).toContain('RRULE:FREQ=DAILY\r\n');
    expect(ics).toContain('BEGIN:VALARM\r\n');
    expect(ics).toContain('DTSTAMP:20261019T123456Z\r\n');
  });

  it('repeats weekly on the chosen day when weighing in weekly', () => {
    const weekly = dailyReminderICS({ startDate: '2026-10-25', time: '08:00', title: 'Weigh in', description: '', uid: 'w@tare', weekday: 6 });
    expect(weekly).toContain('DTSTART:20261025T080000\r\n');
    expect(weekly).toContain('RRULE:FREQ=WEEKLY;BYDAY=SU\r\n');
    expect(weekly).not.toContain('FREQ=DAILY');
  });

  it('escapes text and uses CRLF line endings', () => {
    expect(ics).toContain('SUMMARY:Weigh in\\; Tare\r\n');
    expect(ics).toContain('DESCRIPTION:Step on the scale\\,\\nthen log it.\r\n');
    expect(ics.split('\r\n').every(l => !l.includes('\n'))).toBe(true);
  });

  it('tells whether the reminder time has passed', () => {
    const at = (h: number, m: number) => new Date(2026, 9, 19, h, m);
    expect(isPastTime('07:30', at(7, 29))).toBe(false);
    expect(isPastTime('07:30', at(7, 30))).toBe(true);
    expect(isPastTime('07:30', at(22, 0))).toBe(true);
  });
});
