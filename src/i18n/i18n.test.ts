import { afterEach, describe, expect, it } from 'vitest';
import { fmtDate } from '../lib/dates';
import { fmtInt } from '../lib/format';
import { fmtDelta, fmtW } from '../lib/units';
import { cs } from './cs';
import { en, type Plural } from './en';
import { detectLang, setLang, t, tn } from './index';

afterEach(() => setLang('en'));

describe('dictionaries', () => {
  it('has a Czech text for every English key, and nothing extra', () => {
    expect(Object.keys(cs).sort()).toEqual(Object.keys(en).sort());
  });

  it('gives Czech plural entries the few and other forms', () => {
    for (const [k, v] of Object.entries(en)) {
      if (typeof v === 'string') { expect(typeof cs[k as keyof typeof en], k).toBe('string'); continue; }
      const c = cs[k as keyof typeof en] as Plural;
      expect(c.one && c.few && c.other, k).toBeTruthy();
    }
  });

  it('keeps the same {placeholders} in both languages', () => {
    const names = (s: string | Plural) => [...new Set((typeof s === 'string' ? s : Object.values(s).join(' ')).match(/\{\w+\}/g) ?? [])].sort();
    for (const k of Object.keys(en) as Array<keyof typeof en>) expect(names(cs[k]), k).toEqual(names(en[k]));
  });
});

describe('translation', () => {
  it('fills placeholders', () => {
    expect(t('entry.logged', { w: '80.0 kg' })).toBe('Logged 80.0 kg');
    setLang('cs');
    expect(t('entry.logged', { w: '80,0 kg' })).toBe('Zapsáno 80,0 kg');
  });

  it('uses Czech plural forms', () => {
    setLang('cs');
    expect([1, 2, 4, 5, 21].map(n => tn('week.days', n))).toEqual(['1 den', '2 dny', '4 dny', '5 dní', '21 dní']);
    expect(tn('backup.profiles', 3)).toBe('3 profily');
    setLang('en');
    expect([1, 2].map(n => tn('week.days', n))).toEqual(['1 day', '2 days']);
  });

  it('formats numbers and dates for the language', () => {
    setLang('cs');
    expect(fmtW(84.1, 'kg')).toBe('84,1 kg');
    expect(fmtDelta(-1.25, 'kg', 2)).toBe('−1,25 kg');
    expect(fmtInt(1840)).toMatch(/^1\s840$/);
    expect(fmtDate('2026-10-19', { month: 'long', year: 'numeric' })).toBe('říjen 2026');
  });

  it('picks Czech for Czech and Slovak browsers, English otherwise', () => {
    expect(detectLang(['cs-CZ'])).toBe('cs');
    expect(detectLang(['sk'])).toBe('cs');
    expect(detectLang(['de-DE', 'en-GB'])).toBe('en');
    expect(detectLang(['fr'])).toBe('en');
  });
});
