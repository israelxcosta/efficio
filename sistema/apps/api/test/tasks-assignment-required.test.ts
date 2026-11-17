// Every task has a responsible and a department (owner's rule, migration 0024): creating and editing
// tasks, registry recurring tasks and their occurrences, process steps, removing a member who still
// answers for work, and the migration that filled the existing rows. Today is pinned to 2026-10-20.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { executeRows } from '../src/lib/sql';
import { admin, createTestApp, registerUser, resetDb, TEST_PASSWORD } from './helpers';
import { createClient, member, office, workspaceOf } from './task-helpers';

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
const paths = (body: { details?: { path: string }[] }) => (body.details ?? []).map((d) => d.path);

describe('standalone tasks: responsible and department are required', () => {
  it('refuses a task without responsible or without department (400 on the field)', async () => {
    const { ana, bruno, fiscal, pessoal } = await office(app);
    const outsider = await member(app, ana, 'viewer', 'Davi Lima'); // no department

    for (const assigneeId of [undefined, null, '']) {
      const res = await ana.post('/tasks', { title: 'Sem responsável', assigneeId });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'validation_error', message: 'Escolha o responsável' });
      expect(paths(res.body)).toEqual(['assigneeId']);
    }
    // A responsible without department: the department must be chosen.
    const noDepartment = await ana.post('/tasks', { title: 'Sem departamento', assigneeId: outsider.userId });
    expect(noDepartment.status).toBe(400);
    expect(noDepartment.body).toMatchObject({ error: 'validation_error', message: 'Escolha o departamento' });
    expect(paths(noDepartment.body)).toEqual(['departmentId']);

    const chosen = await ana.post('/tasks', { title: 'Com departamento', assigneeId: outsider.userId, departmentId: pessoal });
    expect(chosen.status, JSON.stringify(chosen.body)).toBe(201);
    expect(chosen.body).toMatchObject({ assignee: { id: outsider.userId }, department: { id: pessoal } });
    // A responsible in a department brings it (a different one sent along is ignored).
    const follows = await ana.post('/tasks', { title: 'Segue o responsável', assigneeId: bruno.userId, departmentId: fiscal });
    expect(follows.body.department).toEqual({ id: pessoal, name: 'Pessoal' });
    // `none` is no longer a filter of the list.
    expect((await ana.get('/tasks?assigneeId=none')).status).toBe(400);
  });

  it('never removes them afterwards; a new responsible brings their department', async () => {
    const { ana, bruno, carla, fiscal, pessoal } = await office(app);
    const outsider = await member(app, ana, 'viewer', 'Davi Lima');
    const task = (await ana.post('/tasks', { title: 'Apuração', assigneeId: carla.userId })).body;
    expect(task.department.id).toBe(fiscal);

    for (const patch of [{ assigneeId: null }, { departmentId: null }, { assigneeId: '' }]) {
      const res = await ana.patch(`/tasks/${task.id}`, patch);
      expect(res.status, JSON.stringify(patch)).toBe(400);
    }
    expect((await ana.patch(`/tasks/${task.id}`, { assigneeId: bruno.userId })).body.department.id).toBe(pessoal);
    // A responsible without department keeps the current department; it can then be chosen.
    expect((await ana.patch(`/tasks/${task.id}`, { assigneeId: outsider.userId })).body).toMatchObject({
      assignee: { id: outsider.userId },
      department: { id: pessoal },
    });
    expect((await ana.patch(`/tasks/${task.id}`, { departmentId: fiscal })).body.department.id).toBe(fiscal);

    // Summary: no "Sem responsável"/"Sem departamento" rows.
    const summary = (await ana.get('/tasks')).body.summary;
    expect(summary.openByAssignee.every((r: { assignee: unknown }) => r.assignee !== null)).toBe(true);
    expect(summary.openByDepartment.every((r: { department: unknown }) => r.department !== null)).toBe(true);
  });
});

describe('recurring tasks: department and default responsible are required', () => {
  it('refuses a recurring task without them; occurrences go to the default responsible', async () => {
    const { ana, bruno, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    const client = await createClient(ana, { tradeName: 'Padaria' });
    const base = { name: 'DAS', dueDay: 20, regimes: ['simples_nacional'] };

    const noDepartment = await ana.post('/tasks/recurring', { ...base, assigneeId: bruno.userId });
    expect(noDepartment.status).toBe(400);
    expect(paths(noDepartment.body)).toEqual(['departmentId']);
    const noAssignee = await ana.post('/tasks/recurring', { ...base, departmentId: fiscal, assigneeId: null });
    expect(noAssignee.status).toBe(400);
    expect(noAssignee.body.message).toBe('Escolha o responsável padrão');

    // Bruno (Pessoal) answers for a Fiscal recurring task: the occurrence stays in Fiscal, with him.
    const created = await ana.post('/tasks/recurring', { ...base, departmentId: fiscal, assigneeId: bruno.userId });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({ department: { id: fiscal }, assignee: { id: bruno.userId } });
    const occurrences = await rows<{ client_id: string; assignee_id: string; assignee_source: string; department_id: string }>(
      sql`select client_id, assignee_id, assignee_source, department_id from tasks
           where workspace_id = ${ws} and recurring_task_id = ${created.body.id} and competence = '2026-10'`,
    );
    expect(occurrences).toEqual([{ client_id: client, assignee_id: bruno.userId, assignee_source: 'default', department_id: fiscal }]);
  });

  it('a regime group needs a department and a default responsible too (who applies, by default)', async () => {
    const ana = await registerUser(app, 'Ana Sozinha'); // an office without departments yet
    const applied = await ana.post('/tasks/regime-groups/mei/apply', {});
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    expect(applied.body.departmentsCreated.length).toBeGreaterThan(0);
    const list = (await ana.get('/tasks/recurring')).body.items as { department: unknown; assignee: { id: string } }[];
    expect(list.length).toBeGreaterThan(0);
    for (const r of list) expect(r).toMatchObject({ department: expect.any(Object), assignee: { id: ana.userId } });
  });
});

describe('processes: every step gets a responsible and a department', () => {
  it('a step without responsible goes to who creates the process, in the step department', async () => {
    const { ana, bruno, carla, fiscal, pessoal } = await office(app);
    const made = await carla.post('/tasks/flows', {
      title: 'Admissão',
      steps: [{ title: 'Documentos', departmentId: pessoal }, { title: 'Contrato', assigneeId: bruno.userId }, { title: 'Conferência' }],
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.body.task).toMatchObject({ assignee: { id: carla.userId }, department: { id: pessoal } });
    expect(made.body.flow.steps.map((s: { assignee: { id: string }; department: { id: string } }) => [s.assignee.id, s.department.id])).toEqual([
      [carla.userId, pessoal],
      [bruno.userId, pessoal],
      [carla.userId, fiscal],
    ]);
    const next = await carla.patch(`/tasks/${made.body.task.id}/status`, { status: 'done' });
    expect(next.body.activated).toMatchObject({ assignee: { id: bruno.userId }, department: { id: pessoal } });

    // A creator without department and a step without one: 400 on the step.
    const outsider = await member(app, ana, 'viewer', 'Davi Lima');
    const refused = await outsider.post('/tasks/flows', { title: 'X', steps: [{ title: 'Etapa' }] });
    expect(refused.status).toBe(400);
    expect(paths(refused.body)).toEqual(['steps.0.departmentId']);
  });
});

describe('removing a member who still answers for work', () => {
  it('asks for a replacement (409) and hands everything over to them', async () => {
    const { ana, bruno, carla, fiscal } = await office(app);
    const task = (await ana.post('/tasks', { title: 'Folha', assigneeId: bruno.userId })).body;
    const done = (await ana.post('/tasks', { title: 'Antiga', assigneeId: bruno.userId, status: 'done' })).body;
    const recurring = (await ana.post('/tasks/recurring', { name: 'FGTS', dueDay: 20, regimes: ['simples_nacional'], departmentId: fiscal, assigneeId: bruno.userId })).body;

    const refused = await ana.del(`/workspaces/current/members/${bruno.userId}`);
    expect(refused.status).toBe(409);
    expect(refused.body.details).toEqual({ openTasks: 1, recurringTasks: 1, flowSteps: 0 });
    expect(refused.body.message).toMatch(/^Bruno Carvalho ainda é responsável por 1 tarefa aberta e 1 tarefa recorrente\./);
    expect((await ana.del(`/workspaces/current/members/${bruno.userId}?replacementId=${bruno.userId}`)).status).toBe(422);

    expect((await ana.del(`/workspaces/current/members/${bruno.userId}?replacementId=${carla.userId}`)).status).toBe(204);
    const moved = (await ana.get(`/tasks/${task.id}`)).body;
    expect(moved).toMatchObject({ assignee: { id: carla.userId }, department: { id: fiscal } });
    expect((await ana.get(`/tasks/${task.id}/history`)).body.items[0]).toMatchObject({
      kind: 'assigned',
      toAssignee: { id: carla.userId },
      note: 'Reatribuída porque Bruno Carvalho saiu do espaço',
    });
    expect((await ana.get(`/tasks/recurring/${recurring.id}`)).body.assignee.id).toBe(carla.userId);
    // The concluded task keeps the history: the responsible who left is cleared by the foreign key.
    expect((await ana.get(`/tasks/${done.id}`)).body.assignee).toBeNull();
    // Reopening it gives it to who reopens.
    const reopened = await ana.patch(`/tasks/${done.id}/status`, { status: 'todo' });
    expect(reopened.body.task.assignee.id).toBe(ana.userId);
  });

  it('account deletion hands the open work to the owner of each office', async () => {
    const { ana, carla } = await office(app);
    const task = (await ana.post('/tasks', { title: 'Conferir', assigneeId: carla.userId })).body;
    expect((await carla.del('/auth/me', { password: TEST_PASSWORD })).status).toBeLessThan(300);
    expect((await ana.get(`/tasks/${task.id}`)).body.assignee.id).toBe(ana.userId);
  });
});

describe('migration 0024 fills the existing rows', () => {
  it('open tasks get a responsible, every task and recurring task a department', async () => {
    const ana = await registerUser(app, 'Ana Antiga'); // no departments: "Geral" is created
    const ws = await workspaceOf(ana);
    const office2 = await office(app);
    const ws2 = await workspaceOf(office2.ana);
    const open = (await ana.post('/tasks/flows', { title: 'P', steps: [{ title: 'E', departmentId: (await ana.post('/tasks/departments', { name: 'Tmp' })).body.id }] })).body.task;
    const closed = (await office2.ana.post('/tasks', { title: 'Feita', assigneeId: office2.carla.userId, status: 'done' })).body;
    const queued = (await office2.ana.post('/tasks', { title: 'Fila', assigneeId: office2.carla.userId })).body;
    const recurring = (await office2.ana.post('/tasks/recurring', { name: 'DAS', dueDay: 20, regimes: ['mei'], departmentId: office2.pessoal, assigneeId: office2.bruno.userId })).body;

    const migration = await readFile(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle/0024_task_assignment_required.sql'),
      'utf8',
    );
    const db = admin();
    // Rolled back at the end: the old shape (nullable, no CHECK) with empty values, then the migration.
    await db
      .transaction(async (tx) => {
        for (const ddl of [
          'alter table tasks drop constraint tasks_open_assignee_chk',
          'alter table tasks alter column department_id drop not null',
          'alter table recurring_tasks alter column department_id drop not null',
          'alter table recurring_tasks alter column default_assignee_id drop not null',
        ])
          await tx.execute(sql.raw(ddl));
        await tx.execute(sql`update tasks set department_id = null, assignee_id = null where id = ${open.id}`);
        await tx.execute(sql`delete from task_department_members where workspace_id = ${ws}`);
        await tx.execute(sql`update tasks set department_id = null where workspace_id = ${ws}`);
        await tx.execute(sql`delete from task_departments where workspace_id = ${ws}`);
        await tx.execute(sql`update tasks set assignee_id = null, department_id = null where id in (${closed.id}, ${queued.id})`);
        await tx.execute(sql`update recurring_tasks set default_assignee_id = null, department_id = null where id = ${recurring.id}`);
        await tx.execute(sql`update tasks set assignee_id = null, assignee_source = null where recurring_task_id = ${recurring.id}`);
        for (const statement of migration.split('--> statement-breakpoint')) await tx.execute(sql.raw(statement));

        const [general] = await executeRows<{ id: string }>(tx, sql`select id from task_departments where workspace_id = ${ws} and name = 'Geral'`);
        expect(general).toBeDefined();
        const [o] = await executeRows<{ assignee_id: string; department_id: string }>(tx, sql`select assignee_id, department_id from tasks where id = ${open.id}`);
        expect(o).toEqual({ assignee_id: ana.userId, department_id: general!.id });
        const byId = await executeRows<{ id: string; assignee_id: string | null; department_id: string }>(
          tx,
          sql`select id, assignee_id, department_id from tasks where id in (${closed.id}, ${queued.id})`,
        );
        const [ownerOf2] = await executeRows<{ user_id: string }>(tx, sql`select user_id from workspace_members where workspace_id = ${ws2} and role = 'owner'`);
        // Open: the owner (Ana, Fiscal) and her department; concluded: history, no responsible, "Geral".
        expect(byId.find((r) => r.id === queued.id)).toMatchObject({ assignee_id: ownerOf2!.user_id, department_id: office2.fiscal });
        const [general2] = await executeRows<{ id: string }>(tx, sql`select id from task_departments where workspace_id = ${ws2} and name = 'Geral'`);
        expect(byId.find((r) => r.id === closed.id)).toMatchObject({ assignee_id: null, department_id: general2!.id });
        const [r] = await executeRows<{ default_assignee_id: string; department_id: string }>(
          tx,
          sql`select default_assignee_id, department_id from recurring_tasks where id = ${recurring.id}`,
        );
        expect(r).toEqual({ default_assignee_id: ownerOf2!.user_id, department_id: office2.fiscal });
        const [left] = await executeRows<{ n: number }>(
          tx,
          sql`select count(*)::int as n from tasks where workspace_id in (${ws}, ${ws2}) and (department_id is null or (assignee_id is null and status in ('todo', 'in_progress', 'waiting_client')))`,
        );
        expect(left!.n).toBe(0);
        throw new Rollback();
      })
      .catch((e: unknown) => {
        if (!(e instanceof Rollback)) throw e;
      });
  });
});

class Rollback extends Error {}
