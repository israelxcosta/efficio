// QA do Financeiro (agente qa-logica-financeiro): faturas de cartão — compra parcelada caindo na fatura
// certa conforme o fechamento, pagamento da fatura (sai da conta uma vez, não vira despesa de novo),
// estorno do pagamento e limite usado. Hoje fixo em 2026-10-20 (terça).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  account = await createAccount(c, { name: 'Banco', initialBalance: 500000 });
});

async function card(closingDay: number, dueDay: number, limit = 1_000_000) {
  const res = await c.post('/credit-cards', { name: `Cartão ${closingDay}/${dueDay}`, bank: 'nubank', brand: 'visa', limit, closingDay, dueDay, defaultAccountId: account });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}

const buy = (cardId: string, date: string, amount: number, extra: Record<string, unknown> = {}) =>
  c.post('/transactions', { type: 'expense', description: `Compra ${date}`, amount, date, creditCardId: cardId, ...extra });

const invoices = async (cardId: string, from: string, to: string) =>
  ((await c.get(`/credit-cards/${cardId}/invoices?from=${from}&to=${to}`)).body as any[]).map((i) => [i.month, i.total]);

describe('qa-financeiro: compra parcelada no cartão', () => {
  it('fechamento 10 / vencimento 17: parcelas em faturas consecutivas; compra no fechamento começa na seguinte', async () => {
    const cardId = await card(10, 17);
    const before = await buy(cardId, '2026-11-09', 30000, { recurrenceKind: 'installment', installments: 3 });
    expect(before.body.map((t: any) => [t.date, t.invoiceMonth, t.amount])).toEqual([
      ['2026-11-09', '2026-11', 10000],
      ['2026-12-09', '2026-12', 10000],
      ['2027-01-09', '2027-01', 10000],
    ]);
    const onClosing = await buy(cardId, '2026-11-10', 10001, { recurrenceKind: 'installment', installments: 2 });
    expect(onClosing.body.map((t: any) => [t.invoiceMonth, t.amount])).toEqual([['2026-12', 5001], ['2027-01', 5000]]);
    expect(await invoices(cardId, '2026-11', '2027-02')).toEqual([
      ['2026-11', 10000],
      ['2026-12', 15001],
      ['2027-01', 15000],
      ['2027-02', 0],
    ]);
  });

  it('vencimento antes do fechamento (fecha 25, vence 5) com 12 parcelas: uma por fatura, sem pular', async () => {
    const cardId = await card(25, 5);
    const res = await buy(cardId, '2026-12-20', 120000, { recurrenceKind: 'installment', installments: 12 });
    const months = res.body.map((t: any) => t.invoiceMonth);
    expect(months[0]).toBe('2027-01');
    expect(new Set(months).size).toBe(12);
    expect(months.at(-1)).toBe('2027-12');
  });

  it('DEFEITO: fechamento dia 30 e compra parcelada no dia 29 — a parcela de fevereiro (28/02, dia do fechamento) pula para a fatura seguinte', async () => {
    const cardId = await card(30, 10);
    const res = await buy(cardId, '2027-01-29', 30000, { recurrenceKind: 'installment', installments: 3 });
    expect(res.status).toBe(201);
    expect(res.body.map((t: any) => t.date)).toEqual(['2027-01-29', '2027-02-28', '2027-03-29']);
    // Obtido: ['2027-02', '2027-04', '2027-04'] — fatura de março sem parcela, abril com duas.
    expect(res.body.map((t: any) => t.invoiceMonth)).toEqual(['2027-02', '2027-03', '2027-04']);
    expect(await invoices(cardId, '2027-02', '2027-04')).toEqual([['2027-02', 10000], ['2027-03', 10000], ['2027-04', 10000]]);
  });

  it('DEFEITO: assinatura mensal no dia 30 num cartão que fecha dia 31 — nos meses de 30 dias a cobrança cai na fatura seguinte', async () => {
    const cardId = await card(31, 8);
    const res = await buy(cardId, '2027-03-30', 3990, { description: 'Assinatura', recurrenceKind: 'fixed' });
    expect(res.status).toBe(201);
    const byDate = Object.fromEntries(res.body.map((t: any) => [t.date, t.invoiceMonth]));
    // Esperado: uma cobrança por fatura (abril, maio, junho, julho). Obtido: 30/04 e 30/05 na mesma fatura.
    expect([byDate['2027-03-30'], byDate['2027-04-30'], byDate['2027-05-30'], byDate['2027-06-30']]).toEqual(['2027-04', '2027-05', '2027-06', '2027-07']);
  });
});

describe('qa-financeiro: pagamento da fatura', () => {
  it('pagar: compras pagas, transferência sai da conta uma vez e não entra como despesa de novo nos relatórios', async () => {
    const cardId = await card(5, 12);
    await buy(cardId, '2026-10-06', 40000);
    await buy(cardId, '2026-10-20', 25000, { recurrenceKind: 'installment', installments: 2 }); // 12500 (20/10) + 12500 (20/11)
    // November invoice: 40000 + 12500.
    expect(await invoices(cardId, '2026-11', '2026-12')).toEqual([['2026-11', 52500], ['2026-12', 12500]]);

    const paid = await c.post(`/credit-cards/${cardId}/invoices/2026-11/pay`, { accountId: account, date: '2026-11-12' });
    expect(paid.status, JSON.stringify(paid.body)).toBe(200);
    expect(paid.body).toMatchObject({ status: 'paid', unpaidTotal: 0, total: 52500 });
    expect(paid.body.transactions.every((t: any) => t.paid && t.paidAt === '2026-11-12')).toBe(true);
    expect(paid.body.payments).toHaveLength(1);
    expect(paid.body.payments[0]).toMatchObject({ type: 'transfer', transferKind: 'card_payment', amount: 52500, accountId: account });

    const acc = (await c.get(`/accounts/${account}`)).body;
    expect(acc.balance).toBe(500000); // paid in the future (12/11): not realized today
    const statement = (await c.get(`/statement?accountId=${account}&from=2026-11-01&to=2026-11-30`)).body;
    expect(statement.closingBalance).toBe(500000 - 52500);

    // Competence reports: the purchases count once as expense (Oct), the payment never.
    const overview = (await c.get('/reports/overview?from=2026-10-01&to=2026-11-30')).body;
    expect(overview.expense).toBe(65000);
    const dash = (await c.get('/dashboard?month=2026-11')).body;
    expect(dash.summary.expense).toBe(12500); // November: only the 2nd installment (purchase date 20/11)
    expect(dash.monthly.find((m: any) => m.month === '2026-10').expense).toBe(52500);

    // Paying again: nothing open.
    expect((await c.post(`/credit-cards/${cardId}/invoices/2026-11/pay`, { accountId: account, date: '2026-11-12' })).status).toBe(422);

    // Reverting the payment reopens the purchases and gives the money back.
    expect((await c.del(`/transfers/${paid.body.payments[0].id}`)).status).toBe(204);
    const reopened = (await c.get(`/credit-cards/${cardId}/invoices/2026-11`)).body;
    expect(reopened).toMatchObject({ unpaidTotal: 52500, payments: [] });
    expect((await c.get(`/statement?accountId=${account}&from=2026-11-01&to=2026-11-30`)).body.closingBalance).toBe(500000);
  });

  it('compra no cartão vence pela fatura, não pela data da compra; limite usado conta o parcelado inteiro', async () => {
    const cardId = await card(5, 12, 100000);
    await buy(cardId, '2026-10-01', 10000); // invoice 2026-10 due 12/10 (past): overdue
    await buy(cardId, '2026-10-15', 60000, { recurrenceKind: 'installment', installments: 6 });
    const list = (await c.get('/transactions?creditCardId=' + cardId + '&pageSize=50')).body;
    expect(list.items.filter((t: any) => t.overdue).map((t: any) => t.date)).toEqual(['2026-10-01']);
    const cards = (await c.get('/credit-cards')).body;
    expect(cards.find((x: any) => x.id === cardId)).toMatchObject({ usedLimit: 70000, availableLimit: 30000 });
  });
});
