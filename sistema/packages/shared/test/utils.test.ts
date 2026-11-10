import { describe, expect, it } from 'vitest';
import {
  addMonths,
  daysLate,
  clientScore,
  delinquencyScore,
  DELINQUENCY_RISK_LABELS,
  lateSeverity,
  riskOf,
  SCORE_WINDOW_MONTHS,
  suggestLateFees,
  discountAmount,
  earnsDiscount,
  formatBps,
  enumeratePeriods,
  getInvoiceForPurchase,
  isValidCPF,
  occurrenceDate,
  splitInstallments,
  startOfWeek,
  formatBRL,
  parseMoney,
  transactionInputSchema,
} from '../src';

describe('dates', () => {
  it('keeps the anchor day across short months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(occurrenceDate('2026-01-31', 'monthly', 2)).toBe('2026-03-31');
    expect(occurrenceDate('2024-02-29', 'annual', 1)).toBe('2025-02-28');
    expect(occurrenceDate('2026-01-10', 'semiannual', 1)).toBe('2026-07-10');
    expect(occurrenceDate('2026-01-10', 'weekly', 3)).toBe('2026-01-31');
  });

  it('starts weeks on Sunday', () => {
    expect(startOfWeek('2026-10-20')).toBe('2026-10-18');
  });

  it('enumerates periods', () => {
    const months = enumeratePeriods('2026-01-15', '2026-03-02', 'month');
    expect(months.map((p) => p.key)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(months[1]).toMatchObject({ start: '2026-02-01', end: '2026-02-28', label: 'Fev/26' });
  });
});

describe('money', () => {
  it('splits installments keeping the total', () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitInstallments(10000, 3).reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('formats and parses BRL', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(parseMoney('1.234,56')).toBe(123456);
    expect(parseMoney('R$ 10')).toBe(1000);
  });
});

describe('invoice', () => {
  it('assigns purchases to the right invoice (closing 5, due 12)', () => {
    expect(getInvoiceForPurchase('2026-10-04', 5, 12)).toEqual({
      month: '2026-10',
      closingDate: '2026-10-05',
      dueDate: '2026-10-12',
    });
    // on the closing day → next invoice
    expect(getInvoiceForPurchase('2026-10-05', 5, 12).month).toBe('2026-11');
  });

  it('handles due day before closing day (closing 28, due 5)', () => {
    expect(getInvoiceForPurchase('2026-10-27', 28, 5)).toEqual({
      month: '2026-11',
      closingDate: '2026-10-28',
      dueDate: '2026-11-05',
    });
    expect(getInvoiceForPurchase('2026-10-28', 28, 5).month).toBe('2026-12');
  });

  it('clamps closing day 31 in short months', () => {
    expect(getInvoiceForPurchase('2026-02-27', 31, 10)).toMatchObject({
      month: '2026-03',
      closingDate: '2026-02-28',
    });
  });
});

describe('documents', () => {
  it('validates CPF', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true);
    expect(isValidCPF('111.111.111-11')).toBe(false);
    expect(isValidCPF('529.982.247-24')).toBe(false);
  });
});

describe('schemas', () => {
  it('rejects card on income and requires installments', () => {
    const base = { description: 'x', amount: 100, date: '2026-10-20' };
    expect(
      transactionInputSchema.safeParse({ ...base, type: 'income', creditCardId: '0198f1d2-7a3b-7c4d-8e5f-0a1b2c3d4e5f' }).success,
    ).toBe(false);
    expect(transactionInputSchema.safeParse({ ...base, type: 'expense', recurrenceKind: 'installment' }).success).toBe(false);
    const ok = transactionInputSchema.parse({ ...base, type: 'expense' });
    expect(ok).toMatchObject({ paid: false, recurrenceKind: 'single', frequency: 'monthly', accountId: null });
  });
});

describe('late fees', () => {
  it('counts the days after the due date', () => {
    expect(daysLate('2026-01-15', '2026-01-15')).toBe(0);
    expect(daysLate('2026-01-15', '2026-01-10')).toBe(0);
    expect(daysLate('2026-01-15', '2026-02-14')).toBe(30);
  });

  it('suggests a 2% fine and 1% a month of interest, pro rata', () => {
    expect(suggestLateFees(35000, '2026-01-15', '2026-02-14')).toEqual({ fine: 700, interest: 350, days: 30 });
    expect(suggestLateFees(37800, '2026-01-15', '2026-01-25')).toEqual({ fine: 756, interest: 126, days: 10 });
    expect(suggestLateFees(35000, '2026-01-15', '2026-01-15')).toEqual({ fine: 0, interest: 0, days: 0 });
  });
});

describe('discount for paying on time', () => {
  it('computes basis points of an amount, rounded to the cent', () => {
    expect(discountAmount(78000, 200)).toBe(1560);
    expect(discountAmount(240000, 500)).toBe(12000);
    expect(discountAmount(12345, 250)).toBe(309); // 308.625
    expect(discountAmount(78000, 0)).toBe(0);
    expect(discountAmount(78000, null)).toBe(0);
  });

  it('is earned up to the due date', () => {
    expect(earnsDiscount('2026-11-10', '2026-11-09')).toBe(true);
    expect(earnsDiscount('2026-11-10', '2026-11-10')).toBe(true);
    expect(earnsDiscount('2026-11-10', '2026-11-11')).toBe(false);
  });

  it('formats basis points as a percentage', () => {
    expect(formatBps(500)).toBe('5%');
    expect(formatBps(250)).toBe('2,5%');
    expect(formatBps(1)).toBe('0,01%');
  });
});

describe('delinquency score', () => {
  const months = (n: number, daysLate: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ monthsAgo: i, daysLate: daysLate(i) }));

  it('grades a delay by how long it was', () => {
    expect([0, 1, 5, 6, 15, 16, 30, 31, 184].map(lateSeverity)).toEqual([0, 0.25, 0.25, 0.5, 0.5, 0.75, 0.75, 1, 1]);
  });

  it('starts a client without history at 800, low risk', () => {
    expect(delinquencyScore([], 0)).toEqual({ probability: 0.2, score: 800, risk: 'baixo', lowHistory: true, punctuality: 800, openPenalty: 0 });
    expect(DELINQUENCY_RISK_LABELS.baixo).toBe('Baixo risco');
    expect(SCORE_WINDOW_MONTHS).toBe(12);
  });

  it('rewards a year paid on time', () => {
    const s = delinquencyScore(months(12, () => 0), 0);
    expect(s.probability).toBeLessThan(0.1);
    expect(s).toMatchObject({ score: 916, punctuality: 916, risk: 'baixo', lowHistory: false });
  });

  it('weighs recent delays more than old ones', () => {
    const recent = delinquencyScore(months(12, (i) => (i < 3 ? 10 : 0)), 0);
    const old = delinquencyScore(months(12, (i) => (i >= 9 ? 10 : 0)), 0);
    expect(recent.probability).toBeGreaterThan(old.probability);
    expect(recent.score).toBeLessThan(old.score);
  });

  it('separates short delays from long ones', () => {
    expect(delinquencyScore(months(12, () => 5), 0)).toMatchObject({ score: 771, risk: 'moderado' });
    expect(delinquencyScore(months(12, () => 45), 0)).toMatchObject({ score: 337, risk: 'critico' });
    expect(delinquencyScore(months(8, (i) => (i === 3 ? 18 : 0)), 0)).toMatchObject({ score: 855, risk: 'baixo' });
  });

  it('keeps the chance of paying late about any delay', () => {
    expect(delinquencyScore(months(12, () => 5), 0).probability).toBeCloseTo(delinquencyScore(months(12, () => 45), 0).probability);
  });

  it('takes 50 per open item, up to 250', () => {
    expect(delinquencyScore(months(12, () => 5), 2)).toMatchObject({ score: 671, openPenalty: 100 });
    expect(delinquencyScore(months(12, () => 0), 8)).toMatchObject({ score: 666, openPenalty: 250 });
  });

  it('never goes below zero', () => {
    const s = delinquencyScore(months(10, (i) => (i < 8 ? 30 * (8 - i) : 0)), 8);
    expect(s.risk).toBe('critico');
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(clientScore(months(10, (i) => (i < 8 ? 30 * (8 - i) : 0)), 8, { last90Days: 9, last12Months: 9 }).score).toBe(0);
  });

  it('maps scores to risk bands', () => {
    expect([1000, 800, 799, 600, 599, 400, 399, 0].map(riskOf)).toEqual(['baixo', 'baixo', 'moderado', 'moderado', 'alto', 'alto', 'critico', 'critico']);
  });
});
