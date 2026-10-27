// Delinquency report (GET /reports/delinquency): late payments of clients, interest and fines
// charged, open past-due receivables and the payment score. Today is pinned to 2026-10-20
// (vitest.config.ts).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { delinquencyScore } from '@effinance/shared';
import type { App } from '../src/app';
import { createAccount, createTestApp, registerUser, resetDb, type Client } from './helpers';

let app: App;
let c: Client;
let account: string;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
  c = await registerUser(app);
  account = await createAccount(c, { name: 'Conta PJ', initialBalance: 0 });
});

const BAKERY = {
  name: 'Padaria Pão Quente Ltda',
  tradeName: 'Pão Quente',
  document: '11.222.333/0001-81',
  phone: '(19) 3234-5678',
  responsibleName: 'Marina Albuquerque',
  responsiblePhone: '(19) 99876-5432',
  taxRegime: 'simples_nacional',
  simplesAnnex: 'I',
  contractStartDate: '2024-03-15',
};
const SOFTWARE = {
  name: 'Tecnova Soluções em Software Ltda',
  tradeName: 'Tecnova',
  document: '45.723.174/0001-10',
  phone: '(19) 98765-4321',
  taxRegime: 'presumed_profit',
  contractStartDate: '2024-01-10',
};

async function createClient(as: Client, input: Record<string, unknown>): Promise<string> {
  const res = await as.post('/clients', input);
  if (res.status !== 201) throw new Error(`client failed: ${JSON.stringify(res.body)}`);
  return res.body.id;
}

/** An income of the client due on `date`; `paid` confirms it through PATCH /paid (with fees, if any). */
async function receivable(
  as: Client,
  contactId: string,
  date: string,
  amount: number,
  paid?: { paidAt: string; interest?: number; fine?: number },
  accountId = account,
): Promise<string> {
  const res = await as.post('/transactions', { type: 'income', description: `Honorários ${date.slice(0, 7)}`, amount, date, accountId, contactId });
  if (res.status !== 201) throw new Error(`receivable failed: ${JSON.stringify(res.body)}`);
  const id = res.body[0].id as string;
  if (paid) {
    const confirm = await as.patch(`/transactions/${id}/paid`, { paid: true, ...paid });
    if (confirm.status !== 200) throw new Error(`paid failed: ${JSON.stringify(confirm.body)}`);
  }
  return id;
}

/** Client A: late in August (with juros e multa), September and October still open. Client B: always on time. */
async function seedHistory() {
  const a = await createClient(c, BAKERY);
  const b = await createClient(c, SOFTWARE);
  const ids = {
    july: await receivable(c, a, '2026-07-10', 35000, { paidAt: '2026-07-10' }),
    august: await receivable(c, a, '2026-08-10', 35000, { paidAt: '2026-08-25', interest: 300, fine: 700 }),
    september: await receivable(c, a, '2026-09-10', 35000),
    october: await receivable(c, a, '2026-10-10', 35000),
    future: await receivable(c, a, '2026-10-25', 35000),
  };
  for (const date of ['2026-08-10', '2026-09-10', '2026-10-10']) await receivable(c, b, date, 120000, { paidAt: date });
  return { a, b, ids };
}

describe('delinquency report', () => {
  it('measures each client by due date, days late, open items and late fees', async () => {
    const { a, b, ids } = await seedHistory();
    // The August payment carries its interest and fine as two paid incomes of the same client.
    const fees = (await c.get(`/transactions?type=income&contactId=${a}&from=2026-08-25&to=2026-08-25`)).body.items;
    expect(fees.map((t: any) => [t.lateFeeKind, t.amount, t.lateFeeOf]).sort()).toEqual([
      ['fine', 700, ids.august],
      ['interest', 300, ids.august],
    ]);

    const res = await c.get('/reports/delinquency?months=3');
    expect(res.status).toBe(200);
    const report = res.body;
    expect(report).toMatchObject({ from: '2026-08-01', to: '2026-10-20' });

    // Most open amount first: A owes September and October; B owes nothing.
    expect(report.clients.map((x: any) => x.contactId)).toEqual([a, b]);
    const [clientA, clientB] = report.clients;

    const bakery = (await c.get(`/clients/${a}`)).body;
    expect(clientA).toMatchObject({
      name: 'Padaria Pão Quente Ltda',
      tradeName: 'Pão Quente',
      document: '11222333000181',
      responsibleName: 'Marina Albuquerque',
      phone: bakery.responsiblePhone, // the responsible person's number comes first
      status: 'active',
    });
    // July (before the period), the future fee (25/10) and the late-fee rows are not receivables of the period.
    expect(clientA).toMatchObject({
      dueCount: 3,
      onTimeCount: 0,
      lateCount: 3,
      openCount: 2,
      openAmount: 70000,
      avgDaysLate: 21.7, // (15 + 40 + 10) / 3
      maxDaysLate: 40,
      interestCount: 1,
      fineCount: 1,
      interestTotal: 300,
      fineTotal: 700,
      lowHistory: false,
    });
    expect(clientA.overdue).toEqual([
      // Typed receivables have no competence (generated fees do: see fee-charges.test.ts).
      { id: ids.september, description: 'Honorários 2026-09', date: '2026-09-10', amount: 35000, daysLate: 40, competence: null },
      { id: ids.october, description: 'Honorários 2026-10', date: '2026-10-10', amount: 35000, daysLate: 10, competence: null },
    ]);
    expect(clientB).toMatchObject({
      phone: '19987654321', // no responsible person: the company's number
      dueCount: 3,
      onTimeCount: 3,
      lateCount: 0,
      openCount: 0,
      openAmount: 0,
      avgDaysLate: null,
      maxDaysLate: 0,
      interestCount: 0,
      fineCount: 0,
      interestTotal: 0,
      fineTotal: 0,
      overdue: [],
    });

    // Score from the history the report passes (recent months weigh more; open items cost points).
    const scoreA = delinquencyScore(
      [
        { monthsAgo: 2, daysLate: 15 },
        { monthsAgo: 1, daysLate: 40 },
        { monthsAgo: 0, daysLate: 10 },
      ],
      2,
    );
    const scoreB = delinquencyScore([0, 1, 2].map((monthsAgo) => ({ monthsAgo, daysLate: 0 })), 0);
    expect(clientA).toMatchObject({ score: 347, risk: 'critico', probability: scoreA.probability });
    expect(scoreA.score).toBe(347);
    expect(clientB).toMatchObject({ score: 870, risk: 'baixo', probability: scoreB.probability });
    expect(scoreB.score).toBe(870);

    // By due month: one late of two each month; the 25/10 fee is not due yet.
    expect(report.monthly).toEqual([
      { month: '2026-08', dueCount: 2, lateCount: 1, lateRate: 0.5, avgDaysLate: 15, dueAmount: 155000, lateAmount: 35000 },
      { month: '2026-09', dueCount: 2, lateCount: 1, lateRate: 0.5, avgDaysLate: 40, dueAmount: 155000, lateAmount: 35000 },
      { month: '2026-10', dueCount: 2, lateCount: 1, lateRate: 0.5, avgDaysLate: 10, dueAmount: 155000, lateAmount: 35000 },
    ]);
    expect(report.summary).toEqual({
      dueCount: 6,
      lateCount: 3,
      lateRate: 0.5,
      avgDaysLate: 21.7,
      openCount: 2,
      openAmount: 70000,
      openClients: 1,
      interestTotal: 300,
      fineTotal: 700,
      paidWithFeesCount: 1,
      probability: expect.closeTo((scoreA.probability + scoreB.probability) / 2, 10),
      clientsAtRisk: 1,
    });

    // A longer period brings July in (paid on time); the default is 12 months.
    const four = (await c.get('/reports/delinquency?months=4')).body;
    expect(four.from).toBe('2026-07-01');
    expect(four.clients[0]).toMatchObject({ contactId: a, dueCount: 4, onTimeCount: 1, lateCount: 3, score: 387 });
    expect((await c.get('/reports/delinquency')).body.from).toBe('2025-11-01');
  });

  it('keeps open items from before the period and drops what was settled', async () => {
    const { a, ids } = await seedHistory();
    const old = await receivable(c, a, '2026-05-10', 35000);

    const before = (await c.get('/reports/delinquency?months=3')).body.clients[0];
    expect(before).toMatchObject({ dueCount: 3, openCount: 3, openAmount: 105000, maxDaysLate: 40 });
    expect(before.overdue.map((o: any) => [o.id, o.daysLate])).toEqual([
      [old, 163],
      [ids.september, 40],
      [ids.october, 10],
    ]);

    // Receiving September late (with a fine) moves it from open to settled late.
    await c.patch(`/transactions/${ids.september}/paid`, { paid: true, paidAt: '2026-10-15', fine: 700 });
    const after = (await c.get('/reports/delinquency?months=3')).body;
    expect(after.clients[0]).toMatchObject({ openCount: 2, openAmount: 70000, lateCount: 3, maxDaysLate: 35, fineCount: 2, fineTotal: 1400 });
    expect(after.summary).toMatchObject({ paidWithFeesCount: 2, interestTotal: 300, fineTotal: 1400 });

    // Reopening August removes its interest and fine from the report too.
    await c.patch(`/transactions/${ids.august}/paid`, { paid: false });
    expect((await c.get('/reports/delinquency?months=3')).body.summary).toMatchObject({ paidWithFeesCount: 1, interestTotal: 0, fineTotal: 700 });
  });

  it('counts only income of clients outside cards and transfers', async () => {
    const a = await createClient(c, BAKERY);
    const supplier = (await c.post('/contacts', { name: 'Papelaria Central' })).body.id;
    const other = await createAccount(c, { name: 'Reserva' });
    await receivable(c, supplier, '2026-09-10', 10000); // a supplier's income: not a client receivable
    await c.post('/transactions', { type: 'expense', description: 'Reembolso', amount: 5000, date: '2026-09-10', accountId: account, contactId: a });
    await c.post('/transfers', { description: 'Reserva', amount: 5000, date: '2026-09-10', fromAccountId: account, toAccountId: other });

    const report = (await c.get('/reports/delinquency?months=3')).body;
    expect(report.clients).toEqual([]);
    expect(report.summary).toMatchObject({ dueCount: 0, openCount: 0, lateRate: 0, avgDaysLate: null, probability: 0, clientsAtRisk: 0 });
    expect(report.monthly.map((m: any) => m.dueCount)).toEqual([0, 0, 0]);
  });

  it('validates the period', async () => {
    for (const months of ['1', '2', '25', 'abc', '3.5']) {
      const res = await c.get(`/reports/delinquency?months=${months}`);
      expect(res.status, months).toBe(400);
      expect(res.body.error).toBe('validation_error');
    }
    expect((await c.get('/reports/delinquency?months=24')).body.from).toBe('2024-11-01');
  });

  it('only sees the active workspace', async () => {
    const { a } = await seedHistory();

    // Another office with the same client (same CNPJ) and an open fee of its own.
    const other = await registerUser(app, 'Outro Escritório');
    const otherAccount = await createAccount(other);
    const otherClient = await createClient(other, BAKERY);
    const otherFee = await receivable(other, otherClient, '2026-09-15', 99900, undefined, otherAccount);

    const mine = (await c.get('/reports/delinquency?months=3')).body;
    expect(mine.clients.map((x: any) => x.contactId)).not.toContain(otherClient);
    expect(mine.clients[0]).toMatchObject({ contactId: a, openAmount: 70000 });
    expect(mine.summary.openAmount).toBe(70000);

    const theirs = (await other.get('/reports/delinquency?months=3')).body;
    expect(theirs.clients).toHaveLength(1);
    expect(theirs.clients[0]).toMatchObject({ contactId: otherClient, dueCount: 1, openAmount: 99900, interestTotal: 0, fineTotal: 0 });
    expect(theirs.clients[0].overdue.map((o: any) => o.id)).toEqual([otherFee]);
    expect(theirs.summary).toMatchObject({ dueCount: 1, openClients: 1, paidWithFeesCount: 0 });

    // Without a session there is no report.
    const anonymous = await app.inject({ method: 'GET', url: '/api/reports/delinquency' });
    expect(anonymous.statusCode).toBe(401);
  });
});
