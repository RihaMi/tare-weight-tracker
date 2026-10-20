import { DataError, MEASURES, migrate, type AppData, type Entry, type Profile } from './schema';
import { isEnvelope, type Envelope } from '../lib/crypto';

// Full backups are JSON (every profile and setting). CSV is for one profile's
// weigh-ins, to open in a spreadsheet. Importing from other apps is in importers.ts.

/** The PIN stays on the device: a backup never carries it, so restoring can't lock you out. */
export function toBackupJSON(data: AppData, now = new Date()): string {
  return JSON.stringify({ app: 'tare', exportedAt: now.toISOString(), ...data, settings: { ...data.settings, pin: null } }, null, 2);
}

/** Restoring replaces data and settings, but keeps this device's PIN lock as it is. */
export const restoredData = (backup: AppData, current: AppData): AppData =>
  ({ ...backup, settings: { ...backup.settings, pin: current.settings.pin } });

export function parseBackup(text: string): AppData {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new DataError('notBackup', 'This file is not a Tare backup. Choose the .json file you exported.'); }
  return migrate(raw);
}

const csvField = (v: string | number | undefined): string => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export function toCSV(p: Profile): string {
  const head = ['date', 'weight_kg', 'note', ...MEASURES.map(([k]) => `${k}_cm`)];
  const rows = [...p.entries]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(e => [e.date, e.kg, e.note, ...MEASURES.map(([k]) => e.measures?.[k])].map(csvField).join(','));
  return [head.join(','), ...rows].join('\n') + '\n';
}

/** Spreadsheets in many European locales save CSV with semicolons, and some apps use tabs; tell from the header row. */
function detectSeparator(text: string): ',' | ';' | '\t' {
  const head = text.split(/\r?\n/, 1)[0] ?? '';
  if (head.includes('\t') && !head.includes(',') && !head.includes(';')) return '\t';
  return head.includes(';') && !head.includes(',') ? ';' : ',';
}

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF line ends. */
export function parseCSVRows(text: string, sep = detectSeparator(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(f => f.trim() !== '')) rows.push(row);
  return rows;
}

/** Adds imported weigh-ins to a profile. An imported date replaces an existing weigh-in on that date. */
export function mergeEntries(p: Profile, incoming: Entry[]): { added: number; replaced: number } {
  const byDate = new Map(p.entries.map(e => [e.date, e]));
  let added = 0, replaced = 0;
  for (const e of incoming) {
    const old = byDate.get(e.date);
    if (old) { replaced++; byDate.set(e.date, { ...e, id: old.id }); } else { added++; byDate.set(e.date, e); }
  }
  p.entries = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  p.updatedAt = Date.now();
  return { added, replaced };
}

/**
 * What a backup holds, leaving out the bookkeeping that changes when one is
 * made (when, and the reminder's snooze). Same key means nothing new to back up.
 */
export const backupKey = (data: AppData): string =>
  JSON.stringify({ ...data, settings: { ...data.settings, pin: null, lastBackupAt: null, backupSnoozeUntil: null } });

/** Daily backups in a folder are named by date; the newest `keep` stay, older ones can go. */
export const BACKUP_FILE = /^tare-backup-(\d{4}-\d{2}-\d{2})\.json$/;
export function backupsToPrune(names: string[], keep = 7): string[] {
  return names.filter(n => BACKUP_FILE.test(n)).sort().reverse().slice(keep);
}

/** A backup file's contents: Tare data, or an encrypted backup (made while a PIN was set) that needs that PIN. */
export function readBackupFile(text: string): AppData | Envelope {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new DataError('notBackup', 'This file is not a Tare backup. Choose the .json file you exported.'); }
  return isEnvelope(raw) ? raw : migrate(raw);
}
