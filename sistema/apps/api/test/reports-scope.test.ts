// Every statement of the client-base evolution, the rework and the delinquency report filters by the
// workspace (CLAUDE.md: "Toda query do backend filtra pelo espaço; o RLS é a segunda barreira"), like
// tasks-scope.test.ts: the services run on a superuser connection (no RLS to hide a missing filter) with
// a logger capturing each statement; then (1) every reference to a tenant table is tied to the request's
// workspace, (2) every exported function of the modules ran, (3) another office's rows are untouched.
// Today is pinned to 2026-10-20 (vitest.config.ts).

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { delinquencyReportQuerySchema, evolutionReportQuerySchema } from '@effinance/shared';
import type { App } from '../src/app';
import * as schema from '../src/db/schema';
import * as delinquencyModule from '../src/modules/reports/delinquency';
import * as evolutionModule from '../src/modules/reports/evolution';
import * as reworkModule from '../src/modules/reports/rework';
import { ADMIN_URL } from './db-roles';
import { admin, createAccount, createTestApp, registerUser, resetDb, type Client } from './helpers';
import { exportedFunctions, tracked, unscopedReferences, type Statement } from './scope-checker';
import { createClient, workspaceOf } from './task-helpers';

let app: App;
let traced: ReturnType<typeof drizzle<typeof schema>>;
let tracedClient: ReturnType<typeof postgres>;
const statements: Statement[] = [];

beforeAll(async () => {
  app = await createTestApp();
  tracedClient = postgres(ADMIN_URL, { max: 2, onnotice: () => {} });
  traced = drizzle(tracedClient, {
    schema,
    casing: 'snake_case',
    logger: { logQuery: (query, params) => statements.push({ sql: query, params }) },
  });
});
afterAll(async () => {
  await tracedClient.end({ timeout: 5 });
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
  statements.length = 0;
});

const TABLES = ['contacts', 'client_fees', 'transactions', 'tasks', 'task_categories', 'recurrences'];

async function snapshot(workspaceId: string): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const rows = await admin().execute<{ row: unknown }>(
      sql`select to_jsonb(t) as row from ${sql.identifier(table)} t where t.workspace_id = ${workspaceId} order by to_jsonb(t)::text`,
    );
    out[table] = [...rows].map((r) => r.row);
  }
  return out;
}

/** A client with a fee, a late receivable and a rework task (an open-ended series too). */
async function office(owner: Client, name: string) {
  const account = await createAccount(owner);
  const client = await createClient(owner, { tradeName: name, contractStartDate: '2026-03-01' });
  expect((await owner.post(`/clients/${client}/fees`, { amount: 80_000 })).status).toBe(201);
  const receivable = await owner.post('/transactions', { type: 'income', description: 'Honorários', amount: 80_000, date: '2026-09-10', accountId: account, contactId: client });
  expect((await owner.patch(`/transactions/${receivable.body[0].id}/paid`, { paid: true, paidAt: '2026-09-20', interest: 300 })).status).toBe(200);
  const fixed = await owner.post('/transactions', {
    type: 'income',
    description: 'Consultoria mensal',
    amount: 20_000,
    date: '2026-08-15',
    accountId: account,
    contactId: client,
    recurrenceKind: 'fixed',
    frequency: 'monthly',
  });
  expect(fixed.status, JSON.stringify(fixed.body)).toBe(201);
  const category = await owner.post('/tasks/categories', { name: 'Retrabalho', isRework: true });
  expect((await owner.post('/tasks', { title: 'Refazer DCTFWeb', clientId: client, categoryId: category.body.id })).status).toBe(201);
  return client;
}

describe('reports: every query filters by the workspace', () => {
  it('runs the evolution, the rework and the delinquency report with RLS bypassed', async () => {
    const bruno = await registerUser(app, 'Bruno Outro');
    await office(bruno, 'Cliente do Bruno');
    const before = await snapshot(await workspaceOf(bruno));

    const ana = await registerUser(app, 'Ana Titular');
    const ws = await workspaceOf(ana);
    const client = await office(ana, 'Padaria');

    const called = new Set<string>();
    const evolution = tracked(evolutionModule, called);
    const rework = tracked(reworkModule, called);
    const delinquency = tracked(delinquencyModule, called);
    statements.length = 0;
    const run = <T>(fn: (db: typeof traced) => Promise<T>) => traced.transaction((tx) => fn(tx as unknown as typeof traced));

    const report = await run((db) => evolution.evolutionReport(db, ws, evolutionReportQuerySchema.parse({ months: 3 })));
    expect(report.months.map((m) => m.newClients)).toEqual([0, 0, 0]);
    expect(report.months[1]).toMatchObject({ activeClients: 1, recurringFees: 80_000, billed: 100_000, received: 80_300 });
    expect((await run((db) => rework.clientRework(db, ws, client))).rework).toMatchObject({ last90Days: 1, last12Months: 1 });
    expect((await run((db) => rework.reworkByClient(db, ws, '2026-10-20'))).get(client)).toMatchObject({ last90Days: 1 });
    expect(rework.noRework()).toEqual({ last90Days: 0, last12Months: 0, latest: [] });
    const row = (await run((db) => delinquency.delinquencyReport(db, ws, delinquencyReportQuerySchema.parse({})))).clients[0];
    expect(row).toMatchObject({ contactId: client, reworkPenalty: 4 });

    // 2. Every service entry point ran.
    expect([...called].sort()).toEqual(exportedFunctions(evolutionModule, reworkModule, delinquencyModule));

    // 1. Every statement is scoped to A.
    expect(statements.length).toBeGreaterThan(8);
    const unscoped = statements.map((s) => ({ sql: s.sql, tables: unscopedReferences(s, ws) })).filter((s) => s.tables.length > 0);
    expect(unscoped).toEqual([]);

    // 3. B is exactly as it was (the series materialization only touched A).
    expect(await snapshot(await workspaceOf(bruno))).toEqual(before);
  });
});
