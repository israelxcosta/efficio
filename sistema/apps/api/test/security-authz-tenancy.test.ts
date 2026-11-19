// Authorization and tenant isolation regressions (security review, BOLA/BFLA/BOPLA):
// - suppliers and clients' notes are financial: a member without `finance` gets 403 on `/contacts`
//   (the web hides the supplier page behind `FinanceGate`; `/clients` and `/search` hide the notes);
// - removing a member is the strongest revocation: a manager may not remove someone holding a key the
//   manager does not hold ("ninguém revoga o que não tem");
// - ids of another workspace, in the path or nested in a body, are "not found" and change nothing.
// Today is pinned to 2026-10-20 (vitest.config.ts).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { createAccount, createTestApp, registerUser, resetDb } from './helpers';
import { cnpj, createClient, member } from './task-helpers';

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

const SECRET_NOTE = 'Aurora: cobrar juros do atraso de setembro';

describe('BOPLA/BFLA: suppliers and client notes are financial on every route', () => {
  it('a member without `finance` reads nothing through /contacts (suppliers, client notes)', async () => {
    const owner = await registerUser(app, 'Dona');
    const viewer = await member(app, owner, 'viewer', 'Colaboradora');
    const created = await owner.post('/clients', {
      name: 'Padaria Aurora Ltda',
      document: cnpj(4242),
      taxRegime: 'simples_nacional',
      simplesAnnex: 'I',
      contractStartDate: '2026-01-10',
      notes: SECRET_NOTE,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const clientId = created.body.id as string;
    const supplier = await owner.post('/contacts', { name: 'Fornecedor Aurora', notes: 'Aurora: prazo de 30 dias' });
    expect(supplier.status).toBe(201);

    // The finance roles keep the list, the notes included.
    const full = await owner.get('/contacts?kind=client');
    expect(full.status).toBe(200);
    expect(full.body.items).toEqual([expect.objectContaining({ id: clientId, notes: SECRET_NOTE })]);

    // Without `finance`: 403 on every /contacts route (it used to list suppliers and the clients' notes).
    for (const url of ['/contacts?kind=client', '/contacts', '/contacts?search=aurora', '/contacts?kind=supplier', `/contacts/${supplier.body.id}`]) {
      const res = await viewer.get(url);
      expect(res.status, url).toBe(403);
      expect(JSON.stringify(res.body), url).not.toMatch(/cobrar juros|prazo de 30 dias|Fornecedor Aurora/);
    }
    expect((await viewer.post('/contacts', { name: 'Outro' })).status).toBe(403);
    expect((await viewer.put(`/contacts/${supplier.body.id}`, { name: 'Tomado' })).status).toBe(403);
    expect((await viewer.del(`/contacts/${supplier.body.id}`)).status).toBe(403);
    // The client itself stays visible to the member through /clients, without the notes.
    const client = await viewer.get(`/clients/${clientId}`);
    expect(client.body).toMatchObject({ id: clientId, notes: null });

    // A collaborator granted `finance` reads it all (the key, not the role, decides).
    const granted = await owner.put(`/workspaces/current/members/${viewer.userId}/permissions`, { overrides: { finance: true } });
    expect(granted.status, JSON.stringify(granted.body)).toBe(200);
    const now = await viewer.get('/contacts?kind=client');
    expect(now.status).toBe(200);
    expect(now.body.items).toEqual([expect.objectContaining({ id: clientId, notes: SECRET_NOTE })]);
    // Clients are never read one by one through /contacts (suppliers only).
    expect((await owner.get(`/contacts/${clientId}`)).status).toBe(404);
  });
});

describe('BFLA: removing a member needs every key they hold', () => {
  it('a manager without `finance` cannot remove someone who has it; the owner can', async () => {
    const ana = await registerUser(app, 'Ana Dona');
    const bruno = await member(app, ana, 'viewer', 'Bruno Gestor');
    const carla = await member(app, ana, 'editor', 'Carla Financeiro');
    const dani = await member(app, ana, 'viewer', 'Dani Colaboradora');
    // Bruno manages members but has no finance.
    const granted = await ana.put(`/workspaces/current/members/${bruno.userId}/permissions`, { overrides: { members: true } });
    expect(granted.status, JSON.stringify(granted.body)).toBe(200);
    expect(granted.body.effective).toMatchObject({ members: true, finance: false });

    // He cannot take `finance` away by adjusting her permissions…
    const demote = await bruno.put(`/workspaces/current/members/${carla.userId}/permissions`, { role: 'viewer', overrides: {} });
    expect(demote.status).toBe(200);
    expect(demote.body.effective.finance).toBe(true);
    // …nor by removing her from the workspace.
    const removal = await bruno.del(`/workspaces/current/members/${carla.userId}`);
    expect(removal.status, JSON.stringify(removal.body)).toBe(403);
    expect(removal.body.details.keys).toContain('finance');
    expect(removal.body.message).toMatch(/não pode remover/);
    expect((await carla.get('/accounts')).status).toBe(200);
    const members = (await ana.get('/workspaces/current/members')).body as { userId: string }[];
    expect(members.map((m) => m.userId)).toContain(carla.userId);

    // A member whose keys he all holds can be removed; anyone can still leave; the owner removes anyone.
    expect((await bruno.del(`/workspaces/current/members/${dani.userId}`)).status).toBe(204);
    expect((await ana.del(`/workspaces/current/members/${carla.userId}`)).status).toBe(204);
    expect((await bruno.del(`/workspaces/current/members/${bruno.userId}`)).status).toBe(204);
  });
});

describe('BOLA: ids of another workspace are not found', () => {
  it('path ids and ids nested in bodies of another workspace change nothing there', async () => {
    const a = await registerUser(app, 'Dona A');
    const b = await registerUser(app, 'Dono B');
    const accountA = await createAccount(a, { name: 'Conta A', initialBalance: 1000 });
    const clientA = await createClient(a, { name: 'Cliente A Ltda' });
    const supplierA = (await a.post('/contacts', { name: 'Fornecedor A' })).body.id as string;
    const doc = await a.post(`/clients/${clientA}/documents`, { kind: 'digital_certificate', expiresAt: '2027-01-01' });
    const accountB = await createAccount(b, { name: 'Conta B' });

    // Path ids (reads and writes).
    const pathCalls: [string, string, unknown?][] = [
      ['GET', `/accounts/${accountA}`],
      ['PUT', `/accounts/${accountA}`, { name: 'Tomada', type: 'checking', initialBalance: 0 }],
      ['DELETE', `/accounts/${accountA}`],
      ['GET', `/clients/${clientA}`],
      ['GET', `/clients/${clientA}/fees`],
      ['POST', `/clients/${clientA}/fees`, { amount: 1 }],
      ['PATCH', `/clients/${clientA}/registration`, { name: 'Tomada Ltda' }],
      ['POST', `/clients/${clientA}/documents`, { kind: 'digital_certificate' }],
      ['GET', `/clients/${clientA}/onboarding`],
      ['GET', `/clients/${clientA}/onboarding/document`],
      ['POST', `/clients/${clientA}/onboarding/links`, { channel: 'email', to: 'x@teste.com' }],
      ['POST', `/clients/${clientA}/credentials/reveal`, { field: 'accountantPassword' }],
      ['GET', `/contacts/${supplierA}`],
      ['PUT', `/contacts/${supplierA}`, { name: 'Tomado' }],
      ['DELETE', `/contacts/${supplierA}`],
    ];
    expect(doc.status, JSON.stringify(doc.body)).toBe(201);
    pathCalls.push(['PUT', `/clients/${clientA}/documents/${doc.body.id}`, { kind: 'digital_certificate' }]);
    pathCalls.push(['DELETE', `/clients/${clientA}/documents/${doc.body.id}`]);
    for (const [method, url, body] of pathCalls) {
      const res =
        method === 'GET' ? await b.get(url) : method === 'DELETE' ? await b.del(url) : method === 'PUT' ? await b.put(url, body) : method === 'PATCH' ? await b.patch(url, body) : await b.post(url, body);
      expect(res.status, `${method} ${url}: ${JSON.stringify(res.body)}`).toBe(404);
    }

    // Nested ids: B's own resources referencing A's account, supplier and client.
    const nested: [string, unknown][] = [
      ['/transactions', { type: 'expense', description: 'x', amount: 100, date: '2026-10-10', accountId: accountA }],
      ['/transactions', { type: 'expense', description: 'x', amount: 100, date: '2026-10-10', accountId: accountB, contactId: supplierA }],
      ['/transfers', { fromAccountId: accountB, toAccountId: accountA, amount: 100, date: '2026-10-10' }],
      ['/goals', { name: 'Meta', targetAmount: 1000, accountId: accountA }],
      ['/unions', { name: 'Sindicato B', document: cnpj(777), clientIds: [clientA] }],
    ];
    for (const [url, body] of nested) {
      const res = await b.post(url, body);
      expect(res.status, `POST ${url}: ${JSON.stringify(res.body)}`).toBe(404);
    }

    // A is untouched.
    expect((await a.get(`/accounts/${accountA}`)).body).toMatchObject({ name: 'Conta A' });
    expect((await a.get(`/clients/${clientA}`)).body).toMatchObject({ name: 'Cliente A Ltda' });
    expect((await a.get(`/contacts/${supplierA}`)).body).toMatchObject({ name: 'Fornecedor A' });
    const listOf = (body: any) => (Array.isArray(body) ? body : body.items);
    expect(listOf((await a.get('/transactions')).body)).toHaveLength(0);
    expect((await a.get(`/clients/${clientA}/onboarding`)).body.links).toEqual([]);
    expect((await a.get(`/clients/${clientA}`)).body.documents).toHaveLength(1);
    expect(listOf((await b.get('/unions')).body)).toHaveLength(0);
  });
});
