import { describe, expect, it } from 'vitest';
import { guessUnit, parseAnyCSV, parseDates, parseHealthXML, parseWeight, readImportFile, toEntries } from './importers';

const kgs = (text: string) => { const p = parseAnyCSV(text); return toEntries(p, guessUnit(p)).entries.map(e => [e.date, e.kg]); };

describe('reading dates', () => {
  it('reads ISO dates, with or without a time', () => {
    expect(parseDates(['2026-01-05', '2026-01-06T07:12:00Z', '2026-01-07 06:30:00 +0100'])).toEqual([
      { date: '2026-01-05', time: undefined }, { date: '2026-01-06', time: '07:12' }, { date: '2026-01-07', time: '06:30' }]);
  });

  it('reads day.month.year as used in Czech', () => {
    expect(parseDates(['5.1.2026', '06. 01. 2026']).map(d => d?.date)).toEqual(['2026-01-05', '2026-01-06']);
  });

  it('tells day/month from month/day when a day is over 12', () => {
    expect(parseDates(['13/01/2026', '14/01/2026']).map(d => d?.date)).toEqual(['2026-01-13', '2026-01-14']);
    expect(parseDates(['01/13/2026', '01/14/2026']).map(d => d?.date)).toEqual(['2026-01-13', '2026-01-14']);
  });

  it('otherwise picks the reading that keeps weigh-ins close together', () => {
    // Read as month/day these are a day apart; read as day/month, a month apart.
    expect(parseDates(['03/04/2026', '03/05/2026', '03/06/2026']).map(d => d?.date)).toEqual(['2026-03-04', '2026-03-05', '2026-03-06']);
    expect(parseDates(['04/03/2026', '05/03/2026', '06/03/2026']).map(d => d?.date)).toEqual(['2026-03-04', '2026-03-05', '2026-03-06']);
  });

  it('reads written-out dates in English and Czech, and 12-hour times', () => {
    expect(parseDates(['Jan 5, 2026 7:05 PM', 'Tue, 6 January 2026', '7. ledna 2026', 'March 1st 2026']).map(d => [d?.date, d?.time])).toEqual([
      ['2026-01-05', '19:05'], ['2026-01-06', undefined], ['2026-01-07', undefined], ['2026-03-01', undefined]]);
  });

  it('rejects dates that do not exist', () => {
    expect(parseDates(['2026-02-30', '31.04.2026', 'yesterday'])).toEqual([null, null, null]);
  });
});

describe('reading weights', () => {
  it('reads plain numbers, decimal commas, units and stones', () => {
    expect(parseWeight('80.5')).toEqual({ value: 80.5, unit: null });
    expect(parseWeight('80,5 kg')).toEqual({ value: 80.5, unit: 'kg' });
    expect(parseWeight('177.4 lbs')).toEqual({ value: 177.4, unit: 'lb' });
    expect(parseWeight('12 st 4 lb')).toEqual({ value: 172, unit: 'lb' });
    expect(parseWeight('heavy')).toBeNull();
  });
});

describe('CSV from other apps', () => {
  it('finds the weight among other columns, skipping BMI, body fat and goal', () => {
    const csv = 'Date,Time,BMI,Goal weight,Body Fat (%),Weight (kg),Notes\n2026-01-05,07:10,27.1,75,25,85.2,ok\n2026-01-06,07:00,27.0,75,25,84.9,\n';
    const p = parseAnyCSV(csv);
    expect(p.unit).toBe('kg');
    expect(p.rows.map(r => [r.date, r.value, r.time, r.note])).toEqual([['2026-01-05', 85.2, '07:10', 'ok'], ['2026-01-06', 84.9, '07:00', undefined]]);
  });

  it('reads Czech headers, semicolons and decimal commas', () => {
    expect(kgs('Datum;Hmotnost (kg);Poznámka\n5.1.2026;85,2;\n6.1.2026;84,9;po dovolené\n')).toEqual([['2026-01-05', 85.2], ['2026-01-06', 84.9]]);
  });

  it('reads tab-separated files', () => {
    expect(kgs('date\tweight\n2026-01-05\t85.2\n')).toEqual([['2026-01-05', 85.2]]);
  });

  it('reads a file without a header row', () => {
    expect(kgs('2026-01-05,85.2\n2026-01-06,84.9\n')).toEqual([['2026-01-05', 85.2], ['2026-01-06', 84.9]]);
  });

  it('uses units written in the values or a unit column', () => {
    expect(kgs('date,weight\n2026-01-05,176.4 lb\n')[0][1]).toBeCloseTo(80.01, 1);
    expect(kgs('date,weight,unit\n2026-01-05,176.4,lbs\n2026-01-06,80,kg\n').map(r => Math.round(+r[1]))).toEqual([80, 80]);
  });

  it('suggests pounds for unlabelled weights that only make sense in pounds, and leaves the choice open', () => {
    const p = parseAnyCSV('date,weight\n2026-01-05,181.2\n2026-01-06,180.6\n');
    expect(p.unit).toBeNull();
    expect(guessUnit(p)).toBe('lb');
    expect(toEntries(p, 'kg').entries.map(e => e.kg)).toEqual([181.2, 180.6]);
  });

  it('keeps the earliest weigh-in of a day', () => {
    const p = parseAnyCSV('date,weight\n2026-01-05 21:00,86\n2026-01-05 06:50,85\n2026-01-06,84\n');
    expect(p.rows.map(r => [r.date, r.value])).toEqual([['2026-01-05', 85], ['2026-01-06', 84]]);
    expect(p.sameDay).toBe(1);
  });

  it('leaves out weights that are out of range in the chosen unit', () => {
    const p = parseAnyCSV('date,weight\n2026-01-05,85\n2026-01-06,850\n');
    expect(toEntries(p, 'kg')).toMatchObject({ outOfRange: 1 });
  });

  it('explains a file it cannot read', () => {
    expect(() => parseAnyCSV('when,how much\nsoon,lots\n')).toThrow(/date column/);
  });
});

const health = (records: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
<!ATTLIST Record type CDATA #REQUIRED>
]>
<HealthData locale="en_US">
 <ExportDate value="2026-10-19 08:00:00 +0200"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-01-05 07:00:00 +0100" value="1200"/>
${records}
</HealthData>`;

const bodyMass = (date: string, value: number, unit = 'kg', source = 'Monitor Your Weight') =>
  ` <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="${source}" sourceVersion="5.1" unit="${unit}" creationDate="${date}" startDate="${date}" endDate="${date}" value="${value}">\n  <MetadataEntry key="HKWasUserEntered" value="1"/>\n </Record>`;

/** Splits text into small pieces, like a file read from disk, to test tags cut in half. */
const chunked = (text: string, size = 37) => new ReadableStream<string>({
  start(c) { for (let i = 0; i < text.length; i += size) c.enqueue(text.slice(i, i + size)); c.close(); },
});

describe('Apple Health', () => {
  const xml = health([
    bodyMass('2026-01-05 07:02:00 +0100', 85.2),
    bodyMass('2026-01-05 20:15:00 +0100', 86.1, 'kg', 'Withings'),
    bodyMass('2026-01-06 06:58:00 +0100', 187.4, 'lb', 'Withings'),
    bodyMass('2026-01-07 06:58:00 +0100', 84500, 'g', 'Health &amp; Fitness'),
  ].join('\n'));

  it('reads body weight records only, keeping the morning weigh-in', async () => {
    const p = await parseHealthXML(chunked(xml));
    expect(p.rows.map(r => [r.date, r.value, r.unit])).toEqual([['2026-01-05', 85.2, 'kg'], ['2026-01-06', 187.4, 'lb'], ['2026-01-07', 84.5, 'kg']]);
    expect(p.sameDay).toBe(1);
    expect(p.sources).toEqual(['Withings', 'Monitor Your Weight', 'Health & Fitness']);
    expect(toEntries(p, guessUnit(p)).entries.map(e => e.kg)).toEqual([85.2, 85.0, 84.5]);
  });

  it('says so when the XML is not a Health export', async () => {
    await expect(parseHealthXML(chunked('<?xml version="1.0"?><gpx></gpx>'))).rejects.toThrow(/Apple Health/);
  });

  it('opens export.zip, compressed or stored', async () => {
    for (const method of [0, 8] as const) {
      const file = new File([await zip([['apple_health_export/export_cda.xml', '<x/>', method], ['apple_health_export/export.xml', xml, method]])], 'export.zip');
      const p = await readImportFile(file);
      expect(p.source).toBe('health');
      expect(p.rows).toHaveLength(3);
    }
  });

  it('opens export.xml on its own', async () => {
    const p = await readImportFile(new File([xml], 'export.xml'));
    expect(p.rows).toHaveLength(3);
  });

  it('reads a CSV file too', async () => {
    const p = await readImportFile(new File(['date,weight_kg\n2026-01-05,85\n'], 'w.csv'));
    expect(p.source).toBe('csv');
  });
});

/** Deflate as a .zip stores it. */
const deflateRaw = async (data: Uint8Array<ArrayBuffer>) =>
  new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());

/** A minimal .zip writer for the tests. */
async function zip(files: Array<[string, string, 0 | 8]>): Promise<Uint8Array<ArrayBuffer>> {
  const enc = new TextEncoder(), parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text, method] of files) {
    const raw = enc.encode(text), data = method === 8 ? await deflateRaw(raw) : raw, n = enc.encode(name);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(8, method, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, raw.length, true); lh.setUint16(26, n.length, true);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(10, method, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, raw.length, true); ch.setUint16(28, n.length, true); ch.setUint32(42, offset, true);
    parts.push(new Uint8Array(lh.buffer), n, data);
    central.push(new Uint8Array(ch.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

describe('dates after today', () => {
  it('are left out of an import and counted', () => {
    const p = parseAnyCSV('date,weight_kg\n2026-10-19,80.4\n2026-10-20,80.2\n2027-10-21,80.0\n');
    const { entries, future } = toEntries(p, 'kg', Date.UTC(2026, 9, 20, 12));
    expect(entries.map(e => e.date)).toEqual(['2026-10-19', '2026-10-20']);
    expect(future).toBe(1);
  });
});
