import { describe, expect, it } from 'vitest';
import { m } from '@/features/reports/evolution/test-fixtures';
import { evolutionMonthsFor, labelTicks, statementHref, withActiveClients } from './cashflow-card';

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

describe('Clientes ativos no Fluxo de caixa', () => {
  it('asks the evolution for the 6 months of the chart, up to 36', () => {
    expect(evolutionMonthsFor('2026-11', '2026-11')).toBe(6);
    expect(evolutionMonthsFor('2026-05', '2026-11')).toBe(12);
    expect(evolutionMonthsFor('2023-01', '2026-11')).toBe(36);
    expect(evolutionMonthsFor('2027-02', '2026-11')).toBe(6);
  });

  it('puts the active clients of each month on its row, null where the evolution has none', () => {
    expect(withActiveClients([{ start: '2026-09-01' }, { start: '2026-10-01' }], m)).toEqual([
      { start: '2026-09-01', clientes: 4, clientesDiff: 2 },
      { start: '2026-10-01', clientes: 3, clientesDiff: -1 },
    ]);
    expect(withActiveClients([{ start: '2026-06-01' }], m)[0]).toMatchObject({ clientes: null, clientesDiff: null });
    expect(withActiveClients([{ start: '2026-10-01' }], undefined)[0]).toMatchObject({ clientes: null });
  });
});
