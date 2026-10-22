import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { createAccount, createTestApp, firstCategory, registerUser, resetDb, type Client } from './helpers';

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
  account = await createAccount(c, { name: 'Itaú', bank: 'itau', initialBalance: 1000000 });
});

const listRange = async (from: string, to: string, extra = '') =>
  (await c.get(`/transactions?from=${from}&to=${to}&pageSize=200${extra}`)).body;

describe('installments', () => {
  it('splits the total keeping the cents in the first installment', async () => {
    const res = await c.post('/transactions', {
      type: 'expense',
      description: 'Geladeira',
      amount: 10000,
      date: '2026-01-31',
      accountId: account,
      recurrenceKind: 'installment',
      installments: 3,
    });
    expect(res.status).toBe(201);
    expect(res.body.map((t: any) => [t.date, t.amount, t.installmentNumber, t.installmentTotal])).toEqual([
      ['2026-01-31', 3334, 1, 3],
      ['2026-02-28', 3333, 2, 3],
      ['2026-03-31', 3333, 3, 3],
    ]);
    expect(res.body.every((t: any) => t.recurrenceKind === 'installment' && t.recurrenceId)).toBe(true);
  });

  it('supports per-installment amounts and marks only the first as paid', async () => {
    const res = await c.post('/transactions', {
      type: 'income',
      description: 'Venda parcelada',
      amount: 2500,
      date: '2026-10-10',
      paid: true,
      accountId: account,
      recurrenceKind: 'installment',
      installments: 4,
      installmentAmountMode: 'per_installment',
    });
    expect(res.body.map((t: any) => t.amount)).toEqual([2500, 2500, 2500, 2500]);
    expect(res.body.map((t: any) => t.paid)).toEqual([true, false, false, false]);
    expect(res.body[0].paidAt).toBe('2026-10-10');
  });
});

describe('fixed and recurring series', () => {
  it('materializes fixed monthly series on demand across months', async () => {
    const res = await c.post('/transactions', {
      type: 'expense',
      description: 'Aluguel',
      amount: 180000,
      date: '2026-08-05',
      accountId: account,
      recurrenceKind: 'fixed',
    });
    expect(res.status).toBe(201);
    // Generated up to today + 12 months on creation.
    expect(res.body[0].date).toBe('2026-08-05');
    expect(res.body.at(-1).date).toBe('2027-10-05');
    expect(res.body.every((t: any) => t.recurrenceKind === 'fixed' && t.frequency === 'monthly')).toBe(true);

    // Reading a far future month materializes it.
    const far = await listRange('2029-03-01', '2029-03-31');
    expect(far.items).toHaveLength(1);
    expect(far.items[0]).toMatchObject({ date: '2029-03-05', amount: 180000, description: 'Aluguel' });
    // Nothing is duplicated when reading again.
    const again = await listRange('2026-08-01', '2029-03-31', '&recurrenceKind=fixed');
    expect(again.total).toBe(32);
  });

  it('supports weekly/semiannual/annual frequencies with optional count', async () => {
    const weekly = await c.post('/transactions', {
      type: 'expense',
      description: 'Feira',
      amount: 8000,
      date: '2026-10-03',
      recurrenceKind: 'recurring',
      frequency: 'weekly',
      occurrences: 4,
    });
    expect(weekly.body.map((t: any) => t.date)).toEqual(['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24']);
    expect(weekly.body.map((t: any) => t.occurrenceNumber)).toEqual([1, 2, 3, 4]);

    const semi = await c.post('/transactions', {
      type: 'expense',
      description: 'Seguro',
      amount: 60000,
      date: '2026-03-15',
      recurrenceKind: 'recurring',
      frequency: 'semiannual',
    });
    expect(semi.body.map((t: any) => t.date)).toEqual(['2026-03-15', '2026-09-15', '2027-03-15', '2027-09-15']);

    const annual = await c.post('/transactions', {
      type: 'expense',
      description: 'IPVA',
      amount: 150000,
      date: '2026-01-20',
      recurrenceKind: 'recurring',
      frequency: 'annual',
      occurrences: 3,
    });
    expect(annual.body.map((t: any) => t.date)).toEqual(['2026-01-20', '2027-01-20', '2028-01-20']);
  });

  it('applies scope future/all edits only to unpaid occurrences', async () => {
    const created = await c.post('/transactions', {
      type: 'expense',
      description: 'Academia',
      amount: 10000,
      date: '2026-07-10',
      accountId: account,
      recurrenceKind: 'fixed',
    });
    const [jul, aug, sep, oct] = created.body;
    await c.patch(`/transactions/${jul.id}/paid`, { paid: true });
    await c.patch(`/transactions/${aug.id}/paid`, { paid: true });

    // 'future' from September: Sep onwards change, Jul/Aug (paid & earlier) untouched.
    const upd = await c.put(`/transactions/${sep.id}?scope=future`, { amount: 12000, description: 'Academia Plus' });
    expect(upd.status).toBe(200);
    const after = await listRange('2026-07-01', '2027-12-31', '&recurrenceKind=fixed');
    const byDate = Object.fromEntries(after.items.map((t: any) => [t.date, t]));
    expect(byDate['2026-07-10'].amount).toBe(10000);
    expect(byDate['2026-08-10'].amount).toBe(10000);
    expect(byDate['2026-09-10']).toMatchObject({ amount: 12000, description: 'Academia Plus' });
    expect(byDate['2026-10-10'].amount).toBe(12000);
    // Newly materialized months follow the new template.
    expect(byDate['2027-12-10']).toMatchObject({ amount: 12000, description: 'Academia Plus' });

    // 'all' keeps paid history but updates every unpaid one (including earlier unpaid ones).
    await c.put(`/transactions/${oct.id}?scope=all`, { notes: 'Plano anual' });
    const all = await listRange('2026-07-01', '2026-12-31', '&recurrenceKind=fixed');
    for (const t of all.items) {
      expect(t.notes).toBe(t.paid ? null : 'Plano anual');
    }

    // 'one' changes only the chosen occurrence.
    await c.put(`/transactions/${oct.id}?scope=one`, { amount: 1 });
    const nov = (await listRange('2026-11-01', '2026-11-30')).items[0];
    expect(nov.amount).toBe(12000);
  });

  it('deletes with scope one/future/all', async () => {
    const created = await c.post('/transactions', {
      type: 'income',
      description: 'Salário',
      amount: 800000,
      date: '2026-06-05',
      accountId: account,
      recurrenceKind: 'fixed',
    });
    const [jun, jul, aug] = created.body;
    await c.patch(`/transactions/${jun.id}/paid`, { paid: true });

    expect((await c.del(`/transactions/${jul.id}?scope=one`)).status).toBe(204);
    let list = await listRange('2026-06-01', '2026-09-30');
    expect(list.items.map((t: any) => t.date)).toEqual(['2026-06-05', '2026-08-05', '2026-09-05']);

    // 'future' from August stops the series: nothing after it, even far ahead.
    expect((await c.del(`/transactions/${aug.id}?scope=future`)).status).toBe(204);
    list = await listRange('2026-06-01', '2030-12-31');
    expect(list.items.map((t: any) => t.date)).toEqual(['2026-06-05']);

    // 'all' removes everything, paid history included.
    expect((await c.del(`/transactions/${jun.id}?scope=all`)).status).toBe(204);
    expect((await listRange('2026-01-01', '2030-12-31')).total).toBe(0);
  });
});

describe('paid toggle and balances', () => {
  it('marks paid with sensible default dates and updates the account balance', async () => {
    const overdue = await c.post('/transactions', {
      type: 'expense',
      description: 'Conta de luz',
      amount: 25000,
      date: '2026-10-10',
      accountId: account,
    });
    const future = await c.post('/transactions', {
      type: 'expense',
      description: 'Internet',
      amount: 10000,
      date: '2026-10-28',
      accountId: account,
    });
    const income = await c.post('/transactions', {
      type: 'income',
      description: 'Freela',
      amount: 50000,
      date: '2026-10-15',
      accountId: account,
      paid: true,
    });
    expect(income.body[0].paidAt).toBe('2026-10-15');

    let acc = (await c.get(`/accounts/${account}`)).body;
    expect(acc.balance).toBe(1000000 + 50000);
    // Pending items due until the end of the month count in the projection.
    expect(acc.projectedBalance).toBe(1000000 + 50000 - 25000 - 10000);

    const list = await c.get('/transactions?type=expense&status=overdue');
    expect(list.body.items.map((t: any) => t.description)).toEqual(['Conta de luz']);
    expect(list.body.items[0].overdue).toBe(true);
    expect(list.body.summary).toMatchObject({ overdue: 25000, overdueCount: 1 });

    const paidOverdue = await c.patch(`/transactions/${overdue.body[0].id}/paid`, { paid: true });
    expect(paidOverdue.body).toMatchObject({ paid: true, paidAt: '2026-10-10', overdue: false });
    const paidEarly = await c.patch(`/transactions/${future.body[0].id}/paid`, { paid: true });
    expect(paidEarly.body.paidAt).toBe('2026-10-20'); // today
    acc = (await c.get(`/accounts/${account}`)).body;
    expect(acc.balance).toBe(1000000 + 50000 - 25000 - 10000);

    const undo = await c.patch(`/transactions/${future.body[0].id}/paid`, { paid: false });
    expect(undo.body).toMatchObject({ paid: false, paidAt: null });
    acc = (await c.get(`/accounts/${account}`)).body;
    expect(acc.balance).toBe(1000000 + 50000 - 25000);
  });

  it('can assign the paying account when marking as paid', async () => {
    const tx = await c.post('/transactions', { type: 'expense', description: 'Boleto', amount: 3000, date: '2026-10-01' });
    const res = await c.patch(`/transactions/${tx.body[0].id}/paid`, { paid: true, accountId: account, paidAt: '2026-10-02' });
    expect(res.body).toMatchObject({ accountId: account, paidAt: '2026-10-02', account: { name: 'Itaú' } });
  });

  it('records interest and fine of a late payment as linked transactions', async () => {
    // today = 2026-10-20
    const client = await c.post('/contacts', { name: 'Padaria Pão Dourado' });
    const fee = await c.post('/transactions', {
      type: 'income',
      description: 'Honorários',
      amount: 35000,
      date: '2026-09-15',
      accountId: account,
      contactId: client.body.id,
    });
    const id = fee.body[0].id;

    // Only after the due date, only when confirming, never on card purchases.
    expect((await c.patch(`/transactions/${id}/paid`, { paid: true, paidAt: '2026-09-15', interest: 100 })).status).toBe(422);
    expect((await c.patch(`/transactions/${id}/paid`, { paid: false, fine: 100 })).status).toBe(422);
    expect((await c.patch(`/transactions/${id}/paid`, { paid: true, interest: -1 })).status).toBe(400);

    const paid = await c.patch(`/transactions/${id}/paid`, { paid: true, paidAt: '2026-10-05', interest: 700, fine: 1050 });
    expect(paid.status).toBe(200);
    expect(paid.body).toMatchObject({ paid: true, paidAt: '2026-10-05', lateFees: { interest: 700, fine: 1050 } });

    const linked = (await c.get('/transactions?type=income&from=2026-10-05&to=2026-10-05')).body.items;
    expect(linked.map((t: any) => [t.description, t.amount, t.lateFeeKind, t.lateFeeOf, t.paid, t.contactId]).sort()).toEqual([
      ['Juros — Honorários', 700, 'interest', id, true, client.body.id],
      ['Multa — Honorários', 1050, 'fine', id, true, client.body.id],
    ]);
    expect((await c.get(`/accounts/${account}`)).body.balance).toBe(1000000 + 35000 + 700 + 1050);

    // Confirming again with other amounts replaces them; zero removes one.
    const again = await c.patch(`/transactions/${id}/paid`, { paid: true, paidAt: '2026-10-05', interest: 900, fine: 0 });
    expect(again.body.lateFees).toEqual({ interest: 900, fine: 0 });
    expect((await c.get('/transactions?type=income&from=2026-10-05&to=2026-10-05')).body.total).toBe(1);

    // Reopening the payment removes them (also when reopened through the edit form).
    const reopened = await c.patch(`/transactions/${id}/paid`, { paid: false });
    expect(reopened.body.lateFees).toBeNull();
    expect((await c.get('/transactions?type=income&from=2026-10-05&to=2026-10-05')).body.total).toBe(0);
    await c.patch(`/transactions/${id}/paid`, { paid: true, paidAt: '2026-10-05', fine: 500 });
    await c.put(`/transactions/${id}?scope=one`, { paid: false });
    expect((await c.get('/transactions?type=income&from=2026-10-05&to=2026-10-05')).body.total).toBe(0);

    // Deleting the original deletes them.
    await c.patch(`/transactions/${id}/paid`, { paid: true, paidAt: '2026-10-05', interest: 300 });
    expect((await c.del(`/transactions/${id}?scope=one`)).status).toBe(204);
    expect((await c.get('/transactions?type=income&from=2026-10-05&to=2026-10-05')).body.total).toBe(0);
  });

  it('keeps interest and fine in step with the payment when it is confirmed again or edited', async () => {
    const client = await c.post('/contacts', { name: 'Padaria Pão Dourado' });
    const other = await createAccount(c, { name: 'Inter', initialBalance: 0 });
    const fee = await c.post('/transactions', {
      type: 'income',
      description: 'Honorários',
      amount: 35000,
      date: '2026-09-15',
      accountId: account,
      contactId: client.body.id,
    });
    const id = fee.body[0].id;
    const linked = async () =>
      (await c.get('/transactions?type=income&search=Honor&pageSize=50')).body.items
        .filter((t: any) => t.lateFeeOf === id)
        .map((t: any) => [t.lateFeeKind, t.amount, t.date, t.paidAt, t.accountId])
        .sort();
    await c.patch(`/transactions/${id}/paid`, { paid: true, paidAt: '2026-10-05', interest: 700, fine: 1050 });

    // Confirmed again with another date (no fees sent): they move with the payment.
    const moved = await c.patch(`/transactions/${id}/paid`, { paid: true, paidAt: '2026-10-08' });
    expect(moved.body.lateFees).toEqual({ interest: 700, fine: 1050 });
    expect(await linked()).toEqual([
      ['fine', 1050, '2026-10-08', '2026-10-08', account],
      ['interest', 700, '2026-10-08', '2026-10-08', account],
    ]);

    // Edited to another account: the fees were received there too.
    expect((await c.put(`/transactions/${id}?scope=one`, { accountId: other })).status).toBe(200);
    expect((await linked()).map((f: any) => f[4])).toEqual([other, other]);
    expect((await c.get(`/accounts/${other}`)).body.balance).toBe(35000 + 700 + 1050);
    expect((await c.get(`/accounts/${account}`)).body.balance).toBe(1000000);

    // A fee row is settled with its original: it is not reopened alone, nor charged fees itself.
    const [fine] = (await c.get(`/transactions?type=income&search=Multa`)).body.items;
    for (const res of [
      await c.patch(`/transactions/${fine.id}/paid`, { paid: false }),
      await c.put(`/transactions/${fine.id}?scope=one`, { paid: false }),
      await c.patch(`/transactions/${fine.id}/paid`, { paid: true, paidAt: '2026-10-09', interest: 100 }),
    ]) {
      expect(res.status).toBe(422);
    }
    expect((await c.patch(`/transactions/${fine.id}/paid`, { paid: false })).body.message).toContain('reabra o original');
    // ...but can be deleted on its own.
    expect((await c.del(`/transactions/${fine.id}?scope=one`)).status).toBe(204);
    expect((await c.get(`/transactions/${id}`)).body.lateFees).toEqual({ interest: 700, fine: 0 });

    // Payment date edited to the due date: no longer late, so no interest.
    const onTime = await c.put(`/transactions/${id}?scope=one`, { paidAt: '2026-09-15' });
    expect(onTime.body).toMatchObject({ paid: true, paidAt: '2026-09-15', lateFees: null });
    expect(await linked()).toEqual([]);

    // Same when confirmed again before the due date through PATCH /paid.
    await c.patch(`/transactions/${id}/paid`, { paid: true, paidAt: '2026-10-05', fine: 500 });
    expect(await linked()).toHaveLength(1);
    const early = await c.patch(`/transactions/${id}/paid`, { paid: true, paidAt: '2026-09-10' });
    expect(early.body).toMatchObject({ paidAt: '2026-09-10', lateFees: null });
    expect(await linked()).toEqual([]);
  });

  it('charges late fees only on bills and receivables, and removes them with the series', async () => {
    const other = await createAccount(c, { name: 'Reserva', initialBalance: 0 });
    const transfer = await c.post('/transfers', { fromAccountId: account, toAccountId: other, amount: 1000, date: '2026-09-01', paid: false });
    const onTransfer = await c.patch(`/transactions/${transfer.body.id}/paid`, { paid: true, paidAt: '2026-10-01', interest: 100 });
    expect(onTransfer.status).toBe(422);

    const card = await c.post('/credit-cards', { name: 'Nubank', bank: 'nubank', brand: 'mastercard', limit: 500000, closingDay: 3, dueDay: 10, defaultAccountId: account });
    const purchase = await c.post('/transactions', { type: 'expense', description: 'Livros', amount: 9000, date: '2026-08-20', creditCardId: card.body.id });
    const onCard = await c.patch(`/transactions/${purchase.body[0].id}/paid`, { paid: true, paidAt: '2026-10-01', fine: 100 });
    expect(onCard.status).toBe(422);
    expect(onCard.body.message).toContain('contas a pagar e a receber');

    // Monthly fee: July and August paid late with fees.
    const series = await c.post('/transactions', {
      type: 'income',
      description: 'Honorários mensais',
      amount: 50000,
      date: '2026-07-10',
      accountId: account,
      recurrenceKind: 'fixed',
    });
    expect(series.status).toBe(201);
    const [july, august] = series.body;
    expect([july.date, august.date]).toEqual(['2026-07-10', '2026-08-10']);
    await c.patch(`/transactions/${july.id}/paid`, { paid: true, paidAt: '2026-07-20', interest: 150, fine: 1000 });
    await c.patch(`/transactions/${august.id}/paid`, { paid: true, paidAt: '2026-08-20', interest: 150, fine: 1000 });
    const feeRows = async () => (await c.get('/transactions?type=income&from=2026-07-01&to=2026-08-31&pageSize=50')).body.items.filter((t: any) => t.lateFeeOf);
    expect(await feeRows()).toHaveLength(4);

    // This and the next ones: August's fees go with it; July (history) keeps its own.
    expect((await c.del(`/transactions/${august.id}?scope=future`)).status).toBe(204);
    expect((await feeRows()).map((t: any) => t.lateFeeOf)).toEqual([july.id, july.id]);
    // The whole series: nothing left.
    expect((await c.del(`/transactions/${july.id}?scope=all`)).status).toBe(204);
    expect(await feeRows()).toEqual([]);
    // Nothing was charged on the refused attempts (the transfer is still pending).
    expect((await c.get(`/accounts/${account}`)).body.balance).toBe(1000000);
    expect((await c.get(`/transactions/${transfer.body.id}`)).body.paid).toBe(false);
  });

  it('filters, searches, paginates and expands references', async () => {
    const cat = await firstCategory(c, 'expense', 'Alimentação');
    const contact = await c.post('/contacts', { name: 'Padaria do Zé' });
    for (let i = 1; i <= 5; i++) {
      await c.post('/transactions', {
        type: 'expense',
        description: `Pão ${i}`,
        amount: 1000 * i,
        date: `2026-10-0${i}`,
        categoryId: cat.id,
        subcategoryId: cat.subcategories[0]!.id,
        contactId: contact.body.id,
        paymentMethod: 'pix',
      });
    }
    const page = await c.get(`/transactions?categoryId=${cat.id}&pageSize=2&page=2&sort=amount_desc`);
    expect(page.body.total).toBe(5);
    expect(page.body.items.map((t: any) => t.amount)).toEqual([3000, 2000]);
    expect(page.body.summary.expense).toBe(15000);
    expect(page.body.items[0]).toMatchObject({
      category: { name: 'Alimentação' },
      subcategory: { id: cat.subcategories[0]!.id },
      contact: { name: 'Padaria do Zé' },
      paymentMethod: 'pix',
    });
    const search = await c.get('/transactions?search=pão 3');
    expect(search.body.items.map((t: any) => t.description)).toEqual(['Pão 3']);
    const bySub = await c.get(`/transactions?categoryId=${cat.subcategories[0]!.id}`);
    expect(bySub.body.total).toBe(5);
  });
});

describe('category split', () => {
  it('creates one linked transaction per category and keeps balances and reports right', async () => {
    const food = await firstCategory(c, 'expense', 'Alimentação');
    const home = await firstCategory(c, 'expense', 'Moradia');
    const res = await c.post('/transactions', {
      type: 'expense',
      description: 'Supermercado + casa',
      amount: 10000,
      date: '2026-10-05',
      paid: true,
      accountId: account,
      splits: [
        { categoryId: food.id, subcategoryId: food.subcategories[0]!.id, amount: 6000 },
        { categoryId: home.id, amount: 4000 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);
    const [a, b] = res.body;
    expect(a.splitGroupId).toBeTruthy();
    expect(b.splitGroupId).toBe(a.splitGroupId);
    expect(res.body.map((t: any) => [t.category.name, t.subcategory?.id ?? null, t.amount, t.paid, t.description])).toEqual([
      ['Alimentação', food.subcategories[0]!.id, 6000, true, 'Supermercado + casa'],
      ['Moradia', null, 4000, true, 'Supermercado + casa'],
    ]);

    const acc = await c.get(`/accounts/${account}`);
    expect(acc.body.balance).toBe(1000000 - 10000);

    const report = await c.get('/reports/categories?from=2026-10-01&to=2026-10-31&type=expense');
    const byName = Object.fromEntries(report.body.series.map((s: any) => [s.name, s.total]));
    expect(byName).toMatchObject({ Alimentação: 6000, Moradia: 4000 });
  });

  it('splits installments per part and rejects parts that do not add up', async () => {
    const food = await firstCategory(c, 'expense', 'Alimentação');
    const home = await firstCategory(c, 'expense', 'Moradia');
    const ok = await c.post('/transactions', {
      type: 'expense',
      description: 'Compra parcelada',
      amount: 9000,
      date: '2026-10-05',
      accountId: account,
      recurrenceKind: 'installment',
      installments: 3,
      splits: [
        { categoryId: food.id, amount: 6000 },
        { categoryId: home.id, amount: 3000 },
      ],
    });
    expect(ok.status).toBe(201);
    expect(ok.body).toHaveLength(6);
    const byCategory = (name: string) => ok.body.filter((t: any) => t.category.name === name).map((t: any) => t.amount);
    expect(byCategory('Alimentação')).toEqual([2000, 2000, 2000]);
    expect(byCategory('Moradia')).toEqual([1000, 1000, 1000]);
    expect(new Set(ok.body.map((t: any) => t.splitGroupId)).size).toBe(1);

    const bad = await c.post('/transactions', {
      type: 'expense',
      description: 'x',
      amount: 9000,
      date: '2026-10-05',
      splits: [
        { categoryId: food.id, amount: 6000 },
        { categoryId: home.id, amount: 2000 },
      ],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe('A soma das categorias deve ser igual ao valor total');
  });

  it('rejects categories of the wrong type or from another user', async () => {
    const food = await firstCategory(c, 'expense', 'Alimentação');
    const salary = await firstCategory(c, 'income');
    const wrongType = await c.post('/transactions', {
      type: 'expense',
      description: 'x',
      amount: 2000,
      date: '2026-10-05',
      splits: [
        { categoryId: food.id, amount: 1000 },
        { categoryId: salary.id, amount: 1000 },
      ],
    });
    expect(wrongType.status).toBeGreaterThanOrEqual(400);

    const other = await registerUser(app, 'Outra pessoa');
    const theirs = await firstCategory(other, 'expense', 'Moradia');
    const foreign = await c.post('/transactions', {
      type: 'expense',
      description: 'x',
      amount: 2000,
      date: '2026-10-05',
      splits: [
        { categoryId: food.id, amount: 1000 },
        { categoryId: theirs.id, amount: 1000 },
      ],
    });
    expect(foreign.status).toBe(404);
    expect((await listRange('2026-10-01', '2026-10-31')).total).toBe(0);
  });
});

describe('open-ended repetition (fixed) honors the frequency', () => {
  it('creates an endless annual series', async () => {
    const res = await c.post('/transactions', {
      type: 'expense',
      description: 'IPVA',
      amount: 150000,
      date: '2026-03-10',
      accountId: account,
      recurrenceKind: 'fixed',
      frequency: 'annual',
    });
    expect(res.status).toBe(201);
    expect(res.body.every((t: any) => t.recurrenceKind === 'fixed' && t.frequency === 'annual')).toBe(true);
    expect(res.body.map((t: any) => t.date).slice(0, 2)).toEqual(['2026-03-10', '2027-03-10']);
  });
});
