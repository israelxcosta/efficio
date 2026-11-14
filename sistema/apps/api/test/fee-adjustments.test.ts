// Yearly fee adjustment in batch (reajuste em lote, contract clause 3): the preview of a month, applying
// it (one transaction; skips with reasons), the batches and the letters, the workspace isolation and a
// scope check of every statement. Plus the e-CAC power of attorney document. Today: 2026-10-20.

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyFeeAdjustmentSchema, feeAdjustmentListQuerySchema, feeAdjustmentPreviewQuerySchema } from '@effinance/shared';
import type { App } from '../src/app';
import * as schema from '../src/db/schema';
import { getCipher } from '../src/lib/crypto/keyring';
import { executeRows } from '../src/lib/sql';
import * as service from '../src/modules/fee-adjustments/service';
import { ADMIN_URL } from './db-roles';
import { admin, createTestApp, registerUser, resetDb, type Client } from './helpers';
import { createClient, member, workspaceOf } from './task-helpers';

let app: App;
let traced: ReturnType<typeof drizzle<typeof schema>>;
let tracedClient: ReturnType<typeof postgres>;
const statements: { sql: string; params: unknown[] }[] = [];

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

async function withFees(owner: Client, client: string, fees: { amount: number; employeeFee?: number; discountBps?: number }[]) {
  for (const fee of fees) expect((await owner.post(`/clients/${client}/fees`, fee)).status).toBe(201);
  return client;
}

/**
 * Renewing in December 2026: Padaria (3rd year, 5% discount), Tecnova (2nd year, no employee fee),
 * Sem Vigência (periods missing), Já Reajustada (period of December registered by hand). Not listed:
 * Nova (starts in December), Novembro (renews in November, notice already late), Inativa.
 */
async function office(owner: Client) {
  const padaria = await withFees(owner, await createClient(owner, { tradeName: 'Padaria Pão Dourado', contractStartDate: '2024-12-10' }), [
    { amount: 80_000, employeeFee: 3_000, discountBps: 500 },
    { amount: 85_000, employeeFee: 3_500, discountBps: 500 },
  ]);
  const tecnova = await withFees(owner, await createClient(owner, { tradeName: 'Tecnova', contractStartDate: '2025-12-01' }), [{ amount: 120_000 }]);
  const missing = await withFees(owner, await createClient(owner, { tradeName: 'Sem Vigência', contractStartDate: '2023-12-05' }), [{ amount: 50_000 }]);
  const done = await withFees(owner, await createClient(owner, { tradeName: 'Já Reajustada', contractStartDate: '2025-12-15' }), [
    { amount: 60_000 },
    { amount: 63_000 },
  ]);
  const fresh = await withFees(owner, await createClient(owner, { tradeName: 'Nova', contractStartDate: '2026-12-02' }), [{ amount: 40_000 }]);
  const november = await withFees(owner, await createClient(owner, { tradeName: 'Novembro', contractStartDate: '2025-11-05' }), [{ amount: 50_000, employeeFee: 2_000 }]);
  const inactive = await withFees(owner, await createClient(owner, { tradeName: 'Inativa', contractStartDate: '2024-12-01' }), [{ amount: 70_000 }, { amount: 72_000 }]);
  expect((await owner.post(`/clients/${inactive}/inactivate`, { date: '2026-10-01', reason: 'contract_end' })).status).toBe(200);
  return { padaria, tecnova, missing, done, fresh, november, inactive };
}

const INDICES = { igpmBps: -103, ipcaBps: 468, inpcBps: 450, cctBps: 550 };
const query = (params: Record<string, string | number | boolean>) =>
  `/fee-adjustments/preview?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;

describe('B5: yearly fee adjustment in batch', () => {
  it('previews a month: who renews, the values in force and adjusted, the notice deadline and the marks', async () => {
    const owner = await registerUser(app, 'Ana Titular');
    const o = await office(owner);

    const res = await owner.get(query({ month: '2026-12', ...INDICES }));
    expect(res.status).toBe(200);
    const p = res.body;
    expect(p).toMatchObject({ month: '2026-12', today: '2026-10-20', suggested: { bps: 550, index: 'cct' }, appliedBps: 550, adjustEmployeeFee: true });
    expect(p.items.map((i: any) => [i.name, i.status])).toEqual([
      ['Já Reajustada', 'already_adjusted'],
      ['Padaria Pão Dourado', 'ready'],
      ['Sem Vigência', 'no_previous_fee'],
      ['Tecnova', 'ready'],
    ]);
    const padaria = p.items.find((i: any) => i.clientId === o.padaria);
    expect(padaria).toMatchObject({
      period: { index: 2, startDate: '2026-12-10', endDate: '2027-12-09' },
      noticeDeadline: '2026-11-10',
      noticeLate: false,
      current: { amount: 85_000, employeeFee: 3_500, discountBps: 500 },
      // 85.000 × 1,055 = 89.675; 3.500 × 1,055 = 3.692,5 → 3.693 (half up).
      proposed: { amount: 89_675, employeeFee: 3_693 },
      registered: null,
    });
    expect(p.items.find((i: any) => i.clientId === o.done).registered).toMatchObject({ amount: 63_000, adjustmentId: null });
    expect(p.items.find((i: any) => i.clientId === o.missing)).toMatchObject({ period: { index: 3 }, current: null, proposed: null });
    expect(p.totals).toEqual({
      clients: 4,
      ready: 2,
      alreadyAdjusted: 1,
      noPreviousFee: 1,
      noticeLate: 0,
      currentMonthly: 85_000 + 120_000,
      proposedMonthly: 89_675 + 126_600,
    });

    // Percentage typed by hand, employee fee kept; no indices: 0%. November's notice is already late.
    const manual = (await owner.get(query({ month: '2026-12', appliedBps: 400, adjustEmployeeFee: false }))).body;
    expect(manual).toMatchObject({ suggested: { bps: 0, index: null }, appliedBps: 400 });
    expect(manual.items.find((i: any) => i.clientId === o.padaria).proposed).toEqual({ amount: 88_400, employeeFee: 3_500 });
    const november = (await owner.get(query({ month: '2026-11' }))).body;
    expect(november.items.map((i: any) => [i.name, i.noticeDeadline, i.noticeLate, i.proposed])).toEqual([
      ['Novembro', '2026-10-06', true, { amount: 50_000, employeeFee: 2_000 }],
    ]);
    expect(november.totals.noticeLate).toBe(1);

    expect((await owner.get('/fee-adjustments/preview?month=2026-13')).status).toBe(400);
    expect((await owner.get(query({ month: '2026-12', appliedBps: -50 }))).body.message).toBe(
      'O reajuste não pode ser negativo: o contrato só reajusta para cima',
    );
  });

  it('applies the batch in one go: new periods, skips with reasons, the batch recorded and audited', async () => {
    const owner = await registerUser(app, 'Ana Titular');
    const o = await office(owner);
    const stranger = await registerUser(app, 'Bruno Outro');
    const foreign = await createClient(stranger, { tradeName: 'Cliente do Bruno', contractStartDate: '2024-12-10' });
    const unknown = randomUUID();

    const res = await owner.post('/fee-adjustments', {
      month: '2026-12',
      ...INDICES,
      clientIds: [o.padaria, o.tecnova, o.missing, o.done, o.inactive, o.november, o.padaria, foreign, unknown],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { adjustment, created, skipped } = res.body;
    expect(adjustment).toMatchObject({
      month: '2026-12',
      indices: INDICES,
      appliedBps: 550,
      chosenIndex: 'cct',
      adjustEmployeeFee: true,
      clientCount: 2,
      appliedBy: { id: owner.userId, name: 'Ana Titular' },
    });
    expect(created.map((c: any) => [c.name, c.period.index, c.previous, c.adjusted, c.discountBps])).toEqual([
      ['Padaria Pão Dourado', 2, { amount: 85_000, employeeFee: 3_500 }, { amount: 89_675, employeeFee: 3_693 }, 500],
      ['Tecnova', 1, { amount: 120_000, employeeFee: 0 }, { amount: 126_600, employeeFee: 0 }, 0],
    ]);
    expect(skipped.map((s: any) => [s.clientId, s.reason]).sort()).toEqual(
      [
        [o.missing, 'no_previous_fee'],
        [o.done, 'already_adjusted'],
        [o.inactive, 'inactive'],
        [o.november, 'not_due'],
        [foreign, 'not_found'],
        [unknown, 'not_found'],
      ].sort(),
    );
    expect(skipped.find((s: any) => s.clientId === foreign).name).toBeNull();

    // The new period is the client's latest one; the discount kept.
    const fees = (await owner.get(`/clients/${o.padaria}/fees`)).body;
    expect(fees.items[0]).toMatchObject({ index: 2, startDate: '2026-12-10', amount: 89_675, employeeFee: 3_693, discountBps: 500 });
    // The other office is untouched.
    expect((await stranger.get(`/clients/${foreign}/fees`)).body.items).toHaveLength(0);

    const [audit] = await executeRows<{ metadata: Record<string, unknown> }>(
      admin(),
      sql`select metadata from audit_logs where action = 'fee_adjustment.applied' and entity_id = ${adjustment.id}`,
    );
    expect(audit!.metadata).toEqual({ month: '2026-12', appliedBps: 550, chosenIndex: 'cct', adjustEmployeeFee: true, clients: 2, skipped: 6 });

    // Applying again registers nothing (200, no batch); the preview now points at the batch.
    const again = await owner.post('/fee-adjustments', { month: '2026-12', ...INDICES, clientIds: [o.padaria, o.tecnova] });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ adjustment: null, created: [] });
    expect(again.body.skipped.map((s: any) => s.reason)).toEqual(['already_adjusted', 'already_adjusted']);
    const preview = (await owner.get(query({ month: '2026-12' }))).body;
    expect(preview.items.find((i: any) => i.clientId === o.tecnova).registered).toMatchObject({ amount: 126_600, adjustmentId: adjustment.id });

    // A negotiated percentage (typed by hand) has no chosen index; 0% keeps the values.
    const zero = await owner.post('/fee-adjustments', { month: '2026-11', appliedBps: 0, adjustEmployeeFee: false, clientIds: [o.november] });
    expect(zero.status).toBe(201);
    expect(zero.body.adjustment).toMatchObject({ appliedBps: 0, chosenIndex: null, adjustEmployeeFee: false });
    expect(zero.body.created[0].adjusted).toEqual({ amount: 50_000, employeeFee: 2_000 });
    expect((await owner.post('/fee-adjustments', { month: '2026-12', appliedBps: -1, clientIds: [o.padaria] })).status).toBe(400);
    expect((await owner.post('/fee-adjustments', { month: '2026-12', clientIds: [] })).status).toBe(400);
  });

  it('lists the batches and serves the letters; editing or removing a period shows up there', async () => {
    const owner = await registerUser(app, 'Ana Titular');
    const o = await office(owner);
    const { adjustment, created } = (await owner.post('/fee-adjustments', { month: '2026-12', ...INDICES, clientIds: [o.padaria, o.tecnova] })).body;

    const list = (await owner.get('/fee-adjustments')).body;
    expect(list).toMatchObject({ total: 1, page: 1, items: [{ id: adjustment.id, clientCount: 2 }] });
    expect((await owner.get('/fee-adjustments?month=2026-11')).body.total).toBe(0);

    const letters = (await owner.get(`/fee-adjustments/${adjustment.id}/letters`)).body;
    expect(letters.adjustment).toMatchObject({ id: adjustment.id, chosenIndex: 'cct', indices: INDICES });
    expect(letters.office).toMatchObject({ registered: false, legalName: null });
    expect(letters.missingOffice).toEqual(['Cadastro do escritório']);
    expect(letters.letters.map((l: any) => l.client.tradeName)).toEqual(['Padaria Pão Dourado', 'Tecnova']);
    const padaria = letters.letters[0];
    expect(padaria).toMatchObject({
      clientId: o.padaria,
      period: { index: 2, startDate: '2026-12-10', endDate: '2027-12-09' },
      noticeDeadline: '2026-11-10',
      previous: { amount: 85_000, employeeFee: 3_500 },
      adjusted: { amount: 89_675, employeeFee: 3_693 },
      discountBps: 500,
      edited: false,
    });
    // Company data decrypted for the letter (CNPJ digits).
    expect(padaria.client.document).toMatch(/^\d{14}$/);

    // A negotiated value after the batch: the letter keeps the batch's numbers and says it was edited.
    const padariaFee = created.find((c: any) => c.clientId === o.padaria).feeId;
    expect((await owner.put(`/clients/${o.padaria}/fees/${padariaFee}`, { amount: 90_000, employeeFee: 3_693, discountBps: 500 })).status).toBe(200);
    // Removing the period undoes the adjustment of that client.
    const tecnovaFee = created.find((c: any) => c.clientId === o.tecnova).feeId;
    expect((await owner.del(`/clients/${o.tecnova}/fees/${tecnovaFee}`)).status).toBe(204);
    const after = (await owner.get(`/fee-adjustments/${adjustment.id}/letters`)).body;
    expect(after.letters).toHaveLength(1);
    expect(after.letters[0]).toMatchObject({ adjusted: { amount: 89_675 }, edited: true });
    expect((await owner.get('/fee-adjustments')).body.items[0].clientCount).toBe(1);
  });

  it('isolation: another office sees no batch, letter or client of this one; a collaborator gets 403', async () => {
    const owner = await registerUser(app, 'Ana Titular');
    const o = await office(owner);
    const { adjustment } = (await owner.post('/fee-adjustments', { month: '2026-12', ...INDICES, clientIds: [o.padaria] })).body;
    const viewer = await member(app, owner, 'viewer', 'Carla Souza');

    const stranger = await registerUser(app, 'Bruno Outro');
    expect((await stranger.get('/fee-adjustments')).body.total).toBe(0);
    expect((await stranger.get(`/fee-adjustments/${adjustment.id}/letters`)).status).toBe(404);
    expect((await stranger.get(query({ month: '2026-12' }))).body.items).toEqual([]);
    const intrusion = await stranger.post('/fee-adjustments', { month: '2026-12', clientIds: [o.tecnova] });
    expect(intrusion.body).toMatchObject({ adjustment: null, skipped: [{ clientId: o.tecnova, name: null, reason: 'not_found' }] });
    expect((await owner.get(`/clients/${o.tecnova}/fees`)).body.items).toHaveLength(1);

    for (const res of [await viewer.get(query({ month: '2026-12' })), await viewer.get(`/fee-adjustments/${adjustment.id}/letters`)]) {
      expect(res.status).toBe(403);
    }
  });

  it('every statement of the service filters by the workspace (RLS bypassed)', async () => {
    const bruno = await registerUser(app, 'Bruno Outro');
    await office(bruno);
    const brunoWs = await workspaceOf(bruno);
    const snapshot = async () =>
      executeRows(
        admin(),
        sql`select (select count(*) from client_fees where workspace_id = ${brunoWs})::int as fees,
                   (select count(*) from fee_adjustments where workspace_id = ${brunoWs})::int as batches,
                   (select count(*) from fee_adjustment_items where workspace_id = ${brunoWs})::int as items`,
      );
    const before = await snapshot();

    const ana = await registerUser(app, 'Ana Titular');
    const o = await office(ana);
    const ws = await workspaceOf(ana);
    const cipher = await getCipher(ws);
    const { tracked, exportedFunctions, unscopedReferences } = await import('./scope-checker');
    const called = new Set<string>();
    const svc = tracked(service, called);
    statements.length = 0;
    const run = <T>(fn: (db: typeof traced) => Promise<T>) => traced.transaction((tx) => fn(tx as unknown as typeof traced));

    const preview = await run((db) =>
      svc.previewFeeAdjustment(db, ws, feeAdjustmentPreviewQuerySchema.parse({ month: '2026-12', cctBps: '550' }), '2026-10-20'),
    );
    expect(preview.totals.ready).toBe(2);
    const applied = await run((db) =>
      svc.applyFeeAdjustment(db, ws, applyFeeAdjustmentSchema.parse({ month: '2026-12', cctBps: 550, clientIds: [o.padaria, o.tecnova, o.done] }), {
        userId: ana.userId,
        name: 'Ana Titular',
      }),
    );
    expect(applied.created).toHaveLength(2);
    expect((await run((db) => svc.listFeeAdjustments(db, ws, feeAdjustmentListQuerySchema.parse({})))).total).toBe(1);
    expect((await run((db) => svc.feeAdjustmentLetters(db, ws, cipher, applied.adjustment!.id))).letters).toHaveLength(2);

    expect([...called].sort()).toEqual(exportedFunctions(service));
    expect(statements.length).toBeGreaterThan(8);
    const unscoped = statements.map((s) => ({ sql: s.sql, tables: unscopedReferences(s, ws) })).filter((s) => s.tables.length > 0);
    expect(unscoped).toEqual([]);
    expect(await snapshot()).toEqual(before);
  });
});

describe('B7: e-CAC electronic power of attorney', () => {
  it('is a client document with an expiry date, listed among the deadlines', async () => {
    const owner = await registerUser(app, 'Ana Titular');
    const client = await createClient(owner, { tradeName: 'Padaria Pão Dourado' });
    const current = (await owner.get(`/clients/${client}`)).body;
    const saved = await owner.put(`/clients/${client}`, {
      name: current.name,
      tradeName: current.tradeName,
      document: current.document,
      taxRegime: current.taxRegime,
      simplesAnnex: current.simplesAnnex,
      contractStartDate: current.contractStartDate,
      documents: [{ kind: 'ecac_power_of_attorney', expiresAt: '2026-11-05', note: 'Outorgada no e-CAC por 5 anos' }],
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.documents).toMatchObject([{ kind: 'ecac_power_of_attorney', name: 'Procuração eletrônica e-CAC', expiresAt: '2026-11-05' }]);
    const [row] = await executeRows<{ kind: string }>(admin(), sql`select kind from client_documents where client_id = ${client}`);
    expect(row!.kind).toBe('ecac_power_of_attorney');
  });
});
