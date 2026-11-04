// Regression tests of the database review of phases 2 and 3 (migration 0016):
// - LGPD: the assignees named inside the history (`task_events.data`) are pseudonymized when the account
//   is deleted — in every workspace, also one the person had left — while leaving keeps the name; the
//   backfill handles rows written before 0016 (accounts already deleted, malformed ids) and re-runs;
// - the contract template mirrors the contract in the database (types, rules, 20 000/400 000 characters);
// - the calendar and "quem viu" read through their indexes (no scan of every occurrence / the audit trail).

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CONTRACT_BLOCK_RULES, CONTRACT_BLOCK_TYPES } from '@effinance/shared';
import type { App } from '../src/app';
import { executeRows } from '../src/lib/sql';
import { withTenant } from '../src/lib/tenant';
import { admin, createTestApp, registerUser, resetDb, TEST_PASSWORD } from './helpers';
import { createClient, office, workspaceOf } from './task-helpers';

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
const DELETED = { id: null, name: 'Usuário excluído' };

async function failure(promise: Promise<unknown>): Promise<{ code?: string } | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return ((error as { cause?: unknown }).cause ?? error) as { code?: string };
  }
}

type AssignedRow = { data: { fromAssignee: unknown; toAssignee: unknown }; from: string | null; to: string | null };
const assignedEvents = (taskId: string) =>
  rows<AssignedRow>(sql`select data, from_assignee_id as "from", to_assignee_id as "to" from task_events where task_id = ${taskId} and kind = 'assigned' order by seq`);

async function runMigration0016() {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle/0016_phase23_db_review.sql');
  const source = await readFile(file, 'utf8');
  await admin().transaction(async (tx) => {
    for (const statement of source.split('--> statement-breakpoint')) if (statement.trim()) await tx.execute(sql.raw(statement));
  });
}

describe('LGPD: assignees named in the history', () => {
  it('deleting the account pseudonymizes the name in every workspace; leaving keeps it', async () => {
    const a = await office(app);
    // Office A: a task goes from Carla to Bruno.
    const taskA = await a.ana.post('/tasks', { title: 'Conferir guias', assigneeId: a.carla.userId });
    expect(taskA.status).toBe(201);
    expect((await a.ana.patch(`/tasks/${taskA.body.id}`, { assigneeId: a.bruno.userId })).status).toBe(200);
    const [before] = await assignedEvents(taskA.body.id);
    expect(before).toEqual({
      data: { fromAssignee: { id: a.carla.userId, name: 'Carla Souza' }, toAssignee: { id: a.bruno.userId, name: 'Bruno Carvalho' } },
      from: a.carla.userId,
      to: a.bruno.userId,
    });

    // Office B: Carla joins, gets a task that moves to the owner, and is removed (she left B).
    const owner = await registerUser(app, 'Dona do B');
    const invite = await owner.post('/workspaces/current/invites', { email: a.carla.email, role: 'editor' });
    expect((await a.carla.post(`/invites/${invite.body.inviteUrl.split('/convite/')[1]}/accept`)).status).toBe(200);
    const taskB = await owner.post('/tasks', { title: 'Folha', assigneeId: a.carla.userId });
    expect(taskB.status).toBe(201);
    expect((await owner.patch(`/tasks/${taskB.body.id}`, { assigneeId: owner.userId })).status).toBe(200);
    // Back to A (her session would point to a workspace she no longer belongs to), then she is removed from B.
    expect((await a.carla.post('/auth/switch-workspace', { workspaceId: await workspaceOf(a.ana) })).status).toBe(200);
    expect((await owner.del(`/workspaces/current/members/${a.carla.userId}`)).status).toBe(204);
    const [left] = await assignedEvents(taskB.body.id);
    expect(left!.data.fromAssignee).toEqual({ id: a.carla.userId, name: 'Carla Souza' }); // leaving keeps the name

    expect((await a.carla.del('/auth/me', { password: TEST_PASSWORD })).status).toBe(204);
    const [afterA] = await assignedEvents(taskA.body.id);
    expect(afterA).toEqual({
      data: { fromAssignee: DELETED, toAssignee: { id: a.bruno.userId, name: 'Bruno Carvalho' } },
      from: null,
      to: a.bruno.userId,
    });
    const [afterB] = await assignedEvents(taskB.body.id);
    expect(afterB!.data.fromAssignee).toEqual(DELETED);
    expect(afterB!.from).toBeNull();
    // No event of any workspace keeps her name.
    const [named] = await rows<{ n: number }>(sql`select count(*)::int as n from task_events where data::text like '%Carla Souza%' or data::text like ${`%${a.carla.userId}%`}`);
    expect(named!.n).toBe(0);
    // The timeline shows "Usuário excluído".
    const history = await a.ana.get(`/tasks/${taskA.body.id}/history`);
    expect(history.status).toBe(200);
    const assigned = history.body.items.find((i: { kind: string }) => i.kind === 'assigned');
    expect(assigned.fromAssignee).toEqual(DELETED);
    expect(assigned.toAssignee.name).toBe('Bruno Carvalho');
  });

  it('the backfill pseudonymizes rows written before 0016 and re-runs without changes', async () => {
    const a = await office(app);
    const ws = await workspaceOf(a.ana);
    const task = await a.ana.post('/tasks', { title: 'Legada' });
    const gone = randomUUID();
    const legacy = [
      { fromAssignee: { id: gone, name: 'Conta Já Excluída' }, toAssignee: { id: a.bruno.userId, name: 'Bruno Carvalho' } },
      { fromAssignee: null, toAssignee: { id: 'não-é-uuid', name: 'Nome Solto' } },
    ];
    // Rows as 0014 wrote them: no id columns (triggers and foreign keys off for the legacy insert).
    await admin().transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = replica`);
      for (const data of legacy) {
        await tx.execute(sql`insert into task_events (workspace_id, task_id, kind, data) values (${ws}, ${task.body.id}, 'assigned', ${JSON.stringify(data)}::jsonb)`);
      }
    });
    await runMigration0016();
    const after = await assignedEvents(task.body.id);
    expect(after).toEqual([
      { data: { fromAssignee: DELETED, toAssignee: { id: a.bruno.userId, name: 'Bruno Carvalho' } }, from: null, to: a.bruno.userId },
      { data: { fromAssignee: null, toAssignee: DELETED }, from: null, to: null },
    ]);
    const versions = () => rows<{ xmin: string }>(sql`select string_agg(xmin::text, ',' order by seq) as xmin from task_events where task_id = ${task.body.id}`);
    const [first] = await versions();
    await runMigration0016();
    expect(await assignedEvents(task.body.id)).toEqual(after);
    // Nothing was rewritten the second time.
    const [second] = await versions();
    expect(second!.xmin).toBe(first!.xmin);
  });
});

describe('contract template mirrors the contract', () => {
  const block = (text: string, extra: Record<string, unknown> = {}) => ({ type: 'paragraph', text, ...extra });

  it('the database refuses what the contract refuses', async () => {
    const a = await office(app);
    const ws = await workspaceOf(a.ana);
    expect((await a.ana.put('/office/contract-template', { blocks: [block('Cláusula')] })).status).toBe(200);
    const bad: [string, unknown][] = [
      ['block over 20 000', [block('x'.repeat(20_001))]],
      ['total over 400 000', Array.from({ length: 21 }, () => block('x'.repeat(20_000)))],
      ['unknown type', [{ type: 'script', text: 'x' }]],
      ['type missing', [{ text: 'x' }]],
      ['unknown rule', [block('x', { rule: 'always' })]],
      ['extra key', [block('x', { html: '<b>x</b>' })]],
      ['text not a string', [{ type: 'paragraph', text: 42 }]],
      ['element not an object', ['texto solto']],
    ];
    for (const [label, blocks] of bad) {
      const f = await failure(
        withTenant(app.db, ws, (tx) => tx.execute(sql`update offices set contract_blocks = ${JSON.stringify(blocks)}::jsonb where workspace_id = ${ws}`)),
      );
      expect(f?.code, label).toBe('23514');
    }
  });

  it('the database accepts every type and rule of the contract, at the limits', async () => {
    const a = await office(app);
    const ws = await workspaceOf(a.ana);
    expect((await a.ana.put('/office/contract-template', { watermarkEnabled: false })).status).toBe(200);
    const all = [...CONTRACT_BLOCK_TYPES.map((type) => ({ type, text: 'x' })), ...CONTRACT_BLOCK_RULES.map((rule) => block('x', { rule })), { type: 'spacer' }];
    const atLimit = Array.from({ length: 20 }, () => block('ç'.repeat(20_000)));
    for (const blocks of [all, atLimit]) {
      // As the tenant role (effinance_app needs EXECUTE on the function the CHECK calls).
      await withTenant(app.db, ws, (tx) => tx.execute(sql`update offices set contract_blocks = ${JSON.stringify(blocks)}::jsonb where workspace_id = ${ws}`));
    }
    // The API keeps working: a custom template, then back to the factory one.
    expect((await a.ana.put('/office/contract-template', { blocks: all })).status).toBe(200);
    expect((await a.ana.post('/office/contract-template/reset', {})).status).toBe(200);
  });
});

describe('heavy reads use their indexes', () => {
  const plan = async (statement: ReturnType<typeof sql>, role: 'tenant' | 'api', ws: string) =>
    admin().transaction(async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`);
      if (role === 'tenant') await tx.execute(sql`select set_config('role', 'effinance_app', true), set_config('app.workspace_id', ${ws}, true)`);
      else await tx.execute(sql`set local role effinance_api_test`);
      const out = await executeRows<{ 'QUERY PLAN': string }>(tx, sql`explain ${statement}`);
      return out.map((r) => r['QUERY PLAN']).join('\n');
    });

  it('calendar occurrences by target date and the reveals of one client', async () => {
    const a = await office(app);
    const ws = await workspaceOf(a.ana);
    // Some history: one recurring task, three clients, 25 years of monthly occurrences.
    const clients = await Promise.all([1, 2, 3].map((n) => createClient(a.ana, { tradeName: `Cliente ${n}` })));
    const recurring = await a.ana.post('/tasks/recurring', { name: 'DAS', departmentId: a.fiscal, dueDay: 20, clientIds: clients });
    expect(recurring.status).toBe(201);
    await admin().execute(sql`
      insert into tasks (workspace_id, title, client_id, recurring_task_id, competence, period_key, reference_month, due_date, target_date, created_by_name)
      select ${ws}, 'DAS', c.id, ${recurring.body.id}, to_char(m, 'YYYY-MM'), to_char(m, 'YYYY-MM'), to_char(m, 'YYYY-MM'), (m + interval '19 days')::date, (m + interval '14 days')::date, 'Tarefa recorrente'
        from unnest(${sql.raw(`array[${clients.map((c) => `'${c}'`).join(',')}]::uuid[]`)}) as c(id),
             generate_series(date '2000-01-01', date '2024-12-01', interval '1 month') as m`);
    await admin().execute(sql`analyze tasks`);
    const calendar = await plan(
      sql`select recurring_task_id, period_key, count(*) from tasks where workspace_id = ${ws} and recurring_task_id is not null and target_date >= '2026-10-01' and target_date <= '2026-10-31' group by 1, 2`,
      'tenant',
      ws,
    );
    expect(calendar).toMatch(/tasks_occurrence_target_idx/);
    expect(calendar).toMatch(/Index Cond: .*target_date >=/);
    const views = await plan(
      sql`select metadata, created_at from audit_logs where workspace_id = ${ws} and action = ${'client.credential_revealed'} and entity_id = ${randomUUID()} order by created_at desc limit 50`,
      'api',
      ws,
    );
    expect(views).toMatch(/audit_logs_entity_idx/);
  });
});
