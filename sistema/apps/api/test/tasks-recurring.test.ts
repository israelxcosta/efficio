// Recurring tasks (phase 2): the registry (administrators), the idempotent generation of one
// occurrence per client and period, who receives each occurrence (the default responsible, else the
// department's queue; by hand for one competence only), the derived situations (not started, in progress,
// past the target, overdue, done on time / late, canceled), national holidays, weekly tasks, the
// reference month, editing (open occurrences follow, concluded ones never change) and deleting.
// Today is pinned to 2026-10-20, a Tuesday; the conclusions to 2026-10-20 12:00 in São Paulo.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { executeRows } from '../src/lib/sql';
import { admin, createTestApp, registerUser, resetDb, type Client } from './helpers';
import { createClient, office, workspaceOf } from './task-helpers';

let app: App;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  delete process.env.EFFINANCE_NOW;
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
  process.env.EFFINANCE_NOW = '2026-10-20T15:00:00Z';
});

const rows = <T>(query: ReturnType<typeof sql>) => executeRows<T>(admin(), query);

async function occurrenceRows(ws: string, recurringId: string) {
  return rows<{ client_id: string; period_key: string; competence: string; assignee_id: string | null; assignee_source: string | null; status: string }>(
    sql`select client_id, period_key, competence, assignee_id, assignee_source, status from tasks
         where workspace_id = ${ws} and recurring_task_id = ${recurringId} order by competence, period_key, client_id`,
  );
}

const das = (departmentId: string, extra: Record<string, unknown> = {}) => ({
  name: 'DAS',
  description: 'Guia mensal do Simples Nacional',
  departmentId,
  dueDay: 20,
  targetDaysBefore: 3,
  nonBusinessDayRule: 'anticipate',
  regimes: ['simples_nacional'],
  ...extra,
});

async function cellsOf(c: Client, recurringId: string, period: string) {
  const res = await c.get(`/tasks/recurring/${recurringId}/occurrences/${period}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body;
}

describe('recurring tasks: registry and generation', () => {
  it('generates one occurrence per active client and period, for the default responsible, idempotently', async () => {
    const { ana, carla, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    const withResponsible = await createClient(ana, { tradeName: 'Padaria' });
    const withoutResponsible = await createClient(ana, { tradeName: 'Clínica' });
    const excluded = await createClient(ana, { tradeName: 'Excluída' });
    const presumed = await createClient(ana, { tradeName: 'Construtora', taxRegime: 'presumed_profit' });
    const chosen = await createClient(ana, { tradeName: 'Escolhida', taxRegime: 'presumed_profit' });
    const startsInNovember = await createClient(ana, { tradeName: 'Nova', contractStartDate: '2026-11-05' });
    const inactive = await createClient(ana, { tradeName: 'Antiga' });
    expect((await ana.post(`/clients/${inactive}/inactivate`, { date: '2026-09-15', reason: 'contract_end' })).status).toBe(200);
    // The responsible per client and department is gone (the occurrences go to the default responsible).
    expect((await ana.put('/tasks/client-responsibles', { clientId: withResponsible, departmentId: fiscal, userId: carla.userId })).status).toBe(404);

    // Collaborators read the registry but do not change it.
    expect((await carla.post('/tasks/recurring', das(fiscal, { assigneeId: ana.userId }))).status).toBe(403);
    // Without a legal deadline nothing could be generated; with departments, one must be chosen.
    expect((await ana.post('/tasks/recurring', { ...das(fiscal), dueDay: undefined })).status).toBe(400);
    const noDepartment = await ana.post('/tasks/recurring', { ...das(fiscal), departmentId: null });
    expect(noDepartment).toMatchObject({ status: 422, body: { message: 'Escolha o departamento.' } });

    const created = await ana.post('/tasks/recurring', das(fiscal, { assigneeId: ana.userId, clientIds: [chosen], excludedClientIds: [excluded] }));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const r = created.body;
    expect(r).toMatchObject({
      name: 'DAS',
      description: 'Guia mensal do Simples Nacional',
      period: 'monthly',
      months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      referenceOffset: 1,
      department: { id: fiscal, name: 'Fiscal' },
      assignee: { id: ana.userId, name: 'Ana Paula Ribeiro' },
      clientIds: [chosen],
      excludedClientIds: [excluded],
      startCompetence: '2026-10',
      endCompetence: null,
      active: true,
      clientCount: 3,
      month: { competence: '2026-10', occurs: true, legalDueDate: '2026-10-20', targetDate: '2026-10-16', total: 3, done: 0 },
    });
    expect(r).not.toHaveProperty('withoutResponsible');
    expect(r.distribution).toEqual([{ assignee: { id: ana.userId, name: 'Ana Paula Ribeiro' }, source: 'default', count: 3 }]);
    void presumed;

    // October to December were generated with the registry; November brings the client that starts then.
    const generated = await occurrenceRows(ws, r.id);
    expect(generated.map((o) => o.competence)).toEqual([...Array(3).fill('2026-10'), ...Array(4).fill('2026-11'), ...Array(4).fill('2026-12')]);
    expect(generated.filter((o) => o.client_id === startsInNovember).map((o) => o.competence)).toEqual(['2026-11', '2026-12']);
    expect(generated.some((o) => o.client_id === inactive || o.client_id === excluded || o.client_id === presumed)).toBe(false);
    expect(generated.find((o) => o.client_id === withResponsible && o.competence === '2026-10')).toMatchObject({
      assignee_id: ana.userId,
      assignee_source: 'default',
      status: 'todo',
    });
    expect(generated.find((o) => o.client_id === withoutResponsible && o.competence === '2026-10')).toMatchObject({
      assignee_id: ana.userId,
      assignee_source: 'default',
    });

    // Reading, listing and generating again changes nothing.
    expect((await ana.post('/tasks/recurring/generate', { competence: '2026-10' })).body).toEqual({ competence: '2026-10', created: 0 });
    await carla.get('/tasks');
    await carla.get('/tasks/home');
    await carla.get('/tasks/audit?competence=2026-10');
    expect(await occurrenceRows(ws, r.id)).toHaveLength(11);
    // Outside the window: 422.
    expect((await ana.post('/tasks/recurring/generate', { competence: '2027-06' })).status).toBe(422);

    // The occurrence view: one cell per client, the deadlines, the situation and the reference month.
    const october = await cellsOf(carla, r.id, '2026-10');
    expect(october).toMatchObject({
      name: 'DAS',
      description: 'Guia mensal do Simples Nacional',
      periodKey: '2026-10',
      competence: '2026-10',
      referenceMonth: '2026-09',
      legalDueDate: '2026-10-20',
      targetDate: '2026-10-16',
      total: 3,
      pending: 3,
      overdue: false,
      targetMissed: true,
      status: 'todo',
    });
    expect(october.cells.map((c: any) => c.client.name)).toEqual(['Clínica', 'Escolhida', 'Padaria']);
    const padaria = october.cells.find((c: any) => c.clientId === withResponsible);
    expect(padaria).toMatchObject({
      status: 'todo',
      situation: 'target_missed',
      assignee: { id: ana.userId },
      assigneeSource: 'default',
      overdue: false,
      targetMissed: true,
      concludedBy: null,
      canReopen: false,
      client: { name: 'Padaria', taxRegime: 'simples_nacional' },
    });
    expect(padaria.client.document).toMatch(/^\d{14}$/);

    // The occurrence is a task: kind, occurrence ref, locked registry fields.
    const task = (await carla.get(`/tasks/${padaria.taskId}`)).body;
    expect(task).toMatchObject({
      kind: 'recurring',
      title: 'DAS',
      dueDate: '2026-10-20',
      department: { id: fiscal },
      occurrence: { recurringTaskId: r.id, period: 'monthly', periodKey: '2026-10', competence: '2026-10', referenceMonth: '2026-09', targetDate: '2026-10-16', targetMissed: true, assigneeSource: 'default', situation: 'target_missed' },
      lockedFields: ['title', 'clientId', 'categoryId', 'departmentId', 'startDate', 'dueDate', 'startTime', 'endTime'],
    });
    expect((await carla.patch(`/tasks/${padaria.taskId}`, { dueDate: '2026-10-30' })).status).toBe(422);
    expect((await carla.patch(`/tasks/${padaria.taskId}`, { priority: 'high', description: 'Faltam as notas' })).status).toBe(200);
    // Occurrences are canceled, not deleted (the generation would bring them back).
    expect((await ana.del(`/tasks/${padaria.taskId}`)).status).toBe(409);
  });

  it('generating a past competence twice at the same time creates each occurrence once', async () => {
    const { ana, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    for (let i = 0; i < 3; i++) await createClient(ana);
    const created = await ana.post('/tasks/recurring', das(fiscal, { startCompetence: '2026-07' }));
    expect(created.status).toBe(201);
    // The registry generated from two competences back (August) to two ahead.
    expect(new Set((await occurrenceRows(ws, created.body.id)).map((o) => o.competence))).toEqual(
      new Set(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12']),
    );
    const [a, b] = await Promise.all([
      ana.post('/tasks/recurring/generate', { competence: '2026-07' }),
      ana.post('/tasks/recurring/generate', { competence: '2026-07' }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.created + b.body.created).toBe(3);
    expect((await occurrenceRows(ws, created.body.id)).filter((o) => o.competence === '2026-07')).toHaveLength(3);
  });

  it('a workspace whose subscription does not allow writing reads but does not generate', async () => {
    const { ana, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    await createClient(ana);
    const created = await ana.post('/tasks/recurring', das(fiscal));
    await admin().execute(sql`update subscriptions set status = 'canceled', current_period_end = now() - interval '1 day', trial_ends_at = now() - interval '30 days' where workspace_id = ${ws}`);
    await admin().execute(sql`delete from tasks where workspace_id = ${ws} and competence = '2026-12'`);
    expect((await ana.get('/tasks')).status).toBe(200);
    expect((await occurrenceRows(ws, created.body.id)).filter((o) => o.competence === '2026-12')).toHaveLength(0);
    expect((await ana.post('/tasks/recurring/generate', { competence: '2026-12' })).status).toBe(402);
  });
});

describe('recurring tasks: deadlines, situations and holidays', () => {
  it('derives overdue, "fora da meta", on time and late; moves deadlines off holidays; weekly and reference months', async () => {
    const { ana, carla, fiscal } = await office(app);
    const client = await createClient(ana, { tradeName: 'Padaria' });
    const post = async (body: Record<string, unknown>) => {
      const res = await ana.post('/tasks/recurring', { departmentId: fiscal, assigneeId: carla.userId, clientIds: [client], ...body });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      return res.body;
    };
    const dctf = await post({ name: 'DCTFWeb', dueDay: 15 });
    const icms = await post({ name: 'ICMS', dueDay: 12, nonBusinessDayRule: 'postpone', referenceOffset: 0 });
    const fgts = await post({ name: 'FGTS Digital', dueDay: 20 });
    const reinf = await post({ name: 'EFD-Reinf', dueDay: 31, targetDaysBefore: 2 });
    const weekly = await post({ name: 'Conferência de extratos', period: 'weekly', dueDay: 5 });
    const quarterly = await post({ name: 'IRPJ trimestral', period: 'quarterly', dueMonth: 1, dueDay: 30, referenceOffset: 3 });

    const one = async (r: { id: string }, period: string) => (await cellsOf(carla, r.id, period)).cells[0];
    // DCTFWeb on Thursday 15: overdue for 5 days.
    expect(await one(dctf, '2026-10')).toMatchObject({ legalDueDate: '2026-10-15', targetDate: '2026-10-15', overdue: true, situation: 'overdue' });
    // ICMS on the 12th: Nossa Senhora Aparecida (Monday) → postponed to Tuesday 13.
    expect(await one(icms, '2026-10')).toMatchObject({ legalDueDate: '2026-10-13', overdue: true });
    expect((await cellsOf(carla, icms.id, '2026-10')).referenceMonth).toBe('2026-10');
    // FGTS today, no target: not started (due today).
    expect(await one(fgts, '2026-10')).toMatchObject({ legalDueDate: '2026-10-20', situation: 'not_started', overdue: false, targetMissed: false });
    // November 20 is a national holiday (Friday): anticipated to Thursday 19.
    expect(await one(fgts, '2026-11')).toMatchObject({ legalDueDate: '2026-11-19' });
    // Day 31 on a Saturday → Friday 30; target two days before → Wednesday 28.
    expect(await one(reinf, '2026-10')).toMatchObject({ legalDueDate: '2026-10-30', targetDate: '2026-10-28' });
    // Weekly on Fridays: five weeks in October, keyed by their Monday.
    const audit = (await carla.get('/tasks/audit?competence=2026-10')).body;
    expect(audit.columns.filter((c: any) => c.recurringTaskId === weekly.id).map((c: any) => c.periodKey)).toEqual([
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ]);
    // Quarterly from January: October has it, November does not; reference three months back.
    expect((await cellsOf(carla, quarterly.id, '2026-10')).referenceMonth).toBe('2026-07');
    expect((await carla.get(`/tasks/recurring/${quarterly.id}/occurrences/2026-11`)).status).toBe(404);

    // Concluding: before the legal deadline → on time; the overdue one → late.
    const fgtsCell = await one(fgts, '2026-10');
    const dctfCell = await one(dctf, '2026-10');
    expect((await carla.patch(`/tasks/${fgtsCell.taskId}/status`, { status: 'done' })).status).toBe(200);
    expect((await carla.patch(`/tasks/${dctfCell.taskId}/status`, { status: 'done' })).status).toBe(200);
    expect(await one(fgts, '2026-10')).toMatchObject({ status: 'done', situation: 'done_on_time', concludedOnTime: true, concludedBy: { id: carla.userId } });
    expect(await one(dctf, '2026-10')).toMatchObject({ situation: 'done_late', concludedOnTime: false });
    // Canceled apart from concluded.
    const icmsCell = await one(icms, '2026-10');
    await carla.patch(`/tasks/${icmsCell.taskId}/status`, { status: 'canceled' });
    const icmsGroup = await cellsOf(carla, icms.id, '2026-10');
    expect(icmsGroup).toMatchObject({ total: 1, done: 0, canceled: 1, pending: 0 });

    // The list aggregates the occurrences (never as rows) and counts them one per client.
    const list = (await carla.get('/tasks?scope=mine&month=2026-10')).body;
    expect(list.items.every((t: any) => t.kind !== 'recurring')).toBe(true);
    expect(list.occurrences.find((o: any) => o.recurringTaskId === dctf.id)).toMatchObject({ done: 1, doneLate: 1, pending: 0, status: 'done' });
    expect(list.summary.targetMissed).toBe(0);
    const reinfRow = list.occurrences.find((o: any) => o.recurringTaskId === reinf.id);
    expect(reinfRow).toMatchObject({ pending: 1, assignees: [{ assignee: { id: carla.userId }, count: 1 }], defaultAssignee: { id: carla.userId } });
    // `occurrences=false` keeps the phase 1 view: no occurrence anywhere.
    const plain = (await carla.get('/tasks?scope=mine&occurrences=false')).body;
    expect(plain).toMatchObject({ occurrences: [], summary: { open: 0 } });
  });

  it('"fora da meta" groups the list between overdue and today', async () => {
    const { ana, carla, fiscal } = await office(app);
    const client = await createClient(ana);
    const created = await ana.post('/tasks/recurring', das(fiscal, { assigneeId: carla.userId, clientIds: [client], regimes: [] }));
    expect(created.status).toBe(201);
    const list = (await carla.get('/tasks?scope=mine&situation=open')).body;
    expect(list.groups.targetMissed).toBe(1);
    expect(list.summary).toMatchObject({ targetMissed: 1, overdue: 0 });
    const bucket = (await carla.get('/tasks?scope=mine&dueBucket=targetMissed')).body;
    expect(bucket.occurrences).toHaveLength(1);
    expect(bucket.occurrences[0]).toMatchObject({ name: 'DAS', targetMissed: true, overdue: false, targetDate: '2026-10-16' });
  });
});

describe('recurring tasks: who receives the occurrences', () => {
  it('without a default responsible the occurrences wait in the department queue; by hand only for that competence', async () => {
    const { ana, bruno, carla, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    const a = await createClient(ana, { tradeName: 'A' });
    const b = await createClient(ana, { tradeName: 'B' });
    const created = await ana.post('/tasks/recurring', das(fiscal));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.id;
    expect(created.body.distribution).toEqual([{ assignee: null, source: null, count: 2 }]);
    const generated = await occurrenceRows(ws, id);
    expect(generated).toHaveLength(6);
    expect(generated.every((o) => o.assignee_id === null && o.assignee_source === null)).toBe(true);
    // The department queue shows them (unassigned, in the recurring task's department).
    const queue = (await carla.get('/tasks?scope=department&month=2026-10')).body;
    expect(queue.occurrences).toHaveLength(1);
    expect(queue.occurrences[0]).toMatchObject({ name: 'DAS', department: { id: fiscal }, total: 2, assignees: [{ assignee: null, count: 2 }] });

    // Assigned by hand: that competence only; the registry's default reaches the others, never that one.
    const october = await cellsOf(carla, id, '2026-10');
    const aOct = october.cells.find((c: any) => c.clientId === a).taskId;
    const manual = await carla.patch(`/tasks/${aOct}`, { assigneeId: bruno.userId });
    expect(manual.body).toMatchObject({ assignee: { id: bruno.userId }, occurrence: { assigneeSource: 'manual' } });
    expect((await ana.put(`/tasks/recurring/${id}`, das(fiscal, { assigneeId: ana.userId }))).status).toBe(200);
    const after = await occurrenceRows(ws, id);
    expect(after.find((o) => o.client_id === a && o.competence === '2026-10')).toMatchObject({ assignee_id: bruno.userId, assignee_source: 'manual' });
    expect(after.filter((o) => !(o.client_id === a && o.competence === '2026-10')).every((o) => o.assignee_id === ana.userId && o.assignee_source === 'default')).toBe(true);
    void b;
    // The old routes of the "carteira" are gone.
    for (const path of ['/tasks/client-responsibles', '/tasks/client-responsibles/batch']) {
      expect((await ana.put(path, { items: [] })).status).toBe(404);
    }
    // GET falls on `/tasks/:id` (not a uuid: 400); nothing answers 200 any more.
    expect([400, 404]).toContain((await ana.get('/tasks/client-responsibles')).status);
    expect((await ana.get('/tasks/options')).body).not.toHaveProperty('clientResponsibles');
  });
});

describe('recurring tasks: editing and deleting', () => {
  it('editing: not started occurrences follow; in progress and concluded stay; exceptions and the end cancel the not started', async () => {
    const { ana, bruno, carla, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    const a = await createClient(ana, { tradeName: 'A' });
    const b = await createClient(ana, { tradeName: 'B' });
    const created = await ana.post('/tasks/recurring', das(fiscal, { assigneeId: carla.userId }));
    const id = created.body.id;
    const cell = async (client: string, period: string) => (await cellsOf(carla, id, period)).cells.find((c: any) => c.clientId === client).taskId as string;
    const aOct = await cell(a, '2026-10');
    const aNov = await cell(a, '2026-11');
    const aDec = await cell(a, '2026-12');
    const bOct = await cell(b, '2026-10');
    const bNov = await cell(b, '2026-11');
    await carla.patch(`/tasks/${aOct}/status`, { status: 'done' });
    await carla.patch(`/tasks/${aDec}/status`, { status: 'in_progress' });
    await carla.patch(`/tasks/${aNov}`, { assigneeId: bruno.userId }); // reassigned for November only
    await carla.patch(`/tasks/${bNov}/status`, { status: 'waiting_client' });

    const updated = await ana.put(`/tasks/recurring/${id}`, das(fiscal, { name: 'DAS do Simples', dueDay: 25, assigneeId: ana.userId, excludedClientIds: [b] }));
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(updated.body).toMatchObject({ name: 'DAS do Simples', dueDay: 25, clientCount: 1, excludedClientIds: [b] });
    type Row = { id: string; client_id: string; competence: string; title: string; due_date: string; status: string; assignee_id: string };
    const state = async () =>
      rows<Row>(sql`select id, client_id, competence, title, due_date::text, status, assignee_id from tasks
                     where workspace_id = ${ws} and recurring_task_id = ${id} order by competence, client_id`);
    const byId = (list: Row[], taskId: string) => list.find((o) => o.id === taskId)!;
    let after = await state();
    // Concluded: unchanged. In progress: unchanged. Not started: name, deadline (25/11 is a Wednesday)
    // and default responsible follow — but November keeps Bruno, assigned by hand.
    expect(byId(after, aOct)).toMatchObject({ title: 'DAS', due_date: '2026-10-20', status: 'done', assignee_id: carla.userId });
    expect(byId(after, aDec)).toMatchObject({ title: 'DAS', due_date: '2026-12-18', status: 'in_progress', assignee_id: carla.userId });
    expect(byId(after, aNov)).toMatchObject({ title: 'DAS do Simples', due_date: '2026-11-25', status: 'todo', assignee_id: bruno.userId });
    // B entered the exceptions: its not started occurrences are canceled; the one waiting for the client stays.
    expect(after.filter((o) => o.client_id === b).map((o) => [o.competence, o.status])).toEqual([
      ['2026-10', 'canceled'],
      ['2026-11', 'waiting_client'],
      ['2026-12', 'canceled'],
    ]);
    const history = (await carla.get(`/tasks/${bOct}/history`)).body;
    expect(history.items[0]).toMatchObject({
      kind: 'status',
      actor: null,
      fromStatus: 'todo',
      toStatus: 'canceled',
      note: 'A tarefa recorrente deixou de se aplicar a este cliente (exceção ou regime)',
    });
    expect((await carla.get(`/tasks/${aNov}/history`)).body.items.filter((h: any) => h.kind === 'assigned')).toHaveLength(1);

    // B leaves the exceptions: what the system canceled goes back to "A fazer", with the new deadline.
    await ana.put(`/tasks/recurring/${id}`, das(fiscal, { name: 'DAS do Simples', dueDay: 25, assigneeId: ana.userId }));
    after = await state();
    expect(byId(after, bOct)).toMatchObject({ status: 'todo', title: 'DAS do Simples', due_date: '2026-10-23', assignee_id: ana.userId });
    const restored = (await carla.get(`/tasks/${bOct}/history`)).body.items;
    // Back to "A fazer", then to the new default responsible.
    expect(restored[0]).toMatchObject({ kind: 'assigned', actor: null, toAssignee: { id: ana.userId } });
    expect(restored[1]).toMatchObject({
      kind: 'reopened',
      actor: null,
      fromStatus: 'canceled',
      toStatus: 'todo',
      note: 'A tarefa recorrente voltou a se aplicar',
    });
    // A cancellation by a person is never undone by a sync.
    await carla.patch(`/tasks/${bOct}/status`, { status: 'canceled' });
    await ana.put(`/tasks/recurring/${id}`, das(fiscal, { name: 'DAS do Simples', dueDay: 24, assigneeId: ana.userId }));
    expect(byId(await state(), bOct).status).toBe('canceled');

    // With history it cannot be deleted (it would erase audit records): end it instead. Ending in
    // October cancels the not started occurrences of November and December; in progress ones stay.
    const refused = await ana.del(`/tasks/recurring/${id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/Encerra em/);
    const ended = await ana.put(`/tasks/recurring/${id}`, das(fiscal, { endCompetence: '2026-10' }));
    expect(ended.body).toMatchObject({ endCompetence: '2026-10', active: true });
    after = await state();
    expect(
      after
        .filter((o) => o.competence !== '2026-10')
        .map((o) => [o.competence, o.client_id === a ? 'A' : 'B', o.status])
        .sort((x, y) => `${x[0]}${x[1]}`.localeCompare(`${y[0]}${y[1]}`)),
    ).toEqual([
      ['2026-11', 'A', 'canceled'],
      ['2026-11', 'B', 'waiting_client'],
      ['2026-12', 'A', 'in_progress'],
      ['2026-12', 'B', 'canceled'],
    ]);
    expect((await carla.get(`/tasks/${aNov}/history`)).body.items[0]).toMatchObject({ note: 'A tarefa recorrente foi encerrada antes desta competência' });
    expect((await carla.get('/tasks/recurring?status=active')).body.items).toHaveLength(1);

    // An untouched one goes away with its occurrences.
    const spare = await ana.post('/tasks/recurring', das(fiscal, { name: 'Sem uso' }));
    expect((await carla.del(`/tasks/recurring/${spare.body.id}`)).status).toBe(403);
    expect((await ana.del(`/tasks/recurring/${spare.body.id}`)).status).toBe(204);
    expect(await occurrenceRows(ws, spare.body.id)).toHaveLength(0);
  });

  it('lists with the month progress and filters; departments count and keep their recurring tasks', async () => {
    const { ana, carla, fiscal, pessoal } = await office(app);
    await createClient(ana);
    await ana.post('/tasks/recurring', das(fiscal));
    await ana.post('/tasks/recurring', { name: 'Folha de pagamento', departmentId: pessoal, dueDay: 5, regimes: ['simples_nacional'] });
    const list = (await carla.get('/tasks/recurring')).body;
    expect(list.month).toBe('2026-10');
    expect(list.items.map((i: any) => i.name)).toEqual(['DAS', 'Folha de pagamento']);
    expect(list.summary).toEqual({ active: 2, ended: 0, occurrences: { total: 2, done: 0, canceled: 0 }, byOrigin: { registry: 2, task: 0 } });
    expect((await carla.get(`/tasks/recurring?departmentId=${pessoal}`)).body.items.map((i: any) => i.name)).toEqual(['Folha de pagamento']);
    expect((await carla.get('/tasks/recurring?search=folha')).body.items).toHaveLength(1);
    const folha = list.items[1];
    expect(folha.month).toMatchObject({ legalDueDate: '2026-10-05', overdue: 1 });
    const departments = (await carla.get('/tasks/departments')).body;
    expect(departments.find((d: any) => d.id === pessoal)).toMatchObject({ recurringCount: 1 });
    const refused = await ana.del(`/tasks/departments/${pessoal}`);
    expect(refused.status).toBe(409);
    expect(refused.body.details).toMatchObject({ recurring: 1 });
  });

  it('ids of another workspace are "not found" (registry, occurrences, clients)', async () => {
    const { ana, fiscal } = await office(app);
    await createClient(ana);
    const mine = await ana.post('/tasks/recurring', das(fiscal));
    const other = await registerUser(app, 'Outro Escritório');
    const foreignClient = await createClient(other);
    expect((await other.get(`/tasks/recurring/${mine.body.id}`)).status).toBe(404);
    expect((await other.get(`/tasks/recurring/${mine.body.id}/occurrences/2026-10`)).status).toBe(404);
    expect((await other.put(`/tasks/recurring/${mine.body.id}`, das(fiscal))).status).toBe(404);
    expect((await other.del(`/tasks/recurring/${mine.body.id}`)).status).toBe(404);
    expect((await ana.post('/tasks/recurring', das(fiscal, { clientIds: [foreignClient] }))).status).toBe(404);
    expect((await ana.post('/tasks/recurring', das(fiscal, { excludedClientIds: [foreignClient] }))).status).toBe(404);
    expect((await other.get('/tasks/recurring')).body.items).toEqual([]);
  });
});
