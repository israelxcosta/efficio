import { and, between, desc, eq, sql, type SQL } from 'drizzle-orm';
import {
  PAYMENT_METHOD_LABELS,
  RECEIPTS_ITEMS_LIMIT,
  diffInDays,
  type ISODate,
  type PaymentMethod,
  type ReceiptsGroup,
  type ReceiptsReportQuery,
  type ReceiptsReportResponse,
} from '@effinance/shared';
import type { DbExecutor } from '../../db/client';
import { accounts, transactions } from '../../db/schema';
import { ValidationError } from '../../lib/errors';
import { countAll, sumOf } from '../../lib/sql';
import { getAccountOrThrow } from '../common/ownership';
import { toTransactions } from '../transactions/mapper';

/** The day the money came in: the payment date, or the due date of rows confirmed without one. */
const receivedOn = sql<ISODate>`coalesce(${transactions.paidAt}, ${transactions.date})`;

/** Same rule as the overview: a card purchase counts as credit card when no method was chosen. */
const methodOf = sql<PaymentMethod | null>`coalesce(${transactions.paymentMethod}, case when ${transactions.creditCardId} is not null then 'credit_card' end)`;

/**
 * Money received in a range by the day it came in, to check against the bank statement: income that
 * is paid (receipts, settled fees, interest and fines received), split by payment method, account and
 * day. Transfers between own accounts are not income and stay out.
 */
export async function receiptsReport(db: DbExecutor, workspaceId: string, q: ReceiptsReportQuery): Promise<ReceiptsReportResponse> {
  if (q.from > q.to) throw new ValidationError('Data inicial maior que a final');
  if (diffInDays(q.to, q.from) > 366 * 2) throw new ValidationError('Período máximo de 2 anos');
  if (q.accountId) await getAccountOrThrow(db, workspaceId, q.accountId);

  const filters: (SQL | undefined)[] = [
    eq(transactions.workspaceId, workspaceId),
    eq(transactions.type, 'income'),
    eq(transactions.paid, true),
    between(receivedOn, q.from, q.to),
    q.accountId ? eq(transactions.accountId, q.accountId) : undefined,
    q.method === 'none' ? sql`${methodOf} is null` : q.method ? sql`${methodOf} = ${q.method}` : undefined,
  ];
  const where = and(...filters);

  const [byMethodRows, byAccountRows, byDayRows, rows, accountRows] = await Promise.all([
    db.select({ key: methodOf, amount: sumOf(transactions.amount), count: countAll() }).from(transactions).where(where).groupBy(sql`1`),
    db
      .select({ key: transactions.accountId, amount: sumOf(transactions.amount), count: countAll() })
      .from(transactions)
      .where(where)
      .groupBy(transactions.accountId),
    db
      .select({ date: receivedOn, method: methodOf, amount: sumOf(transactions.amount), count: countAll() })
      .from(transactions)
      .where(where)
      .groupBy(sql`1`, sql`2`)
      .orderBy(sql`1`),
    db
      .select()
      .from(transactions)
      .where(where)
      .orderBy(desc(receivedOn), desc(transactions.createdAt))
      .limit(RECEIPTS_ITEMS_LIMIT + 1),
    db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(eq(accounts.workspaceId, workspaceId)),
  ]);

  const total = byMethodRows.reduce((a, r) => a + r.amount, 0);
  const count = byMethodRows.reduce((a, r) => a + r.count, 0);
  const share = (amount: number) => (total ? amount / total : 0);
  const byAmount = (a: ReceiptsGroup, b: ReceiptsGroup) => b.amount - a.amount;

  const byMethod: ReceiptsGroup[] = byMethodRows
    .map((r) => ({
      key: r.key,
      label: r.key ? PAYMENT_METHOD_LABELS[r.key] : 'Não informado',
      amount: r.amount,
      count: r.count,
      share: share(r.amount),
    }))
    .sort(byAmount);

  const names = new Map(accountRows.map((a) => [a.id, a.name]));
  const byAccount: ReceiptsGroup[] = byAccountRows
    .map((r) => ({
      key: r.key,
      label: r.key ? (names.get(r.key) ?? 'Conta removida') : 'Sem conta',
      amount: r.amount,
      count: r.count,
      share: share(r.amount),
    }))
    .sort(byAmount);

  const days = new Map<ISODate, ReceiptsReportResponse['days'][number]>();
  for (const r of byDayRows) {
    const day = days.get(r.date) ?? { date: r.date, total: 0, count: 0, byMethod: {} };
    day.total += r.amount;
    day.count += r.count;
    const key = r.method ?? 'none';
    day.byMethod[key] = (day.byMethod[key] ?? 0) + r.amount;
    days.set(r.date, day);
  }

  const truncated = rows.length > RECEIPTS_ITEMS_LIMIT;
  return {
    from: q.from,
    to: q.to,
    total,
    count,
    notInformed: byMethod.find((m) => m.key === null)?.amount ?? 0,
    byMethod,
    byAccount,
    days: [...days.values()],
    items: await toTransactions(db, truncated ? rows.slice(0, RECEIPTS_ITEMS_LIMIT) : rows),
    truncated,
  };
}
