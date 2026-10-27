// Financial history of one client: every receivable (fees, employee charges, other income), when and
// how it was paid, and the analysis on top of it (pure, unit tested).

import {
  addMonthKey,
  delinquencyScore,
  diffInDays,
  formatBRL,
  monthKey,
  type DelinquencyScore,
  type FeeEntryKind,
  type ISODate,
  type MonthKey,
  type Transaction,
} from '@effinance/shared';
import { pluralize } from '@/lib/utils';
import { formatDays } from '../delinquency-view';

/** em_dia: paid by the due date · atrasado: paid after it · aberto: open, not due yet · vencido: open past due. */
export type ReceivableStatus = 'em_dia' | 'atrasado' | 'aberto' | 'vencido';

export interface ClientReceivable {
  id: string;
  description: string;
  /** Competence of a generated fee ('YYYY-MM'); null for other receivables. */
  competence: MonthKey | null;
  kind: FeeEntryKind | null;
  dueDate: ISODate;
  amount: number;
  paidAt: ISODate | null;
  status: ReceivableStatus;
  /** Paid late: days after the due date; open past due: days until today; else 0. */
  daysLate: number;
  /** Paid before the due date: how many days earlier (0 otherwise). */
  daysEarly: number;
  interest: number;
  fine: number;
  discount: number;
  /** What came in: amount + interest + fine − discount when paid; 0 while open. */
  received: number;
}

/**
 * The client's receivables from its transactions: income only, without the rows that only carry
 * interest, fines or discounts (they show as columns of the receivable they were charged on).
 * Most recent due date first.
 */
export function clientReceivables(rows: readonly Transaction[], today: ISODate): ClientReceivable[] {
  return rows
    .filter((t) => t.type === 'income' && !t.lateFeeOf && !t.discountOf && !t.creditCardId)
    .map((t) => {
      const interest = t.lateFees?.interest ?? 0;
      const fine = t.lateFees?.fine ?? 0;
      const discount = t.discount ?? 0;
      const paidAt = t.paid ? (t.paidAt ?? t.date) : null;
      let status: ReceivableStatus;
      let daysLate = 0;
      let daysEarly = 0;
      if (paidAt) {
        const offset = diffInDays(paidAt, t.date);
        status = offset > 0 ? 'atrasado' : 'em_dia';
        daysLate = Math.max(0, offset);
        daysEarly = Math.max(0, -offset);
      } else if (t.date < today) {
        status = 'vencido';
        daysLate = diffInDays(today, t.date);
      } else {
        status = 'aberto';
      }
      return {
        id: t.id,
        description: t.description,
        competence: t.feeCompetence ?? null,
        kind: t.feeKind ?? null,
        dueDate: t.date,
        amount: t.amount,
        paidAt,
        status,
        daysLate,
        daysEarly,
        interest,
        fine,
        discount,
        received: paidAt ? t.amount + interest + fine - discount : 0,
      };
    })
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate) || a.description.localeCompare(b.description, 'pt-BR'));
}

export interface ClientMonth {
  /** Due month. */
  month: MonthKey;
  billed: number;
  received: number;
  /** Receivables that fell due (paid, or open past due). */
  dueCount: number;
  lateCount: number;
  /** Average days late of the late ones; null when none was late. */
  avgDaysLate: number | null;
  /** Something of this month is still open past due. */
  overdue: boolean;
}

export interface ClientAnalysis {
  receivables: ClientReceivable[];
  billed: number;
  received: number;
  /** Open, due or not. */
  open: number;
  /** Part of `open` past due. */
  overdue: number;
  interest: number;
  fine: number;
  discount: number;
  count: number;
  paidCount: number;
  onTimeCount: number;
  paidLateCount: number;
  overdueCount: number;
  openCount: number;
  /** Paid by the due date ÷ everything that fell due (paid or overdue); null when nothing fell due. */
  punctuality: number | null;
  /** Average days late of the late ones (paid late or overdue); null when never late. */
  avgDaysLate: number | null;
  maxDaysLate: number;
  /** Average days between due date and payment (negative = early); null when nothing was paid. */
  avgPaymentOffset: number | null;
  /** Due months from the first to the current one (gaps filled with zeros). */
  months: ClientMonth[];
  /** Share late among what fell due in the last 6 months and in the 6 before (null without data). */
  recentLateRate: number | null;
  previousLateRate: number | null;
  /** Score of the delinquency report over its window of `scoreMonths` months (same as its row). */
  score: DelinquencyScore;
  scoreMonths: number;
  firstDue: ISODate | null;
  lastPayment: ISODate | null;
}

const monthIndex = (key: MonthKey) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;
const fellDue = (r: ClientReceivable) => r.status !== 'aberto';
const isLate = (r: ClientReceivable) => r.status === 'atrasado' || r.status === 'vencido';

function lateRate(items: readonly ClientReceivable[]): number | null {
  const due = items.filter(fellDue);
  return due.length ? due.filter(isLate).length / due.length : null;
}

/**
 * The delinquency report's score for this client (apps/api/src/modules/reports/delinquency.ts), so
 * the report and its row agree: receivables due from the first day of the window up to today
 * (settled, or due before today), recent months weighing more, plus every open one past due.
 */
export function periodScore(receivables: readonly ClientReceivable[], today: ISODate, months: number): DelinquencyScore {
  const current = monthKey(today);
  const from = `${addMonthKey(current, -(months - 1))}-01`;
  const history = receivables
    .filter((r) => r.dueDate >= from && r.dueDate <= today && (r.paidAt !== null || r.dueDate < today))
    .map((r) => ({ daysLate: r.daysLate, monthsAgo: Math.max(0, monthIndex(current) - monthIndex(monthKey(r.dueDate))) }));
  return delinquencyScore(history, receivables.filter((r) => r.status === 'vencido').length);
}

export function analyzeClient(receivables: readonly ClientReceivable[], today: ISODate, scoreMonths = 12): ClientAnalysis {
  const sum = (pick: (r: ClientReceivable) => number, items: readonly ClientReceivable[] = receivables) => items.reduce((acc, r) => acc + pick(r), 0);
  const paid = receivables.filter((r) => r.paidAt);
  const late = receivables.filter(isLate);
  const overdueItems = receivables.filter((r) => r.status === 'vencido');
  const due = receivables.filter(fellDue);
  const current = monthKey(today);

  const byMonth = new Map<MonthKey, ClientReceivable[]>();
  for (const r of receivables) {
    const key = monthKey(r.dueDate);
    byMonth.set(key, [...(byMonth.get(key) ?? []), r]);
  }
  const months: ClientMonth[] = [];
  const dueMonths = [...byMonth.keys()].sort();
  if (dueMonths.length) {
    const last = dueMonths[dueMonths.length - 1]! > current ? dueMonths[dueMonths.length - 1]! : current;
    for (let key = dueMonths[0]!; key <= last; key = addMonthKey(key, 1)) {
      const items = byMonth.get(key) ?? [];
      const lateItems = items.filter(isLate);
      months.push({
        month: key,
        billed: sum((r) => r.amount, items),
        received: sum((r) => r.received, items),
        dueCount: items.filter(fellDue).length,
        lateCount: lateItems.length,
        avgDaysLate: lateItems.length ? Math.round(sum((r) => r.daysLate, lateItems) / lateItems.length) : null,
        overdue: items.some((r) => r.status === 'vencido'),
      });
    }
  }

  const ageOf = (r: ClientReceivable) => monthIndex(current) - monthIndex(monthKey(r.dueDate));
  const recent = due.filter((r) => ageOf(r) >= 0 && ageOf(r) < 6);
  const previous = due.filter((r) => ageOf(r) >= 6 && ageOf(r) < 12);
  const payments = paid.map((r) => r.paidAt!).sort();

  return {
    receivables: [...receivables],
    billed: sum((r) => r.amount),
    received: sum((r) => r.received),
    open: sum((r) => (r.paidAt ? 0 : r.amount)),
    overdue: sum((r) => r.amount, overdueItems),
    interest: sum((r) => r.interest),
    fine: sum((r) => r.fine),
    discount: sum((r) => r.discount),
    count: receivables.length,
    paidCount: paid.length,
    onTimeCount: receivables.filter((r) => r.status === 'em_dia').length,
    paidLateCount: receivables.filter((r) => r.status === 'atrasado').length,
    overdueCount: overdueItems.length,
    openCount: receivables.filter((r) => !r.paidAt).length,
    punctuality: due.length ? receivables.filter((r) => r.status === 'em_dia').length / due.length : null,
    avgDaysLate: late.length ? Math.round((sum((r) => r.daysLate, late) / late.length) * 10) / 10 : null,
    maxDaysLate: late.reduce((max, r) => Math.max(max, r.daysLate), 0),
    avgPaymentOffset: paid.length ? Math.round((sum((r) => r.daysLate - r.daysEarly, paid) / paid.length) * 10) / 10 : null,
    months,
    recentLateRate: lateRate(recent),
    previousLateRate: lateRate(previous),
    score: periodScore(receivables, today, scoreMonths),
    scoreMonths,
    firstDue: receivables.length ? receivables.reduce((min, r) => (r.dueDate < min ? r.dueDate : min), receivables[0]!.dueDate) : null,
    lastPayment: payments.length ? payments[payments.length - 1]! : null,
  };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** "Atrasos caíram de 40% para 10%" — last 6 months against the 6 before; null without both windows. */
export function trendText(a: Pick<ClientAnalysis, 'recentLateRate' | 'previousLateRate'>): string | null {
  const { recentLateRate: now, previousLateRate: before } = a;
  if (now === null || before === null) return null;
  const diff = Math.round((now - before) * 100);
  if (Math.abs(diff) < 5) return `Atrasos estáveis: ${pct(now)} nos últimos 6 meses (${pct(before)} nos 6 anteriores)`;
  return diff < 0
    ? `Atrasos caíram de ${pct(before)} para ${pct(now)} (últimos 6 meses contra os 6 anteriores)`
    : `Atrasos subiram de ${pct(before)} para ${pct(now)} (últimos 6 meses contra os 6 anteriores)`;
}

/** Buckets of "Quando paga": days between due date and payment of what was paid. */
export const PAYMENT_BUCKETS = [
  { key: 'early', label: 'Antes do vencimento', test: (r: ClientReceivable) => r.daysEarly > 0 },
  { key: 'due', label: 'No dia do vencimento', test: (r: ClientReceivable) => r.daysEarly === 0 && r.daysLate === 0 },
  { key: '1-5', label: '1 a 5 dias depois', test: (r: ClientReceivable) => r.daysLate >= 1 && r.daysLate <= 5 },
  { key: '6-15', label: '6 a 15 dias depois', test: (r: ClientReceivable) => r.daysLate >= 6 && r.daysLate <= 15 },
  { key: '16-30', label: '16 a 30 dias depois', test: (r: ClientReceivable) => r.daysLate >= 16 && r.daysLate <= 30 },
  { key: '31-60', label: '31 a 60 dias depois', test: (r: ClientReceivable) => r.daysLate >= 31 && r.daysLate <= 60 },
  { key: '60+', label: 'Mais de 60 dias depois', test: (r: ClientReceivable) => r.daysLate > 60 },
] as const;

export interface PaymentBucket {
  key: (typeof PAYMENT_BUCKETS)[number]['key'];
  label: string;
  count: number;
  amount: number;
  /** Share of the payments (0..1). */
  share: number;
}

export function paymentBuckets(receivables: readonly ClientReceivable[]): PaymentBucket[] {
  const paid = receivables.filter((r) => r.paidAt);
  return PAYMENT_BUCKETS.map((b) => {
    const items = paid.filter(b.test);
    return {
      key: b.key,
      label: b.label,
      count: items.length,
      amount: items.reduce((acc, r) => acc + r.amount, 0),
      share: paid.length ? items.length / paid.length : 0,
    };
  });
}

/** Worst first: what a month of the payment map shows when it has more than one receivable. */
const SEVERITY: Record<ReceivableStatus, number> = { vencido: 3, atrasado: 2, aberto: 1, em_dia: 0 };

export interface PaymentMapCell {
  month: MonthKey;
  /** Null: nothing fell due in the month. */
  status: ReceivableStatus | null;
  /** Largest days late of the month (paid late or open past due). */
  daysLate: number;
  count: number;
  amount: number;
}

/** Year by year (newest first), month by month: how each due month was paid. */
export function paymentMap(receivables: readonly ClientReceivable[]): { year: number; cells: PaymentMapCell[] }[] {
  if (receivables.length === 0) return [];
  const years = receivables.map((r) => Number(r.dueDate.slice(0, 4)));
  const first = Math.min(...years);
  const last = Math.max(...years);
  const rows: { year: number; cells: PaymentMapCell[] }[] = [];
  for (let year = last; year >= first; year--) {
    const cells: PaymentMapCell[] = [];
    for (let m = 1; m <= 12; m++) {
      const month = `${year}-${String(m).padStart(2, '0')}` as MonthKey;
      const items = receivables.filter((r) => r.dueDate.startsWith(month));
      const worst = items.reduce<ClientReceivable | null>((w, r) => (!w || SEVERITY[r.status] > SEVERITY[w.status] ? r : w), null);
      cells.push({
        month,
        status: worst?.status ?? null,
        daysLate: items.reduce((max, r) => Math.max(max, r.daysLate), 0),
        count: items.length,
        amount: items.reduce((acc, r) => acc + r.amount, 0),
      });
    }
    rows.push({ year, cells });
  }
  return rows;
}

/** The report's opening sentence: punctuality, how late when late, and what is open now. */
export function clientFinding(a: ClientAnalysis): string {
  if (a.count === 0) return 'Nenhuma cobrança registrada para este cliente.';
  const due = a.onTimeCount + a.paidLateCount + a.overdueCount;
  const parts: string[] = [];
  if (due === 0) parts.push('Nenhuma cobrança venceu ainda.');
  else if (a.avgDaysLate === null) parts.push(`Pagou ${due === 1 ? 'a única cobrança vencida' : `todas as ${due} cobranças vencidas`} no prazo.`);
  else
    parts.push(
      `Pagou ${a.onTimeCount} de ${due} ${due === 1 ? 'cobrança' : 'cobranças'} no prazo (${pct(a.punctuality ?? 0)}); quando atrasa, leva em média ${formatDays(a.avgDaysLate)} (máx. ${formatDays(a.maxDaysLate)}).`,
    );
  const oldest = a.receivables.filter((r) => r.status === 'vencido').reduce((max, r) => Math.max(max, r.daysLate), 0);
  parts.push(
    a.overdueCount > 0
      ? `${pluralize(a.overdueCount, 'cobrança vencida', 'cobranças vencidas')} em aberto, ${formatBRL(a.overdue)}, a mais antiga há ${formatDays(oldest)}.`
      : 'Nada vencido em aberto.',
  );
  return parts.join(' ');
}

export interface YearSummary {
  year: number;
  count: number;
  /** Fell due (paid, or open past due). */
  dueCount: number;
  onTimeCount: number;
  lateCount: number;
  avgDaysLate: number | null;
  billed: number;
  received: number;
}

/** Year by year, newest first: how punctual the client was and what it paid. */
export function yearSummaries(receivables: readonly ClientReceivable[]): YearSummary[] {
  const byYear = new Map<number, ClientReceivable[]>();
  for (const r of receivables) {
    const year = Number(r.dueDate.slice(0, 4));
    byYear.set(year, [...(byYear.get(year) ?? []), r]);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, items]) => {
      const late = items.filter(isLate);
      return {
        year,
        count: items.length,
        dueCount: items.filter(fellDue).length,
        onTimeCount: items.filter((r) => r.status === 'em_dia').length,
        lateCount: late.length,
        avgDaysLate: late.length ? Math.round((late.reduce((acc, r) => acc + r.daysLate, 0) / late.length) * 10) / 10 : null,
        billed: items.reduce((acc, r) => acc + r.amount, 0),
        received: items.reduce((acc, r) => acc + r.received, 0),
      };
    });
}
