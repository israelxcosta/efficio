// Unions (sindicatos) and collective agreements (spec §13.7, §18.12): registry with a unique CNPJ, the
// cycles saved in their own request (saving the registry never erases them), the tracked cycle and its
// band computed by the server, the clients linked (N:N), the alerts and the search, the permissions
// (every member reads; `registry` writes; `deleteRegistry` deletes) and other workspaces' ids.
// Today is pinned to 2026-10-20 (vitest.config.ts).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { TASK_ADMIN_MESSAGE } from '../src/modules/tasks/access';
import { createTestApp, registerUser, resetDb } from './helpers';
import { cnpj, createClient, office } from './task-helpers';

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

const union = (overrides: Record<string, unknown> = {}) => ({
  name: 'Sindicato dos Comerciários de Mogi Guaçu',
  document: cnpj(30_100_001),
  acronym: 'SINDCOM',
  category: 'Comerciários',
  territory: 'Mogi Guaçu e região',
  baseMonth: 11,
  responsibleName: 'José Presidente',
  responsibleEmail: 'jose@sindcom.org.br',
  notes: 'Reajuste costuma sair em dezembro',
  ...overrides,
});

describe('unions: registry and agreement cycles', () => {
  it('creates with linked clients, computes the tracked cycle and never erases cycles on save', async () => {
    const { ana, carla } = await office(app);
    const padaria = await createClient(ana, { tradeName: 'Padaria' });
    const mercado = await createClient(ana, { tradeName: 'Mercado' });

    const created = await ana.post('/unions', union({ clientIds: [padaria, mercado, padaria] }));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({
      name: 'Sindicato dos Comerciários de Mogi Guaçu',
      acronym: 'SINDCOM',
      baseMonth: 11,
      active: true,
      tracked: { year: 2026, label: '2026/2027', dueDate: '2026-11-01', bucket: 'within30', days: 12 },
      situation: 'within30',
      clientCount: 2,
      activeClientCount: 2,
      responsibleName: 'José Presidente',
      conventions: [],
    });
    expect(created.body.clients.map((c: { name: string }) => c.name)).toEqual(['Mercado', 'Padaria']);
    const id = created.body.id as string;

    // Duplicate CNPJ in the workspace → 409 with the message of the form.
    const duplicate = await ana.post('/unions', union({ name: 'Outro' }));
    expect(duplicate).toMatchObject({ status: 409, body: { message: 'Já existe um sindicato com este CNPJ.' } });

    // Mark 2026/2027 as published: tracking moves to 2027 (who and when recorded by the server).
    const marked = await ana.patch(`/unions/${id}/conventions/2026`, { published: true });
    expect(marked.status).toBe(200);
    expect(marked.body.tracked).toMatchObject({ year: 2027, dueDate: '2027-11-01', bucket: 'later' });
    expect(marked.body.conventions).toEqual([
      expect.objectContaining({ year: 2026, label: '2026/2027', published: true, publishedBy: { id: ana.userId, name: 'Ana Paula Ribeiro' } }),
    ]);
    const publishedAt = marked.body.conventions[0].publishedAt;
    expect(publishedAt).toEqual(expect.any(String));

    // Saving the registry (without cycles, which the schema does not even accept) keeps them.
    const saved = await ana.put(`/unions/${id}`, union({ name: 'SINDCOM Mogi', cycles: [] }));
    expect(saved.status).toBe(200);
    expect(saved.body.conventions).toHaveLength(1);
    expect(saved.body.clientCount).toBe(2);
    expect(saved.body.active).toBe(true);

    // The cycles request is substitutive; a cycle still published keeps who/when.
    const cycles = await ana.put(`/unions/${id}/conventions`, {
      cycles: [
        { year: 2025, published: true, note: 'Publicada em dezembro' },
        { year: 2026, published: true },
        { year: 2027, published: false },
      ],
    });
    expect(cycles.status).toBe(200);
    expect(cycles.body.conventions.map((c: { year: number; published: boolean }) => [c.year, c.published])).toEqual([
      [2025, true],
      [2026, true],
      [2027, false],
    ]);
    expect(cycles.body.conventions[1].publishedAt).toBe(publishedAt);
    expect(cycles.body.conventions[0].note).toBe('Publicada em dezembro');
    const unmarked = await ana.put(`/unions/${id}/conventions`, { cycles: [{ year: 2026, published: false }] });
    expect(unmarked.body.conventions).toEqual([expect.objectContaining({ year: 2026, published: false, publishedAt: null, publishedBy: null })]);
    expect(unmarked.body.tracked.bucket).toBe('within30');

    // Links: absent keeps, a list replaces; the collaborator reads everything.
    expect((await ana.put(`/unions/${id}`, union({ clientIds: [mercado] }))).body.clientCount).toBe(1);
    const seen = await carla.get(`/unions/${id}`);
    expect(seen.status).toBe(200);
    expect(seen.body.clients.map((c: { id: string }) => c.id)).toEqual([mercado]);
    // The client's sheet shows its unions with the tracked cycle.
    const client = await carla.get(`/clients/${mercado}`);
    expect(client.body.unions).toEqual([
      { id, name: 'SINDCOM', category: 'Comerciários', active: true, tracked: expect.objectContaining({ year: 2026, bucket: 'within30' }) },
    ]);
  });

  it('lists in urgency order with the summary; inactive and unions without clients leave the alerts', async () => {
    const { ana, carla } = await office(app);
    const padaria = await createClient(ana, { tradeName: 'Padaria' });
    const overdue = await ana.post('/unions', union({ document: cnpj(30_100_011), acronym: 'SINDMETAL', category: 'Metalúrgicos', baseMonth: 3, clientIds: [padaria] }));
    const soon = await ana.post('/unions', union({ document: cnpj(30_100_021), acronym: 'SINDCOM', baseMonth: 11, clientIds: [padaria] }));
    const watch = await ana.post('/unions', union({ document: cnpj(30_100_031), acronym: 'SINDTRANS', baseMonth: 12, clientIds: [] }));
    const none = await ana.post('/unions', union({ document: cnpj(30_100_041), acronym: 'SEMDATA', baseMonth: null }));
    const inactive = await ana.post('/unions', union({ document: cnpj(30_100_051), acronym: 'ANTIGO', baseMonth: 1, active: false }));
    for (const r of [overdue, soon, watch, none, inactive]) expect(r.status).toBe(201);

    const list = await carla.get('/unions');
    expect(list.status).toBe(200);
    expect(list.body.items.map((u: { acronym: string }) => u.acronym)).toEqual(['SINDMETAL', 'SINDCOM', 'SINDTRANS', 'SEMDATA']);
    expect(list.body.summary).toEqual({ active: 4, inactive: 1, overdue: 1, within30: 1, within60: 1, ok: 0, noBaseMonth: 1, overdueClients: 1 });
    expect(list.body.today).toBe('2026-10-20');
    expect((await carla.get('/unions?status=all')).body.total).toBe(5);
    expect((await carla.get('/unions?situation=overdue')).body.items.map((u: { acronym: string }) => u.acronym)).toEqual(['SINDMETAL']);
    expect((await carla.get('/unions?search=metal')).body.items.map((u: { acronym: string }) => u.acronym)).toEqual(['SINDMETAL']);
    expect((await carla.get(`/unions?search=${cnpj(30_100_021).slice(0, 8)}`)).body.items.map((u: { acronym: string }) => u.acronym)).toEqual(['SINDCOM']);

    // Alerts: active unions with active clients only (SINDTRANS has no client, ANTIGO is inactive).
    const deadlines = await carla.get('/deadlines?kind=conventions');
    expect(deadlines.status).toBe(200);
    expect(deadlines.body.conventions.items.map((c: { name: string }) => c.name)).toEqual(['SINDMETAL', 'SINDCOM']);
    expect(deadlines.body.conventions.counts).toEqual({ overdue: 1, within30: 1, within60: 0 });
    expect(deadlines.body.conventions.items[0]).toMatchObject({ cycle: { dueDate: '2026-03-01', bucket: 'overdue' }, clientCount: 1 });
    const summary = await carla.get('/deadlines/summary');
    expect(summary.body).toMatchObject({ conventions: { overdue: 1, within30: 1 }, overdueTotal: 1 });
    expect(summary.body.overdueConvention).toMatchObject({ unionId: overdue.body.id, name: 'SINDMETAL', days: 233 });

    // The global search finds unions for every member.
    const found = await carla.get('/search?q=sindmetal');
    expect(found.body.unions).toEqual([{ id: overdue.body.id, name: expect.any(String), acronym: 'SINDMETAL', category: 'Metalúrgicos', active: true }]);
  });

  it('every member reads; registry writes; deleteRegistry deletes; other workspaces are not found', async () => {
    const { ana, bruno, carla } = await office(app);
    const client = await createClient(ana);
    const created = await bruno.post('/unions', union());
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    for (const [method, url, body] of [
      ['post', '/unions', union({ document: cnpj(30_100_061) })],
      ['put', `/unions/${id}`, union()],
      ['put', `/unions/${id}/conventions`, { cycles: [] }],
      ['patch', `/unions/${id}/conventions/2026`, { published: true }],
      ['del', `/unions/${id}`, undefined],
    ] as const) {
      const res = await (carla[method] as (u: string, b?: unknown) => Promise<{ status: number; body: { message: string } }>)(url, body);
      expect(res.status, `${method} ${url}`).toBe(403);
      expect(res.body.message).toBe(TASK_ADMIN_MESSAGE);
    }
    expect((await carla.get('/unions')).status).toBe(200);
    expect((await carla.get(`/unions/${id}`)).status).toBe(200);

    // The CNPJ lookup is for whoever registers (clients, unions or the office).
    expect((await carla.get(`/cnpj/${cnpj(30_100_071)}`)).status).toBe(403);

    // Adjustments: `registry` without `deleteRegistry`.
    expect((await ana.put(`/workspaces/current/members/${carla.userId}/permissions`, { overrides: { registry: true } })).status).toBe(200);
    expect((await carla.patch(`/unions/${id}/conventions/2026`, { published: true })).status).toBe(200);
    expect((await carla.del(`/unions/${id}`)).status).toBe(403);

    // Ids of another workspace: unions and clients are "not found".
    const other = await registerUser(app, 'Outro Escritório');
    expect((await other.get(`/unions/${id}`)).status).toBe(404);
    expect((await other.put(`/unions/${id}`, union())).status).toBe(404);
    expect((await other.patch(`/unions/${id}/conventions/2026`, { published: false })).status).toBe(404);
    expect((await other.del(`/unions/${id}`)).status).toBe(404);
    expect((await other.post('/unions', union({ clientIds: [client] }))).status).toBe(404);
    expect((await other.get('/unions')).body.total).toBe(0);
    // The same CNPJ is fine in another workspace.
    expect((await other.post('/unions', union())).status).toBe(201);

    expect((await bruno.del(`/unions/${id}`)).status).toBe(204);
    expect((await bruno.get(`/unions/${id}`)).status).toBe(404);
  });

  it('validates the input (CNPJ, name, base month, cycles)', async () => {
    const { ana } = await office(app);
    expect((await ana.post('/unions', union({ document: '11.222.333/0001-80' }))).body.message).toBe('CNPJ inválido.');
    expect((await ana.post('/unions', union({ name: ' ' }))).body.message).toBe('Informe o nome do sindicato.');
    expect((await ana.post('/unions', union({ baseMonth: 0 }))).status).toBe(400);
    const id = (await ana.post('/unions', union())).body.id;
    expect((await ana.put(`/unions/${id}/conventions`, { cycles: [{ year: 2026, published: true }, { year: 2026, published: false }] })).status).toBe(400);
    expect((await ana.patch(`/unions/${id}/conventions/1990`, { published: true })).status).toBe(400);
    expect((await ana.post('/unions', union({ document: cnpj(30_100_081), notes: 'a\u0000b' }))).status).toBe(400);
  });
});
