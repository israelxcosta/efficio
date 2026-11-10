// Rework (retrabalho): task categories flagged `isRework` (migration 0020, edited with `registry`), the
// rework of a client (GET /reports/clients/:id/rework) and its weight in the delinquency report's score
// (shared `clientScore`: 40 points per rework in 90 days, 10 per older one in 12 months, up to 200).
// Today is pinned to 2026-10-20 (vitest.config.ts): the windows start on 2026-07-23 and 2025-10-21.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { riskOf } from '@effinance/shared';
import type { App } from '../src/app';
import { executeRows } from '../src/lib/sql';
import { withTenant } from '../src/lib/tenant';
import { clientRework } from '../src/modules/reports/rework';
import { admin, createAccount, createTestApp, registerUser, resetDb, type Client } from './helpers';
import { createClient, member } from './task-helpers';

let app: App;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
});

async function category(as: Client, name: string, isRework?: boolean): Promise<string> {
  const res = await as.post('/tasks/categories', { name, ...(isRework === undefined ? {} : { isRework }) });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id;
}

/** A task opened at `openedAt` (wall clock in São Paulo), written back through the admin connection. */
async function task(
  as: Client,
  input: { title: string; clientId?: string | null; categoryId?: string; status?: string; recurrence?: unknown; dueDate?: string },
  openedAt: string,
): Promise<string> {
  const res = await as.post('/tasks', input);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  await admin().execute(sql`update tasks set created_at = (${openedAt}::timestamp at time zone 'America/Sao_Paulo') where id = ${res.body.id}`);
  return res.body.id;
}

describe('rework categories', () => {
  it('are flagged on creation, keep the flag on an edit without it and need `registry`', async () => {
    const owner = await registerUser(app, 'Dona do Escritório');
    const viewer = await member(app, owner, 'viewer', 'Colaboradora');
    const plain = await category(owner, 'Obrigações acessórias');
    const rework = await category(owner, 'Retrabalho', true);

    const list = (await owner.get('/tasks/categories')).body;
    expect(list.map((c: any) => [c.name, c.isRework])).toEqual([
      ['Obrigações acessórias', false],
      ['Retrabalho', true],
    ]);
    // Forms of earlier versions send no flag: the stored value stays.
    const renamed = await owner.put(`/tasks/categories/${rework}`, { name: 'Correção/retrabalho', icon: 'wrench', color: '#B91C1C' });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: 'Correção/retrabalho', isRework: true });
    expect((await owner.put(`/tasks/categories/${rework}`, { name: 'Correção/retrabalho', isRework: false })).body.isRework).toBe(false);
    expect((await owner.put(`/tasks/categories/${plain}`, { name: 'Obrigações acessórias', isRework: true })).body.isRework).toBe(true);

    // A collaborator reads the categories but cannot flag one (registry).
    expect((await viewer.get('/tasks/categories')).status).toBe(200);
    expect((await viewer.post('/tasks/categories', { name: 'Refação', isRework: true })).status).toBe(403);
    expect((await viewer.put(`/tasks/categories/${plain}`, { name: 'Obrigações acessórias', isRework: false })).status).toBe(403);
  });
});

async function runMigration(name: string) {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), `../drizzle/${name}`);
  const source = await readFile(file, 'utf8');
  await admin().transaction(async (tx) => {
    for (const statement of source.split('--> statement-breakpoint')) if (statement.trim()) await tx.execute(sql.raw(statement));
  });
}

describe('migration 0020', () => {
  it('adds a non-null flag, false by default, and runs again without touching the flags', async () => {
    const owner = await registerUser(app, 'Dona do Escritório');
    await category(owner, 'Retrabalho', true);
    await category(owner, 'Certidões');
    await runMigration('0020_task_category_rework.sql');
    await runMigration('0020_task_category_rework.sql');
    const [column] = await executeRows<{ column_default: string; is_nullable: string; data_type: string }>(
      admin(),
      sql`select column_default, is_nullable, data_type from information_schema.columns where table_name = 'task_categories' and column_name = 'is_rework'`,
    );
    expect(column).toEqual({ column_default: 'false', is_nullable: 'NO', data_type: 'boolean' });
    expect((await owner.get('/tasks/categories')).body.map((c: any) => [c.name, c.isRework])).toEqual([
      ['Certidões', false],
      ['Retrabalho', true],
    ]);
  });
});

describe('rework of a client', () => {
  async function scenario() {
    const owner = await registerUser(app, 'Dona do Escritório');
    const x = await createClient(owner, { tradeName: 'Padaria X' });
    const y = await createClient(owner, { tradeName: 'Oficina Y' });
    const rework = await category(owner, 'Retrabalho', true);
    const plain = await category(owner, 'Obrigações acessórias');
    const ids = {
      r1: await task(owner, { title: 'Refazer DCTFWeb de setembro', clientId: x, categoryId: rework }, '2026-10-01 12:00'),
      // First and last minutes of the São Paulo day (the UTC day differs).
      r2: await task(owner, { title: 'Corrigir guia do DAS', clientId: x, categoryId: rework, status: 'done' }, '2026-07-23 00:30'),
      r3: await task(owner, { title: 'Retificar EFD-Reinf', clientId: x, categoryId: rework }, '2026-07-22 23:30'),
      r4: await task(owner, { title: 'Reemitir folha de agosto', clientId: x, categoryId: rework }, '2025-10-21 00:10'),
    };
    // Out of X's count: older than 12 months, canceled, another category, another client, internal.
    await task(owner, { title: 'Refazer balancete antigo', clientId: x, categoryId: rework }, '2025-10-20 23:50');
    await task(owner, { title: 'Aberta por engano', clientId: x, categoryId: rework, status: 'canceled' }, '2026-10-02 09:00');
    await task(owner, { title: 'Apuração do ICMS', clientId: x, categoryId: plain }, '2026-10-03 09:00');
    await task(owner, { title: 'Revisar processo interno', clientId: null, categoryId: rework }, '2026-10-04 09:00');
    // A recurring rework makes no sense as an incident: occurrences never count (the task is the first one).
    await task(owner, { title: 'Conferência mensal', clientId: x, categoryId: rework, dueDate: '2026-10-25', recurrence: { frequency: 'monthly' } }, '2026-10-05 09:00');
    for (let i = 1; i <= 6; i++) {
      await task(owner, { title: `Correção ${i}`, clientId: y, categoryId: rework }, `2026-10-${String(10 + i).padStart(2, '0')} 08:00`);
    }
    return { owner, x, y, rework, ids };
  }

  it('counts the 90 days and the 12 months by the day the task was opened and lists the latest', async () => {
    const { owner, x, y, rework, ids } = await scenario();
    const res = await owner.get(`/reports/clients/${x}/rework`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      contactId: x,
      today: '2026-10-20',
      windows: { recentFrom: '2026-07-23', yearFrom: '2025-10-21' },
      penalty: 100,
      rework: {
        last90Days: 2,
        last12Months: 4,
        latest: [
          { id: ids.r1, title: 'Refazer DCTFWeb de setembro', date: '2026-10-01', status: 'todo', dueDate: null, category: expect.objectContaining({ id: rework, name: 'Retrabalho' }) },
          expect.objectContaining({ id: ids.r2, date: '2026-07-23', status: 'done' }),
          expect.objectContaining({ id: ids.r3, date: '2026-07-22' }),
          expect.objectContaining({ id: ids.r4, date: '2025-10-21' }),
        ],
      },
    });
    // Six in 90 days: the penalty stops at 200 and the list at 5, newest first.
    const other = (await owner.get(`/reports/clients/${y}/rework`)).body;
    expect(other).toMatchObject({ penalty: 200, rework: { last90Days: 6, last12Months: 6 } });
    expect(other.rework.latest.map((t: any) => t.title)).toEqual(['Correção 6', 'Correção 5', 'Correção 4', 'Correção 3', 'Correção 2']);

    // Unflagging the category takes the rework away.
    await owner.put(`/tasks/categories/${rework}`, { name: 'Retrabalho', isRework: false });
    expect((await owner.get(`/reports/clients/${x}/rework`)).body).toMatchObject({ penalty: 0, rework: { last90Days: 0, last12Months: 0, latest: [] } });
  });

  it('is finance only and never crosses workspaces', async () => {
    const { owner, x } = await scenario();
    const viewer = await member(app, owner, 'viewer', 'Colaboradora');
    expect((await viewer.get(`/reports/clients/${x}/rework`)).status).toBe(403);
    const stranger = await registerUser(app, 'Outro Escritório');
    expect((await stranger.get(`/reports/clients/${x}/rework`)).status).toBe(404);
    const supplier = (await owner.post('/contacts', { name: 'Papelaria Central' })).body.id;
    expect((await owner.get(`/reports/clients/${supplier}/rework`)).status).toBe(404);
    expect((await owner.get('/reports/clients/nao-e-um-id/rework')).status).toBe(400);
    // Another office's rework in the same names does not leak into this one.
    const strangerClient = await createClient(stranger, { tradeName: 'Padaria X' });
    const strangerRework = await category(stranger, 'Retrabalho', true);
    await task(stranger, { title: 'Refazer tudo', clientId: strangerClient, categoryId: strangerRework }, '2026-10-19 10:00');
    expect((await owner.get(`/reports/clients/${x}/rework`)).body.rework.last90Days).toBe(2);
    expect((await stranger.get(`/reports/clients/${strangerClient}/rework`)).body.rework).toMatchObject({ last90Days: 1, last12Months: 1 });
  });

  it('takes the penalty from the delinquency score, with the risk band of the final score', async () => {
    const { owner, x, y } = await scenario();
    const account = await createAccount(owner);
    const clean = await createClient(owner, { tradeName: 'Sem retrabalho' });
    for (const contactId of [x, y, clean]) {
      const res = await owner.post('/transactions', { type: 'income', description: 'Honorários', amount: 50_000, date: '2026-10-10', accountId: account, contactId });
      expect(res.status).toBe(201);
      expect((await owner.patch(`/transactions/${res.body[0].id}/paid`, { paid: true, paidAt: '2026-10-10' })).status).toBe(200);
    }
    const report = (await owner.get('/reports/delinquency?months=3')).body;
    const row = (id: string) => report.clients.find((c: any) => c.contactId === id);
    // Same payment history: same payment score; the rework makes the difference.
    expect(row(x).paymentScore).toBe(row(clean).paymentScore);
    expect(row(x)).toMatchObject({
      reworkPenalty: 100,
      score: row(x).paymentScore - 100,
      risk: riskOf(row(x).paymentScore - 100),
      rework: { last90Days: 2, last12Months: 4 },
    });
    expect(row(x).rework.latest).toHaveLength(4);
    expect(row(y)).toMatchObject({ reworkPenalty: 200, score: row(y).paymentScore - 200, rework: { last90Days: 6 } });
    expect(row(y).rework.latest).toHaveLength(5);
    expect(row(clean)).toMatchObject({ reworkPenalty: 0, score: row(clean).paymentScore, rework: { last90Days: 0, last12Months: 0, latest: [] } });
    // One paid receivable, on time: punctuality 1000 × (1 − 1/6) = 833; X loses 100 (a band below).
    expect(row(clean)).toMatchObject({ score: 833, risk: 'baixo' });
    expect(row(x)).toMatchObject({ score: 733, risk: 'moderado' });
    // The summary counts the 90 days over the clients of the report.
    expect(report.summary).toMatchObject({ reworkCount: 8, reworkClients: 2 });
  });

  it('hides the titles from a member who cannot read tasks (the count and the category stay)', async () => {
    const { owner, x } = await scenario();
    const ws = (await owner.get('/auth/me')).body.workspace.id as string;
    const hidden = await withTenant(app.db, ws, (db) => clientRework(db, ws, x, false));
    expect(hidden.rework).toMatchObject({ last90Days: 2, last12Months: 4 });
    expect(hidden.rework.latest.map((t) => t.title)).toEqual([null, null, null, null]);
    expect(hidden.rework.latest[0]!.category.name).toBe('Retrabalho');
    const shown = await withTenant(app.db, ws, (db) => clientRework(db, ws, x, true));
    expect(shown.rework.latest[0]!.title).toBe('Refazer DCTFWeb de setembro');
  });
});
