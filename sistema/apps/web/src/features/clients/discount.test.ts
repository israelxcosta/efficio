import { describe, expect, it } from 'vitest';
import { bpsToPercentInput, parsePercentToBps } from './discount';

describe('parsePercentToBps', () => {
  it('reads whole and decimal percentages, with comma or dot', () => {
    expect(parsePercentToBps('5')).toBe(500);
    expect(parsePercentToBps(' 2,5 ')).toBe(250);
    expect(parsePercentToBps('2.75%')).toBe(275);
    expect(parsePercentToBps('99,99')).toBe(9999);
  });
  it('rejects zero, 100% or more, negatives and text', () => {
    for (const v of ['', '0', '0,00', '100', '150', '-5', 'abc', '1,234']) expect(parsePercentToBps(v)).toBeNull();
  });
});

describe('bpsToPercentInput', () => {
  it('formats basis points for the field', () => {
    expect(bpsToPercentInput(500)).toBe('5');
    expect(bpsToPercentInput(250)).toBe('2,5');
    expect(bpsToPercentInput(0)).toBe('');
  });
});
