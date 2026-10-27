import { describe, expect, it } from 'vitest';
import type { Transaction } from '@effinance/shared';
import { analyzeClient, clientFinding, clientReceivables, paymentBuckets, paymentMap, periodScore, trendText, yearSummaries } from './client-report';

const today = '2026-10-27';
let n = 0;
const tx = (extra: Partial<Transaction>) =>
  ({
    id: `t${++n}`,
    type: 'income',
    description: 'Honorários',
    amount: 100000,
    date: '2026-10-10',
    paid: false,
    paidAt: null,
    lateFeeOf: null,
    discountOf: null,
    lateFees: null,
    discount: null,
    feeCompetence: null,
    feeKind: 'fee',
    ...extra,
  }) as Transaction;

describe('clientReceivables', () => {
  it('classifies each receivable by how and when it was paid', () => {
    const list = clientReceivables(
      [
        tx({ date: '2026-08-10', paid: true, paidAt: '2026-08-08', discount: 5000 }),
        tx({ date: '2026-09-10', paid: true, paidAt: '2026-09-25', lateFees: { interest: 500, fine: 2000 } }),
        tx({ date: '2026-10-10' }),
        tx({ date: '2026-11-10' }),
      ],
      today,
    );
    expect(list.map((r) => [r.dueDate, r.status, r.daysLate, r.daysEarly, r.received])).toEqual([
      ['2026-11-10', 'aberto', 0, 0, 0],
      ['2026-10-10', 'vencido', 17, 0, 0],
      ['2026-09-10', 'atrasado', 15, 0, 102500],
      ['2026-08-10', 'em_dia', 0, 2, 95000],
    ]);
  });

  it('leaves out expenses and the rows that only carry interest, fines or discounts', () => {
    const list = clientReceivables(
      [tx({}), tx({ lateFeeOf: 'x', lateFeeKind: 'interest' }), tx({ type: 'expense', discountOf: 'x' }), tx({ type: 'expense' }), tx({ creditCardId: 'c' })],
      today,
    );
    expect(list).toHaveLength(1);
  });
});

describe('analyzeClient', () => {
  const list = clientReceivables(
    [
      tx({ date: '2026-03-10', paid: true, paidAt: '2026-03-30' }),
      tx({ date: '2026-04-10', paid: true, paidAt: '2026-04-20' }),
      tx({ date: '2026-05-10', paid: true, paidAt: '2026-05-10' }),
      tx({ date: '2026-08-10', paid: true, paidAt: '2026-08-08', discount: 5000 }),
      tx({ date: '2026-09-10', paid: true, paidAt: '2026-09-25', lateFees: { interest: 500, fine: 2000 } }),
      tx({ date: '2026-10-10' }),
      tx({ date: '2026-11-10' }),
    ],
    today,
  );
  const a = analyzeClient(list, today);

  it('adds up what was billed, received, open and overdue', () => {
    expect(a).toMatchObject({ billed: 700000, open: 200000, overdue: 100000, interest: 500, fine: 2000, discount: 5000 });
    expect(a.received).toBe(300000 + 95000 + 102500);
    expect(a).toMatchObject({ count: 7, paidCount: 5, onTimeCount: 2, paidLateCount: 3, overdueCount: 1, openCount: 2 });
  });

  it('measures punctuality and lateness over what fell due', () => {
    expect(a.punctuality).toBeCloseTo(2 / 6);
    expect(a.maxDaysLate).toBe(20);
    expect(a.avgDaysLate).toBe(Math.round(((20 + 10 + 15 + 17) / 4) * 10) / 10);
    expect(a.avgPaymentOffset).toBe(Math.round(((20 + 10 + 0 - 2 + 15) / 5) * 10) / 10);
    expect(a.firstDue).toBe('2026-03-10');
    expect(a.lastPayment).toBe('2026-09-25');
  });

  it('fills every month from the first due date to the last one', () => {
    expect(a.months.map((m) => m.month)).toEqual(['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(a.months.find((m) => m.month === '2026-06')).toMatchObject({ billed: 0, dueCount: 0, avgDaysLate: null });
    expect(a.months.find((m) => m.month === '2026-10')).toMatchObject({ overdue: true, lateCount: 1, avgDaysLate: 17 });
  });

  it('scores the delinquency report window, like its row', () => {
    expect(a.scoreMonths).toBe(12);
    expect(a.score.score).toBeGreaterThan(0);
    expect(a.score.score).toBeLessThan(800);
    // Only what fell due inside the window counts (the overdue item counts whatever its date).
    const short = periodScore(list, today, 3);
    const full = periodScore(list, today, 12);
    expect(short.score).not.toBe(full.score);
  });

  it('spreads the payments by how many days after the due date they came', () => {
    const buckets = Object.fromEntries(paymentBuckets(list).map((b) => [b.key, b.count]));
    expect(buckets).toEqual({ early: 1, due: 1, '1-5': 0, '6-15': 2, '16-30': 1, '31-60': 0, '60+': 0 });
  });

  it('maps each due month of each year to its worst status', () => {
    const map = paymentMap(list);
    expect(map.map((y) => y.year)).toEqual([2026]);
    const cell = (m: string) => map[0]!.cells.find((c) => c.month === m)!;
    expect(cell('2026-01').status).toBeNull();
    expect(cell('2026-03')).toMatchObject({ status: 'atrasado', daysLate: 20, count: 1 });
    expect(cell('2026-05').status).toBe('em_dia');
    expect(cell('2026-10').status).toBe('vencido');
    expect(cell('2026-11').status).toBe('aberto');
  });

  it('sums each year, newest first', () => {
    const years = yearSummaries(
      clientReceivables([...list.map((r) => tx({ date: r.dueDate, paid: r.paidAt !== null, paidAt: r.paidAt })), tx({ date: '2025-12-10', paid: true, paidAt: '2025-12-09' })], today),
    );
    expect(years.map((y) => y.year)).toEqual([2026, 2025]);
    expect(years[0]).toMatchObject({ count: 7, dueCount: 6, onTimeCount: 2, lateCount: 4, billed: 700000 });
    expect(years[1]).toMatchObject({ count: 1, onTimeCount: 1, lateCount: 0, avgDaysLate: null, received: 100000 });
  });

  it('opens with punctuality, lateness and what is overdue', () => {
    expect(clientFinding(a)).toBe(
      'Pagou 2 de 6 cobranças no prazo (33%); quando atrasa, leva em média 15,5 dias (máx. 20 dias). 1 cobrança vencida em aberto, R$ 1.000,00, a mais antiga há 17 dias.',
    );
    const good = analyzeClient(clientReceivables([tx({ date: '2026-09-10', paid: true, paidAt: '2026-09-10' })], today), today);
    expect(clientFinding(good)).toBe('Pagou a única cobrança vencida no prazo. Nada vencido em aberto.');
    expect(clientFinding(analyzeClient([], today))).toBe('Nenhuma cobrança registrada para este cliente.');
  });
});

describe('trendText', () => {
  it('compares the last 6 months with the 6 before', () => {
    expect(trendText({ recentLateRate: 0.1, previousLateRate: 0.4 })).toBe('Atrasos caíram de 40% para 10% (últimos 6 meses contra os 6 anteriores)');
    expect(trendText({ recentLateRate: 0.5, previousLateRate: 0.2 })).toContain('subiram de 20% para 50%');
    expect(trendText({ recentLateRate: 0.22, previousLateRate: 0.2 })).toContain('estáveis');
    expect(trendText({ recentLateRate: 0.2, previousLateRate: null })).toBeNull();
  });
});
