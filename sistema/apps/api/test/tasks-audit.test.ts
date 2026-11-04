// Monthly audit (phase 2): the client × recurring task matrix over the generated occurrences, the
// summary of the whole competence, the filters, the month of each client concluded, and reopening a
// concluded cell — only who concluded it or an administrator, with a reason recorded in the history
// (who/when/why); the author may undo within a few minutes without one.
// Today is pinned to 2026-10-20 (Tuesday); conclusions to 2026-10-20 12:00 in São Paulo.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { createTestApp, registerUser, resetDb } from './helpers';
import { createClient, member, office } from './task-helpers';

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

describe('monthly audit', () => {
  it('builds the matrix of the competence, its summary and the month of each client', async () => {
    const { ana, carla, bruno, fiscal, pessoal } = await office(app);
    const padaria = await createClient(ana, { tradeName: 'Padaria' });
    const clinica = await createClient(ana, { tradeName: 'Clínica' });
    const construtora = await createClient(ana, { tradeName: 'Construtora', taxRegime: 'presumed_profit' });
    const das = await ana.post('/tasks/recurring', { name: 'DAS', departmentId: fiscal, assigneeId: ana.userId, dueDay: 20, regimes: ['simples_nacional'] });
    const dctf = await ana.post('/tasks/recurring', {
      name: 'DCTFWeb',
      departmentId: fiscal,
      assigneeId: ana.userId,
      dueDay: 15,
      regimes: ['simples_nacional', 'presumed_profit'],
    });
    const folha = await ana.post('/tasks/recurring', { name: 'Folha', departmentId: pessoal, assigneeId: bruno.userId, dueDay: 30, regimes: ['presumed_profit'] });
    expect([das.status, dctf.status, folha.status]).toEqual([201, 201, 201]);

    const matrix = (await carla.get('/tasks/audit?competence=2026-10')).body;
    expect(matrix.today).toBe('2026-10-20');
    // Columns by target: DCTFWeb (15), DAS (20), Folha (30).
    expect(matrix.columns.map((c: any) => [c.name, c.total, c.overdue])).toEqual([
      ['DCTFWeb', 3, true],
      ['DAS', 2, false],
      ['Folha', 1, false],
    ]);
    expect(matrix.clients.map((c: any) => [c.name, c.total])).toEqual([
      ['Clínica', 2],
      ['Construtora', 2],
      ['Padaria', 2],
    ]);
    expect(matrix.clients[0].document).toMatch(/^\d{14}$/);
    expect(matrix.cells).toHaveLength(6);
    expect(matrix.summary).toMatchObject({
      competence: '2026-10',
      total: 6,
      done: 0,
      pending: 6,
      overduePending: 3,
      overdueClients: 3,
      clientsWithPending: 3,
      clientCount: 3,
      clientsConcluded: 0,
    });
    expect(matrix.summary.byDepartment).toEqual([
      { department: { id: fiscal, name: 'Fiscal' }, total: 5, done: 0, overduePending: 3 },
      { department: { id: pessoal, name: 'Pessoal' }, total: 1, done: 0, overduePending: 0 },
    ]);

    // Padaria's cells go to Carla by hand (that competence only), then she works them (any member).
    const padariaCells = matrix.cells.filter((c: any) => c.clientId === padaria);
    for (const cell of padariaCells) {
      expect((await ana.patch(`/tasks/${cell.taskId}`, { assigneeId: carla.userId })).status).toBe(200);
    }
    for (const cell of padariaCells) {
      const res = await carla.patch(`/tasks/${cell.taskId}/status`, { status: 'done' });
      expect(res.status).toBe(200);
      expect(res.body.task).toMatchObject({ status: 'done', completedBy: { id: carla.userId }, canReopen: true });
    }
    const after = (await carla.get('/tasks/audit?competence=2026-10')).body;
    const row = after.clients.find((c: any) => c.id === padaria);
    expect(row).toMatchObject({ done: 2, monthConcludedAt: '2026-10-20T15:00:00.000Z' });
    expect(after.summary).toMatchObject({ done: 2, doneLate: 1, clientsConcluded: 1 });
    const concluded = after.cells.find((c: any) => c.clientId === padaria && c.recurringTaskId === das.body.id);
    expect(concluded).toMatchObject({
      status: 'done',
      concludedBy: { id: carla.userId, name: 'Carla Souza' },
      concludedAt: '2026-10-20T15:00:00.000Z',
      concludedOnTime: true,
      canReopen: true,
    });
    // Canceled cells do not hold the month open.
    const clinicaCells = after.cells.filter((c: any) => c.clientId === clinica);
    await ana.patch(`/tasks/${clinicaCells[0].taskId}/status`, { status: 'done' });
    await ana.patch(`/tasks/${clinicaCells[1].taskId}/status`, { status: 'canceled' });
    const third = (await carla.get('/tasks/audit?competence=2026-10')).body;
    expect(third.clients.find((c: any) => c.id === clinica)).toMatchObject({ done: 1, canceled: 1 });
    expect(third.clients.find((c: any) => c.id === clinica).monthConcludedAt).not.toBeNull();

    // Filters: department, regime, recurring task, responsible (their clients, all their cells).
    const byDept = (await carla.get(`/tasks/audit?competence=2026-10&departmentId=${pessoal}`)).body;
    expect(byDept.columns.map((c: any) => c.name)).toEqual(['Folha']);
    expect(byDept.clients.map((c: any) => c.id)).toEqual([construtora]);
    expect(byDept.summary.total).toBe(6); // the summary covers the whole competence
    const byRegime = (await carla.get('/tasks/audit?competence=2026-10&taxRegime=presumed_profit')).body;
    expect(byRegime.clients.map((c: any) => c.name)).toEqual(['Construtora']);
    expect(byRegime.columns.map((c: any) => c.name)).toEqual(['DCTFWeb', 'Folha']);
    const byCarla = (await carla.get(`/tasks/audit?competence=2026-10&assigneeId=${carla.userId}`)).body;
    expect(byCarla.clients.map((c: any) => c.name)).toEqual(['Padaria']);
    expect(byCarla.cells).toHaveLength(2);
    const byTask = (await carla.get(`/tasks/audit?competence=2026-10&recurringTaskId=${das.body.id}`)).body;
    expect(byTask.columns).toHaveLength(1);
    // Another office sees nothing of this one.
    const other = await registerUser(app, 'Outro Escritório');
    expect((await other.get('/tasks/audit?competence=2026-10')).body).toMatchObject({ columns: [], clients: [], cells: [] });
  });

  it('reopening a concluded cell: who concluded it or an administrator, with a reason in the history', async () => {
    const { ana, carla, fiscal } = await office(app);
    const dani = await member(app, ana, 'viewer', 'Daniela Lima');
    const client = await createClient(ana, { tradeName: 'Padaria' });
    const das = await ana.post('/tasks/recurring', { name: 'DAS', departmentId: fiscal, assigneeId: carla.userId, dueDay: 20, clientIds: [client] });
    const cell = (await carla.get('/tasks/audit?competence=2026-10')).body.cells[0];

    // Concluded by Carla at 12:00 (São Paulo).
    await carla.patch(`/tasks/${cell.taskId}/status`, { status: 'done' });
    // Undo within the window: no reason needed (her own conclusion, a few minutes later).
    process.env.EFFINANCE_NOW = '2026-10-20T15:05:00Z';
    const undo = await carla.patch(`/tasks/${cell.taskId}/status`, { status: 'todo' });
    expect(undo.status).toBe(200);
    expect(undo.body.task).toMatchObject({ status: 'todo', completedAt: null, completedBy: null });

    process.env.EFFINANCE_NOW = '2026-10-20T15:10:00Z';
    await carla.patch(`/tasks/${cell.taskId}/status`, { status: 'done' });
    // Another collaborator cannot reopen it (and is told so), not even with a reason.
    expect((await dani.get(`/tasks/${cell.taskId}`)).body.canReopen).toBe(false);
    const refused = await dani.patch(`/tasks/${cell.taskId}/status`, { status: 'todo', reason: 'Errado' });
    expect(refused).toMatchObject({ status: 403, body: { message: 'Só quem concluiu ou um administrador pode reabrir esta tarefa.' } });
    expect((await dani.get('/tasks/audit?competence=2026-10')).body.cells[0].canReopen).toBe(false);
    // After the window, the author needs a reason.
    process.env.EFFINANCE_NOW = '2026-10-20T16:00:00Z';
    const noReason = await carla.patch(`/tasks/${cell.taskId}/status`, { status: 'todo' });
    expect(noReason).toMatchObject({ status: 422, body: { message: 'Informe o motivo da reabertura.' } });
    // An administrator reopens with a reason.
    process.env.EFFINANCE_NOW = '2026-10-20T16:30:00Z';
    const reopened = await ana.patch(`/tasks/${cell.taskId}/status`, { status: 'todo', reason: 'Guia emitida com o valor errado' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.task).toMatchObject({ status: 'todo', completedBy: null, canReopen: false });

    const history = (await carla.get(`/tasks/${cell.taskId}/history`)).body;
    expect(history.items.map((h: any) => h.kind)).toEqual(['reopened', 'status', 'reopened', 'status', 'created']);
    expect(history.items[0]).toMatchObject({
      actor: { id: ana.userId, name: 'Ana Paula Ribeiro' },
      fromStatus: 'done',
      toStatus: 'todo',
      note: 'Guia emitida com o valor errado',
      createdAt: '2026-10-20T16:30:00.000Z',
    });
    expect(history.items[2]).toMatchObject({ actor: { id: carla.userId }, note: null });
    expect(history.items[4]).toMatchObject({ kind: 'created', actor: null, origin: 'recurring' });
    // Standalone tasks reopen freely (the reason is optional and kept).
    const plain = await carla.post('/tasks', { title: 'Avulsa', status: 'done' });
    const freely = await dani.patch(`/tasks/${plain.body.id}/status`, { status: 'todo', reason: 'Faltou anexar' });
    expect(freely.status).toBe(200);
    void das;
  });
});
