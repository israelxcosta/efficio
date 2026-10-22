// Delinquency report: how each client pays its receivables (late count, days late, interest and
// fines charged), the monthly average delay, a payment score per client and the open past-due
// items used by the collection message. Receivables = income linked to a client, without the
// interest/fine rows themselves.

import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or } from 'drizzle-orm';
import {
  addMonthKey,
  delinquencyScore,
  diffInDays,
  monthKey,
  type DelinquencyClient,
  type DelinquencyMonth,
  type DelinquencyReportResponse,
  type MonthKey,
  type delinquencyReportQuerySchema,
} from '@effinance/shared';
import type { z } from 'zod';
import type { DbExecutor } from '../../db/client';
import { contacts, transactions } from '../../db/schema';
import { today } from '../../lib/clock';
import { getClientsByIds } from '../clients/service';

type DelinquencyQuery = z.output<typeof delinquencyReportQuerySchema>;

interface Receivable {
  id: string;
  contactId: string;
  description: string;
  date: string;
  amount: number;
  paid: boolean;
  paidAt: string | null;
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

  const clientRows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.kind, 'client')));
  const clientIds = clientRows.map((c) => c.id);

  const rows: Receivable[] = clientIds.length
    ? ((await db
        .select({
          id: transactions.id,
          contactId: transactions.contactId,
          description: transactions.description,
          date: transactions.date,
          amount: transactions.amount,
          paid: transactions.paid,
          paidAt: transactions.paidAt,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.workspaceId, workspaceId),
            eq(transactions.type, 'income'),
            isNull(transactions.lateFeeOf),
            isNull(transactions.creditCardId),
            inArray(transactions.contactId, clientIds),
            or(
              // In the period: settled, or due before today (due today is not late yet).
              and(gte(transactions.date, from), lte(transactions.date, now), or(eq(transactions.paid, true), lt(transactions.date, now))),
              // Anything still open past due, whatever the date.
              and(eq(transactions.paid, false), lt(transactions.date, now)),
            ),
          ),
        )) as Receivable[])
    : [];

  const fees = rows.length
    ? await db
        .select({ of: transactions.lateFeeOf, kind: transactions.lateFeeKind, amount: transactions.amount })
        .from(transactions)
        .where(
          and(
            eq(transactions.workspaceId, workspaceId),
            isNotNull(transactions.lateFeeOf),
            inArray(
              transactions.lateFeeOf,
              rows.filter((r) => r.paid).map((r) => r.id),
            ),
            ne(transactions.type, 'transfer'),
          ),
        )
    : [];
  const feesOf = new Map<string, { interest: number; fine: number }>();
  for (const f of fees) {
    if (!f.of || !f.kind) continue;
    const entry = feesOf.get(f.of) ?? { interest: 0, fine: 0 };
    entry[f.kind] += f.amount;
    feesOf.set(f.of, entry);
  }

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
  const details = new Map((await getClientsByIds(db, workspaceId, [...byClient.keys()])).map((c) => [c.id, c]));

  const clients: DelinquencyClient[] = [];
  for (const [contactId, list] of byClient) {
    const client = details.get(contactId);
    if (!client) continue;
    const period = list.filter(inPeriod);
    const late = period.filter((r) => lateDays(r, now) > 0);
    const open = list.filter((r) => !r.paid).sort((a, b) => a.date.localeCompare(b.date));
    const withFees = period.map((r) => feesOf.get(r.id)).filter((f): f is { interest: number; fine: number } => Boolean(f));
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
      overdue: open.map((r) => ({ id: r.id, description: r.description, date: r.date, amount: r.amount, daysLate: lateDays(r, now) })),
    });
  }
  clients.sort((a, b) => b.openAmount - a.openAmount || a.score - b.score || a.name.localeCompare(b.name, 'pt-BR'));

  // --- summary ------------------------------------------------------------------------------------
  const period = rows.filter(inPeriod);
  const late = period.filter((r) => lateDays(r, now) > 0);
  const open = rows.filter((r) => !r.paid);
  const allFees = period.map((r) => feesOf.get(r.id)).filter((f): f is { interest: number; fine: number } => Boolean(f));
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
