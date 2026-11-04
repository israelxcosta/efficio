// Every statement the task module sends filters by the workspace (CLAUDE.md: "Toda query do backend
// filtra pelo espaço; o RLS é a segunda barreira"). The services run on a superuser connection — Row
// Level Security does not apply to it, so nothing hides a missing filter — with a Drizzle logger that
// captures each statement and its parameters. Then:
// 1. every reference to a tenant table (FROM, JOIN, UPDATE, DELETE, correlated subqueries) is tied to
//    the workspace of the request: `workspace_id = $n` with that workspace as the parameter, or
//    `workspace_id` equal to the column of a table already tied to it (joins, subqueries); inserts
//    carry the workspace column with that value;
// 2. every exported function of the module's services ran (a new one must join the scenario);
// 3. another office's rows are untouched, byte for byte.
// A filter by id alone is safe today only because a check by id + workspace runs first; this test keeps
// it from depending on that.
// Today is pinned to 2026-10-20 (vitest.config.ts).

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  applyFlowTemplateSchema,
  flowTemplateInputSchema,
  recurringTaskInputSchema,
  recurringTaskQuerySchema,
  regimeGroupApplySchema,
  rolePermissions,
  TASK_TIME_ZONE,
  taskAttachmentInputSchema,
  taskAuditQuerySchema,
  taskCalendarQuerySchema,
  taskCategoryInputSchema,
  taskDepartmentInputSchema,
  taskFlowInputSchema,
  taskFlowQuerySchema,
  taskHomeQuerySchema,
  taskInputSchema,
  taskNoteInputSchema,
  taskQuerySchema,
  taskReportExportQuerySchema,
  taskReportQuerySchema,
  taskUpdateSchema,
} from '@effinance/shared';
import type { App } from '../src/app';
import type { DbExecutor } from '../src/db/client';
import * as schema from '../src/db/schema';
import { todayIn } from '../src/lib/clock';
import { getCipher } from '../src/lib/crypto/keyring';
import { isTaskAdmin, loadMembers, type TaskContext } from '../src/modules/tasks/access';
import * as attachmentsModule from '../src/modules/tasks/attachments';
import * as auditModule from '../src/modules/tasks/audit';
import * as flowsModule from '../src/modules/tasks/flows';
import * as homeModule from '../src/modules/tasks/home';
import * as insightsModule from '../src/modules/tasks/insights';
import * as notesModule from '../src/modules/tasks/notes';
import * as recurringModule from '../src/modules/tasks/recurring';
import * as regimeGroupsModule from '../src/modules/tasks/regime-groups';
import * as registryModule from '../src/modules/tasks/registry';
import * as serviceModule from '../src/modules/tasks/service';
import { ADMIN_URL, TENANT_TABLES } from './db-roles';
import { exportedFunctions, tracked, unscopedReferences, type Statement } from './scope-checker';
import { admin, createTestApp, registerUser, resetDb, type Client } from './helpers';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let app: App;
let traced: ReturnType<typeof drizzle<typeof schema>>;
let tracedClient: ReturnType<typeof postgres>;
const statements: Statement[] = [];

beforeAll(async () => {
  app = await createTestApp();
  // Superuser: RLS does not apply, so only the module's own filters keep workspaces apart.
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

async function member(owner: Client, role: 'editor' | 'viewer', name: string): Promise<Client> {
  const email = `${role}-${randomUUID()}@teste.com`;
  const invite = await owner.post('/workspaces/current/invites', { email, role });
  expect(invite.status).toBe(201);
  const guest = await registerUser(app, name, email);
  expect(
    (await guest.post(`/invites/${invite.body.inviteUrl.split('/convite/')[1]}/accept`)).status,
  ).toBe(200);
  return guest;
}

const workspaceOf = async (c: Client): Promise<string> =>
  (await c.get('/auth/me')).body.workspace.id;

const clientInput = (name: string, document: string) => ({
  name,
  document,
  taxRegime: 'simples_nacional',
  simplesAnnex: 'I',
  contractStartDate: '2026-01-10',
});

/** Rows of the other office, in a stable order, to compare before and after. */
async function snapshot(workspaceId: string): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const table of [...TENANT_TABLES.filter((t) => t.startsWith('task') || t.startsWith('recurring')), 'contacts']) {
    const rows = await admin().execute<{ row: unknown }>(
      sql`select to_jsonb(t) as row from ${sql.identifier(table)} t where t.workspace_id = ${workspaceId} order by to_jsonb(t)::text`,
    );
    out[table] = [...rows].map((r) => r.row);
  }
  return out;
}

/** A tiny but real PDF (the signature check needs `%PDF-`). */
const PDF_BASE64 = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n').toString('base64');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tasks: every query filters by the workspace', () => {
  it('the checker flags statements without the workspace filter (and accepts the scoped ones)', () => {
    const ws = randomUUID();
    const other = randomUUID();
    const id = randomUUID();
    const check = (q: string, params: unknown[] = [ws, id]) =>
      unscopedReferences({ sql: q, params }, ws);

    // By id only (the findings of the review), or by another workspace.
    expect(check('update "tasks" set "status" = $1 where "tasks"."id" = $2', ['done', id])).toEqual(
      ['tasks'],
    );
    expect(check('update "tasks" set "workspace_id" = $1', [ws])).toEqual(['tasks']);
    expect(check('select "description" from "tasks" where "tasks"."id" = $1', [id])).toEqual([
      'tasks',
    ]);
    expect(check('delete from "task_categories" where "task_categories"."id" = $1', [id])).toEqual([
      'task_categories',
    ]);
    expect(check('delete from "task_subtasks"', [])).toEqual(['task_subtasks']);
    expect(check('select "id" from "tasks" where "tasks"."workspace_id" = $1', [other])).toEqual([
      'tasks',
    ]);
    // A join or a correlated subquery that is not tied to the scoped table.
    expect(
      check(
        'select "tasks"."id" from "tasks" left join "contacts" on "contacts"."id" = "tasks"."client_id" where "tasks"."workspace_id" = $1',
        [ws],
      ),
    ).toEqual(['contacts']);
    expect(
      check(
        'select (select count(*) from task_subtasks st where st.task_id = "tasks"."id") from "tasks" where "tasks"."workspace_id" = $1',
        [ws],
      ),
    ).toEqual(['task_subtasks as st']);
    // Inserts carry the workspace column, with the request's workspace.
    expect(check('insert into "tasks" ("id", "title") values (default, $1)', ['x'])).toEqual([
      'tasks',
    ]);
    expect(
      check('insert into "tasks" ("id", "workspace_id", "title") values (default, $1, $2)', [
        other,
        'x',
      ]),
    ).toEqual(['tasks']);

    // Scoped statements as Drizzle and the module write them.
    expect(
      check(
        'update "tasks" set "status" = $1 where ("tasks"."workspace_id" = $2 and "tasks"."id" = $3)',
        ['done', ws, id],
      ),
    ).toEqual([]);
    expect(
      check(
        'select "tasks"."id", (select count(*) from task_comments tc where tc.workspace_id = "tasks"."workspace_id" and tc.task_id = "tasks"."id") from "tasks" left join "contacts" on ("contacts"."workspace_id" = "tasks"."workspace_id" and "contacts"."id" = "tasks"."client_id") where "tasks"."workspace_id" = $1',
        [ws],
      ),
    ).toEqual([]);
    expect(
      check(
        'select "id", (select count(*) from tasks t where t.workspace_id = task_categories.workspace_id and t.category_id = task_categories.id) from "task_categories" where "task_categories"."workspace_id" = $1',
        [ws],
      ),
    ).toEqual([]);
    expect(
      check(
        'insert into "task_department_members" ("workspace_id", "user_id", "department_id") values ($1, $2, $3), ($4, $5, $6)',
        [ws, id, id, ws, id, id],
      ),
    ).toEqual([]);
    expect(check('select set_config($1, $2, true)', ['role', 'effinance_app'])).toEqual([]);
  });

  it('runs every service of the module with RLS bypassed: all statements are scoped, the other office is untouched', async () => {
    // Office B, written through the API, must come out of A's work exactly as it was.
    const bruno = await registerUser(app, 'Bruno Outro');
    const bClient = await bruno.post(
      '/clients',
      clientInput('Cliente do Bruno Ltda', '04.252.011/0001-10'),
    );
    expect(bClient.status).toBe(201);
    const bDepartment = await bruno.post('/tasks/departments', {
      name: 'Fiscal',
      memberIds: [bruno.userId],
    });
    const bCategory = await bruno.post('/tasks/categories', { name: 'Certidões' });
    const bTask = await bruno.post('/tasks', {
      title: 'Tarefa do Bruno',
      description: 'Descrição do Bruno',
      clientId: bClient.body.id,
      categoryId: bCategory.body.id,
      assigneeId: bruno.userId,
      dueDate: '2026-10-10',
    });
    expect(bTask.status).toBe(201);
    await bruno.post(`/tasks/${bTask.body.id}/subtasks`, { title: 'Subtarefa do Bruno' });
    await bruno.post(`/tasks/${bTask.body.id}/comments`, { text: 'Comentário do Bruno' });
    // Phase 2 rows in B: a recurring task with its occurrences, a process from a template, a note and
    // an attachment.
    const bRecurring = await bruno.post('/tasks/recurring', {
      name: 'DAS do Bruno',
      description: 'Guia mensal',
      departmentId: bDepartment.body.id,
      assigneeId: bruno.userId,
      dueDay: 20,
      regimes: ['simples_nacional'],
    });
    expect(bRecurring.status).toBe(201);
    const bTemplate = await bruno.post('/tasks/flow-templates', {
      title: 'Abertura do Bruno',
      steps: [{ title: 'Etapa 1', relativeDays: 1 }, { title: 'Etapa 2', relativeDays: 2 }],
    });
    expect(bTemplate.status).toBe(201);
    expect((await bruno.post(`/tasks/flow-templates/${bTemplate.body.id}/apply`, { clientId: bClient.body.id })).status).toBe(201);
    expect((await bruno.post('/tasks/notes', { title: 'Nota do Bruno', content: 'Só dele' })).status).toBe(201);
    expect(
      (await bruno.post(`/tasks/${bTask.body.id}/attachments`, { fileName: 'b.pdf', contentType: 'application/pdf', content: PDF_BASE64 }))
        .status,
    ).toBe(201);
    // Generated up to two competences ahead; the list (no date filter) goes up to the next one.
    expect((await bruno.get('/tasks?pageSize=5')).body.occurrences.map((o: any) => o.competence)).toEqual(['2026-10', '2026-11']);
    const bWorkspace = await workspaceOf(bruno);
    const before = await snapshot(bWorkspace);

    // Office A: owner Ana and collaborator Carla, one client.
    const ana = await registerUser(app, 'Ana Titular');
    const carla = await member(ana, 'viewer', 'Carla Souza');
    const ws = await workspaceOf(ana);
    const aClient = await ana.post(
      '/clients',
      clientInput('Padaria Pão Dourado Ltda', '11.222.333/0001-81'),
    );
    expect(aClient.status).toBe(201);

    const members = await loadMembers(admin(), ws);
    const cipher = await getCipher(ws);
    const as =
      (userId: string) =>
      (tx: DbExecutor): TaskContext => {
        const role = members.get(userId)!.role;
        return {
          db: tx,
          workspaceId: ws,
          userId,
          role,
          isAdmin: isTaskAdmin({ role }),
          permissions: rolePermissions(role),
          canWrite: true,
          members,
          today: todayIn(TASK_TIME_ZONE),
          cipher,
        };
      };
    const anaCtx = as(ana.userId);
    const carlaCtx = as(carla.userId);
    const run = <T>(ctx: (tx: DbExecutor) => TaskContext, fn: (c: TaskContext) => Promise<T>) =>
      traced.transaction((tx) => fn(ctx(tx)));

    const called = new Set<string>();
    const registry = tracked(registryModule, called);
    const service = tracked(serviceModule, called);
    const home = tracked(homeModule, called);
    const recurring = tracked(recurringModule, called);
    const regimeGroups = tracked(regimeGroupsModule, called);
    const audit = tracked(auditModule, called);
    const flows = tracked(flowsModule, called);
    const insights = tracked(insightsModule, called);
    const attachments = tracked(attachmentsModule, called);
    const notes = tracked(notesModule, called);
    statements.length = 0;

    // Registries.
    await run(anaCtx, (c) => registry.taskOptions(c));
    await run(anaCtx, (c) => registry.listMembers(c));
    await run(anaCtx, (c) => registry.clientOptions(c));
    const fiscal = await run(anaCtx, (c) =>
      registry.createDepartment(
        c,
        taskDepartmentInputSchema.parse({ name: 'Fiscal', memberIds: [ana.userId] }),
      ),
    );
    const contabil = await run(anaCtx, (c) =>
      registry.createDepartment(c, taskDepartmentInputSchema.parse({ name: 'Contábil' })),
    );
    await run(anaCtx, (c) =>
      registry.updateDepartment(
        c,
        contabil.id,
        taskDepartmentInputSchema.parse({ name: 'Contábil e DP', memberIds: [carla.userId] }),
      ),
    );
    await run(anaCtx, (c) => registry.setMemberDepartment(c, carla.userId, fiscal.id));
    await run(anaCtx, (c) => registry.listDepartments(c));
    const category = await run(anaCtx, (c) =>
      registry.createCategory(c, taskCategoryInputSchema.parse({ name: 'Certidões' })),
    );
    await run(anaCtx, (c) =>
      registry.updateCategory(
        c,
        category.id,
        taskCategoryInputSchema.parse({ name: 'Certidões e guias' }),
      ),
    );
    await run(anaCtx, (c) => registry.listCategories(c));

    // Tasks, subtasks, comments.
    const task = await run(anaCtx, (c) =>
      service.createTask(
        c,
        taskInputSchema.parse({
          title: 'Apuração do ICMS',
          description: 'Conferir os créditos',
          clientId: aClient.body.id,
          categoryId: category.id,
          assigneeId: carla.userId,
          dueDate: '2026-10-15',
        }),
      ),
    );
    const queued = await run(anaCtx, (c) =>
      service.createTask(
        c,
        taskInputSchema.parse({ title: 'Na fila', departmentId: contabil.id, status: 'done' }),
      ),
    );
    await run(carlaCtx, (c) => service.getTaskRowOrThrow(c, task.id));
    await run(carlaCtx, (c) => service.getTaskDetail(c, task.id));
    await run(carlaCtx, (c) =>
      service.updateTask(
        c,
        task.id,
        taskUpdateSchema.parse({ description: 'Conferir os créditos e débitos', priority: 'high' }),
      ),
    );
    await run(anaCtx, (c) =>
      service.updateTask(
        c,
        queued.id,
        taskUpdateSchema.parse({ assigneeId: null, departmentId: fiscal.id }),
      ),
    );
    await run(carlaCtx, (c) => service.changeTaskStatus(c, task.id, 'done'));
    await run(carlaCtx, (c) => service.changeTaskStatus(c, task.id, 'in_progress'));
    const subtask = await run(carlaCtx, (c) =>
      service.addSubtask(c, task.id, { title: 'Notas de entrada' }),
    );
    await run(carlaCtx, (c) => service.updateSubtask(c, task.id, subtask.id, { done: true }));
    await run(carlaCtx, (c) => service.deleteSubtask(c, task.id, subtask.id));
    await run(carlaCtx, (c) => service.addComment(c, task.id, { text: 'Faltam duas notas' }));
    // Ana created the task: Carla's comment is activity for her, not for Carla.
    expect(await run(anaCtx, (c) => service.recentActivity(c))).toHaveLength(1);
    expect(await run(carlaCtx, (c) => service.recentActivity(c))).toHaveLength(0);

    // Lists and the start page.
    for (const query of [
      {},
      { scope: 'mine', situation: 'open', search: 'icms', month: '2026-10' },
      {
        scope: 'department',
        situation: 'overdue',
        clientId: aClient.body.id,
        dueBucket: 'overdue',
      },
      {
        situation: 'done',
        clientId: 'internal',
        assigneeId: 'none',
        closedFrom: '2026-10-01',
        categoryId: category.id,
      },
    ]) {
      await run(carlaCtx, (c) => service.listTasks(c, taskQuerySchema.parse(query)));
    }
    await run(carlaCtx, (c) => home.taskHome(c, taskHomeQuerySchema.parse({})));
    await run(anaCtx, (c) => home.taskHome(c, taskHomeQuerySchema.parse({ departmentId: 'all' })));

    // The history and removing a comment.
    const comment = await run(anaCtx, (c) => service.addComment(c, task.id, { text: 'Comentário da Ana' }));
    await run(anaCtx, (c) => service.deleteComment(c, task.id, comment.id));
    await run(carlaCtx, (c) => service.taskHistory(c, task.id));

    // Recurring tasks: registry, generation, the occurrence view, the audit, reopening with a reason.
    const das = await run(anaCtx, (c) =>
      recurring.createRecurring(
        c,
        recurringTaskInputSchema.parse({
          name: 'DAS',
          description: 'Guia do Simples',
          departmentId: fiscal.id,
          categoryId: category.id,
          assigneeId: ana.userId,
          dueDay: 20,
          targetDaysBefore: 3,
          regimes: ['simples_nacional'],
          excludedClientIds: [],
        }),
      ),
    );
    const weekly = await run(anaCtx, (c) =>
      recurring.createRecurring(
        c,
        recurringTaskInputSchema.parse({ name: 'Conferência semanal', departmentId: fiscal.id, period: 'weekly', dueDay: 5, clientIds: [aClient.body.id] }),
      ),
    );
    await run(anaCtx, (c) =>
      recurring.updateRecurring(
        c,
        das.id,
        recurringTaskInputSchema.parse({ name: 'DAS mensal', departmentId: fiscal.id, assigneeId: carla.userId, dueDay: 19, regimes: ['simples_nacional'] }),
      ),
    );
    await run(anaCtx, (c) => recurring.generateOccurrences(c, '2026-11'));
    for (const query of [{}, { month: '2026-11', search: 'das', period: 'monthly', departmentId: fiscal.id, assigneeId: carla.userId, regime: 'simples_nacional', status: 'all' }]) {
      await run(carlaCtx, (c) => recurring.listRecurring(c, recurringTaskQuerySchema.parse(query)));
    }
    await run(carlaCtx, (c) => recurring.getRecurring(c, das.id, '2026-10'));
    const detail = await run(carlaCtx, (c) => recurring.occurrenceDetail(c, das.id, '2026-10'));
    expect(detail.cells).toHaveLength(1);
    const occurrence = detail.cells[0]!.taskId;
    await run(carlaCtx, (c) => service.updateTask(c, occurrence, taskUpdateSchema.parse({ assigneeId: ana.userId })));
    await run(carlaCtx, (c) => service.changeTaskStatus(c, occurrence, 'done'));
    await run(anaCtx, (c) => service.changeTaskStatus(c, occurrence, 'todo', 'Guia emitida com valor errado'));
    for (const query of [
      { competence: '2026-10' },
      { competence: '2026-10', taxRegime: 'simples_nacional', departmentId: fiscal.id, assigneeId: ana.userId, recurringTaskId: das.id },
    ]) {
      await run(carlaCtx, (c) => audit.auditMatrix(c, taskAuditQuerySchema.parse(query)));
    }
    await run(carlaCtx, (c) => service.listTasks(c, taskQuerySchema.parse({ kind: 'recurring', dueBucket: 'targetMissed' })));
    await run(anaCtx, (c) => recurring.deleteRecurring(c, weekly.id));

    // Regime groups: list, apply (creates, then adds a regime to a common one), and a plain insert.
    await run(carlaCtx, (c) => regimeGroups.listRegimeGroups(c));
    await run(anaCtx, (c) => regimeGroups.applyRegimeGroup(c, 'simples_nacional', regimeGroupApplySchema.parse({ keys: ['fgts_digital', 'pgdas_das'] })));
    await run(anaCtx, (c) => regimeGroups.applyRegimeGroup(c, 'presumed_profit', regimeGroupApplySchema.parse({ keys: ['fgts_digital', 'ecd'] })));
    await run(anaCtx, (c) =>
      recurring.insertRecurring(c, recurringTaskInputSchema.parse({ name: 'Inserida', departmentId: fiscal.id, dueDay: 8, regimes: ['mei'] })),
    );

    // Processes and templates.
    const template = await run(anaCtx, (c) =>
      flows.createTemplate(
        c,
        flowTemplateInputSchema.parse({
          title: 'Abertura de empresa',
          description: 'Roteiro',
          steps: [
            { title: 'Documentos', departmentId: fiscal.id, assigneeId: carla.userId, relativeDays: 1, description: 'RG e CPF' },
            { title: 'Contrato social', categoryId: category.id, relativeDays: 2 },
          ],
        }),
      ),
    );
    await run(anaCtx, (c) =>
      flows.updateTemplate(
        c,
        template.id,
        flowTemplateInputSchema.parse({ title: 'Abertura', steps: [{ title: 'Documentos', relativeDays: 1 }, { title: 'Junta', relativeDays: 3 }] }),
      ),
    );
    await run(carlaCtx, (c) => flows.listTemplates(c));
    await run(carlaCtx, (c) => flows.getTemplate(c, template.id));
    const applied = await run(carlaCtx, (c) =>
      flows.applyTemplate(c, template.id, applyFlowTemplateSchema.parse({ clientId: aClient.body.id })),
    );
    const handmade = await run(anaCtx, (c) =>
      flows.createFlow(
        c,
        taskFlowInputSchema.parse({
          title: 'Alteração contratual',
          clientId: aClient.body.id,
          saveAsTemplate: true,
          steps: [{ title: 'Minuta', relativeDays: 0 }, { title: 'Registro', relativeDays: 2 }],
        }),
      ),
    );
    await run(carlaCtx, (c) => service.changeTaskStatus(c, applied.task.id, 'done'));
    await run(carlaCtx, (c) => flows.listFlows(c, taskFlowQuerySchema.parse({ status: 'all', clientId: aClient.body.id })));
    await run(carlaCtx, (c) => flows.getFlow(c, applied.flow.id));
    await run(carlaCtx, (c) => service.getTaskDetail(c, applied.task.id));
    await run(anaCtx, (c) => flows.deleteFlow(c, handmade.flow.id));
    await run(anaCtx, (c) => flows.deleteTemplate(c, handmade.template!.id));

    // Reports, export, calendar.
    const period = { from: '2026-10-01', to: '2026-10-31' };
    for (const query of [period, { ...period, kind: 'recurring', situation: 'open', departmentId: fiscal.id }, { ...period, kind: 'flow', clientId: 'internal', assigneeId: 'none' }]) {
      await run(carlaCtx, (c) => insights.taskReport(c, taskReportQuerySchema.parse(query)));
    }
    await run(carlaCtx, (c) => insights.exportTaskReport(c, taskReportExportQuerySchema.parse({ ...period, kind: 'standalone', status: 'done' })));
    for (const query of [period, { ...period, scope: 'department', kind: 'recurring' }, { ...period, scope: 'mine', kind: 'standalone', categoryId: category.id }]) {
      await run(carlaCtx, (c) => insights.taskCalendar(c, taskCalendarQuerySchema.parse(query)));
    }

    // Attachments and notes.
    const file = await run(carlaCtx, (c) =>
      attachments.addAttachment(c, task.id, taskAttachmentInputSchema.parse({ fileName: 'guia.pdf', contentType: 'application/pdf', content: PDF_BASE64 })),
    );
    await run(carlaCtx, (c) => attachments.listAttachments(c, task.id));
    await run(anaCtx, (c) => attachments.downloadAttachment(c, task.id, file.id));
    await run(anaCtx, (c) => attachments.deleteAttachment(c, task.id, file.id));
    const note = await run(carlaCtx, (c) => notes.createNote(c, taskNoteInputSchema.parse({ title: 'Portal da prefeitura', content: 'Endereço' })));
    await run(carlaCtx, (c) => notes.updateNote(c, note.id, taskNoteInputSchema.parse({ title: 'Portal', content: null })));
    await run(carlaCtx, (c) => notes.listNotes(c));
    await run(carlaCtx, (c) => notes.deleteNote(c, note.id));

    // Deletions (a department in use is refused first).
    await expect(run(anaCtx, (c) => registry.deleteDepartment(c, fiscal.id))).rejects.toThrow(
      /neste departamento/,
    );
    const empty = await run(anaCtx, (c) =>
      registry.createDepartment(c, taskDepartmentInputSchema.parse({ name: 'Societário' })),
    );
    await run(anaCtx, (c) => registry.deleteDepartment(c, empty.id));
    await run(anaCtx, (c) => registry.deleteCategory(c, category.id));
    await run(anaCtx, (c) => service.deleteTask(c, queued.id));

    // 2. Every service entry point ran.
    expect([...called].sort()).toEqual(
      exportedFunctions(
        registryModule,
        serviceModule,
        homeModule,
        recurringModule,
        regimeGroupsModule,
        auditModule,
        flowsModule,
        insightsModule,
        attachmentsModule,
        notesModule,
      ),
    );

    // 1. Every statement is scoped to A.
    expect(statements.length).toBeGreaterThan(300);
    const unscoped = statements
      .map((s) => ({ sql: s.sql, tables: unscopedReferences(s, ws) }))
      .filter((s) => s.tables.length > 0);
    expect(unscoped).toEqual([]);

    // 3. B is exactly as it was.
    expect(await snapshot(bWorkspace)).toEqual(before);
  });
});
