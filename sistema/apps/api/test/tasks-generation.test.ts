// Generation marker (review risk "leitura cara"): `ensureOccurrences` records, per recurring task and
// competence, that the occurrences were generated with the current state of the registry and the
// clients; the next reads skip the work (no client list, no existing-rows scan, no inserts). Editing a
// recurring task, a client's regime/contract/status or creating a client invalidates it (database
// triggers bump the workspace's generation version), so a new client of the regime joins on its own.
// Today is pinned to 2026-10-20.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { executeRows } from '../src/lib/sql';
import { admin, createTestApp, resetDb } from './helpers';
import { cnpj, createClient, office, workspaceOf } from './task-helpers';

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

const rows = <T>(query: ReturnType<typeof sql>) => executeRows<T>(admin(), query);
const occurrences = (ws: string, recurringId: string) =>
  rows<{ client_id: string; competence: string }>(sql`
    select client_id, competence from tasks where workspace_id = ${ws} and recurring_task_id = ${recurringId} order by competence, client_id`);

/** Removes an untouched occurrence behind the API's back (to see whether a read brings it back). */
async function dropOccurrence(ws: string, recurringId: string, clientId: string, competence: string) {
  await admin().execute(sql`
    delete from tasks where workspace_id = ${ws} and recurring_task_id = ${recurringId} and client_id = ${clientId} and competence = ${competence}`);
}

describe('generation marker', () => {
  it('reads do not regenerate the window once marked; editing the client or the recurring task invalidates it', async () => {
    const { ana, carla, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    const padaria = await createClient(ana, { tradeName: 'Padaria' });
    const created = await ana.post('/tasks/recurring', { name: 'DAS', departmentId: fiscal, dueDay: 20, regimes: ['simples_nacional'] });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    await carla.get('/tasks/home');
    // Window −2…+2 from the start competence (October): October to December.
    expect((await occurrences(ws, id)).map((o) => o.competence)).toEqual(['2026-10', '2026-11', '2026-12']);
    const marks = await rows<{ competence: string }>(sql`
      select competence from task_generation_marks where workspace_id = ${ws} and recurring_task_id = ${id} order by competence`);
    // Only where the recurring task is active (it starts in October).
    expect(marks.map((m) => m.competence)).toEqual(['2026-10', '2026-11', '2026-12']);

    // A marked competence is not looked at again by the reads.
    await dropOccurrence(ws, id, padaria, '2026-11');
    await carla.get('/tasks/home');
    await carla.get('/tasks');
    await carla.get('/tasks/audit?competence=2026-11');
    expect((await occurrences(ws, id)).map((o) => o.competence)).toEqual(['2026-10', '2026-12']);

    // A change that does not affect the generation (the trade name) keeps the marks.
    const client = (await ana.get(`/clients/${padaria}`)).body;
    const input = {
      name: client.name,
      tradeName: 'Padaria Nova',
      document: client.document,
      taxRegime: client.taxRegime,
      simplesAnnex: client.simplesAnnex,
      contractStartDate: client.contractStartDate,
    };
    expect((await ana.put(`/clients/${padaria}`, input)).status).toBe(200);
    await carla.get('/tasks/home');
    expect(await occurrences(ws, id)).toHaveLength(2);

    // The contract start (a generation field) invalidates: the next read fills the gap.
    expect((await ana.put(`/clients/${padaria}`, { ...input, contractStartDate: '2025-02-01' })).status).toBe(200);
    await carla.get('/tasks/home');
    expect((await occurrences(ws, id)).map((o) => o.competence)).toEqual(['2026-10', '2026-11', '2026-12']);

    // Editing the recurring task invalidates too.
    await dropOccurrence(ws, id, padaria, '2026-12');
    await carla.get('/tasks/home');
    expect(await occurrences(ws, id)).toHaveLength(2);
    expect((await ana.put(`/tasks/recurring/${id}`, { name: 'DAS mensal', departmentId: fiscal, dueDay: 20, regimes: ['simples_nacional'] })).status).toBe(200);
    expect(await occurrences(ws, id)).toHaveLength(3);
  });

  it('a new client of the regime joins the recurring tasks of its regime on the next read', async () => {
    const { ana, carla, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    await createClient(ana, { tradeName: 'Padaria' });
    const created = await ana.post('/tasks/recurring', { name: 'DAS', departmentId: fiscal, dueDay: 20, regimes: ['simples_nacional'] });
    const id = created.body.id as string;
    await carla.get('/tasks/home');
    expect(await occurrences(ws, id)).toHaveLength(3);

    const nova = await ana.post('/clients', {
      name: 'Clínica Nova Ltda',
      tradeName: 'Clínica Nova',
      document: cnpj(55_000_001),
      taxRegime: 'simples_nacional',
      simplesAnnex: 'III',
      contractStartDate: '2026-09-01',
    });
    expect(nova.status).toBe(201);
    const presumed = await createClient(ana, { tradeName: 'Construtora', taxRegime: 'presumed_profit' });
    await carla.get('/tasks/home');
    const after = await occurrences(ws, id);
    expect(after.filter((o) => o.client_id === nova.body.id).map((o) => o.competence)).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(after.some((o) => o.client_id === presumed)).toBe(false);

    // Changing a client's regime into Simples also brings it in.
    const client = (await ana.get(`/clients/${presumed}`)).body;
    const moved = await ana.put(`/clients/${presumed}`, {
      name: client.name,
      tradeName: client.tradeName,
      document: client.document,
      taxRegime: 'simples_nacional',
      simplesAnnex: 'I',
      contractStartDate: client.contractStartDate,
    });
    expect(moved.status).toBe(200);
    await carla.get('/tasks/home');
    expect((await occurrences(ws, id)).filter((o) => o.client_id === presumed)).toHaveLength(3);
  });
});
