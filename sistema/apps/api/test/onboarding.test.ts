// Client onboarding (docs/onboarding-cliente.md): the office's template and a client's adjustment, the
// document assembled from the recurring tasks that apply to the client (by regime), links with a strong
// token (only its hash stored), the public page (access recorded, expired/revoked → the same 404, reading
// confirmation with the CPF encrypted), permissions, isolation between workspaces and the rate limit.
// Today is pinned to 2026-10-20 (vitest.config.ts); link expiry uses the real clock.

import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ONBOARDING_DEFAULT_PARAMS, type OnboardingDocument } from '@effinance/shared';
import type { App } from '../src/app';
import { executeRows } from '../src/lib/sql';
import { admin, createTestApp, registerUser, resetDb, type Client } from './helpers';
import { API_ROLE } from './db-roles';
import { cnpj, member, workspaceOf } from './task-helpers';

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

const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

let seq = 31_000_000;
async function newClient(owner: Client, taxRegime: string, extra: Record<string, unknown> = {}): Promise<string> {
  seq += 7;
  const res = await owner.post('/clients', {
    name: `Padaria Pão Quente ${seq} Ltda`,
    tradeName: `Pão Quente ${seq}`,
    document: cnpj(seq),
    taxRegime,
    simplesAnnex: taxRegime === 'simples_nacional' ? 'I' : undefined,
    contractStartDate: '2025-01-10',
    phone: '(19) 98765-4321',
    email: 'contato@paoquente.com.br',
    responsibleName: 'Maria Souza',
    responsiblePhone: '(19) 91234-5678',
    ...extra,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id;
}

const slide = (doc: OnboardingDocument, key: string) => doc.slides.find((s) => s.key === key)!;
const tableNames = (doc: OnboardingDocument, key: string) => slide(doc, key).table!.map((r) => r.name);

function publicGet(token: string, ua = UA_PHONE, target: App = app) {
  return target.inject({ method: 'GET', url: `/api/public/onboarding/${token}`, headers: { 'user-agent': ua } });
}
function publicConfirm(token: string, body: unknown, target: App = app) {
  return target.inject({ method: 'POST', url: `/api/public/onboarding/${token}/confirm`, payload: body as object, headers: { 'user-agent': UA_PHONE } });
}
const tokenOf = (path: string) => path.replace('/o/', '');

async function auditActions(workspaceId: string): Promise<string[]> {
  const rows = await executeRows<{ action: string }>(admin(), sql`select action from audit_logs where workspace_id = ${workspaceId} and action like 'onboarding.%' order by created_at`);
  return rows.map((r) => r.action);
}

describe('onboarding template and client adjustment', () => {
  it('every member reads; saving needs `office`; unknown keys are refused; the adjustment overrides the template', async () => {
    const owner = await registerUser(app, 'Israel Dono');
    const viewer = await member(app, owner, 'viewer', 'Carla Colaboradora');
    const ws = await workspaceOf(owner);
    const clientId = await newClient(owner, 'simples_nacional');

    const initial = await viewer.get('/onboarding/template');
    expect(initial.status).toBe(200);
    expect(initial.body).toMatchObject({ params: ONBOARDING_DEFAULT_PARAMS, texts: {}, hidden: [], updatedAt: null });

    const body = {
      params: {
        ...ONBOARDING_DEFAULT_PARAMS,
        contact: { whatsapp: '(19) 99999-0000', hours: 'Seg. a sex., 8h às 18h', crc: 'SP-1/O' },
        emails: { ...ONBOARDING_DEFAULT_PARAMS.emails, fiscal: 'Fiscal@Efficio.com.br' },
      },
      texts: { 'howWeWork.title': 'Como funciona', 'summary.title': 'Sumário', 'team.title': 'Sua equipe' },
      hidden: ['fiscal.items.simples-cards'],
    };
    expect((await viewer.put('/onboarding/template', body)).status).toBe(403);
    expect((await owner.put('/onboarding/template', { ...body, texts: { 'cover.bogus': 'x' } })).status).toBe(400);
    const badDays = { ...body.params, deadlines: { ...body.params.deadlines, documentsDay: 32, defisDay: 30, defisMonth: 2 } };
    expect((await owner.put('/onboarding/template', { ...body, params: badDays })).status).toBe(400);
    const saved = await owner.put('/onboarding/template', body);
    expect(saved.status).toBe(200);
    // Texts equal to the factory are not stored (they follow future factory updates).
    expect(saved.body.texts).toEqual({ 'howWeWork.title': 'Como funciona', 'team.title': 'Sua equipe' });
    expect(saved.body.params.emails.fiscal).toBe('fiscal@efficio.com.br');
    expect(saved.body.params.contact.crc).toBe('SP-1/O');
    expect(saved.body.updatedByName).toBe('Israel Dono');

    expect((await viewer.put(`/clients/${clientId}/onboarding/overrides`, { texts: {} })).status).toBe(403);
    expect((await viewer.get(`/clients/${clientId}/onboarding/overrides`)).status).toBe(403);
    const overrides = await owner.put(`/clients/${clientId}/onboarding/overrides`, { texts: { 'team.title': 'Time da padaria' }, employees: 4 });
    expect(overrides.status).toBe(200);
    expect(overrides.body).toMatchObject({ texts: { 'team.title': 'Time da padaria' }, hidden: [], employees: 4 });

    const doc = (await viewer.get(`/clients/${clientId}/onboarding/document`)).body as OnboardingDocument;
    expect(slide(doc, 'howWeWork').title).toBe('Como funciona');
    expect(slide(doc, 'team').title).toBe('Time da padaria');
    expect(doc.client.employees).toBe(4);
    expect(doc.office).toMatchObject({ whatsapp: '(19) 99999-0000', crc: 'SP-1/O' });
    expect(tableNames(doc, 'fiscal')).not.toContain('Vendas no cartão e PIX');
    // The office registry is empty: name falls back to Efficio, no logo, its e-mail is missing.
    expect(doc.office).toMatchObject({ name: 'Efficio Contabilidade', logo: null });
    expect(doc.missing).toEqual(['escritorio.email']);
    expect(new Date(doc.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(overrides.body.updatedAt).getTime());

    // Empty adjustment = none.
    const cleared = await owner.put(`/clients/${clientId}/onboarding/overrides`, {});
    expect(cleared.body).toMatchObject({ texts: {}, employees: null, updatedAt: null });
    expect(await auditActions(ws)).toEqual(['onboarding.template_updated', 'onboarding.overrides_updated', 'onboarding.overrides_updated']);
  });

  it('assembles by regime from the recurring tasks that apply, with and without employees', async () => {
    const owner = await registerUser(app, 'Israel Dono');
    for (const regime of ['simples_nacional', 'mei', 'presumed_profit', 'real_profit']) {
      expect((await owner.post(`/tasks/regime-groups/${regime}/apply`, {})).status).toBe(200);
    }
    const simples = await newClient(owner, 'simples_nacional');
    const mei = await newClient(owner, 'mei');
    const presumed = await newClient(owner, 'presumed_profit');
    const real = await newClient(owner, 'real_profit');
    const doc = async (id: string) => (await owner.get(`/clients/${id}/onboarding/document`)).body as OnboardingDocument;

    const s = await doc(simples);
    expect(s.slides).toHaveLength(18);
    expect(tableNames(s, 'fiscal')).toEqual(expect.arrayContaining(['PGDAS-D e DAS', 'DEFIS', 'DCTFWeb', 'Vendas no cartão e PIX']));
    expect(tableNames(s, 'personnel')).toEqual(['Folha de pagamento', 'eSocial — eventos periódicos', 'FGTS Digital', '13º salário']);
    expect(s.client).toMatchObject({ regime: 'simples_nacional', regimeLabel: 'Simples Nacional', employees: 0, clientSince: '2025-01-10', union: null });
    expect(s.client.cnpj).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
    expect(slide(s, 'personnel').subtitle).toMatch(/não tem empregados/);

    const m = await doc(mei);
    expect(tableNames(m, 'fiscal')).toEqual(['DAS-MEI', 'DASN-SIMEI']);
    await owner.put(`/clients/${mei}/onboarding/overrides`, { employees: 1 });
    const m1 = await doc(mei);
    expect(tableNames(m1, 'fiscal')).toEqual(['DAS-MEI', 'DASN-SIMEI']);
    // Personnel content is the same with or without employees (owner's decision): fixed rows for MEI.
    expect(tableNames(m1, 'personnel')).toEqual(tableNames(m, 'personnel'));
    expect(tableNames(m, 'personnel')).toEqual(['Folha e salários', 'eSocial', 'FGTS Digital', 'DCTFWeb (INSS e IRRF da folha)', '13º salário']);
    expect(slide(m1, 'personnel').subtitle).toMatch(/1 empregado,/);

    const p = await doc(presumed);
    expect(tableNames(p, 'fiscal')).toEqual(expect.arrayContaining(['PIS/COFINS', 'IRPJ e CSLL trimestrais', 'EFD-Contribuições']));
    expect(tableNames(p, 'accounting')).toEqual(['ECD', 'ECF', 'Conciliação e balancete mensal', 'Pró-labore', 'Lucros dos sócios']);
    const r = await doc(real);
    expect(tableNames(r, 'fiscal')).toContain('IRPJ e CSLL — estimativa mensal');
    expect(tableNames(r, 'fiscal')).not.toContain('IRPJ e CSLL trimestrais');

    // An exception on a recurring task takes it out of that client's document (the occurrences' rule).
    const ws = await workspaceOf(owner);
    await admin().execute(sql`insert into recurring_task_clients (workspace_id, recurring_task_id, client_id, mode)
      select workspace_id, id, ${simples}, 'exclude' from recurring_tasks where workspace_id = ${ws} and catalog_key = 'defis'`);
    expect(tableNames(await doc(simples), 'fiscal')).not.toContain('DEFIS');
  });

  it('logo and contact come from the office registry; parameters reach the slides; legacy templates are converted', async () => {
    const owner = await registerUser(app, 'Israel Dono');
    const ws = await workspaceOf(owner);
    const clientId = await newClient(owner, 'simples_nacional');
    const doc = async () => (await owner.get(`/clients/${clientId}/onboarding/document`)).body as OnboardingDocument;

    const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    expect((await owner.put('/office/logo', { logo })).status).toBe(200);
    await admin().execute(sql`update offices set trade_name = 'Contábil Alfa', phone = '(19) 3333-4444', email = 'oi@alfa.com.br',
      website = 'alfa.com.br', street = 'Rua A', number = '10', district = 'Centro', city = 'Campinas', state = 'SP' where workspace_id = ${ws}`);
    let d = await doc();
    expect(d.office).toMatchObject({ name: 'Contábil Alfa', logo, phone: '(19) 3333-4444', email: 'oi@alfa.com.br', website: 'alfa.com.br', address: 'Rua A, 10 - Centro, Campinas/SP' });
    expect(slide(d, 'cover').kicker).toBe('Contábil Alfa · Onboarding do cliente');

    // A template of the first version (office data, four deadlines): converted on read.
    await admin().execute(sql`insert into onboarding_templates (workspace_id, content, updated_by, updated_by_name)
      select ${ws}, ${JSON.stringify({ office: { name: 'Antigo', whatsapp: '(19) 90000-0000', email: 'x@y.com', hours: null, crc: 'SP-9', emails: { fiscal: 'f@alfa.com.br', personnel: 'p@alfa.com.br', accounting: 'c@alfa.com.br' }, deadlines: { documentsDay: 7, payrollVariablesDay: 2, admissionBusinessDays: 4, vacationDaysBefore: 6 } }, texts: { 'fiscal.items.mei-fgts.label': 'velho', 'howWeWork.title': 'Como é', 'obligations.pgdas_das.deadline': 'dia 20 do mês seguinte', 'fiscal.items.simples-cards.text': 'as operadoras informam ao fisco', 'esocial.items.s2200.text': 'até o dia anterior' }, hidden: ['fiscal.items.mei-fgts', 'month.items.esocial'] })}::jsonb, null, 'Israel Dono'`);
    const legacy = (await owner.get('/onboarding/template')).body;
    expect(legacy.params.contact).toEqual({ whatsapp: '(19) 90000-0000', hours: ONBOARDING_DEFAULT_PARAMS.contact.hours, crc: 'SP-9' });
    expect(legacy.params.deadlines).toMatchObject({ documentsDay: 7, cardsDay: 7, payrollVariablesDay: 2, proLaboreDay: 2, admissionBusinessDays: 4, vacationDaysBefore: 6, linkDays: 30 });
    // Blocks removed from the factory content (incl. the legal deadlines, 20/11/2026) are dropped, so the editor can save again.
    expect(legacy.texts).toEqual({ 'howWeWork.title': 'Como é' });
    expect(legacy.hidden).toEqual([]);
    d = await doc();
    expect(d.office.name).toBe('Contábil Alfa');
    expect(slide(d, 'month').items.find((i) => i.id === 'documents')!.label).toBe('Até o dia 7');
    expect((await owner.put('/onboarding/template', legacy)).status).toBe(200);

    // A changed parameter changes the slides (no text rewritten), and the link validity.
    const params = {
      ...legacy.params,
      emails: { ...legacy.params.emails, personnel: 'dp@alfa.com.br' },
      subjects: { ...legacy.params.subjects, statements: 'Extrato {{competencia}} - {{razaoSocial}}' },
      deadlines: { ...legacy.params.deadlines, documentsDay: 12, admissionBusinessDays: 5, linkDays: 15 },
      rules: { ...legacy.params.rules, unionAssistance: false },
    };
    expect((await owner.put('/onboarding/template', { params, texts: legacy.texts, hidden: [] })).status).toBe(200);
    d = await doc();
    expect(slide(d, 'documents').items.find((i) => i.id === 'invoices')!.detail).toBe('dia 12');
    expect(slide(d, 'admission').items[0]).toMatchObject({ label: '5 dias úteis antes', text: 'envie dados e documentos para dp@alfa.com.br' });
    expect(slide(d, 'sending').items.find((i) => i.id === 'accounting')!.code).toMatch(/^Extrato \d{2}\/\d{4} - Padaria Pão Quente \d+ Ltda$/);
    expect(slide(d, 'termination').items.map((i) => i.id)).toContain('union-client');
    const link = await owner.post(`/clients/${clientId}/onboarding/links`, { channel: 'whatsapp', contact: 'company' });
    const days = (new Date(link.body.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(14.9);
    expect(days).toBeLessThan(15.1);
    expect(link.body.message).toContain('vale por 15 dias');
  });
});

describe('onboarding links and the public page', () => {
  it('creates a link (hash only), opens it publicly (accesses), confirms reading (CPF encrypted), revokes', async () => {
    const owner = await registerUser(app, 'Israel Dono');
    const viewer = await member(app, owner, 'viewer', 'Carla Colaboradora');
    const ws = await workspaceOf(owner);
    const clientId = await newClient(owner, 'simples_nacional');

    expect((await owner.post(`/clients/${clientId}/onboarding/links`, { channel: 'whatsapp' })).status).toBe(400);
    expect((await owner.post(`/clients/${clientId}/onboarding/links`, { channel: 'email', contact: 'responsible' })).status).toBe(422);
    const created = await viewer.post(`/clients/${clientId}/onboarding/links`, { channel: 'whatsapp', contact: 'company' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const link = created.body;
    expect(link.path).toMatch(/^\/o\/[A-Za-z0-9_-]{43}$/);
    expect(link.url.endsWith(link.path)).toBe(true);
    expect(link.to).toBe('5519987654321');
    expect(link.message).toContain(link.url);
    expect(new Date(link.expiresAt).getTime() - Date.now()).toBeGreaterThan(29 * 86_400_000);
    const token = tokenOf(link.path);

    // Only the SHA-256 is stored; the recipient is encrypted.
    const [stored0] = await executeRows<{ token_hash: string; workspace_id: string }>(admin(), sql`select token_hash, workspace_id from onboarding_links`);
    expect(stored0).toEqual({ token_hash: createHash('sha256').update(token).digest('hex'), workspace_id: ws });
    const dump = JSON.stringify(await executeRows(admin(), sql`select * from onboarding_links`));
    expect(dump).not.toContain(token);
    expect(dump).not.toContain('5519987654321');

    // A second link (resend) keeps the first one working.
    const second = await owner.post(`/clients/${clientId}/onboarding/links`, { channel: 'email', to: 'Dono@PaoQuente.com.br' });
    expect(second.status).toBe(201);
    expect(second.body.to).toBe('dono@paoquente.com.br');

    const opened = await publicGet(token);
    expect(opened.statusCode).toBe(200);
    expect(opened.headers['cache-control']).toBe('no-store');
    expect(opened.headers['x-robots-tag']).toContain('noindex');
    const pub = opened.json();
    expect(pub.document.slides).toHaveLength(18);
    expect(pub.confirmedAt).toBeNull();
    // Nothing sensitive: no phone, e-mail or responsible of the registry.
    expect(opened.body).not.toContain('98765');
    expect(opened.body).not.toContain('paoquente.com.br');
    expect(opened.body).not.toContain('Maria Souza');

    await publicGet(token); // same visitor within 30 minutes: one access
    await publicGet(token, UA_DESKTOP);
    await publicGet(tokenOf(second.body.path), UA_DESKTOP);

    expect((await publicConfirm(token, { name: 'João da Silva', cpf: '123.456.789-00' })).statusCode).toBe(400);
    const confirmed = await publicConfirm(token, { name: 'João da Silva', cpf: '529.982.247-25' });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.headers['cache-control']).toBe('no-store');
    expect((await publicConfirm(token, { name: 'João da Silva', cpf: '529.982.247-25' })).statusCode).toBe(409);
    const [stored] = await executeRows<{ confirmed_cpf: string; confirmed_name: string; confirmed_ip: string }>(
      admin(),
      sql`select confirmed_cpf, confirmed_name, confirmed_ip from onboarding_links where confirmed_at is not null`,
    );
    expect(stored!.confirmed_cpf).toMatch(/^v1\./);
    expect(stored!.confirmed_name).toMatch(/^v1\./);
    expect(stored!.confirmed_ip).toMatch(/\.x$/);
    expect((await publicGet(token)).json().confirmedAt).toBe(confirmed.json().confirmedAt);

    const history = await viewer.get(`/clients/${clientId}/onboarding`);
    expect(history.status).toBe(200);
    expect(history.body.links).toHaveLength(2);
    const first = history.body.links.find((l: { id: string }) => l.id === link.id);
    expect(first).toMatchObject({ channel: 'whatsapp', to: '(19) 9••••-4321', sentByName: 'Carla Colaboradora', status: 'active', accessCount: 2 });
    expect(first.confirmedAt).toBeTruthy();
    expect(history.body.links.find((l: { id: string }) => l.id === second.body.id)).toMatchObject({ to: 'do••••@paoquente.com.br', accessCount: 1 });
    expect(history.body.accesses.count).toBe(3);
    expect(history.body.accesses.items.map((a: { device: string }) => a.device).sort()).toEqual(['desktop', 'desktop', 'mobile']);
    expect(history.body.accesses.items[0]).toMatchObject({ ip: expect.stringMatching(/\.x$/), city: null });
    expect(history.body.accesses.items.find((a: { device: string }) => a.device === 'mobile')).toMatchObject({ browser: 'Safari', os: 'iOS' });
    expect(history.body.confirmation).toMatchObject({ linkId: link.id, name: 'João da Silva', cpf: '•••.982.247-••' });

    // Revoked → the same 404 as an unknown token.
    expect((await owner.del(`/clients/${clientId}/onboarding/links/${link.id}`)).status).toBe(204);
    expect((await owner.del(`/clients/${clientId}/onboarding/links/${link.id}`)).status).toBe(204);
    const revoked = await publicGet(token);
    const unknown = await publicGet('A'.repeat(43));
    const malformed = await publicGet('nope');
    expect(revoked.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);
    expect(malformed.statusCode).toBe(404);
    expect(revoked.json()).toEqual(unknown.json());
    expect(malformed.json()).toEqual(unknown.json());
    expect(revoked.headers['x-robots-tag']).toContain('noindex');
    expect((await publicConfirm(token, { name: 'João da Silva', cpf: '529.982.247-25' })).statusCode).toBe(404);

    // Expired → 404 too.
    await admin().execute(sql`update onboarding_links set created_at = now() - interval '31 days', expires_at = now() - interval '1 day' where id = ${second.body.id}`);
    expect((await publicGet(tokenOf(second.body.path))).statusCode).toBe(404);
    const after = await owner.get(`/clients/${clientId}/onboarding`);
    expect(after.body.links.map((l: { status: string }) => l.status).sort()).toEqual(['expired', 'revoked']);

    expect(await auditActions(ws)).toEqual(['onboarding.link_created', 'onboarding.link_created', 'onboarding.confirmed', 'onboarding.link_revoked']);
  });

  it('sending needs `clients`; another workspace sees nothing; the API login cannot read the tenant tables', async () => {
    const owner = await registerUser(app, 'Israel Dono');
    const viewer = await member(app, owner, 'viewer', 'Carla Colaboradora');
    const clientId = await newClient(owner, 'mei');
    const adjust = await owner.put(`/workspaces/current/members/${viewer.userId}/permissions`, { overrides: { clients: false } });
    expect(adjust.status, JSON.stringify(adjust.body)).toBe(200);
    expect((await viewer.post(`/clients/${clientId}/onboarding/links`, { channel: 'whatsapp', contact: 'company' })).status).toBe(403);
    const link = await owner.post(`/clients/${clientId}/onboarding/links`, { channel: 'whatsapp', contact: 'responsible' });
    expect(link.status).toBe(201);
    expect(link.body).toMatchObject({ to: '5519912345678', recipientName: 'Maria Souza' });
    expect((await viewer.del(`/clients/${clientId}/onboarding/links/${link.body.id}`)).status).toBe(403);

    const other = await registerUser(app, 'Outro Escritório');
    const otherClient = await newClient(other, 'mei');
    expect((await other.get(`/clients/${clientId}/onboarding`)).status).toBe(404);
    expect((await other.get(`/clients/${clientId}/onboarding/document`)).status).toBe(404);
    expect((await other.get(`/clients/${clientId}/onboarding/overrides`)).status).toBe(404);
    expect((await other.put(`/clients/${clientId}/onboarding/overrides`, { employees: 3 })).status).toBe(404);
    expect((await other.post(`/clients/${clientId}/onboarding/links`, { channel: 'email', to: 'x@y.com' })).status).toBe(404);
    expect((await other.del(`/clients/${clientId}/onboarding/links/${link.body.id}`)).status).toBe(404);
    // A link id of the other office under its own client: not found either.
    expect((await other.del(`/clients/${otherClient}/onboarding/links/${link.body.id}`)).status).toBe(404);
    expect((await other.get(`/clients/${otherClient}/onboarding`)).body.links).toEqual([]);
    expect((await publicGet(tokenOf(link.body.path))).json().document.client.name).toMatch(/^Padaria Pão Quente/);

    // RLS: the tenant role without a workspace sees no row; with the public setting, only the row of that
    // exact hash, read-only; another workspace's transaction never sees it.
    const hashA = createHash('sha256').update(tokenOf(link.body.path)).digest('hex');
    const asTenant = (settings: Record<string, string>, query: ReturnType<typeof sql>) =>
      admin().transaction(async (tx) => {
        await tx.execute(sql`select set_config('role', 'effinance_app', true)`);
        for (const [k, v] of Object.entries(settings)) await tx.execute(sql`select set_config(${k}, ${v}, true)`);
        return executeRows<{ n: number }>(tx, query);
      });
    const countLinks = sql`select count(*)::int as n from onboarding_links`;
    expect((await asTenant({}, countLinks))[0]!.n).toBe(0);
    expect((await asTenant({ 'app.onboarding_token': hashA }, countLinks))[0]!.n).toBe(1);
    expect((await asTenant({ 'app.onboarding_token': 'f'.repeat(64) }, countLinks))[0]!.n).toBe(0);
    expect((await asTenant({ 'app.workspace_id': await workspaceOf(other) }, countLinks))[0]!.n).toBe(0);
    const touched = await asTenant(
      { 'app.onboarding_token': hashA },
      sql`with u as (update onboarding_links set revoked_at = now() returning 1) select count(*)::int as n from u`,
    );
    expect(touched[0]!.n).toBe(0);
    expect((await asTenant({ 'app.onboarding_token': hashA }, sql`select count(*)::int as n from onboarding_accesses`))[0]!.n).toBe(0);
    const denied = await admin()
      .transaction(async (tx) => {
        await tx.execute(sql.raw(`set local role ${API_ROLE}`));
        await tx.execute(sql`select 1 from onboarding_links`);
      })
      .then(
        () => null,
        (error: Error & { cause?: Error }) => error.cause?.message ?? error.message,
      );
    expect(denied).toMatch(/permission denied/);
  });
});

describe('public onboarding rate limit', () => {
  it('limits the public page and the confirmation per IP', async () => {
    const strict = await createTestApp({ relaxedRateLimits: false });
    try {
      const owner = await registerUser(strict, 'Israel Dono');
      const clientId = await newClient(owner, 'simples_nacional');
      const link = await owner.post(`/clients/${clientId}/onboarding/links`, { channel: 'whatsapp', contact: 'company' });
      const token = tokenOf(link.body.path);
      const statuses: number[] = [];
      for (let i = 0; i < 31; i++) statuses.push((await publicGet(i % 2 ? token : 'B'.repeat(43), UA_PHONE, strict)).statusCode);
      expect(statuses.slice(0, 30).every((s) => s === 200 || s === 404)).toBe(true);
      expect(statuses[30]).toBe(429);
      const confirms: number[] = [];
      for (let i = 0; i < 11; i++) confirms.push((await publicConfirm(token, { name: 'João', cpf: '1' }, strict)).statusCode);
      expect(confirms.slice(0, 10).every((s) => s === 400)).toBe(true);
      expect(confirms[10]).toBe(429);
    } finally {
      await strict.close();
    }
  });
});
