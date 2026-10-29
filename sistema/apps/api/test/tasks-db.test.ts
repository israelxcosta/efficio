// Regression tests of the database security review of the task module (migrations 0011 to 0013):
// Row Level Security on every task table, composite foreign keys that never cross workspaces, ON DELETE
// behaviour (member leaving, client, department, category, workspace, account), CHECKs, the partial
// indexes the hot reads rely on, LGPD (export and account deletion) and the encryption of descriptions
// and comments (0013: stored as `v1.…`, bound to the workspace, backfilled, exported decrypted).
// Today is pinned to 2026-10-20 (vitest.config.ts).

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OPEN_TASK_STATUSES, TASK_PRIORITIES, TASK_STATUSES } from '@effinance/shared';
import type { App } from '../src/app';
import type { DbExecutor } from '../src/db/client';
import {
  contacts,
  taskCategories,
  taskClientResponsibles,
  taskComments,
  taskDepartmentMembers,
  taskDepartments,
  taskSubtasks,
  tasks,
  users,
  workspaceMembers,
  workspaces,
} from '../src/db/schema';
import { backfillEncryption, needsBackfill } from '../src/db/backfill';
import { DecryptionError } from '../src/lib/crypto/field-cipher';
import { getCipher } from '../src/lib/crypto/keyring';
import { executeRows } from '../src/lib/sql';
import { withTenant } from '../src/lib/tenant';
import { encryptTaskText, TASK_COMMENT_TEXT, TASK_DESCRIPTION } from '../src/modules/tasks/encrypted-text';
import { OPEN_SQL } from '../src/modules/tasks/task-rows';
import { TENANT_TABLES } from './db-roles';
import { admin, createTestApp, registerUser, resetDb, TEST_PASSWORD } from './helpers';

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

const TASK_TABLES = TENANT_TABLES.filter((t) => t.startsWith('task'));
const DELETED_USER = 'Usuário excluído';
/**
 * Something shaped like a field ciphertext (`v1.<16>.<23+>`, the CHECKs of 0013), for writes meant to
 * fail on something else (RLS, foreign keys): clear text would be refused by the CHECK first.
 */
const CIPHERTEXT_SHAPED = `v1.${'A'.repeat(16)}.${'B'.repeat(23)}`;
const CIPHERTEXT = /^v1\.[\w-]{16}\.[\w-]{23,}$/;

interface PgFailure {
  code: string | undefined;
  message: string;
  detail: string | undefined;
}

/** Drizzle wraps the driver error; the Postgres error (code, detail) is in `cause`. */
async function pgFailure(promise: Promise<unknown>): Promise<PgFailure | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    const e = ((error as { cause?: unknown }).cause ?? error) as { code?: string; message: string; detail?: string };
    return { code: e.code, message: e.message, detail: e.detail };
  }
}

const rows = <T>(query: ReturnType<typeof sql>) => executeRows<T>(admin(), query);

async function countRows(table: string, workspaceId: string): Promise<number> {
  const [r] = await rows<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(table)} where workspace_id = ${workspaceId}`);
  return r!.n;
}

/**
 * An office with exactly one row in every task table, written with the owner connection: owner and a
 * staff member (department Fiscal, responsible for the client), a concluded task created, concluded
 * and commented by the staff member, one subtask.
 */
async function seedOffice(label: string) {
  const db = admin();
  const ws = randomUUID();
  await db.insert(workspaces).values({ id: ws, name: `Escritório ${label}`, kind: 'business' });
  const [owner, staff] = await db
    .insert(users)
    .values([
      { name: `Dona ${label}`, email: `dona-${label}-${randomUUID()}@teste.com`, passwordHash: 'x' },
      { name: `Equipe ${label}`, email: `equipe-${label}-${randomUUID()}@teste.com`, passwordHash: 'x' },
    ])
    .returning();
  await db.insert(workspaceMembers).values([
    { workspaceId: ws, userId: owner!.id, role: 'owner' },
    { workspaceId: ws, userId: staff!.id, role: 'viewer' },
  ]);
  const [client] = await db
    .insert(contacts)
    .values({ workspaceId: ws, kind: 'client', name: `Cliente ${label}`, taxRegime: 'simples_nacional', simplesAnnex: 'III', contractStartDate: '2025-01-10' })
    .returning();
  const [supplier] = await db.insert(contacts).values({ workspaceId: ws, kind: 'supplier', name: `Fornecedor ${label}` }).returning();
  const [department] = await db.insert(taskDepartments).values({ workspaceId: ws, name: 'Fiscal' }).returning();
  const [category] = await db.insert(taskCategories).values({ workspaceId: ws, name: 'Certidões' }).returning();
  await db.insert(taskDepartmentMembers).values({ workspaceId: ws, userId: staff!.id, departmentId: department!.id });
  await db.insert(taskClientResponsibles).values({ workspaceId: ws, clientId: client!.id, departmentId: department!.id, userId: staff!.id });
  const [task] = await db
    .insert(tasks)
    .values({
      workspaceId: ws,
      title: `Balancete ${label}`,
      clientId: client!.id,
      departmentId: department!.id,
      categoryId: category!.id,
      assigneeId: staff!.id,
      dueDate: '2026-10-10',
      status: 'done',
      reopenStatus: 'in_progress',
      completedAt: new Date('2026-10-09T15:00:00Z'),
      completedBy: staff!.id,
      completedByName: staff!.name,
      createdBy: staff!.id,
      createdByName: staff!.name,
    })
    .returning();
  const [subtask] = await db.insert(taskSubtasks).values({ workspaceId: ws, taskId: task!.id, title: 'Conferir saldos' }).returning();
  // Comments are encrypted with the workspace key (generated here on first use, like a migrated one).
  const commentText = await encryptTaskText(await getCipher(ws), TASK_COMMENT_TEXT, 'Enviado ao cliente');
  const [comment] = await db
    .insert(taskComments)
    .values({ workspaceId: ws, taskId: task!.id, authorId: staff!.id, authorName: staff!.name, text: commentText })
    .returning();
  return {
    ws,
    owner: owner!.id,
    staff: staff!.id,
    staffName: staff!.name,
    client: client!.id,
    supplier: supplier!.id,
    department: department!.id,
    category: category!.id,
    task: task!.id,
    subtask: subtask!.id,
    comment: comment!.id,
    commentText,
  };
}

const taskRow = async (id: string) => (await admin().select().from(tasks).where(eq(tasks.id, id)))[0];
const commentRow = async (id: string) => (await admin().select().from(taskComments).where(eq(taskComments.id, id)))[0];
const storedDescription = async (id: string) =>
  (await rows<{ description: string | null }>(sql`select description from tasks where id = ${id}`))[0]!.description;
const storedComment = async (id: string) => (await rows<{ text: string }>(sql`select text from task_comments where id = ${id}`))[0]!.text;

// ---------------------------------------------------------------------------
// Row Level Security
// ---------------------------------------------------------------------------

describe('task tables: row level security', () => {
  it('every task table fails closed without a workspace and shows only the active one', async () => {
    const a = await seedOffice('A');
    const b = await seedOffice('B');
    expect(TASK_TABLES).toHaveLength(7);
    const visible = (table: string, workspaceId: string | null) =>
      app.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('role', 'effinance_app', true)`);
        if (workspaceId !== null) await tx.execute(sql`select set_config('app.workspace_id', ${workspaceId}, true)`);
        const [r] = await executeRows<{ n: number; other: number }>(
          tx,
          sql`select count(*)::int as n, count(*) filter (where workspace_id <> ${a.ws})::int as other from ${sql.identifier(table)}`,
        );
        return r!;
      });
    for (const table of TASK_TABLES) {
      expect(await visible(table, null), table).toEqual({ n: 0, other: 0 });
      expect(await visible(table, ''), table).toEqual({ n: 0, other: 0 });
      expect(await visible(table, a.ws), table).toEqual({ n: 1, other: 0 });
      expect((await visible(table, randomUUID())).n, table).toBe(0);
    }
    expect(await countRows('tasks', b.ws)).toBe(1);
  });

  it('a tenant cannot write rows into, or move rows to, another workspace', async () => {
    const a = await seedOffice('A');
    const b = await seedOffice('B');
    const attempts: [string, (tx: DbExecutor) => Promise<unknown>][] = [
      ['task_departments', (tx) => tx.insert(taskDepartments).values({ workspaceId: a.ws, name: 'Intrusa' })],
      ['task_categories', (tx) => tx.insert(taskCategories).values({ workspaceId: a.ws, name: 'Intrusa' })],
      ['tasks', (tx) => tx.insert(tasks).values({ workspaceId: a.ws, title: 'Intrusa', createdByName: 'X' })],
      ['task_subtasks', (tx) => tx.insert(taskSubtasks).values({ workspaceId: a.ws, taskId: a.task, title: 'Intrusa' })],
      ['task_comments', (tx) => tx.insert(taskComments).values({ workspaceId: a.ws, taskId: a.task, authorName: 'X', text: CIPHERTEXT_SHAPED })],
      [
        'task_department_members',
        (tx) => tx.insert(taskDepartmentMembers).values({ workspaceId: a.ws, userId: a.owner, departmentId: a.department }),
      ],
      [
        'task_client_responsibles',
        (tx) => tx.update(taskClientResponsibles).set({ workspaceId: a.ws }).where(eq(taskClientResponsibles.workspaceId, b.ws)),
      ],
      ['tasks (move)', (tx) => tx.update(tasks).set({ workspaceId: a.ws }).where(eq(tasks.id, b.task))],
      ['task_comments (move)', (tx) => tx.update(taskComments).set({ workspaceId: a.ws }).where(eq(taskComments.id, b.comment))],
    ];
    for (const [label, attempt] of attempts) {
      const failure = await pgFailure(withTenant(app.db, b.ws, attempt));
      expect(failure?.code, label).toBe('42501');
      expect(failure?.message, label).toMatch(/row-level security/);
    }
    for (const table of TASK_TABLES) expect(await countRows(table, a.ws), table).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Composite foreign keys
// ---------------------------------------------------------------------------

describe('task tables: references never cross workspaces', () => {
  it('client, department, category, member and task of another workspace are refused like unknown ids', async () => {
    const a = await seedOffice('A');
    const b = await seedOffice('B');
    const task = { workspaceId: b.ws, title: 'x', createdByName: 'X' };
    const attempts: [string, (tx: DbExecutor, id: string) => Promise<unknown>, string][] = [
      ['tasks.client_id', (tx, id) => tx.insert(tasks).values({ ...task, clientId: id }), a.client],
      ['tasks.department_id', (tx, id) => tx.insert(tasks).values({ ...task, departmentId: id }), a.department],
      ['tasks.category_id', (tx, id) => tx.insert(tasks).values({ ...task, categoryId: id }), a.category],
      ['tasks.assignee_id', (tx, id) => tx.insert(tasks).values({ ...task, assigneeId: id }), a.staff],
      ['tasks.client_id (update)', (tx, id) => tx.update(tasks).set({ clientId: id }).where(eq(tasks.id, b.task)), a.client],
      ['tasks.assignee_id (update)', (tx, id) => tx.update(tasks).set({ assigneeId: id }).where(eq(tasks.id, b.task)), a.owner],
      ['task_subtasks.task_id', (tx, id) => tx.insert(taskSubtasks).values({ workspaceId: b.ws, taskId: id, title: 'x' }), a.task],
      [
        'task_comments.task_id',
        (tx, id) => tx.insert(taskComments).values({ workspaceId: b.ws, taskId: id, authorName: 'X', text: CIPHERTEXT_SHAPED }),
        a.task,
      ],
      [
        'task_department_members.department_id',
        (tx, id) => tx.insert(taskDepartmentMembers).values({ workspaceId: b.ws, userId: b.owner, departmentId: id }),
        a.department,
      ],
      [
        'task_department_members.user_id',
        (tx, id) => tx.insert(taskDepartmentMembers).values({ workspaceId: b.ws, userId: id, departmentId: b.department }),
        a.staff,
      ],
      [
        'task_client_responsibles.client_id',
        (tx, id) =>
          tx.insert(taskClientResponsibles).values({ workspaceId: b.ws, clientId: id, departmentId: b.department, userId: b.staff }),
        a.client,
      ],
      [
        'task_client_responsibles.department_id',
        (tx, id) => tx.insert(taskClientResponsibles).values({ workspaceId: b.ws, clientId: b.client, departmentId: id, userId: b.staff }),
        a.department,
      ],
      [
        'task_client_responsibles.user_id',
        (tx, id) => tx.update(taskClientResponsibles).set({ userId: id }).where(eq(taskClientResponsibles.workspaceId, b.ws)),
        a.staff,
      ],
    ];
    for (const [label, attempt, foreignId] of attempts) {
      const crossTenant = await pgFailure(withTenant(app.db, b.ws, (tx) => attempt(tx, foreignId)));
      expect(crossTenant?.code, label).toBe('23503');
      // Same answer as for an id that exists nowhere: no existence oracle across workspaces.
      const unknown = await pgFailure(withTenant(app.db, b.ws, (tx) => attempt(tx, randomUUID())));
      expect(unknown, label).toEqual(crossTenant);
      expect(crossTenant?.detail ?? '', label).not.toContain(foreignId);
    }
    for (const table of TASK_TABLES) {
      expect(await countRows(table, a.ws), table).toBe(1);
      expect(await countRows(table, b.ws), table).toBe(1);
    }
  });
});

describe('task tables: only clients (migration 0012)', () => {
  it('a task or a client responsibility never points to a supplier, and a client with tasks stays a client', async () => {
    const a = await seedOffice('A');
    const inA = (fn: (tx: DbExecutor) => Promise<unknown>) => pgFailure(withTenant(app.db, a.ws, fn));
    const attempts: [string, (tx: DbExecutor) => Promise<unknown>][] = [
      ['new task', (tx) => tx.insert(tasks).values({ workspaceId: a.ws, title: 'x', createdByName: 'X', clientId: a.supplier })],
      ['re-pointed task', (tx) => tx.update(tasks).set({ clientId: a.supplier }).where(eq(tasks.id, a.task))],
      [
        'new responsibility',
        (tx) => tx.insert(taskClientResponsibles).values({ workspaceId: a.ws, clientId: a.supplier, departmentId: a.department, userId: a.staff }),
      ],
      ['re-pointed responsibility', (tx) => tx.update(taskClientResponsibles).set({ clientId: a.supplier }).where(eq(taskClientResponsibles.workspaceId, a.ws))],
      ['client turned into a supplier', (tx) => tx.update(contacts).set({ kind: 'supplier' }).where(eq(contacts.id, a.client))],
    ];
    for (const [label, attempt] of attempts) expect((await inA(attempt))?.code, label).toBe('23503');
    // The generated column cannot be written to dodge the rule.
    const forged = await inA((tx) =>
      tx.execute(sql`insert into tasks (workspace_id, title, created_by_name, client_id, client_kind)
                     values (${a.ws}, 'x', 'X', ${a.supplier}, 'supplier')`),
    );
    expect(forged?.code).toBe('428C9');
    expect(await taskRow(a.task)).toMatchObject({ clientId: a.client, clientKind: 'client' });
    // Internal tasks (no client) are unaffected.
    expect(await inA((tx) => tx.insert(tasks).values({ workspaceId: a.ws, title: 'Interna', createdByName: 'X' }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ON DELETE
// ---------------------------------------------------------------------------

describe('task tables: ON DELETE', () => {
  it('a member leaving loses assignments, department and client responsibilities; authorship keeps the name', async () => {
    const a = await seedOffice('A');
    const b = await seedOffice('B');
    // The API login removes members (workspaces module); the cascades run as the table owner.
    await app.db.delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, a.ws), eq(workspaceMembers.userId, a.staff)));

    expect(await taskRow(a.task)).toMatchObject({
      assigneeId: null,
      departmentId: a.department,
      createdBy: a.staff,
      createdByName: a.staffName,
      completedBy: a.staff,
      completedByName: a.staffName,
    });
    expect(await commentRow(a.comment)).toMatchObject({ authorId: a.staff, authorName: a.staffName });
    expect(await countRows('task_department_members', a.ws)).toBe(0);
    expect(await countRows('task_client_responsibles', a.ws)).toBe(0);
    for (const table of TASK_TABLES) expect(await countRows(table, b.ws), table).toBe(1);
  });

  it('deleting an account clears the ids and replaces the recorded name in every workspace (LGPD)', async () => {
    const a = await seedOffice('A');
    const b = await seedOffice('B');
    // The staff member left A before deleting the account: leaving keeps the name, but the account
    // deletion must still reach those rows (no membership left to find them by).
    await app.db.delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, a.ws), eq(workspaceMembers.userId, a.staff)));
    await app.db.delete(users).where(eq(users.id, a.staff));

    expect(await taskRow(a.task)).toMatchObject({
      assigneeId: null,
      createdBy: null,
      createdByName: DELETED_USER,
      completedBy: null,
      completedByName: DELETED_USER,
      status: 'done',
    });
    expect(await commentRow(a.comment)).toMatchObject({ authorId: null, authorName: DELETED_USER, text: a.commentText });
    // No copy of the name is left in any task table.
    for (const table of ['tasks', 'task_comments']) {
      const [found] = await rows<{ n: number }>(
        sql`select count(*)::int as n from ${sql.identifier(table)} t where position(${a.staffName} in t::text) > 0`,
      );
      expect(found!.n, table).toBe(0);
    }
    // Other people and other workspaces are untouched.
    expect(await taskRow(b.task)).toMatchObject({ createdBy: b.staff, createdByName: b.staffName, completedByName: b.staffName });
    expect(await commentRow(b.comment)).toMatchObject({ authorId: b.staff, authorName: b.staffName });
  });

  it('reopening a task (the API clears who concluded it) is not mistaken for an account deletion', async () => {
    const a = await seedOffice('A');
    await withTenant(app.db, a.ws, (tx) =>
      tx
        .update(tasks)
        .set({ status: 'in_progress', reopenStatus: null, completedAt: null, completedBy: null, completedByName: null })
        .where(eq(tasks.id, a.task)),
    );
    expect(await taskRow(a.task)).toMatchObject({ completedBy: null, completedByName: null, createdByName: a.staffName });
  });

  it('clients and departments in use are kept; categories detach; a workspace takes everything with it', async () => {
    const a = await seedOffice('A');
    const b = await seedOffice('B');
    const inA = (fn: (tx: DbExecutor) => Promise<unknown>) => pgFailure(withTenant(app.db, a.ws, fn));

    // A client with tasks is not deleted (the API answers 409); neither is a department in use.
    expect((await inA((tx) => tx.delete(contacts).where(eq(contacts.id, a.client))))?.code).toBe('23503');
    expect((await inA((tx) => tx.delete(taskDepartments).where(eq(taskDepartments.id, a.department))))?.code).toBe('23503');
    // A category goes away and the task only loses the category.
    expect(await inA((tx) => tx.delete(taskCategories).where(eq(taskCategories.id, a.category)))).toBeNull();
    expect(await taskRow(a.task)).toMatchObject({ workspaceId: a.ws, categoryId: null, clientId: a.client, departmentId: a.department });

    // Without tasks, deleting the client drops its responsibilities (configuration), nothing else.
    expect(await inA((tx) => tx.delete(tasks).where(eq(tasks.id, a.task)))).toBeNull();
    expect(await countRows('task_subtasks', a.ws)).toBe(0);
    expect(await countRows('task_comments', a.ws)).toBe(0);
    expect(await inA((tx) => tx.delete(contacts).where(eq(contacts.id, a.client)))).toBeNull();
    expect(await countRows('task_client_responsibles', a.ws)).toBe(0);
    expect(await countRows('task_department_members', a.ws)).toBe(1);

    // Deleting the workspace (API login) leaves no task row behind; the other office is intact.
    const c = await seedOffice('C');
    await app.db.delete(workspaces).where(eq(workspaces.id, c.ws));
    for (const table of TASK_TABLES) {
      expect(await countRows(table, c.ws), table).toBe(0);
      expect(await countRows(table, b.ws), table).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// CHECKs
// ---------------------------------------------------------------------------

describe('task tables: CHECKs', () => {
  it('enumerations follow the contract', async () => {
    const defs = await rows<{ name: string; def: string }>(sql`
      select conname as name, pg_get_constraintdef(oid) as def from pg_constraint
       where contype = 'c' and conname in ('tasks_status_chk', 'tasks_priority_chk', 'tasks_reopen_status_chk')`);
    const values = (name: string) => [...defs.find((d) => d.name === name)!.def.matchAll(/'([^']*)'::text/g)].map((m) => m[1]).sort();
    expect(values('tasks_status_chk')).toEqual([...TASK_STATUSES].sort());
    expect(values('tasks_priority_chk')).toEqual([...TASK_PRIORITIES].sort());
    expect(values('tasks_reopen_status_chk')).toEqual([...OPEN_TASK_STATUSES].sort());
  });

  it('rejects values outside the contract, oversized text, clear text where encrypted and inconsistent conclusions', async () => {
    const a = await seedOffice('A');
    // Ciphertext shaped, one character over the ceiling of 0013.
    const oversized = `v1.${'A'.repeat(16)}.${'B'.repeat(28_000 - 20 + 1)}`;
    const checks: [string, ReturnType<typeof sql>][] = [
      ['category name empty', sql`update task_categories set name = '' where id = ${a.category}`],
      ['category name size (0012)', sql`update task_categories set name = ${'x'.repeat(61)} where id = ${a.category}`],
      ['category color', sql`update task_categories set color = 'red' where id = ${a.category}`],
      ['department name size', sql`update task_departments set name = ${'x'.repeat(81)} where id = ${a.department}`],
      ['description empty', sql`update tasks set description = '' where id = ${a.task}`],
      ['description in clear text (0013)', sql`update tasks set description = 'Pedir na Receita' where id = ${a.task}`],
      ['description malformed ciphertext (0013)', sql`update tasks set description = ${'v1.abc.def'} where id = ${a.task}`],
      ['description over the ceiling (0013)', sql`update tasks set description = ${oversized} where id = ${a.task}`],
      ['title size', sql`update tasks set title = ${'x'.repeat(201)} where id = ${a.task}`],
      ['status', sql`update tasks set status = 'archived' where id = ${a.task}`],
      ['priority', sql`update tasks set priority = 'whenever' where id = ${a.task}`],
      ['reopen status', sql`update tasks set reopen_status = 'done' where id = ${a.task}`],
      ['done without conclusion', sql`update tasks set completed_at = null where id = ${a.task}`],
      ['conclusion while open', sql`update tasks set status = 'todo' where id = ${a.task}`],
      ['conclusion without name', sql`update tasks set completed_by_name = null where id = ${a.task}`],
      ['start after due', sql`update tasks set start_date = '2026-10-11' where id = ${a.task}`],
      ['time without due date', sql`update tasks set due_date = null, start_time = '09:00' where id = ${a.task}`],
      ['end before start', sql`update tasks set start_time = '10:00', end_time = '09:30' where id = ${a.task}`],
      ['malformed time', sql`update tasks set start_time = '24:00' where id = ${a.task}`],
      ['subtask title', sql`update task_subtasks set title = '' where id = ${a.subtask}`],
      ['comment in clear text (0013)', sql`update task_comments set text = 'Enviado ao cliente' where id = ${a.comment}`],
      ['comment over the ceiling (0013)', sql`update task_comments set text = ${oversized} where id = ${a.comment}`],
      ['creator name empty (0012)', sql`update tasks set created_by_name = '' where id = ${a.task}`],
      ['concluder name size (0012)', sql`update tasks set completed_by_name = ${'x'.repeat(121)} where id = ${a.task}`],
      ['author name size (0012)', sql`update task_comments set author_name = ${'x'.repeat(121)} where id = ${a.comment}`],
    ];
    for (const [label, q] of checks) expect((await pgFailure(admin().execute(q)))?.code, label).toBe('23514');
    // The limits themselves are accepted: the longest text the contract allows (5000 characters of 3
    // UTF-8 bytes each) encrypted, and the ceiling.
    await admin().execute(sql`update task_categories set name = ${'x'.repeat(60)} where id = ${a.category}`);
    const cipher = await getCipher(a.ws);
    const longest = await encryptTaskText(cipher, TASK_DESCRIPTION, '€'.repeat(5000));
    expect(longest.length).toBeLessThanOrEqual(28_000);
    await admin().execute(sql`update tasks set description = ${longest} where id = ${a.task}`);
    const longestComment = await encryptTaskText(cipher, TASK_COMMENT_TEXT, '€'.repeat(5000));
    await admin().execute(sql`update task_comments set text = ${longestComment} where id = ${a.comment}`);
    await admin().execute(sql`update tasks set description = ${oversized.slice(0, 28_000)} where id = ${a.task}`);
  });
});

// ---------------------------------------------------------------------------
// Indexes of the hot reads (an office's history only grows)
// ---------------------------------------------------------------------------

describe('task tables: indexes', () => {
  /** Index names used by the plan of `query`, run as the tenant (sequential scans discouraged). */
  async function indexesUsed(workspaceId: string, query: ReturnType<typeof sql>): Promise<string[]> {
    const plan = await withTenant(app.db, workspaceId, async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`);
      return executeRows<{ 'QUERY PLAN': unknown }>(tx, sql`explain (format json) ${query}`);
    });
    const names: string[] = [];
    const walk = (node: Record<string, unknown>) => {
      if (typeof node['Index Name'] === 'string') names.push(node['Index Name']);
      for (const child of (node.Plans as Record<string, unknown>[] | undefined) ?? []) walk(child);
    };
    const raw = plan[0]!['QUERY PLAN'];
    const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as { Plan: Record<string, unknown> }[];
    walk(parsed[0]!.Plan);
    return names;
  }

  it('open tasks by assignee/department and recent comments use the indexes of 0012 (same predicate as the API)', async () => {
    const a = await seedOffice('A');
    // A history of closed tasks and a handful of open ones, as in an office after a few years.
    await admin().execute(sql`
      insert into tasks (workspace_id, title, assignee_id, department_id, status, completed_at, completed_by_name, created_by_name, due_date)
      select ${a.ws}, 'Antiga ' || g, ${a.staff}, ${a.department}, 'done', now(), 'Equipe', 'Equipe', date '2024-01-01' + g % 600
        from generate_series(1, 2000) g`);
    await admin().execute(sql`
      insert into tasks (workspace_id, title, assignee_id, department_id, status, created_by_name, due_date)
      select ${a.ws}, 'Aberta ' || g, ${a.staff}, ${a.department}, 'todo', 'Equipe', date '2026-10-01' + g from generate_series(1, 5) g`);
    await admin().execute(sql`analyze tasks`);
    await admin().execute(sql`analyze task_comments`);

    const mine = await indexesUsed(
      a.ws,
      sql`select id from tasks where ${and(eq(tasks.workspaceId, a.ws), eq(tasks.assigneeId, a.staff), OPEN_SQL)} order by due_date`,
    );
    expect(mine).toContain('tasks_open_assignee_idx');
    const department = await indexesUsed(
      a.ws,
      sql`select count(*) from tasks where ${and(eq(tasks.workspaceId, a.ws), eq(tasks.departmentId, a.department), OPEN_SQL)}`,
    );
    expect(department).toContain('tasks_open_department_idx');
    const activity = await indexesUsed(
      a.ws,
      sql`select id from task_comments where workspace_id = ${a.ws} and created_at >= now() - interval '5 days' order by created_at desc limit 50`,
    );
    expect(activity).toContain('task_comments_recent_idx');
  });
});

// ---------------------------------------------------------------------------
// LGPD through the API: export and account deletion
// ---------------------------------------------------------------------------

describe('task data and LGPD', () => {
  it('the workspace export carries every task table of the workspace, and only of it', async () => {
    const owner = await registerUser(app, 'Ana Titular');
    const other = await registerUser(app, 'Outro Escritório');
    expect((await other.post('/tasks', { title: 'Tarefa de outro espaço' })).status).toBe(201);

    const client = await owner.post('/clients', {
      name: 'Padaria Pão Dourado Ltda',
      document: '11.222.333/0001-81',
      taxRegime: 'simples_nacional',
      simplesAnnex: 'I',
      contractStartDate: '2025-01-10',
    });
    expect(client.status).toBe(201);
    const department = await owner.post('/tasks/departments', { name: 'Fiscal', memberIds: [owner.userId] });
    const category = await owner.post('/tasks/categories', { name: 'Certidões' });
    expect(
      (await owner.put('/tasks/client-responsibles', { clientId: client.body.id, departmentId: department.body.id, userId: owner.userId }))
        .status,
    ).toBe(200);
    const task = await owner.post('/tasks', {
      title: 'Certidão negativa',
      description: 'Pedir na Receita',
      clientId: client.body.id,
      categoryId: category.body.id,
      assigneeId: owner.userId,
    });
    expect(task.status).toBe(201);
    await owner.post(`/tasks/${task.body.id}/subtasks`, { title: 'Emitir guia' });
    await owner.post(`/tasks/${task.body.id}/comments`, { text: 'Cliente enviou o CNPJ' });

    const exported = await owner.get('/workspaces/current/export');
    expect(exported.status).toBe(200);
    const data = exported.body;
    expect(data.taskDepartments).toEqual([expect.objectContaining({ id: department.body.id, name: 'Fiscal' })]);
    expect(data.taskDepartmentMembers).toEqual([expect.objectContaining({ userId: owner.userId, departmentId: department.body.id })]);
    expect(data.taskCategories).toEqual([expect.objectContaining({ id: category.body.id, name: 'Certidões' })]);
    expect(data.tasks).toEqual([
      expect.objectContaining({ id: task.body.id, title: 'Certidão negativa', description: 'Pedir na Receita', createdByName: 'Ana Titular' }),
    ]);
    expect(data.taskSubtasks).toEqual([expect.objectContaining({ taskId: task.body.id, title: 'Emitir guia' })]);
    expect(data.taskComments).toEqual([
      expect.objectContaining({ taskId: task.body.id, text: 'Cliente enviou o CNPJ', authorName: 'Ana Titular' }),
    ]);
    // Exported decrypted (like the other encrypted fields), stored encrypted (0013).
    expect(await storedDescription(task.body.id)).toMatch(CIPHERTEXT);
    expect(await storedComment(data.taskComments[0].id)).toMatch(CIPHERTEXT);
    expect(JSON.stringify([data.tasks, data.taskComments])).not.toMatch(/v1\.[\w-]{16}\./);
    expect(data.taskClientResponsibles).toEqual([
      expect.objectContaining({ clientId: client.body.id, departmentId: department.body.id, userId: owner.userId }),
    ]);
    expect(JSON.stringify(data)).not.toContain('Tarefa de outro espaço');
  });

  it("deleting an account removes its own office's tasks and anonymizes its authorship in other offices", async () => {
    const ana = await registerUser(app, 'Ana Titular');
    const bruno = await registerUser(app, 'Bruno Colaborador', `bruno-${randomUUID()}@teste.com`);
    const brunoOffice = (await bruno.get('/auth/me')).body.workspace.id as string;
    expect((await bruno.post('/tasks', { title: 'Tarefa no próprio escritório' })).status).toBe(201);

    // Bruno joins Ana's office (the session switches to it), creates, comments and concludes a task.
    const created = await ana.post('/workspaces/current/invites', { email: bruno.email, role: 'viewer' });
    expect(created.status).toBe(201);
    expect((await bruno.post(`/invites/${created.body.inviteUrl.split('/convite/')[1]}/accept`)).status).toBe(200);
    const task = await bruno.post('/tasks', { title: 'Folha de outubro', assigneeId: bruno.userId });
    expect(task.status).toBe(201);
    expect((await bruno.post(`/tasks/${task.body.id}/comments`, { text: 'Holerites conferidos' })).status).toBe(201);
    expect((await bruno.patch(`/tasks/${task.body.id}/status`, { status: 'done' })).status).toBe(200);

    expect((await bruno.del('/auth/me', { password: TEST_PASSWORD })).status).toBe(204);

    const detail = (await ana.get(`/tasks/${task.body.id}`)).body;
    expect(detail.assignee).toBeNull();
    expect(detail.createdBy).toEqual({ id: null, name: DELETED_USER });
    expect(detail.completedBy).toEqual({ id: null, name: DELETED_USER });
    expect(detail.comments).toEqual([expect.objectContaining({ author: { id: null, name: DELETED_USER }, text: 'Holerites conferidos' })]);
    // Bruno's own office went with the account (sole owner), tasks included.
    for (const table of TASK_TABLES) expect(await countRows(table, brunoOffice), table).toBe(0);
    const [left] = await rows<{ n: number }>(
      sql`select (select count(*) from tasks where created_by_name like 'Bruno%' or completed_by_name like 'Bruno%')
               + (select count(*) from task_comments where author_name like 'Bruno%') as n`,
    );
    expect(Number(left!.n)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Descriptions and comments encrypted (migration 0013)
// ---------------------------------------------------------------------------

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');

/** Applies a migration file again as the owner, split like the migrator does. */
async function rerunMigration(file: string) {
  const source = await readFile(path.join(migrationsFolder, file), 'utf8');
  for (const statement of source.split('--> statement-breakpoint')) {
    if (statement.trim()) await admin().execute(sql.raw(statement));
  }
}

/** A member of `owner`'s workspace (invite accepted: the session switches to it). */
async function join(owner: Awaited<ReturnType<typeof registerUser>>, name: string) {
  const email = `membro-${randomUUID()}@teste.com`;
  const invite = await owner.post('/workspaces/current/invites', { email, role: 'viewer' });
  expect(invite.status).toBe(201);
  const guest = await registerUser(app, name, email);
  expect((await guest.post(`/invites/${invite.body.inviteUrl.split('/convite/')[1]}/accept`)).status).toBe(200);
  return guest;
}

/** Rows of the task tables whose text (any column) contains `needle`. */
async function clearTextCopies(needle: string): Promise<number> {
  const [found] = await rows<{ n: number }>(
    sql`select (select count(*) from tasks t where position(${needle} in t::text) > 0)
             + (select count(*) from task_comments c where position(${needle} in c::text) > 0) as n`,
  );
  return Number(found!.n);
}

describe('task descriptions and comments encrypted (migration 0013)', () => {
  it('are stored as ciphertext and come back as text from every route that shows them', async () => {
    const ana = await registerUser(app, 'Ana Titular');
    const carla = await join(ana, 'Carla Souza');
    const ws = (await ana.get('/auth/me')).body.workspace.id as string;
    const cipher = await getCipher(ws);

    const created = await ana.post('/tasks', { title: 'Certidão negativa', description: 'Pedir a CND na Receita', assigneeId: carla.userId });
    expect(created.status).toBe(201);
    expect(created.body.description).toBe('Pedir a CND na Receita');
    const id = created.body.id as string;
    const first = await storedDescription(id);
    expect(first).toMatch(CIPHERTEXT);
    expect(await cipher.decrypt('tasks', 'description', first)).toBe('Pedir a CND na Receita');

    // Autosave: a new ciphertext (fresh IV) each time; clearing stores null.
    const edited = await carla.patch(`/tasks/${id}`, { description: 'Pedir a CND na Receita e na PGFN' });
    expect(edited.body.description).toBe('Pedir a CND na Receita e na PGFN');
    const second = await storedDescription(id);
    expect(second).toMatch(CIPHERTEXT);
    expect(second).not.toBe(first);
    expect((await carla.patch(`/tasks/${id}`, { description: null })).body.description).toBeNull();
    expect(await storedDescription(id)).toBeNull();
    expect((await carla.patch(`/tasks/${id}`, { description: 'Pedir a CND na Receita' })).body.description).toBe('Pedir a CND na Receita');

    const long = `Cliente enviou o contrato social e a última alteração; falta a procuração assinada ${'.'.repeat(20)}`;
    const comment = await carla.post(`/tasks/${id}/comments`, { text: long });
    expect(comment.status).toBe(201);
    expect(comment.body.text).toBe(long);
    expect(await storedComment(comment.body.id)).toMatch(CIPHERTEXT);

    const detail = (await ana.get(`/tasks/${id}`)).body;
    expect(detail.description).toBe('Pedir a CND na Receita');
    expect(detail.comments).toEqual([expect.objectContaining({ id: comment.body.id, text: long })]);
    // Ana created the task: Carla's comment shows up in her activity, as an 80-character excerpt.
    expect((await ana.get('/tasks/activity')).body).toEqual([expect.objectContaining({ taskId: id, text: `${long.slice(0, 80)}…` })]);

    // The list never carries descriptions; its search looks at titles only (descriptions are encrypted).
    const list = await ana.get('/tasks');
    expect(list.body.items).toHaveLength(1);
    expect(list.raw.body).not.toMatch(/v1\.[\w-]{16}\./);
    expect(list.raw.body).not.toContain('Receita');
    expect((await ana.get('/tasks?search=Receita')).body.total).toBe(0);
    expect((await ana.get('/tasks?search=certid')).body.total).toBe(1);

    // No clear-text copy anywhere in the task tables.
    expect(await clearTextCopies('Receita')).toBe(0);
    expect(await clearTextCopies('procuração')).toBe(0);
  });

  it('a ciphertext only opens in its own workspace, table and column', async () => {
    const ana = await registerUser(app, 'Ana Titular');
    const bruno = await registerUser(app, 'Bruno Outro');
    const wsA = (await ana.get('/auth/me')).body.workspace.id as string;
    const wsB = (await bruno.get('/auth/me')).body.workspace.id as string;
    const taskA = await ana.post('/tasks', { title: 'Folha', description: 'Salário do diretor: confidencial' });
    const taskB = await bruno.post('/tasks', { title: 'Balancete', description: 'Do Bruno' });
    expect(taskB.status).toBe(201);
    const stolen = (await storedDescription(taskA.body.id))!;

    // Copied into the other workspace's task (a database-level move): B's key does not open it.
    await admin().execute(sql`update tasks set description = ${stolen} where id = ${taskB.body.id}`);
    const res = await bruno.get(`/tasks/${taskB.body.id}`);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal_error', message: 'Erro inesperado. Tente novamente.' });
    expect(res.raw.body).not.toContain('confidencial');
    await expect((await getCipher(wsB)).decrypt(TASK_DESCRIPTION.table, TASK_DESCRIPTION.column, stolen)).rejects.toBeInstanceOf(
      DecryptionError,
    );
    // Same workspace, another column: a description is not a comment.
    await expect((await getCipher(wsA)).decrypt(TASK_COMMENT_TEXT.table, TASK_COMMENT_TEXT.column, stolen)).rejects.toBeInstanceOf(
      DecryptionError,
    );
    expect(await (await getCipher(wsA)).decrypt(TASK_DESCRIPTION.table, TASK_DESCRIPTION.column, stolen)).toBe(
      'Salário do diretor: confidencial',
    );
    // A's own task is intact.
    expect((await ana.get(`/tasks/${taskA.body.id}`)).body.description).toBe('Salário do diretor: confidencial');
  });

  it('text with a NUL character is refused before encrypting (the database never sees it)', async () => {
    const ana = await registerUser(app, 'Ana Titular');
    const task = await ana.post('/tasks', { title: 'Base' });
    for (const res of [
      await ana.post('/tasks', { title: 'Com descrição', description: 'a\u0000b' }),
      await ana.patch(`/tasks/${task.body.id}`, { description: 'a\u0000b' }),
      await ana.post(`/tasks/${task.body.id}/comments`, { text: 'oi\u0000' }),
    ]) {
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'validation_error', message: 'O texto enviado contém caracteres inválidos.' });
    }
    expect((await ana.get('/tasks')).body.total).toBe(1);
  });

  it('the backfill encrypts rows written before 0013, and the migration runs again over them', async () => {
    const ana = await registerUser(app, 'Ana Titular');
    const ws = (await ana.get('/auth/me')).body.workspace.id as string;
    const current = await ana.post('/tasks', { title: 'Já cifrada', description: 'Escrita depois da 0013' });
    const currentComment = await ana.post(`/tasks/${current.body.id}/comments`, { text: 'Também cifrado' });
    const keptDescription = await storedDescription(current.body.id);
    const keptComment = await storedComment(currentComment.body.id);

    // The database as it was before 0013 (0012's CHECKs), with clear text written by the old API.
    let restored = false;
    await admin().execute(sql.raw(`alter table tasks drop constraint tasks_description_chk;
      alter table tasks add constraint tasks_description_chk check (length(description) between 1 and 5000);
      alter table task_comments drop constraint task_comments_text_chk;
      alter table task_comments add constraint task_comments_text_chk check (length(text) between 1 and 5000)`));
    try {
      const [legacy] = await admin()
        .insert(tasks)
        .values({ workspaceId: ws, title: 'Antiga', description: 'Contrato social antigo', createdByName: 'Ana Titular' })
        .returning();
      const [legacyComment] = await admin()
        .insert(taskComments)
        .values({ workspaceId: ws, taskId: legacy!.id, authorId: ana.userId, authorName: 'Ana Titular', text: 'Comentário de antes da cifra' })
        .returning();
      expect(await needsBackfill(app.db)).toBe(false);

      // 0013 again (re-runnable, NOT VALID over the clear text) marks every workspace for the backfill…
      await rerunMigration('0013_tasks_encrypted_text.sql');
      restored = true;
      expect(await needsBackfill(app.db)).toBe(true);
      // …and refuses new clear text right away.
      expect((await pgFailure(admin().execute(sql`update tasks set title = 'Antiga!' where id = ${legacy!.id}`)))?.code).toBe('23514');

      expect(await backfillEncryption(app.db)).toEqual({ workspaces: 1, rows: 2 });
      expect(await needsBackfill(app.db)).toBe(false);
      expect(await storedDescription(legacy!.id)).toMatch(CIPHERTEXT);
      expect(await storedComment(legacyComment!.id)).toMatch(CIPHERTEXT);
      expect(await clearTextCopies('Contrato social antigo')).toBe(0);
      expect(await clearTextCopies('antes da cifra')).toBe(0);
      // What was already encrypted is left as it was.
      expect(await storedDescription(current.body.id)).toBe(keptDescription);
      expect(await storedComment(currentComment.body.id)).toBe(keptComment);

      const detail = (await ana.get(`/tasks/${legacy!.id}`)).body;
      expect(detail.description).toBe('Contrato social antigo');
      expect(detail.comments).toEqual([expect.objectContaining({ text: 'Comentário de antes da cifra' })]);
      // A second backfill finds nothing to do.
      await admin().update(workspaces).set({ encryptionBackfilledAt: null }).where(eq(workspaces.id, ws));
      expect(await backfillEncryption(app.db)).toEqual({ workspaces: 1, rows: 0 });
    } finally {
      if (!restored) await rerunMigration('0013_tasks_encrypted_text.sql');
    }
  });
});
