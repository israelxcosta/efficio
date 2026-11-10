// Client-base evolution (GET /reports/evolution): per month, contracts started, clients inactivated, the
// active base and the monthly fees in force at the end of the month (the current month up to today),
// what was billed (receivables of clients by due date) and received (by payment date: + interest and
// fines − discounts), and the current month against the previous one. Today is pinned to 2026-10-20
// (vitest.config.ts); the office's day is America/Sao_Paulo.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { createAccount, createTestApp, registerUser, resetDb, type Client } from './helpers';
import { createClient, member } from './task-helpers';

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

async function fee(as: Client, clientId: string, amount: number) {
  const res = await as.post(`/clients/${clientId}/fees`, { amount });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
}

async function income(
  as: Client,
  input: { contactId: string | null; date: string; amount: number; accountId: string },
  paid?: { paidAt: string; interest?: number; fine?: number; discount?: number },
) {
  const res = await as.post('/transactions', { type: 'income', description: 'Honorários', ...input });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const id = res.body[0].id as string;
  if (paid) expect((await as.patch(`/transactions/${id}/paid`, { paid: true, ...paid })).status).toBe(200);
  return id;
}

/**
 * Old client (since 2025-01-10, second period 110 000 from 2026-01-10), one started in August
 * (50 000), two in September (one with 30 000, inactivated on 2026-10-05; one without a fee period)
 * and one starting after today (70 000).
 */
async function seedOffice(owner: Client) {
  const account = await createAccount(owner);
  const old = await createClient(owner, { tradeName: 'Antigo', contractStartDate: '2025-01-10' });
  await fee(owner, old, 100_000);
  await fee(owner, old, 110_000);
  const august = await createClient(owner, { tradeName: 'Agosto', contractStartDate: '2026-08-05' });
  await fee(owner, august, 50_000);
  const leaving = await createClient(owner, { tradeName: 'Saiu', contractStartDate: '2026-09-01' });
  await fee(owner, leaving, 30_000);
  expect((await owner.post(`/clients/${leaving}/inactivate`, { date: '2026-10-05', reason: 'contract_end' })).status).toBe(200);
  const noFee = await createClient(owner, { tradeName: 'Sem vigência', contractStartDate: '2026-09-15' });
  const future = await createClient(owner, { tradeName: 'Futuro', contractStartDate: '2026-10-28' });
  await fee(owner, future, 70_000);

  await income(owner, { contactId: august, date: '2026-08-25', amount: 5_000, accountId: account }, { paidAt: '2026-08-25' });
  await income(owner, { contactId: old, date: '2026-09-10', amount: 110_000, accountId: account }, { paidAt: '2026-09-10' });
  // Due in September, received in October with juros e multa.
  await income(owner, { contactId: august, date: '2026-09-20', amount: 50_000, accountId: account }, { paidAt: '2026-10-02', interest: 500, fine: 1_000 });
  // Received early with the punctuality discount.
  await income(owner, { contactId: old, date: '2026-10-10', amount: 110_000, accountId: account }, { paidAt: '2026-10-08', discount: 2_200 });
  await income(owner, { contactId: leaving, date: '2026-10-30', amount: 30_000, accountId: account });
  // Not from clients: an income without contact and a supplier's bill.
  await income(owner, { contactId: null, date: '2026-10-12', amount: 40_000, accountId: account }, { paidAt: '2026-10-12' });
  const supplier = (await owner.post('/contacts', { name: 'Papelaria Central' })).body.id;
  expect((await owner.post('/transactions', { type: 'expense', description: 'Papel', amount: 9_999, date: '2026-10-12', accountId: account, contactId: supplier })).status).toBe(201);
  return { old, august, leaving, noFee, future };
}

describe('client-base evolution', () => {
  it('counts new, churned and active clients, the fees in force, billed and received, month by month', async () => {
    const owner = await registerUser(app, 'Dona do Escritório');
    const { august, leaving, noFee } = await seedOffice(owner);

    const res = await owner.get('/reports/evolution?months=3');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ today: '2026-10-20', from: '2026-08-01', to: '2026-10-20' });
    expect(res.body.months).toEqual([
      {
        month: '2026-08',
        asOf: '2026-08-31',
        partial: false,
        newClients: 1,
        churnedClients: 0,
        activeClients: 2,
        netChange: 1,
        recurringFees: 160_000,
        clientsWithFee: 2,
        averageFee: 80_000,
        newList: [{ id: august, name: 'Agosto', fee: 50_000 }],
        churnedList: [],
        billed: 5_000,
        received: 5_000,
      },
      {
        month: '2026-09',
        asOf: '2026-09-30',
        partial: false,
        newClients: 2,
        churnedClients: 0,
        activeClients: 4,
        netChange: 2,
        recurringFees: 190_000,
        clientsWithFee: 3,
        averageFee: 63_333,
        newList: [
          { id: leaving, name: 'Saiu', fee: 30_000 },
          { id: noFee, name: 'Sem vigência', fee: 0 },
        ],
        churnedList: [],
        billed: 160_000,
        received: 110_000,
      },
      {
        month: '2026-10',
        asOf: '2026-10-20',
        partial: true,
        newClients: 0,
        churnedClients: 1,
        activeClients: 3,
        netChange: -1,
        recurringFees: 160_000,
        clientsWithFee: 2,
        averageFee: 80_000,
        // "Futuro" starts after today; "Saiu" leaves with the fee it had at the end of September.
        newList: [],
        churnedList: [{ id: leaving, name: 'Saiu', fee: 30_000, reason: 'contract_end' }],
        billed: 140_000,
        received: 51_500 + 107_800,
      },
    ]);
    expect(res.body.comparison).toEqual({
      current: '2026-10',
      previous: '2026-09',
      metrics: {
        newClients: { current: 0, previous: 2, diff: -2, diffPercent: -1 },
        churnedClients: { current: 1, previous: 0, diff: 1, diffPercent: null },
        activeClients: { current: 3, previous: 4, diff: -1, diffPercent: -0.25 },
        netChange: { current: -1, previous: 2, diff: -3, diffPercent: -1.5 },
        recurringFees: { current: 160_000, previous: 190_000, diff: -30_000, diffPercent: -30_000 / 190_000 },
        averageFee: { current: 80_000, previous: 63_333, diff: 16_667, diffPercent: 16_667 / 63_333 },
        billed: { current: 140_000, previous: 160_000, diff: -20_000, diffPercent: -0.125 },
        received: { current: 159_300, previous: 110_000, diff: 49_300, diffPercent: 49_300 / 110_000 },
      },
    });
  });

  it('defaults to 12 months and compares with the previous month even when asked for one', async () => {
    const owner = await registerUser(app, 'Dona do Escritório');
    await seedOffice(owner);
    const year = (await owner.get('/reports/evolution')).body;
    expect(year.months).toHaveLength(12);
    expect(year.months[0]).toMatchObject({ month: '2025-11', activeClients: 1, recurringFees: 100_000 });
    // January: the old client's second period starts on the 10th.
    expect(year.months.find((m: any) => m.month === '2026-01')).toMatchObject({ recurringFees: 110_000 });

    const one = (await owner.get('/reports/evolution?months=1')).body;
    expect(one.months.map((m: any) => m.month)).toEqual(['2026-10']);
    expect(one.comparison.metrics.activeClients).toEqual({ current: 3, previous: 4, diff: -1, diffPercent: -0.25 });
    for (const months of ['0', '37', 'doze']) expect((await owner.get(`/reports/evolution?months=${months}`)).status).toBe(400);
  });

  it('is finance only and counts only the workspace of the request', async () => {
    const owner = await registerUser(app, 'Dona do Escritório');
    await seedOffice(owner);
    const viewer = await member(app, owner, 'viewer', 'Colaboradora');
    expect((await viewer.get('/reports/evolution')).status).toBe(403);

    const stranger = await registerUser(app, 'Outro Escritório');
    const empty = (await stranger.get('/reports/evolution?months=3')).body;
    expect(empty.months.every((m: any) => m.activeClients === 0 && m.billed === 0 && m.received === 0 && m.recurringFees === 0)).toBe(true);
    // The stranger's own client never reaches the first office.
    const account = await createAccount(stranger);
    const theirs = await createClient(stranger, { contractStartDate: '2026-09-03' });
    await fee(stranger, theirs, 999_000);
    await income(stranger, { contactId: theirs, date: '2026-09-05', amount: 999_000, accountId: account }, { paidAt: '2026-09-05' });
    const september = (await owner.get('/reports/evolution?months=3')).body.months[1];
    expect(september).toMatchObject({ newClients: 2, activeClients: 4, recurringFees: 190_000, billed: 160_000, received: 110_000 });
    expect((await stranger.get('/reports/evolution?months=3')).body.months[1]).toMatchObject({ newClients: 1, billed: 999_000, received: 999_000 });
  });
});
