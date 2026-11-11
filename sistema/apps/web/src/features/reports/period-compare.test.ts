import { describe, expect, it } from 'vitest';
import { overviewChanges, previousRange } from './period-compare';

describe('previousRange', () => {
  it('takes the same number of whole months before', () => {
    expect(previousRange('2026-11-01', '2026-11-30')).toEqual({ from: '2026-10-01', to: '2026-10-31', label: 'vs outubro' });
    expect(previousRange('2026-01-01', '2026-03-31')).toEqual({ from: '2025-10-01', to: '2025-12-31', label: 'vs 3 meses anteriores' });
  });

  it('takes the same number of days before any other range', () => {
    expect(previousRange('2026-11-05', '2026-11-14')).toEqual({ from: '2026-10-26', to: '2026-11-04', label: 'vs 10 dias anteriores' });
  });
});

describe('overviewChanges', () => {
  const now = { income: 120_000, expense: 90_000, net: 30_000, savingsRate: 0.25, averageDailyExpense: 3_000 };
  const before = { income: 100_000, expense: 100_000, net: 0, savingsRate: 0, averageDailyExpense: 3_333 };

  it('compares each figure, an expense rise being bad and the margin in points', () => {
    const c = overviewChanges(now, before);
    expect(c.income).toMatchObject({ text: '+20,0%', tone: 'success' });
    expect(c.expense).toMatchObject({ text: '-10,0%', tone: 'success' });
    expect(c.net).toMatchObject({ text: '+R$ 300,00', tone: 'success' });
    expect(c.savingsRate).toMatchObject({ text: '+25,0 p.p.', tone: 'success' });
    expect(c.averageDailyExpense?.tone).toBe('success');
  });

  it('has nothing to compare without the previous period', () => {
    expect(overviewChanges(now, undefined)).toEqual({ income: null, expense: null, net: null, savingsRate: null, averageDailyExpense: null });
    expect(overviewChanges(now, { ...before, income: 0, savingsRate: null }).income).toBeNull();
  });
});
