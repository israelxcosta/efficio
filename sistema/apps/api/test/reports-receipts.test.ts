// Receipts report (Relatórios → Recebimentos): money received by the day it came in, per payment method,
// account and day, to check against the bank statement; the settlement can confirm the payment method.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { createAccount, createTestApp, firstCategory, registerUser, resetDb, type Client } from './helpers';

let app: App;
let c: Client;
let bank: string;
let cash: string;
let income: string;

beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
  c = await registerUser(app);
  bank = await createAccount(c, { name: 'Banco', initialBalance: 0 });
  cash = await createAccount(c, { name: 'Caixa', initialBalance: 0 });
  income = (await firstCategory(c, 'income', 'Serviços Prestados')).id;
  const tx = (body: Record<string, unknown>) =>
    c.post('/transactions', { type: 'income', categoryId: income, accountId: bank, ...body }).then((r) => r.body);
  // Received on 10/03 by Pix in the bank, due 05/03 (counts on the day received).
  await tx({ description: 'Honorários A', amount: 100000, date: '2026-03-05', paid: true, paidAt: '2026-03-10', paymentMethod: 'pix' });
  // Received on 10/03 by boleto.
  await tx({ description: 'Honorários B', amount: 50000, date: '2026-03-10', paid: true, paymentMethod: 'bank_slip' });
  // Received in cash without a method.
  await tx({ description: 'Serviço avulso', amount: 20000, date: '2026-03-15', paid: true, accountId: cash });
  // Due in March but received in April: out of March.
  await tx({ description: 'Honorários C', amount: 70000, date: '2026-03-20', paid: true, paidAt: '2026-04-02', paymentMethod: 'pix' });
  // Pending: never counts.
  await tx({ description: 'Honorários D', amount: 90000, date: '2026-03-25', paid: false, paymentMethod: 'pix' });
  // An expense never counts.
  await c.post('/transactions', { type: 'expense', description: 'Aluguel', amount: 30000, date: '2026-03-10', accountId: bank, paid: true, paymentMethod: 'pix' });
});

describe('receipts report', () => {
  it('totals what came in by the day it was received, per method, account and day', async () => {
    const res = await c.get('/reports/receipts?from=2026-03-01&to=2026-03-31');
    expect(res.status).toBe(200);
    const r = res.body;
    expect(r.total).toBe(170000);
    expect(r.count).toBe(3);
    expect(r.notInformed).toBe(20000);
    expect(r.byMethod.map((m: any) => [m.key, m.label, m.amount])).toEqual([
      ['pix', 'Pix', 100000],
      ['bank_slip', 'Boleto', 50000],
      [null, 'Não informado', 20000],
    ]);
    expect(r.byAccount.map((a: any) => [a.label, a.amount, a.count])).toEqual([
      ['Banco', 150000, 2],
      ['Caixa', 20000, 1],
    ]);
    expect(r.days).toEqual([
      { date: '2026-03-10', total: 150000, count: 2, byMethod: { pix: 100000, bank_slip: 50000 } },
      { date: '2026-03-15', total: 20000, count: 1, byMethod: { none: 20000 } },
    ]);
    expect(r.items.map((t: any) => t.description)).toEqual(['Serviço avulso', 'Honorários B', 'Honorários A']);
    expect(r.truncated).toBe(false);
  });

  it('filters by account and by method (none = not informed)', async () => {
    const byBank = (await c.get(`/reports/receipts?from=2026-03-01&to=2026-03-31&accountId=${bank}`)).body;
    expect(byBank.total).toBe(150000);
    const pix = (await c.get('/reports/receipts?from=2026-03-01&to=2026-04-30&method=pix')).body;
    expect(pix.total).toBe(170000);
    const none = (await c.get('/reports/receipts?from=2026-03-01&to=2026-03-31&method=none')).body;
    expect(none.items.map((t: any) => t.description)).toEqual(['Serviço avulso']);
  });

  it('settling a receivable can confirm how it was received (and the fees follow it)', async () => {
    const fee = (
      await c.post('/transactions', {
        type: 'income', description: 'Honorários E', amount: 100000, date: '2026-05-05', accountId: bank, categoryId: income, paid: false, paymentMethod: 'bank_slip',
      })
    ).body[0];
    const paid = await c.patch(`/transactions/${fee.id}/paid`, { paid: true, paidAt: '2026-05-12', paymentMethod: 'pix', interest: 2000, fine: 1000 });
    expect(paid.status).toBe(200);
    expect(paid.body.paymentMethod).toBe('pix');
    const r = (await c.get('/reports/receipts?from=2026-05-01&to=2026-05-31')).body;
    expect(r.byMethod.map((m: any) => [m.key, m.amount])).toEqual([['pix', 103000]]);
  });

  it('rejects an account of another workspace and an inverted range', async () => {
    const other = await registerUser(app);
    const foreign = await createAccount(other, { name: 'Outra', initialBalance: 0 });
    expect((await c.get(`/reports/receipts?from=2026-03-01&to=2026-03-31&accountId=${foreign}`)).status).toBe(404);
    expect((await c.get('/reports/receipts?from=2026-03-31&to=2026-03-01')).status).toBe(422);
  });

  it('is part of the financial module (needs finance)', async () => {
    // Every reports route is behind financeOnly; a member without it gets 403 (covered for all
    // reports in finance-access.test.ts). Here: the route exists and answers for the owner.
    expect((await c.get('/reports/receipts?from=2026-03-01&to=2026-03-31')).status).toBe(200);
  });
});
