import { describe, expect, it } from 'vitest';
import { formatBRL, type MonthSummary } from '@effinance/shared';
import { changeParts, marginText, monthlySeries, netWorthText } from './kpi-logic';

const month = (m: string, income: number, expense: number, net: number): MonthSummary => ({
  month: m,
  income,
  expense,
  net,
  savingsRate: income ? net / income : null,
  paidIncome: 0,
  paidExpense: 0,
  pendingIncome: 0,
  pendingExpense: 0,
});

describe('changeParts', () => {
  it('colours a rise green, or red when a rise is bad', () => {
    expect(changeParts(0.2, 'percent')).toEqual({ text: '+20,0%', tone: 'success', up: true });
    expect(changeParts(0.2, 'percent', true)?.tone).toBe('danger');
    expect(changeParts(-0.022, 'percent', true)).toEqual({ text: '-2,2%', tone: 'success', up: false });
  });

  it('keeps a flat change grey, writes points for rates and has nothing without a base', () => {
    expect(changeParts(0.0001, 'percent')?.tone).toBe('muted');
    expect(changeParts(0.176, 'pp')).toMatchObject({ text: '+17,6 p.p.', tone: 'success', up: true });
    expect(changeParts(null, 'percent')).toBeNull();
    expect(changeParts(undefined, 'percent')).toBeNull();
  });
});

describe('strip footers', () => {
  it('takes one series of the last months', () => {
    expect(monthlySeries([month('2026-10', 100, 40, 60), month('2026-11', 200, 50, 150)], 'net')).toEqual([60, 150]);
  });

  it('writes the margin with its change in points', () => {
    expect(marginText({ savingsRate: 0.226 }, { savingsRate: 0.05 })).toBe('margem 22,6% · +17,6 p.p. vs mês anterior');
    expect(marginText({ savingsRate: 0.226 }, { savingsRate: null })).toBe('margem 22,6%');
    expect(marginText({ savingsRate: null }, { savingsRate: 0.05 })).toBe('sem receitas no mês');
  });

  it('breaks the net worth down (there is no balance history to compare)', () => {
    expect(netWorthText({ accounts: 6465386, investments: 4500000, cardDebt: 0, netWorth: 10965386 })).toBe(
      `Em contas ${formatBRL(6465386)} · investido ${formatBRL(4500000)}`,
    );
    expect(netWorthText({ accounts: 6465386, investments: 4500000, cardDebt: 120000, netWorth: 10845386 })).toBe(
      `Em contas ${formatBRL(6465386)} · investido ${formatBRL(4500000)} · cartão −${formatBRL(120000)}`,
    );
  });
});
