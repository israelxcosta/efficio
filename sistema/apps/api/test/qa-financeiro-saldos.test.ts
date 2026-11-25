// QA do Financeiro (agente qa-logica-financeiro): saldos, extrato e relatórios batem com os lançamentos
// pagos; transferência não é receita nem despesa; conta fora do total; juros/multa e desconto entram no
// saldo; inadimplência com os dias de atraso por faixa. Hoje fixo em 2026-10-20 (terça).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { createAccount, createTestApp, registerUser, resetDb, type Client } from './helpers';
import { cnpj } from './task-helpers';

let app: App;
let c: Client;
let a: string;
let b: string;

beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
  c = await registerUser(app);
  a = await createAccount(c, { name: 'Conta A', initialBalance: 100000 });
  b = await createAccount(c, { name: 'Conta B', initialBalance: 0 });
});

const tx = async (body: Record<string, unknown>) => {
  const res = await c.post('/transactions', { accountId: a, ...body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body[0];
};

/**
 * Outubro na conta A (saldo inicial 1.000,00): receita paga 500,00 (05/10), despesa paga 200,00 (06/10),
 * transferência paga de 100,00 para B (07/10), despesa de 30,00 vencida em 08/10 paga em 15/10 com juros
 * 1,00 e multa 0,60, despesa pendente 50,00 (25/10) e receita pendente 70,00 (28/10).
 */
async function october() {
  await tx({ type: 'income', description: 'Serviço', amount: 50000, date: '2026-10-05', paid: true });
  await tx({ type: 'expense', description: 'Aluguel', amount: 20000, date: '2026-10-06', paid: true });
  expect((await c.post('/transfers', { fromAccountId: a, toAccountId: b, amount: 10000, date: '2026-10-07' })).status).toBe(201);
  const late = await tx({ type: 'expense', description: 'Água', amount: 3000, date: '2026-10-08' });
  expect((await c.patch(`/transactions/${late.id}/paid`, { paid: true, paidAt: '2026-10-15', interest: 100, fine: 60 })).status).toBe(200);
  await tx({ type: 'expense', description: 'Luz', amount: 5000, date: '2026-10-25' });
  await tx({ type: 'income', description: 'Consultoria', amount: 7000, date: '2026-10-28' });
}

describe('qa-financeiro: saldo e extrato', () => {
  it('saldo = inicial + receitas pagas − despesas pagas ± transferências; previsto do fim do mês soma as pendentes', async () => {
    await october();
    const accA = (await c.get(`/accounts/${a}`)).body;
    expect(accA.balance).toBe(100000 + 50000 - 20000 - 10000 - 3000 - 160);
    expect(accA.projectedBalance).toBe(accA.balance - 5000 + 7000);
    expect((await c.get(`/accounts/${b}`)).body.balance).toBe(10000);
  });

  it('extrato da conta: abertura, entradas, saídas, fechamento e saldo corrente batem com o saldo da conta', async () => {
    await october();
    const s = (await c.get(`/statement?accountId=${a}&from=2026-10-01&to=2026-10-31`)).body;
    expect(s.openingBalance).toBe(100000);
    expect(s.totalIn).toBe(50000);
    expect(s.totalOut).toBe(20000 + 10000 + 3000 + 160);
    expect(s.closingBalance).toBe(s.openingBalance + s.totalIn - s.totalOut);
    expect(s.closingBalance).toBe((await c.get(`/accounts/${a}`)).body.balance);
    expect(s.pendingIn).toBe(7000);
    expect(s.pendingOut).toBe(5000);
    expect(s.projectedClosingBalance).toBe(s.closingBalance + 7000 - 5000);
    const realized = s.entries.filter((e: any) => !e.pending);
    expect(realized.at(-1).balanceAfter).toBe(s.closingBalance);
    // Running balance is consistent entry by entry.
    let running = s.openingBalance;
    for (const e of realized) {
      running += e.amount;
      expect(e.balanceAfter).toBe(running);
    }
    // The late payment is dated on its payment date (with its interest and fine).
    expect(realized.filter((e: any) => e.transaction.effectiveDate === '2026-10-15').map((e: any) => e.amount).sort()).toEqual([-3000, -100, -60].sort());
  });

  it('"todas as contas": a transferência entre contas próprias se anula; conta fora do total não entra', async () => {
    await october();
    const outside = await createAccount(c, { name: 'Reserva pessoal', initialBalance: 999999, includeInTotal: false });
    await c.post('/transactions', { type: 'income', description: 'Fora', amount: 12345, date: '2026-10-10', paid: true, accountId: outside });
    const all = (await c.get('/statement?from=2026-10-01&to=2026-10-31')).body;
    expect(all.openingBalance).toBe(100000);
    expect(all.totalIn).toBe(50000);
    expect(all.totalOut).toBe(20000 + 3000 + 160);
    expect(all.entries.some((e: any) => e.transaction.description === 'Fora')).toBe(false);
    const dash = (await c.get('/dashboard?month=2026-10')).body;
    expect(dash.balances.accounts).toBe(100000 + 50000 - 20000 - 3000 - 160);
  });

  it('transferência não conta como receita nem despesa em relatórios, painel e lista por tipo', async () => {
    await october();
    const overview = (await c.get('/reports/overview?from=2026-10-01&to=2026-10-31')).body;
    expect(overview.income).toBe(50000 + 7000);
    expect(overview.expense).toBe(20000 + 3000 + 100 + 60 + 5000);
    const dash = (await c.get('/dashboard?month=2026-10')).body;
    expect([dash.summary.income, dash.summary.expense]).toEqual([57000, 28160]);
    const incomeCats = (await c.get('/reports/categories?type=income&from=2026-10-01&to=2026-10-31&granularity=month')).body;
    expect(incomeCats.total).toBe(57000);
    const expenseList = (await c.get('/transactions?type=expense&from=2026-10-01&to=2026-10-31&pageSize=100')).body;
    expect(expenseList.summary.expense).toBe(28160);
    expect(expenseList.items.some((t: any) => t.type === 'transfer')).toBe(false);
    // Cash flow: the transfer A → B nets out in "all accounts".
    const flow = (await c.get('/reports/cashflow?from=2026-10-01&to=2026-10-31&granularity=month')).body;
    expect(flow.periods[0]).toMatchObject({ realizedInflow: 50000, realizedOutflow: 23160, pendingInflow: 7000, pendingOutflow: 5000 });
    expect(flow.closingBalance).toBe(100000 + 57000 - 28160);
  });

  it('desconto por pontualidade: entra o valor cheio e sai o desconto (saldo líquido)', async () => {
    const r = await tx({ type: 'income', description: 'Honorário', amount: 100000, date: '2026-10-19' });
    expect((await c.patch(`/transactions/${r.id}/paid`, { paid: true, paidAt: '2026-10-19', discount: 5000 })).status).toBe(200);
    expect((await c.get(`/accounts/${a}`)).body.balance).toBe(100000 + 100000 - 5000);
  });

  // Observação (não é defeito: o contrato diz "Opening + paid + pending entries in the period"): o
  // "Saldo previsto" do extrato não inclui contas vencidas de meses anteriores ainda em aberto, enquanto o
  // "Previsto fim do mês" da tela Contas inclui. Os dois números diferem para o mesmo mês.
  it('observação: previsto do extrato (só pendentes do período) × previsto da conta (inclui vencidas antigas)', async () => {
    await tx({ type: 'expense', description: 'Boleto de setembro esquecido', amount: 8000, date: '2026-09-15' });
    const acc = (await c.get(`/accounts/${a}`)).body;
    const s = (await c.get(`/statement?accountId=${a}&from=2026-10-01&to=2026-10-31`)).body;
    expect(acc.projectedBalance).toBe(92000);
    expect(s.projectedClosingBalance).toBe(100000);
  });
});

describe('qa-financeiro: inadimplência por faixa de atraso', () => {
  it('dias de atraso dos recebíveis em aberto (11, 46 e 76 dias) e totais do cliente', async () => {
    const created = await c.post('/clients', {
      name: 'Devedora Ltda', tradeName: 'Devedora', document: cnpj(41_000_001), taxRegime: 'simples_nacional', simplesAnnex: 'I', contractStartDate: '2025-01-10',
    });
    expect(created.status).toBe(201);
    const client = created.body.id;
    for (const [date, amount] of [['2026-10-09', 1000], ['2026-09-04', 2000], ['2026-08-05', 3000]] as const) {
      await tx({ type: 'income', description: `Honorário ${date}`, amount, date, contactId: client });
    }
    // Paid 5 days late with interest: counts as late (not open).
    const paidLate = await tx({ type: 'income', description: 'Honorário julho', amount: 4000, date: '2026-07-06', contactId: client });
    await c.patch(`/transactions/${paidLate.id}/paid`, { paid: true, paidAt: '2026-07-11', interest: 13 });
    // Due today: not late yet.
    await tx({ type: 'income', description: 'Honorário hoje', amount: 5000, date: '2026-10-20', contactId: client });

    const report = (await c.get('/reports/delinquency?months=12')).body;
    const row = report.clients.find((x: any) => x.contactId === client);
    expect(row.overdue.map((o: any) => [o.date, o.daysLate, o.amount])).toEqual([
      ['2026-08-05', 76, 3000],
      ['2026-09-04', 46, 2000],
      ['2026-10-09', 11, 1000],
    ]);
    expect([row.openCount, row.openAmount, row.maxDaysLate]).toEqual([3, 6000, 76]);
    expect([row.lateCount, row.dueCount, row.onTimeCount]).toEqual([4, 4, 0]);
    expect([row.interestCount, row.interestTotal]).toEqual([1, 13]);
    // Buckets up to 30 · 31–60 · over 60 days, as a collection screen would group them.
    const bucket = (d: number) => (d <= 30 ? 'ate30' : d <= 60 ? '31a60' : 'mais60');
    expect(row.overdue.map((o: any) => bucket(o.daysLate))).toEqual(['mais60', '31a60', 'ate30']);
    // The dashboard "overdue" counts expenses only; receivables show in upcoming totals.
    const dash = (await c.get('/dashboard?month=2026-10')).body;
    expect(dash.overdue).toEqual({ count: 0, amount: 0 });
    expect(dash.upcomingTotals.income).toBe(1000 + 2000 + 3000 + 5000);
  });
});
