// MoneyInput (QA #1): the value is always built from the right (cents), wherever the caret is.
import { formatDecimal } from '@effinance/shared';
import { describe, expect, it } from 'vitest';
import { nextMoneyCents, parsePastedMoney } from './money-input';

/** Types `char` with the caret at `caret` (or replacing [caret, end)), the way the browser edits the text. */
function type(cents: number, char: string, caret: number | 'end', end?: number): number {
  const display = formatDecimal(cents);
  const at = caret === 'end' ? display.length : caret;
  const raw = display.slice(0, at) + char + display.slice(end ?? at);
  return nextMoneyCents(cents, display, raw) ?? cents;
}

function backspace(cents: number, caret: number | 'end'): number {
  const display = formatDecimal(cents);
  const at = caret === 'end' ? display.length : caret;
  if (at === 0) return cents;
  const raw = display.slice(0, at - 1) + display.slice(at);
  return nextMoneyCents(cents, display, raw) ?? cents;
}

describe('nextMoneyCents', () => {
  it('fills from the right when typing at the end', () => {
    let v = 0;
    for (const d of '12345') v = type(v, d, 'end');
    expect(v).toBe(12345);
    expect(formatDecimal(v)).toBe('123,45');
  });

  it('never multiplies by 1000 when the caret is at the start (autofocus) or in the middle', () => {
    let v = 0;
    for (const d of '12345') v = type(v, d, 0);
    expect(v).toBe(12345);

    let w = 0;
    for (const d of '12345') w = type(w, d, Math.floor(formatDecimal(w).length / 2));
    expect(w).toBe(12345);
  });

  it('appends on the right after a click in the middle of an existing value', () => {
    // "1.234,56" with the caret between 2 and 3 → typing 7 gives 12.345,67.
    expect(type(123456, '7', 3)).toBe(1234567);
  });

  it('backspace always drops the last digit, wherever the caret is', () => {
    expect(backspace(12345, 'end')).toBe(1234);
    expect(backspace(12345, 1)).toBe(1234);
    expect(backspace(12345, 3)).toBe(1234);
    expect(backspace(5, 'end')).toBe(0);
    expect(backspace(0, 'end')).toBe(0);
  });

  it('typing over the whole selection starts over', () => {
    const display = formatDecimal(123456);
    expect(type(123456, '7', 0, display.length)).toBe(7);
  });

  it('ignores letters and separators, and stops at 13 digits', () => {
    expect(nextMoneyCents(1234, '12,34', '12,34a')).toBeNull();
    expect(nextMoneyCents(1234, '12,34', '1234')).toBeNull();
    const max = 9_999_999_999_999;
    expect(nextMoneyCents(max, formatDecimal(max), formatDecimal(max) + '1')).toBeNull();
  });
});

describe('parsePastedMoney', () => {
  it('reads pasted amounts as reais', () => {
    expect(parsePastedMoney('1.234,56')).toBe(123456);
    expect(parsePastedMoney('R$ 1.234,56')).toBe(123456);
    expect(parsePastedMoney('1234,5')).toBe(123450);
    expect(parsePastedMoney('1234.56')).toBe(123456);
    expect(parsePastedMoney('1.234')).toBe(123400);
    expect(parsePastedMoney('1.234.567')).toBe(123456700);
    expect(parsePastedMoney('80')).toBe(8000);
    expect(parsePastedMoney('0,05')).toBe(5);
  });

  it('returns null without a number', () => {
    expect(parsePastedMoney('abc')).toBeNull();
    expect(parsePastedMoney('')).toBeNull();
  });
});
