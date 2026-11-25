// QA do Financeiro (agente qa-logica-financeiro): honorários — geração mensal sem duplicar, cliente que
// começa no meio do mês, vigência que vence no mês, reajuste em lote só da vigência nova em diante,
// "+ Empregados", cliente inativado e dia de vencimento (31, fim de semana, feriado).
// Hoje fixo em 2026-10-20 (terça). Regras em docs/api.md → "Gerar honorários" e "Reajuste em lote".

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { executeRows } from '../src/lib/sql';
import { admin, createTestApp, registerUser, resetDb, type Client } from './helpers';
import { cnpj } from './task-helpers';

let app: App;
let c: Client;
let seed = 31_000_000;

beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
  c = await registerUser(app);
});

async function client(
  input: { name: string; contractStartDate: string; feeDueDay?: number },
  fees: { amount: number; employeeFee?: number; discountBps?: number }[] = [],
): Promise<string> {
  seed += 13;
  const res = await c.post('/clients', {
    name: `${input.name} Ltda`,
    tradeName: input.name,
    document: cnpj(seed),
    taxRegime: 'simples_nacional',
    simplesAnnex: 'III',
    contractStartDate: input.contractStartDate,
    ...(input.feeDueDay ? { feeDueDay: input.feeDueDay } : {}),
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  for (const fee of fees) expect((await c.post(`/clients/${res.body.id}/fees`, fee)).status).toBe(201);
  return res.body.id;
}

const generate = async (competence: string, dryRun = false) => {
  const res = await c.post('/fee-charges/generate', { competence, dryRun });
  expect([200, 201], JSON.stringify(res.body)).toContain(res.status);
  return res.body as { created: any[]; skipped: any[]; total: number };
};

const reasonOf = (r: { skipped: any[] }, id: string) => r.skipped.find((s) => s.clientId === id)?.reason ?? null;
const createdOf = (r: { created: any[] }, id: string) => r.created.find((s) => s.clientId === id) ?? null;

async function feeRows(clientId: string) {
  return executeRows<{ competence: string; kind: string; amount: number; date: string }>(
    admin(),
    sql`select fee_competence as competence, fee_kind as kind, amount::int as amount, to_char(date, 'YYYY-MM-DD') as date
          from transactions where contact_id = ${clientId} and fee_kind is not null order by fee_competence, fee_kind`,
  );
}

describe('qa-financeiro: gerar honorários', () => {
  it('rodar duas vezes (e três em paralelo) não duplica: um honorário por cliente e competência', async () => {
    const a = await client({ name: 'Alfa', contractStartDate: '2025-03-01' }, [{ amount: 100000 }, { amount: 110000 }]);
    const b = await client({ name: 'Beta', contractStartDate: '2026-01-10' }, [{ amount: 50000 }]);

    const dry = await generate('2026-10', true);
    expect(dry.created.map((x) => [x.name, x.amount, x.transactionId])).toEqual([['Alfa', 110000, null], ['Beta', 50000, null]]);
    expect(await feeRows(a)).toEqual([]);

    const first = await generate('2026-10');
    expect(first.total).toBe(160000);
    const again = await generate('2026-10');
    expect(again.created).toEqual([]);
    expect([reasonOf(again, a), reasonOf(again, b)]).toEqual(['already_generated', 'already_generated']);

    const parallel = await Promise.all([generate('2026-11'), generate('2026-11'), generate('2026-11')]);
    expect(parallel.reduce((n, r) => n + r.created.length, 0)).toBe(2);
    expect((await feeRows(a)).map((r) => r.competence)).toEqual(['2026-10', '2026-11']);
    expect((await feeRows(b)).map((r) => r.competence)).toEqual(['2026-10', '2026-11']);
  });

  it('cliente que começa no meio do mês: entra na competência do início com o honorário cheio (sem pro rata, como a regra diz)', async () => {
    const id = await client({ name: 'Meio do Mês', contractStartDate: '2026-10-15' }, [{ amount: 90000 }]);
    expect(reasonOf(await generate('2026-09'), id)).toBe('not_started');
    expect(createdOf(await generate('2026-10'), id)).toMatchObject({ amount: 90000, dueDate: '2026-11-10' });
  });

  it('vigência que vence no meio do mês: vale a do último dia da competência; sem ela, "reajuste pendente" até cadastrar', async () => {
    // Period 0: 15/10/2025 – 14/10/2026. Period 1 starts 15/10/2026 (not registered yet).
    const id = await client({ name: 'Vence no Mês', contractStartDate: '2025-10-15' }, [{ amount: 100000 }]);
    expect(createdOf(await generate('2026-09'), id)).toMatchObject({ amount: 100000 });
    expect(reasonOf(await generate('2026-10'), id)).toBe('no_current_fee');
    expect((await c.post(`/clients/${id}/fees`, { amount: 107000 })).status).toBe(201);
    expect(createdOf(await generate('2026-10'), id)).toMatchObject({ amount: 107000 });
    expect((await feeRows(id)).map((r) => [r.competence, r.amount])).toEqual([['2026-09', 100000], ['2026-10', 107000]]);
  });

  it('reajuste em lote: vale da vigência nova em diante; honorários já gerados não mudam', async () => {
    // Periods: 0 = 10/11/2024–09/11/2025, 1 = 10/11/2025–09/11/2026. Renewal in 11/2026.
    const id = await client({ name: 'Reajustada', contractStartDate: '2024-11-10' }, [
      { amount: 80000, employeeFee: 3000, discountBps: 500 },
      { amount: 90000, employeeFee: 3500, discountBps: 500 },
    ]);
    const oct = await generate('2026-10');
    expect(createdOf(oct, id)).toMatchObject({ amount: 90000, discountBps: 500 });
    expect(reasonOf(await generate('2026-11'), id)).toBe('no_current_fee');

    const applied = await c.post('/fee-adjustments', { month: '2026-11', appliedBps: 1000, clientIds: [id] });
    expect(applied.status, JSON.stringify(applied.body)).toBe(201);
    expect(applied.body.created[0]).toMatchObject({ period: { index: 2, startDate: '2026-11-10' }, adjusted: { amount: 99000, employeeFee: 3850 }, discountBps: 500 });

    const nov = await generate('2026-11');
    expect(createdOf(nov, id)).toMatchObject({ amount: 99000, discountBps: 500, dueDate: '2026-12-10' });
    expect(createdOf(await generate('2026-12'), id)).toMatchObject({ amount: 99000 });
    expect((await feeRows(id)).map((r) => [r.competence, r.amount])).toEqual([
      ['2026-10', 90000],
      ['2026-11', 99000],
      ['2026-12', 99000],
    ]);

    // "+ Empregados" of each competence uses the employee fee of its own period.
    const octFee = createdOf(oct, id).transactionId;
    const novFee = createdOf(nov, id).transactionId;
    const e1 = await c.post(`/fee-charges/${octFee}/employees`, { employees: 4 });
    const e2 = await c.post(`/fee-charges/${novFee}/employees`, { employees: 4 });
    expect([e1.status, e2.status]).toEqual([200, 200]);
    expect([e1.body.amount, e2.body.amount]).toEqual([14000, 15400]);
    expect(e2.body.transaction).toMatchObject({ date: '2026-12-10', feeKind: 'employees', feeCompetence: '2026-11', feeDiscountBps: null });
  });

  it('"+ Empregados": substitui ao reenviar, 0 remove, recusa sem taxa e depois de recebido', async () => {
    const id = await client({ name: 'Folha', contractStartDate: '2026-01-05' }, [{ amount: 60000, employeeFee: 2500 }]);
    const noRate = await client({ name: 'Sem Taxa', contractStartDate: '2026-01-05' }, [{ amount: 60000 }]);
    const gen = await generate('2026-10');
    const fee = createdOf(gen, id).transactionId;
    expect((await c.post(`/fee-charges/${fee}/employees`, { employees: 3 })).body.amount).toBe(7500);
    expect((await c.post(`/fee-charges/${fee}/employees`, { employees: 5 })).body.amount).toBe(12500);
    expect((await feeRows(id)).filter((r) => r.kind === 'employees').map((r) => r.amount)).toEqual([12500]);
    expect((await c.post(`/fee-charges/${fee}/employees`, { employees: 0 })).status).toBe(200);
    expect((await feeRows(id)).filter((r) => r.kind === 'employees')).toEqual([]);
    expect((await c.post(`/fee-charges/${createdOf(gen, noRate).transactionId}/employees`, { employees: 2 })).status).toBe(422);

    const charge = (await c.post(`/fee-charges/${fee}/employees`, { employees: 2 })).body.transaction;
    expect((await c.patch(`/transactions/${charge.id}/paid`, { paid: true, paidAt: '2026-11-05' })).status).toBe(200);
    expect((await c.post(`/fee-charges/${fee}/employees`, { employees: 3 })).status).toBe(422);
    expect((await c.post(`/fee-charges/${fee}/employees`, { employees: 2 })).status).toBe(200);
  });

  it('cliente inativado: não gera depois do mês da inativação; inativado durante o mês ainda é cobrado nele', async () => {
    const before = await client({ name: 'Saiu Setembro', contractStartDate: '2025-01-10' }, [{ amount: 70000 }, { amount: 75000 }]);
    const firstDay = await client({ name: 'Saiu Dia Primeiro', contractStartDate: '2025-01-10' }, [{ amount: 70000 }, { amount: 75000 }]);
    const middle = await client({ name: 'Saiu no Meio', contractStartDate: '2025-01-10' }, [{ amount: 70000 }, { amount: 75000 }]);
    expect((await c.post(`/clients/${before}/inactivate`, { date: '2026-09-30', reason: 'accounting_transfer' })).status).toBe(200);
    expect((await c.post(`/clients/${firstDay}/inactivate`, { date: '2026-10-01', reason: 'contract_end' })).status).toBe(200);
    expect((await c.post(`/clients/${middle}/inactivate`, { date: '2026-10-15', reason: 'contract_end' })).status).toBe(200);

    const oct = await generate('2026-10');
    expect(reasonOf(oct, before)).toBe('inactive');
    expect(createdOf(oct, firstDay)).toMatchObject({ amount: 75000 });
    expect(createdOf(oct, middle)).toMatchObject({ amount: 75000 });
    const nov = await generate('2026-11');
    expect([reasonOf(nov, before), reasonOf(nov, firstDay), reasonOf(nov, middle)]).toEqual(['inactive', 'inactive', 'inactive']);
    expect(createdOf(await generate('2026-09'), before)).toMatchObject({ amount: 75000 });
    // No new period after the inactivation.
    expect((await c.post(`/clients/${before}/fees`, { amount: 80000 })).status).toBe(422);
  });

  it('dia de vencimento: 31 vira o último dia do mês; sábado/domingo/feriado vai para o próximo dia útil', async () => {
    const d31 = await client({ name: 'Dia 31', contractStartDate: '2025-06-01', feeDueDay: 31 }, [{ amount: 10000 }, { amount: 10000 }]);
    const d10 = await client({ name: 'Dia 10', contractStartDate: '2025-06-01', feeDueDay: 10 }, [{ amount: 10000 }, { amount: 10000 }]);
    const d15 = await client({ name: 'Dia 15', contractStartDate: '2025-06-01', feeDueDay: 15 }, [{ amount: 10000 }, { amount: 10000 }]);
    // Competence 10/2026 → November: 30/11 (Monday), 10/11 (Tuesday), 15/11 (Sunday, holiday) → 16/11.
    const oct = await generate('2026-10');
    expect([createdOf(oct, d31).dueDate, createdOf(oct, d10).dueDate, createdOf(oct, d15).dueDate]).toEqual(['2026-11-30', '2026-11-10', '2026-11-16']);
    // Competence 01/2027 → February 2027: 28/02 is a Sunday → 01/03.
    const jan = await generate('2027-01');
    expect(createdOf(jan, d31).dueDate).toBe('2027-03-01');
    // Competence 12/2026 → 10/01/2027 is a Sunday → 11/01.
    expect(createdOf(await generate('2026-12'), d10).dueDate).toBe('2027-01-11');
    // Competence 03/2027 → 30/04/2027 (Friday).
    expect(createdOf(await generate('2027-03'), d31).dueDate).toBe('2027-04-30');
  });
});
