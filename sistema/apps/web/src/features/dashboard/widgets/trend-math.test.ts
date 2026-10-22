import { describe, expect, it } from 'vitest';
import type { CategorySeries } from '@effinance/shared';
import {
  averageWithData,
  changeRatio,
  changeText,
  changeTone,
  evolutionData,
  fitTicks,
  groupSeries,
  maxAbsIndex,
  monthWindow,
  OTHERS_KEY,
  resultStats,
  shortMonth,
  topConcentration,
  trendSegment,
} from './trend-math';

describe('month helpers', () => {
  it('builds the window of N months ending at the active month', () => {
    expect(monthWindow('2026-10', 12)).toEqual({ from: '2025-11-01', to: '2026-10-31' });
    expect(monthWindow('2026-02', 6)).toEqual({ from: '2025-09-01', to: '2026-02-28' });
    expect(monthWindow('2026-10', 1)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('labels months short, with the year on demand', () => {
    expect(shortMonth('2026-10')).toBe('Out');
    expect(shortMonth('2026-10', true)).toBe('Out/26');
  });
});

describe('fitTicks', () => {
  const months = ['Nov/25', 'Dez/25', 'Jan/26', 'Fev/26', 'Mar/26', 'Abr/26', 'Mai/26', 'Jun/26', 'Jul/26', 'Ago/26', 'Set/26', 'Out/26'];

  it('keeps every label when there is room', () => {
    expect(fitTicks(months, 1200)).toEqual(months);
    expect(fitTicks(['Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out'], 240)).toHaveLength(6);
  });

  it('thins labels counting back from the last one', () => {
    const ticks = fitTicks(months, 300)!;
    expect(ticks[ticks.length - 1]).toBe('Out/26');
    expect(ticks.length).toBeLessThanOrEqual(Math.floor(300 / 58));
    expect(fitTicks(months, 116)).toEqual(['Abr/26', 'Out/26']);
  });

  it('waits for a measured width', () => {
    expect(fitTicks(months, 0)).toBeUndefined();
    expect(fitTicks([], 500)).toBeUndefined();
  });
});

describe('small math', () => {
  it('finds the largest absolute value', () => {
    expect(maxAbsIndex([100, -300, 200])).toBe(1);
    expect(maxAbsIndex([0, 0])).toBe(-1);
  });

  it('averages the months with data', () => {
    expect(averageWithData([0, 100, 0, 300])).toBe(200);
    expect(averageWithData([0, 0])).toBe(0);
  });

  it('counts the categories that hold more than half', () => {
    expect(topConcentration([50, 30, 20])).toEqual({ count: 2, share: 0.8 });
    expect(topConcentration([70, 20, 10])).toEqual({ count: 1, share: 0.7 });
    // Every item would be needed: nothing worth saying.
    expect(topConcentration([50, 50])).toBeNull();
    expect(topConcentration([100])).toBeNull();
    expect(topConcentration([])).toBeNull();
  });

  it('draws the trend only between the first and last month with data, never below 0', () => {
    expect(trendSegment([0, 100, 200, 300, 0])).toEqual([null, 100, 200, 300, null]);
    expect(trendSegment([0, 0, 500])).toEqual([null, null, null]);
    expect(trendSegment([300, 10, 0, 0, 0, 1]).every((v) => v === null || v >= 0)).toBe(true);
  });

  it('colours a change by side: expenses up are bad, income up is good', () => {
    expect(changeRatio(110, 100)).toBeCloseTo(0.1);
    expect(changeRatio(10, 0)).toBeNull();
    expect(changeTone(0.1, 'expense')).toBe('danger');
    expect(changeTone(0.1, 'income')).toBe('success');
    expect(changeTone(-0.2, 'expense')).toBe('success');
    expect(changeTone(0.004, 'expense')).toBe('neutral');
    expect(changeTone(null, 'income')).toBe('neutral');
    expect(changeText(0.123)).toBe('▲ 12,3%');
    expect(changeText(-0.04)).toBe('▼ 4%');
    expect(changeText(0)).toBe('0%');
    expect(changeText(null)).toBe('sem base');
  });
});

describe('evolutionData', () => {
  const keys = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];

  it('splits realized and open, trims and compares with the window before', () => {
    const all = [0, 0, 0, 0, 0, 600, /* window */ 0, 0, 1000, 1200, 900, 1500];
    const paid = [0, 0, 1000, 1000, 900, 500];
    const data = evolutionData(keys, all, paid, 2);
    expect(data.since).toBe('2026-07');
    expect(data.rows.map((r) => r.month)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
    expect(data.rows[1]).toMatchObject({ realizado: 1000, aberto: 200, total: 1200, label: 'Ago/26' });
    expect(data.rows[3]).toMatchObject({ realizado: 500, aberto: 1000 });
    expect(data.hasOpen).toBe(true);
    expect(data.total).toBe(4600);
    expect(data.average).toBe(1150);
    expect(data.previousTotal).toBe(600);
    expect(data.vsPrevious).toBeCloseTo(4600 / 600 - 1);
    expect(data.best).toEqual({ month: '2026-10', value: 1500 });
    // Newest first; the first month with data compares with an empty month (no base).
    expect(data.changes.map((c) => c.month)).toEqual(['2026-10', '2026-09', '2026-08', '2026-07']);
    expect(data.changes[0]!.ratio).toBeCloseTo(600 / 900);
    expect(data.changes[3]!.ratio).toBeNull();
    expect(data.rows.every((r) => r.trend !== null)).toBe(true);
  });

  it('compares the first month of the window with the month before it', () => {
    const all = [0, 0, 0, 0, 0, 800, 1000, 0, 0, 0, 0, 0];
    const data = evolutionData(keys, all, [1000, 0, 0, 0, 0, 0], 0, 6);
    expect(data.changes).toEqual([{ month: '2026-05', value: 1000, ratio: 0.25 }]);
    expect(data.hasOpen).toBe(false);
    expect(data.since).toBeNull();
  });

  it('has no comparison without the previous window', () => {
    const data = evolutionData(keys, [1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6], 0);
    expect(data.vsPrevious).toBeNull();
  });
});

describe('groupSeries', () => {
  const s = (name: string, total: number, values: number[]): CategorySeries => ({
    categoryId: name,
    name,
    icon: 'tag',
    color: '#123456',
    total,
    share: 0,
    values,
    average: 0,
  });

  it('keeps the largest categories and sums the rest into "Outras (N)"', () => {
    const series = [s('a', 50, [20, 30]), s('b', 0, [0, 0]), s('c', 30, [10, 20]), s('d', 15, [15, 0]), s('e', 5, [0, 5])];
    const { items, grouped } = groupSeries(series, 2);
    expect(grouped).toBe(2);
    expect(items.map((i) => i.name)).toEqual(['a', 'c', 'Outras (2)']);
    expect(items[2]).toMatchObject({ key: OTHERS_KEY, total: 20, values: [15, 5] });
  });

  it('does not group when everything fits', () => {
    const { items, grouped } = groupSeries([s('a', 5, [5]), s('b', 3, [3])], 8);
    expect(grouped).toBe(0);
    expect(items).toHaveLength(2);
  });
});

describe('resultStats', () => {
  it('sums the months and finds the best and the worst', () => {
    const stats = resultStats([
      { month: '2026-08', net: 300 },
      { month: '2026-09', net: -100 },
      { month: '2026-10', net: 0 },
    ]);
    expect(stats).toEqual({
      total: 200,
      average: 67,
      positives: 1,
      best: { month: '2026-08', value: 300 },
      worst: { month: '2026-09', value: -100 },
    });
  });
});
