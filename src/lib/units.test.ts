import { describe, expect, it } from 'vitest';
import { fmtDelta, fmtLen, fmtPace, fmtW, fromDisp, lenDelta, splitStone } from './units';

describe('weight formatting', () => {
  it('formats kilograms and pounds', () => {
    expect(fmtW(80, 'kg')).toBe('80.0\u00a0kg');
    expect(fmtW(80, 'lb')).toBe('176.4\u00a0lb');
    expect(fmtW(80, 'kg', false)).toBe('80.0');
    expect(fmtW(null, 'kg')).toBe('—');
  });

  it('formats stones and pounds', () => {
    expect(fmtW(80, 'st')).toBe('12\u00a0st 8.4\u00a0lb');
  });

  it('carries 14 lb over to the next stone instead of showing "9 st 14.0 lb"', () => {
    expect(splitStone(63.5)).toEqual({ st: 10, lb: 0 });
  });

  it('round-trips display values', () => {
    expect(fromDisp(176.37, 'lb')).toBeCloseTo(80, 2);
    expect(fromDisp(80, 'kg')).toBe(80);
  });

  it('signs differences, showing differences in pounds for stones', () => {
    expect(fmtDelta(-1.234, 'kg')).toBe('−1.2\u00a0kg');
    expect(fmtDelta(2, 'kg')).toBe('+2.0\u00a0kg');
    expect(fmtDelta(0.01, 'kg')).toBe('±0.0\u00a0kg');
    expect(fmtDelta(-1, 'st')).toBe('−2.2\u00a0lb');
  });
});

describe('pace formatting', () => {
  it('keeps quarter-kilo paces exact', () => {
    expect(fmtPace(-0.25, 'kg')).toBe('0.25\u00a0kg');
    expect(fmtPace(-0.25, 'kg', true)).toBe('−0.25\u00a0kg');
    expect(fmtPace(0.5, 'kg', true)).toBe('+0.5\u00a0kg');
    expect(fmtPace(-1, 'lb')).toBe('2.2\u00a0lb');
    expect(fmtPace(-0.25, 'st')).toBe('0.55\u00a0lb');
  });
});

describe('length formatting', () => {
  it('uses centimetres for metric and inches otherwise', () => {
    expect(fmtLen(100, 'kg')).toBe('100.0\u00a0cm');
    expect(fmtLen(100, 'lb')).toBe('39.4\u00a0in');
    expect(lenDelta(-2.54, 'lb')).toBe('−1.0\u00a0in');
  });
});
