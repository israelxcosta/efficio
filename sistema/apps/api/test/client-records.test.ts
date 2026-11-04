// Fiscal data, accesses and documents of a client (spec §13.8, §18.13–14): registrations in clear and
// read by every member; the responsible's CPF and the two accesses encrypted at rest; the accesses
// never in lists, searches, options or alerts — only revealed one at a time, with `clientCredentials`,
// a per-member limit per minute and an audit record without the value; writes in three states;
// documents substitutive (absent = keep) with their deadline bands and alerts; other workspaces' ids
// are "not found". Today is pinned to 2026-10-20 (vitest.config.ts).

import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_CREDENTIAL_REVEALS_PER_MINUTE } from '@effinance/shared';
import type { App } from '../src/app';
import { auditLogs, contacts } from '../src/db/schema';
import { executeRows } from '../src/lib/sql';
import { admin, createTestApp, registerUser, resetDb, type Client } from './helpers';
import { cnpj, member, office } from './task-helpers';

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

const SIMPLES_CODE = 'SIMPLES-1234-5678';
const PASSWORD = 'Senha#Do#Contador-99';

const padaria = (overrides: Record<string, unknown> = {}) => ({
  name: 'Padaria Pão Dourado Ltda',
  tradeName: 'Pão Dourado',
  document: '11.222.333/0001-81',
  taxRegime: 'simples_nacional',
  simplesAnnex: 'I',
  contractStartDate: '2026-01-10',
  responsibleName: 'Joaquim',
  stateRegistration: '110.042.490.114',
  municipalRegistration: '45.123',
  responsibleDocument: '529.982.247-25',
  simplesAccessCode: { action: 'set', value: SIMPLES_CODE },
  accountantPassword: { action: 'set', value: PASSWORD },
  documents: [
    { kind: 'digital_certificate', expiresAt: '2026-10-17', note: 'A1, emitido pela Certisign' },
    { kind: 'cnd_federal', expiresAt: '2026-11-01' },
    { kind: 'sanitary_license', expiresAt: '2026-12-10' },
    { kind: 'other', customName: 'Registro na ANVISA', expiresAt: null },
  ],
  ...overrides,
});

const reveal = (c: Client, id: string, field: string) => c.post(`/clients/${id}/credentials/reveal`, { field });

describe('client accesses: encrypted, never listed, revealed with an audit record', () => {
  it('stores the accesses and the CPF encrypted and only says whether each access exists', async () => {
    const { ana, carla } = await office(app);
    const created = await ana.post('/clients', padaria());
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.id as string;
    expect(created.body).toMatchObject({
      stateRegistration: '110.042.490.114',
      stateRegistrationExempt: false,
      municipalRegistration: '45.123',
      responsibleDocument: '52998224725',
      credentials: { simplesAccessCode: true, accountantPassword: true },
    });

    // At rest: the `v1.` format, never the clear text.
    const [row] = await executeRows<{ simples_access_code: string; accountant_password: string; responsible_document: string }>(
      admin(),
      sql`select simples_access_code, accountant_password, responsible_document from contacts where id = ${id}`,
    );
    for (const value of Object.values(row!)) expect(value).toMatch(/^v1\./);
    expect(JSON.stringify(row)).not.toContain(SIMPLES_CODE);
    expect(JSON.stringify(row)).not.toContain('52998224725');

    // Nowhere else: lists, detail, search, task options, alerts — for anyone.
    const urls = [
      '/clients',
      `/clients/${id}`,
      '/search?q=dourado',
      '/search?q=11222333000181',
      '/tasks/options',
      '/tasks/clients',
      '/deadlines',
      '/deadlines/clients',
    ];
    for (const c of [ana, carla]) {
      for (const url of urls) {
        const res = await c.get(url);
        expect(res.status, url).toBe(200);
        const text = JSON.stringify(res.body);
        expect(text, url).not.toContain(SIMPLES_CODE);
        expect(text, url).not.toContain(PASSWORD);
      }
    }
    // The CPF is shown only in the finance area.
    const seen = await carla.get(`/clients/${id}`);
    expect(seen.body).toMatchObject({ responsibleDocument: null, stateRegistration: '110.042.490.114', credentials: { simplesAccessCode: true, accountantPassword: true } });
    expect(JSON.stringify(seen.body)).not.toContain('52998224725');
  });

  it('reveals with the permission, records who saw which field (never the value) and limits per minute', async () => {
    const { ana, bruno, carla } = await office(app);
    const id = (await ana.post('/clients', padaria())).body.id as string;

    const refused = await reveal(carla, id, 'accountantPassword');
    expect(refused).toMatchObject({ status: 403, body: { message: 'Você não tem permissão para ver este acesso.' } });
    expect((await carla.get(`/clients/${id}/credentials/views`)).status).toBe(403);

    const shown = await reveal(ana, id, 'accountantPassword');
    expect(shown).toMatchObject({ status: 200, body: { field: 'accountantPassword', value: PASSWORD } });
    expect(shown.raw.headers['cache-control']).toBe('no-store');
    expect((await reveal(bruno, id, 'simplesAccessCode')).body.value).toBe(SIMPLES_CODE);

    const records = await admin().select().from(auditLogs).where(and(eq(auditLogs.action, 'client.credential_revealed'), eq(auditLogs.entityId, id)));
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.metadata)).toEqual(expect.arrayContaining([{ field: 'accountantPassword' }, { field: 'simplesAccessCode' }]));
    expect(JSON.stringify(records)).not.toContain(PASSWORD);
    const views = await ana.get(`/clients/${id}/credentials/views`);
    expect(views.body).toEqual([
      { field: 'simplesAccessCode', userName: 'Bruno Carvalho', createdAt: expect.any(String) },
      { field: 'accountantPassword', userName: 'Ana Paula Ribeiro', createdAt: expect.any(String) },
    ]);

    // Per member per minute: Ana has used 1 of 10.
    for (let i = 1; i < MAX_CREDENTIAL_REVEALS_PER_MINUTE; i++) expect((await reveal(ana, id, 'simplesAccessCode')).status).toBe(200);
    const limited = await reveal(ana, id, 'simplesAccessCode');
    expect(limited.status).toBe(429);
    // Another member keeps their own budget.
    expect((await reveal(bruno, id, 'accountantPassword')).status).toBe(200);

    // An adjustment grants it to a collaborator.
    expect((await ana.put(`/workspaces/current/members/${carla.userId}/permissions`, { overrides: { clientCredentials: true } })).status).toBe(200);
    expect((await reveal(carla, id, 'accountantPassword')).body.value).toBe(PASSWORD);

    // Other workspaces: "not found", and their audit trail stays clean.
    const other = await registerUser(app, 'Outro Escritório');
    expect((await reveal(other, id, 'accountantPassword')).status).toBe(404);
    expect((await other.get(`/clients/${id}/credentials/views`)).status).toBe(404);
    expect((await reveal(ana, id, 'cpf')).status).toBe(400);
  });

  it('writes each access in three states and keeps what a form of an earlier version does not send', async () => {
    const { ana } = await office(app);
    const id = (await ana.post('/clients', padaria())).body.id as string;
    const base = { name: 'Padaria Pão Dourado Ltda', document: '11.222.333/0001-81', taxRegime: 'simples_nacional', simplesAnnex: 'I', contractStartDate: '2026-01-10' };

    // The form of phases 1/2 (none of the new fields): everything kept.
    const old = await ana.put(`/clients/${id}`, base);
    expect(old.status).toBe(200);
    expect(old.body).toMatchObject({
      stateRegistration: '110.042.490.114',
      municipalRegistration: '45.123',
      responsibleDocument: '52998224725',
      credentials: { simplesAccessCode: true, accountantPassword: true },
    });
    expect(old.body.documents).toHaveLength(4);

    const kept = await ana.put(`/clients/${id}`, { ...base, simplesAccessCode: { action: 'keep' }, accountantPassword: { action: 'set', value: 'Nova-Senha-1' } });
    expect(kept.status).toBe(200);
    expect((await reveal(ana, id, 'simplesAccessCode')).body.value).toBe(SIMPLES_CODE);
    expect((await reveal(ana, id, 'accountantPassword')).body.value).toBe('Nova-Senha-1');

    const cleared = await ana.put(`/clients/${id}`, { ...base, simplesAccessCode: { action: 'clear' }, stateRegistrationExempt: true, responsibleDocument: '' });
    expect(cleared.body).toMatchObject({
      credentials: { simplesAccessCode: false, accountantPassword: true },
      stateRegistrationExempt: true,
      stateRegistration: null,
      responsibleDocument: null,
    });
    const missing = await reveal(ana, id, 'simplesAccessCode');
    expect(missing).toMatchObject({ status: 404, body: { message: 'Este acesso não está cadastrado' } });

    // The Simples code only for Simples Nacional and MEI.
    const wrong = await ana.put(`/clients/${id}`, { ...base, taxRegime: 'real_profit', simplesAnnex: null, simplesAccessCode: { action: 'set', value: '1' } });
    expect(wrong.status).toBe(400);
    // Text Postgres cannot store is refused before encrypting.
    expect((await ana.put(`/clients/${id}`, { ...base, accountantPassword: { action: 'set', value: 'a\u0000b' } })).status).toBe(400);
  });

  it('a collaborator cannot write the registry, the accesses or the documents (finance)', async () => {
    const { ana, carla } = await office(app);
    const id = (await ana.post('/clients', padaria())).body.id as string;
    expect((await carla.put(`/clients/${id}`, padaria({ documents: [] }))).status).toBe(403);
    expect((await carla.post('/clients', padaria({ document: cnpj(40_200_001) }))).status).toBe(403);
    expect((await ana.get(`/clients/${id}`)).body.documents).toHaveLength(4);
  });

  it('the owner\'s data export carries the accesses decrypted (and audits it)', async () => {
    const { ana } = await office(app);
    const id = (await ana.post('/clients', padaria())).body.id as string;
    const exported = await ana.get('/workspaces/current/export');
    expect(exported.status).toBe(200);
    const contact = exported.body.contacts.find((c: { id: string }) => c.id === id);
    expect(contact).toMatchObject({ simplesAccessCode: SIMPLES_CODE, accountantPassword: PASSWORD, responsibleDocument: '52998224725' });
    expect(exported.body.clientDocuments.filter((d: { clientId: string }) => d.clientId === id)).toHaveLength(4);
    expect(exported.body.clientDocuments.find((d: { kind: string }) => d.kind === 'digital_certificate').note).toBe('A1, emitido pela Certisign');
    const [record] = await admin().select().from(auditLogs).where(eq(auditLogs.action, 'data.exported'));
    expect(record!.metadata).toEqual({ includesCredentials: true });
  });
});

describe('client documents: substitutive list, bands and alerts', () => {
  it('keeps the list when absent, replaces it when sent, and records who changed each one', async () => {
    const { ana, bruno, carla } = await office(app);
    const created = await ana.post('/clients', padaria());
    const id = created.body.id as string;
    const docs = created.body.documents as { id: string; kind: string; name: string; deadline: unknown; updatedBy: unknown }[];
    expect(docs.map((d) => [d.kind, d.name, d.deadline])).toEqual([
      ['digital_certificate', 'Certificado digital (e-CNPJ A1/A3)', { bucket: 'overdue', days: -3 }],
      ['cnd_federal', 'CND federal (Receita e PGFN)', { bucket: 'within30', days: 12 }],
      ['sanitary_license', 'Licença sanitária', { bucket: 'within60', days: 51 }],
      ['other', 'Registro na ANVISA', { bucket: 'noDate', days: null }],
    ]);
    expect(docs[0]!.updatedBy).toEqual({ id: ana.userId, name: 'Ana Paula Ribeiro' });
    // Every member reads them (Gestão).
    expect((await carla.get(`/clients/${id}`)).body.documents).toHaveLength(4);

    const [certificate, cnd] = docs;
    const replaced = await bruno.put(`/clients/${id}`, {
      ...padaria(),
      simplesAccessCode: undefined,
      accountantPassword: undefined,
      documents: [
        { id: certificate!.id, kind: 'digital_certificate', expiresAt: '2027-10-17', note: 'A1 renovado' },
        { id: cnd!.id, kind: 'cnd_federal', expiresAt: '2026-11-01' },
        { kind: 'cndt', expiresAt: '2026-10-25' },
      ],
    });
    expect(replaced.status, JSON.stringify(replaced.body)).toBe(200);
    const after = replaced.body.documents as { id: string; kind: string; updatedBy: { name: string }; note: string | null }[];
    expect(after.map((d) => d.kind)).toEqual(['cndt', 'cnd_federal', 'digital_certificate']);
    expect(after.find((d) => d.id === certificate!.id)).toMatchObject({ note: 'A1 renovado', updatedBy: { name: 'Bruno Carvalho' } });
    // Unchanged: who changed it stays.
    expect(after.find((d) => d.id === cnd!.id)!.updatedBy.name).toBe('Ana Paula Ribeiro');

    // An id of another client is "not found"; the list is limited to 50.
    const otherClient = (await ana.post('/clients', padaria({ document: cnpj(40_200_011), documents: [{ kind: 'pgr' }] }))).body;
    expect((await ana.put(`/clients/${id}`, { ...padaria({ simplesAccessCode: undefined, accountantPassword: undefined }), documents: [{ id: otherClient.documents[0].id, kind: 'pgr' }] })).status).toBe(404);
    expect((await ana.put(`/clients/${id}`, { ...padaria(), documents: Array(51).fill({ kind: 'pgr' }) })).status).toBe(400);
    expect((await ana.put(`/clients/${id}`, { ...padaria(), documents: [{ kind: 'other' }] })).body.message).toBe('Informe o nome do documento.');
    // An empty list removes them all.
    expect((await ana.put(`/clients/${id}`, { ...padaria({ simplesAccessCode: undefined, accountantPassword: undefined }), documents: [] })).body.documents).toEqual([]);
  });

  it('alerts count the documents of active clients; the Gestão list gets one summary per client', async () => {
    const { ana, carla } = await office(app);
    const active = (await ana.post('/clients', padaria())).body.id as string;
    const inactive = (await ana.post('/clients', padaria({ document: cnpj(40_200_021), documents: [{ kind: 'cndt', expiresAt: '2026-01-01' }] }))).body.id as string;
    expect((await ana.post(`/clients/${inactive}/inactivate`, { date: '2026-09-30', reason: 'contract_end' })).status).toBe(200);

    const deadlines = await carla.get('/deadlines');
    expect(deadlines.status).toBe(200);
    expect(deadlines.body.documents.counts).toEqual({ overdue: 1, within30: 1, within60: 1, noDate: 1 });
    expect(deadlines.body.documents.items.map((d: { kind: string; client: { name: string } }) => [d.kind, d.client.name])).toEqual([
      ['digital_certificate', 'Pão Dourado'],
      ['cnd_federal', 'Pão Dourado'],
      ['sanitary_license', 'Pão Dourado'],
      ['other', 'Pão Dourado'],
    ]);
    expect(deadlines.body.documents.items[0]).toMatchObject({ note: 'A1, emitido pela Certisign', deadline: { bucket: 'overdue', days: -3 } });
    expect(deadlines.body.documents).toMatchObject({ truncated: false, hasAny: true });
    expect(deadlines.body.conventions).toMatchObject({ items: [], hasUnions: false });

    const summary = await carla.get('/deadlines/summary');
    expect(summary.body).toMatchObject({ documents: { overdue: 1, within30: 1, within60: 1 }, overdueTotal: 1, overdueConvention: null });

    const perClient = await carla.get('/deadlines/clients');
    expect(perClient.body.items).toEqual([
      {
        clientId: active,
        overdue: 1,
        within30: 1,
        within60: 1,
        total: 4,
        mostUrgent: { documentId: expect.any(String), kind: 'digital_certificate', name: 'Certificado digital (e-CNPJ A1/A3)', expiresAt: '2026-10-17', deadline: { bucket: 'overdue', days: -3 } },
      },
    ]);
    expect(perClient.body.totals).toEqual({ overdue: 1, within30: 1, within60: 1, clientsOverdue: 1, clientsWithin30: 1 });

    // Another workspace sees none of it.
    const other = await registerUser(app, 'Outro Escritório');
    const theirs = await other.get('/deadlines');
    expect(theirs.body.documents).toMatchObject({ counts: { overdue: 0, within30: 0, within60: 0, noDate: 0 }, items: [], hasAny: false });
    expect((await other.get('/deadlines/clients')).body.items).toEqual([]);
  });

  it('a member who left keeps the recorded name; deleting the account makes it "Usuário excluído"', async () => {
    const { ana } = await office(app);
    const editor = await member(app, ana, 'editor', 'Editora Temporária');
    const id = (await editor.post('/clients', padaria())).body.id as string;
    await admin().execute(sql`delete from users where id = ${editor.userId}`);
    const doc = (await ana.get(`/clients/${id}`)).body.documents[0];
    expect(doc.updatedBy).toEqual({ id: null, name: 'Usuário excluído' });
    const [row] = await admin().select({ status: contacts.status }).from(contacts).where(eq(contacts.id, id));
    expect(row!.status).toBe('active');
  });
});
