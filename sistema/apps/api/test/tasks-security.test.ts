// Security of the task module (phase 1): which routes are for administrators (inventory from the real
// route tree, so a route added later must be classified), isolation of ids between workspaces and
// between tasks, mass assignment and authorship, input limits, bounded responses and no financial or
// encrypted personal data for a collaborator (`viewer`).
// Today is pinned to 2026-10-20 (vitest.config.ts).

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { getCipher } from '../src/lib/crypto/keyring';
import { executeRows } from '../src/lib/sql';
import { TASK_ADMIN_MESSAGE } from '../src/modules/tasks/access';
import { encryptTaskText, TASK_COMMENT_TEXT } from '../src/modules/tasks/encrypted-text';
import { MAX_COMMENTS_PER_TASK, MAX_SUBTASKS_PER_TASK } from '../src/modules/tasks/service';
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

async function member(owner: Client, role: 'editor' | 'viewer', name: string): Promise<Client> {
  const email = `${role}-${randomUUID()}@teste.com`;
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

const CLIENT = {
  name: 'Padaria Pão Dourado Ltda',
  tradeName: 'Pão Dourado',
  document: '11.222.333/0001-81',
  email: 'financeiro@paodourado.com.br',
  phone: '(11) 98765-4321',
  responsibleName: 'Joaquim Responsável',
  responsibleEmail: 'joaquim@paodourado.com.br',
  responsiblePhone: '(11) 91234-5678',
  taxRegime: 'simples_nacional',
  simplesAnnex: 'I',
  contractStartDate: '2026-01-10',
};

/** Owner Ana, editor Bruno and viewer Carla; department Fiscal with Ana and Carla. */
async function office() {
  const ana = await registerUser(app, 'Ana Paula Ribeiro');
  const bruno = await member(ana, 'editor', 'Bruno Carvalho');
  const carla = await member(ana, 'viewer', 'Carla Souza');
  const fiscal = await ana.post('/tasks/departments', {
    name: 'Fiscal',
    memberIds: [ana.userId, carla.userId],
  });
  expect(fiscal.status).toBe(201);
  return { ana, bruno, carla, fiscal: fiscal.body.id as string };
}

// ---------------------------------------------------------------------------
// Route inventory
// ---------------------------------------------------------------------------

interface Route {
  method: string;
  path: string;
}

/** Every route of the app, from Fastify's own route tree (same parser as finance-access.test.ts). */
function routesOf(instance: App): Route[] {
  const found = new Map<string, Route>();
  const stack: string[] = [];
  for (const line of instance.printRoutes({ commonPrefix: false }).split('\n')) {
    const m = /^((?:[│ ] {3})*)[├└]── (.+?)(?: \(([^)]+)\))?$/.exec(line);
    if (!m) continue;
    const depth = m[1]!.length / 4;
    const path = (depth > 0 ? stack[depth - 1]! : '') + m[2]!;
    stack[depth] = path;
    stack.length = depth + 1;
    for (const method of (m[3] ?? '').split(', ').filter(Boolean)) {
      if (method === 'HEAD' || method === 'OPTIONS') continue;
      const normalized = path.length > 1 ? path.replace(/\/$/, '') : path;
      found.set(`${method} ${normalized}`, { method, path: normalized });
    }
  }
  return [...found.values()];
}

/** Registries and deletions: owner/editor only. */
const ADMIN_ROUTES = new Set([
  'PUT /api/tasks/members/:userId/department',
  'POST /api/tasks/departments',
  'PUT /api/tasks/departments/:id',
  'DELETE /api/tasks/departments/:id',
  'POST /api/tasks/categories',
  'PUT /api/tasks/categories/:id',
  'DELETE /api/tasks/categories/:id',
  'PUT /api/tasks/client-responsibles',
  'DELETE /api/tasks/:id',
]);

/** Every member, `viewer` included (tasks, subtasks, comments and the reads). */
const MEMBER_ROUTES = new Set([
  'GET /api/tasks/options',
  'GET /api/tasks/clients',
  'GET /api/tasks/members',
  'GET /api/tasks/departments',
  'GET /api/tasks/categories',
  'GET /api/tasks/client-responsibles',
  'GET /api/tasks/home',
  'GET /api/tasks/activity',
  'GET /api/tasks',
  'POST /api/tasks',
  'GET /api/tasks/:id',
  'PATCH /api/tasks/:id',
  'PATCH /api/tasks/:id/status',
  'POST /api/tasks/:id/subtasks',
  'PATCH /api/tasks/:id/subtasks/:subtaskId',
  'DELETE /api/tasks/:id/subtasks/:subtaskId',
  'POST /api/tasks/:id/comments',
]);

const concrete = (path: string) => path.replace(/:[A-Za-z]+/g, () => randomUUID());

async function call(c: Client, method: string, url: string) {
  const res = await app.inject({
    method: method as 'GET',
    url,
    headers: { authorization: `Bearer ${c.token}` },
    ...(method === 'GET' || method === 'DELETE' ? {} : { payload: {} }),
  });
  return { status: res.statusCode, body: res.body ? res.json() : undefined };
}

describe('tasks security: who may call each route', () => {
  it('every task route is classified; a viewer gets 403 exactly on the administrator routes', async () => {
    const taskRoutes = routesOf(app)
      .filter((r) => r.path === '/api/tasks' || r.path.startsWith('/api/tasks/'))
      .map((r) => `${r.method} ${r.path}`);
    // A new route must be added to one of the lists (registries/deletions also need `requireTaskAdmin`).
    expect(
      taskRoutes.filter((k) => !ADMIN_ROUTES.has(k) && !MEMBER_ROUTES.has(k)),
      'classify the new task route',
    ).toEqual([]);
    expect(taskRoutes.sort()).toEqual([...ADMIN_ROUTES, ...MEMBER_ROUTES].sort());

    const { ana, bruno, carla } = await office();
    for (const key of ADMIN_ROUTES) {
      const [method, path] = key.split(' ') as [string, string];
      const res = await call(carla, method, concrete(path));
      expect(res.status, key).toBe(403);
      expect(res.body.message, key).toBe(TASK_ADMIN_MESSAGE);
    }
    // Members are never refused by role (unknown ids / empty bodies: 404/400, reads: 200).
    for (const key of MEMBER_ROUTES) {
      const [method, path] = key.split(' ') as [string, string];
      const res = await call(carla, method, concrete(path));
      expect(res.status, key).not.toBe(403);
      expect(res.status, key).toBeLessThan(500);
    }
    // Administrators (owner and editor) are never refused.
    for (const c of [ana, bruno]) {
      for (const key of [...ADMIN_ROUTES, ...MEMBER_ROUTES]) {
        const [method, path] = key.split(' ') as [string, string];
        const res = await call(c, method, concrete(path));
        expect(res.status, key).not.toBe(403);
        expect(res.status, key).toBeLessThan(500);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Ids of other workspaces and of other tasks
// ---------------------------------------------------------------------------

describe('tasks security: ids outside their scope', () => {
  it('a subtask is only reachable through its own task', async () => {
    const { ana, carla } = await office();
    const t1 = await ana.post('/tasks', { title: 'Admissão' });
    const t2 = await carla.post('/tasks', { title: 'Rescisão' });
    const sub = await ana.post(`/tasks/${t1.body.id}/subtasks`, { title: 'Exame admissional' });
    expect(sub.status).toBe(201);

    expect(
      (await carla.patch(`/tasks/${t2.body.id}/subtasks/${sub.body.id}`, { done: true })).status,
    ).toBe(404);
    expect((await carla.del(`/tasks/${t2.body.id}/subtasks/${sub.body.id}`)).status).toBe(404);
    const detail = (await ana.get(`/tasks/${t1.body.id}`)).body;
    expect(detail.subtasks).toEqual([
      expect.objectContaining({ id: sub.body.id, title: 'Exame admissional', done: false }),
    ]);
    expect((await ana.get(`/tasks/${t2.body.id}`)).body.subtasks).toEqual([]);
  });

  it('subtasks, registries and references of another workspace are "not found"', async () => {
    const a = await office();
    const b = await registerUser(app, 'Outro Escritório');
    const clientA = (await a.ana.post('/clients', CLIENT)).body.id as string;
    const catA = (await a.ana.post('/tasks/categories', { name: 'Certidões' })).body.id as string;
    const task = await a.ana.post('/tasks', { title: 'Certidão', clientId: clientA });
    const sub = await a.ana.post(`/tasks/${task.body.id}/subtasks`, { title: 'Emitir' });

    expect(
      (await b.patch(`/tasks/${task.body.id}/subtasks/${sub.body.id}`, { title: 'x' })).status,
    ).toBe(404);
    expect((await b.del(`/tasks/${task.body.id}/subtasks/${sub.body.id}`)).status).toBe(404);
    expect((await b.put(`/tasks/departments/${a.fiscal}`, { name: 'Invadido' })).status).toBe(404);
    expect((await b.del(`/tasks/departments/${a.fiscal}`)).status).toBe(404);
    expect((await b.put(`/tasks/categories/${catA}`, { name: 'Invadida' })).status).toBe(404);
    expect((await b.del(`/tasks/categories/${catA}`)).status).toBe(404);
    expect((await b.get(`/tasks/home?departmentId=${a.fiscal}`)).status).toBe(404);
    // Filters with foreign ids find nothing (never the other workspace's rows).
    for (const filter of [
      `clientId=${clientA}`,
      `departmentId=${a.fiscal}`,
      `categoryId=${catA}`,
    ]) {
      expect((await b.get(`/tasks?${filter}`)).body.total, filter).toBe(0);
    }
    // A foreign task cannot be moved into a department/category of this workspace and vice versa.
    const own = await b.post('/tasks', { title: 'Própria' });
    expect((await b.patch(`/tasks/${own.body.id}`, { departmentId: a.fiscal })).status).toBe(404);
    expect((await b.patch(`/tasks/${own.body.id}`, { categoryId: catA })).status).toBe(404);
    expect((await b.patch(`/tasks/${own.body.id}`, { clientId: clientA })).status).toBe(404);
    expect((await b.patch(`/tasks/${own.body.id}`, { assigneeId: a.carla.userId })).status).toBe(
      422,
    );
    // Responsible per client: every id is checked (client, department and member).
    const deptB = (await b.post('/tasks/departments', { name: 'Fiscal B' })).body.id as string;
    const clientB = (await b.post('/clients', CLIENT)).body.id as string;
    const put = (body: object) => b.put('/tasks/client-responsibles', body);
    expect((await put({ clientId: clientA, departmentId: deptB, userId: b.userId })).status).toBe(
      404,
    );
    expect(
      (await put({ clientId: clientB, departmentId: a.fiscal, userId: b.userId })).status,
    ).toBe(404);
    expect(
      (await put({ clientId: clientB, departmentId: deptB, userId: a.carla.userId })).status,
    ).toBe(422);
    expect(
      (await b.put(`/tasks/departments/${deptB}`, { name: 'Fiscal B', memberIds: [a.ana.userId] }))
        .status,
    ).toBe(422);

    // Workspace A is untouched.
    const detail = (await a.ana.get(`/tasks/${task.body.id}`)).body;
    expect(detail.subtasks.map((s: any) => s.title)).toEqual(['Emitir']);
    expect((await a.ana.get('/tasks/departments')).body.map((d: any) => d.name)).toEqual([
      'Fiscal',
    ]);
    expect((await a.ana.get('/tasks/categories')).body.map((c: any) => c.name)).toEqual([
      'Certidões',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Mass assignment and authorship
// ---------------------------------------------------------------------------

describe('tasks security: server-owned fields', () => {
  const FORGED = '00000000-0000-4000-8000-000000000000';

  it('who created, who concluded, when, the status and the workspace never come from the body', async () => {
    const { ana, carla } = await office();
    const other = await registerUser(app, 'Outro Escritório');
    const otherWs = await workspaceOf(other);
    const created = await carla.post('/tasks', {
      title: 'Conferir notas',
      createdBy: ana.userId,
      createdByName: 'Diretoria',
      completedBy: ana.userId,
      completedAt: '2020-01-01T00:00:00.000Z',
      workspaceId: otherWs,
      id: FORGED,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      createdBy: { id: carla.userId, name: 'Carla Souza' },
      completedBy: null,
      completedAt: null,
      status: 'todo',
    });
    expect(created.body.id).not.toBe(FORGED);
    const id = created.body.id as string;

    const patched = await carla.patch(`/tasks/${id}`, {
      title: 'Conferir notas de entrada',
      status: 'done',
      reopenStatus: 'waiting_client',
      completedAt: '2020-01-01T00:00:00.000Z',
      completedBy: ana.userId,
      completedByName: 'Diretoria',
      createdBy: ana.userId,
      createdAt: '2020-01-01T00:00:00.000Z',
      workspaceId: otherWs,
    });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({
      title: 'Conferir notas de entrada',
      status: 'todo',
      reopenStatus: 'todo',
      completedAt: null,
      completedBy: null,
      createdBy: { id: carla.userId },
    });
    expect(patched.body.createdAt).not.toBe('2020-01-01T00:00:00.000Z');
    const rows = await executeRows<{ ws: string }>(
      admin(),
      sql`select workspace_id::text as ws from tasks where id = ${id}`,
    );
    expect(rows).toEqual([{ ws: await workspaceOf(ana) }]);

    // The comment author is the session member, whatever the body says.
    const comment = await carla.post(`/tasks/${id}/comments`, {
      text: 'Faltam duas notas.',
      authorId: ana.userId,
      authorName: 'Ana Paula Ribeiro',
      isYours: false,
      createdAt: '2020-01-01T00:00:00.000Z',
    });
    expect(comment.status).toBe(201);
    expect(comment.body).toMatchObject({
      author: { id: carla.userId, name: 'Carla Souza' },
      isYours: true,
    });
    expect(comment.body.createdAt).not.toBe('2020-01-01T00:00:00.000Z');
    const seenByAna = (await ana.get(`/tasks/${id}`)).body.comments[0];
    expect(seenByAna).toMatchObject({ author: { id: carla.userId }, isYours: false });

    // A subtask cannot be moved to another task through its body.
    const t2 = await ana.post('/tasks', { title: 'Outra' });
    const sub = await carla.post(`/tasks/${id}/subtasks`, { title: 'Baixar XMLs' });
    const subPatch = await carla.patch(`/tasks/${id}/subtasks/${sub.body.id}`, {
      done: true,
      taskId: t2.body.id,
      workspaceId: otherWs,
    });
    expect(subPatch.status).toBe(200);
    expect((await ana.get(`/tasks/${id}`)).body.subtasks).toHaveLength(1);
    expect((await ana.get(`/tasks/${t2.body.id}`)).body.subtasks).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Input limits and bounded responses
// ---------------------------------------------------------------------------

describe('tasks security: input limits', () => {
  it('rejects oversized text, pages and malformed filters with 400', async () => {
    const { ana } = await office();
    const task = await ana.post('/tasks', { title: 'Base' });
    const id = task.body.id as string;
    const bad = [
      await ana.post('/tasks', { title: 'x'.repeat(201) }),
      await ana.post('/tasks', { title: '   ' }),
      await ana.post('/tasks', { title: 'x', description: 'x'.repeat(5001) }),
      await ana.patch(`/tasks/${id}`, { description: 'x'.repeat(5001) }),
      await ana.post(`/tasks/${id}/comments`, { text: 'x'.repeat(5001) }),
      await ana.post(`/tasks/${id}/comments`, { text: '   ' }),
      await ana.post(`/tasks/${id}/subtasks`, { title: 'x'.repeat(201) }),
      await ana.post('/tasks', { title: 'x', dueDate: '2026-10-10', startTime: '24:00' }),
      await ana.post('/tasks', { title: 'x', dueDate: '2026-02-30' }),
      await ana.post('/tasks', { title: 'x', dueDate: '0001-01-01' }),
      await ana.post('/tasks/departments', { name: 'x'.repeat(81) }),
      await ana.post('/tasks/categories', { name: 'x'.repeat(61) }),
      await ana.post('/tasks/categories', { name: 'Cor', color: 'red;}' }),
      await ana.get('/tasks?pageSize=201'),
      await ana.get('/tasks?page=0'),
      await ana.get(`/tasks?search=${'x'.repeat(201)}`),
      await ana.get('/tasks?departmentId=1%20or%201=1'),
      await ana.get('/tasks?closedFrom=ontem'),
      await ana.get('/tasks/home?departmentId=todos'),
      await ana.get('/tasks/home?month=2026-13'),
    ];
    for (const [i, res] of bad.entries()) expect(res.status, `case ${i}`).toBe(400);
  });

  it('text with a NUL character is a 400, not an unexpected error', async () => {
    const { ana } = await office();
    const task = await ana.post('/tasks', { title: 'Base' });
    const cases = [
      await ana.post('/tasks', { title: 'Balancete\u0000' }),
      await ana.patch(`/tasks/${task.body.id}`, { description: 'a\u0000b' }),
      await ana.post(`/tasks/${task.body.id}/comments`, { text: 'oi\u0000' }),
      await ana.post(`/tasks/${task.body.id}/subtasks`, { title: '\u0000x' }),
    ];
    for (const res of cases) {
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'validation_error',
        message: 'O texto enviado contém caracteres inválidos.',
      });
    }
  });

  it('a task holds a bounded number of subtasks and comments (the detail returns all of them)', async () => {
    const { ana, carla } = await office();
    const task = await ana.post('/tasks', { title: 'Admissão' });
    const id = task.body.id as string;
    const ws = await workspaceOf(ana);
    await admin().execute(
      sql`insert into task_subtasks (workspace_id, task_id, title)
          select ${ws}::uuid, ${id}::uuid, 'Item ' || g from generate_series(1, ${MAX_SUBTASKS_PER_TASK - 1}::int) g`,
    );
    // Comments are stored encrypted (migration 0013): the same ciphertext for all of them is enough.
    const text = await encryptTaskText(await getCipher(ws), TASK_COMMENT_TEXT, 'Comentário');
    await admin().execute(
      sql`insert into task_comments (workspace_id, task_id, author_id, author_name, text)
          select ${ws}::uuid, ${id}::uuid, ${ana.userId}::uuid, 'Ana', ${text}
          from generate_series(1, ${MAX_COMMENTS_PER_TASK - 1}::int) g`,
    );
    expect((await carla.post(`/tasks/${id}/subtasks`, { title: 'Última' })).status).toBe(201);
    const overSub = await carla.post(`/tasks/${id}/subtasks`, { title: 'Uma a mais' });
    expect(overSub.status).toBe(422);
    expect(overSub.body.message).toMatch(new RegExp(`até ${MAX_SUBTASKS_PER_TASK} subtarefas`));
    expect((await carla.post(`/tasks/${id}/comments`, { text: 'Último' })).status).toBe(201);
    const overComment = await carla.post(`/tasks/${id}/comments`, { text: 'Um a mais' });
    expect(overComment.status).toBe(422);
    expect(overComment.body.message).toMatch(/limite de \d+ comentários/);

    const detail = (await ana.get(`/tasks/${id}`)).body;
    expect(detail.subtasks).toHaveLength(MAX_SUBTASKS_PER_TASK);
    expect(detail.comments).toHaveLength(MAX_COMMENTS_PER_TASK);
    // Removing one frees a slot.
    const first = detail.subtasks[0].id as string;
    expect((await carla.del(`/tasks/${id}/subtasks/${first}`)).status).toBe(204);
    expect((await carla.post(`/tasks/${id}/subtasks`, { title: 'Cabe de novo' })).status).toBe(201);
  });

  it('the start page loads only the first of my open tasks and counts all of them in SQL', async () => {
    const { ana, carla } = await office();
    const ws = await workspaceOf(ana);
    // 30 open tasks for Carla: 10 overdue, 5 due today, 10 later, 5 without due date; 3 done.
    await admin().execute(
      sql`insert into tasks (workspace_id, title, assignee_id, created_by_name, due_date, status, completed_at, completed_by_name)
          select ${ws}::uuid, 'Tarefa ' || lpad(g::text, 2, '0'), ${carla.userId}::uuid, 'Ana',
            case when g <= 10 then date '2026-10-01' + g
                 when g <= 15 then date '2026-10-20'
                 when g <= 25 then date '2026-11-01' + g
                 when g <= 30 then null
                 else date '2026-10-05' end,
            case when g > 30 then 'done' else 'todo' end,
            case when g > 30 then now() end,
            case when g > 30 then 'Ana' end
          from generate_series(1, 33) g`,
    );
    const home = await carla.get('/tasks/home');
    expect(home.status).toBe(200);
    expect(home.body.mine).toMatchObject({ open: 30, overdue: 10, dueToday: 5, occurrences: [] });
    const titles = home.body.mine.tasks.map((t: any) => t.title);
    expect(titles).toHaveLength(20);
    // Overdue first (oldest first), then due today, then later; no due date never makes the cut here.
    expect(titles.slice(0, 10)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Tarefa ${String(i + 1).padStart(2, '0')}`),
    );
    expect(titles.slice(10, 15)).toEqual(['11', '12', '13', '14', '15'].map((n) => `Tarefa ${n}`));
    expect(home.body.mine.tasks.every((t: any) => t.assignee?.id === carla.userId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// No finances and no encrypted personal data for a collaborator
// ---------------------------------------------------------------------------

/** Every key and string value of a JSON document. */
function walk(value: unknown, keys: string[] = [], strings: string[] = []) {
  if (Array.isArray(value)) for (const v of value) walk(v, keys, strings);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      keys.push(k);
      walk(v, keys, strings);
    }
  } else if (typeof value === 'string') strings.push(value);
  return { keys, strings };
}

describe('tasks security: what a collaborator sees', () => {
  it('no fees, amounts, contact data or ciphertext in any task response', async () => {
    const { ana, carla, fiscal } = await office();
    const client = await ana.post('/clients', CLIENT);
    expect(client.status).toBe(201);
    const fee = await ana.post(`/clients/${client.body.id}/fees`, {
      amount: 123_456,
      employeeFee: 4_321,
    });
    expect(fee.status).toBe(201);
    expect(
      (
        await ana.put('/tasks/client-responsibles', {
          clientId: client.body.id,
          departmentId: fiscal,
          userId: carla.userId,
        })
      ).status,
    ).toBe(200);
    const task = await ana.post('/tasks', {
      title: 'Parcelamento',
      clientId: client.body.id,
      assigneeId: carla.userId,
      dueDate: '2026-10-25',
    });
    await ana.post(`/tasks/${task.body.id}/comments`, { text: 'Cliente enviou as guias.' });
    await ana.post(`/tasks/${task.body.id}/subtasks`, { title: 'Conferir guias' });

    const urls = [
      '/tasks/options',
      '/tasks/clients',
      '/tasks/members',
      '/tasks/departments',
      '/tasks/categories',
      '/tasks/client-responsibles',
      '/tasks/home',
      '/tasks/activity',
      '/tasks',
      `/tasks?clientId=${client.body.id}`,
      `/tasks/${task.body.id}`,
    ];
    for (const url of urls) {
      const res = await carla.get(url);
      expect(res.status, url).toBe(200);
      const { keys, strings } = walk(res.body);
      const leakedKeys = keys.filter((k) =>
        /fee|amount|balance|document|email|phone|street|zip|password|mfa|wrapped|secret/i.test(k),
      );
      expect(leakedKeys, url).toEqual([]);
      // Field ciphertext (`v1.<iv>.<ct>`) never leaves the API.
      expect(
        strings.filter((s) => /^v1\.[\w-]+\.[\w-]+$/.test(s)),
        url,
      ).toEqual([]);
      // Ids are random hex: drop them before looking for amounts, documents and phones.
      const text = res.raw.body.replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        '<id>',
      );
      expect(text, url).not.toMatch(
        /123456|1\.?234[.,]56|4321|43[.,]21|@|11\.?222\.?333|0001-?81|98765|91234|Joaquim/,
      );
    }
    // The activity and the detail did reach the data that is meant to be there.
    expect((await carla.get('/tasks/activity')).body).toHaveLength(1);
    expect((await carla.get(`/tasks/${task.body.id}`)).body.client).toEqual({
      id: client.body.id,
      name: 'Pão Dourado',
    });
  });
});
