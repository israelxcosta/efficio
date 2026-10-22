// "Gerar honorários" and "+ Empregados" (migration 0009). A competence month M is billed in the
// following month: each client gets one receivable with the fee of the period in force at the end
// of M, due on `dueDay` of M+1. The employee charge of a generated fee is headcount × the client's
// employee fee of that same period, as its own receivable with the fee's due date.

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
  type IconName,
  type ISODate,
  type MonthKey,
} from '@effinance/shared';
import type { z } from 'zod';
import type { DbExecutor } from '../../db/client';
import { categories, clientFees, contacts, transactions, type NewTransactionRow } from '../../db/schema';
import { ValidationError } from '../../lib/errors';
import { BUSINESS_CATEGORIES } from '../categories/defaults';
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

const normalize = (name: string) => name.trim().toLocaleLowerCase('pt-BR');

/**
 * "Serviços Prestados" and its "Honorários contábeis" / "Folha de pagamento" subcategories: found by
 * name (any case; an active one first), created when missing with the default icon and color.
 */
async function feeCategories(db: DbExecutor, workspaceId: string) {
  const rows = await db
    .select()
    .from(categories)
    .where(and(eq(categories.workspaceId, workspaceId), eq(categories.type, 'income')));
  const find = (list: typeof rows, name: string) =>
    list.filter((r) => normalize(r.name) === normalize(name)).sort((a, b) => Number(a.archived) - Number(b.archived))[0];
  const defaults = BUSINESS_CATEGORIES.find((c) => c.name === FEE_CATEGORY.name);
  const iconOf = (name: string): IconName => defaults?.subcategories?.find((s) => s.name === name)?.icon ?? 'briefcase';

  let parent = find(
    rows.filter((r) => !r.parentId),
    FEE_CATEGORY.name,
  );
  if (!parent) {
    [parent] = await db
      .insert(categories)
      .values({ workspaceId, name: FEE_CATEGORY.name, type: 'income', icon: defaults?.icon ?? 'briefcase', color: defaults?.color ?? '#12A150' })
      .returning();
  }
  const children = rows.filter((r) => r.parentId === parent!.id);
  const sub = async (name: string) => {
    const found = find(children, name);
    if (found) return found.id;
    const [row] = await db
      .insert(categories)
      .values({ workspaceId, parentId: parent!.id, name, type: 'income', icon: iconOf(name), color: parent!.color })
      .returning({ id: categories.id });
    return row!.id;
  };
  return { categoryId: parent!.id, fee: await sub(FEE_CATEGORY.fee), employees: await sub(FEE_CATEGORY.employees) };
}

// ---------------------------------------------------------------------------
// Gerar honorários
// ---------------------------------------------------------------------------

export async function generateFees(db: DbExecutor, workspaceId: string, input: GenerateFeesInput): Promise<GenerateFeesResponse> {
  const { competence, dueDay, dryRun } = input;
  const { from: firstDay, to: lastDay } = monthRange(competence);
  const dueDate = feeDueDate(competence, dueDay);
  if (!dryRun) await lockFeeCharges(db, workspaceId);

  const [clients, periods, billed] = await Promise.all([
    db
      .select({
        id: contacts.id,
        name: contacts.name,
        tradeName: contacts.tradeName,
        contractStartDate: contacts.contractStartDate,
        inactivatedAt: contacts.inactivatedAt,
      })
      .from(contacts)
      .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.kind, 'client'))),
    db
      .select({ clientId: clientFees.clientId, periodIndex: clientFees.periodIndex, amount: clientFees.amount })
      .from(clientFees)
      .where(eq(clientFees.workspaceId, workspaceId)),
    db
      .select({ contactId: transactions.contactId })
      .from(transactions)
      .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.feeKind, 'fee'), eq(transactions.feeCompetence, competence))),
  ]);
  const already = new Set(billed.map((b) => b.contactId));
  const amountOf = new Map(periods.map((p) => [`${p.clientId}:${p.periodIndex}`, p.amount]));

  const display = (c: (typeof clients)[number]) => c.tradeName || c.name;
  clients.sort((a, b) => display(a).localeCompare(display(b), 'pt-BR'));

  const due: { clientId: string; name: string; amount: number }[] = [];
  const skipped: GenerateFeesResponse['skipped'] = [];
  for (const client of clients) {
    const name = display(client);
    const start = client.contractStartDate!;
    let reason: GenerateFeesSkipReason | null = null;
    let amount: number | undefined;
    if (already.has(client.id)) reason = 'already_generated';
    else if (start > lastDay) reason = 'not_started';
    else if (client.inactivatedAt && client.inactivatedAt < firstDay) reason = 'inactive';
    else {
      amount = amountOf.get(`${client.id}:${periodIndexFor(start, competence)}`);
      if (amount === undefined) reason = 'no_current_fee';
    }
    if (reason) skipped.push({ clientId: client.id, name, reason });
    else due.push({ clientId: client.id, name, amount: amount! });
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
      date: dueDate,
      paid: false,
      paidAt: null,
      accountId: null,
      contactId: d.clientId,
      categoryId: cats.categoryId,
      subcategoryId: cats.fee,
      paymentMethod: 'bank_slip',
      feeKind: 'fee',
      feeCompetence: competence,
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
  return { competence, dueDate, dryRun, created, skipped, total: created.reduce((a, c) => a + c.amount, 0) };
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
