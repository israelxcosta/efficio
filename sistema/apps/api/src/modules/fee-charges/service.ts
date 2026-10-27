// "Gerar honorários" and "+ Empregados" (migrations 0009/0010). A competence month M is billed in the
// following month: each client gets one receivable with the fee of the period in force at the end
// of M, due on the client's `feeDueDay` of M+1 and offering the period's discount for paying by the
// due date. The employee charge of a generated fee is headcount × the client's employee fee of that
// same period, as its own receivable with the fee's due date (and no discount).

import { and, eq, sql } from 'drizzle-orm';
import {
  addMonthKey,
  daysInMonth,
  FEE_CATEGORY,
  feePeriodIndexAt,
  monthRange,
  parseISODate,
  toISODate,
  type FeeEmployeesResponse,
  type feeEmployeesSchema,
  type GenerateFeesResponse,
  type generateFeesSchema,
  type GenerateFeesSkipReason,
  type ISODate,
  type MonthKey,
} from '@effinance/shared';
import type { z } from 'zod';
import type { DbExecutor } from '../../db/client';
import { clientFees, contacts, transactions, type NewTransactionRow } from '../../db/schema';
import { ValidationError } from '../../lib/errors';
import { ensureCategoryPath } from '../categories/service';
import { getTransactionOrThrow } from '../common/ownership';
import { getTransaction } from '../transactions/service';

type GenerateFeesInput = z.output<typeof generateFeesSchema>;
type FeeEmployeesInput = z.output<typeof feeEmployeesSchema>;

/** 'YYYY-MM' → 'MM/AAAA'. */
export function competenceLabel(competence: MonthKey): string {
  const [year, month] = competence.split('-');
  return `${month}/${year}`;
}

/** Due date of a competence: `dueDay` of the following month, clamped to that month's length. */
export function feeDueDate(competence: MonthKey, dueDay: number): ISODate {
  const { year, month } = parseISODate(`${addMonthKey(competence, 1)}-01`);
  return toISODate(year, month, Math.min(dueDay, daysInMonth(year, month)));
}

/** Index of the fee period in force at the end of the competence month. */
function periodIndexFor(contractStartDate: ISODate, competence: MonthKey): number {
  return feePeriodIndexAt(contractStartDate, monthRange(competence).to);
}

function employeesLabel(employees: number): string {
  return employees === 1 ? '1 empregado' : `${employees} empregados`;
}

/**
 * Fee writes of a workspace run one at a time (transaction-scoped advisory lock): two clicks on
 * "Gerar honorários" neither create the categories twice nor race on the same fees.
 */
async function lockFeeCharges(db: DbExecutor, workspaceId: string) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`fee-charges:${workspaceId}`}, 0))`);
}

/**
 * "Serviços Prestados" and its "Honorários contábeis" / "Folha de pagamento" subcategories: found by
 * name (any case; an active one first), created when missing with the default icon and color.
 */
async function feeCategories(db: DbExecutor, workspaceId: string) {
  const { categoryId, subcategories } = await ensureCategoryPath(db, workspaceId, 'income', FEE_CATEGORY.name, [
    FEE_CATEGORY.fee,
    FEE_CATEGORY.employees,
  ]);
  return { categoryId, fee: subcategories[FEE_CATEGORY.fee], employees: subcategories[FEE_CATEGORY.employees] };
}

// ---------------------------------------------------------------------------
// Gerar honorários
// ---------------------------------------------------------------------------

/** Due day of a client saved before migration 0010 set one. */
const DEFAULT_DUE_DAY = 10;

export async function generateFees(db: DbExecutor, workspaceId: string, input: GenerateFeesInput): Promise<GenerateFeesResponse> {
  const { competence, dryRun } = input;
  const { from: firstDay, to: lastDay } = monthRange(competence);
  if (!dryRun) await lockFeeCharges(db, workspaceId);

  const [clients, periods, billed] = await Promise.all([
    db
      .select({
        id: contacts.id,
        name: contacts.name,
        tradeName: contacts.tradeName,
        contractStartDate: contacts.contractStartDate,
        inactivatedAt: contacts.inactivatedAt,
        feeDueDay: contacts.feeDueDay,
      })
      .from(contacts)
      .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.kind, 'client'))),
    db
      .select({
        clientId: clientFees.clientId,
        periodIndex: clientFees.periodIndex,
        amount: clientFees.amount,
        discountBps: clientFees.discountBps,
      })
      .from(clientFees)
      .where(eq(clientFees.workspaceId, workspaceId)),
    db
      .select({ contactId: transactions.contactId })
      .from(transactions)
      .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.feeKind, 'fee'), eq(transactions.feeCompetence, competence))),
  ]);
  const already = new Set(billed.map((b) => b.contactId));
  const periodOf = new Map(periods.map((p) => [`${p.clientId}:${p.periodIndex}`, p]));

  const display = (c: (typeof clients)[number]) => c.tradeName || c.name;
  clients.sort((a, b) => display(a).localeCompare(display(b), 'pt-BR'));

  type Due = Omit<GenerateFeesResponse['created'][number], 'transactionId'>;
  const due: Due[] = [];
  const skipped: GenerateFeesResponse['skipped'] = [];
  for (const client of clients) {
    const name = display(client);
    const start = client.contractStartDate!;
    let reason: GenerateFeesSkipReason | null = null;
    let period: (typeof periods)[number] | undefined;
    if (already.has(client.id)) reason = 'already_generated';
    else if (start > lastDay) reason = 'not_started';
    else if (client.inactivatedAt && client.inactivatedAt < firstDay) reason = 'inactive';
    else {
      period = periodOf.get(`${client.id}:${periodIndexFor(start, competence)}`);
      if (!period) reason = 'no_current_fee';
    }
    if (reason) skipped.push({ clientId: client.id, name, reason });
    else if (period) {
      due.push({
        clientId: client.id,
        name,
        amount: period.amount,
        dueDate: feeDueDate(competence, client.feeDueDay ?? DEFAULT_DUE_DAY),
        discountBps: period.discountBps,
      });
    }
  }

  let ids = new Map<string, string | null>(due.map((d) => [d.clientId, null]));
  if (!dryRun && due.length) {
    const cats = await feeCategories(db, workspaceId);
    const label = competenceLabel(competence);
    const rows: NewTransactionRow[] = due.map((d) => ({
      workspaceId,
      type: 'income',
      description: `Honorários ref. ${label} - ${d.name}`,
      amount: d.amount,
      date: d.dueDate,
      paid: false,
      paidAt: null,
      accountId: null,
      contactId: d.clientId,
      categoryId: cats.categoryId,
      subcategoryId: cats.fee,
      paymentMethod: 'bank_slip',
      feeKind: 'fee',
      feeCompetence: competence,
      feeDiscountBps: d.discountBps || null,
    }));
    // A fee generated meanwhile (lost race) is skipped by the unique index instead of failing.
    const inserted = await db
      .insert(transactions)
      .values(rows)
      .onConflictDoNothing({
        target: [transactions.workspaceId, transactions.contactId, transactions.feeCompetence],
        where: sql`fee_kind = 'fee'`,
      })
      .returning({ id: transactions.id, contactId: transactions.contactId });
    ids = new Map(inserted.map((r) => [r.contactId!, r.id]));
  }

  const created: GenerateFeesResponse['created'] = [];
  for (const d of due) {
    if (ids.has(d.clientId)) created.push({ ...d, transactionId: ids.get(d.clientId) ?? null });
    else skipped.push({ clientId: d.clientId, name: d.name, reason: 'already_generated' });
  }
  skipped.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return { competence, dryRun, created, skipped, total: created.reduce((a, c) => a + c.amount, 0) };
}

// ---------------------------------------------------------------------------
// + Empregados
// ---------------------------------------------------------------------------

export async function setFeeEmployees(
  db: DbExecutor,
  workspaceId: string,
  id: string,
  input: FeeEmployeesInput,
): Promise<FeeEmployeesResponse> {
  const fee = await getTransactionOrThrow(db, workspaceId, id);
  if (fee.feeKind !== 'fee' || !fee.feeCompetence) {
    throw new ValidationError('"+ Empregados" vale só para honorários gerados pelo "Gerar honorários"');
  }
  const competence = fee.feeCompetence;
  const [client] = fee.contactId
    ? await db
        .select({ name: contacts.name, tradeName: contacts.tradeName, contractStartDate: contacts.contractStartDate })
        .from(contacts)
        .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, fee.contactId), eq(contacts.kind, 'client')))
    : [];
  if (!client?.contractStartDate) throw new ValidationError('Este honorário não está vinculado a um cliente');

  const [period] = await db
    .select({ employeeFee: clientFees.employeeFee })
    .from(clientFees)
    .where(
      and(
        eq(clientFees.workspaceId, workspaceId),
        eq(clientFees.clientId, fee.contactId!),
        eq(clientFees.periodIndex, periodIndexFor(client.contractStartDate, competence)),
      ),
    );
  const rate = period?.employeeFee ?? 0;
  const { employees, dryRun } = input;
  const amount = rate * employees;
  if (employees > 0 && !period) {
    throw new ValidationError(`O cliente não tem honorário vigente em ${competenceLabel(competence)}`);
  }
  if (employees > 0 && rate === 0) throw new ValidationError('Cadastre a taxa por empregado no honorário do cliente');

  if (!dryRun) await lockFeeCharges(db, workspaceId);
  const [current] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.feeOf, fee.id)));
  const result = { employees, rate, amount, dryRun };
  // Received: it stays as it was (sending the same headcount again is not a change).
  if (current?.paid) {
    if (current.employees !== employees || current.amount !== amount) {
      throw new ValidationError('A cobrança de empregados já foi recebida: reabra o recebimento para alterá-la');
    }
    return { ...result, transaction: dryRun ? null : await getTransaction(db, workspaceId, current.id) };
  }
  if (dryRun) return { ...result, transaction: null };
  const own = (rowId: string) => and(eq(transactions.workspaceId, workspaceId), eq(transactions.id, rowId));

  if (employees === 0) {
    if (current) await db.delete(transactions).where(own(current.id));
    return { ...result, transaction: null };
  }

  const cats = await feeCategories(db, workspaceId);
  const values = {
    description: `Folha de pagamento ref. ${competenceLabel(competence)} - ${client.tradeName || client.name} (${employeesLabel(employees)})`,
    amount,
    employees,
    date: fee.date,
    contactId: fee.contactId,
    categoryId: cats.categoryId,
    subcategoryId: cats.employees,
  };
  let rowId = current?.id;
  if (rowId) {
    await db.update(transactions).set(values).where(own(rowId));
  } else {
    const [row] = await db
      .insert(transactions)
      .values({
        ...values,
        workspaceId,
        type: 'income',
        paid: false,
        paidAt: null,
        accountId: fee.accountId,
        paymentMethod: fee.paymentMethod ?? 'bank_slip',
        feeKind: 'employees',
        feeCompetence: competence,
        feeOf: fee.id,
      })
      .returning({ id: transactions.id });
    rowId = row!.id;
  }
  return { ...result, transaction: await getTransaction(db, workspaceId, rowId) };
}
