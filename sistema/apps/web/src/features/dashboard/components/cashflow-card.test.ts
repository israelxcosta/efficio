import { describe, expect, it } from 'vitest';
import { labelTicks, statementHref } from './cashflow-card';

describe('statementHref', () => {
  it('opens the statement on the period of the clicked bar', () => {
    expect(statementHref('D', '2026-10-21')).toBe('/extrato?modo=day&data=2026-10-21');
    expect(statementHref('S', '2026-10-19')).toBe('/extrato?modo=week&data=2026-10-19');
    expect(statementHref('M', '2026-10-01')).toBe('/extrato?modo=month&data=2026-10-01');
    expect(statementHref('A', '2026-01-01')).toBe('/extrato?modo=year&data=2026-01-01');
  });

  it('normalizes month and year anchors to their first day', () => {
    expect(statementHref('M', '2026-10-15')).toBe('/extrato?modo=month&data=2026-10-01');
    expect(statementHref('A', '2026-07-09')).toBe('/extrato?modo=year&data=2026-01-01');
  });
});

describe('labelTicks', () => {
  const days = Array.from({ length: 14 }, (_, i) => ({ label: `${String(i + 9).padStart(2, '0')}/10` }));

  it('waits for a measured width', () => {
    expect(labelTicks(days, 0)).toBeUndefined();
    expect(labelTicks([], 300)).toBeUndefined();
  });

  it('keeps every label when there is room', () => {
    expect(labelTicks(days, 14 * 58)).toHaveLength(14);
  });

  it('skips labels evenly and always keeps the latest period', () => {
    const ticks = labelTicks(days, 300)!;
    expect(ticks.at(-1)).toBe('22/10');
    expect(ticks.length).toBeLessThanOrEqual(Math.floor(300 / 53));
    expect(ticks).toEqual(['10/10', '13/10', '16/10', '19/10', '22/10']);
  });

  it('gives short labels (months, years) less room than dd/mm', () => {
    const months = ['Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out'].map((label) => ({ label }));
    expect(labelTicks(months, 6 * 40)).toHaveLength(6);
    expect(labelTicks(days.slice(0, 6), 6 * 40)!.length).toBeLessThan(6);
  });
});
