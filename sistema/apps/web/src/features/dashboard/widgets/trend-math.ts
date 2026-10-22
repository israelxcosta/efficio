// Pure data shaping for the analysis and trend widgets (resumo, resultado mês a mês, categorias,
// evolução, composição). No React here, so everything is unit-tested.

import { addMonths, endOfMonth, formatMonthKey, type CategorySeries, type MonthKey } from '@effinance/shared';
import { linearTrend } from '@/components/charts/chart-scale';

/** Room per X label (Effy: about one label every 58px); short labels ("Out") need less. */
const LABEL_PX = 58;

/** Date range of the `count` months ending at `month` (inclusive). */
export function monthWindow(month: MonthKey, count: number): { from: string; to: string } {
  const first = `${month}-01`;
  return { from: addMonths(first, -(count - 1)), to: endOfMonth(first) };
}

/** "Out/26" → "Out" (the year only where it changes is noise on a 6-month axis). */
export function shortMonth(month: MonthKey, withYear = false): string {
  const label = formatMonthKey(month, 'short');
  return withYear ? label : label.split('/')[0]!;
}

/**
 * X labels that fit `width`, counted back from the last one so the latest period always shows.
 * Undefined while the width is unknown (the caller falls back to Recharts' own spacing).
 */
export function fitTicks(labels: readonly string[], width: number): string[] | undefined {
  if (width <= 0 || labels.length === 0) return undefined;
  const longest = labels.reduce((m, l) => Math.max(m, l.length), 0);
  const room = Math.min(LABEL_PX, longest * 7 + 18);
  const step = Math.ceil(labels.length / Math.max(1, Math.floor(width / room)));
  const ticks: string[] = [];
  for (let i = labels.length - 1; i >= 0; i -= step) ticks.unshift(labels[i]!);
  return ticks;
}

/** Index of the largest absolute value (-1 when every value is 0). */
export function maxAbsIndex(values: readonly number[]): number {
  let best = -1;
  values.forEach((v, i) => {
    if (v !== 0 && (best < 0 || Math.abs(v) > Math.abs(values[best]!))) best = i;
  });
  return best;
}

/** Average of the non-zero values (0 without any). */
export function averageWithData(values: readonly number[]): number {
  const withData = values.filter((v) => v !== 0);
  return withData.length ? Math.round(withData.reduce((a, v) => a + v, 0) / withData.length) : 0;
}

/**
 * Smallest number of the largest amounts that hold more than half of the total (Effy's
 * "N categorias respondem por X%"), with their share. Null when that would be every item.
 */
export function topConcentration(amounts: readonly number[]): { count: number; share: number } | null {
  const sorted = amounts.filter((a) => a > 0).sort((a, b) => b - a);
  const total = sorted.reduce((a, v) => a + v, 0);
  if (total <= 0) return null;
  let sum = 0;
  for (let i = 0; i < sorted.length; i++) {
    sum += sorted[i]!;
    if (sum / total > 0.5) return i + 1 < sorted.length ? { count: i + 1, share: sum / total } : null;
  }
  return null;
}

/** Linear trend drawn only between the first and last month with movement, never below zero. */
export function trendSegment(values: readonly number[]): (number | null)[] {
  const line = linearTrend([...values]);
  const first = values.findIndex((v) => v !== 0);
  let last = -1;
  values.forEach((v, i) => {
    if (v !== 0) last = i;
  });
  return line.map((v, i) => (v === null || i < first || i > last ? null : Math.max(0, v)));
}

/** Change against the previous value as a ratio (0.1 = +10%); null without a base. */
export function changeRatio(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

/**
 * Tone of a change: for expenses going up is bad (danger), for income it is good (success);
 * under 0.5% it is neutral.
 */
export function changeTone(ratio: number | null, type: 'income' | 'expense'): 'success' | 'danger' | 'neutral' {
  if (ratio === null || Math.abs(ratio) < 0.005) return 'neutral';
  return ratio > 0 === (type === 'expense') ? 'danger' : 'success';
}

/** "▲ 12,3%" / "▼ 4%" / "sem base". */
export function changeText(ratio: number | null): string {
  if (ratio === null) return 'sem base';
  const pct = Math.round(Math.abs(ratio) * 1000) / 10;
  const arrow = ratio > 0 ? '▲ ' : ratio < 0 ? '▼ ' : '';
  return `${arrow}${pct.toLocaleString('pt-BR')}%`;
}

export interface EvolutionRow {
  month: MonthKey;
  label: string;
  /** Paid (realizado). */
  realizado: number;
  /** Still open (all − paid): overdue in past months, to come in future ones. */
  aberto: number;
  total: number;
  trend: number | null;
}

export interface EvolutionData {
  rows: EvolutionRow[];
  /** First month shown when leading empty months were trimmed ("desde mmm/aa"). */
  since: MonthKey | null;
  total: number;
  /** Over the months with movement. */
  average: number;
  /** Against the 12 months before (null without history). */
  vsPrevious: number | null;
  previousTotal: number;
  best: { month: MonthKey; value: number } | null;
  hasOpen: boolean;
  /** Last months with movement, newest first, each against the month before it. */
  changes: { month: MonthKey; value: number; ratio: number | null }[];
}

/**
 * "Evolução do total": `all` holds 2×`months` monthly totals (the window plus the one before it,
 * for the comparisons), `paid` the realized totals of the window. `keys` are the window's months.
 */
export function evolutionData(
  keys: readonly MonthKey[],
  all: readonly number[],
  paid: readonly number[],
  trimStart: number,
  changesCount = 6,
): EvolutionData {
  const n = keys.length;
  const current = all.slice(all.length - n);
  const previous = all.slice(0, all.length - n);
  const shownTotals = current.slice(trimStart);
  const trend = trendSegment(shownTotals);
  const rows = keys.slice(trimStart).map((month, j) => {
    const i = j + trimStart;
    const total = current[i] ?? 0;
    const realizado = Math.min(total, Math.max(0, paid[i] ?? 0));
    return { month, label: formatMonthKey(month, 'short'), realizado, aberto: total - realizado, total, trend: trend[j] ?? null };
  });
  const total = current.reduce((a, v) => a + v, 0);
  const previousTotal = previous.reduce((a, v) => a + v, 0);
  let best: EvolutionData['best'] = null;
  current.forEach((v, i) => {
    if (v > 0 && (!best || v > best.value)) best = { month: keys[i]!, value: v };
  });
  const changes: EvolutionData['changes'] = [];
  for (let i = n - 1; i >= 0 && changes.length < changesCount; i--) {
    const value = current[i]!;
    if (value <= 0) continue;
    const before = i > 0 ? current[i - 1]! : (previous[previous.length - 1] ?? 0);
    changes.push({ month: keys[i]!, value, ratio: changeRatio(value, before) });
  }
  return {
    rows,
    since: trimStart > 0 ? keys[trimStart]! : null,
    total,
    average: averageWithData(current),
    vsPrevious: previous.length === n ? changeRatio(total, previousTotal) : null,
    previousTotal,
    best,
    hasOpen: rows.some((r) => r.aberto > 0),
    changes,
  };
}

export interface CompositionSeries {
  key: string;
  categoryId: string | null;
  name: string;
  color: string;
  total: number;
  values: number[];
}

export const OTHERS_KEY = 'outras';

/** The `max` largest categories with movement, the rest summed into "Outras (N)". */
export function groupSeries(series: readonly CategorySeries[], max = 8): { items: CompositionSeries[]; grouped: number } {
  const withData = series.filter((s) => s.total > 0).sort((a, b) => b.total - a.total);
  const head = withData.slice(0, max);
  const rest = withData.slice(max);
  const items: CompositionSeries[] = head.map((s, i) => ({
    key: `c${i}`,
    categoryId: s.categoryId,
    name: s.name,
    color: s.color,
    total: s.total,
    values: [...s.values],
  }));
  if (rest.length) {
    items.push({
      key: OTHERS_KEY,
      categoryId: null,
      name: `Outras (${rest.length})`,
      color: '#9A9EA5',
      total: rest.reduce((a, s) => a + s.total, 0),
      values: rest[0]!.values.map((_, i) => rest.reduce((a, s) => a + (s.values[i] ?? 0), 0)),
    });
  }
  return { items, grouped: rest.length };
}

export interface ResultStats {
  total: number;
  average: number;
  positives: number;
  best: { month: MonthKey; value: number } | null;
  worst: { month: MonthKey; value: number } | null;
}

/** Totals of "Resultado mês a mês": sum, average, positive months, best and worst month. */
export function resultStats(months: readonly { month: MonthKey; net: number }[]): ResultStats {
  let best: ResultStats['best'] = null;
  let worst: ResultStats['worst'] = null;
  for (const m of months) {
    if (!best || m.net > best.value) best = { month: m.month, value: m.net };
    if (!worst || m.net < worst.value) worst = { month: m.month, value: m.net };
  }
  const total = months.reduce((a, m) => a + m.net, 0);
  return {
    total,
    average: months.length ? Math.round(total / months.length) : 0,
    positives: months.filter((m) => m.net > 0).length,
    best,
    worst,
  };
}
