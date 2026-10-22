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
