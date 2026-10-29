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
  clientResponsibleInputSchema,
  TASK_TIME_ZONE,
  taskCategoryInputSchema,
  taskDepartmentInputSchema,
  taskHomeQuerySchema,
  taskInputSchema,
  taskQuerySchema,
  taskUpdateSchema,
} from '@effinance/shared';
import type { App } from '../src/app';
import type { DbExecutor } from '../src/db/client';
import * as schema from '../src/db/schema';
import { todayIn } from '../src/lib/clock';
import { getCipher } from '../src/lib/crypto/keyring';
import { isTaskAdmin, loadMembers, type TaskContext } from '../src/modules/tasks/access';
import * as homeModule from '../src/modules/tasks/home';
import * as registryModule from '../src/modules/tasks/registry';
import * as serviceModule from '../src/modules/tasks/service';
import { ADMIN_URL, TENANT_TABLES } from './db-roles';
import { admin, createTestApp, registerUser, resetDb, type Client } from './helpers';

interface Statement {
  sql: string;
  params: unknown[];
}

// ---------------------------------------------------------------------------
// Checker
// ---------------------------------------------------------------------------

const TENANT = new Set<string>(TENANT_TABLES);
/** Words that may follow a table name without being its alias. */
const NOT_ALIAS = new Set([
  ...'where on set left right inner full cross join order group limit offset'.split(' '),
  ...'returning values union having for using as default'.split(' '),
]);
/** `from|join|update|into <table> [as] [alias]` — the alias is a lookahead so `… join` is not swallowed. */
const REFERENCE =
  /\b(from|join|update|into)\s+"?([a-z_][a-z0-9_]*)"?(?=(?:\s+(?:as\s+)?"?([a-z_][a-z0-9_]*)"?)?)/g;
const OPERAND = String.raw`(?:(?:"?[a-z_][a-z0-9_]*"?\.)?"?workspace_id"?|\$\d+(?:::uuid)?)`;
const EQUALITY = new RegExp(`(${OPERAND})\\s*=\\s*(${OPERAND})`, 'g');
const WS = '<workspace>';
const UNQUALIFIED = '<unqualified>';

/** Splits `a, (b, c), d` at the commas outside parentheses. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

/** The parenthesized groups of `(…), (…)` (rows of a VALUES list). */
function groups(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (text[i] === ')') {
      depth--;
      if (depth === 0) out.push(text.slice(start, i));
    }
  }
  return out;
}

const isWorkspaceParam = (operand: string, params: unknown[], workspaceId: string) => {
  const p = /^\$(\d+)/.exec(operand);
  return p !== null && params[Number(p[1]) - 1] === workspaceId;
};

/**
 * Tenant tables a statement reaches without a filter by `workspaceId` (empty = scoped). A heuristic on
 * Drizzle's SQL (and the module's hand-written fragments), not a SQL parser: it looks for the
 * equalities, not for how they are combined.
 */
function unscopedReferences(statement: Statement, workspaceId: string): string[] {
  const text = statement.sql.replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();

  const insert =
    /^insert into "?([a-z_][a-z0-9_]*)"? \(([^)]*)\) values (.*?)(?: on conflict .*| returning .*)?$/s.exec(
      lower,
    );
  if (insert) {
    const [, table, columnList, values] = insert as unknown as [string, string, string, string];
    if (!TENANT.has(table)) return [];
    const column = splitTopLevel(columnList)
      .map((c) => c.replaceAll('"', ''))
      .indexOf('workspace_id');
    if (column < 0) return [table];
    const rows = groups(values);
    const scoped =
      rows.length > 0 &&
      rows.every((row) =>
        isWorkspaceParam(splitTopLevel(row)[column] ?? '', statement.params, workspaceId),
      );
    return scoped ? [] : [table];
  }

  // UPDATE: the SET list is not a filter (and without WHERE nothing is).
  let body = lower;
  if (body.startsWith('update ')) {
    const where = body.indexOf(' where ');
    body =
      where < 0
        ? body.slice(0, body.indexOf(' set '))
        : body.replace(/ set .*? where /s, ' where ');
  }

  const references: { table: string; alias: string }[] = [];
  for (const m of body.matchAll(REFERENCE)) {
    const table = m[2]!;
    if (!TENANT.has(table)) continue;
    const alias = m[3] && !NOT_ALIAS.has(m[3]) ? m[3] : table;
    references.push({ table, alias });
  }
  if (references.length === 0) return [];

  // Graph of workspace equalities: tables (by alias) and the request's workspace parameter.
  const edges = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      if (!edges.has(x)) edges.set(x, new Set());
      edges.get(x)!.add(y);
    }
  };
  const node = (operand: string): string | null => {
    if (operand.startsWith('$'))
      return isWorkspaceParam(operand, statement.params, workspaceId) ? WS : null;
    const q = /^"?([a-z_][a-z0-9_]*)"?\./.exec(operand);
    if (q) return q[1]!;
    // An unqualified column belongs to the only table of the statement (otherwise it proves nothing).
    return references.length === 1 ? references[0]!.alias : UNQUALIFIED;
  };
  for (const m of body.matchAll(EQUALITY)) {
    const a = node(m[1]!);
    const b = node(m[2]!);
    if (a && b && a !== UNQUALIFIED && b !== UNQUALIFIED) link(a, b);
  }
  const reached = new Set<string>([WS]);
  const queue = [WS];
  while (queue.length) {
    for (const next of edges.get(queue.pop()!) ?? []) {
      if (!reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
    }
  }
  return references
    .filter((r) => !reached.has(r.alias))
    .map((r) => (r.alias === r.table ? r.table : `${r.table} as ${r.alias}`));
}

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
  for (const table of [...TENANT_TABLES.filter((t) => t.startsWith('task')), 'contacts']) {
    const rows = await admin().execute<{ row: unknown }>(
      sql`select to_jsonb(t) as row from ${sql.identifier(table)} t where t.workspace_id = ${workspaceId} order by to_jsonb(t)::text`,
    );
    out[table] = [...rows].map((r) => r.row);
  }
  return out;
}

/** Wraps each exported function of the services to record that it ran. */
function tracked<T extends Record<string, unknown>>(mod: T, called: Set<string>): T {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(mod)) {
    out[name] =
      typeof value === 'function'
        ? (...args: unknown[]) => {
            called.add(name);
            return (value as (...a: unknown[]) => unknown)(...args);
          }
        : value;
  }
  return out as T;
}

const exportedFunctions = (...mods: Record<string, unknown>[]) =>
  mods
    .flatMap((m) =>
      Object.entries(m)
        .filter(([, v]) => typeof v === 'function')
        .map(([k]) => k),
    )
    .sort();

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
    expect(
      (
        await bruno.put('/tasks/client-responsibles', {
          clientId: bClient.body.id,
          departmentId: bDepartment.body.id,
          userId: bruno.userId,
        })
      ).status,
    ).toBe(200);
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
    const responsible = { clientId: aClient.body.id as string, departmentId: fiscal.id };
    await run(anaCtx, (c) =>
      registry.setClientResponsible(
        c,
        clientResponsibleInputSchema.parse({ ...responsible, userId: carla.userId }),
      ),
    );
    await run(anaCtx, (c) => registry.listClientResponsibles(c));
    await run(anaCtx, (c) =>
      registry.setClientResponsible(
        c,
        clientResponsibleInputSchema.parse({ ...responsible, userId: null }),
      ),
    );

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
      exportedFunctions(registryModule, serviceModule, homeModule),
    );

    // 1. Every statement is scoped to A.
    expect(statements.length).toBeGreaterThan(80);
    const unscoped = statements
      .map((s) => ({ sql: s.sql, tables: unscopedReferences(s, ws) }))
      .filter((s) => s.tables.length > 0);
    expect(unscoped).toEqual([]);

    // 3. B is exactly as it was.
    expect(await snapshot(bWorkspace)).toEqual(before);
  });
});
