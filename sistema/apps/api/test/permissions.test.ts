// Permissions per person (spec §13.10, phase 3): the role gives the defaults — exactly the behavior of
// phases 1 and 2 — and the adjustments of a member turn keys on or off, checked by the API on each
// operation. Nobody grants what they do not have, nobody adjusts the owner or themselves, and every
// change is audited (who, when, from, to). Today is pinned to 2026-10-20 (vitest.config.ts).

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PERMISSION_KEYS, rolePermissions } from '@effinance/shared';
import type { App } from '../src/app';
import { auditLogs } from '../src/db/schema';
import { FINANCE_FORBIDDEN_MESSAGE } from '../src/lib/finance-access';
import { TASK_ADMIN_MESSAGE } from '../src/modules/tasks/access';
import { admin, createTestApp, registerUser, resetDb, type Client } from './helpers';
import { createClient, member, office } from './task-helpers';

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

const put = (c: Client, userId: string, body: unknown) => c.put(`/workspaces/current/members/${userId}/permissions`, body);

async function lastAudit(action: string, entityId: string) {
  const rows = await admin()
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.action, action), eq(auditLogs.entityId, entityId)));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}

describe('permissions: defaults are the behavior of phases 1 and 2', () => {
  it('the session, the task options and the members list carry them', async () => {
    const { ana, bruno, carla } = await office(app);
    for (const [c, role] of [
      [ana, 'owner'],
      [bruno, 'editor'],
      [carla, 'viewer'],
    ] as const) {
      const me = await c.get('/auth/me');
      expect(me.body.workspace.permissions).toEqual(rolePermissions(role));
      // Each workspace of the list carries the permissions of the user in it (guests own a company too).
      const listed = me.body.workspaces.find((w: { id: string }) => w.id === me.body.workspace.id);
      expect(listed.permissions).toEqual(rolePermissions(role));
      for (const w of me.body.workspaces) expect(w.permissions).toEqual(rolePermissions(w.role));
      const options = await c.get('/tasks/options');
      expect(options.body.me.permissions).toEqual(rolePermissions(role));
      expect(options.body.members.every((m: { permissionOverrides: object }) => Object.keys(m.permissionOverrides).length === 0)).toBe(true);
    }
    const members = await carla.get('/workspaces/current/members');
    expect(members.status).toBe(200);
    expect(members.body.map((m: { permissionOverrides: object; photoUpdatedAt: null }) => [m.permissionOverrides, m.photoUpdatedAt])).toEqual([
      [{}, null],
      [{}, null],
      [{}, null],
    ]);
    // Only who manages members reads the adjustments sheet (by default the owner).
    expect((await bruno.get(`/workspaces/current/members/${carla.userId}/permissions`)).status).toBe(403);
    expect((await carla.get(`/workspaces/current/members/${bruno.userId}/permissions`)).status).toBe(403);
    const sheet = await ana.get(`/workspaces/current/members/${carla.userId}/permissions`);
    expect(sheet.body).toMatchObject({
      userId: carla.userId,
      role: 'viewer',
      overrides: {},
      defaults: rolePermissions('viewer'),
      effective: rolePermissions('viewer'),
      editable: true,
      grantable: [...PERMISSION_KEYS],
    });
    const own = await ana.get(`/workspaces/current/members/${ana.userId}/permissions`);
    expect(own.body).toMatchObject({ role: 'owner', editable: false, grantable: [] });
  });
});

describe('permissions: adjustments change what the API accepts', () => {
  it('a collaborator with `finance` uses the finances; an administrator without it does not', async () => {
    const { ana, bruno, carla } = await office(app);
    expect((await carla.get('/accounts')).status).toBe(403);

    const granted = await put(ana, carla.userId, { overrides: { finance: true, unknownKey: true, registry: 'yes' } });
    expect(granted.status).toBe(200);
    expect(granted.body).toMatchObject({ role: 'viewer', overrides: { finance: true } });
    expect(granted.body.effective.finance).toBe(true);
    expect((await carla.get('/accounts')).status).toBe(200);
    expect((await carla.post('/accounts', { name: 'Conta da Carla', type: 'checking' })).status).toBe(201);
    expect((await carla.get('/auth/me')).body.workspace.permissions.finance).toBe(true);
    const fees = await createClient(ana);
    expect((await carla.get(`/clients/${fees}/fees`)).status).toBe(200);

    expect((await put(ana, bruno.userId, { overrides: { finance: false } })).status).toBe(200);
    const refused = await bruno.get('/accounts');
    expect(refused).toMatchObject({ status: 403, body: { message: FINANCE_FORBIDDEN_MESSAGE } });
    // Clients stay visible, without fees; writing them is finance.
    const client = await bruno.get(`/clients/${fees}`);
    expect(client.status).toBe(200);
    expect(client.body.currentFee).toBeNull();
    expect((await bruno.put(`/clients/${fees}`, {})).status).toBe(403);

    // Every change is audited: who, from, to.
    const entry = await lastAudit('member.permissions_changed', bruno.userId);
    expect(entry).toMatchObject({ userId: ana.userId, entity: 'user' });
    expect(entry!.metadata).toMatchObject({ role: { from: 'editor', to: 'editor' }, changes: { finance: { from: true, to: false } } });
    const list = await ana.get('/workspaces/current/members');
    expect(list.body.find((m: { userId: string }) => m.userId === bruno.userId).permissionOverrides).toEqual({ finance: false });
  });

  it('registry, deleteRegistry and deleteTasks are checked per route; page keys only hide', async () => {
    const { ana, carla, fiscal } = await office(app);
    expect((await carla.post('/tasks/categories', { name: 'Certidões' })).status).toBe(403);
    expect((await put(ana, carla.userId, { overrides: { registry: true, 'page.reports': false } })).status).toBe(200);
    const category = await carla.post('/tasks/categories', { name: 'Certidões' });
    expect(category.status).toBe(201);
    const refused = await carla.del(`/tasks/categories/${category.body.id}`);
    expect(refused).toMatchObject({ status: 403, body: { message: TASK_ADMIN_MESSAGE } });
    // The department picker of the home page goes with `registry`.
    expect((await carla.get('/tasks/home?departmentId=all')).status).toBe(200);
    // A page key hides the page in the web; the data keeps coming.
    expect((await carla.get('/tasks/reports?from=2026-10-01&to=2026-10-31')).status).toBe(200);

    const task = await ana.post('/tasks', { title: 'Balancete', departmentId: fiscal });
    const comment = await ana.post(`/tasks/${task.body.id}/comments`, { text: 'Comentário da Ana' });
    expect((await carla.del(`/tasks/${task.body.id}/comments/${comment.body.id}`)).status).toBe(403);
    expect((await carla.del(`/tasks/${task.body.id}`)).status).toBe(403);
    expect((await put(ana, carla.userId, { overrides: { registry: true, deleteRegistry: true, deleteTasks: true } })).status).toBe(200);
    expect((await carla.get(`/tasks/${task.body.id}`)).body.comments[0].canDelete).toBe(true);
    expect((await carla.del(`/tasks/${task.body.id}/comments/${comment.body.id}`)).status).toBe(204);
    expect((await carla.del(`/tasks/categories/${category.body.id}`)).status).toBe(204);
    expect((await carla.del(`/tasks/${task.body.id}`)).status).toBe(204);
  });

  it('reopenOthers: who may reopen an occurrence someone else concluded', async () => {
    process.env.EFFINANCE_NOW = '2026-10-20T15:00:00Z';
    try {
      const { ana, bruno, carla, fiscal } = await office(app);
      const client = await createClient(ana, { tradeName: 'Padaria' });
      expect((await ana.post('/tasks/recurring', { name: 'DAS', departmentId: fiscal, assigneeId: carla.userId, dueDay: 20, clientIds: [client] })).status).toBe(201);
      const cell = (await ana.get('/tasks/audit?competence=2026-10')).body.cells[0];
      expect((await ana.patch(`/tasks/${cell.taskId}/status`, { status: 'done' })).status).toBe(200);
      process.env.EFFINANCE_NOW = '2026-10-20T17:00:00Z';
      // Default: the collaborator cannot; the administrator can.
      expect((await carla.get(`/tasks/${cell.taskId}`)).body.canReopen).toBe(false);
      expect((await carla.patch(`/tasks/${cell.taskId}/status`, { status: 'todo', reason: 'Errado' })).status).toBe(403);
      expect((await bruno.get(`/tasks/${cell.taskId}`)).body.canReopen).toBe(true);
      // Adjusted: the collaborator can, the administrator cannot.
      expect((await put(ana, carla.userId, { overrides: { reopenOthers: true } })).status).toBe(200);
      expect((await put(ana, bruno.userId, { overrides: { reopenOthers: false } })).status).toBe(200);
      expect((await bruno.get(`/tasks/${cell.taskId}`)).body.canReopen).toBe(false);
      expect((await bruno.get('/tasks/audit?competence=2026-10')).body.cells[0].canReopen).toBe(false);
      expect((await bruno.patch(`/tasks/${cell.taskId}/status`, { status: 'todo', reason: 'Errado' })).status).toBe(403);
      expect((await carla.get(`/tasks/${cell.taskId}`)).body.canReopen).toBe(true);
      expect((await carla.patch(`/tasks/${cell.taskId}/status`, { status: 'todo', reason: 'Guia errada' })).status).toBe(200);
    } finally {
      delete process.env.EFFINANCE_NOW;
    }
  });

  it('a change takes effect on the next request; a role change keeps the adjustments', async () => {
    const { ana, carla } = await office(app);
    expect((await put(ana, carla.userId, { overrides: { office: true } })).status).toBe(200);
    expect((await carla.get('/office')).status).toBe(200);
    expect((await ana.patch(`/workspaces/current/members/${carla.userId}`, { role: 'editor' })).status).toBe(200);
    const after = (await ana.get(`/workspaces/current/members/${carla.userId}/permissions`)).body;
    expect(after).toMatchObject({ role: 'editor', overrides: { office: true } });
    expect(after.effective.finance).toBe(true);
    const roleAudit = await lastAudit('member.role_changed', carla.userId);
    expect(roleAudit!.metadata).toMatchObject({ role: 'editor', from: 'viewer', changes: { finance: { from: false, to: true } } });
    // Going back to the defaults removes the adjustments.
    expect((await put(ana, carla.userId, { role: 'viewer', overrides: {} })).body).toMatchObject({ role: 'viewer', overrides: {} });
    expect((await carla.get('/office')).status).toBe(403);
  });
});

describe('permissions: nobody grants what they do not have', () => {
  it('a member manager without `finance` cannot grant it, by adjustment, role or invite', async () => {
    const { ana, bruno, carla } = await office(app);
    expect((await put(ana, bruno.userId, { overrides: { members: true, finance: false } })).status).toBe(200);
    expect((await bruno.get(`/workspaces/current/members/${carla.userId}/permissions`)).body.grantable).not.toContain('finance');

    const grant = await put(bruno, carla.userId, { overrides: { finance: true } });
    expect(grant.status).toBe(403);
    expect(grant.body.message).toMatch(/não pode conceder uma permissão que não tem: Financeiro/);
    expect(grant.body.details).toEqual({ keys: ['finance'] });
    // What he has, he may grant.
    expect((await put(bruno, carla.userId, { overrides: { registry: true } })).status).toBe(200);
    // A role that would turn `finance` on is refused too.
    expect((await bruno.patch(`/workspaces/current/members/${carla.userId}`, { role: 'editor' })).status).toBe(403);
    // With an adjustment that keeps it off, the role changes and `finance`, a key he cannot touch, stays as it was.
    const promoted = await put(bruno, carla.userId, { role: 'editor', overrides: { finance: false } });
    expect(promoted.status).toBe(200);
    expect(promoted.body).toMatchObject({ role: 'editor', overrides: { finance: false } });
    expect(promoted.body.effective.finance).toBe(false);
    expect((await carla.get('/accounts')).status).toBe(403);
    // Invites: the invited role's defaults must be held.
    expect((await bruno.post('/workspaces/current/invites', { email: `x-${randomUUID()}@teste.com`, role: 'editor' })).status).toBe(403);
    expect((await bruno.post('/workspaces/current/invites', { email: `y-${randomUUID()}@teste.com`, role: 'viewer' })).status).toBe(201);
    // A key he does not have is never changed by him (its switch is disabled on screen): it stays as it is.
    expect((await put(ana, carla.userId, { role: 'viewer', overrides: { finance: true } })).status).toBe(200);
    const revoke = await put(bruno, carla.userId, { overrides: {} });
    expect(revoke.status).toBe(200);
    expect(revoke.body).toMatchObject({ role: 'viewer', overrides: { finance: true } });
    expect((await carla.get('/accounts')).status).toBe(200);
  });

  it('who edits only changes (grants or revokes) the keys they hold: "voltar ao padrão" and demotions keep the others', async () => {
    // Security review: resetting to the role's defaults, or demoting, revoked keys the editor does not have.
    const { ana, bruno, carla } = await office(app);
    const dani = await member(app, ana, 'editor', 'Daniela Alves');
    expect((await put(ana, bruno.userId, { overrides: { members: true, finance: false } })).status).toBe(200);
    expect((await put(ana, carla.userId, { overrides: { finance: true, registry: true } })).status).toBe(200);

    // "Voltar ao padrão do papel": `registry` (held) goes back to the default; `finance` (not held) stays on.
    const reset = await put(bruno, carla.userId, { overrides: {} });
    expect(reset.status, JSON.stringify(reset.body)).toBe(200);
    expect(reset.body).toMatchObject({ role: 'viewer', overrides: { finance: true } });
    expect(reset.body.effective).toMatchObject({ finance: true, registry: false });
    expect((await carla.get('/accounts')).status).toBe(200);
    expect((await carla.post('/tasks/categories', { name: 'Certidões' })).status).toBe(403);
    const audit = await lastAudit('member.permissions_changed', carla.userId);
    expect(audit!.metadata).toMatchObject({ changes: { registry: { from: true, to: false } } });
    expect((audit!.metadata as { changes: Record<string, unknown> }).changes.finance).toBeUndefined();

    // Demoting an administrator: what he holds follows the new role; `finance` stays (PUT and PATCH).
    const demoted = await put(bruno, dani.userId, { role: 'viewer', overrides: {} });
    expect(demoted.status, JSON.stringify(demoted.body)).toBe(200);
    expect(demoted.body).toMatchObject({ role: 'viewer', overrides: { finance: true } });
    expect(demoted.body.effective).toMatchObject({ finance: true, registry: false, office: false });
    expect((await dani.get('/accounts')).status).toBe(200);
    expect((await put(ana, dani.userId, { role: 'editor', overrides: {} })).body).toMatchObject({ role: 'editor', overrides: {} });
    expect((await bruno.patch(`/workspaces/current/members/${dani.userId}`, { role: 'viewer' })).status).toBe(200);
    const patched = (await ana.get(`/workspaces/current/members/${dani.userId}/permissions`)).body;
    expect(patched).toMatchObject({ role: 'viewer', overrides: { finance: true } });
    expect((await dani.get('/accounts')).status).toBe(200);

    // The owner (every key) still resets and demotes completely.
    expect((await put(ana, carla.userId, { overrides: {} })).body).toMatchObject({ overrides: {} });
    expect((await carla.get('/accounts')).status).toBe(403);
  });

  it('the owner is never adjusted, nobody adjusts themselves, and other workspaces are not found', async () => {
    const { ana, bruno, carla } = await office(app);
    expect((await put(ana, ana.userId, { overrides: {} })).status).toBe(422);
    expect((await put(ana, bruno.userId, { overrides: { members: true } })).status).toBe(200);
    const owner = await put(bruno, ana.userId, { overrides: { finance: false } });
    expect(owner).toMatchObject({ status: 422, body: { message: expect.stringMatching(/proprietário/) } });
    expect((await put(bruno, bruno.userId, { overrides: { office: false } })).status).toBe(422);
    expect((await bruno.patch(`/workspaces/current/members/${ana.userId}`, { role: 'viewer' })).status).toBe(404);
    // A member manager removes members (not the owner).
    expect((await bruno.del(`/workspaces/current/members/${carla.userId}`)).status).toBe(204);
    expect((await bruno.del(`/workspaces/current/members/${ana.userId}`)).status).toBe(404);

    const other = await registerUser(app, 'Outra Dona');
    expect((await put(other, bruno.userId, { overrides: { finance: false } })).status).toBe(404);
    expect((await other.get(`/workspaces/current/members/${bruno.userId}/permissions`)).status).toBe(404);
    expect((await ana.get(`/workspaces/current/members/${other.userId}/permissions`)).status).toBe(404);
  });

  it('without `members` nothing about members, invites or permissions changes', async () => {
    const { ana, bruno, carla } = await office(app);
    expect((await put(bruno, carla.userId, { overrides: {} })).status).toBe(403);
    expect((await bruno.patch(`/workspaces/current/members/${carla.userId}`, { role: 'editor' })).status).toBe(403);
    expect((await bruno.get('/workspaces/current/invites')).status).toBe(403);
    expect((await bruno.del(`/workspaces/current/members/${carla.userId}`)).status).toBe(403);
    // The guest still leaves by themselves.
    const guest = await member(app, ana, 'viewer', 'Convidada');
    expect((await guest.del(`/workspaces/current/members/${guest.userId}`)).status).toBe(204);
  });
});
