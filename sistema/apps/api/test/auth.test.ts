import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { createAccount, createTestApp, firstCategory, registerUser, resetDb } from './helpers';

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

describe('auth', () => {
  it('registers, sets the session cookie and seeds defaults', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'Ana', email: 'Ana@Exemplo.com', password: 'senha-forte-123', acceptTerms: true },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user).toMatchObject({ name: 'Ana', email: 'ana@exemplo.com' });
    expect(body.user.passwordHash).toBeUndefined();
    const cookie = res.cookies.find((c) => c.name === 'effinance_token');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { effinance_token: cookie!.value } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({ email: 'ana@exemplo.com', mfaEnabled: false });
    // The account comes with its company (business workspace, in trial): "Minha empresa" when unnamed.
    expect(me.json().workspace).toMatchObject({
      name: 'Minha empresa',
      kind: 'business',
      role: 'owner',
      subscription: { status: 'trialing', canWrite: true, planCode: null },
    });
    expect(me.json().workspaces).toHaveLength(1);

    const cats = await app.inject({
      method: 'GET',
      url: '/api/categories',
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(cats.json().length).toBeGreaterThan(10);
    // Business categories: fees, payroll, taxes, occupancy…
    expect(cats.json().map((c: { name: string }) => c.name)).toEqual(
      expect.arrayContaining(['Serviços Prestados', 'Pessoal', 'Impostos e taxas', 'Ocupação', 'Despesas financeiras']),
    );
    expect(cats.json().map((c: { name: string }) => c.name)).not.toContain('Alimentação');
    const accounts = await app.inject({
      method: 'GET',
      url: '/api/accounts',
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(accounts.json()).toEqual([expect.objectContaining({ name: 'Caixa', type: 'wallet', balance: 0 })]);
  });

  it('names the company created with the account', async () => {
    const register = (payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'Caio', password: 'senha-forte-123', acceptTerms: true, ...payload } });
    const workspaceOf = async (res: Awaited<ReturnType<typeof register>>) =>
      (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${res.json().token}` } })).json().workspace;

    const named = await register({ email: 'caio@exemplo.com', companyName: '  Caio Contabilidade Ltda  ' });
    expect(named.statusCode).toBe(201);
    expect(await workspaceOf(named)).toMatchObject({ name: 'Caio Contabilidade Ltda', kind: 'business', role: 'owner' });

    const blank = await register({ email: 'dora@exemplo.com', companyName: '   ' });
    expect(await workspaceOf(blank)).toMatchObject({ name: 'Minha empresa', kind: 'business' });

    const tooLong = await register({ email: 'eva@exemplo.com', companyName: 'x'.repeat(61) });
    expect(tooLong.statusCode).toBe(400);
  });

  it('rejects duplicates, wrong passwords and missing auth', async () => {
    const payload = { name: 'Bia', email: 'bia@exemplo.com', password: 'senha-forte-123', acceptTerms: true };
    expect((await app.inject({ method: 'POST', url: '/api/auth/register', payload })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: '/api/auth/register', payload })).statusCode).toBe(409);

    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'bia@exemplo.com', password: 'errada123' },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().message).toBe('E-mail ou senha incorretos');

    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'BIA@exemplo.com', password: 'senha-forte-123', acceptTerms: true },
    });
    expect(ok.statusCode).toBe(200);

    expect((await app.inject({ method: 'GET', url: '/api/accounts' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/api/accounts', headers: { authorization: 'Bearer nope' } })).statusCode,
    ).toBe(401);
  });

  it('returns 400 with details for invalid payloads', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'validation_error' });
    expect(res.json().details.length).toBeGreaterThan(0);
  });

  it('isolates data between users (no IDOR)', async () => {
    const alice = await registerUser(app, 'Alice');
    const bob = await registerUser(app, 'Bob');

    const aliceAccount = await createAccount(alice, { name: 'Conta Alice', initialBalance: 100000 });
    const aliceCategory = await firstCategory(alice, 'expense');
    const tx = await alice.post('/transactions', {
      type: 'expense',
      description: 'Mercado',
      amount: 5000,
      date: '2026-10-10',
      accountId: aliceAccount,
      categoryId: aliceCategory.id,
    });
    expect(tx.status).toBe(201);
    const txId = tx.body[0].id;

    // Bob cannot read, change or delete Alice's resources…
    expect((await bob.get(`/accounts/${aliceAccount}`)).status).toBe(404);
    expect((await bob.put(`/accounts/${aliceAccount}`, { name: 'x', type: 'checking' })).status).toBe(404);
    expect((await bob.del(`/accounts/${aliceAccount}`)).status).toBe(404);
    expect((await bob.get(`/transactions/${txId}`)).status).toBe(404);
    expect((await bob.patch(`/transactions/${txId}/paid`, { paid: true })).status).toBe(404);
    expect((await bob.del(`/transactions/${txId}`)).status).toBe(404);
    expect((await bob.get(`/statement?accountId=${aliceAccount}&from=2026-10-01&to=2026-10-31`)).status).toBe(404);

    // …nor reference them in his own records.
    const sneaky = await bob.post('/transactions', {
      type: 'expense',
      description: 'x',
      amount: 100,
      date: '2026-10-10',
      accountId: aliceAccount,
    });
    expect(sneaky.status).toBe(404);
    const sneakyCat = await bob.post('/transactions', {
      type: 'expense',
      description: 'x',
      amount: 100,
      date: '2026-10-10',
      categoryId: aliceCategory.id,
    });
    expect(sneakyCat.status).toBe(404);

    // Listings only show own data.
    const list = await bob.get('/transactions');
    expect(list.body.total).toBe(0);
    const accounts = await bob.get('/accounts');
    expect(accounts.body.map((a: any) => a.name)).toEqual(['Caixa']);
    const search = await bob.get('/search?q=Mercado');
    expect(search.body.transactions).toEqual([]);
  });
});
