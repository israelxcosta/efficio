// Task module, phase 1: departments, member departments, categories, tasks, subtasks, comments, the
// responsible per client and department, the list with its summary and the start page.
// Today is pinned to 2026-10-20 (vitest.config.ts).
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TASK_PRIORITIES, TASK_STATUSES } from '@effinance/shared';
import type { App } from '../src/app';
import { tasks } from '../src/db/schema';
import { executeRows } from '../src/lib/sql';
import { withTenant } from '../src/lib/tenant';
import { admin, createTestApp, registerUser, resetDb, type Client } from './helpers';

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
afterEach(() => {
  delete process.env.EFFINANCE_NOW;
});

async function member(
  owner: Client,
  role: 'editor' | 'viewer',
  email: string,
  name: string,
): Promise<Client> {
  const invite = await owner.post('/workspaces/current/invites', { email, role });
  expect(invite.status).toBe(201);
  const guest = await registerUser(app, name, email);
  const accepted = await guest.post(
    `/invites/${invite.body.inviteUrl.split('/convite/')[1]}/accept`,
  );
  expect(accepted.status).toBe(200);
  return guest;
}

async function workspaceOf(c: Client): Promise<string> {
  return (await c.get('/auth/me')).body.workspace.id;
}

async function createClient(c: Client, overrides: Record<string, unknown> = {}) {
  const res = await c.post('/clients', {
    name: 'Padaria Pão Dourado Ltda',
    tradeName: 'Pão Dourado',
    document: '11.222.333/0001-81',
    taxRegime: 'simples_nacional',
    simplesAnnex: 'I',
    contractStartDate: '2025-01-10',
    ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

/** An office: owner Ana (admin), editor Bruno and viewer Carla; Fiscal (Ana, Carla) and Contábil (Bruno). */
async function office() {
  const ana = await registerUser(app, 'Ana Paula Ribeiro');
  const bruno = await member(ana, 'editor', `bruno-${Date.now()}@teste.com`, 'Bruno Carvalho');
  const carla = await member(ana, 'viewer', `carla-${Date.now()}@teste.com`, 'Carla Souza');
  const fiscal = await ana.post('/tasks/departments', {
    name: 'Fiscal',
    memberIds: [ana.userId, carla.userId],
  });
  expect(fiscal.status).toBe(201);
  const contabil = await ana.post('/tasks/departments', {
    name: 'Contábil',
    memberIds: [bruno.userId],
  });
  expect(contabil.status).toBe(201);
  return {
    ana,
    bruno,
    carla,
    fiscal: fiscal.body.id as string,
    contabil: contabil.body.id as string,
  };
}

describe('tasks: database', () => {
  it('CHECK lists follow the contract and RLS hides other workspaces', async () => {
    const defs = await executeRows<{ name: string; def: string }>(
      admin(),
      sql`select conname as name, pg_get_constraintdef(oid) as def from pg_constraint where conname in ('tasks_status_chk', 'tasks_priority_chk')`,
    );
    const values = (name: string) =>
      [...defs.find((d) => d.name === name)!.def.matchAll(/'([^']*)'::text/g)]
        .map((m) => m[1])
        .sort();
    expect(values('tasks_status_chk')).toEqual([...TASK_STATUSES].sort());
    expect(values('tasks_priority_chk')).toEqual([...TASK_PRIORITIES].sort());

    const a = await registerUser(app, 'Escritório A');
    const b = await registerUser(app, 'Escritório B');
    expect((await a.post('/tasks', { title: 'Balancete de setembro' })).status).toBe(201);
    const [wa, wb] = [await workspaceOf(a), await workspaceOf(b)];
    const seen = (ws: string) =>
      withTenant(
        app.db,
        ws,
        async (tx) =>
          (await executeRows<{ n: number }>(tx, sql`select count(*)::int as n from tasks`))[0]!.n,
      );
    expect(await seen(wa)).toBe(1);
    expect(await seen(wb)).toBe(0);
    // The API login has no direct access to the task tables (only through the tenant role).
    const denied = await app.db
      .select()
      .from(tasks)
      .then(
        () => null,
        (e: { message: string; cause?: { message?: string } }) => e.cause?.message ?? e.message,
      );
    expect(denied).toMatch(/permission denied for table tasks/);
  });
});

describe('tasks: isolation between workspaces (IDOR)', () => {
  it('ids of another workspace are "not found" for reads, writes and references', async () => {
    const a = await office();
    const other = await registerUser(app, 'Outro Escritório');
    const clientA = await createClient(a.ana);
    const cat = await a.ana.post('/tasks/categories', {
      name: 'Certidões',
      icon: 'shield',
      color: '#3F64BE',
    });
    const task = await a.ana.post('/tasks', {
      title: 'Certidão negativa',
      clientId: clientA,
      categoryId: cat.body.id,
    });
    expect(task.status).toBe(201);
    const id = task.body.id;

    expect((await other.get(`/tasks/${id}`)).status).toBe(404);
    expect((await other.patch(`/tasks/${id}`, { title: 'invadida' })).status).toBe(404);
    expect((await other.patch(`/tasks/${id}/status`, { status: 'done' })).status).toBe(404);
    expect((await other.post(`/tasks/${id}/comments`, { text: 'oi' })).status).toBe(404);
    expect((await other.post(`/tasks/${id}/subtasks`, { title: 'x' })).status).toBe(404);
    expect((await other.del(`/tasks/${id}`)).status).toBe(404);
    expect((await other.get('/tasks')).body.total).toBe(0);
    // References to another workspace's client, category, department or member.
    expect((await other.post('/tasks', { title: 'x', clientId: clientA })).status).toBe(404);
    expect((await other.post('/tasks', { title: 'x', categoryId: cat.body.id })).status).toBe(404);
    expect((await other.post('/tasks', { title: 'x', departmentId: a.fiscal })).status).toBe(404);
    expect((await other.post('/tasks', { title: 'x', assigneeId: a.ana.userId })).status).toBe(422);
    expect(
      (
        await other.put('/tasks/client-responsibles', {
          clientId: clientA,
          departmentId: a.fiscal,
          userId: other.userId,
        })
      ).status,
    ).toBe(404);
    expect(
      (await other.put(`/tasks/members/${a.bruno.userId}/department`, { departmentId: null }))
        .status,
    ).toBe(404);
    // The task is untouched.
    expect((await a.ana.get(`/tasks/${id}`)).body).toMatchObject({
      title: 'Certidão negativa',
      status: 'todo',
    });
  });
});

describe('tasks: permissions', () => {
  it('a viewer works on tasks but not on registries or deletions', async () => {
    const { ana, carla, fiscal } = await office();
    const created = await carla.post('/tasks', {
      title: 'Conferir notas de entrada',
      assigneeId: carla.userId,
      dueDate: '2026-10-25',
    });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect((await carla.patch(`/tasks/${id}`, { priority: 'high' })).status).toBe(200);
    expect((await carla.patch(`/tasks/${id}/status`, { status: 'in_progress' })).status).toBe(200);
    const sub = await carla.post(`/tasks/${id}/subtasks`, { title: 'Baixar XMLs' });
    expect(sub.status).toBe(201);
    expect((await carla.patch(`/tasks/${id}/subtasks/${sub.body.id}`, { done: true })).status).toBe(
      200,
    );
    expect((await carla.del(`/tasks/${id}/subtasks/${sub.body.id}`)).status).toBe(204);
    expect((await carla.post(`/tasks/${id}/comments`, { text: 'Faltam duas notas.' })).status).toBe(
      201,
    );

    const forbidden = [
      await carla.del(`/tasks/${id}`),
      await carla.post('/tasks/departments', { name: 'Pessoal' }),
      await carla.put(`/tasks/departments/${fiscal}`, { name: 'Fiscal 2' }),
      await carla.del(`/tasks/departments/${fiscal}`),
      await carla.post('/tasks/categories', { name: 'Abertura' }),
      await carla.put(`/tasks/members/${carla.userId}/department`, { departmentId: null }),
      await carla.put('/tasks/client-responsibles', {
        clientId: id,
        departmentId: fiscal,
        userId: carla.userId,
      }),
      await carla.get('/tasks/home?departmentId=all'),
    ];
    for (const res of forbidden) expect(res.status).toBe(403);
    // The finances stay closed to her (the task module does not open them).
    expect((await carla.get('/transactions')).status).toBe(403);

    expect((await ana.del(`/tasks/${id}`)).status).toBe(204);
    expect((await ana.get(`/tasks/${id}`)).status).toBe(404);
  });

  it('writes need a subscription that allows writing (402), reads keep working', async () => {
    const ana = await registerUser(app, 'Ana');
    const task = await ana.post('/tasks', { title: 'x' });
    await admin().execute(
      sql`update subscriptions set trial_ends_at = now() - interval '1 day' where workspace_id = ${await workspaceOf(ana)}`,
    );
    expect((await ana.post('/tasks', { title: 'y' })).status).toBe(402);
    expect((await ana.patch(`/tasks/${task.body.id}/status`, { status: 'done' })).status).toBe(402);
    expect((await ana.get('/tasks')).status).toBe(200);
    expect((await ana.get('/tasks/options')).body.me).toMatchObject({
      isAdmin: true,
      canWrite: false,
    });
  });
});

describe('tasks: department, conclusion and overdue', () => {
  it('derives the department from the assignee and keeps it in sync when the member moves', async () => {
    const { ana, bruno, carla, fiscal, contabil } = await office();
    // A department sent along with an assignee is ignored: it is the assignee's.
    const t1 = await ana.post('/tasks', {
      title: 'Apuração ICMS',
      assigneeId: carla.userId,
      departmentId: contabil,
    });
    expect(t1.body.department).toEqual({ id: fiscal, name: 'Fiscal' });
    // Without assignee the task waits in the queue it was given.
    const t2 = await ana.post('/tasks', { title: 'Triagem', departmentId: contabil });
    expect(t2.body).toMatchObject({ assignee: null, department: { id: contabil } });
    const t3 = await ana.post('/tasks', { title: 'Sem fila' });
    expect(t3.body.department).toBeNull();

    // Changing the assignee moves the task; unassigning keeps it in the department it was in.
    expect(
      (await ana.patch(`/tasks/${t1.body.id}`, { assigneeId: bruno.userId })).body.department.id,
    ).toBe(contabil);
    expect((await ana.patch(`/tasks/${t1.body.id}`, { assigneeId: null })).body.department.id).toBe(
      contabil,
    );

    // Carla moves to Contábil: her open tasks follow her, concluded ones stay where they were done.
    const open = await ana.post('/tasks', { title: 'Aberta', assigneeId: carla.userId });
    const closed = await ana.post('/tasks', {
      title: 'Feita',
      assigneeId: carla.userId,
      status: 'done',
    });
    const moved = await ana.put(`/tasks/members/${carla.userId}/department`, {
      departmentId: contabil,
    });
    expect(moved.body).toMatchObject({
      id: carla.userId,
      department: { id: contabil, name: 'Contábil' },
      isAdmin: false,
    });
    expect((await ana.get(`/tasks/${open.body.id}`)).body.department.id).toBe(contabil);
    expect((await ana.get(`/tasks/${closed.body.id}`)).body.department.id).toBe(fiscal);

    const departments = (await ana.get('/tasks/departments')).body;
    expect(departments.find((d: any) => d.id === contabil).members.map((m: any) => m.name)).toEqual(
      ['Bruno Carvalho', 'Carla Souza'],
    );
  });

  it('records who concluded and when (not the assignee), reopens to the previous status and derives overdue', async () => {
    const { ana, carla } = await office();
    const task = await ana.post('/tasks', {
      title: 'Balancete de setembro',
      assigneeId: ana.userId,
      dueDate: '2026-10-15',
    });
    expect(task.body).toMatchObject({
      status: 'todo',
      overdue: true,
      daysOverdue: 5,
      completedAt: null,
      completedBy: null,
    });
    await ana.patch(`/tasks/${task.body.id}/status`, { status: 'waiting_client' });

    process.env.EFFINANCE_NOW = '2026-10-20T14:32:00Z';
    const done = await carla.patch(`/tasks/${task.body.id}/status`, { status: 'done' });
    expect(done.status).toBe(200);
    expect(done.body.activated).toBeNull();
    expect(done.body.task).toMatchObject({
      status: 'done',
      overdue: false,
      daysOverdue: 0,
      reopenStatus: 'waiting_client',
      completedAt: '2026-10-20T14:32:00.000Z',
      completedBy: { id: carla.userId, name: 'Carla Souza' },
      assignee: { id: ana.userId },
    });

    // Concluding again (double click, retry) keeps the original record.
    process.env.EFFINANCE_NOW = '2026-10-21T09:00:00Z';
    const again = await ana.patch(`/tasks/${task.body.id}/status`, { status: 'done' });
    expect(again.body.task).toMatchObject({
      completedAt: '2026-10-20T14:32:00.000Z',
      completedBy: { id: carla.userId },
    });

    // Reopening clears it and goes back to where it was.
    const reopened = await ana.patch(`/tasks/${task.body.id}/status`, {
      status: again.body.task.reopenStatus,
    });
    expect(reopened.body.task).toMatchObject({
      status: 'waiting_client',
      completedAt: null,
      completedBy: null,
      overdue: true,
    });

    // Overdue is never stored: due today is not overdue; canceled never is.
    const today = await ana.post('/tasks', { title: 'Hoje', dueDate: '2026-10-20' });
    expect(today.body.overdue).toBe(false);
    const canceled = await ana.post('/tasks', {
      title: 'Cancelada',
      dueDate: '2026-10-01',
      status: 'canceled',
    });
    expect(canceled.body).toMatchObject({
      overdue: false,
      completedAt: null,
      reopenStatus: 'todo',
    });

    // The database refuses a "done" without its record.
    const broken = await withTenant(admin(), await workspaceOf(ana), (tx) =>
      tx
        .execute(
          sql`update tasks set completed_at = null where id = ${task.body.id} and status = 'waiting_client'`,
        )
        .then(() => tx.execute(sql`update tasks set status = 'done' where id = ${task.body.id}`)),
    ).catch((e: { cause?: { code?: string }; code?: string }) => e.cause?.code ?? e.code);
    expect(broken).toBe('23514');
  });

  it('validates references, dates and the appointment time', async () => {
    const { ana } = await office();
    expect(
      (await ana.post('/tasks', { title: 'x', startTime: '14:00', endTime: '15:00' })).status,
    ).toBe(400);
    const task = await ana.post('/tasks', {
      title: 'Reunião',
      dueDate: '2026-10-30',
      startTime: '14:00',
      endTime: '15:00',
    });
    expect(task.body).toMatchObject({ startTime: '14:00', endTime: '15:00' });
    // A PATCH is checked on the merged task.
    expect((await ana.patch(`/tasks/${task.body.id}`, { dueDate: null })).status).toBe(422);
    expect((await ana.patch(`/tasks/${task.body.id}`, { endTime: '13:00' })).status).toBe(422);
    expect((await ana.patch(`/tasks/${task.body.id}`, { startDate: '2026-11-01' })).status).toBe(
      422,
    );
    expect(
      (await ana.patch(`/tasks/${task.body.id}`, { startTime: null, endTime: null })).body
        .startTime,
    ).toBeNull();
    const supplier = await ana.post('/contacts', { name: 'Fornecedor' });
    expect((await ana.post('/tasks', { title: 'x', clientId: supplier.body.id })).status).toBe(404);
  });
});

describe('tasks: subtasks, comments and activity', () => {
  it('counts subtasks and comments, the author is the session member and the name survives them leaving', async () => {
    const { ana, carla } = await office();
    const task = await ana.post('/tasks', { title: 'Admissão', assigneeId: ana.userId });
    const id = task.body.id;
    const s1 = await ana.post(`/tasks/${id}/subtasks`, { title: 'Exame admissional' });
    await ana.post(`/tasks/${id}/subtasks`, { title: 'Contrato de trabalho' });
    await ana.patch(`/tasks/${id}/subtasks/${s1.body.id}`, { done: true });
    const comment = await carla.post(`/tasks/${id}/comments`, {
      text: 'Documentos <b>recebidos</b>.',
    });
    expect(comment.body).toMatchObject({
      author: { id: carla.userId, name: 'Carla Souza' },
      text: 'Documentos <b>recebidos</b>.',
      isYours: true,
    });
    await carla.patch(`/tasks/${id}/status`, { status: 'done' });

    const detail = (await ana.get(`/tasks/${id}`)).body;
    expect(detail.subtaskCount).toEqual({ done: 1, total: 2 });
    expect(detail.commentCount).toBe(1);
    expect(detail.subtasks.map((s: any) => [s.title, s.done])).toEqual([
      ['Exame admissional', true],
      ['Contrato de trabalho', false],
    ]);
    expect(detail.comments[0].isYours).toBe(false);

    // Ana sees Carla's comment in her activity; Carla does not see her own.
    const activity = (await ana.get('/tasks/activity')).body;
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({
      taskId: id,
      taskTitle: 'Admissão',
      author: { name: 'Carla Souza' },
    });
    expect((await carla.get('/tasks/activity')).body).toEqual([]);

    // Carla leaves the office: history keeps her name.
    expect((await ana.del(`/workspaces/current/members/${carla.userId}`)).status).toBe(204);
    const after = (await ana.get(`/tasks/${id}`)).body;
    expect(after.completedBy).toEqual({ id: carla.userId, name: 'Carla Souza' });
    expect(after.comments[0].author).toEqual({ id: carla.userId, name: 'Carla Souza' });
  });

  it('removing a member unassigns their tasks and drops their department and client responsibilities', async () => {
    const { ana, bruno, contabil } = await office();
    const client = await createClient(ana);
    const task = await ana.post('/tasks', {
      title: 'Balanço anual',
      assigneeId: bruno.userId,
      clientId: client,
    });
    expect(
      (
        await ana.put('/tasks/client-responsibles', {
          clientId: client,
          departmentId: contabil,
          userId: bruno.userId,
        })
      ).status,
    ).toBe(200);
    expect((await ana.del(`/workspaces/current/members/${bruno.userId}`)).status).toBe(204);
    const after = (await ana.get(`/tasks/${task.body.id}`)).body;
    expect(after.assignee).toBeNull();
    // The task stays in the department it was in.
    expect(after.department.id).toBe(contabil);
    expect((await ana.get('/tasks/client-responsibles')).body.items).toEqual([]);
    expect(
      (await ana.get('/tasks/departments')).body.find((d: any) => d.id === contabil).members,
    ).toEqual([]);
  });
});

describe('tasks: registries', () => {
  it('departments refuse duplicates and deletion while in use; categories delete freely', async () => {
    const { ana, carla, fiscal } = await office();
    expect((await ana.post('/tasks/departments', { name: 'fiscal' })).status).toBe(409);
    const blocked = await ana.del(`/tasks/departments/${fiscal}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.details).toMatchObject({ members: 2, tasks: 0 });
    expect(blocked.body.message).toBe(
      '2 membros ainda estão neste departamento. Mova-os antes de excluir.',
    );

    const pessoal = await ana.post('/tasks/departments', { name: 'Pessoal/DP' });
    expect((await ana.del(`/tasks/departments/${pessoal.body.id}`)).status).toBe(204);

    const cat = await ana.post('/tasks/categories', {
      name: 'Abertura',
      icon: 'building-2',
      color: '#0EA5E9',
    });
    expect(cat.body).toMatchObject({
      name: 'Abertura',
      icon: 'building-2',
      color: '#0EA5E9',
      taskCount: 0,
    });
    const task = await carla.post('/tasks', { title: 'Abrir filial', categoryId: cat.body.id });
    expect((await ana.get('/tasks/categories')).body[0].taskCount).toBe(1);
    expect((await ana.del(`/tasks/categories/${cat.body.id}`)).status).toBe(204);
    expect((await ana.get(`/tasks/${task.body.id}`)).body.category).toBeNull();
  });

  it('keeps one responsible per client and department, readable by everyone; a client with tasks is not deleted', async () => {
    const { ana, bruno, carla, fiscal, contabil } = await office();
    const client = await createClient(ana);
    expect(
      (
        await ana.put('/tasks/client-responsibles', {
          clientId: client,
          departmentId: fiscal,
          userId: carla.userId,
        })
      ).body,
    ).toMatchObject({
      clientId: client,
      departmentId: fiscal,
      user: { id: carla.userId, name: 'Carla Souza' },
    });
    await ana.put('/tasks/client-responsibles', {
      clientId: client,
      departmentId: fiscal,
      userId: ana.userId,
    });
    await ana.put('/tasks/client-responsibles', {
      clientId: client,
      departmentId: contabil,
      userId: bruno.userId,
    });
    const grid = (await carla.get('/tasks/client-responsibles')).body;
    expect(grid.departments.map((d: any) => d.name)).toEqual(['Contábil', 'Fiscal']);
    expect(grid.clients).toEqual([
      expect.objectContaining({ id: client, name: 'Pão Dourado', taxRegime: 'simples_nacional' }),
    ]);
    expect(grid.items).toHaveLength(2);
    expect(grid.items.find((i: any) => i.departmentId === fiscal).user.id).toBe(ana.userId);
    expect(
      (
        await ana.put('/tasks/client-responsibles', {
          clientId: client,
          departmentId: fiscal,
          userId: null,
        })
      ).status,
    ).toBe(204);
    const options = (await carla.get('/tasks/options')).body;
    expect(options.clientResponsibles).toEqual([
      {
        clientId: client,
        departmentId: contabil,
        user: { id: bruno.userId, name: 'Bruno Carvalho' },
      },
    ]);
    expect(options.me).toMatchObject({
      id: carla.userId,
      role: 'viewer',
      isAdmin: false,
      canWrite: true,
      department: { id: fiscal },
    });
    expect(options.members.map((m: any) => m.name)).toEqual([
      'Ana Paula Ribeiro',
      'Bruno Carvalho',
      'Carla Souza',
    ]);

    await carla.post('/tasks', { title: 'Parcelamento', clientId: client });
    const refused = await ana.del(`/clients/${client}`);
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/tarefas vinculadas/);
  });
});

describe('tasks: list, summary and start page', () => {
  async function seedList() {
    const o = await office();
    const client = await createClient(o.ana);
    const t = (body: Record<string, unknown>) => o.ana.post('/tasks', body).then((r) => r.body);
    await t({
      title: 'Atrasada antiga',
      assigneeId: o.ana.userId,
      dueDate: '2026-10-08',
      clientId: client,
      priority: 'urgent',
    });
    await t({ title: 'Atrasada recente', assigneeId: o.carla.userId, dueDate: '2026-10-18' });
    await t({ title: 'Vence hoje', assigneeId: o.ana.userId, dueDate: '2026-10-20' });
    await t({
      title: 'Próxima semana',
      assigneeId: o.bruno.userId,
      dueDate: '2026-10-26',
      status: 'waiting_client',
    });
    await t({ title: 'Mais tarde', assigneeId: o.ana.userId, dueDate: '2026-11-30' });
    await t({ title: 'Sem vencimento', assigneeId: o.carla.userId });
    process.env.EFFINANCE_NOW = '2026-10-10T12:00:00Z';
    await t({
      title: 'Feita no prazo',
      assigneeId: o.ana.userId,
      dueDate: '2026-10-12',
      status: 'done',
    });
    process.env.EFFINANCE_NOW = '2026-10-19T12:00:00Z';
    await t({
      title: 'Feita com atraso',
      assigneeId: o.carla.userId,
      dueDate: '2026-10-14',
      status: 'done',
    });
    delete process.env.EFFINANCE_NOW;
    await t({
      title: 'Cancelada',
      assigneeId: o.bruno.userId,
      dueDate: '2026-10-05',
      status: 'canceled',
    });
    return { ...o, client };
  }

  it('filters, groups and summarizes with the same filters (except the situation)', async () => {
    const { ana, carla, client, fiscal } = await seedList();
    const all = (await ana.get('/tasks?pageSize=50')).body;
    expect(all.total).toBe(9);
    expect(all.today).toBe('2026-10-20');
    expect(all.occurrences).toEqual([]);
    expect(all.summary).toMatchObject({
      month: '2026-10',
      overdue: 2,
      open: 6,
      dueToday: 1,
      dueNext7Days: 1,
      waitingClient: 1,
      monthDue: 7,
      monthDone: 3,
      oldestOverdue: {
        kind: 'task',
        title: 'Atrasada antiga',
        dueDate: '2026-10-08',
        daysOverdue: 12,
        client: { id: client, name: 'Pão Dourado' },
      },
    });
    expect(all.groups).toEqual({ overdue: 2, today: 1, next7Days: 1, later: 1, noDueDate: 1 });
    expect(all.byStatus).toMatchObject({
      todo: { count: 5, overdue: 2 },
      waiting_client: { count: 1 },
      done: { count: 2 },
      canceled: { count: 1 },
    });
    expect(all.months).toEqual(['2026-10', '2026-11']);
    // Due date first, then priority; no due date last.
    expect(all.items.map((x: any) => x.title).slice(0, 2)).toEqual([
      'Cancelada',
      'Atrasada antiga',
    ]);
    expect(all.items.at(-1).title).toBe('Sem vencimento');

    const overdue = (await ana.get('/tasks?situation=overdue')).body;
    expect(overdue.items.map((x: any) => x.title)).toEqual(['Atrasada antiga', 'Atrasada recente']);
    expect(overdue.summary.open).toBe(6); // the summary ignores the situation
    expect(overdue.groups).toEqual({ overdue: 2, today: 0, next7Days: 0, later: 0, noDueDate: 0 });

    const done = (await ana.get('/tasks?situation=done')).body;
    expect(done.items.map((x: any) => x.title)).toEqual([
      'Cancelada',
      'Feita com atraso',
      'Feita no prazo',
    ]);

    const mine = (await ana.get('/tasks?scope=mine&situation=open')).body;
    expect(mine.items.map((x: any) => x.title)).toEqual([
      'Atrasada antiga',
      'Vence hoje',
      'Mais tarde',
    ]);
    expect(mine.summary.openByClient).toEqual([
      { client: null, open: 2, overdue: 0 },
      { client: { id: client, name: 'Pão Dourado' }, open: 1, overdue: 1 },
    ]);

    const dept = (await carla.get('/tasks?scope=department&situation=open')).body;
    expect(dept.items.every((x: any) => x.department?.id === fiscal)).toBe(true);
    expect(dept.total).toBe(5);
    expect(
      dept.summary.openByAssignee.map((r: any) => [r.assignee.name, r.open, r.overdue]),
    ).toEqual([
      ['Ana Paula Ribeiro', 3, 1],
      ['Carla Souza', 2, 1],
    ]);

    const filtered = (await ana.get(`/tasks?clientId=${client}`)).body;
    expect(filtered.total).toBe(1);
    expect((await ana.get('/tasks?clientId=internal')).body.total).toBe(8);
    expect((await ana.get('/tasks?assigneeId=none')).body.total).toBe(0);
    expect((await ana.get('/tasks?priority=urgent')).body.total).toBe(1);
    expect((await ana.get('/tasks?search=atrasada')).body.total).toBe(2);
    expect((await ana.get('/tasks?month=2026-11')).body.items.map((x: any) => x.title)).toEqual([
      'Mais tarde',
    ]);
    expect((await ana.get('/tasks?dueDate=2026-10-20')).body.total).toBe(1);
    expect(
      (await ana.get('/tasks?dueBucket=next7Days')).body.items.map((x: any) => x.title),
    ).toEqual(['Próxima semana']);
    expect((await ana.get('/tasks?kind=recurring')).body.total).toBe(0);
    // The board shows concluded tasks of the last days only.
    const board = (await ana.get('/tasks?closedFrom=2026-10-15&pageSize=50')).body;
    expect(board.items.map((x: any) => x.title)).not.toContain('Feita no prazo');
    expect(board.byStatus.done.count).toBe(1);
    // Pagination.
    const page2 = (await ana.get('/tasks?pageSize=4&page=2')).body;
    expect(page2).toMatchObject({ total: 9, page: 2, pageSize: 4 });
    expect(page2.items).toHaveLength(4);
  });

  it('the start page counts the department (members) or any/all departments (administrators)', async () => {
    const { ana, carla, fiscal, contabil, client } = await seedList();
    const home = (await carla.get('/tasks/home')).body;
    expect(home).toMatchObject({
      view: 'department',
      department: { id: fiscal, name: 'Fiscal' },
      month: '2026-10',
    });
    expect(home.totals).toMatchObject({
      total: 7,
      open: 5,
      overdue: 2,
      dueToday: 1,
      doneOnTime: 1,
      doneLate: 1,
      canceled: 0,
      standalone: 7,
      recurring: 0,
      byStatus: { todo: 5, in_progress: 0, waiting_client: 0, done: 2, canceled: 0 },
    });
    const ranking = home.byAssignee.map((r: any) => [
      r.assignee.name,
      r.overdue,
      r.open,
      r.doneOnTime,
      r.doneLate,
    ]);
    expect(ranking).toEqual([
      ['Ana Paula Ribeiro', 1, 2, 1, 0],
      ['Carla Souza', 1, 1, 0, 1],
    ]);
    expect(home.byClient).toEqual([
      { client: null, total: 6, open: 4, overdue: 1 },
      { client: { id: client, name: 'Pão Dourado' }, total: 1, open: 1, overdue: 1 },
    ]);
    expect(home.mine).toMatchObject({ open: 2, overdue: 1, dueToday: 0, occurrences: [] });
    expect(home.mine.tasks.map((x: any) => x.title)).toEqual([
      'Atrasada recente',
      'Sem vencimento',
    ]);

    expect((await carla.get(`/tasks/home?departmentId=${contabil}`)).status).toBe(403);
    expect((await carla.get(`/tasks/home?departmentId=${fiscal}`)).status).toBe(200);
    const contabilHome = (await ana.get(`/tasks/home?departmentId=${contabil}`)).body;
    expect(contabilHome.totals).toMatchObject({ total: 2, open: 1, canceled: 1 });
    const allHome = (await ana.get('/tasks/home?departmentId=all')).body;
    expect(allHome).toMatchObject({ view: 'all', department: null });
    expect(allHome.totals.total).toBe(9);
    // November: only what is open or due/closed in it.
    expect((await ana.get('/tasks/home?departmentId=all&month=2026-11')).body.totals.total).toBe(6);
  });
});
