// Finance is restricted to the workspace administrators (owner/editor). A `viewer` ("Colaborador")
// keeps the other modules (clients, suppliers, profile, workspace…) but gets 403 on every financial
// route — reads included — and sees clients without fees and the search without financial hits.
// The route inventory comes from the real app, so a route or module added later is covered too.
// Today is pinned to 2026-10-20 (vitest.config.ts).

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { canAccessFinance, FINANCE_FORBIDDEN_MESSAGE } from '../src/lib/finance-access';
import { createAccount, createTestApp, registerUser, resetDb, type Client } from './helpers';

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

/** Financial modules (`/api/<module>/…`): every route needs owner/editor. */
const FINANCE_MODULES = new Set([
  'accounts',
  'categories',
  'credit-cards',
  'goals',
  'transactions',
  'fee-charges',
  'transfers',
  'statement',
  'dashboard',
  'reports',
  'imports',
  'open-finance',
]);
/** Visible to every member (each with its own write/owner checks). `tasks`: module in development. */
const OPEN_MODULES = new Set(['health', 'auth', 'workspaces', 'invites', 'billing', 'contacts', 'clients', 'cnpj', 'search', 'tasks']);
/** Financial routes inside open modules. */
const FINANCE_ROUTES_IN_OPEN_MODULES = [/^\/api\/clients\/:id\/fees(\/|$)/];
/** Public, authenticated by the secret in the path (never by a session). */
const PUBLIC_ROUTES = [/^\/api\/open-finance\/webhooks\//];

interface Route {
  method: string;
  path: string;
}

/** Every route of the app, from Fastify's own route tree (`printRoutes` without common prefixes). */
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

const moduleOf = (path: string) => path.split('/')[2] ?? '';

function isFinancial({ path }: Route): boolean {
  if (PUBLIC_ROUTES.some((r) => r.test(path))) return false;
  return FINANCE_MODULES.has(moduleOf(path)) || FINANCE_ROUTES_IN_OPEN_MODULES.some((r) => r.test(path));
}

/** A concrete URL for a route pattern (ids that exist nowhere: the guard must answer first). */
function concrete(path: string): string {
  return path.replace(/:month\b/g, '2026-10').replace(/:[A-Za-z]+/g, () => randomUUID());
}

async function call(c: Client, method: string, url: string, payload?: unknown) {
  const res = await app.inject({
    method: method as 'GET',
    url,
    headers: { authorization: `Bearer ${c.token}` },
    ...(payload !== undefined ? { payload: payload as object } : method === 'GET' || method === 'DELETE' ? {} : { payload: {} }),
  });
  return { status: res.statusCode, body: res.body ? res.json() : undefined };
}

/** Owner of a company in trial plus an accepted member with `role`, both on the owner's company. */
async function member(owner: Client, role: 'editor' | 'viewer', email: string): Promise<Client> {
  const invite = await owner.post('/workspaces/current/invites', { email, role });
  expect(invite.status).toBe(201);
  const guest = await registerUser(app, role === 'viewer' ? 'Colaboradora' : 'Editora', email);
  const accepted = await guest.post(`/invites/${invite.body.inviteUrl.split('/convite/')[1]}/accept`);
  expect(accepted.status).toBe(200);
  expect(accepted.body.workspace.role).toBe(role);
  return guest;
}

const PADARIA = {
  name: 'Padaria Aurora Ltda',
  tradeName: 'Aurora Pães',
  document: '11.222.333/0001-81',
  taxRegime: 'simples_nacional',
  simplesAnnex: 'I',
  // One period covers today (2026-10-20).
  contractStartDate: '2026-01-10',
};

/** A client with a fee in force and one receivable linked to it. */
async function seedOffice(owner: Client) {
  const accountId = await createAccount(owner, { name: 'Conta Aurora' });
  const client = await owner.post('/clients', PADARIA);
  expect(client.status).toBe(201);
  const fee = await owner.post(`/clients/${client.body.id}/fees`, { amount: 123_456, employeeFee: 4_321 });
  expect(fee.status).toBe(201);
  const tx = await owner.post('/transactions', {
    type: 'income',
    description: 'Aurora honorários 10/2026',
    amount: 123_456,
    date: '2026-10-10',
    accountId,
    contactId: client.body.id,
  });
  expect(tx.status).toBe(201);
  expect((await owner.post('/categories', { name: 'Aurora receitas', type: 'income' })).status).toBe(201);
  return { accountId, clientId: client.body.id as string };
}

describe('finance restricted to administrators', () => {
  it('only owner and editor may access the finances (allowlist, fails closed)', () => {
    expect(canAccessFinance({ role: 'owner' })).toBe(true);
    expect(canAccessFinance({ role: 'editor' })).toBe(true);
    expect(canAccessFinance({ role: 'viewer' })).toBe(false);
    // A hook that runs before authentication, or a role added later, gets no access.
    expect(canAccessFinance(undefined)).toBe(false);
    expect(canAccessFinance(null)).toBe(false);
    expect(canAccessFinance({ role: 'collaborator' as never })).toBe(false);
  });

  it('every mounted module is classified as financial or open (inventory)', () => {
    const routes = routesOf(app);
    expect(routes.length).toBeGreaterThan(80);
    const unclassified = [...new Set(routes.map((r) => moduleOf(r.path)))].filter(
      (m) => m !== '' && m !== '*' && !FINANCE_MODULES.has(m) && !OPEN_MODULES.has(m),
    );
    // A new module must be listed above: financial ones also call `financeOnly(app)`.
    expect(unclassified, 'classify the new module in FINANCE_MODULES or OPEN_MODULES').toEqual([]);
  });

  it('a viewer gets 403 on every financial route, reads included; an editor is never refused', async () => {
    const owner = await registerUser(app, 'Dona do Escritório');
    const viewer = await member(owner, 'viewer', 'colaboradora@teste.com');
    const editor = await member(owner, 'editor', 'editora@teste.com');

    const financial = routesOf(app).filter(isFinancial);
    const keys = financial.map((r) => `${r.method} ${r.path}`);
    expect(financial.length).toBeGreaterThan(50);
    expect(keys).toEqual(
      expect.arrayContaining([
        'GET /api/dashboard',
        'GET /api/accounts',
        'GET /api/transactions/:id',
        'GET /api/reports/delinquency',
        'GET /api/statement',
        'GET /api/imports',
        'GET /api/open-finance/connections',
        'GET /api/open-finance/status',
        'POST /api/fee-charges/generate',
        'GET /api/clients/:id/fees',
        'PUT /api/clients/:id/fees/:feeId',
      ]),
    );

    for (const { method, path } of financial) {
      const url = concrete(path);
      const res = await call(viewer, method, url);
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.error, `${method} ${path}`).toBe('forbidden');
      if (method === 'GET') expect(res.body.message, `${method} ${path}`).toBe(FINANCE_FORBIDDEN_MESSAGE);
    }

    // Administrators keep everything (non-existent ids/empty bodies: 404/400/422, never 403).
    for (const { method, path } of financial) {
      const res = await call(editor, method, concrete(path));
      expect(res.status, `${method} ${path}`).not.toBe(403);
    }
  });

  it('owner and editor read and write the finances as before', async () => {
    const owner = await registerUser(app, 'Dona');
    const editor = await member(owner, 'editor', 'editora2@teste.com');
    const { accountId, clientId } = await seedOffice(owner);

    const reads = [
      '/accounts',
      `/accounts/${accountId}`,
      '/categories',
      '/credit-cards',
      '/goals',
      '/transactions',
      '/transfers',
      '/statement?from=2026-10-01&to=2026-10-31',
      '/dashboard?month=2026-10',
      '/reports/overview?from=2026-10-01&to=2026-10-31',
      '/reports/delinquency',
      '/imports',
      '/open-finance/connections',
      `/clients/${clientId}/fees`,
    ];
    for (const c of [owner, editor]) {
      for (const url of reads) expect((await c.get(url)).status, url).toBe(200);
    }
    expect((await editor.post('/accounts', { name: 'Conta da editora', type: 'checking' })).status).toBe(201);
    expect((await editor.post(`/clients/${clientId}/fees`, { amount: 130_000 })).status).toBe(201);
    const list = await editor.get('/clients');
    expect(list.body.items[0].latestFee).toMatchObject({ amount: 130_000 });
    expect(list.body.summary).toMatchObject({ monthlyFees: 123_456, withoutCurrentFee: 0, averageFee: 123_456 });
  });

  it('a viewer reads clients and suppliers without fees (no amount leaves the server)', async () => {
    const owner = await registerUser(app, 'Dona');
    const viewer = await member(owner, 'viewer', 'colaboradora2@teste.com');
    const { clientId } = await seedOffice(owner);
    expect((await owner.post('/contacts', { name: 'Fornecedor Aurora' })).status).toBe(201);

    const own = await owner.get(`/clients/${clientId}`);
    expect(own.body.currentFee).toMatchObject({ amount: 123_456, employeeFee: 4_321 });

    const list = await viewer.get('/clients?status=all');
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0]).toMatchObject({
      id: clientId,
      name: 'Padaria Aurora Ltda',
      tradeName: 'Aurora Pães',
      document: '11222333000181',
      status: 'active',
      currentFee: null,
      latestFee: null,
      transactionCount: 1,
    });
    expect(list.body.summary).toMatchObject({
      active: 1,
      inactive: 0,
      monthlyFees: null,
      withoutCurrentFee: null,
      averageFee: null,
      byRegime: expect.objectContaining({ simples_nacional: 1 }),
    });
    const one = await viewer.get(`/clients/${clientId}`);
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ id: clientId, currentFee: null, latestFee: null });
    // Neither the fee nor the receivable amount shows up anywhere.
    for (const body of [list.body, one.body]) expect(JSON.stringify(body)).not.toMatch(/123456|4321/);

    const fees = await viewer.get(`/clients/${clientId}/fees`);
    expect(fees).toMatchObject({ status: 403, body: { error: 'forbidden', message: FINANCE_FORBIDDEN_MESSAGE } });

    const suppliers = await viewer.get('/contacts?kind=supplier');
    expect(suppliers.status).toBe(200);
    expect(suppliers.body.items.map((c: { name: string }) => c.name)).toEqual(['Fornecedor Aurora']);
    // Other modules stay available.
    expect((await viewer.get('/auth/me')).status).toBe(200);
    expect((await viewer.get('/workspaces/current/members')).status).toBe(200);
  });

  it('the search shows a viewer clients only', async () => {
    const owner = await registerUser(app, 'Dona');
    const viewer = await member(owner, 'viewer', 'colaboradora3@teste.com');
    await seedOffice(owner);

    const full = await owner.get('/search?q=aurora');
    expect(full.status).toBe(200);
    expect(full.body.transactions.map((t: { description: string }) => t.description)).toEqual(['Aurora honorários 10/2026']);
    expect(full.body.accounts.map((a: { name: string }) => a.name)).toEqual(['Conta Aurora']);
    expect(full.body.categories.map((c: { name: string }) => c.name)).toEqual(['Aurora receitas']);
    expect(full.body.contacts.map((c: { name: string }) => c.name)).toEqual(['Padaria Aurora Ltda']);

    const limited = await viewer.get('/search?q=aurora');
    expect(limited.status).toBe(200);
    expect(limited.body).toEqual({
      transactions: [],
      accounts: [],
      categories: [],
      contacts: [expect.objectContaining({ name: 'Padaria Aurora Ltda', kind: 'client' })],
    });
    expect(JSON.stringify(limited.body)).not.toMatch(/123456|honorários|Conta Aurora/);
  });

  it('a viewer gets no fee due day, no client notes and no suppliers (clients, search)', async () => {
    const owner = await registerUser(app, 'Dona');
    const editor = await member(owner, 'editor', 'editora4@teste.com');
    const viewer = await member(owner, 'viewer', 'colaboradora4@teste.com');
    const client = await owner.post('/clients', {
      ...PADARIA,
      feeDueDay: 17,
      notes: 'Aurora: cobrar juros do atraso de setembro',
    });
    expect(client.status).toBe(201);
    const clientId = client.body.id as string;
    expect(
      (await owner.post('/contacts', { name: 'Fornecedor Aurora', notes: 'Aurora: prazo de 30 dias' })).status,
    ).toBe(201);

    // Administrators see both fields.
    for (const c of [owner, editor]) {
      const one = await c.get(`/clients/${clientId}`);
      expect(one.body).toMatchObject({ feeDueDay: 17, notes: 'Aurora: cobrar juros do atraso de setembro' });
      expect((await c.get('/clients')).body.items[0]).toMatchObject({ feeDueDay: 17 });
      const found = await c.get('/search?q=aurora');
      expect(found.body.contacts.map((x: { kind: string }) => x.kind).sort()).toEqual(['client', 'supplier']);
      expect(found.body.contacts.find((x: { kind: string }) => x.kind === 'client').notes).toMatch(/cobrar juros/);
    }

    // The viewer: the same client, without the fee due day and the notes, in the list and the detail.
    const one = await viewer.get(`/clients/${clientId}`);
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ id: clientId, name: 'Padaria Aurora Ltda', feeDueDay: null, notes: null });
    const list = await viewer.get('/clients?status=all');
    expect(list.body.items[0]).toMatchObject({ id: clientId, feeDueDay: null, notes: null });
    // Search: clients only (suppliers are financial), without the notes either.
    const found = await viewer.get('/search?q=aurora');
    expect(found.status).toBe(200);
    expect(found.body.contacts).toEqual([
      expect.objectContaining({ id: clientId, kind: 'client', name: 'Padaria Aurora Ltda', notes: null }),
    ]);
    for (const body of [one.body, list.body, found.body]) {
      expect(JSON.stringify(body)).not.toMatch(/cobrar juros|prazo de 30 dias|Fornecedor Aurora|"feeDueDay":17/);
    }
  });

  it('a role change takes effect on the next request', async () => {
    const owner = await registerUser(app, 'Dona');
    const editor = await member(owner, 'editor', 'editora3@teste.com');
    expect((await editor.get('/accounts')).status).toBe(200);

    expect((await owner.patch(`/workspaces/current/members/${editor.userId}`, { role: 'viewer' })).status).toBe(200);
    const demoted = await editor.get('/accounts');
    expect(demoted).toMatchObject({ status: 403, body: { message: FINANCE_FORBIDDEN_MESSAGE } });
    expect((await editor.get('/clients')).status).toBe(200);

    expect((await owner.patch(`/workspaces/current/members/${editor.userId}`, { role: 'editor' })).status).toBe(200);
    expect((await editor.get('/accounts')).status).toBe(200);
  });
});
