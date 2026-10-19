import { describe, expect, it } from 'vitest';
import { fmtDelta, fmtLen, fmtPace, fmtW, fromDisp, lenDelta, splitStone } from './units';

describe('weight formatting', () => {
  it('formats kilograms and pounds', () => {
    expect(fmtW(80, 'kg')).toBe('80.0 kg');
    expect(fmtW(80, 'lb')).toBe('176.4 lb');
    expect(fmtW(80, 'kg', false)).toBe('80.0');
    expect(fmtW(null, 'kg')).toBe('—');
  });

  it('formats stones and pounds', () => {
    expect(fmtW(80, 'st')).toBe('12 st 8.4 lb');
  });

  it('carries 14 lb over to the next stone instead of showing "9 st 14.0 lb"', () => {
    expect(splitStone(63.5)).toEqual({ st: 10, lb: 0 });
  });

  it('round-trips display values', () => {
    expect(fromDisp(176.37, 'lb')).toBeCloseTo(80, 2);
    expect(fromDisp(80, 'kg')).toBe(80);
  });

  it('signs differences, showing differences in pounds for stones', () => {
    expect(fmtDelta(-1.234, 'kg')).toBe('−1.2 kg');
    expect(fmtDelta(2, 'kg')).toBe('+2.0 kg');
    expect(fmtDelta(0.01, 'kg')).toBe('±0.0 kg');
    expect(fmtDelta(-1, 'st')).toBe('−2.2 lb');
  });
});

describe('pace formatting', () => {
  it('keeps quarter-kilo paces exact', () => {
    expect(fmtPace(-0.25, 'kg')).toBe('0.25 kg');
    expect(fmtPace(-0.25, 'kg', true)).toBe('−0.25 kg');
    expect(fmtPace(0.5, 'kg', true)).toBe('+0.5 kg');
    expect(fmtPace(-1, 'lb')).toBe('2.2 lb');
    expect(fmtPace(-0.25, 'st')).toBe('0.55 lb');
  });
});

describe('length formatting', () => {
  it('uses centimetres for metric and inches otherwise', () => {
    expect(fmtLen(100, 'kg')).toBe('100.0 cm');
    expect(fmtLen(100, 'lb')).toBe('39.4 in');
    expect(lenDelta(-2.54, 'lb')).toBe('−1.0 in');
  });
});
