import { describe, expect, it } from 'vitest';
import { parseLogLink } from './logLink';

const parse = (query: string, unit: 'kg' | 'lb' | 'st' = 'kg') => parseLogLink(new URLSearchParams(query), unit, '2026-10-20');

describe('log link', () => {
  it('ignores links without a weight', () => {
    expect(parse('')).toBeUndefined();
    expect(parse('action=log')).toBeUndefined();
  });

  it('reads a weight in the app unit, for today', () => {
    expect(parse('log=84.2')).toEqual({ kg: 84.2, date: '2026-10-20' });
    expect(parse('log=84,2')).toEqual({ kg: 84.2, date: '2026-10-20' });
    expect(parse('log=185.6', 'lb')!.kg).toBeCloseTo(84.19, 2);
  });

  it('uses a unit, date and note from the link', () => {
    expect(parse('log=185.6&unit=LBS&date=2026-10-19&note=+after+a+run+')).toEqual({ kg: 84.19, date: '2026-10-19', note: 'after a run' });
    expect(parse('log=13.25&unit=st')!.kg).toBeCloseTo(84.14, 2);
    expect(parse('log=84&unit=kg', 'lb')).toEqual({ kg: 84, date: '2026-10-20' });
  });

  it('rejects anything it can not use', () => {
    for (const q of ['log=', 'log=abc', 'log=84kg', 'log=-80', 'log=1e2', 'log=84&unit=grams', 'log=15', 'log=401',
      'log=84&date=2026-10-21', 'log=84&date=2026-02-30', 'log=84&date=yesterday']) {
      expect(parse(q), q).toBeNull();
    }
  });

  it('keeps notes to 500 characters', () => {
    expect(parse('log=84&note=' + 'x'.repeat(600))!.note).toHaveLength(500);
  });
});
