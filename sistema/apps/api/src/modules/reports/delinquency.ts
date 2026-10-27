// Delinquency report: how each client pays its receivables (late count, days late, interest and
// fines charged), the monthly average delay, a payment score per client and the open past-due
// items used by the collection message. Receivables = income linked to a client, without the
// interest/fine rows themselves.

import { and, asc, eq, gte, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  addMonthKey,
  delinquencyScore,
  diffInDays,
  monthKey,
  type DelinquencyClient,
  type DelinquencyMonth,
  type DelinquencyReportResponse,
  type LateFeeKind,
  type MonthKey,
  type delinquencyReportQuerySchema,
} from '@effinance/shared';
import type { z } from 'zod';
import type { DbExecutor } from '../../db/client';
import { contacts, transactions } from '../../db/schema';
import { today } from '../../lib/clock';
import { getClientContacts } from '../clients/service';

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

const average = (values: number[]) => (values.length ? Math.round((values.reduce((a, v) => a + v, 0) / values.length) * 10) / 10 : null);

export async function delinquencyReport(db: DbExecutor, workspaceId: string, q: DelinquencyQuery): Promise<DelinquencyReportResponse> {
  const now = today();
  const currentMonth = monthKey(now);
  const firstMonth = addMonthKey(currentMonth, -(q.months - 1));
  const from = `${firstMonth}-01`;

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
          // In the period: settled, or due before today (due today is not late yet).
          and(gte(transactions.date, from), lte(transactions.date, now), or(eq(transactions.paid, true), lt(transactions.date, now))),
          // Anything still open past due, whatever the date.
          and(eq(transactions.paid, false), lt(transactions.date, now)),
        ),
      ),
    )
    // Overdue lists read oldest first; a fee before the employee charge made after it.
    .orderBy(asc(transactions.date), asc(transactions.createdAt));

  const feesOf = (r: Receivable) => (r.interest > 0 || r.fine > 0 ? { interest: r.interest, fine: r.fine } : undefined);

  const inPeriod = (r: Receivable) => r.date >= from;

  // --- per month (by due month) -------------------------------------------------------------------
  const months: MonthKey[] = [];
  for (let m = firstMonth; m <= currentMonth; m = addMonthKey(m, 1)) months.push(m);
  const monthly: DelinquencyMonth[] = months.map((month) => {
    const due = rows.filter((r) => inPeriod(r) && r.date.startsWith(month));
    const late = due.filter((r) => lateDays(r, now) > 0);
    return {
      month,
      dueCount: due.length,
      lateCount: late.length,
      lateRate: due.length ? late.length / due.length : 0,
      avgDaysLate: average(late.map((r) => lateDays(r, now))),
      dueAmount: due.reduce((a, r) => a + r.amount, 0),
      lateAmount: late.reduce((a, r) => a + r.amount, 0),
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

  const clients: DelinquencyClient[] = [];
  for (const [contactId, list] of byClient) {
    const client = details.get(contactId);
    if (!client) continue;
    const period = list.filter(inPeriod);
    const late = period.filter((r) => lateDays(r, now) > 0);
    const open = list.filter((r) => !r.paid).sort((a, b) => a.date.localeCompare(b.date));
    const withFees = period.map(feesOf).filter((f): f is { interest: number; fine: number } => Boolean(f));
    const history = period.map((r) => ({
      daysLate: lateDays(r, now),
      monthsAgo: Math.max(0, months.length - 1 - months.indexOf(monthKey(r.date))),
    }));
    const score = delinquencyScore(history, open.length);
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
    },
    monthly,
    clients,
  };
}
