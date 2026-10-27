// Runs the in-browser API (PGlite + real route plugins) in Node to guard the demo build.
import { beforeAll, describe, expect, it } from 'vitest';
import { addMonths, monthKey, todayISO } from '@effinance/shared';
import { demoFetch } from './fetch';
import { DEMO_EMAIL, DEMO_PARTNER_EMAIL, DEMO_PASSWORD, getDemoServer } from './server';

async function call(method: string, path: string, body?: unknown) {
  const res = await demoFetch(`/api${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

const month = monthKey(todayISO());
/** 'YYYY-MM' → 'MM/AAAA'. */
const formatCompetence = (key: string) => `${key.slice(5)}/${key.slice(0, 4)}`;
const from = `${month}-01`;
const to = `${month}-28`;

describe('demo api (PGlite)', () => {
  beforeAll(async () => {
    expect((await call('GET', '/health')).body).toMatchObject({ status: 'ok', mode: 'demo' });
  }, 120_000);

  it('requires a session and logs in the seeded demo user', async () => {
    expect((await call('GET', '/auth/me')).status).toBe(401);
    const bad = await call('POST', '/auth/login', { email: DEMO_EMAIL, password: 'errada' });
    expect(bad).toMatchObject({ status: 401, body: { error: 'unauthorized' } });
    const ok = await call('POST', '/auth/login', { email: DEMO_EMAIL, password: DEMO_PASSWORD });
    expect(ok.status).toBe(200);
    const me = (await call('GET', '/auth/me')).body;
    expect(me.user.email).toBe(DEMO_EMAIL);
    // The office (business workspace) opens first.
    expect(me.workspace).toMatchObject({ name: 'Efficio Contabilidade', kind: 'business', role: 'owner' });
    expect(me.workspace.subscription).toMatchObject({ status: 'active', canWrite: true });
    expect(me.workspaces.map((w: { name: string }) => w.name)).toEqual(['Pessoal', 'Efficio Contabilidade', 'Família Costa']);
  });

  it('has the office clients, fee periods, suppliers and receivables (migration 0007 applied)', async () => {
    const all = (await call('GET', '/clients?status=all&pageSize=50')).body;
    expect(all.total).toBe(10);
    expect(all.summary).toMatchObject({ active: 8, inactive: 2, withoutCurrentFee: 1 });
    expect(all.summary.monthlyFees).toBeGreaterThan(0);

    const pending = all.items.find((c: { tradeName: string }) => c.tradeName === 'Alicerce');
    expect(pending).toMatchObject({ status: 'active', currentFee: null });
    expect(pending.latestFee.endDate < todayISO()).toBe(true);

    const bakery = all.items.find((c: { tradeName: string }) => c.tradeName === 'Pão Quente');
    expect(bakery.currentFee).toMatchObject({ amount: 78000, employeeFee: 3500 });
    const fees = (await call('GET', `/clients/${bakery.id}/fees`)).body;
    expect(fees.items[0].startDate <= todayISO() && todayISO() <= fees.items[0].endDate).toBe(true);
    expect(fees.items.at(-1).startDate).toBe(bakery.contractStartDate);
    expect(bakery.transactionCount).toBeGreaterThan(0);
    expect((await call('DELETE', `/clients/${bakery.id}`)).status).toBe(409);

    const transferred = all.items.find((c: { tradeName: string }) => c.tradeName === 'Bom Preço');
    expect(transferred).toMatchObject({ status: 'inactive', inactivation: { reason: 'accounting_transfer' } });
    // Fees generated for the competences until the inactivation (10 months before the current one, migration 0009).
    expect(transferred.transactionCount).toBe(9);

    expect((await call('GET', '/contacts?kind=supplier')).body.total).toBe(5);
    // This month's receivable is the fee of last month's competence ("Gerar honorários").
    const receivables = (await call('GET', `/transactions?type=income&contactId=${bakery.id}&from=${from}&to=${to}`)).body;
    const fee = receivables.items.find((t: { feeKind: string | null }) => t.feeKind === 'fee');
    expect(fee).toMatchObject({ contactId: bakery.id, amount: 78000, feeCompetence: monthKey(addMonths(from, -1)), category: { name: 'Serviços Prestados' } });
    expect(fee.description).toBe(`Honorários ref. ${formatCompetence(monthKey(addMonths(from, -1)))} - Pão Quente`);

    // Payment history behind the delinquency report and the overdue widgets (migration 0008).
    const report = (await call('GET', '/reports/delinquency?months=12')).body;
    const byName = (name: string) => report.clients.find((x: { tradeName: string | null }) => x.tradeName === name);
    const chronic = byName('Ju Prado Design');
    expect(chronic).toMatchObject({ openCount: 6, risk: 'critico' });
    expect(chronic.overdue).toHaveLength(6);
    expect(chronic.overdue.every((o: { competence: string | null; daysLate: number }) => o.competence && o.daysLate > 0)).toBe(true);
    expect(chronic.fineCount).toBeGreaterThan(0);
    expect(byName('Rota Sul')).toMatchObject({ openCount: 2 }); // the latest fee and its employee charge
    expect(byName('Rota Sul').interestCount).toBeGreaterThan(0);
    expect(byName('Tecnova')).toMatchObject({ lateCount: 0, openCount: 0, risk: 'baixo' });
    expect(byName('Sorriso Pleno')).toMatchObject({ lateCount: 0, openCount: 0 });
    expect(byName('Pão Quente').lateCount).toBeGreaterThan(0);
    // Most open amount first: Rota Sul's big fee, then the chronic small one.
    expect(report.clients.slice(0, 2).map((x: { tradeName: string }) => x.tradeName)).toEqual(['Rota Sul', 'Ju Prado Design']);
    expect(report.summary).toMatchObject({ openClients: 2, openCount: 8 });
    expect(report.summary.paidWithFeesCount).toBeGreaterThan(2);
    expect(report.summary.interestTotal + report.summary.fineTotal).toBeGreaterThan(0);
    expect(report.summary.clientsAtRisk).toBeGreaterThanOrEqual(1);
    const overdue = (await call('GET', '/transactions?type=income&status=overdue&pageSize=200')).body;
    expect(overdue.total).toBe(8);

    // "Gerar honorários": the seed stops at last month's competence, so the current one is left to generate.
    const preview = (await call('POST', '/fee-charges/generate', { competence: month, dryRun: true })).body;
    expect(preview.created).toHaveLength(7);
    expect(preview.created.every((x: { transactionId: string | null }) => x.transactionId === null)).toBe(true);
    const generated = await call('POST', '/fee-charges/generate', { competence: month });
    expect(generated.status).toBe(201);
    expect(generated.body).toMatchObject({ competence: month, dueDate: `${monthKey(addMonths(from, 1))}-10` });
    expect(generated.body.created).toHaveLength(7);
    expect(generated.body.skipped.map((x: { reason: string }) => x.reason).sort()).toEqual(['inactive', 'inactive', 'no_current_fee']);
    const again = (await call('POST', '/fee-charges/generate', { competence: month, dryRun: true })).body;
    expect(again.created).toEqual([]);
    expect(again.skipped.filter((x: { reason: string }) => x.reason === 'already_generated')).toHaveLength(7);
    const bakeryFee = generated.body.created.find((x: { clientId: string }) => x.clientId === bakery.id);
    const employees = await call('POST', `/fee-charges/${bakeryFee.transactionId}/employees`, { employees: 5 });
    expect(employees.body).toMatchObject({ employees: 5, rate: 3500, amount: 17500 });
    expect(employees.body.transaction).toMatchObject({ feeKind: 'employees', feeOf: bakeryFee.transactionId, subcategory: { name: 'Folha de pagamento' } });

    // The rest of the suite runs in Marina's personal workspace (cards, goals, integrations).
    const me = (await call('GET', '/auth/me')).body;
    const personal = me.workspaces.find((w: { kind: string }) => w.kind === 'personal');
    expect((await call('POST', '/auth/switch-workspace', { workspaceId: personal.id })).status).toBe(200);
  });

  it('serves dashboard, statement and every report', async () => {
    const dash = await call('GET', `/dashboard?month=${month}`);
    expect(dash.status).toBe(200);
    expect(dash.body.accounts.length).toBeGreaterThan(0);
    expect(typeof dash.body.balances.netWorth).toBe('number');
    // Dashboard widgets: totals behind the capped upcoming list and the card invoices to pay.
    expect(dash.body.upcoming.length).toBeLessThanOrEqual(50);
    expect(dash.body.upcomingTotals.incomeCount + dash.body.upcomingTotals.expenseCount).toBeGreaterThanOrEqual(dash.body.upcoming.length);
    expect(Array.isArray(dash.body.invoicesToPay)).toBe(true);

    const paths = [
      `/statement?from=${from}&to=${to}`,
      `/transactions?type=expense&from=${from}&to=${to}`,
      `/reports/overview?from=${from}&to=${to}`,
      `/reports/categories?from=${from}&to=${to}`,
      `/reports/contacts?from=${from}&to=${to}`,
      `/reports/cashflow?from=${from}&to=${to}&granularity=week`,
      `/reports/cashflow?from=${from}&to=${to}&granularity=day`,
      `/transactions?type=income&status=overdue&sort=date_asc&pageSize=200&page=1`,
      '/clients?status=all&pageSize=200',
      `/reports/comparison?aFrom=${from}&aTo=${to}&bFrom=${from}&bTo=${to}`,
      '/credit-cards',
      '/goals',
      '/contacts',
      '/categories',
      '/search?q=a',
    ];
    for (const p of paths) {
      const res = await call('GET', p);
      expect(res.status, p).toBe(200);
    }
  });

  it('creates installments, toggles paid and validates input', async () => {
    const accounts = (await call('GET', '/accounts')).body;
    const created = await call('POST', '/transactions', {
      type: 'expense',
      description: 'Notebook',
      amount: 300000,
      date: from,
      accountId: accounts[0].id,
      recurrenceKind: 'installment',
      installments: 3,
    });
    expect(created.status).toBe(201);
    expect(created.body.map((t: { amount: number }) => t.amount)).toEqual([100000, 100000, 100000]);

    const paid = await call('PATCH', `/transactions/${created.body[0].id}/paid`, { paid: true });
    expect(paid.body.paid).toBe(true);

    const invalid = await call('POST', '/transactions', { type: 'expense', description: '', amount: 0, date: 'x' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe('validation_error');

    expect((await call('DELETE', `/transactions/${created.body[0].id}?scope=all`)).status).toBe(204);
  });

  it('splits an amount across categories (migration 0001 applied)', async () => {
    const cats = (await call('GET', '/categories?type=expense')).body;
    const split = await call('POST', '/transactions', {
      type: 'expense',
      description: 'Compra dividida',
      amount: 5000,
      date: from,
      splits: [
        { categoryId: cats[0].id, amount: 3000 },
        { categoryId: cats[1].id, amount: 2000 },
      ],
    });
    expect(split.status).toBe(201);
    expect(split.body.map((t: { amount: number }) => t.amount)).toEqual([3000, 2000]);
    expect(split.body[0].splitGroupId).toBe(split.body[1].splitGroupId);
  });

  it('keeps workspaces isolated with RLS and encrypts personal data in PGlite', async () => {
    const { client } = await getDemoServer();
    const me = (await call('GET', '/auth/me')).body;
    const family = me.workspaces.find((w: { kind: string }) => w.kind === 'family');

    const personalAccounts = (await call('GET', '/accounts')).body.map((a: { name: string }) => a.name);
    const switched = await call('POST', '/auth/switch-workspace', { workspaceId: family.id });
    expect(switched.body.workspace).toMatchObject({ name: 'Família Costa', role: 'owner', subscription: { status: 'active' } });
    const familyAccounts = (await call('GET', '/accounts')).body.map((a: { name: string }) => a.name);
    expect(familyAccounts).toContain('Conta conjunta');
    expect(familyAccounts).not.toEqual(expect.arrayContaining(personalAccounts.filter((n: string) => n !== 'Carteira')));
    const members = (await call('GET', '/workspaces/current/members')).body;
    expect(members.map((m: { email: string }) => m.email)).toEqual([DEMO_EMAIL, DEMO_PARTNER_EMAIL]);

    // The tenant role only sees the workspace pinned in the transaction.
    const visible = await client.transaction(async (tx) => {
      await tx.query(`select set_config('role', 'effinance_app', true), set_config('app.workspace_id', $1, true)`, [family.id]);
      return (await tx.query<{ n: number }>('select count(distinct workspace_id)::int as n from accounts')).rows[0]!.n;
    });
    expect(visible).toBe(1);

    const invite = await call('POST', '/workspaces/current/invites', { email: 'amiga@demo.app', role: 'viewer' });
    expect(invite.status).toBe(201);
    expect(invite.body.inviteUrl).toContain('/convite/');

    await call('POST', '/auth/switch-workspace', { workspaceId: me.workspace.id });
    const contacts = (await client.query<{ email: string | null }>('select email from contacts where email is not null')).rows;
    expect(contacts.length).toBeGreaterThan(0);
    expect(contacts.every((c) => c.email!.startsWith('v1.'))).toBe(true);
    const plain = (await call('GET', '/contacts')).body.items.find((c: { email: string | null }) => c.email);
    expect(plain.email).toContain('@');
  });

  it('runs the fake checkout and activates a plan', async () => {
    const checkout = await call('POST', '/billing/checkout', { planCode: 'individual_monthly' });
    expect(checkout.body.checkoutUrl).toContain('#/configuracoes?aba=assinatura&simular=individual_monthly');
    const active = await call('POST', '/billing/dev/activate', { planCode: 'individual_monthly' });
    expect(active.body).toMatchObject({ status: 'active', canWrite: true, plan: { code: 'individual_monthly' } });
    expect((await call('GET', '/billing/plans')).body).toHaveLength(4);
  });

  it('has the seeded integrations and imports/undoes a CSV statement', async () => {
    const seeded = (await call('GET', '/open-finance/connections')).body;
    expect(seeded).toEqual([expect.objectContaining({ provider: 'fake', institution: expect.objectContaining({ name: 'Banco Inter', bank: 'inter' }) })]);
    expect(seeded[0].accounts.find((a: { kind: string }) => a.kind === 'bank').linkedAccountId).not.toBeNull();
    const batches = (await call('GET', '/imports')).body;
    expect(batches.items.map((b: { origin: string }) => b.origin).sort()).toEqual(['file', 'open_finance']);

    const accountId = (await call('GET', '/accounts')).body[0].id;
    const content = `Data;Descrição;Valor\n${from.split('-').reverse().join('/')};Feira do bairro;-42,50\n${from.split('-').reverse().join('/')};Venda de livro usado;30,00\n`;
    const target = { kind: 'account', accountId };
    const preview = await call('POST', '/imports/preview', { fileName: 'extrato.csv', content, target });
    expect(preview.status).toBe(200);
    expect(preview.body.rows.map((r: { type: string; amount: number }) => [r.type, r.amount])).toEqual([
      ['expense', 4250],
      ['income', 3000],
    ]);
    const rows = preview.body.rows.map((r: Record<string, unknown>) => ({
      date: r.date,
      description: r.description,
      amount: r.amount,
      type: r.type,
      externalId: r.externalId,
      categoryId: r.categoryId,
    }));
    const committed = await call('POST', '/imports', { fileName: 'extrato.csv', format: 'csv', target, rows });
    expect(committed).toMatchObject({ status: 201, body: { created: 2, skipped: 0, batch: { origin: 'file', remainingCount: 2 } } });
    // Idempotent.
    expect((await call('POST', '/imports', { fileName: 'extrato.csv', format: 'csv', target, rows })).body).toMatchObject({ created: 0, skipped: 2 });
    const imported = (await call('GET', `/transactions?accountId=${accountId}&search=Feira`)).body.items[0];
    expect(imported).toMatchObject({ origin: 'file', importBatchId: committed.body.batch.id, paid: true });
    expect((await call('DELETE', `/imports/${committed.body.batch.id}`)).status).toBe(204);
    expect((await call('GET', `/transactions?accountId=${accountId}&search=Feira`)).body.total).toBe(0);
    const undone = (await call('GET', '/imports')).body.items.find((b: { id: string }) => b.id === committed.body.batch.id);
    expect(undone).toMatchObject({ remainingCount: 0, undoneAt: expect.any(String) });
    expect((await call('GET', '/transactions?origin=open_finance')).body.total).toBeGreaterThan(0);
  });

  it('connects, links, syncs and disconnects a simulated bank (fake provider)', async () => {
    expect((await call('GET', '/open-finance/status')).body).toEqual({ enabled: true, provider: 'fake', sandbox: true });
    const institutions = (await call('GET', '/open-finance/dev/institutions')).body;
    expect(institutions.map((i: { id: string }) => i.id)).toContain('nubank');
    expect((await call('POST', '/open-finance/connect-token', {})).body).toMatchObject({ provider: 'fake', sandbox: true });
    const { itemId } = (await call('POST', '/open-finance/dev/connect', { institutionId: 'nubank' })).body;
    const created = await call('POST', '/open-finance/connections', { itemId });
    expect(created.status).toBe(201);
    const connection = created.body;
    const card = (await call('GET', '/credit-cards')).body[0];
    const linked = await call('PUT', `/open-finance/connections/${connection.id}/accounts`, {
      links: [
        { connectionAccountId: connection.accounts[0].id, target: { kind: 'new' } },
        { connectionAccountId: connection.accounts[1].id, target: { kind: 'credit_card', creditCardId: card.id } },
      ],
    });
    expect(linked.status).toBe(200);
    const sync = await call('POST', `/open-finance/connections/${connection.id}/sync`);
    expect(sync.status).toBe(200);
    expect(sync.body.created).toBeGreaterThan(0);
    const resync = await call('POST', `/open-finance/connections/${connection.id}/sync`);
    expect(resync.body).toMatchObject({ created: 0, updated: 0 });
    expect((await call('DELETE', `/open-finance/connections/${connection.id}`)).status).toBe(204);
    expect((await call('GET', '/open-finance/connections')).body).toHaveLength(1);
    // Provider ids are stored encrypted in PGlite too.
    const { client } = await getDemoServer();
    const ids = (await client.query<{ id: string }>('select provider_item_id as id from bank_connections')).rows;
    expect(ids.every((r) => r.id.startsWith('v1.') && !r.id.includes(itemId))).toBe(true);
  });

  it('registers new users with default categories', async () => {
    const reg = await call('POST', '/auth/register', { name: 'Teste', email: 'teste@demo.app', password: 'senha12345', acceptTerms: true });
    expect(reg.status).toBe(201);
    const cats = await call('GET', '/categories');
    expect(cats.body.length).toBeGreaterThan(5);
    const sessions = await call('GET', '/auth/sessions');
    expect(sessions.body).toEqual([expect.objectContaining({ current: true })]);
    expect((await call('POST', '/auth/logout')).status).toBe(204);
    expect((await call('GET', '/auth/me')).status).toBe(401);
    expect((await call('POST', '/auth/refresh')).status).toBe(401);
  });
});
