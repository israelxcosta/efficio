// Database review of the task module, phase 2 (migration 0014): Row Level Security on every new
// table, composite foreign keys that never cross workspaces, ON DELETE behaviour, CHECKs (schedule,
// occurrence shape, ciphertext only, attachment size), LGPD (recorded names replaced when the account
// goes; export decrypted, attachments without content, only the requester's notes) and re-running the
// migration over existing rows.

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ASSIGNEE_SOURCES,
  NON_BUSINESS_DAY_RULES,
  RECURRENCE_PERIODS,
  TASK_ATTACHMENT_CONTENT_TYPES,
  TASK_EVENT_KINDS,
} from '@effinance/shared';
import type { App } from '../src/app';
import { executeRows } from '../src/lib/sql';
import { withTenant } from '../src/lib/tenant';
import { admin, createTestApp, resetDb, TEST_PASSWORD } from './helpers';
import { createClient, office, PDF_BASE64, workspaceOf } from './task-helpers';

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

const PHASE2_TABLES = [
  'recurring_tasks',
  'recurring_task_clients',
  'task_flow_templates',
  'task_flow_template_steps',
  'task_flows',
  'task_flow_steps',
  'task_events',
  'task_attachments',
  'task_notes',
] as const;

const rows = <T>(query: ReturnType<typeof sql>) => executeRows<T>(admin(), query);
const CIPHERTEXT_SHAPED = `v1.${'A'.repeat(16)}.${'B'.repeat(23)}`;

async function failure(promise: Promise<unknown>): Promise<{ code?: string } | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return ((error as { cause?: unknown }).cause ?? error) as { code?: string };
  }
}

/** An office with one row in every phase 2 table, written through the API. */
async function seed() {
  const o = await office(app);
  const { ana, carla, fiscal } = o;
  const ws = await workspaceOf(ana);
  const client = await createClient(ana, { tradeName: 'Padaria' });
  const category = (await ana.post('/tasks/categories', { name: 'Impostos' })).body.id;
  const recurring = (await ana.post('/tasks/recurring', { name: 'DAS', description: 'Guia', departmentId: fiscal, categoryId: category, assigneeId: carla.userId, dueDay: 20, clientIds: [client] })).body;
  const template = (await ana.post('/tasks/flow-templates', { title: 'Abertura', description: 'Roteiro', steps: [{ title: 'Documentos', description: 'RG', assigneeId: carla.userId, categoryId: category, departmentId: fiscal }] })).body;
  const applied = (await carla.post(`/tasks/flow-templates/${template.id}/apply`, { clientId: client })).body;
  const attachment = (await carla.post(`/tasks/${applied.task.id}/attachments`, { fileName: 'rg.pdf', contentType: 'application/pdf', content: PDF_BASE64 })).body;
  const note = (await carla.post('/tasks/notes', { title: 'Minha nota', content: 'Texto' })).body;
  return { ...o, ws, client, category, recurring, template, applied, attachment, note };
}

describe('phase 2 tables: tenancy', () => {
  it('every new table fails closed without a workspace and shows only the active one', async () => {
    const a = await seed();
    const b = await seed();
    for (const table of PHASE2_TABLES) {
      const all = await rows<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(table)} where workspace_id = ${a.ws}`);
      expect(all[0]!.n, table).toBeGreaterThan(0);
    }
    const seen = await app.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('role', 'effinance_app', true), set_config('app.workspace_id', '', true)`);
      const out: Record<string, number> = {};
      for (const table of PHASE2_TABLES) {
        out[table] = (await executeRows<{ n: number }>(tx, sql`select count(*)::int as n from ${sql.identifier(table)}`))[0]!.n;
      }
      return out;
    });
    expect(Object.values(seen).every((n) => n === 0)).toBe(true);
    const visible = await withTenant(app.db, a.ws, async (tx) => {
      const out: string[] = [];
      for (const table of PHASE2_TABLES) {
        const r = await executeRows<{ ws: string }>(tx, sql`select distinct workspace_id::text as ws from ${sql.identifier(table)}`);
        out.push(...r.map((x) => x.ws));
      }
      return new Set(out);
    });
    expect([...visible]).toEqual([a.ws]);
    void b;
  });

  it('references never cross workspaces (refused like unknown ids)', async () => {
    const a = await seed();
    const b = await seed();
    const attempts: [string, ReturnType<typeof sql>][] = [
      ['recurring → foreign department', sql`insert into recurring_tasks (workspace_id, name, department_id, due_day, start_competence, created_by_name) values (${b.ws}, 'X', ${a.fiscal}, 10, '2026-10', 'B')`],
      ['recurring → foreign category', sql`insert into recurring_tasks (workspace_id, name, category_id, due_day, start_competence, created_by_name) values (${b.ws}, 'X', ${a.category}, 10, '2026-10', 'B')`],
      ['recurring → foreign member', sql`insert into recurring_tasks (workspace_id, name, default_assignee_id, due_day, start_competence, created_by_name) values (${b.ws}, 'X', ${a.carla.userId}, 10, '2026-10', 'B')`],
      ['link → foreign client', sql`insert into recurring_task_clients (workspace_id, recurring_task_id, client_id, mode) values (${b.ws}, ${b.recurring.id}, ${a.client}, 'include')`],
      ['occurrence → foreign recurring', sql`update tasks set recurring_task_id = ${a.recurring.id} where workspace_id = ${b.ws} and recurring_task_id = ${b.recurring.id}`],
      ['step → foreign task', sql`update task_flow_steps set task_id = ${a.applied.task.id} where workspace_id = ${b.ws}`],
      ['event → foreign task', sql`insert into task_events (workspace_id, task_id, kind) values (${b.ws}, ${a.applied.task.id}, 'commented')`],
      ['note → foreign member', sql`insert into task_notes (workspace_id, user_id, title) values (${b.ws}, ${a.carla.userId}, ${CIPHERTEXT_SHAPED})`],
      ['flow → foreign template', sql`update task_flows set template_id = ${a.template.id} where workspace_id = ${b.ws}`],
    ];
    for (const [label, statement] of attempts) {
      const f = await failure(withTenant(app.db, b.ws, (tx) => tx.execute(statement)));
      expect(f?.code, label).toBe('23503');
    }
  });
});

describe('phase 2 tables: integrity', () => {
  it('enumerations follow the contract (a new value needs a migration)', async () => {
    const defs = await rows<{ name: string; def: string }>(sql`
      select conname as name, pg_get_constraintdef(oid) as def from pg_constraint where contype = 'c' and connamespace = 'public'::regnamespace`);
    const values = (name: string) => [...defs.find((d) => d.name === name)!.def.matchAll(/'([^']*)'::text/g)].map((m) => m[1]).sort();
    const sorted = (list: readonly string[]) => [...list].sort();
    expect(values('recurring_tasks_period_chk')).toEqual(sorted(RECURRENCE_PERIODS));
    expect(values('recurring_tasks_rule_chk')).toEqual(sorted(NON_BUSINESS_DAY_RULES));
    expect(values('task_events_kind_chk')).toEqual(sorted(TASK_EVENT_KINDS));
    expect(values('task_attachments_type_chk')).toEqual(sorted(TASK_ATTACHMENT_CONTENT_TYPES));
    const occurrence = defs.find((d) => d.name === 'tasks_occurrence_chk')!.def;
    for (const source of ASSIGNEE_SOURCES) expect(occurrence).toContain(`'${source}'`);
  });

  it('CHECKs keep the schedule, the occurrence shape, ciphertext only and the attachment size', async () => {
    const a = await seed();
    const bad: [string, ReturnType<typeof sql>][] = [
      ['weekly on day 9', sql`insert into recurring_tasks (workspace_id, name, period, due_day, target_days_before, reference_offset, start_competence, created_by_name) values (${a.ws}, 'X', 'weekly', 9, 0, 0, '2026-10', 'A')`],
      ['annual without month', sql`insert into recurring_tasks (workspace_id, name, period, due_day, start_competence, created_by_name) values (${a.ws}, 'X', 'annual', 10, '2026-10', 'A')`],
      ['unknown regime', sql`insert into recurring_tasks (workspace_id, name, due_day, regimes, start_competence, created_by_name) values (${a.ws}, 'X', 10, array['bitcoin'], '2026-10', 'A')`],
      ['end before start', sql`insert into recurring_tasks (workspace_id, name, due_day, start_competence, end_competence, created_by_name) values (${a.ws}, 'X', 10, '2026-10', '2026-09', 'A')`],
      ['clear description', sql`update recurring_tasks set description = 'texto' where workspace_id = ${a.ws}`],
      ['occurrence without target', sql`update tasks set target_date = null where workspace_id = ${a.ws} and recurring_task_id is not null`],
      ['target after legal', sql`update tasks set target_date = due_date + 1 where workspace_id = ${a.ws} and recurring_task_id is not null`],
      ['competence on a standalone', sql`update tasks set competence = '2026-10' where workspace_id = ${a.ws} and recurring_task_id is null`],
      ['clear note', sql`update task_notes set title = 'texto' where workspace_id = ${a.ws}`],
      ['clear file name', sql`update task_attachments set file_name = 'rg.pdf' where workspace_id = ${a.ws}`],
      ['size mismatch', sql`update task_attachments set size_bytes = size_bytes + 1 where workspace_id = ${a.ws}`],
      ['html type', sql`update task_attachments set content_type = 'text/html' where workspace_id = ${a.ws}`],
      ['unknown event', sql`insert into task_events (workspace_id, task_id, kind) values (${a.ws}, ${a.applied.task.id}, 'hacked')`],
    ];
    for (const [label, statement] of bad) {
      const f = await failure(withTenant(app.db, a.ws, (tx) => tx.execute(statement)));
      expect(f?.code, label).toBe('23514');
    }
    // One occurrence per recurring task, client and period.
    const dup = await failure(
      withTenant(app.db, a.ws, (tx) =>
        tx.execute(sql`insert into tasks (workspace_id, title, client_id, recurring_task_id, competence, period_key, reference_month, due_date, target_date, created_by_name)
                       select workspace_id, title, client_id, recurring_task_id, competence, period_key, reference_month, due_date, target_date, created_by_name
                         from tasks where workspace_id = ${a.ws} and recurring_task_id is not null limit 1`),
      ),
    );
    expect(dup?.code).toBe('23505');
  });

  it('ON DELETE: categories detach, members leave the defaults, clients and departments in use are kept', async () => {
    const a = await seed();
    await withTenant(app.db, a.ws, (tx) => tx.execute(sql`delete from task_categories where id = ${a.category}`));
    const [r] = await rows<{ category_id: string | null; workspace_id: string }>(sql`select category_id, workspace_id::text from recurring_tasks where id = ${a.recurring.id}`);
    expect(r).toEqual({ category_id: null, workspace_id: a.ws });
    expect((await rows<{ n: number }>(sql`select count(*)::int as n from task_flow_template_steps where workspace_id = ${a.ws} and category_id is null`))[0]!.n).toBe(1);
    // The client has occurrences and a process: refused (the API answers 409).
    expect((await a.ana.del(`/clients/${a.client}`)).status).toBe(409);
    // The department has a recurring task: refused.
    expect((await a.ana.del(`/tasks/departments/${a.fiscal}`)).status).toBe(409);
    // Carla leaves: the default responsible, the template step and her notes go; the history keeps her name.
    expect((await a.ana.del(`/workspaces/current/members/${a.carla.userId}`)).status).toBe(204);
    const [after] = await rows<{ default_assignee_id: string | null }>(sql`select default_assignee_id from recurring_tasks where id = ${a.recurring.id}`);
    expect(after!.default_assignee_id).toBeNull();
    expect((await rows<{ n: number }>(sql`select count(*)::int as n from task_notes where workspace_id = ${a.ws}`))[0]!.n).toBe(0);
    const names = await rows<{ actor_name: string }>(sql`select distinct actor_name from task_events where workspace_id = ${a.ws} and actor_id = ${a.carla.userId}`);
    expect(names.map((n) => n.actor_name)).toEqual(['Carla Souza']);
  });

  it('deleting the account replaces the recorded names (LGPD); the export is decrypted, without file contents', async () => {
    const a = await seed();
    const exported = (await a.ana.get('/workspaces/current/export')).body;
    expect(exported.recurringTasks[0]).toMatchObject({ name: 'DAS', description: 'Guia' });
    expect(exported.recurringTaskClients).toHaveLength(1);
    expect(exported.taskFlowTemplates[0]).toMatchObject({ title: 'Abertura', description: 'Roteiro' });
    expect(exported.taskFlowTemplateSteps[0]).toMatchObject({ title: 'Documentos', description: 'RG' });
    expect(exported.taskFlowSteps[0]).toMatchObject({ description: 'RG' });
    expect(exported.taskFlows).toHaveLength(1);
    expect(exported.taskAttachments[0]).toMatchObject({ fileName: 'rg.pdf', contentType: 'application/pdf' });
    expect(exported.taskAttachments[0].content).toBeUndefined();
    expect(exported.taskEvents.find((e: any) => e.kind === 'attachment_added').note).toBe('rg.pdf');
    // In order, but without `seq`: a global sequence would tell how many events every office wrote.
    expect(exported.taskEvents.length).toBeGreaterThan(1);
    expect(exported.taskEvents.every((e: any) => !('seq' in e))).toBe(true);
    expect(exported.taskNotes).toEqual([]); // Carla's note is hers alone
    expect(JSON.stringify(exported)).not.toMatch(/"v1\.[\w-]{16}\./);

    // Ana deletes her account: her own office goes; in other offices her name becomes "Usuário excluído".
    const b = await seed();
    const invite = await b.ana.post('/workspaces/current/invites', { email: a.ana.email, role: 'editor' });
    expect((await a.ana.post(`/invites/${invite.body.inviteUrl.split('/convite/')[1]}/accept`)).status).toBe(200);
    const template = await a.ana.post('/tasks/flow-templates', { title: 'Da Ana no B', steps: [{ title: 'E1' }] });
    expect(template.status).toBe(201);
    const recurring = await a.ana.post('/tasks/recurring', { name: 'Da Ana no B', departmentId: b.fiscal, dueDay: 10, clientIds: [b.client] });
    expect(recurring.status).toBe(201);
    expect((await a.ana.post(`/tasks/${b.applied.task.id}/comments`, { text: 'Comentário da Ana no B' })).status).toBe(201);
    expect((await a.ana.del('/auth/me', { password: TEST_PASSWORD })).status).toBe(204);
    const [t] = await rows<{ created_by: string | null; created_by_name: string }>(sql`select created_by, created_by_name from task_flow_templates where id = ${template.body.id}`);
    expect(t).toEqual({ created_by: null, created_by_name: 'Usuário excluído' });
    const [rt] = await rows<{ created_by_name: string }>(sql`select created_by_name from recurring_tasks where id = ${recurring.body.id}`);
    expect(rt!.created_by_name).toBe('Usuário excluído');
    const events = await rows<{ actor_name: string }>(sql`select distinct actor_name from task_events where workspace_id = ${b.ws} and actor_id is null and actor_name is not null and kind = 'commented'`);
    expect(events.map((e) => e.actor_name)).toEqual(['Usuário excluído']);
    for (const table of PHASE2_TABLES) {
      expect((await rows<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(table)} where workspace_id = ${a.ws}`))[0]!.n, table).toBe(0);
    }
  });

  it('the migration runs again over existing rows', async () => {
    const a = await seed();
    // 0014 again, then 0017 (which narrows the occurrence CHECK 0014 re-adds): the schema ends as today.
    for (const name of ['0014_tasks_phase2.sql', '0017_drop_client_responsibles.sql']) {
      const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), `../drizzle/${name}`);
      const source = await readFile(file, 'utf8');
      await admin().transaction(async (tx) => {
        for (const statement of source.split('--> statement-breakpoint')) if (statement.trim()) await tx.execute(sql.raw(statement));
      });
    }
    const [n] = await rows<{ n: number }>(sql`select count(*)::int as n from tasks where workspace_id = ${a.ws} and recurring_task_id is not null`);
    expect(n!.n).toBeGreaterThan(0);
    expect((await a.carla.get(`/tasks/${a.applied.task.id}`)).body.attachments).toHaveLength(1);
    void randomUUID;
  });
});
