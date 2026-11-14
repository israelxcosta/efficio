// Interest and fines (juros e multa) in their own categories (13/11/2026): never the original's, so
// interest on a fee does not inflate "Serviços Prestados › Honorários contábeis" (in the Simples
// Nacional interest and fines are not gross revenue — Res. CGSN 140/2018, art. 2º, §5º, II). Migration
// 0021 reclassifies the rows saved before. Today is pinned to 2026-10-20.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FEE_CATEGORY, LATE_FEE_CATEGORY } from '@effinance/shared';
import type { App } from '../src/app';
import { executeRows } from '../src/lib/sql';
import { admin, createAccount, createTestApp, firstCategory, registerUser, resetDb, type Client } from './helpers';
import { createClient, workspaceOf } from './task-helpers';

let app: App;
let c: Client;
let account: string;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
  c = await registerUser(app, 'Ana do Escritório');
  account = await createAccount(c, { initialBalance: 0 });
});

async function runMigration0021() {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle/0021_late_fees_fee_adjustments.sql');
  const source = await readFile(file, 'utf8');
  await admin().transaction(async (tx) => {
    for (const statement of source.split('--> statement-breakpoint')) if (statement.trim()) await tx.execute(sql.raw(statement));
  });
}

/** A fee of a client (Serviços Prestados › Honorários contábeis), due 15/09, received late on 05/10. */
async function lateFee(as: Client = c, accountId = account) {
  const client = await createClient(as, { tradeName: 'Padaria Pão Dourado' });
  const services = await firstCategory(as, 'income', FEE_CATEGORY.name);
  const fees = services.subcategories.find((s) => s.name === FEE_CATEGORY.fee)!;
  const created = await as.post('/transactions', {
    type: 'income',
    description: 'Honorários 09/2026',
    amount: 80_000,
    date: '2026-09-15',
    accountId,
    contactId: client,
    categoryId: services.id,
    subcategoryId: fees.id,
  });
  expect(created.status).toBe(201);
  const id = created.body[0].id as string;
  const paid = await as.patch(`/transactions/${id}/paid`, { paid: true, paidAt: '2026-10-05', interest: 533, fine: 1_600 });
  expect(paid.status).toBe(200);
  return { id, client, services, fees };
}

const linkedOf = async (as: Client, id: string) =>
  ((await as.get('/transactions?type=income&pageSize=100')).body.items as any[])
    .filter((t) => t.lateFeeOf === id)
    .map((t) => ({ kind: t.lateFeeKind, categoryId: t.categoryId, subcategoryId: t.subcategoryId }))
    .sort((a, b) => a.kind.localeCompare(b.kind));

describe('B4: interest and fines in their own category', () => {
  it('a late receivable books them in "Receitas financeiras › Juros e multas recebidos", kept when the payment moves', async () => {
    const financial = await firstCategory(c, 'income', LATE_FEE_CATEGORY.income.name);
    const received = financial.subcategories.find((s) => s.name === LATE_FEE_CATEGORY.income.lateFee)!;
    expect(received).toBeDefined(); // new workspaces come with it
    const { id, services } = await lateFee();
    const expected = { categoryId: financial.id, subcategoryId: received.id };
    expect(await linkedOf(c, id)).toEqual([
      { kind: 'fine', ...expected },
      { kind: 'interest', ...expected },
    ]);

    // Confirmed again on another day, or the original moved to another category: they stay where they are.
    expect((await c.patch(`/transactions/${id}/paid`, { paid: true, paidAt: '2026-10-08' })).body.lateFees).toEqual({ interest: 533, fine: 1_600 });
    const other = await firstCategory(c, 'income', 'Outras receitas');
    expect((await c.put(`/transactions/${id}?scope=one`, { categoryId: other.id })).status).toBe(200);
    expect(await linkedOf(c, id)).toEqual([
      { kind: 'fine', ...expected },
      { kind: 'interest', ...expected },
    ]);

    // Reports by category: the fee's category has the fee only; the interest is financial income.
    await c.put(`/transactions/${id}?scope=one`, { categoryId: services.id });
    const report = (await c.get('/reports/categories?from=2026-09-01&to=2026-10-31&type=income&status=paid')).body;
    const totals = Object.fromEntries((report.series as any[]).map((s) => [s.name, s.total]));
    expect(totals[FEE_CATEGORY.name]).toBe(80_000);
    expect(totals[LATE_FEE_CATEGORY.income.name]).toBe(533 + 1_600);
  });

  it('a late bill books them in "Despesas financeiras › Juros e multas"', async () => {
    const supplier = await c.post('/contacts', { name: 'Imobiliária Centro' });
    const rent = await firstCategory(c, 'expense', 'Ocupação');
    const bill = await c.post('/transactions', {
      type: 'expense',
      description: 'Aluguel 09/2026',
      amount: 180_000,
      date: '2026-09-05',
      accountId: account,
      contactId: supplier.body.id,
      categoryId: rent.id,
      subcategoryId: rent.subcategories[0]!.id,
    });
    const id = bill.body[0].id;
    expect((await c.patch(`/transactions/${id}/paid`, { paid: true, paidAt: '2026-09-12', interest: 420, fine: 3_600 })).status).toBe(200);
    const financial = await firstCategory(c, 'expense', LATE_FEE_CATEGORY.expense.name);
    const fees = financial.subcategories.find((s) => s.name === LATE_FEE_CATEGORY.expense.lateFee)!;
    const rows = ((await c.get('/transactions?type=expense&pageSize=100')).body.items as any[]).filter((t) => t.lateFeeOf === id);
    expect(rows.map((t) => [t.lateFeeKind, t.categoryId, t.subcategoryId]).sort()).toEqual([
      ['fine', financial.id, fees.id],
      ['interest', financial.id, fees.id],
    ]);
  });

  it('creates the category when it was renamed (or its subcategory removed)', async () => {
    const financial = await firstCategory(c, 'income', LATE_FEE_CATEGORY.income.name);
    expect((await c.put(`/categories/${financial.id}`, { name: 'Receitas diversas' })).status).toBe(200);
    const { id } = await lateFee();
    const recreated = await firstCategory(c, 'income', LATE_FEE_CATEGORY.income.name);
    expect(recreated.id).not.toBe(financial.id);
    expect(recreated.subcategories.map((s) => s.name)).toEqual([LATE_FEE_CATEGORY.income.lateFee]);
    expect((await linkedOf(c, id)).every((r) => r.categoryId === recreated.id)).toBe(true);
  });

  it('late fees still count for the client: delinquency and the client history read them by link, not category', async () => {
    const { id, client } = await lateFee();
    const row = ((await c.get('/reports/delinquency')).body.clients as any[]).find((r) => r.contactId === client);
    expect(row).toMatchObject({ lateCount: 1 });
    expect((await c.get(`/transactions/${id}`)).body.lateFees).toEqual({ interest: 533, fine: 1_600 });
    const history = (await c.get(`/transactions?contactId=${client}&type=income&pageSize=100`)).body.items as any[];
    expect(history.filter((t) => t.lateFeeOf === id)).toHaveLength(2);
  });

  it('migration 0021 reclassifies the rows saved with the original category, creating what is missing; re-runnable', async () => {
    const { id, services, fees } = await lateFee();
    const ws = await workspaceOf(c);
    const financial = await firstCategory(c, 'income', LATE_FEE_CATEGORY.income.name);
    // As before 0021: the fee rows in the fee's category, and the office renamed "Receitas financeiras".
    await admin().execute(sql`update transactions set category_id = ${services.id}, subcategory_id = ${fees.id} where late_fee_of = ${id}`);
    await admin().execute(sql`update categories set name = 'Antigas receitas' where id = ${financial.id}`);
    // Another office without late fees gets nothing new.
    const bruno = await registerUser(app, 'Bruno Outro');
    const brunoCategories = async () =>
      (await executeRows<{ n: number }>(admin(), sql`select count(*)::int as n from categories where workspace_id = ${await workspaceOf(bruno)}`))[0]!.n;
    const before = await brunoCategories();

    await runMigration0021();
    const recreated = await firstCategory(c, 'income', LATE_FEE_CATEGORY.income.name);
    expect(recreated.id).not.toBe(financial.id);
    const sub = recreated.subcategories.find((s) => s.name === LATE_FEE_CATEGORY.income.lateFee)!;
    expect(await linkedOf(c, id)).toEqual([
      { kind: 'fine', categoryId: recreated.id, subcategoryId: sub.id },
      { kind: 'interest', categoryId: recreated.id, subcategoryId: sub.id },
    ]);

    // Running again changes nothing (no twin categories, rows already in place).
    const categoriesOf = async () =>
      (await executeRows<{ n: number }>(admin(), sql`select count(*)::int as n from categories where workspace_id = ${ws}`))[0]!.n;
    const afterFirst = await categoriesOf();
    await runMigration0021();
    expect(await categoriesOf()).toBe(afterFirst);
    expect((await firstCategory(c, 'income', LATE_FEE_CATEGORY.income.name)).id).toBe(recreated.id);
    expect(await brunoCategories()).toBe(before);
  });
});
