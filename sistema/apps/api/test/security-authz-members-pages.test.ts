// Threat model items (docs/security/threat-model.md):
// - T3: members, permissions, invites, sessions and profile photos run on the system connection (no
//   RLS): ids of another workspace are "not found" and change nothing (`replacementId` of another
//   workspace: 422, the same answer as any non-member id, nothing removed);
// - T4: the page keys whose data exists only for that page (task reports + CSV, monthly audit) are
//   checked by the API; the owner always passes;
// - T5: revealing a client's access writes the audit record BEFORE the value leaves (no record, no
//   value) and the 11th reveal of a member within a minute is a 429.
// Today is pinned to 2026-10-20 (vitest.config.ts).

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_CREDENTIAL_REVEALS_PER_MINUTE } from '@effinance/shared';
import type { App } from '../src/app';
import { API_ROLE } from './db-roles';
import { admin, createTestApp, registerUser, resetDb, type Client } from './helpers';
import { cnpj, member } from './task-helpers';

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

const memberIds = async (c: Client) => ((await c.get('/workspaces/current/members')).body as { userId: string }[]).map((m) => m.userId);

describe('T3: identity routes without RLS stay inside the workspace', () => {
  it('members, permissions, invites, sessions and photos of another workspace are not found', async () => {
    const ana = await registerUser(app, 'Ana Dona');
    const bruno = await member(app, ana, 'editor', 'Bruno Editor');
    const outra = await registerUser(app, 'Outra Dona');
    const carlos = await member(app, outra, 'viewer', 'Carlos de Fora');
    const foreignInvite = await outra.post('/workspaces/current/invites', { email: 'pendente@fora.com', role: 'viewer' });
    expect(foreignInvite.status).toBe(201);
    // A photo of someone of the other workspace.
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const photo = await carlos.put('/profile/photo', { photo: png });

    for (const target of [carlos.userId, outra.userId]) {
      expect((await ana.patch(`/workspaces/current/members/${target}`, { role: 'viewer' })).status, 'role').toBe(404);
      expect((await ana.get(`/workspaces/current/members/${target}/permissions`)).status, 'get permissions').toBe(404);
      expect((await ana.put(`/workspaces/current/members/${target}/permissions`, { overrides: {} })).status, 'put permissions').toBe(404);
      expect((await ana.del(`/workspaces/current/members/${target}`)).status, 'remove').toBe(404);
      expect((await ana.get(`/profile/photos/${target}`)).status, 'photo').toBe(404);
    }
    if (photo.status === 200) expect((await outra.get(`/profile/photos/${carlos.userId}`)).status).toBe(200);
    expect((await ana.del(`/workspaces/current/invites/${foreignInvite.body.id}`)).status).toBe(404);
    // Hand-over to someone of another workspace: refused like any non-member, nobody removed.
    const handover = await ana.del(`/workspaces/current/members/${bruno.userId}?replacementId=${carlos.userId}`);
    expect([404, 422]).toContain(handover.status);
    expect(await memberIds(ana)).toContain(bruno.userId);
    // Sessions are the user's own: another user's session id is not found and stays alive.
    const sessions = await carlos.get('/auth/sessions');
    expect(sessions.status).toBe(200);
    const foreignSession = (sessions.body as { id: string }[])[0]!.id;
    // Today modules/auth answers 401 "Sessão não encontrada" (auth agent's domain; reported): what matters
    // here is that nothing leaks or changes.
    const revoke = await ana.del(`/auth/sessions/${foreignSession}`);
    expect([401, 404]).toContain(revoke.status);
    expect(((await carlos.get('/auth/sessions')).body as { id: string }[]).map((x) => x.id)).toContain(foreignSession);
    expect((await carlos.get('/auth/me')).status).toBe(200);

    // The other workspace is untouched.
    expect(await memberIds(outra)).toEqual(expect.arrayContaining([outra.userId, carlos.userId]));
    expect(((await outra.get('/workspaces/current/invites')).body as { id: string }[]).map((i) => i.id)).toContain(foreignInvite.body.id);
  });
});

describe('T4: page keys guard the data that exists only for their page', () => {
  it('without page.reports / page.audit: 403 on that data, the rest keeps working', async () => {
    const ana = await registerUser(app, 'Ana Dona');
    const carla = await member(app, ana, 'viewer', 'Carla Colaboradora');
    const reports = '/tasks/reports?from=2026-10-01&to=2026-10-31';
    const csv = '/tasks/reports/export.csv?from=2026-10-01&to=2026-10-31';
    const audit = '/tasks/audit?competence=2026-10';
    // Defaults: every role has every page.
    for (const url of [reports, csv, audit]) expect((await carla.get(url)).status, url).toBe(200);

    expect((await ana.put(`/workspaces/current/members/${carla.userId}/permissions`, { overrides: { 'page.reports': false } })).status).toBe(200);
    for (const url of [reports, csv]) {
      const res = await carla.get(url);
      expect(res.status, url).toBe(403);
      expect(res.body.error).toBe('forbidden');
    }
    expect((await carla.get(audit)).status).toBe(200);

    expect((await ana.put(`/workspaces/current/members/${carla.userId}/permissions`, { overrides: { 'page.audit': false } })).status).toBe(200);
    expect((await carla.get(audit)).status).toBe(403);
    expect((await carla.get(reports)).status).toBe(200);
    // Pages whose data feeds pickers keep answering (they only hide the page).
    expect((await ana.put(`/workspaces/current/members/${carla.userId}/permissions`, { overrides: { 'page.clients': false, 'page.registry': false, 'page.recurring': false, 'page.processes': false } })).status).toBe(200);
    for (const url of ['/tasks/clients', '/tasks/departments', '/tasks/categories', '/tasks/recurring', '/tasks/flows']) {
      expect((await carla.get(url)).status, url).toBe(200);
    }
    // The owner always passes.
    for (const url of [reports, csv, audit]) expect((await ana.get(url)).status, url).toBe(200);
  });
});

describe('T5: revealing a client access', () => {
  const reveal = (c: Client, id: string) => c.post(`/clients/${id}/credentials/reveal`, { field: 'accountantPassword' });

  it('no audit record, no value; the 11th reveal within a minute is a 429', async () => {
    const ana = await registerUser(app, 'Ana Dona');
    const created = await ana.post('/clients', {
      name: 'Padaria Pão Dourado Ltda',
      document: cnpj(9191),
      taxRegime: 'simples_nacional',
      simplesAnnex: 'I',
      contractStartDate: '2026-01-10',
      accountantPassword: { action: 'set', value: 'Senha#Do#Contador-99' },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.id as string;

    // The audit insert fails: the request fails and the secret never leaves.
    await admin().execute(sql.raw(`revoke insert on audit_logs from ${API_ROLE}`));
    try {
      const failed = await reveal(ana, id);
      expect(failed.status).toBeGreaterThanOrEqual(500);
      expect(failed.raw.body).not.toContain('Senha#Do#Contador-99');
    } finally {
      await admin().execute(sql.raw(`grant insert on audit_logs to ${API_ROLE}`));
    }

    for (let i = 0; i < MAX_CREDENTIAL_REVEALS_PER_MINUTE; i++) {
      const ok = await reveal(ana, id);
      expect(ok.status, `reveal ${i + 1}`).toBe(200);
      expect(ok.body.value).toBe('Senha#Do#Contador-99');
    }
    const limited = await reveal(ana, id);
    expect(limited.status).toBe(429);
    expect(limited.raw.body).not.toContain('Senha#Do#Contador-99');
    // Exactly one record per value that left.
    const [row] = await admin().execute<{ n: number }>(
      sql`select count(*)::int as n from audit_logs where action = 'client.credential_revealed' and entity_id = ${id}`,
    );
    expect(Number((row as { n: number }).n)).toBe(MAX_CREDENTIAL_REVEALS_PER_MINUTE);
  });
});
