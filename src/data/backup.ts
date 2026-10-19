import { isISODate } from '../lib/dates';
import { DataError, MEASURES, migrate, newId, type AppData, type Entry, type Measures, type Profile } from './schema';

// Full backups are JSON (every profile and setting). CSV is for one profile's
// weigh-ins, to open in a spreadsheet or bring in from another app.

export function toBackupJSON(data: AppData, now = new Date()): string {
  return JSON.stringify({ app: 'tare', exportedAt: now.toISOString(), ...data }, null, 2);
}

export function parseBackup(text: string): AppData {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new DataError('This file is not a Tare backup. Choose the .json file you exported.'); }
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

/** Spreadsheets in many European locales save CSV with semicolons; tell from the header row. */
function detectSeparator(text: string): ',' | ';' {
  const head = text.split(/\r?\n/, 1)[0] ?? '';
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

const WEIGHT_COLS: Record<string, number> = { weight_kg: 1, kg: 1, weight: 1, 'weight (kg)': 1, weight_lb: 0.45359237, lb: 0.45359237, lbs: 0.45359237, 'weight (lb)': 0.45359237 };

export interface CSVImport { entries: Entry[]; skipped: number }

/** Reads weigh-ins from a CSV with a header row (Tare's own export, or any file with date + weight columns). */
export function parseCSV(text: string, now = Date.now()): CSVImport {
  const rows = parseCSVRows(text.replace(/^﻿/, ''));
  if (rows.length < 2) throw new DataError('The CSV file has no rows to import.');
  const head = rows[0].map(h => h.trim().toLowerCase());
  const di = head.findIndex(h => h === 'date' || h === 'day');
  const wi = head.findIndex(h => h in WEIGHT_COLS);
  if (di < 0 || wi < 0) throw new DataError('The CSV needs a "date" column and a weight column such as "weight_kg" or "weight_lb".');
  const factor = WEIGHT_COLS[head[wi]];
  const ni = head.indexOf('note');
  const mi = MEASURES.map(([k]) => [k, head.indexOf(`${k}_cm`)] as const);
  const entries: Entry[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const date = (r[di] ?? '').trim();
    const kg = parseFloat((r[wi] ?? '').replace(',', '.')) * factor;
    if (!isISODate(date) || !isFinite(kg) || kg < 20 || kg > 400) { skipped++; continue; }
    const e: Entry = { id: newId('e_'), date, kg: Math.round(kg * 100) / 100, updatedAt: now };
    const note = ni >= 0 ? (r[ni] ?? '').trim() : '';
    if (note) e.note = note.slice(0, 500);
    const m: Measures = {};
    for (const [k, i] of mi) { const v = i >= 0 ? parseFloat(r[i] ?? '') : NaN; if (isFinite(v) && v > 0) m[k] = v; }
    if (Object.keys(m).length) e.measures = m;
    entries.push(e);
  }
  return { entries, skipped };
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
