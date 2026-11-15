// QA 14/11/2026: the global search finds a client by its complete CNPJ (with or without punctuation) and
// by its responsible's full name (both encrypted: exact match through blind indexes, migration 0022), and
// the audit trail is kept 24 months, with a warning (system + one e-mail per period) and a CSV download
// of what is about to be deleted.

import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { backfillEncryption } from '../src/db/backfill';
import { purgeExpiredAuditLogs } from '../src/db/retention';
import { auditLogs, workspaces } from '../src/db/schema';
import { MemoryMailer } from '../src/lib/mailer';
import { executeRows } from '../src/lib/sql';
import { auditRetentionStatus, monthsBefore, notifyAuditRetention } from '../src/modules/workspaces/audit-retention';
import { admin, createTestApp, registerUser, resetDb, type Client } from './helpers';
import { office, workspaceOf } from './task-helpers';

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

const CLIENT = {
  name: 'Padaria Pão Dourado Ltda',
  tradeName: 'Pão Dourado',
  document: '11.222.333/0001-81',
  taxRegime: 'presumed_profit',
  contractStartDate: '2025-01-10',
  responsibleName: 'José  da Conceição',
};

const found = async (as: Client, q: string) =>
  ((await as.get(`/search?q=${encodeURIComponent(q)}`)).body.contacts as { id: string }[]).map((c) => c.id);

describe('search (QA #5)', () => {
  it('finds a client by the complete CNPJ and by the full name of its responsible, not by parts', async () => {
    const ana = await registerUser(app, 'Ana Busca');
    const created = await ana.post('/clients', CLIENT);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.id as string;

    expect(await found(ana, '11.222.333/0001-81')).toEqual([id]);
    expect(await found(ana, '11222333000181')).toEqual([id]);
    expect(await found(ana, '11.222.333')).toEqual([]); // partial CNPJ: not searchable (encrypted)
    expect(await found(ana, 'José da Conceição')).toEqual([id]);
    expect(await found(ana, 'jose da conceicao')).toEqual([id]); // any case and accents
    expect(await found(ana, 'Conceição')).toEqual([]); // partial name: not searchable (encrypted)

    // A new responsible replaces the index.
    const updated = await ana.put(`/clients/${id}`, { ...CLIENT, document: '11222333000181', responsibleName: 'Maria Souza' });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(await found(ana, 'maria souza')).toEqual([id]);
    expect(await found(ana, 'José da Conceição')).toEqual([]);

    // Clients saved before 0022 get the index from the backfill.
    const ws = await workspaceOf(ana);
    await admin().execute(sql`update contacts set responsible_name_hash = null where id = ${id}`);
    await admin().update(workspaces).set({ encryptionBackfilledAt: null }).where(eq(workspaces.id, ws));
    expect(await found(ana, 'Maria Souza')).toEqual([]);
    await backfillEncryption(app.db);
    expect(await found(ana, 'Maria Souza')).toEqual([id]);

    // Another workspace never sees it.
    const bob = await registerUser(app, 'Bob Busca');
    expect(await found(bob, '11222333000181')).toEqual([]);
    expect(await found(bob, 'Maria Souza')).toEqual([]);
  });
});

describe('audit trail retention', () => {
  const NOW = new Date('2026-11-15T12:00:00Z');
  const log = (workspaceId: string, createdAt: Date | string, extra: Partial<typeof auditLogs.$inferInsert> = {}) =>
    admin()
      .insert(auditLogs)
      .values({ workspaceId, action: 'client.updated', entity: 'client', createdAt: new Date(createdAt), ip: '200.1.2.3', userAgent: 'Mozilla', ...extra })
      .returning({ id: auditLogs.id })
      .then((r) => r[0]!.id);

  it('tells what goes within 30 days and deletes only what passed the 24 months (6 at least)', async () => {
    const ana = await registerUser(app, 'Ana Retenção');
    const ws = await workspaceOf(ana);
    await log(ws, '2024-11-01T15:00:00Z'); // past the cutoff (15/11/2024): goes on the next clean-up
    await log(ws, '2024-12-05T15:00:00Z'); // goes on 05/12/2026: inside the 30-day notice
    await log(ws, '2025-01-10T15:00:00Z'); // later

    expect(await auditRetentionStatus(admin(), ws, 24, NOW)).toEqual({
      retentionMonths: 24,
      cutoff: '2024-11-15',
      pending: { count: 2, from: '2024-11-01', to: '2024-12-05', purgeDate: '2026-11-15' },
    });

    expect(await purgeExpiredAuditLogs(admin(), 24, NOW)).toBe(1);
    expect((await auditRetentionStatus(admin(), ws, 24, NOW)).pending).toEqual({ count: 1, from: '2024-12-05', to: '2024-12-05', purgeDate: '2026-12-05' });
    // Below the minimum the retention is raised to 6 months: the records of 2024/2025 go, today's stay.
    expect(await purgeExpiredAuditLogs(admin(), 1, NOW)).toBe(2);
    const [left] = await executeRows<{ n: number }>(admin(), sql`select count(*)::int as n from audit_logs where workspace_id = ${ws}`);
    expect(left!.n).toBeGreaterThan(0);
  });

  it('warns the members with the `members` permission and exports the period as CSV (audited)', async () => {
    const { ana, carla } = await office(app);
    const ws = await workspaceOf(ana);
    const bob = await registerUser(app, 'Bob Outro');
    const now = new Date();
    const soon = new Date(monthsBefore(now, 24).getTime() + 5 * 86_400_000); // goes in 5 days
    await log(ws, soon, { userAgent: '=HYPERLINK("http://x")', metadata: { field: 'a;b' } });
    await log(await workspaceOf(bob), soon, { action: 'client.secret_of_bob' });

    const status = await ana.get('/workspaces/current/audit/retention');
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ retentionMonths: 24, pending: { count: 1 } });
    expect((await carla.get('/workspaces/current/audit/retention')).status).toBe(403);
    expect((await carla.get('/workspaces/current/audit/export')).status).toBe(403);

    // Default period: the one about to be deleted. UTF-8 with BOM, `;`, formulas neutralized.
    const csv = await ana.get('/workspaces/current/audit/export');
    expect(csv.status).toBe(200);
    expect(csv.raw.headers['content-type']).toMatch(/^text\/csv/);
    expect(csv.raw.headers['content-disposition']).toContain(`auditoria-${status.body.pending.from}-a-${status.body.pending.to}.csv`);
    const text = csv.raw.body;
    expect(text.startsWith('﻿Data e hora;Usuário;Ação;Entidade;ID da entidade;IP;Navegador;Detalhes\r\n')).toBe(true);
    expect(text.trim().split('\r\n')).toHaveLength(2);
    expect(text).toContain(`;client.updated;client;;200.1.2.3;"'=HYPERLINK(""http://x"")";"{""field"":""a;b""}"`);
    expect(text).not.toContain('secret_of_bob');
    const [exported] = await executeRows<{ metadata: { count: number } }>(
      admin(),
      sql`select metadata from audit_logs where workspace_id = ${ws} and action = 'audit.exported'`,
    );
    expect(exported!.metadata.count).toBe(1);

    // Any period may be downloaded; with nothing about to go, a period is required.
    const today = (await ana.get('/workspaces/current/audit/export?from=2020-01-01&to=2099-12-31')).raw.body;
    expect(today).toContain('audit.exported');
    expect((await ana.get('/workspaces/current/audit/export?from=2026-02-01&to=2026-01-01')).status).toBe(400);
    const eve = await registerUser(app, 'Eve Nova'); // nothing about to go
    expect((await eve.get('/workspaces/current/audit/export')).status).toBe(400);

    // E-mail once per period to who holds `members` (the owner here), never to Carla.
    const mailer = new MemoryMailer();
    const notify = () => notifyAuditRetention(app.db, { mailer, appUrl: 'https://app.exemplo', months: 24, now });
    expect(await notify()).toBe(2); // Ana's workspace and Bob's
    expect(mailer.outbox.map((m) => m.to).sort()).toEqual([ana.email, bob.email].sort());
    expect(mailer.outbox[0]!.text).toContain('https://app.exemplo/configuracoes?aba=privacidade');
    expect(await notify()).toBe(0);
    expect(mailer.outbox).toHaveLength(2);
    const markers = await admin()
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(and(eq(auditLogs.workspaceId, ws), eq(auditLogs.action, 'audit.retention_notified')));
    expect(markers).toHaveLength(1);
    expect(carla.email).not.toBe(ana.email);
  });
});
