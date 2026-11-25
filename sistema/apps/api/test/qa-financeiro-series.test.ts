// QA do Financeiro (agente qa-logica-financeiro): contas parceladas e contas fixas/recorrentes geradas
// pela API — centavos, calendário (29/30/31, fevereiro, meses de 30 dias), horizonte das séries sem fim,
// geração contínua sem duplicar, edição "esta e as próximas" e exclusão de série.
// Hoje fixo em 2026-10-20 (terça), ver vitest.config.ts. `POST /transactions` devolve um array.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { executeRows } from '../src/lib/sql';
import { today } from '../src/lib/clock';
import { addMonthKey, addMonths, monthKey } from '@effinance/shared';
import { admin, createAccount, createTestApp, firstCategory, registerUser, resetDb, type Client } from './helpers';

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
  account = await createAccount(c, { name: 'Banco', initialBalance: 0 });
});

const create = (body: Record<string, unknown>) =>
  c.post('/transactions', { type: 'expense', accountId: account, ...body });

async function list(from: string, to: string, extra = '') {
  const res = await c.get(`/transactions?from=${from}&to=${to}&pageSize=200${extra}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.items as any[];
}

/** Every row of a series straight from the database (no materialization side effects). */
async function seriesRows(recurrenceId: string) {
  return executeRows<{ date: string; amount: number; paid: boolean; occurrence_index: number }>(
    admin(),
    sql`select to_char(date, 'YYYY-MM-DD') as date, amount::int as amount, paid, occurrence_index from transactions
        where recurrence_id = ${recurrenceId} order by occurrence_index`,
  );
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('qa-financeiro: parcelamento', () => {
  it('1 parcela é recusada (mínimo 2) — à vista é lançamento único', async () => {
    const res = await create({ description: 'Uma vez', amount: 10000, date: '2026-11-10', recurrenceKind: 'installment', installments: 1 });
    expect(res.status).toBe(400);
  });

  it('2 parcelas de valor ímpar: o centavo a mais fica na 1ª e a soma é o total', async () => {
    const res = await create({ description: 'Notebook', amount: 10001, date: '2026-11-10', recurrenceKind: 'installment', installments: 2 });
    expect(res.status).toBe(201);
    expect(res.body.map((t: any) => [t.date, t.amount, t.installmentNumber, t.installmentTotal])).toEqual([
      ['2026-11-10', 5001, 1, 2],
      ['2026-12-10', 5000, 2, 2],
    ]);
  });

  it('12 parcelas a partir de 31/01: vencimentos no último dia nos meses curtos e soma exata', async () => {
    const res = await create({ description: 'Móveis', amount: 10000, date: '2027-01-31', recurrenceKind: 'installment', installments: 12 });
    expect(res.status).toBe(201);
    const rows = res.body as any[];
    expect(rows).toHaveLength(12);
    expect(rows.map((t) => t.date)).toEqual([
      '2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31', '2027-06-30',
      '2027-07-31', '2027-08-31', '2027-09-30', '2027-10-31', '2027-11-30', '2027-12-31',
    ]);
    expect(rows.map((t) => t.amount)).toEqual([837, ...Array(11).fill(833)]);
    expect(sum(rows.map((t) => t.amount))).toBe(10000);
    expect(rows.map((t) => t.installmentNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(new Set(rows.map((t) => t.recurrenceId)).size).toBe(1);
  });

  it('24 parcelas a partir de 30/11: um vencimento por mês, 28/02 e 29/02 (bissexto), soma exata e nada duplica ao ler', async () => {
    const res = await create({ description: 'Reforma', amount: 100000, date: '2026-11-30', recurrenceKind: 'installment', installments: 24 });
    expect(res.status).toBe(201);
    const rows = res.body as any[];
    expect(rows).toHaveLength(24);
    expect(sum(rows.map((t) => t.amount))).toBe(100000);
    expect(rows[0].amount).toBe(4182);
    expect(rows.slice(1).every((t) => t.amount === 4166)).toBe(true);
    expect(rows.map((t) => monthKey(t.date))).toEqual(Array.from({ length: 24 }, (_, i) => addMonthKey('2026-11', i)));
    expect(rows.find((t) => t.date.startsWith('2027-02')).date).toBe('2027-02-28');
    expect(rows.find((t) => t.date.startsWith('2028-02')).date).toBe('2028-02-29');
    // Reading a long range (materializes open-ended series) does not touch a finite one.
    await list('2026-01-01', '2031-12-31');
    expect(await seriesRows(rows[0].recurrenceId)).toHaveLength(24);
  });

  it('valor por parcela (per_installment): N × o valor, só a 1ª paga quando criada como paga', async () => {
    const res = await create({
      description: 'Curso', amount: 33333, date: '2026-10-05', paid: true, recurrenceKind: 'installment', installments: 3, installmentAmountMode: 'per_installment',
    });
    expect(res.body.map((t: any) => [t.amount, t.paid])).toEqual([[33333, true], [33333, false], [33333, false]]);
  });
});

describe('qa-financeiro: contas fixas (série sem fim)', () => {
  it('mensal no dia 31 criada no passado: gera até hoje + 12 meses, âncora 31 mantida', async () => {
    const res = await create({ description: 'Aluguel', amount: 180000, date: '2026-01-31', recurrenceKind: 'fixed' });
    expect(res.status).toBe(201);
    const dates = (res.body as any[]).map((t) => t.date);
    const horizon = addMonths(today(), 12); // 2027-10-20
    expect(dates[0]).toBe('2026-01-31');
    expect(dates.at(-1)).toBe('2027-09-30');
    expect(dates.every((d) => d <= horizon)).toBe(true);
    expect(dates).toHaveLength(21);
    expect(dates.filter((d) => d.endsWith('-31') || d.endsWith('-30') || d.endsWith('-28')).length).toBe(21);
    expect(dates).toContain('2026-02-28');
    expect(dates).toContain('2026-04-30');
    expect(dates).toContain('2026-05-31');
  });

  it('ler um mês distante gera o que falta; ler de novo (inclusive em paralelo) não duplica nem pula mês', async () => {
    const [first] = (await create({ description: 'Internet', amount: 12000, date: '2026-08-15', recurrenceKind: 'fixed' })).body;
    const far = await list('2030-02-01', '2030-02-28');
    expect(far.map((t) => [t.date, t.amount])).toEqual([['2030-02-15', 12000]]);
    // Five concurrent reads of an even further month.
    await Promise.all(Array.from({ length: 5 }, () => list('2031-01-01', '2031-01-31')));
    const rows = await seriesRows(first.recurrenceId);
    const months = rows.map((r) => monthKey(r.date));
    expect(new Set(months).size).toBe(months.length);
    const expected = [];
    for (let m = '2026-08'; m <= monthKey(rows.at(-1)!.date); m = addMonthKey(m, 1)) expected.push(m);
    expect(months).toEqual(expected);
    expect(rows.map((r) => r.occurrence_index)).toEqual(rows.map((_, i) => i));
  });

  it('teto do horizonte: nada é gerado além de hoje + 5 anos, mesmo pedindo depois', async () => {
    const [first] = (await create({ description: 'Software', amount: 5000, date: '2026-10-25', recurrenceKind: 'fixed' })).body;
    expect(await list('2032-01-01', '2032-12-31')).toEqual([]);
    const rows = await seriesRows(first.recurrenceId);
    expect(rows.at(-1)!.date <= addMonths(today(), 60)).toBe(true);
  });

  it('semanal: uma por semana, 7 em 7 dias, sem duplicar ao reler', async () => {
    const res = await create({ description: 'Faxina', amount: 15000, date: '2026-10-06', recurrenceKind: 'fixed', frequency: 'weekly' });
    expect(res.status).toBe(201);
    expect((await list('2026-10-01', '2026-10-31')).map((t) => t.date)).toEqual(['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27']);
    await list('2028-03-01', '2028-03-31');
    await list('2028-03-01', '2028-03-31');
    const rows = await seriesRows(res.body[0].recurrenceId);
    for (let i = 1; i < rows.length; i++) {
      expect((Date.parse(rows[i]!.date) - Date.parse(rows[i - 1]!.date)) / 86_400_000).toBe(7);
    }
  });

  it('anual em 29/02/2024: 28/02 nos anos comuns e 29/02 em 2028', async () => {
    const res = await create({ description: 'Anuidade', amount: 90000, date: '2024-02-29', recurrenceKind: 'fixed', frequency: 'annual' });
    expect(res.body.map((t: any) => t.date)).toEqual(['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28']);
    expect((await list('2028-01-01', '2028-12-31')).map((t) => t.date)).toEqual(['2028-02-29']);
  });

  it('com quantidade (recorrente com fim por contagem): exatamente N, nada mais ao ler o futuro', async () => {
    const res = await create({ description: 'Consultoria', amount: 50000, date: '2026-11-30', recurrenceKind: 'recurring', occurrences: 6 });
    expect(res.body.map((t: any) => t.date)).toEqual(['2026-11-30', '2026-12-30', '2027-01-30', '2027-02-28', '2027-03-30', '2027-04-30']);
    await list('2027-01-01', '2029-12-31');
    expect(await seriesRows(res.body[0].recurrenceId)).toHaveLength(6);
  });

  it('criada como paga: só a 1ª ocorrência fica paga', async () => {
    const res = await create({ description: 'Contador', amount: 30000, date: '2026-10-05', paid: true, paidAt: '2026-10-06', recurrenceKind: 'fixed' });
    const rows = res.body as any[];
    expect(rows[0]).toMatchObject({ paid: true, paidAt: '2026-10-06' });
    expect(rows.slice(1).every((t) => !t.paid && t.paidAt === null)).toBe(true);
  });
});

describe('qa-financeiro: editar e excluir séries', () => {
  it('"esta e as próximas" no valor: anteriores e pagas ficam; próximas e as que ainda serão geradas mudam', async () => {
    const res = await create({ description: 'Aluguel', amount: 180000, date: '2026-08-05', recurrenceKind: 'fixed' });
    const rows = res.body as any[];
    // Aug and Sep paid.
    for (const t of rows.slice(0, 2)) expect((await c.patch(`/transactions/${t.id}/paid`, { paid: true })).status).toBe(200);
    const dec = rows.find((t) => t.date === '2026-12-05');
    const upd = await c.put(`/transactions/${dec.id}?scope=future`, { amount: 200000 });
    expect(upd.status).toBe(200);
    const after = await list('2026-08-01', '2027-03-31');
    expect(after.map((t) => [t.date, t.amount])).toEqual([
      ['2026-08-05', 180000],
      ['2026-09-05', 180000],
      ['2026-10-05', 180000],
      ['2026-11-05', 180000],
      ['2026-12-05', 200000],
      ['2027-01-05', 200000],
      ['2027-02-05', 200000],
      ['2027-03-05', 200000],
    ]);
    // Generated later (beyond the first horizon): the new amount.
    expect((await list('2029-06-01', '2029-06-30')).map((t) => t.amount)).toEqual([200000]);
    // "Só esta" does not touch the series.
    const jan = after.find((t) => t.date === '2027-01-05');
    await c.put(`/transactions/${jan.id}?scope=one`, { amount: 1 });
    expect((await list('2029-07-01', '2029-07-31')).map((t) => t.amount)).toEqual([200000]);
    expect((await list('2027-02-01', '2027-02-28')).map((t) => t.amount)).toEqual([200000]);
  });

  it('"todas" a partir de uma paga altera só as não pagas', async () => {
    const res = await create({ description: 'Seguro', amount: 10000, date: '2026-09-10', recurrenceKind: 'recurring', occurrences: 4 });
    const rows = res.body as any[];
    await c.patch(`/transactions/${rows[0].id}/paid`, { paid: true });
    expect((await c.put(`/transactions/${rows[2].id}?scope=all`, { amount: 12000, description: 'Seguro novo' })).status).toBe(200);
    const after = await seriesRows(rows[0].recurrenceId);
    expect(after.map((r) => r.amount)).toEqual([10000, 12000, 12000, 12000]);
    const all = await list('2026-09-01', '2026-12-31');
    expect(all.map((t) => t.description)).toEqual(['Seguro', 'Seguro novo', 'Seguro novo', 'Seguro novo']);
  });

  // A tela de edição (transaction-sheet.tsx → commonPayload) SEMPRE envia `amount` e `date` junto com a
  // alteração. Mudar só a categoria de uma compra parcelada a partir da 1ª parcela (que leva o centavo a
  // mais) com "Todas as parcelas" não deveria mexer nos valores.
  it('DEFEITO: mudar a categoria de todas as parcelas a partir da 1ª (enviando o mesmo valor, como a tela faz) altera o valor das outras e a soma deixa de bater', async () => {
    const res = await create({ description: 'Geladeira', amount: 10000, date: '2026-11-10', recurrenceKind: 'installment', installments: 3 });
    const [first] = res.body as any[];
    const category = await firstCategory(c, 'expense');
    const upd = await c.put(`/transactions/${first.id}?scope=all`, {
      description: first.description,
      amount: first.amount, // 3334, unchanged
      date: first.date,
      categoryId: category.id,
    });
    expect(upd.status).toBe(200);
    const after = await seriesRows(first.recurrenceId);
    // Obtido: [3334, 3334, 3334] (total 100,02).
    expect(after.map((r) => r.amount)).toEqual([3334, 3333, 3333]);
    expect(sum(after.map((r) => r.amount))).toBe(10000);
  });

  // O hint da tela para "Deste em diante" é "Altera este e os próximos ainda não pagos" e o formulário
  // envia a nova data; o schema (`transactionUpdateSchema`) diz que a data nunca vai para a série.
  it('DEFEITO: mudar o dia do vencimento com "esta e as próximas" não muda as próximas nem as que ainda serão geradas', async () => {
    const res = await create({ description: 'Aluguel', amount: 180000, date: '2026-10-05', recurrenceKind: 'fixed' });
    const dec = (res.body as any[]).find((t) => t.date === '2026-12-05');
    const upd = await c.put(`/transactions/${dec.id}?scope=future`, { date: '2026-12-10' });
    expect(upd.status).toBe(200);
    expect(upd.body.date).toBe('2026-12-10');
    // Obtido: 2027-01-05, 2027-02-05 e, gerado depois, 2029-03-05.
    expect((await list('2027-01-01', '2027-02-28')).map((t) => t.date)).toEqual(['2027-01-10', '2027-02-10']);
    expect((await list('2029-03-01', '2029-03-31')).map((t) => t.date)).toEqual(['2029-03-10']);
  });

  it('excluir "deste em diante" encerra a série (único jeito de pôr data de fim): nada volta ao ler o futuro', async () => {
    const res = await create({ description: 'Academia', amount: 9900, date: '2026-09-15', recurrenceKind: 'fixed' });
    const rows = res.body as any[];
    await c.patch(`/transactions/${rows[0].id}/paid`, { paid: true });
    const mar = rows.find((t) => t.date === '2027-03-15');
    expect((await c.del(`/transactions/${mar.id}?scope=future`)).status).toBe(204);
    const left = await seriesRows(rows[0].recurrenceId);
    expect(left.at(-1)!.date).toBe('2027-02-15');
    expect(left).toHaveLength(6);
    expect(await list('2027-03-01', '2030-12-31')).toEqual([]);
    expect(await seriesRows(rows[0].recurrenceId)).toHaveLength(6);
  });

  it('excluir "só esta" não faz a ocorrência voltar na próxima leitura; "todas" remove inclusive as pagas', async () => {
    const res = await create({ description: 'Luz', amount: 25000, date: '2026-10-12', recurrenceKind: 'fixed' });
    const rows = res.body as any[];
    const nov = rows.find((t) => t.date === '2026-11-12');
    expect((await c.del(`/transactions/${nov.id}?scope=one`)).status).toBe(204);
    await list('2026-10-01', '2029-12-31');
    expect((await list('2026-11-01', '2026-11-30'))).toEqual([]);
    await c.patch(`/transactions/${rows[0].id}/paid`, { paid: true });
    expect((await c.del(`/transactions/${rows[0].id}?scope=all`)).status).toBe(204);
    expect(await seriesRows(rows[0].recurrenceId)).toHaveLength(0);
    expect(await list('2026-01-01', '2031-12-31')).toEqual([]);
  });
});
