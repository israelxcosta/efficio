// Pure helpers for dashboard charts and widgets (Effy's sizing rules and the data shaping the
// widgets share). No React here, so everything is unit-tested.

import { diffInDays, type CashflowPeriod, type ISODate, type Transaction } from '@effinance/shared';
import { moneyAxisFormatter } from './chart-axis';

/** Y-axis gutter from the longest tick label: 6px per character + 12, clamped to 28–76px. */
export function yAxisWidth(values: number[], format: (v: number) => string = moneyAxisFormatter): number {
  const max = values.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const negative = values.some((v) => v < 0);
  const longest = Math.max(format(max).length, negative ? format(-max).length : 0, 1);
  return Math.min(76, Math.max(28, longest * 6 + 12));
}

/**
 * Font size (px) of the number in a donut's hole: fits the text in the hole, 12–20px.
 * `ring` is the ring thickness as a share of the diameter's radius (0.26 = innerRadius 74%).
 */
export function centerFontSize(text: string, diameter: number, ring = 0.26): number {
  const hole = diameter * (1 - ring);
  const ideal = (hole * 0.88) / (Math.max(text.length, 1) * 0.6);
  return Math.max(12, Math.min(20, Math.round(ideal)));
}

/** Least-squares line over the non-zero values; null where it cannot be drawn (fewer than 2 points). */
export function linearTrend(values: number[]): (number | null)[] {
  const points = values.map((y, x) => ({ x, y })).filter((p) => p.y !== 0);
  if (points.length < 2) return values.map(() => null);
  const n = points.length;
  const sx = points.reduce((a, p) => a + p.x, 0);
  const sy = points.reduce((a, p) => a + p.y, 0);
  const sxy = points.reduce((a, p) => a + p.x * p.y, 0);
  const sxx = points.reduce((a, p) => a + p.x * p.x, 0);
  const denom = n * sxx - sx * sx;
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return values.map((_, x) => Math.round(intercept + slope * x));
}

/** First index worth showing: skips leading empty periods but keeps at least `min` periods. */
export function trimLeadingEmpty(values: number[], min = 4): number {
  const first = values.findIndex((v) => v !== 0);
  if (first < 0) return Math.max(0, values.length - min);
  return Math.min(first, Math.max(0, values.length - min));
}

/** Share of the total held by the `k` largest items (0..1). */
export function concentration(amounts: number[], k: number): number {
  const total = amounts.reduce((a, v) => a + v, 0);
  if (total <= 0) return 0;
  const top = [...amounts].sort((a, b) => b - a).slice(0, k).reduce((a, v) => a + v, 0);
  return top / total;
}

export interface AgingBucket {
  key: 'ate30' | 'ate60' | 'mais60';
  label: string;
  amount: number;
  count: number;
}

/** Overdue items by days late: até 30, 31 a 60, mais de 60 (from the due date to `today`). */
export function agingBuckets(items: Pick<Transaction, 'date' | 'amount'>[], today: ISODate): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { key: 'ate30', label: 'Até 30 dias', amount: 0, count: 0 },
    { key: 'ate60', label: '31 a 60 dias', amount: 0, count: 0 },
    { key: 'mais60', label: 'Acima de 60 dias', amount: 0, count: 0 },
  ];
  for (const item of items) {
    const late = diffInDays(today, item.date);
    const bucket = late <= 30 ? buckets[0]! : late <= 60 ? buckets[1]! : buckets[2]!;
    bucket.amount += item.amount;
    bucket.count += 1;
  }
  return buckets;
}

export interface Debtor {
  contactId: string | null;
  name: string;
  amount: number;
  count: number;
  /** Oldest due date among the debtor's overdue items. */
  oldest: ISODate;
}

/** Overdue receivables grouped by contact, largest debt first. */
export function rankDebtors(items: Pick<Transaction, 'date' | 'amount' | 'contactId' | 'contact'>[]): Debtor[] {
  const map = new Map<string, Debtor>();
  for (const item of items) {
    const key = item.contactId ?? '__none__';
    const current = map.get(key) ?? {
      contactId: item.contactId,
      name: item.contact?.name ?? 'Sem cliente informado',
      amount: 0,
      count: 0,
      oldest: item.date,
    };
    current.amount += item.amount;
    current.count += 1;
    if (item.date < current.oldest) current.oldest = item.date;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'pt-BR'));
}

export interface ProjectionSummary {
  /** Real balance now: yesterday's closing balance + what was already paid/received today. */
  today: number;
  points: { date: ISODate; saldo: number }[];
  worst: { date: ISODate; saldo: number } | null;
  /** Balance 30/60/90 days ahead (only the ones inside the horizon). */
  milestones: { dias: 30 | 60 | 90; date: ISODate; saldo: number }[];
  /** First day the balance goes below zero. */
  negativeFrom: ISODate | null;
}

type ProjectionPeriod = Pick<CashflowPeriod, 'start' | 'balance'> & Partial<Pick<CashflowPeriod, 'realizedInflow' | 'realizedOutflow'>>;

/**
 * Day-by-day projected balance from a daily cash-flow report that starts today (fetch 90 days
 * once and cut here, so switching 30/60/90 needs no request). `overdueNet` (overdue receivables −
 * overdue payables, still open) is counted from today on every point.
 */
export function summarizeProjection(
  report: { openingBalance: number; periods: readonly ProjectionPeriod[] },
  overdueNet: number,
  days: 30 | 60 | 90 = 90,
): ProjectionSummary {
  const first = report.periods[0];
  const today = report.openingBalance + (first?.realizedInflow ?? 0) - (first?.realizedOutflow ?? 0);
  const points = report.periods.slice(0, days + 1).map((p) => ({ date: p.start, saldo: p.balance + overdueNet }));
  let worst: ProjectionSummary['worst'] = null;
  let negativeFrom: ISODate | null = null;
  for (const p of points) {
    if (!worst || p.saldo < worst.saldo) worst = p;
    if (negativeFrom === null && p.saldo < 0) negativeFrom = p.date;
  }
  const milestones: ProjectionSummary['milestones'] = [];
  for (const dias of [30, 60, 90] as const) {
    const point = dias <= days ? points[dias] : undefined;
    if (point) milestones.push({ dias, date: point.date, saldo: point.saldo });
  }
  return { today, points, worst, milestones, negativeFrom };
}

/** A value axis with round steps (`m × 10ⁿ`, m ∈ 1, 2, 2,5, 5): the domain and its tick marks. */
export interface NiceDomain {
  domain: [number, number];
  ticks: number[];
}

const NICE_MANTISSAS = [1, 2, 2.5, 5] as const;

/**
 * The tightest round axis that holds the data (and zero) with 3 to `maxTicks` marks; on a tie, the
 * one with more marks. A negative smaller than ¼ of the step only stretches the domain
 * (`min × 1,25`) without a negative mark, so a −R$ 30 month does not open a −2,5k band.
 * No data (or all zeros) → 0–100.
 */
export function niceDomain(values: readonly number[], maxTicks = 5): NiceDomain {
  const finite = values.filter((v) => Number.isFinite(v));
  const min = Math.min(0, ...finite);
  const max = Math.max(0, ...finite);
  if (min === 0 && max === 0) return { domain: [0, 100], ticks: [0, 100] };
  const span = max - min;
  const top = Math.floor(Math.log10(span));
  let best: (NiceDomain & { size: number }) | null = null;
  for (let n = top - 3; n <= top + 1; n++) {
    for (const m of NICE_MANTISSAS) {
      const step = m * 10 ** n;
      // Cents: steps under 1 only show up for spans under 4 cents; skip the float noise.
      if (step < 1 && span >= 4) continue;
      const hiIndex = Math.ceil(max / step - 1e-9);
      const smallNegative = min < 0 && -min < step / 4;
      const loIndex = smallNegative ? 0 : Math.floor(min / step + 1e-9);
      const count = hiIndex - loIndex + 1;
      if (count < 3 || count > maxTicks) continue;
      const hi = round(hiIndex * step);
      const lo = smallNegative ? round(min * 1.25) : round(loIndex * step);
      const ticks = Array.from({ length: count }, (_, i) => round((loIndex + i) * step));
      const size = hi - lo;
      if (!best || size < best.size || (size === best.size && ticks.length > best.ticks.length)) {
        best = { domain: [lo, hi], ticks, size };
      }
    }
  }
  if (!best) return { domain: [min, max], ticks: [min, max] };
  return { domain: best.domain, ticks: best.ticks };
}

/** Rounds away float noise from `m × 10ⁿ` products (cents never need more than 6 decimals). */
function round(v: number): number {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? 0 : r;
}

/**
 * Stacked-bar segments: `width` is each value's exact share (0–1); `pct` are whole percentages
 * that add up to 100 by the largest remainder (ties go to the first). A zero total → all zeros.
 */
export function stackSegments(values: readonly number[]): { width: number; pct: number }[] {
  const safe = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = safe.reduce((a, v) => a + v, 0);
  if (total <= 0) return safe.map(() => ({ width: 0, pct: 0 }));
  const raw = safe.map((v) => (v * 100) / total);
  const pct = raw.map((r) => Math.floor(r));
  let left = 100 - pct.reduce((a, v) => a + v, 0);
  const order = raw
    .map((r, i) => ({ i, rest: r - Math.floor(r) }))
    .filter((o) => safe[o.i]! > 0)
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const o of order) {
    if (left <= 0) break;
    pct[o.i]! += 1;
    left -= 1;
  }
  return safe.map((v, i) => ({ width: v / total, pct: pct[i]! }));
}

/**
 * SVG path ("M x y L x y …", at most 1 decimal) of a sparkline inside `width × height` with `pad`
 * of breathing room; a flat series sits at mid height. Fewer than 2 points → ''.
 */
export function sparkPath(values: readonly number[], width: number, height: number, pad = 2): string {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length < 2) return '';
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const fmt = (n: number) => String(Math.round(n * 10) / 10);
  return pts
    .map((v, i) => {
      const x = pad + (innerW * i) / (pts.length - 1);
      const y = max === min ? height / 2 : pad + (1 - (v - min) / (max - min)) * innerH;
      return `${i === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`;
    })
    .join(' ');
}

export type ProjectionTile = { key: 'worst' | 30 | 60 | 90; date: ISODate; saldo: number };

/**
 * Tiles above the projection chart: the 30/60/90-day milestones and, before them, the worst day
 * only when its date or balance differs from the last milestone's (otherwise it repeats it).
 */
export function projectionTiles(s: Pick<ProjectionSummary, 'worst' | 'milestones'>): ProjectionTile[] {
  const tiles: ProjectionTile[] = s.milestones.map((m) => ({ key: m.dias, date: m.date, saldo: m.saldo }));
  const last = s.milestones[s.milestones.length - 1];
  if (s.worst && (!last || last.date !== s.worst.date || last.saldo !== s.worst.saldo)) {
    tiles.unshift({ key: 'worst', date: s.worst.date, saldo: s.worst.saldo });
  }
  return tiles;
}
