import { daysBetween, isISODate } from '../lib/dates';
import { LB } from '../lib/units';
import { parseCSVRows } from './backup';
import { DataError, MEASURES, newId, type Entry, type Measures } from './schema';

// Bringing weigh-ins in from other apps. Every app exports differently, so
// instead of one fixed format this works out which column holds the date and
// which the weight, how dates are written and which unit is used. Anything it
// can't tell for sure (the unit, sometimes) is shown in the preview to confirm.

export type WeightUnit = 'kg' | 'lb' | 'st';

export interface ImportRow {
  date: string;              // YYYY-MM-DD
  value: number;             // in `unit`, or in the file's unit when `unit` is null
  unit: WeightUnit | null;   // set when the row says so itself ("80 kg", "12 st 3 lb")
  time?: string;             // HH:MM, used to keep the first weigh-in of a day
  note?: string;
  measures?: Measures;
}

export interface ImportPreview {
  source: 'csv' | 'health';
  rows: ImportRow[];         // one per date, oldest first
  unit: WeightUnit | null;   // the file's unit, if it could be told
  skipped: number;           // rows that couldn't be read
  sameDay: number;           // extra weigh-ins on a day already counted (the earliest is kept)
  sources?: string[];        // Apple Health: the apps and devices the weights came from, most first
}

const TO_KG: Record<WeightUnit, number> = { kg: 1, lb: LB, st: 14 * LB };
const MIN_KG = 20, MAX_KG = 400;

/** The unit to suggest when a file doesn't say: almost nobody weighs over 140 kg, many people weigh over 140 lb. */
export function guessUnit(p: ImportPreview): WeightUnit {
  if (p.unit) return p.unit;
  const vals = p.rows.filter(r => !r.unit).map(r => r.value).sort((a, b) => a - b);
  return vals.length && vals[Math.floor(vals.length / 2)] >= 140 ? 'lb' : 'kg';
}

const rowKg = (r: ImportRow, unit: WeightUnit): number => r.value * TO_KG[r.unit ?? unit];

/** The rows as Tare entries, reading unlabelled weights in `unit`. Rows outside 20–400 kg are left out. */
export function toEntries(p: ImportPreview, unit: WeightUnit, now = Date.now()): { entries: Entry[]; outOfRange: number } {
  const entries: Entry[] = [];
  let outOfRange = 0;
  for (const r of p.rows) {
    const kg = rowKg(r, unit);
    if (!(kg >= MIN_KG && kg <= MAX_KG)) { outOfRange++; continue; }
    const e: Entry = { id: newId('e_'), date: r.date, kg: Math.round(kg * 100) / 100, updatedAt: now };
    if (r.note) e.note = r.note;
    if (r.measures) e.measures = r.measures;
    entries.push(e);
  }
  return { entries, outOfRange };
}

/** One row per date: the earliest weigh-in of each day (by time, else by order in the file). */
function onePerDay(rows: ImportRow[]): { rows: ImportRow[]; sameDay: number } {
  const byDate = new Map<string, ImportRow>();
  let sameDay = 0;
  for (const r of rows) {
    const cur = byDate.get(r.date);
    if (!cur) { byDate.set(r.date, r); continue; }
    sameDay++;
    if (r.time && cur.time && r.time < cur.time) byDate.set(r.date, r);
  }
  return { rows: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)), sameDay };
}

// ---- Weights ----

/** "80.5", "80,5", "80.5 kg", "177 lbs", "12 st 4 lb", "12st". */
export function parseWeight(s: string): { value: number; unit: WeightUnit | null } | null {
  const t = s.trim().toLowerCase().replace(/ /g, ' ');
  if (!t) return null;
  const st = t.match(/^(\d+(?:[.,]\d+)?)\s*st(?:one)?s?\.?\s*(?:(\d+(?:[.,]\d+)?)\s*(?:lbs?|pounds?)?)?$/);
  if (st) return { value: num(st[1]) * 14 + (st[2] ? num(st[2]) : 0), unit: 'lb' };
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilos?|kilograms?|lbs?|pounds?|#)?$/);
  if (!m) return null;
  const unit = !m[2] ? null : m[2].startsWith('k') ? 'kg' : 'lb';
  return { value: num(m[1]), unit };
}

const num = (s: string): number => parseFloat(s.replace(',', '.'));

function unitFromText(s: string): WeightUnit | null {
  const t = s.toLowerCase();
  if (/\bkgs?\b|kilo/.test(t) || /(^|[^a-z])kg/.test(t)) return 'kg';
  if (/\blbs?\b|pound/.test(t) || /(^|[^a-z])lbs?($|[^a-z])/.test(t)) return 'lb';
  if (/\bst\b|stone/.test(t)) return 'st';
  return null;
}

// ---- Dates ----

const MONTHS: Record<string, number> = {};
['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].forEach((m, i) => { MONTHS[m] = i + 1; });
// Czech month names, in the nominative and the genitive used in dates ("5. ledna 2026").
[['leden', 'ledna'], ['únor', 'února'], ['březen', 'března'], ['duben', 'dubna'], ['květen', 'května'], ['červen', 'června'],
  ['červenec', 'července'], ['srpen', 'srpna'], ['září'], ['říjen', 'října'], ['listopad', 'listopadu'], ['prosinec', 'prosince']]
  .forEach((names, i) => names.forEach(n => { MONTHS[n] = i + 1; }));

const monthOf = (word: string): number | undefined =>
  MONTHS[word] ?? (/^[a-z]{3,}$/.test(word) ? MONTHS[word.slice(0, 3)] : undefined);

type Order = 'ymd' | 'dmy' | 'mdy';

/** A date split into its pieces before the day/month order is known. */
interface RawDate { a: number; b: number; c: number; order?: Order; time?: string }

const pad = (n: number) => String(n).padStart(2, '0');

function makeISO(y: number, m: number, d: number): string | null {
  if (y < 100) y += y > (new Date().getFullYear() % 100) + 1 ? 1900 : 2000;
  const s = `${y}-${pad(m)}-${pad(d)}`;
  return isISODate(s) ? s : null;
}

function timeOf(s: string): { rest: string; time?: string } {
  const m = s.match(/(?:^|[\sT,])(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(am|pm)?(?:\s*(?:z|[+-]\d{2}:?\d{2}))?/i);
  if (!m) return { rest: s };
  let h = +m[1];
  if (m[3]) h = (h % 12) + (m[3].toLowerCase() === 'pm' ? 12 : 0);
  return { rest: s.replace(m[0], ' ').trim(), time: `${pad(h)}:${m[2]}` };
}

function splitDate(s: string): RawDate | null {
  const { rest, time } = timeOf(s.trim());
  const t = rest.toLowerCase().replace(/\.$/, '');
  if (/^\d{10}(\d{3})?$/.test(t)) {
    // A Unix timestamp, in seconds or milliseconds: the day it was where this browser is.
    const d = new Date(+t * (t.length === 10 ? 1000 : 1));
    return { a: d.getFullYear(), b: d.getMonth() + 1, c: d.getDate(), order: 'ymd', time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }
  const n = t.match(/^(\d{1,4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,4})$/);
  if (n) {
    const [a, b, c] = [+n[1], +n[2], +n[3]];
    if (n[1].length === 4) return { a, b, c, order: 'ymd', time };
    if (n[3].length !== 4 && n[3].length !== 2) return null;
    // A dot is only ever day.month.year.
    return { a, b, c, order: t.includes('.') ? 'dmy' : undefined, time };
  }
  // Written out: "Jan 5, 2026", "5 January 2026", "Mon, 5 Jan 2026", "5. ledna 2026".
  const words = t.split(/[\s,./-]+/).filter(Boolean);
  let month: number | undefined, day: number | undefined, year: number | undefined;
  for (const w of words) {
    if (/^\d{4}$/.test(w)) year = +w;
    else if (/^\d{1,2}(st|nd|rd|th)?$/.test(w)) day ??= parseInt(w, 10);
    else month ??= monthOf(w);
  }
  if (month && day && year) return { a: year, b: month, c: day, order: 'ymd', time };
  return null;
}

function toISO(r: RawDate, order: Order): string | null {
  if (order === 'ymd') return makeISO(r.a, r.b, r.c);
  if (order === 'dmy') return makeISO(r.c, r.b, r.a);
  return makeISO(r.c, r.a, r.b);
}

/**
 * Whether "03/04/2026" means 3 April or March 4 for this whole file. A day over
 * 12 settles it; otherwise the reading that puts weigh-ins closer together in
 * time wins, since people weigh themselves every few days, not months apart.
 */
function slashOrder(raws: RawDate[], preferMDY: boolean): Order {
  const open = raws.filter(r => !r.order);
  if (!open.length) return 'dmy';
  if (open.some(r => r.a > 12)) return 'dmy';
  if (open.some(r => r.b > 12)) return 'mdy';
  const spread = (o: Order) => {
    const ds = open.map(r => toISO(r, o));
    let total = 0;
    for (let i = 1; i < ds.length; i++) {
      if (!ds[i] || !ds[i - 1]) { total += 400; continue; }
      total += Math.abs(daysBetween(ds[i - 1]!, ds[i]!));
    }
    return total;
  };
  const dmy = spread('dmy'), mdy = spread('mdy');
  return dmy === mdy ? (preferMDY ? 'mdy' : 'dmy') : dmy < mdy ? 'dmy' : 'mdy';
}

/** Reads a column of dates written however the app wrote them. */
export function parseDates(values: string[], preferMDY = false): Array<{ date: string; time?: string } | null> {
  const raws = values.map(splitDate);
  const order = slashOrder(raws.filter((r): r is RawDate => !!r), preferMDY);
  return raws.map(r => {
    if (!r) return null;
    const date = toISO(r, r.order ?? order);
    return date ? { date, time: r.time } : null;
  });
}

const looksLikeDate = (s: string) => !!splitDate(s) && !/^\d+([.,]\d+)?$/.test(s.trim());

// ---- CSV from any app ----

const DATE_HEAD = /^(date|day|datum|den|time|timestamp|date ?time|datetime|when|recorded|measured|created|start ?date)\b|date|datum/;
const WEIGHT_HEAD = /weight|w[aá]ha|hmotnost|mass|^kg$|^lbs?$|^kilo|^pounds?$|^value$|^hodnota$/;
const NOT_WEIGHT = /goal|target|c[ií]l|change|diff|delta|zm[eě]n|trend|bmi|fat|tuk|lean|muscle|sval|water|voda|bone|kost|avg|average|pr[ůu]m[eě]r|ideal|start|min|max/;
const NOTE_HEAD = /note|comment|memo|pozn[aá]mk|koment/;
const UNIT_HEAD = /^(unit|units|jednotka|jednotky)$/;

/** Weigh-ins from a CSV: Tare's own export, or any app's with a date and a weight column. */
export function parseAnyCSV(text: string, preferMDY = false): ImportPreview {
  const rows = parseCSVRows(text.replace(/^﻿/, ''));
  if (!rows.length) throw new DataError('csvEmpty', 'The CSV file has no rows to import.');
  const head = rows[0].map(h => h.trim().toLowerCase());
  let di = head.findIndex(h => h === 'date' || h === 'datum');
  if (di < 0) di = head.findIndex(h => DATE_HEAD.test(h));
  const weightCols = head.map((h, i) => [h, i] as const).filter(([h]) => WEIGHT_HEAD.test(h) && !NOT_WEIGHT.test(h));
  let wi = (weightCols.find(([h]) => /weight|w[aá]ha|hmotnost/.test(h)) ?? weightCols[0])?.[1] ?? -1;
  let body = rows.slice(1);

  // No header row: find the columns from the first row's values instead.
  if (di < 0 || wi < 0) {
    const first = rows[0];
    const d = first.findIndex(looksLikeDate);
    const w = first.findIndex((v, i) => i !== d && parseWeight(v) != null);
    if (di < 0 && wi < 0 && d >= 0 && w >= 0) { di = d; wi = w; body = rows; }
    else if (di >= 0 && wi < 0) {
      // A date column, but the weight column has a name we don't know: take the first column of plausible weights.
      const sample = body.slice(0, 20);
      wi = head.findIndex((h, i) => i !== di && !NOT_WEIGHT.test(h) && sample.length > 0 && sample.every(r => { const p = parseWeight(r[i] ?? ''); return !(r[i] ?? '').trim() || (p && p.value >= 20 && p.value <= 900); }) && sample.some(r => (r[i] ?? '').trim()));
    }
  }
  if (di < 0 || wi < 0) throw new DataError('csvColumns', 'The CSV needs a date column and a weight column.');
  if (!body.length) throw new DataError('csvEmpty', 'The CSV file has no rows to import.');

  const headUnit = body === rows ? null : unitFromText(head[wi]);
  const ui = head.findIndex(h => UNIT_HEAD.test(h));
  const ni = body === rows ? -1 : head.findIndex(h => NOTE_HEAD.test(h));
  const mi = MEASURES.map(([k]) => [k, head.indexOf(`${k}_cm`)] as const).filter(([, i]) => i >= 0);
  // Some apps put the time of day in a column of its own.
  const ti = body === rows ? -1 : head.findIndex((h, i) => i !== di && /^(time|time of day|[čc]as)$/.test(h));
  const dates = parseDates(body.map(r => (r[di] ?? '') + (ti >= 0 && r[ti] ? ' ' + r[ti] : '')), preferMDY);

  const out: ImportRow[] = [];
  let skipped = 0;
  body.forEach((r, i) => {
    const d = dates[i], w = parseWeight(r[wi] ?? '');
    if (!d || !w || !(w.value > 0)) { skipped++; return; }
    const unit = w.unit ?? (ui >= 0 ? unitFromText(r[ui] ?? '') : null);
    const row: ImportRow = { date: d.date, value: w.value, unit, time: d.time };
    const note = ni >= 0 ? (r[ni] ?? '').trim() : '';
    if (note) row.note = note.slice(0, 500);
    const m: Measures = {};
    for (const [k, idx] of mi) { const v = parseFloat((r[idx] ?? '').replace(',', '.')); if (isFinite(v) && v > 0) m[k] = v; }
    if (Object.keys(m).length) row.measures = m;
    out.push(row);
  });
  // Rows that carry no unit of their own take the header's; when every labelled row agrees, that's the file's unit too.
  for (const r of out) if (!r.unit && headUnit) r.unit = headUnit;
  const units = new Set(out.map(r => r.unit));
  const unit = units.size === 1 ? [...units][0] : headUnit;
  const one = onePerDay(out);
  return { source: 'csv', rows: one.rows, unit, skipped, sameDay: one.sameDay };
}

// ---- Apple Health ----

const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass';
const HEALTH_UNITS: Record<string, [WeightUnit, number]> = { kg: ['kg', 1], lb: ['lb', 1], st: ['st', 1], g: ['kg', 0.001] };

const attr = (tag: string, name: string): string | undefined => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const unescapeXML = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * Body weight records from Apple Health's export.xml, read as a stream: the
 * file is often hundreds of megabytes, nearly all of it steps and heart rate.
 */
export async function parseHealthXML(stream: ReadableStream<string>): Promise<ImportPreview> {
  const reader = stream.getReader();
  const out: ImportRow[] = [];
  const sources = new Map<string, number>();
  let buf = '', skipped = 0, sawHealth = false;
  const take = (upTo: number) => {
    const part = buf.slice(0, upTo);
    if (!sawHealth && part.includes('<HealthData')) sawHealth = true;
    for (const m of part.matchAll(/<Record\s[^>]*>/g)) {
      const tag = m[0];
      if (!tag.includes(BODY_MASS) || attr(tag, 'type') !== BODY_MASS) continue;
      const u = HEALTH_UNITS[attr(tag, 'unit') ?? ''];
      const v = parseFloat(attr(tag, 'value') ?? '');
      const start = attr(tag, 'startDate') ?? '';
      const date = start.slice(0, 10);
      if (!u || !isFinite(v) || !isISODate(date)) { skipped++; continue; }
      out.push({ date, value: v * u[1], unit: u[0], time: start.slice(11, 16) || undefined });
      const src = unescapeXML(attr(tag, 'sourceName') ?? '');
      if (src) sources.set(src, (sources.get(src) ?? 0) + 1);
    }
    buf = buf.slice(upTo);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    // Only look at whole tags; keep a tag that's cut in half for the next piece.
    const cut = buf.lastIndexOf('>') + 1;
    if (cut > 0) take(cut);
  }
  take(buf.length);
  if (!sawHealth) throw new DataError('notHealth', 'This is not an Apple Health export.');
  const one = onePerDay(out);
  const units = new Set(one.rows.map(r => r.unit));
  return {
    source: 'health', rows: one.rows, unit: units.size === 1 ? [...units][0] : 'kg', skipped, sameDay: one.sameDay,
    sources: [...sources.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s),
  };
}

// ---- Zip (Apple Health exports come as export.zip) ----

/** Streams one file out of a .zip without loading the whole archive. Handles Zip64 for exports over 4 GB. */
export async function zipEntryStream(file: Blob, match: (name: string) => boolean): Promise<ReadableStream<Uint8Array>> {
  const bytes = async (start: number, end: number) => new DataView(await file.slice(start, end).arrayBuffer());
  const tailLen = Math.min(file.size, 65_557);
  const tail = await bytes(file.size - tailLen, file.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new DataError('notZip', 'This file is not a .zip archive.');
  let cdSize = tail.getUint32(eocd + 12, true), cdOffset = tail.getUint32(eocd + 16, true);
  if (cdOffset === 0xffffffff && eocd >= 20 && tail.getUint32(eocd - 20, true) === 0x07064b50) {
    const z64 = await bytes(Number(tail.getBigUint64(eocd - 12, true)), Number(tail.getBigUint64(eocd - 12, true)) + 56);
    cdSize = Number(z64.getBigUint64(40, true));
    cdOffset = Number(z64.getBigUint64(48, true));
  }
  const cd = await bytes(cdOffset, cdOffset + cdSize);
  const dec = new TextDecoder();
  for (let p = 0; p + 46 <= cd.byteLength && cd.getUint32(p, true) === 0x02014b50;) {
    const method = cd.getUint16(p + 10, true);
    let comp = cd.getUint32(p + 20, true), uncomp = cd.getUint32(p + 24, true), local = cd.getUint32(p + 42, true);
    const nameLen = cd.getUint16(p + 28, true), extraLen = cd.getUint16(p + 30, true), commentLen = cd.getUint16(p + 32, true);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    // Zip64 sizes and offsets live in an extra field, in this order, for whichever were too big.
    for (let e = p + 46 + nameLen; e + 4 <= p + 46 + nameLen + extraLen;) {
      const id = cd.getUint16(e, true), size = cd.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        if (uncomp === 0xffffffff) { uncomp = Number(cd.getBigUint64(q, true)); q += 8; }
        if (comp === 0xffffffff) { comp = Number(cd.getBigUint64(q, true)); q += 8; }
        if (local === 0xffffffff) local = Number(cd.getBigUint64(q, true));
      }
      e += 4 + size;
    }
    if (match(name)) {
      const lh = await bytes(local, local + 30);
      const start = local + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
      const raw = file.slice(start, start + comp).stream();
      if (method === 0) return raw;
      if (method === 8) return raw.pipeThrough(new DecompressionStream('deflate-raw'));
      throw new DataError('notZip', 'This .zip uses a compression method Tare can\'t read.');
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new DataError('notHealth', 'This .zip has no Apple Health export.xml in it.');
}

const isHealthXML = (name: string) => /(^|\/)export\.xml$/i.test(name);

// TypeScript's DOM types say TextDecoderStream takes any BufferSource; a stream of bytes is one.
const asText = (s: ReadableStream<Uint8Array>): ReadableStream<string> =>
  s.pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>);

/** Reads whatever file was picked: a CSV from any app, Apple Health's export.zip, or its export.xml. */
export async function readImportFile(file: File, preferMDY = false): Promise<ImportPreview> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  if (isZip) return parseHealthXML(asText(await zipEntryStream(file, isHealthXML)));
  const start = await file.slice(0, 2048).text();
  if (/^\s*(﻿)?<\?xml|<HealthData/.test(start)) return parseHealthXML(asText(file.stream()));
  return parseAnyCSV(await file.text(), preferMDY);
}
