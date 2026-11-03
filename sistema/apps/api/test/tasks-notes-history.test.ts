// Personal notes (private to their author, encrypted, not even an administrator reads them) and the
// history of a task (created, fields changed with before/after values — autosave merged —, assignee,
// status, reopened with the reason, comments added and removed). Today is pinned to 2026-10-20.

import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { taskNotes } from '../src/db/schema';
import { admin, createTestApp, resetDb } from './helpers';
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

describe('personal notes', () => {
  it('are private to their author (even for administrators), encrypted and leave with the member', async () => {
    const { ana, carla } = await office(app);
    const created = await carla.post('/tasks/notes', { title: 'Portal da prefeitura', content: 'Endereço: nfse.cidade.sp.gov.br' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ title: 'Portal da prefeitura', content: 'Endereço: nfse.cidade.sp.gov.br' });
    const [row] = await admin().select().from(taskNotes).where(eq(taskNotes.id, created.body.id));
    expect(row!.title).toMatch(/^v1\./);
    expect(row!.content).toMatch(/^v1\./);

    // The owner of the workspace does not see, change or remove it (same answer as an unknown id).
    expect((await ana.get('/tasks/notes')).body).toEqual([]);
    expect((await ana.put(`/tasks/notes/${created.body.id}`, { title: 'Tomada' })).status).toBe(404);
    expect((await ana.del(`/tasks/notes/${created.body.id}`)).status).toBe(404);
    // Nor in the workspace export (LGPD): only the requester's own notes go there.
    await ana.post('/tasks/notes', { title: 'Da Ana' });
    const exported = (await ana.get('/workspaces/current/export')).body;
    expect(exported.taskNotes.map((n: any) => n.title)).toEqual(['Da Ana']);

    const updated = await carla.put(`/tasks/notes/${created.body.id}`, { title: 'Portal', content: null });
    expect(updated.body).toMatchObject({ title: 'Portal', content: null });
    expect((await carla.get('/tasks/notes')).body.map((n: any) => n.title)).toEqual(['Portal']);
    expect((await carla.post('/tasks/notes', { title: '' })).status).toBe(400);
    expect((await carla.post('/tasks/notes', { title: 'x', content: 'y'.repeat(20001) })).status).toBe(400);

    // Leaving the workspace takes the notes along.
    const ws = await workspaceOf(ana);
    expect((await ana.del(`/workspaces/current/members/${carla.userId}`)).status).toBe(204);
    const left = await admin().execute(sql`select count(*)::int as n from task_notes where workspace_id = ${ws} and user_id = ${carla.userId}`);
    expect([...(left as unknown as { n: number }[])][0]!.n).toBe(0);
  });
});

describe('task history', () => {
  it('records creation, changes with before/after (autosave merged), assignee, status, reopening and comments', async () => {
    const { ana, carla, fiscal } = await office(app);
    const client = await createClient(ana, { tradeName: 'Padaria' });
    const category = (await ana.post('/tasks/categories', { name: 'Certidões' })).body.id;
    const task = (await ana.post('/tasks', { title: 'Certidão', dueDate: '2026-10-25', departmentId: fiscal })).body;

    // Autosave within minutes merges; a field back to its start drops out; the description has no values.
    await ana.patch(`/tasks/${task.id}`, { dueDate: '2026-10-30' });
    process.env.EFFINANCE_NOW = '2026-10-20T15:02:00Z';
    await ana.patch(`/tasks/${task.id}`, { priority: 'high', clientId: client, categoryId: category, description: 'Pedir no portal' });
    await ana.patch(`/tasks/${task.id}`, { dueDate: '2026-10-31', title: 'Certidão negativa' });
    process.env.EFFINANCE_NOW = '2026-10-20T15:03:00Z';
    await ana.patch(`/tasks/${task.id}`, { priority: 'medium' });
    // Later: a separate entry.
    process.env.EFFINANCE_NOW = '2026-10-20T16:00:00Z';
    await ana.patch(`/tasks/${task.id}`, { clientId: null });
    // Assignee: Carla takes it; status; reopening with a reason.
    process.env.EFFINANCE_NOW = '2026-10-20T16:10:00Z';
    await carla.patch(`/tasks/${task.id}`, { assigneeId: carla.userId });
    await carla.patch(`/tasks/${task.id}/status`, { status: 'in_progress' });
    await carla.patch(`/tasks/${task.id}/status`, { status: 'done' });
    await carla.patch(`/tasks/${task.id}/status`, { status: 'in_progress', reason: 'Faltou a certidão estadual' });
    // Comments: added; removed by the author or an administrator only.
    const comment = (await carla.post(`/tasks/${task.id}/comments`, { text: 'Pedido feito' })).body;
    const mine = (await ana.post(`/tasks/${task.id}/comments`, { text: 'Da Ana' })).body;
    expect(comment.canDelete).toBe(true);
    expect((await carla.get(`/tasks/${task.id}`)).body.comments.find((c: any) => c.id === mine.id).canDelete).toBe(false);
    expect((await carla.del(`/tasks/${task.id}/comments/${mine.id}`)).status).toBe(403);
    expect((await ana.del(`/tasks/${task.id}/comments/${comment.id}`)).status).toBe(204);
    expect((await ana.del(`/tasks/${task.id}/comments/${comment.id}`)).status).toBe(404);

    const history = (await carla.get(`/tasks/${task.id}/history`)).body;
    expect(history.items.map((h: any) => h.kind)).toEqual([
      'comment_removed',
      'commented',
      'commented',
      'reopened',
      'status',
      'status',
      'assigned',
      'updated',
      'updated',
      'created',
    ]);
    expect(history.total).toBe(10);
    const [removed, , , reopened, done, started, assigned, later, merged, created] = history.items;
    expect(removed).toMatchObject({ actor: { id: ana.userId } });
    expect(reopened).toMatchObject({ actor: { id: carla.userId }, fromStatus: 'done', toStatus: 'in_progress', note: 'Faltou a certidão estadual' });
    expect(done).toMatchObject({ fromStatus: 'in_progress', toStatus: 'done' });
    expect(started).toMatchObject({ fromStatus: 'todo', toStatus: 'in_progress' });
    expect(assigned).toMatchObject({ actor: { id: carla.userId }, fromAssignee: null, toAssignee: { id: carla.userId, name: 'Carla Souza' } });
    expect(later).toMatchObject({ fields: ['clientId'], changes: [{ field: 'clientId', from: 'Padaria', to: null }] });
    expect(merged.fields.sort()).toEqual(['categoryId', 'clientId', 'description', 'dueDate', 'priority', 'title']);
    expect(merged.changes).toEqual([
      { field: 'dueDate', from: '2026-10-25', to: '2026-10-31' },
      { field: 'clientId', from: null, to: 'Padaria' },
      { field: 'categoryId', from: null, to: 'Certidões' },
      { field: 'title', from: 'Certidão', to: 'Certidão negativa' },
    ]);
    expect(merged.createdAt).toBe('2026-10-20T15:03:00.000Z');
    expect(created).toMatchObject({ actor: { id: ana.userId, name: 'Ana Paula Ribeiro' }, origin: 'manual', originName: null });
    // The history of another office's task is "not found".
    const { ana: stranger } = await office(app);
    expect((await stranger.get(`/tasks/${task.id}/history`)).status).toBe(404);
  });
});
