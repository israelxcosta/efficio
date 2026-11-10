// Month-by-month evolution of the client base (new, churned, active, recurring fees) and the client
// score with the rework penalty: pure rules shared by the API (reports) and the web.

import { describe, expect, it } from 'vitest';
import {
  clientBaseEvolution,
  clientScore,
  delinquencyScore,
  evolutionChange,
  evolutionComparison,
  EVOLUTION_METRIC_LABELS,
  evolutionReportQuerySchema,
  reworkPenalty,
  reworkWindows,
  taskCategoryInputSchema,
  type EvolutionClient,
  type EvolutionMonth,
} from '../src';

describe('rework windows and penalty', () => {
  it('counts the last 90 days and the last 12 months, today included', () => {
    expect(reworkWindows('2026-10-20')).toEqual({ recentFrom: '2026-07-23', yearFrom: '2025-10-21' });
    // Leap day: 12 months back from 2028-02-29 is 2027-02-28, so the window starts on 2027-03-01.
    expect(reworkWindows('2028-02-29').yearFrom).toBe('2027-03-01');
  });

  it('takes 40 points per rework in the last 90 days and 10 per older one in 12 months, up to 200', () => {
    expect(reworkPenalty({ last90Days: 0, last12Months: 0 })).toBe(0);
    expect(reworkPenalty({ last90Days: 1, last12Months: 1 })).toBe(40);
    expect(reworkPenalty({ last90Days: 0, last12Months: 3 })).toBe(30);
    expect(reworkPenalty({ last90Days: 2, last12Months: 5 })).toBe(110);
    expect(reworkPenalty({ last90Days: 5, last12Months: 5 })).toBe(200);
    expect(reworkPenalty({ last90Days: 6, last12Months: 10 })).toBe(200);
    expect(reworkPenalty({ last90Days: 0, last12Months: 25 })).toBe(200);
  });
});

describe('client score', () => {
  const months = (n: number, daysLate: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ monthsAgo: i, daysLate: daysLate(i) }));

  it('takes the rework from the punctuality: 3 in 90 days move a year on time from 916 to 796', () => {
    expect(clientScore(months(12, () => 0), 0, { last90Days: 3, last12Months: 3 })).toEqual({
      probability: delinquencyScore(months(12, () => 0), 0).probability,
      score: 796,
      risk: 'moderado',
      lowHistory: false,
      punctuality: 916,
      openPenalty: 0,
      paymentScore: 916,
      reworkPenalty: 120,
    });
    expect(clientScore(months(12, () => 0), 0, { last90Days: 9, last12Months: 9 })).toMatchObject({ score: 716, reworkPenalty: 200 });
  });

  it('adds the open penalty and the rework penalty over the punctuality', () => {
    expect(clientScore(months(12, () => 5), 2, { last90Days: 1, last12Months: 2 })).toMatchObject({
      punctuality: 771,
      openPenalty: 100,
      paymentScore: 671,
      reworkPenalty: 50,
      score: 621,
      risk: 'moderado',
    });
  });

  it('without rework it is the payment score', () => {
    const payment = delinquencyScore(months(6, () => 3), 1);
    expect(clientScore(months(6, () => 3), 1)).toEqual({ ...payment, paymentScore: payment.score, reworkPenalty: 0 });
  });

  it('recomputes the risk band after the penalty', () => {
    expect(clientScore([], 0, { last90Days: 1, last12Months: 1 })).toMatchObject({ score: 760, risk: 'moderado', paymentScore: 800 });
  });

  it('never goes below zero', () => {
    const awful = Array.from({ length: 12 }, (_, i) => ({ daysLate: 90, monthsAgo: i }));
    expect(clientScore(awful, 12, { last90Days: 5, last12Months: 5 })).toMatchObject({ score: 0, risk: 'critico', reworkPenalty: 200 });
  });
});

describe('client base evolution', () => {
  const clients: EvolutionClient[] = [
    { id: 'a', name: 'Alfa', contractStartDate: '2025-12-15', inactivatedAt: null, inactivationReason: null },
    { id: 'b', name: 'Beta', contractStartDate: '2026-08-10', inactivatedAt: null, inactivationReason: null },
    { id: 'c', name: 'Gama', contractStartDate: '2026-09-01', inactivatedAt: '2026-10-05', inactivationReason: 'default' },
    // Started and left on the same day: new and churned in September, never in a month-end base.
    { id: 'd', name: 'Delta', contractStartDate: '2026-09-30', inactivatedAt: '2026-09-30', inactivationReason: 'other' },
    // Leap-day contract: its third year starts on 2026-02-28.
    { id: 'e', name: 'Épsilon', contractStartDate: '2024-02-29', inactivatedAt: null, inactivationReason: null },
    // Starts after today: not in October yet.
    { id: 'f', name: 'Zeta', contractStartDate: '2026-10-25', inactivatedAt: null, inactivationReason: null },
    // Inactivation recorded for the end of the month: still active today.
    { id: 'g', name: 'Eta', contractStartDate: '2025-01-01', inactivatedAt: '2026-10-31', inactivationReason: 'contract_end' },
  ];
  const fees = [
    { clientId: 'a', periodIndex: 0, amount: 50_000 },
    { clientId: 'b', periodIndex: 0, amount: 30_000 },
    { clientId: 'c', periodIndex: 0, amount: 20_000 },
    { clientId: 'd', periodIndex: 0, amount: 99_999 },
    { clientId: 'e', periodIndex: 0, amount: 10_000 },
    { clientId: 'e', periodIndex: 1, amount: 11_000 },
    { clientId: 'e', periodIndex: 2, amount: 12_000 },
    { clientId: 'f', periodIndex: 0, amount: 77_777 },
  ];

  it('counts new, churned and the month-end base with the fees in force at that day', () => {
    const months = clientBaseEvolution({ clients, fees, from: '2026-08', to: '2026-10', today: '2026-10-20' });
    expect(months).toEqual([
      {
        month: '2026-08',
        asOf: '2026-08-31',
        partial: false,
        newClients: 1,
        churnedClients: 0,
        activeClients: 4,
        netChange: 1,
        recurringFees: 92_000,
        clientsWithFee: 3,
        averageFee: 30_667,
        newList: [{ id: 'b', name: 'Beta', fee: 30_000 }],
        churnedList: [],
      },
      {
        month: '2026-09',
        asOf: '2026-09-30',
        partial: false,
        newClients: 2,
        churnedClients: 1,
        activeClients: 5,
        netChange: 1,
        recurringFees: 112_000,
        clientsWithFee: 4,
        averageFee: 28_000,
        // Delta left on its first day: out of the base, so it brings and takes no fee.
        newList: [
          { id: 'd', name: 'Delta', fee: 0 },
          { id: 'c', name: 'Gama', fee: 20_000 },
        ],
        churnedList: [{ id: 'd', name: 'Delta', fee: 0, reason: 'other' }],
      },
      {
        month: '2026-10',
        asOf: '2026-10-20',
        partial: true,
        newClients: 0,
        churnedClients: 1,
        activeClients: 4,
        netChange: -1,
        recurringFees: 92_000,
        clientsWithFee: 3,
        averageFee: 30_667,
        newList: [],
        // The fee it had at the end of the previous month.
        churnedList: [{ id: 'c', name: 'Gama', fee: 20_000, reason: 'default' }],
      },
    ]);
    // Bridge of the fees: previous + new − churned + adjustments = current (no renewal here).
    for (let i = 1; i < months.length; i++) {
      const m = months[i]!;
      const flows = m.newList.reduce((a, c) => a + c.fee, 0) - m.churnedList.reduce((a, c) => a + c.fee, 0);
      expect(months[i - 1]!.recurringFees + flows).toBe(m.recurringFees);
    }
    // The base moves exactly by the net change.
    for (let i = 1; i < months.length; i++) {
      expect(months[i]!.activeClients - months[i - 1]!.activeClients).toBe(months[i]!.netChange);
    }
  });

  it('uses the fee period of the month-end day (leap-day anchors fall on Feb 28)', () => {
    const [february] = clientBaseEvolution({
      clients: [clients[4]!],
      fees,
      from: '2026-02',
      to: '2026-02',
      today: '2026-03-10',
    });
    expect(february).toMatchObject({ asOf: '2026-02-28', activeClients: 1, recurringFees: 12_000, clientsWithFee: 1 });
  });

  it('keeps a client without a registered period in the base, out of the fees and the average', () => {
    const [month] = clientBaseEvolution({
      clients: [clients[0]!, { id: 'x', name: 'Xis', contractStartDate: '2026-01-01', inactivatedAt: null, inactivationReason: null }],
      fees,
      from: '2026-05',
      to: '2026-05',
      today: '2026-10-20',
    });
    expect(month).toMatchObject({ activeClients: 2, clientsWithFee: 1, recurringFees: 50_000, averageFee: 50_000 });
    expect(clientBaseEvolution({ clients: [], fees: [], from: '2026-05', to: '2026-05', today: '2026-10-20' })[0]).toMatchObject({
      activeClients: 0,
      recurringFees: 0,
      averageFee: 0,
    });
  });
});

describe('evolution comparison', () => {
  it('gives the absolute and the relative change (null over zero)', () => {
    expect(evolutionChange(5, 4)).toEqual({ current: 5, previous: 4, diff: 1, diffPercent: 0.25 });
    expect(evolutionChange(3, 0)).toEqual({ current: 3, previous: 0, diff: 3, diffPercent: null });
    expect(evolutionChange(0, 0)).toEqual({ current: 0, previous: 0, diff: 0, diffPercent: null });
    // Over a negative month (net change), the sign follows the direction: −2 → −1 is better.
    expect(evolutionChange(-1, -2)).toEqual({ current: -1, previous: -2, diff: 1, diffPercent: 0.5 });
  });

  it('compares every metric of the current month with the previous one', () => {
    const month = (values: Partial<EvolutionMonth>): EvolutionMonth => ({
      month: '2026-10',
      asOf: '2026-10-20',
      partial: true,
      newClients: 0,
      churnedClients: 0,
      activeClients: 0,
      netChange: 0,
      recurringFees: 0,
      clientsWithFee: 0,
      averageFee: 0,
      newList: [],
      churnedList: [],
      billed: 0,
      received: 0,
      ...values,
    });
    const comparison = evolutionComparison(
      month({ newClients: 4, activeClients: 24, netChange: 4, recurringFees: 240_000, averageFee: 10_000, billed: 200_000, received: 150_000 }),
      month({ month: '2026-09', asOf: '2026-09-30', partial: false, newClients: 1, churnedClients: 1, activeClients: 20, recurringFees: 200_000, averageFee: 10_000, billed: 180_000, received: 200_000 }),
    );
    expect(comparison.current).toBe('2026-10');
    expect(comparison.previous).toBe('2026-09');
    expect(comparison.metrics).toEqual({
      newClients: { current: 4, previous: 1, diff: 3, diffPercent: 3 },
      churnedClients: { current: 0, previous: 1, diff: -1, diffPercent: -1 },
      activeClients: { current: 24, previous: 20, diff: 4, diffPercent: 0.2 },
      netChange: { current: 4, previous: 0, diff: 4, diffPercent: null },
      recurringFees: { current: 240_000, previous: 200_000, diff: 40_000, diffPercent: 0.2 },
      averageFee: { current: 10_000, previous: 10_000, diff: 0, diffPercent: 0 },
      billed: { current: 200_000, previous: 180_000, diff: 20_000, diffPercent: 20_000 / 180_000 },
      received: { current: 150_000, previous: 200_000, diff: -50_000, diffPercent: -0.25 },
    });
  });
});

describe('contract', () => {
  it('names the metrics with the words of the office', () => {
    expect(EVOLUTION_METRIC_LABELS).toMatchObject({ activeClients: 'Clientes ativos', recurringFees: 'Honorário mensal recorrente' });
  });

  it('reads 12 months by default and accepts 1 to 36', () => {
    expect(evolutionReportQuerySchema.parse({})).toEqual({ months: 12 });
    expect(evolutionReportQuerySchema.parse({ months: '24' })).toEqual({ months: 24 });
    expect(evolutionReportQuerySchema.safeParse({ months: 0 }).success).toBe(false);
    expect(evolutionReportQuerySchema.safeParse({ months: 37 }).success).toBe(false);
  });

  it('keeps the rework flag optional on a task category (absent keeps the stored value)', () => {
    expect(taskCategoryInputSchema.parse({ name: 'Retrabalho' })).not.toHaveProperty('isRework');
    expect(taskCategoryInputSchema.parse({ name: 'Retrabalho', isRework: true })).toMatchObject({ isRework: true });
    expect(taskCategoryInputSchema.safeParse({ name: 'Retrabalho', isRework: 'sim' }).success).toBe(false);
  });
});
