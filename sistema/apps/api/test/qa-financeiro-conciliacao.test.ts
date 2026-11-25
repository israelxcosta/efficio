// QA do Financeiro (agente qa-logica-financeiro): baixa (pagamento/recebimento), juros/multa e desconto
// herdando conta e forma de recebimento, e conciliação ("conferido com o extrato", migração 0028): a marca
// sai sozinha quando valor, data do pagamento, conta ou situação mudam — e só nesses casos.
// Hoje fixo em 2026-10-20 (terça).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { createAccount, createTestApp, firstCategory, registerUser, resetDb, type Client } from './helpers';

let app: App;
let c: Client;
let bank: string;
let other: string;

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
  other = await createAccount(c, { name: 'Caixa', initialBalance: 0 });
});

const receivable = async (body: Record<string, unknown> = {}) => {
  const res = await c.post('/transactions', {
    type: 'income', description: 'Honorários', amount: 100000, date: '2026-10-05', accountId: bank, paymentMethod: 'bank_slip', ...body,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body[0];
};
const get = async (id: string) => (await c.get(`/transactions/${id}`)).body;
const mark = async (ids: string[]) => (await c.patch('/transactions/reconcile', { ids, reconciled: true })).body.updated as number;
const isMarked = async (id: string) => (await get(id)).reconciledAt !== null;
const lateRows = async (id: string) =>
  ((await c.get('/transactions?type=income&pageSize=100')).body.items as any[]).filter((t) => t.lateFeeOf === id);

describe('qa-financeiro: baixa, juros/multa e desconto', () => {
  it('juros e multa viram lançamentos pagos na data e conta do pagamento, com a forma de recebimento confirmada', async () => {
    const r = await receivable({ accountId: null });
    const paid = await c.patch(`/transactions/${r.id}/paid`, { paid: true, paidAt: '2026-10-19', accountId: other, paymentMethod: 'pix', interest: 467, fine: 2000 });
    expect(paid.status).toBe(200);
    expect(paid.body).toMatchObject({ paid: true, paidAt: '2026-10-19', accountId: other, paymentMethod: 'pix', lateFees: { interest: 467, fine: 2000 } });
    const rows = await lateRows(r.id);
    expect(rows.map((t) => [t.lateFeeKind, t.amount, t.date, t.paid, t.accountId, t.paymentMethod]).sort()).toEqual(
      [
        ['fine', 2000, '2026-10-19', true, other, 'pix'],
        ['interest', 467, '2026-10-19', true, other, 'pix'],
      ].sort(),
    );
    expect((await c.get(`/accounts/${other}`)).body.balance).toBe(100000 + 467 + 2000);
  });

  it('baixa parcial não existe: um "amount" na baixa é ignorado e o lançamento é quitado pelo valor cheio', async () => {
    const r = await receivable();
    const res = await c.patch(`/transactions/${r.id}/paid`, { paid: true, paidAt: '2026-10-05', amount: 40000 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ paid: true, amount: 100000 });
    expect((await c.get(`/accounts/${bank}`)).body.balance).toBe(100000);
  });

  it('reabrir remove juros/multa; pagar em dia remove; pagar depois do vencimento sem reenviar move para a nova data', async () => {
    const r = await receivable();
    await c.patch(`/transactions/${r.id}/paid`, { paid: true, paidAt: '2026-10-15', interest: 300, fine: 2000 });
    await c.patch(`/transactions/${r.id}/paid`, { paid: true, paidAt: '2026-10-19' });
    expect((await lateRows(r.id)).map((t) => t.date)).toEqual(['2026-10-19', '2026-10-19']);
    await c.patch(`/transactions/${r.id}/paid`, { paid: true, paidAt: '2026-10-05' });
    expect(await lateRows(r.id)).toEqual([]);
    await c.patch(`/transactions/${r.id}/paid`, { paid: true, paidAt: '2026-10-15', interest: 300 });
    await c.patch(`/transactions/${r.id}/paid`, { paid: false });
    expect(await lateRows(r.id)).toEqual([]);
  });

  it('DEFEITO: mudar depois a forma de recebimento de um recebimento com juros/multa — os juros/multa ficam na forma antiga', async () => {
    const r = await receivable();
    await c.patch(`/transactions/${r.id}/paid`, { paid: true, paidAt: '2026-10-15', interest: 300, fine: 2000 });
    // Corrected in the edit sheet: it was Pix, not boleto.
    const upd = await c.put(`/transactions/${r.id}`, { paymentMethod: 'pix' });
    expect(upd.status).toBe(200);
    expect(upd.body.paymentMethod).toBe('pix');
    // Obtido: ['bank_slip', 'bank_slip'] — o relatório de Recebimentos separa 1.000,00 em Pix e 23,00 em Boleto.
    expect((await lateRows(r.id)).map((t) => t.paymentMethod)).toEqual(['pix', 'pix']);
    const receipts = (await c.get('/reports/receipts?from=2026-10-01&to=2026-10-31')).body;
    expect(receipts.byMethod.map((m: any) => [m.key, m.amount])).toEqual([['pix', 102300]]);
  });

  it('DEFEITO: desconto por pontualidade fica com a forma de pagamento antiga do recebível, não a confirmada na baixa', async () => {
    const r = await receivable({ date: '2026-10-19' });
    const paid = await c.patch(`/transactions/${r.id}/paid`, { paid: true, paidAt: '2026-10-19', paymentMethod: 'pix', discount: 5000 });
    expect(paid.status).toBe(200);
    expect(paid.body).toMatchObject({ paymentMethod: 'pix', discount: 5000 });
    const discountRow = ((await c.get('/transactions?type=expense&pageSize=50')).body.items as any[]).find((t) => t.discountOf === r.id);
    expect(discountRow).toMatchObject({ amount: 5000, accountId: bank, date: '2026-10-19' });
    // docs/api.md: "mesma conta (a do pagamento), contato e forma de pagamento". Obtido: 'bank_slip'.
    expect(discountRow.paymentMethod).toBe('pix');
  });
});

describe('qa-financeiro: conciliação (conferido com o extrato)', () => {
  it('a marca sai ao mudar valor, data do pagamento, conta ou ao reabrir — e fica ao mudar descrição, categoria, notas ou vencimento', async () => {
    const r = await receivable({ paid: true, paidAt: '2026-10-06' });
    expect(await mark([r.id])).toBe(1);
    const category = await firstCategory(c, 'income');

    // Not what was checked against the bank: the mark stays.
    expect((await c.put(`/transactions/${r.id}`, { description: 'Honorários outubro', categoryId: category.id, notes: 'ok' })).status).toBe(200);
    expect(await isMarked(r.id)).toBe(true);
    expect((await c.put(`/transactions/${r.id}`, { date: '2026-10-04' })).status).toBe(200);
    expect(await isMarked(r.id)).toBe(true);

    // Amount.
    await c.put(`/transactions/${r.id}`, { amount: 100001 });
    expect(await isMarked(r.id)).toBe(false);
    expect(await mark([r.id])).toBe(1);
    // Payment date.
    await c.patch(`/transactions/${r.id}/paid`, { paid: true, paidAt: '2026-10-07' });
    expect(await isMarked(r.id)).toBe(false);
    expect(await mark([r.id])).toBe(1);
    // Same payment confirmed again: no change, the mark stays.
    await c.patch(`/transactions/${r.id}/paid`, { paid: true, paidAt: '2026-10-07' });
    expect(await isMarked(r.id)).toBe(true);
    // Account.
    await c.put(`/transactions/${r.id}`, { accountId: other });
    expect(await isMarked(r.id)).toBe(false);
    expect(await mark([r.id])).toBe(1);
    // Reopened: cleared, and a pending row cannot be marked.
    await c.patch(`/transactions/${r.id}/paid`, { paid: false });
    expect(await isMarked(r.id)).toBe(false);
    expect(await mark([r.id])).toBe(0);
  });

  it('juros/multa conferidos perdem a marca quando o pagamento do original muda de data', async () => {
    const r = await receivable();
    await c.patch(`/transactions/${r.id}/paid`, { paid: true, paidAt: '2026-10-15', interest: 300 });
    const [interest] = await lateRows(r.id);
    expect(await mark([r.id, interest.id])).toBe(2);
    await c.patch(`/transactions/${r.id}/paid`, { paid: true, paidAt: '2026-10-16' });
    expect(await isMarked(r.id)).toBe(false);
    expect(await isMarked(interest.id)).toBe(false);
  });

  it('compra no cartão não pode ser conferida', async () => {
    const card = (await c.post('/credit-cards', { name: 'Cartão', bank: 'nubank', brand: 'visa', limit: 100000, closingDay: 5, dueDay: 12 })).body.id;
    const purchase = (await c.post('/transactions', { type: 'expense', description: 'Compra', amount: 1000, date: '2026-10-01', creditCardId: card })).body[0];
    await c.patch(`/transactions/${purchase.id}/paid`, { paid: true });
    expect(await mark([purchase.id])).toBe(0);
  });

  // Relatórios → Recebimentos existe "para conferir com o extrato bancário" (roadmap §6) e o relatório
  // de evolução já trata o recebido como "o que entrou de fato" (recebíveis − descontos). Com desconto por
  // pontualidade, o banco mostra 950,00, mas o relatório soma 1.000,00.
  it('DEFEITO: recebimento com desconto por pontualidade aparece pelo valor cheio no relatório de Recebimentos (não bate com o extrato)', async () => {
    const r = await receivable({ date: '2026-10-19' });
    await c.patch(`/transactions/${r.id}/paid`, { paid: true, paidAt: '2026-10-19', paymentMethod: 'pix', discount: 5000 });
    const bankStatement = (await c.get(`/statement?accountId=${bank}&from=2026-10-19&to=2026-10-19`)).body;
    expect(bankStatement.totalIn - bankStatement.totalOut).toBe(95000);
    const receipts = (await c.get('/reports/receipts?from=2026-10-19&to=2026-10-19')).body;
    // Obtido: total 100000, Pix 100000, dia 19/10 100000.
    expect(receipts.total).toBe(95000);
    expect(receipts.byMethod.map((m: any) => [m.key, m.amount])).toEqual([['pix', 95000]]);
    expect(receipts.days.map((d: any) => [d.date, d.total])).toEqual([['2026-10-19', 95000]]);
  });
});
