// Client-base evolution (GET /reports/evolution): month by month, contracts started, clients inactivated,
// the active base and the monthly fees in force at the end of the month (shared `clientBaseEvolution`,
// over the client rows and their fee periods — one row per client and per contract year), what was
// billed and received from clients (SQL aggregates per month over `transactions`), and the current
// month against the previous one. Months are the office's (America/Sao_Paulo); the current month
// counts up to today.

import { and, between, eq, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  addMonthKey,
  clientBaseEvolution,
  evolutionComparison,
  monthKey,
  monthRange,
  TASK_TIME_ZONE,
  type EvolutionMonth,
  type EvolutionReportResponse,
  type evolutionReportQuerySchema,
  type ISODate,
} from '@effinance/shared';
import type { z } from 'zod';
import type { DbExecutor } from '../../db/client';
import { clientFees, contacts, transactions } from '../../db/schema';
import { todayIn } from '../../lib/clock';
import { sumOf } from '../../lib/sql';
import { ensureMaterialized } from '../transactions/series';

type EvolutionQuery = z.output<typeof evolutionReportQuerySchema>;

const monthOf = (day: SQL | typeof transactions.date) => sql<string>`to_char(${day}, 'YYYY-MM')`;
const PAID_DAY = sql`coalesce(${transactions.paidAt}, ${transactions.date})`;

/** Transactions of the workspace's clients (contacts of kind `client`). */
const clientJoin = and(eq(contacts.workspaceId, transactions.workspaceId), eq(contacts.id, transactions.contactId));

/**
 * Billed per due month: receivables of clients (income, not on a card), paid or not, without the
 * interest/fine rows (charged on payment, they are part of what was received).
 */
async function billedByMonth(db: DbExecutor, workspaceId: string, from: ISODate, to: ISODate) {
  const month = monthOf(transactions.date);
  return db
    .select({ month, amount: sumOf(transactions.amount) })
    .from(transactions)
    .innerJoin(contacts, clientJoin)
    .where(
      and(
        eq(transactions.workspaceId, workspaceId),
        eq(contacts.kind, 'client'),
        eq(transactions.type, 'income'),
        isNull(transactions.lateFeeOf),
        isNull(transactions.creditCardId),
        between(transactions.date, from, to),
      ),
    )
    .groupBy(month);
}

/**
 * Received per payment month: paid incomes of clients (receivables plus their interest/fine rows) minus
 * the punctuality discounts granted (paid expenses linked to a receivable), what actually came in.
 */
async function receivedByMonth(db: DbExecutor, workspaceId: string, from: ISODate, to: ISODate) {
  const month = monthOf(PAID_DAY);
  return db
    .select({
      month,
      amount: sumOf(sql`case when ${transactions.type} = 'income' then ${transactions.amount} else -${transactions.amount} end`),
    })
    .from(transactions)
    .innerJoin(contacts, clientJoin)
    .where(
      and(
        eq(transactions.workspaceId, workspaceId),
        eq(contacts.kind, 'client'),
        eq(transactions.paid, true),
        isNull(transactions.creditCardId),
        or(eq(transactions.type, 'income'), and(eq(transactions.type, 'expense'), isNotNull(transactions.discountOf))),
        sql`${PAID_DAY} between ${from} and ${to}`,
      ),
    )
    .groupBy(month);
}

export async function evolutionReport(db: DbExecutor, workspaceId: string, q: EvolutionQuery): Promise<EvolutionReportResponse> {
  const today = todayIn(TASK_TIME_ZONE);
  const current = monthKey(today);
  const shownFrom = addMonthKey(current, -(q.months - 1));
  // One month before the first shown: the comparison needs the previous month even with months = 1.
  const first = addMonthKey(shownFrom, -1);
  const from = monthRange(first).from;
  const to = monthRange(current).to;
  // Open-ended series of receivables get their rows of the current month (like the other reports).
  await ensureMaterialized(db, workspaceId, to);

  const [clients, fees, billed, received] = await Promise.all([
    db
      .select({ id: contacts.id, contractStartDate: contacts.contractStartDate, inactivatedAt: contacts.inactivatedAt })
      .from(contacts)
      .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.kind, 'client'))),
    db
      .select({ clientId: clientFees.clientId, periodIndex: clientFees.periodIndex, amount: clientFees.amount })
      .from(clientFees)
      .where(eq(clientFees.workspaceId, workspaceId)),
    billedByMonth(db, workspaceId, from, to),
    receivedByMonth(db, workspaceId, from, to),
  ]);

  const billedOf = new Map(billed.map((r) => [r.month, r.amount]));
  const receivedOf = new Map(received.map((r) => [r.month, r.amount]));
  const months: EvolutionMonth[] = clientBaseEvolution({
    // A client always has a contract start (contacts_client_chk).
    clients: clients.map((c) => ({ id: c.id, contractStartDate: c.contractStartDate!, inactivatedAt: c.inactivatedAt })),
    fees,
    from: first,
    to: current,
    today,
  }).map((m) => ({ ...m, billed: billedOf.get(m.month) ?? 0, received: receivedOf.get(m.month) ?? 0 }));

  return {
    today,
    from: monthRange(shownFrom).from,
    to: today,
    months: months.slice(1),
    comparison: evolutionComparison(months[months.length - 1]!, months[months.length - 2]!),
  };
}
