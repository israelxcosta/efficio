// Delinquency report: how each client pays its receivables (late count, days late, interest and
// fines charged), each month split into on time / paid late / open late, the client score (score v2 of
// the last 12 months minus the rework penalty, shared `clientScore`) and the open past-due items used by
// the collection message. Receivables = income linked to a client, without the interest/fine rows.

import { and, asc, eq, gte, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  addMonthKey,
  clientScore,
  diffInDays,
  monthKey,
  type DelinquencyClient,
  type DelinquencyMonth,
  type DelinquencyReportResponse,
  type LateFeeKind,
  type MonthKey,
  SCORE_WINDOW_MONTHS,
  TASK_TIME_ZONE,
  type delinquencyReportQuerySchema,
} from '@effinance/shared';
import type { z } from 'zod';
import type { DbExecutor } from '../../db/client';
import { contacts, transactions } from '../../db/schema';
import { today, todayIn } from '../../lib/clock';
import { getClientContacts } from '../clients/service';
import { noRework, reworkByClient } from './rework';

type DelinquencyQuery = z.output<typeof delinquencyReportQuerySchema>;

interface Receivable {
  id: string;
  contactId: string;
  description: string;
  date: string;
  amount: number;
  paid: boolean;
  paidAt: string | null;
  /** Competence month of a generated fee (or employee charge). */
  competence: MonthKey | null;
  /** Interest and fine charged when it was settled late (0 when none). */
  interest: number;
  fine: number;
}

/** Days late: paid → payment date − due date; open → today − due date (never negative). */
function lateDays(r: Receivable, now: string): number {
  const end = r.paid ? (r.paidAt ?? r.date) : now;
  return Math.max(0, diffInDays(end, r.date));
}

const monthIndex = (key: MonthKey) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;

const average = (values: number[]) => (values.length ? Math.round((values.reduce((a, v) => a + v, 0) / values.length) * 10) / 10 : null);

export async function delinquencyReport(db: DbExecutor, workspaceId: string, q: DelinquencyQuery): Promise<DelinquencyReportResponse> {
  const now = today();
  const currentMonth = monthKey(now);
  const firstMonth = addMonthKey(currentMonth, -(q.months - 1));
  const from = `${firstMonth}-01`;
  // The score always reads the last 12 months (SCORE_WINDOW_MONTHS), whatever the period shown.
  const scoreFrom = `${addMonthKey(currentMonth, -(SCORE_WINDOW_MONTHS - 1))}-01`;
  const queryFrom = from < scoreFrom ? from : scoreFrom;

  // Late fees of each receivable, summed per row through the partial index on late_fee_of (no id
  // lists: a long period of a large office would exceed the bind-parameter limit).
  const fee = alias(transactions, 'fee');
  const feeSum = (kind: LateFeeKind) =>
    sql<number>`(select coalesce(sum(${fee.amount}), 0) from ${transactions} as ${sql.identifier('fee')}
      where ${fee.workspaceId} = ${transactions.workspaceId} and ${fee.lateFeeOf} = ${transactions.id} and ${fee.lateFeeKind} = ${kind})`.mapWith(Number);

  const rows: Receivable[] = await db
    .select({
      id: transactions.id,
      contactId: sql<string>`${transactions.contactId}`,
      description: transactions.description,
      date: transactions.date,
      amount: transactions.amount,
      paid: transactions.paid,
      paidAt: transactions.paidAt,
      competence: transactions.feeCompetence,
      interest: feeSum('interest'),
      fine: feeSum('fine'),
    })
    .from(transactions)
    .innerJoin(contacts, and(eq(contacts.workspaceId, transactions.workspaceId), eq(contacts.id, transactions.contactId)))
    .where(
      and(
        eq(transactions.workspaceId, workspaceId),
        eq(contacts.kind, 'client'),
        eq(transactions.type, 'income'),
        isNull(transactions.lateFeeOf),
        isNull(transactions.creditCardId),
        or(
          // In the period or the score window: settled, or due before today (due today is not late yet).
          and(gte(transactions.date, queryFrom), lte(transactions.date, now), or(eq(transactions.paid, true), lt(transactions.date, now))),
          // Anything still open past due, whatever the date.
          and(eq(transactions.paid, false), lt(transactions.date, now)),
        ),
      ),
    )
    // Overdue lists read oldest first; a fee before the employee charge made after it.
    .orderBy(asc(transactions.date), asc(transactions.createdAt));

  const feesOf = (r: Receivable) => (r.interest > 0 || r.fine > 0 ? { interest: r.interest, fine: r.fine } : undefined);

  const inPeriod = (r: Receivable) => r.date >= from;
  const inScoreWindow = (r: Receivable) => r.date >= scoreFrom;

  // --- per month (by due month) -------------------------------------------------------------------
  const months: MonthKey[] = [];
  for (let m = firstMonth; m <= currentMonth; m = addMonthKey(m, 1)) months.push(m);
  const monthly: DelinquencyMonth[] = months.map((month) => {
    const due = rows.filter((r) => inPeriod(r) && r.date.startsWith(month));
    const late = due.filter((r) => lateDays(r, now) > 0);
    // Due rows are settled or open past due (the query), so each falls in exactly one of the three.
    const onTime = due.filter((r) => r.paid && lateDays(r, now) === 0);
    const paidLate = due.filter((r) => r.paid && lateDays(r, now) > 0);
    const openLate = due.filter((r) => !r.paid);
    const sum = (items: Receivable[]) => items.reduce((a, r) => a + r.amount, 0);
    return {
      month,
      dueCount: due.length,
      lateCount: late.length,
      lateRate: due.length ? late.length / due.length : 0,
      avgDaysLate: average(late.map((r) => lateDays(r, now))),
      dueAmount: sum(due),
      lateAmount: sum(late),
      onTimeCount: onTime.length,
      paidLateCount: paidLate.length,
      openLateCount: openLate.length,
      onTimeAmount: sum(onTime),
      paidLateAmount: sum(paidLate),
      openLateAmount: sum(openLate),
      paidLateAvgDays: average(paidLate.map((r) => lateDays(r, now))),
      partial: month === currentMonth,
    };
  });

  // --- per client ---------------------------------------------------------------------------------
  const byClient = new Map<string, Receivable[]>();
  for (const r of rows) {
    const list = byClient.get(r.contactId) ?? [];
    list.push(r);
    byClient.set(r.contactId, list);
  }
  const details = new Map((await getClientContacts(db, workspaceId, [...byClient.keys()])).map((c) => [c.id, c]));
  // Rework windows are fixed (90 days and 12 months in the office's day), whatever `months` is.
  const rework = await reworkByClient(db, workspaceId, todayIn(TASK_TIME_ZONE));

  const clients: DelinquencyClient[] = [];
  for (const [contactId, list] of byClient) {
    const client = details.get(contactId);
    if (!client) continue;
    const period = list.filter(inPeriod);
    const open = list.filter((r) => !r.paid).sort((a, b) => a.date.localeCompare(b.date));
    // Rows fetched only for the score window: a client with nothing due or open in the period is not listed.
    if (period.length === 0 && open.length === 0) continue;
    const late = period.filter((r) => lateDays(r, now) > 0);
    const withFees = period.map(feesOf).filter((f): f is { interest: number; fine: number } => Boolean(f));
    const history = list.filter(inScoreWindow).map((r) => ({
      daysLate: lateDays(r, now),
      monthsAgo: Math.max(0, monthIndex(currentMonth) - monthIndex(monthKey(r.date))),
    }));
    const clientRework = rework.get(contactId) ?? noRework();
    const score = clientScore(history, open.length, clientRework);
    clients.push({
      contactId,
      name: client.name,
      tradeName: client.tradeName,
      document: client.document || null,
      responsibleName: client.responsibleName,
      phone: client.responsiblePhone ?? client.phone,
      status: client.status,
      dueCount: period.length,
      onTimeCount: period.length - late.length,
      lateCount: late.length,
      openCount: open.length,
      openAmount: open.reduce((a, r) => a + r.amount, 0),
      avgDaysLate: average(late.map((r) => lateDays(r, now))),
      maxDaysLate: late.reduce((m, r) => Math.max(m, lateDays(r, now)), 0),
      interestCount: withFees.filter((f) => f.interest > 0).length,
      fineCount: withFees.filter((f) => f.fine > 0).length,
      interestTotal: withFees.reduce((a, f) => a + f.interest, 0),
      fineTotal: withFees.reduce((a, f) => a + f.fine, 0),
      ...score,
      rework: clientRework,
      overdue: open.map((r) => ({
        id: r.id,
        description: r.description,
        date: r.date,
        amount: r.amount,
        daysLate: lateDays(r, now),
        competence: r.competence,
      })),
    });
  }
  clients.sort((a, b) => b.openAmount - a.openAmount || a.score - b.score || a.name.localeCompare(b.name, 'pt-BR'));

  // --- summary ------------------------------------------------------------------------------------
  const period = rows.filter(inPeriod);
  const late = period.filter((r) => lateDays(r, now) > 0);
  const open = rows.filter((r) => !r.paid);
  const allFees = period.map(feesOf).filter((f): f is { interest: number; fine: number } => Boolean(f));
  const weight = clients.reduce((a, c) => a + c.dueCount, 0);
  return {
    from,
    to: now,
    summary: {
      dueCount: period.length,
      lateCount: late.length,
      lateRate: period.length ? late.length / period.length : 0,
      avgDaysLate: average(late.map((r) => lateDays(r, now))),
      openCount: open.length,
      openAmount: open.reduce((a, r) => a + r.amount, 0),
      openClients: new Set(open.map((r) => r.contactId)).size,
      interestTotal: allFees.reduce((a, f) => a + f.interest, 0),
      fineTotal: allFees.reduce((a, f) => a + f.fine, 0),
      paidWithFeesCount: allFees.length,
      probability: weight ? clients.reduce((a, c) => a + c.probability * c.dueCount, 0) / weight : 0,
      clientsAtRisk: clients.filter((c) => c.risk === 'alto' || c.risk === 'critico').length,
      reworkCount: clients.reduce((a, c) => a + c.rework.last90Days, 0),
      reworkClients: clients.filter((c) => c.rework.last90Days > 0).length,
    },
    monthly,
    clients,
  };
}
