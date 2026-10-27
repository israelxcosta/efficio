// Clients (empresas atendidas), their yearly fee periods and the Receita Federal lookup.
// Today is pinned to 2026-10-20 (vitest.config.ts).

import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { contacts } from '../src/db/schema';
import { BrasilApiCnpjProvider } from '../src/modules/clients/providers/brasilapi';
import { CnpjProviderError } from '../src/modules/clients/providers/types';
import { executeRows } from '../src/lib/sql';
import { admin, createAccount, createTestApp, registerUser, resetDb, type Client } from './helpers';

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

const PADARIA = {
  name: 'Padaria Pão Quente Ltda',
  tradeName: 'Pão Quente',
  document: '11.222.333/0001-81',
  email: 'financeiro@paoquente.com.br',
  phone: '(19) 3234-5678',
  responsibleName: 'Marina Albuquerque',
  responsibleEmail: 'marina@paoquente.com.br',
  responsiblePhone: '(19) 99876-5432',
  taxRegime: 'simples_nacional',
  simplesAnnex: 'I',
  contractStartDate: '2024-03-15',
  city: 'Campinas',
  state: 'SP',
};

/** `summary.byRegime` with every regime at zero. */
const NO_REGIMES = { simples_nacional: 0, mei: 0, presumed_profit: 0, real_profit: 0, exempt: 0, other: 0 };

async function createClient(overrides: Record<string, unknown> = {}) {
  const res = await c.post('/clients', { ...PADARIA, ...overrides });
  if (res.status !== 201) throw new Error(`client failed: ${JSON.stringify(res.body)}`);
  return res.body as { id: string };
}

describe('clients', () => {
  it('registers a company with regime, Simples annex and contract start', async () => {
    const missingAnnex = await c.post('/clients', { ...PADARIA, simplesAnnex: '' });
    expect(missingAnnex.status).toBe(400);
    const cpf = await c.post('/clients', { ...PADARIA, document: '529.982.247-25' });
    expect(cpf.status).toBe(400);

    const res = await c.post('/clients', PADARIA);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Padaria Pão Quente Ltda',
      tradeName: 'Pão Quente',
      document: '11222333000181',
      phone: '1932345678',
      responsibleName: 'Marina Albuquerque',
      responsiblePhone: '19998765432',
      taxRegime: 'simples_nacional',
      simplesAnnex: 'I',
      contractStartDate: '2024-03-15',
      status: 'active',
      inactivation: null,
      currentFee: null,
      latestFee: null,
      transactionCount: 0,
    });

    // One client per CNPJ.
    const duplicate = await c.post('/clients', { ...PADARIA, name: 'Outra razão social' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).toContain('CNPJ');

    // The annex only exists under the Simples Nacional.
    const updated = await c.put(`/clients/${res.body.id}`, { ...PADARIA, taxRegime: 'presumed_profit', simplesAnnex: 'III' });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ taxRegime: 'presumed_profit', simplesAnnex: null });
  });

  it('stores the CNPJ and the responsible person encrypted', async () => {
    const { id } = await createClient();
    const [row] = await admin().select().from(contacts).where(eq(contacts.id, id));
    expect(row!.kind).toBe('client');
    for (const column of ['document', 'responsibleName', 'responsibleEmail', 'responsiblePhone'] as const) {
      expect(row![column]).not.toContain(String(PADARIA[column]).replace(/\D/g, '') || PADARIA[column]);
      expect(row![column]).toMatch(/^v\d+\./);
    }
    // Company data stays plain (searchable, not personal).
    expect(row).toMatchObject({ name: PADARIA.name, tradeName: 'Pão Quente', taxRegime: 'simples_nacional' });
  });

  it('lists clients apart from suppliers, with search and status filters', async () => {
    const padaria = await createClient();
    await createClient({ name: 'Tecnova Soluções em Software Ltda', tradeName: 'Tecnova', document: '45.723.174/0001-10', taxRegime: 'real_profit', simplesAnnex: null });
    await c.post('/contacts', { name: 'Papelaria Central' });

    expect((await c.get('/clients')).body.total).toBe(2);
    expect((await c.get('/clients?search=11.222.333/0001-81')).body.items.map((x: any) => x.id)).toEqual([padaria.id]);
    expect((await c.get('/clients?search=tecn')).body.items[0].tradeName).toBe('Tecnova');
    expect((await c.get('/clients?taxRegime=real_profit')).body.total).toBe(1);

    // Pickers see both kinds; the suppliers page only suppliers.
    const all = await c.get('/contacts?pageSize=200');
    expect(all.body.items.map((x: any) => x.kind).sort()).toEqual(['client', 'client', 'supplier']);
    const suppliers = await c.get('/contacts?kind=supplier');
    expect(suppliers.body.items.map((x: any) => x.name)).toEqual(['Papelaria Central']);

    // Clients are edited through /clients only.
    expect((await c.put(`/contacts/${padaria.id}`, { name: 'Hack' })).status).toBe(404);
    expect((await c.del(`/contacts/${padaria.id}`)).status).toBe(404);
    expect((await c.get(`/clients/${suppliers.body.items[0].id}`)).status).toBe(404);
  });

  it('is invisible to other workspaces', async () => {
    const { id } = await createClient();
    const other = await registerUser(app, 'Outra pessoa');
    expect((await other.get(`/clients/${id}`)).status).toBe(404);
    expect((await other.get(`/clients/${id}/fees`)).status).toBe(404);
    expect((await other.post(`/clients/${id}/fees`, { amount: 100 })).status).toBe(404);
    expect((await other.get('/clients')).body.total).toBe(0);
    // The same CNPJ can be a client of another workspace.
    expect((await other.post('/clients', PADARIA)).status).toBe(201);
  });
});

describe('inactivation', () => {
  it('asks for a date and a reason, and can be undone', async () => {
    const { id } = await createClient();

    const beforeContract = await c.post(`/clients/${id}/inactivate`, { date: '2024-01-10', reason: 'contract_end' });
    expect(beforeContract.status).toBe(422);
    const noReason = await c.post(`/clients/${id}/inactivate`, { date: '2026-09-30' });
    expect(noReason.status).toBe(400);
    const otherWithoutText = await c.post(`/clients/${id}/inactivate`, { date: '2026-09-30', reason: 'other' });
    expect(otherWithoutText.status).toBe(400);

    const res = await c.post(`/clients/${id}/inactivate`, { date: '2026-09-30', reason: 'accounting_transfer', notes: 'Foi para o escritório do cunhado' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'inactive',
      inactivation: { date: '2026-09-30', reason: 'accounting_transfer', notes: 'Foi para o escritório do cunhado' },
    });
    const [raw] = await admin().select().from(contacts).where(eq(contacts.id, id));
    expect(raw!.inactivationNotes).not.toContain('cunhado');

    expect((await c.post(`/clients/${id}/inactivate`, { date: '2026-10-01', reason: 'contract_end' })).status).toBe(409);
    expect((await c.get('/clients?status=active')).body.total).toBe(0);
    const inactive = await c.get('/clients?status=inactive');
    expect(inactive.body.total).toBe(1);
    expect(inactive.body.summary).toEqual({ active: 0, inactive: 1, monthlyFees: 0, withoutCurrentFee: 0, byRegime: NO_REGIMES, averageFee: 0 });

    const back = await c.post(`/clients/${id}/reactivate`);
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({ status: 'active', inactivation: null });
  });

  it('keeps the contract start before the inactivation date', async () => {
    const { id } = await createClient();
    await c.post(`/clients/${id}/inactivate`, { date: '2025-01-31', reason: 'company_closure' });
    const res = await c.put(`/clients/${id}`, { ...PADARIA, contractStartDate: '2025-06-01' });
    expect(res.status).toBe(422);
  });
});

describe('deletion', () => {
  it('is refused while transactions are linked to the client', async () => {
    const { id } = await createClient();
    const account = await createAccount(c);
    const receivable = await c.post('/transactions', {
      type: 'income',
      description: 'Honorários outubro',
      amount: 85000,
      date: '2026-10-10',
      accountId: account,
      contactId: id,
    });
    expect(receivable.status).toBe(201);

    expect((await c.get(`/clients/${id}`)).body.transactionCount).toBe(1);
    const res = await c.del(`/clients/${id}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('Inativar');
    expect((await c.get(`/clients/${id}`)).status).toBe(200);

    // Without the transaction the client (and its fees) can go.
    await c.post(`/clients/${id}/fees`, { amount: 85000 });
    await c.del(`/transactions/${receivable.body[0]?.id ?? receivable.body.id}`);
    expect((await c.del(`/clients/${id}`)).status).toBe(204);
    const [left] = await executeRows<{ n: number }>(admin(), sql`select count(*)::int as n from client_fees`);
    expect(left!.n).toBe(0);
  });

  it('is refused while a recurring series still points at the client', async () => {
    const { id } = await createClient();
    const account = await createAccount(c);
    const series = await c.post('/transactions', {
      type: 'income',
      description: 'Honorários mensais',
      amount: 85000,
      date: '2026-11-10',
      accountId: account,
      contactId: id,
      recurrenceKind: 'fixed',
    });
    expect(series.status).toBe(201);
    expect((await c.del(`/clients/${id}`)).status).toBe(409);
  });
});

describe('suppliers', () => {
  it('deleting a supplier also clears it from recurring series (next occurrences keep working)', async () => {
    const supplier = await c.post('/contacts', { name: 'Imobiliária Centro' });
    const account = await createAccount(c);
    const rent = await c.post('/transactions', {
      type: 'expense',
      description: 'Aluguel do escritório',
      amount: 250000,
      date: '2026-08-05',
      accountId: account,
      contactId: supplier.body.id,
      recurrenceKind: 'fixed',
    });
    expect(rent.status).toBe(201);
    expect((await c.del(`/contacts/${supplier.body.id}`)).status).toBe(204);

    // Reading a far month generates new occurrences from the series template.
    const far = await c.get('/transactions?from=2029-03-01&to=2029-03-31');
    expect(far.status).toBe(200);
    expect(far.body.items).toHaveLength(1);
    expect(far.body.items[0]).toMatchObject({ description: 'Aluguel do escritório', contactId: null });
  });
});

describe('fees', () => {
  it('runs yearly periods from the contract start and shows the current one', async () => {
    const { id } = await createClient();

    const empty = await c.get(`/clients/${id}/fees`);
    expect(empty.body).toEqual({ current: null, items: [], next: { index: 0, startDate: '2024-03-15', endDate: '2025-03-14' } });

    const first = await c.post(`/clients/${id}/fees`, { amount: 75000, employeeFee: 3000 });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ index: 0, startDate: '2024-03-15', endDate: '2025-03-14', amount: 75000, employeeFee: 3000 });
    await c.post(`/clients/${id}/fees`, { amount: 80000, employeeFee: 3500 });
    const third = await c.post(`/clients/${id}/fees`, { amount: 85000 });
    expect(third.body).toMatchObject({ index: 2, startDate: '2026-03-15', endDate: '2027-03-14', employeeFee: 0 });

    const list = await c.get(`/clients/${id}/fees`);
    expect(list.body.items.map((f: any) => f.index)).toEqual([2, 1, 0]);
    expect(list.body.current).toMatchObject({ index: 2, amount: 85000 });
    expect(list.body.next).toEqual({ index: 3, startDate: '2027-03-15', endDate: '2028-03-14' });

    const client = await c.get(`/clients/${id}`);
    expect(client.body.currentFee).toMatchObject({ index: 2, amount: 85000 });
    expect(client.body.latestFee).toMatchObject({ index: 2 });
    const listed = await c.get('/clients');
    expect(listed.body.items[0].currentFee.amount).toBe(85000);
    expect(listed.body.summary).toEqual({
      active: 1,
      inactive: 0,
      monthlyFees: 85000,
      withoutCurrentFee: 0,
      byRegime: { ...NO_REGIMES, simples_nacional: 1 },
      averageFee: 85000,
    });

    // Values can be corrected; only the latest period can be removed.
    const fixed = await c.put(`/clients/${id}/fees/${first.body.id}`, { amount: 76000, employeeFee: 3000 });
    expect(fixed.body).toMatchObject({ index: 0, amount: 76000 });
    expect((await c.del(`/clients/${id}/fees/${first.body.id}`)).status).toBe(422);
    expect((await c.del(`/clients/${id}/fees/${third.body.id}`)).status).toBe(204);

    // Without the 2026 period nothing is current; the latest (expired) one is still reported.
    const expired = await c.get(`/clients/${id}`);
    expect(expired.body.currentFee).toBeNull();
    expect(expired.body.latestFee).toMatchObject({ index: 1, endDate: '2026-03-14' });

    // Periods follow the contract start date.
    await c.put(`/clients/${id}`, { ...PADARIA, contractStartDate: '2025-04-01' });
    const moved = await c.get(`/clients/${id}/fees`);
    expect(moved.body.items.map((f: any) => [f.startDate, f.endDate])).toEqual([
      ['2026-04-01', '2027-03-31'],
      ['2025-04-01', '2026-03-31'],
    ]);
    expect(moved.body.current).toMatchObject({ index: 1, amount: 80000 });
  });

  it('summarizes active clients per tax regime and the average current fee', async () => {
    const bakery = await createClient({ contractStartDate: '2026-03-15' });
    await c.post(`/clients/${bakery.id}/fees`, { amount: 75000 });
    const software = await createClient({
      name: 'Tecnova Soluções em Software Ltda',
      tradeName: 'Tecnova',
      document: '45.723.174/0001-10',
      taxRegime: 'presumed_profit',
      contractStartDate: '2026-01-10',
    });
    await c.post(`/clients/${software.id}/fees`, { amount: 240001 });
    // Active without a fee in force: counted in its regime, not in the average.
    await createClient({ name: 'Ju Prado Design', tradeName: 'Ju Prado', document: '28.051.496/0001-41', taxRegime: 'mei' });
    // Inactive: in neither.
    const former = await createClient({ name: 'Rota Sul Ltda', tradeName: 'Rota Sul', document: '61.370.925/0001-19', taxRegime: 'real_profit' });
    await c.post(`/clients/${former.id}/fees`, { amount: 480000 });
    await c.post(`/clients/${former.id}/inactivate`, { date: '2026-09-30', reason: 'contract_end' });

    const summary = (await c.get('/clients?status=all')).body.summary;
    expect(summary).toEqual({
      active: 3,
      inactive: 1,
      monthlyFees: 315001,
      withoutCurrentFee: 1,
      byRegime: { ...NO_REGIMES, simples_nacional: 1, presumed_profit: 1, mei: 1 },
      averageFee: 157501, // 315001 / 2, rounded
    });
    // The summary covers the whole workspace, whatever the list filter.
    expect((await c.get('/clients?taxRegime=mei')).body.summary).toEqual(summary);
  });

  it('has no fee in force after the inactivation', async () => {
    const { id } = await createClient({ contractStartDate: '2026-03-15' });
    await c.post(`/clients/${id}/fees`, { amount: 75000 });
    expect((await c.get(`/clients/${id}`)).body.currentFee).toMatchObject({ amount: 75000 });
    await c.post(`/clients/${id}/inactivate`, { date: '2026-09-30', reason: 'accounting_transfer' });
    const inactive = await c.get(`/clients/${id}`);
    expect(inactive.body).toMatchObject({ currentFee: null, latestFee: { amount: 75000 } });
    expect((await c.get(`/clients/${id}/fees`)).body.current).toBeNull();
  });

  it('does not open a period after the client was inactivated', async () => {
    const { id } = await createClient();
    await c.post(`/clients/${id}/fees`, { amount: 75000 });
    await c.post(`/clients/${id}/inactivate`, { date: '2025-01-31', reason: 'contract_end' });
    const res = await c.post(`/clients/${id}/fees`, { amount: 80000 });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('31/01/2025');
  });

  it('validates the amounts', async () => {
    const { id } = await createClient();
    expect((await c.post(`/clients/${id}/fees`, { amount: 0 })).status).toBe(400);
    expect((await c.post(`/clients/${id}/fees`, { amount: 1000, employeeFee: -1 })).status).toBe(400);
  });
});

describe('business workspace', () => {
  it('starts with business categories (fees, payroll, taxes)', async () => {
    const created = await c.post('/workspaces', { name: 'Escritório', kind: 'business' });
    expect(created.status).toBe(201);
    expect((await c.post('/auth/switch-workspace', { workspaceId: created.body.id })).status).toBe(200);
    const income = (await c.get('/categories?type=income')).body.map((x: { name: string }) => x.name);
    const expense = (await c.get('/categories?type=expense')).body.map((x: { name: string }) => x.name);
    expect(income).toContain('Serviços Prestados');
    const services = (await c.get('/categories?type=income')).body.find((x: { name: string }) => x.name === 'Serviços Prestados');
    expect(services.subcategories.map((s: { name: string }) => s.name)).toEqual(
      expect.arrayContaining(['Honorários contábeis', 'Folha de pagamento', '13º honorário', 'Serviços avulsos']),
    );
    expect(expense).toEqual(expect.arrayContaining(['Pessoal', 'Impostos e taxas', 'Ocupação']));
    expect(expense).not.toContain('Lazer');
  });
});

describe('Receita Federal lookup', () => {
  it('returns the company data for the client form', async () => {
    const res = await c.get('/cnpj/11222333000181');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      document: '11222333000181',
      name: 'PADARIA PAO QUENTE LTDA',
      tradeName: 'Pão Quente',
      taxRegime: 'simples_nacional',
      responsibleName: 'Marina Albuquerque',
      city: 'Campinas',
    });
    expect((await c.get('/cnpj/11222333000180')).status).toBe(400);
    expect((await c.get('/cnpj/27931012000196')).status).toBe(404);
    const anonymous = await app.inject({ method: 'GET', url: '/api/cnpj/11222333000181' });
    expect(anonymous.statusCode).toBe(401);
  });

  it('normalizes the BrasilAPI answer and its failures', async () => {
    const payload = {
      cnpj: '19131243000197',
      razao_social: 'OPEN KNOWLEDGE BRASIL',
      nome_fantasia: 'REDE PELO CONHECIMENTO LIVRE',
      data_inicio_atividade: '2013-10-03',
      cnae_fiscal: 9430800,
      cnae_fiscal_descricao: 'Atividades de associações de defesa de direitos sociais',
      descricao_situacao_cadastral: 'ATIVA',
      email: 'CONTATO@OK.ORG.BR',
      ddd_telefone_1: '1123376261',
      cep: '01311902',
      descricao_tipo_de_logradouro: 'AVENIDA',
      logradouro: 'PAULISTA 37',
      numero: '37',
      complemento: 'ANDAR 4',
      bairro: 'BELA VISTA',
      municipio: 'SAO PAULO',
      uf: 'SP',
      opcao_pelo_simples: true,
      opcao_pelo_mei: false,
      qsa: [
        { nome_socio: 'FULANO DE TAL', qualificacao_socio: 'Sócio' },
        { nome_socio: 'BELTRANA DA SILVA', qualificacao_socio: 'Presidente' },
      ],
    };
    let url = '';
    const provider = (status: number, body: unknown) =>
      new BrasilApiCnpjProvider({
        fetch: async (input) => {
          url = String(input);
          return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
        },
      });

    const company = await provider(200, payload).lookup('19131243000197');
    expect(url).toBe('https://brasilapi.com.br/api/cnpj/v1/19131243000197');
    expect(company).toEqual({
      document: '19131243000197',
      name: 'OPEN KNOWLEDGE BRASIL',
      tradeName: 'REDE PELO CONHECIMENTO LIVRE',
      openedAt: '2013-10-03',
      mainActivity: '9430-8/00 — Atividades de associações de defesa de direitos sociais',
      registrationStatus: 'ATIVA',
      email: 'contato@ok.org.br',
      phone: '1123376261',
      zipCode: '01311902',
      street: 'Avenida Paulista 37',
      number: '37',
      complement: 'Andar 4',
      district: 'Bela Vista',
      city: 'Sao Paulo',
      state: 'SP',
      taxRegime: 'simples_nacional',
      partners: [
        { name: 'Fulano de Tal', role: 'Sócio' },
        { name: 'Beltrana da Silva', role: 'Presidente' },
      ],
      responsibleName: 'Beltrana da Silva',
    });
    expect((await provider(200, { ...payload, opcao_pelo_mei: true }).lookup('19131243000197'))?.taxRegime).toBe('mei');
    expect(await provider(404, { message: 'CNPJ não encontrado' }).lookup('19131243000197')).toBeNull();
    await expect(provider(500, {}).lookup('19131243000197')).rejects.toBeInstanceOf(CnpjProviderError);
    await expect(provider(200, { cnpj: '19131243000197' }).lookup('19131243000197')).rejects.toBeInstanceOf(CnpjProviderError);
  });
});
