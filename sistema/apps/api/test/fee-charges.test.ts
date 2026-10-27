// "Gerar honorários" (one receivable per client and competence month, due in the following month)
// and "+ Empregados" (headcount × employee fee of the same fee period). Today is pinned to 2026-10-20.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { createAccount, createTestApp, registerUser, resetDb, type Client } from './helpers';

let app: App;
let c: Client;
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

const BASE = { taxRegime: 'simples_nacional', simplesAnnex: 'III', contractStartDate: '2024-03-15' };

async function createClient(as: Client, input: Record<string, unknown>, fees: { amount: number; employeeFee?: number }[] = []) {
  const res = await as.post('/clients', { ...BASE, ...input });
  if (res.status !== 201) throw new Error(`client failed: ${JSON.stringify(res.body)}`);
  for (const fee of fees) {
    const added = await as.post(`/clients/${res.body.id}/fees`, fee);
    if (added.status !== 201) throw new Error(`fee failed: ${JSON.stringify(added.body)}`);
  }
  return res.body.id as string;
}

/**
 * Pão Quente: three yearly periods (the third starts on 15/03/2026). Tecnova: started in January,
 * no employee fee. Horizonte: starts in November. Rota Sul: inactivated on 30/09. Alicerce: its
 * only period ended in 2025 (renewal pending).
 */
async function seedOffice(as: Client = c) {
  return {
    bakery: await createClient(as, { name: 'Padaria Pão Quente Ltda', tradeName: 'Pão Quente', document: '11.222.333/0001-81' }, [
      { amount: 75000, employeeFee: 3000 },
      { amount: 80000, employeeFee: 3500 },
      { amount: 85000, employeeFee: 4000 },
    ]),
    software: await createClient(
      as,
      { name: 'Tecnova Soluções em Software Ltda', tradeName: 'Tecnova', document: '45.723.174/0001-10', taxRegime: 'presumed_profit', contractStartDate: '2026-01-10' },
      [{ amount: 240000 }],
    ),
    future: await createClient(as, { name: 'Horizonte Engenharia Ltda', document: '28.051.496/0001-41', contractStartDate: '2026-11-05' }, [{ amount: 50000 }]),
    former: await (async () => {
      const id = await createClient(as, { name: 'Rota Sul Ltda', tradeName: 'Rota Sul', document: '61.370.925/0001-19', contractStartDate: '2025-01-10' }, [
        { amount: 120000, employeeFee: 5000 },
        { amount: 130000, employeeFee: 5000 },
      ]);
      await as.post(`/clients/${id}/inactivate`, { date: '2026-09-30', reason: 'accounting_transfer' });
      return id;
    })(),
    renewal: await createClient(as, { name: 'Construtora Alicerce Ltda', tradeName: 'Alicerce', document: '90.531.847/0001-95', contractStartDate: '2024-05-01' }, [
      { amount: 190000 },
    ]),
  };
}

const generate = (body: Record<string, unknown>, as: Client = c) => as.post('/fee-charges/generate', body);
const incomes = async (as: Client = c) => (await as.get('/transactions?type=income&pageSize=200')).body.items as any[];

describe('Gerar honorários', () => {
  it('bills each client for the competence with the fee in force at its end, due the next month', async () => {
    const ids = await seedOffice();

    // Dry run: what would be created, nothing written (not even the categories).
    const preview = await generate({ competence: '2026-10', dueDay: 31, dryRun: true });
    expect(preview.status).toBe(200);
    expect(preview.body).toEqual({
      competence: '2026-10',
      dueDate: '2026-11-30', // day 31 clamped to November
      dryRun: true,
      created: [
        { clientId: ids.bakery, name: 'Pão Quente', amount: 85000, transactionId: null },
        { clientId: ids.software, name: 'Tecnova', amount: 240000, transactionId: null },
      ],
      skipped: [
        { clientId: ids.renewal, name: 'Alicerce', reason: 'no_current_fee' },
        { clientId: ids.future, name: 'Horizonte Engenharia Ltda', reason: 'not_started' },
        { clientId: ids.former, name: 'Rota Sul', reason: 'inactive' },
      ],
      total: 325000,
    });
    expect(await incomes()).toEqual([]);
    expect((await c.get('/categories?type=income')).body.map((x: any) => x.name)).not.toContain('Serviços Prestados');

    const res = await generate({ competence: '2026-10', dueDay: 31 });
    expect(res.status).toBe(201);
    expect(res.body.created.map((x: any) => [x.name, x.amount])).toEqual([
      ['Pão Quente', 85000],
      ['Tecnova', 240000],
    ]);
    const rows = await incomes();
    expect(rows.map((t) => t.id).sort()).toEqual(res.body.created.map((x: any) => x.transactionId).sort());
    const bakeryFee = rows.find((t) => t.contactId === ids.bakery);
    expect(bakeryFee).toMatchObject({
      type: 'income',
      description: 'Honorários ref. 10/2026 - Pão Quente',
      amount: 85000,
      date: '2026-11-30',
      paid: false,
      accountId: null,
      paymentMethod: 'bank_slip',
      recurrenceKind: 'single',
      feeKind: 'fee',
      feeCompetence: '2026-10',
      feeOf: null,
      employees: null,
      category: { name: 'Serviços Prestados' },
      subcategory: { name: 'Honorários contábeis' },
    });

    // Run again: nothing new.
    const again = await generate({ competence: '2026-10' });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ dueDate: '2026-11-10', created: [], total: 0 });
    expect(again.body.skipped.filter((s: any) => s.reason === 'already_generated').map((s: any) => s.clientId).sort()).toEqual(
      [ids.bakery, ids.software].sort(),
    );

    // Across a fee period change (15/03/2026): the period in force at the end of the month.
    const feb = await generate({ competence: '2026-02' });
    const mar = await generate({ competence: '2026-03' });
    expect(feb.body.created.map((x: any) => [x.name, x.amount])).toEqual([
      ['Pão Quente', 80000],
      ['Rota Sul', 130000],
      ['Tecnova', 240000],
    ]);
    expect(feb.body.dueDate).toBe('2026-03-10');
    expect(mar.body.created.find((x: any) => x.clientId === ids.bakery).amount).toBe(85000);
    // Before Tecnova's contract (10/01/2026) and while Rota Sul was still a client.
    const dec = await generate({ competence: '2025-12' });
    expect(dec.body.skipped.find((s: any) => s.clientId === ids.software).reason).toBe('not_started');
    const sep = await generate({ competence: '2026-09' });
    expect(sep.body.created.find((x: any) => x.clientId === ids.former)).toMatchObject({ name: 'Rota Sul', amount: 130000 });

    // The categories were created once and reused.
    const cats = (await c.get('/categories?type=income')).body.filter((x: any) => x.name === 'Serviços Prestados');
    expect(cats).toHaveLength(1);
    expect(cats[0].subcategories.map((s: any) => s.name).sort()).toEqual(['Folha de pagamento', 'Honorários contábeis']);
    expect(new Set((await incomes()).map((t) => t.subcategory.id)).size).toBe(1);
  });

  it('reuses the categories whatever their case, and the office defaults', async () => {
    await seedOffice();
    const parent = await c.post('/categories', { name: 'serviços prestados', type: 'income', icon: 'briefcase', color: '#12A150' });
    await c.post('/categories', { name: 'HONORÁRIOS CONTÁBEIS', type: 'income', icon: 'briefcase', color: '#12A150', parentId: parent.body.id });
    await generate({ competence: '2026-10' });
    const [fee] = await incomes();
    expect(fee.category).toMatchObject({ id: parent.body.id, name: 'serviços prestados' });
    expect(fee.subcategory.name).toBe('HONORÁRIOS CONTÁBEIS');
    expect((await c.get('/categories?type=income')).body.filter((x: any) => x.name.toLowerCase() === 'serviços prestados')).toHaveLength(1);

    // A business workspace starts with them.
    const office = await c.post('/workspaces', { name: 'Escritório', kind: 'business' });
    await c.post('/auth/switch-workspace', { workspaceId: office.body.id });
    const defaults = (await c.get('/categories?type=income')).body.find((x: any) => x.name === 'Serviços Prestados');
    expect(defaults.subcategories.map((s: any) => s.name).sort()).toEqual(['13º honorário', 'Folha de pagamento', 'Honorários contábeis', 'Serviços avulsos']);
    await createClient(c, { name: 'Padaria Pão Quente Ltda', tradeName: 'Pão Quente', document: '11.222.333/0001-81' }, [
      { amount: 1000 },
      { amount: 1000 },
      { amount: 1000 },
    ]);
    await generate({ competence: '2026-10' });
    expect((await incomes())[0].subcategory.id).toBe(defaults.subcategories.find((s: any) => s.name === 'Honorários contábeis').id);
    expect((await c.get('/categories?type=income')).body.filter((x: any) => x.name === 'Serviços Prestados')).toHaveLength(1);
  });

  it('never bills a client twice for a month, also through an edit', async () => {
    const ids = await seedOffice();
    await generate({ competence: '2026-10' });
    await generate({ competence: '2026-09' });
    const tecnovaSeptember = (await incomes()).find((t) => t.contactId === ids.software && t.feeCompetence === '2026-09');
    // Moving Tecnova's September fee to Pão Quente would bill Pão Quente twice for September.
    const res = await c.put(`/transactions/${tecnovaSeptember.id}?scope=one`, { contactId: ids.bakery });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('O honorário deste cliente já foi gerado para esta competência.');
    // Deleting a fee allows generating it again.
    expect((await c.del(`/transactions/${tecnovaSeptember.id}?scope=one`)).status).toBe(204);
    const regenerated = await generate({ competence: '2026-09' });
    expect(regenerated.body.created.map((x: any) => x.clientId)).toEqual([ids.software]);
  });

  it('validates the competence and the due day', async () => {
    for (const body of [{ competence: '2026-13' }, { competence: '10/2026' }, { competence: '2026-10', dueDay: 0 }, { competence: '2026-10', dueDay: 32 }, {}]) {
      const res = await generate(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const january = await generate({ competence: '2027-01', dueDay: 31, dryRun: true });
    expect(january.body.dueDate).toBe('2027-02-28');
    const december = await generate({ competence: '2026-12', dryRun: true });
    expect(december.body.dueDate).toBe('2027-01-10');
  });
});

describe('+ Empregados', () => {
  async function generated(competence: string) {
    const ids = await seedOffice();
    const res = await generate({ competence });
    const feeOf = (clientId: string) => res.body.created.find((x: any) => x.clientId === clientId).transactionId as string;
    return { ids, feeOf };
  }

  it('bills headcount × the employee fee of the competence, with the fee due date', async () => {
    const { ids, feeOf } = await generated('2026-10');
    const fee = feeOf(ids.bakery);

    const preview = await c.post(`/fee-charges/${fee}/employees`, { employees: 6, dryRun: true });
    expect(preview.status).toBe(200);
    expect(preview.body).toEqual({ employees: 6, rate: 4000, amount: 24000, dryRun: true, transaction: null });
    expect((await incomes()).filter((t) => t.feeKind === 'employees')).toEqual([]);

    const res = await c.post(`/fee-charges/${fee}/employees`, { employees: 6 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ employees: 6, rate: 4000, amount: 24000, dryRun: false });
    expect(res.body.transaction).toMatchObject({
      type: 'income',
      description: 'Folha de pagamento ref. 10/2026 - Pão Quente (6 empregados)',
      amount: 24000,
      date: '2026-11-10',
      paid: false,
      contactId: ids.bakery,
      feeKind: 'employees',
      feeCompetence: '2026-10',
      feeOf: fee,
      employees: 6,
      category: { name: 'Serviços Prestados' },
      subcategory: { name: 'Folha de pagamento' },
    });

    // Sending again replaces it.
    const replaced = await c.post(`/fee-charges/${fee}/employees`, { employees: 1 });
    expect(replaced.body.transaction).toMatchObject({ id: res.body.transaction.id, amount: 4000, employees: 1 });
    expect(replaced.body.transaction.description).toBe('Folha de pagamento ref. 10/2026 - Pão Quente (1 empregado)');
    expect((await incomes()).filter((t) => t.feeKind === 'employees')).toHaveLength(1);

    // Editing the fee's due date moves the open employee charge with it.
    await c.put(`/transactions/${fee}?scope=one`, { date: '2026-11-12' });
    expect((await c.get(`/transactions/${res.body.transaction.id}`)).body.date).toBe('2026-11-12');

    // Zero removes it.
    const removed = await c.post(`/fee-charges/${fee}/employees`, { employees: 0 });
    expect(removed.body).toEqual({ employees: 0, rate: 4000, amount: 0, dryRun: false, transaction: null });
    expect((await c.get(`/transactions/${res.body.transaction.id}`)).status).toBe(404);
  });

  it('uses the employee fee of the period of that competence', async () => {
    const { ids, feeOf } = await generated('2026-02');
    const res = await c.post(`/fee-charges/${feeOf(ids.bakery)}/employees`, { employees: 2 });
    expect(res.body).toMatchObject({ rate: 3500, amount: 7000 });
    expect(res.body.transaction.description).toBe('Folha de pagamento ref. 02/2026 - Pão Quente (2 empregados)');
  });

  it('refuses what is not a generated fee, a client without employee fee and a received charge', async () => {
    const { ids, feeOf } = await generated('2026-10');
    const noRate = await c.post(`/fee-charges/${feeOf(ids.software)}/employees`, { employees: 3 });
    expect(noRate.status).toBe(422);
    expect(noRate.body.message).toBe('Cadastre a taxa por empregado no honorário do cliente');
    // Removing works even without a rate (nothing to remove here).
    expect((await c.post(`/fee-charges/${feeOf(ids.software)}/employees`, { employees: 0 })).status).toBe(200);

    const account = await createAccount(c);
    const manual = await c.post('/transactions', { type: 'income', description: 'Avulso', amount: 1000, date: '2026-10-10', accountId: account, contactId: ids.bakery });
    expect((await c.post(`/fee-charges/${manual.body[0].id}/employees`, { employees: 3 })).status).toBe(422);
    expect((await c.post('/fee-charges/00000000-0000-4000-8000-000000000000/employees', { employees: 3 })).status).toBe(404);
    for (const employees of [-1, 1.5, 100001, '3']) {
      expect((await c.post(`/fee-charges/${feeOf(ids.bakery)}/employees`, { employees })).status, String(employees)).toBe(400);
    }

    const charge = (await c.post(`/fee-charges/${feeOf(ids.bakery)}/employees`, { employees: 6 })).body.transaction;
    expect((await c.post(`/fee-charges/${charge.id}/employees`, { employees: 3 })).status).toBe(422); // a charge is not a fee
    await c.patch(`/transactions/${charge.id}/paid`, { paid: true, paidAt: '2026-10-20', accountId: account });
    for (const employees of [8, 0]) {
      const res = await c.post(`/fee-charges/${feeOf(ids.bakery)}/employees`, { employees });
      expect(res.status).toBe(422);
      expect(res.body.message).toContain('já foi recebida');
    }
    // The same headcount again is not a change.
    expect((await c.post(`/fee-charges/${feeOf(ids.bakery)}/employees`, { employees: 6 })).body.transaction).toMatchObject({ id: charge.id, paid: true });

    // Deleting the fee takes its employee charge along.
    expect((await c.del(`/transactions/${feeOf(ids.bakery)}?scope=one`)).status).toBe(204);
    expect((await c.get(`/transactions/${charge.id}`)).status).toBe(404);
  });

  it('feeds the competence to the delinquency report', async () => {
    const { ids, feeOf } = await generated('2026-08'); // due 10/09: 40 days late today
    await c.post(`/fee-charges/${feeOf(ids.bakery)}/employees`, { employees: 2 });
    const report = (await c.get('/reports/delinquency?months=3')).body;
    const bakery = report.clients.find((x: any) => x.contactId === ids.bakery);
    expect(bakery.overdue.map((o: any) => [o.description, o.competence, o.daysLate])).toEqual([
      ['Honorários ref. 08/2026 - Pão Quente', '2026-08', 40],
      ['Folha de pagamento ref. 08/2026 - Pão Quente (2 empregados)', '2026-08', 40],
    ]);
    expect(bakery.openAmount).toBe(85000 + 8000);
  });
});

describe('permissions and tenancy', () => {
  it('viewers cannot generate nor add employees; other workspaces see nothing', async () => {
    const office = await c.post('/workspaces', { name: 'Escritório', kind: 'business' });
    await c.post('/auth/switch-workspace', { workspaceId: office.body.id });
    const ids = await seedOffice();
    const fee = (await generate({ competence: '2026-10' })).body.created[0].transactionId;

    const invite = await c.post('/workspaces/current/invites', { email: 'leitora@teste.com', role: 'viewer' });
    const viewer = await registerUser(app, 'Leitora', 'leitora@teste.com');
    expect((await viewer.post(`/invites/${invite.body.inviteUrl.split('/convite/')[1]}/accept`)).status).toBe(200);
    expect((await viewer.post('/auth/switch-workspace', { workspaceId: office.body.id })).status).toBe(200);
    expect((await viewer.get('/transactions?type=income')).body.total).toBe(2);
    expect((await viewer.post('/fee-charges/generate', { competence: '2026-11', dryRun: true })).status).toBe(403);
    expect((await viewer.post(`/fee-charges/${fee}/employees`, { employees: 2 })).status).toBe(403);

    // Another office: its own clients only; the first office's fee does not exist there.
    const other = await registerUser(app, 'Outro Escritório');
    const theirs = await createClient(other, { name: 'Padaria Pão Quente Ltda', tradeName: 'Pão Quente', document: '11.222.333/0001-81' }, [
      { amount: 1000 },
      { amount: 1000 },
      { amount: 1000 },
    ]);
    const res = await generate({ competence: '2026-10' }, other);
    expect(res.body.created.map((x: any) => x.clientId)).toEqual([theirs]);
    expect(res.body.skipped).toEqual([]);
    expect((await other.post(`/fee-charges/${fee}/employees`, { employees: 2 })).status).toBe(404);
    expect((await generate({ competence: '2026-10' })).body.skipped.map((s: any) => s.clientId)).not.toContain(theirs);
    expect((await c.get('/transactions?type=income')).body.total).toBe(2);
    expect(ids.bakery).not.toBe(theirs);
  });
});
