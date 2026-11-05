import { describe, expect, it } from 'vitest';
import {
  agingBuckets,
  centerFontSize,
  concentration,
  linearTrend,
  niceDomain,
  projectionTiles,
  rankDebtors,
  sparkPath,
  stackSegments,
  summarizeProjection,
  trimLeadingEmpty,
  yAxisWidth,
} from './chart-scale';

describe('chart sizing', () => {
  it('sizes the Y gutter from the longest label (28–76px)', () => {
    expect(yAxisWidth([0])).toBe(28);
    expect(yAxisWidth([1_500_000])).toBe(3 * 6 + 12); // "15k"
    expect(yAxisWidth([1_234_500_000])).toBe(5 * 6 + 12); // "12,3M"
    expect(yAxisWidth([1_234_500_000, -1])).toBe(6 * 6 + 12); // "-12,3M" once values go negative
    expect(yAxisWidth([1], () => 'x'.repeat(40))).toBe(76);
  });

  it('fits the donut center number in the hole (12–20px)', () => {
    expect(centerFontSize('R$ 1,00', 260)).toBe(20);
    expect(centerFontSize('R$ 1.234.567,89', 120)).toBe(12);
    expect(centerFontSize('R$ 12.345,67', 200)).toBeLessThan(centerFontSize('R$ 1,00', 200));
  });
});

describe('series helpers', () => {
  it('draws a least-squares trend over non-zero months', () => {
    expect(linearTrend([0, 0, 0])).toEqual([null, null, null]);
    expect(linearTrend([0, 5])).toEqual([null, null]);
    expect(linearTrend([10, 20, 30])).toEqual([10, 20, 30]);
    expect(linearTrend([0, 10, 0, 30])).toEqual([0, 10, 20, 30]);
    expect(linearTrend([7, 7, 7])).toEqual([7, 7, 7]);
  });

  it('skips leading empty periods but keeps at least 4', () => {
    expect(trimLeadingEmpty([0, 0, 0, 0, 0, 0, 5, 6, 7, 8, 9, 10])).toBe(6);
    expect(trimLeadingEmpty([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 4])).toBe(8);
    expect(trimLeadingEmpty([1, 2, 3])).toBe(0);
    expect(trimLeadingEmpty([0, 0, 0, 0, 0, 0])).toBe(2);
  });

  it('measures how much the largest items concentrate', () => {
    expect(concentration([50, 30, 20], 2)).toBeCloseTo(0.8);
    expect(concentration([], 3)).toBe(0);
  });
});

describe('receivables', () => {
  it('splits overdue items by days late', () => {
    const today = '2026-10-21';
    const buckets = agingBuckets(
      [
        { date: '2026-09-21', amount: 100 }, // 30 days
        { date: '2026-09-20', amount: 200 }, // 31 days
        { date: '2026-08-22', amount: 300 }, // 60 days
        { date: '2026-08-21', amount: 400 }, // 61 days
      ],
      today,
    );
    expect(buckets.map((b) => [b.key, b.amount, b.count])).toEqual([
      ['ate30', 100, 1],
      ['ate60', 500, 2],
      ['mais60', 400, 1],
    ]);
  });

  it('ranks debtors by amount with their oldest due date', () => {
    const ranked = rankDebtors([
      { date: '2026-09-10', amount: 100, contactId: 'a', contact: { id: 'a', name: 'Padaria' } },
      { date: '2026-08-10', amount: 50, contactId: 'a', contact: { id: 'a', name: 'Padaria' } },
      { date: '2026-10-01', amount: 120, contactId: null, contact: null },
    ]);
    expect(ranked).toEqual([
      { contactId: 'a', name: 'Padaria', amount: 150, count: 2, oldest: '2026-08-10' },
      { contactId: null, name: 'Sem cliente informado', amount: 120, count: 1, oldest: '2026-10-01' },
    ]);
  });
});

describe('cash projection', () => {
  const days = (balances: number[]) => balances.map((balance, i) => ({ start: `2026-10-${String(21 + i).padStart(2, '0')}`, balance }));
  const report = (balances: number[]) => ({ openingBalance: 0, periods: days(balances) });

  it('finds the worst day, the first negative day and shifts by the open overdue items', () => {
    const p = summarizeProjection(report([1000, 400, -200, 300]), 100);
    expect(p.points.map((x) => x.saldo)).toEqual([1100, 500, -100, 400]);
    expect(p.worst).toEqual({ date: '2026-10-23', saldo: -100 });
    expect(p.negativeFrom).toBe('2026-10-23');
  });

  it("takes today's balance from yesterday's closing plus what was settled today", () => {
    const periods = [{ start: '2026-10-21', balance: 900, realizedInflow: 300, realizedOutflow: 100 }];
    expect(summarizeProjection({ openingBalance: 500, periods }, 0).today).toBe(700);
    expect(summarizeProjection({ openingBalance: 500, periods: [] }, 0).today).toBe(500);
  });

  it('cuts the 90-day report to the chosen horizon', () => {
    const balances = Array.from({ length: 91 }, (_, i) => (i === 45 ? -50 : i));
    const ninety = summarizeProjection({ openingBalance: 0, periods: balances.map((b, i) => ({ start: `d${i}`, balance: b })) }, 0, 90);
    expect(ninety.points).toHaveLength(91);
    expect(ninety.milestones.map((m) => m.dias)).toEqual([30, 60, 90]);
    expect(ninety.negativeFrom).toBe('d45');
    const thirty = summarizeProjection({ openingBalance: 0, periods: balances.map((b, i) => ({ start: `d${i}`, balance: b })) }, 0, 30);
    expect(thirty.points).toHaveLength(31);
    expect(thirty.milestones).toEqual([{ dias: 30, date: 'd30', saldo: 30 }]);
    expect(thirty.negativeFrom).toBeNull();
    expect(thirty.worst).toEqual({ date: 'd0', saldo: 0 });
  });
});

describe('niceDomain', () => {
  it('stretches a small negative without a negative tick', () => {
    expect(niceDomain([40000, -3000, 50000, 60000, 70000, 410000])).toEqual({ domain: [-3750, 500000], ticks: [0, 250000, 500000] });
  });

  it('keeps symmetric ticks when the negative is large', () => {
    expect(niceDomain([-150000, 200000])).toEqual({
      domain: [-200000, 200000],
      ticks: [-200000, -100000, 0, 100000, 200000],
    });
  });

  it('starts at zero and prefers more ticks on a tie', () => {
    expect(niceDomain([1800000, 1350000])).toEqual({
      domain: [0, 2000000],
      ticks: [0, 500000, 1000000, 1500000, 2000000],
    });
  });

  it('falls back to 0–100 without data', () => {
    expect(niceDomain([])).toEqual({ domain: [0, 100], ticks: [0, 100] });
    expect(niceDomain([0, 0])).toEqual({ domain: [0, 100], ticks: [0, 100] });
  });
});

describe('stackSegments', () => {
  it('gives exact widths and integer percentages by largest remainder', () => {
    const segs = stackSegments([2, 21, 5]);
    expect(segs.map((s) => s.pct)).toEqual([7, 75, 18]);
    [2 / 28, 21 / 28, 5 / 28].forEach((w, i) => expect(segs[i]!.width).toBeCloseTo(w, 4));
  });

  it('breaks remainder ties toward the first segment and handles a zero total', () => {
    expect(stackSegments([1, 1, 1]).map((s) => s.pct)).toEqual([34, 33, 33]);
    expect(stackSegments([0, 0])).toEqual([
      { width: 0, pct: 0 },
      { width: 0, pct: 0 },
    ]);
  });
});

describe('sparkPath', () => {
  it('maps the series into the box with padding', () => {
    expect(sparkPath([0, 50, 100], 100, 20)).toBe('M2 18 L50 10 L98 2');
  });

  it('draws a flat series at mid height and nothing under 2 points', () => {
    expect(sparkPath([5, 5], 100, 20)).toBe('M2 10 L98 10');
    expect(sparkPath([5], 100, 20)).toBe('');
  });
});

describe('projectionTiles', () => {
  const base = {
    today: 6465386,
    points: [],
    negativeFrom: null,
    milestones: [
      { dias: 30 as const, date: '2026-12-05', saldo: 5200000 },
      { dias: 60 as const, date: '2027-01-04', saldo: 4800000 },
      { dias: 90 as const, date: '2027-02-03', saldo: 4161416 },
    ],
  };

  it('drops the worst day when it is the last milestone', () => {
    const tiles = projectionTiles({ ...base, worst: { date: '2027-02-03', saldo: 4161416 } });
    expect(tiles.map((t) => t.key)).toEqual([30, 60, 90]);
  });

  it('puts the worst day first when it differs from the last milestone', () => {
    const tiles = projectionTiles({ ...base, worst: { date: '2027-01-20', saldo: 3900000 } });
    expect(tiles.map((t) => t.key)).toEqual(['worst', 30, 60, 90]);
    expect(tiles[0]).toEqual({ key: 'worst', date: '2027-01-20', saldo: 3900000 });
  });

  it('shows only the milestones without a worst day', () => {
    expect(projectionTiles({ ...base, worst: null }).map((t) => t.key)).toEqual([30, 60, 90]);
  });
});
