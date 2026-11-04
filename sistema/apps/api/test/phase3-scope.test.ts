// Every statement the phase 3 services send filters by the workspace (CLAUDE.md: "Toda query do backend
// filtra pelo espaço; o RLS é a segunda barreira"), like tasks-scope.test.ts for the task module: the
// services run on a superuser connection (no RLS to hide a missing filter) with a logger capturing
// each statement; then (1) every reference to a tenant table is tied to the request's workspace, (2)
// every exported function of the modules ran, (3) another office's rows are untouched, byte for byte.
// Today is pinned to 2026-10-20 (vitest.config.ts).

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  clientDocumentInputSchema,
  contractTemplateInputSchema,
  deadlinesQuerySchema,
  officeInputSchema,
  rolePermissions,
  unionConventionsInputSchema,
  unionInputSchema,
  unionQuerySchema,
} from '@effinance/shared';
import type { App } from '../src/app';
import type { DbExecutor } from '../src/db/client';
import * as schema from '../src/db/schema';
import { getCipher } from '../src/lib/crypto/keyring';
import type { ScopedContext } from '../src/lib/scoped-context';
import * as fiscalModule from '../src/modules/clients/fiscal';
import * as deadlinesModule from '../src/modules/deadlines/service';
import * as officeModule from '../src/modules/office/service';
import * as unionsModule from '../src/modules/unions/service';
import { ADMIN_URL, TENANT_TABLES } from './db-roles';
import { admin, createTestApp, registerUser, resetDb } from './helpers';
import { exportedFunctions, tracked, unscopedReferences, type Statement } from './scope-checker';
import { cnpj, createClient, workspaceOf } from './task-helpers';

let app: App;
let traced: ReturnType<typeof drizzle<typeof schema>>;
let tracedClient: ReturnType<typeof postgres>;
const statements: Statement[] = [];

beforeAll(async () => {
  app = await createTestApp();
  tracedClient = postgres(ADMIN_URL, { max: 2, onnotice: () => {} });
  traced = drizzle(tracedClient, {
    schema,
    casing: 'snake_case',
    logger: { logQuery: (query, params) => statements.push({ sql: query, params }) },
  });
});
afterAll(async () => {
  await tracedClient.end({ timeout: 5 });
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
  statements.length = 0;
});

const PHASE3 = ['client_documents', 'unions', 'union_conventions', 'union_clients', 'offices', 'contacts', 'client_fees'];
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAABACAIAAAAS6ev4AAAAtklEQVR42u3cYQnAIBCAUUuYwlT2McmCWUMjCIIHO558AcY9Njh/rNTWlbhiBIAFWIAFWIAFWIABC7AAC7AAKwh4PTsYAAuwAAMGDBgw4BfAy7l6JQADPo045lMDFTBgwIABAwYMGLA1yRVE8osOowcswAIMGDBgwIABpwWOedDxzV8HGDBgwIABAwYMGLCVyR4MGDBgwAIswIABAwbsJywCLMACLMACDFiABViABViABRiwkrUBk0U/aDulaGkAAAAASUVORK5CYII=';

async function snapshot(workspaceId: string): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const table of PHASE3) {
    const rows = await admin().execute<{ row: unknown }>(
      sql`select to_jsonb(t) as row from ${sql.identifier(table)} t where t.workspace_id = ${workspaceId} order by to_jsonb(t)::text`,
    );
    out[table] = [...rows].map((r) => r.row);
  }
  return out;
}

describe('phase 3: every query filters by the workspace', () => {
  it('runs every service of unions, deadlines, office and the client records with RLS bypassed', async () => {
    expect(TENANT_TABLES).toEqual(expect.arrayContaining(PHASE3.filter((t) => t !== 'contacts' && t !== 'client_fees')));
    // Office B, written through the API, must come out of A's work exactly as it was.
    const bruno = await registerUser(app, 'Bruno Outro');
    const bClient = await createClient(bruno, { tradeName: 'Cliente do Bruno' });
    expect(
      (
        await bruno.put(`/clients/${bClient}`, {
          name: 'Cliente do Bruno Ltda',
          document: (await bruno.get(`/clients/${bClient}`)).body.document,
          taxRegime: 'simples_nacional',
          simplesAnnex: 'I',
          contractStartDate: '2025-01-10',
          accountantPassword: { action: 'set', value: 'do Bruno' },
          documents: [{ kind: 'cndt', expiresAt: '2026-10-01', note: 'Bruno' }],
        })
      ).status,
    ).toBe(200);
    const bUnion = await bruno.post('/unions', { name: 'Sindicato do Bruno', document: cnpj(60_000_001), baseMonth: 3, clientIds: [bClient] });
    expect(bUnion.status).toBe(201);
    expect((await bruno.patch(`/unions/${bUnion.body.id}/conventions/2025`, { published: true })).status).toBe(200);
    expect((await bruno.put('/office', { document: '60.415.732/0001-74', legalName: 'Escritório do Bruno' })).status).toBe(200);
    expect((await bruno.put('/office/logo', { logo: PNG })).status).toBe(200);
    const bWorkspace = await workspaceOf(bruno);
    const before = await snapshot(bWorkspace);

    // Office A: owner Ana, a client with a fee period.
    const ana = await registerUser(app, 'Ana Titular');
    const ws = await workspaceOf(ana);
    const aClient = await createClient(ana, { tradeName: 'Padaria' });
    expect((await ana.post(`/clients/${aClient}/fees`, { amount: 100_000 })).status).toBe(201);
    const cipher = await getCipher(ws);
    const ctxOf = (tx: DbExecutor): ScopedContext => ({
      db: tx,
      workspaceId: ws,
      userId: ana.userId,
      userName: 'Ana Titular',
      permissions: rolePermissions('owner'),
      cipher,
      today: '2026-10-20',
    });
    const run = <T>(fn: (c: ScopedContext) => Promise<T>) => traced.transaction((tx) => fn(ctxOf(tx)));

    const called = new Set<string>();
    const unions = tracked(unionsModule, called);
    const deadlines = tracked(deadlinesModule, called);
    const office = tracked(officeModule, called);
    const fiscal = tracked(fiscalModule, called);
    statements.length = 0;

    // Client records (fiscal.ts): accesses, documents, unions of the clients.
    const columns = await fiscal.fiscalColumns(cipher, {
      stateRegistration: '123',
      responsibleDocument: '52998224725',
      accountantPassword: { action: 'set', value: 'segredo' },
      simplesAccessCode: { action: 'clear' },
    });
    await run((c) => c.db.update(schema.contacts).set(columns).where(sql`${schema.contacts.workspaceId} = ${ws} and ${schema.contacts.id} = ${aClient}`));
    expect(fiscal.credentialFlags({ simplesAccessCode: null, accountantPassword: 'x' })).toEqual({ simplesAccessCode: false, accountantPassword: true });
    expect(await run((c) => fiscal.revealCredential(c.db, c.cipher, ws, aClient, 'accountantPassword'))).toBe('segredo');
    const docs = [
      clientDocumentInputSchema.parse({ kind: 'digital_certificate', expiresAt: '2026-10-10', note: 'A1' }),
      clientDocumentInputSchema.parse({ kind: 'other', customName: 'Laudo', expiresAt: null }),
    ];
    await run((c) => fiscal.replaceDocuments(c.db, c.cipher, ws, aClient, docs, { userId: ana.userId, name: 'Ana' }));
    const loaded = await run((c) => fiscal.loadDocuments(c.db, c.cipher, ws, [aClient], c.today));
    const first = loaded.get(aClient)![0]!;
    await run((c) =>
      fiscal.replaceDocuments(c.db, c.cipher, ws, aClient, [{ ...docs[0]!, id: first.id, note: 'A1 renovado' }], { userId: ana.userId, name: 'Ana' }),
    );
    expect(fiscal.documentName({ kind: 'other', customName: 'Laudo' })).toBe('Laudo');
    const [docRow] = await run((c) => c.db.select().from(schema.clientDocuments).where(sql`${schema.clientDocuments.workspaceId} = ${ws}`));
    expect((await fiscal.toClientDocument(cipher, docRow!, '2026-10-20')).note).toBe('A1 renovado');

    // Unions.
    const created = await run((c) =>
      unions.createUnion(c, unionInputSchema.parse({ name: 'Sindicato da Ana', document: cnpj(60_000_011), baseMonth: 11, clientIds: [aClient], notes: 'nota' })),
    );
    await run((c) => unions.updateUnion(c, created.id, unionInputSchema.parse({ name: 'Sindicato da Ana', document: cnpj(60_000_011), baseMonth: 3, clientIds: [aClient], active: true })));
    await run((c) => unions.saveConventions(c, created.id, unionConventionsInputSchema.parse({ cycles: [{ year: 2025, published: true, note: 'ok' }, { year: 2026, published: false }] })));
    await run((c) => unions.setConventionPublished(c, created.id, 2026, true));
    await run((c) => unions.setConventionPublished(c, created.id, 2027, false));
    await run((c) => unions.getUnion(c, created.id));
    await run((c) => unions.unionItems(c));
    for (const query of [{}, { status: 'all', situation: 'overdue', search: 'ana' }]) await run((c) => unions.listUnions(c, unionQuerySchema.parse(query)));
    expect((await run((c) => fiscal.loadClientUnions(c.db, ws, [aClient], c.today))).get(aClient)).toHaveLength(1);

    // Deadlines.
    await run((c) => deadlines.listDeadlines(c, deadlinesQuerySchema.parse({})));
    await run((c) => deadlines.conventionDeadlines(c));
    await run((c) => deadlines.listDeadlines(c, deadlinesQuerySchema.parse({ kind: 'documents' })));
    await run((c) => deadlines.listDeadlines(c, deadlinesQuerySchema.parse({ kind: 'conventions' })));
    await run((c) => deadlines.deadlinesSummary(c));
    await run((c) => deadlines.clientDocumentAlerts(c));

    // Office and contract.
    await run((c) => office.getBranding(c));
    await run((c) => office.getOffice(c));
    await run((c) =>
      office.saveOffice(c, officeInputSchema.parse({ document: '60.415.732/0001-74', legalName: 'Escritório da Ana', responsibleDocument: '52998224725', pixKeyType: 'email', pixKey: 'a@b.com' })),
    );
    await run((c) => office.setLogo(c, PNG));
    await run((c) => office.setLogo(c, null));
    await run((c) => office.getContractTemplate(c));
    await run((c) => office.saveContractTemplate(c, contractTemplateInputSchema.parse({ blocks: [{ type: 'paragraph', text: '[RAZAO SOCIAL CLIENTE]' }], watermark: PNG })));
    await run((c) => office.templateVersion(c));
    await run((c) => office.clientContract(c, aClient));
    await run((c) => office.resetContractTemplate(c));
    await run((c) => unions.deleteUnion(c, created.id));

    // 2. Every service entry point ran.
    expect([...called].sort()).toEqual(exportedFunctions(unionsModule, deadlinesModule, officeModule, fiscalModule));

    // 1. Every statement is scoped to A.
    expect(statements.length).toBeGreaterThan(60);
    const unscoped = statements.map((s) => ({ sql: s.sql, tables: unscopedReferences(s, ws) })).filter((s) => s.tables.length > 0);
    expect(unscoped).toEqual([]);

    // 3. B is exactly as it was.
    expect(await snapshot(bWorkspace)).toEqual(before);
  });
});

describe('office: reads load only what they need (review risk)', () => {
  it('branding and the office never select the watermark image or the template blocks', async () => {
    const ana = await registerUser(app, 'Ana Titular');
    const ws = await workspaceOf(ana);
    expect((await ana.put('/office', { document: '60.415.732/0001-74', legalName: 'Escritório da Ana' })).status).toBe(200);
    expect((await ana.put('/office/logo', { logo: PNG })).status).toBe(200);
    // A custom template without the Pix placeholder and a custom watermark.
    const saved = await ana.put('/office/contract-template', { blocks: [{ type: 'paragraph', text: 'Contrato simples' }], watermark: PNG });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const cipher = await getCipher(ws);
    const ctxOf = (tx: DbExecutor): ScopedContext => ({
      db: tx,
      workspaceId: ws,
      userId: ana.userId,
      userName: 'Ana Titular',
      permissions: rolePermissions('owner'),
      cipher,
      today: '2026-10-20',
    });
    const run = <T>(fn: (c: ScopedContext) => Promise<T>) => traced.transaction((tx) => fn(ctxOf(tx)));
    // Column references other than presence checks (`… is not null`, `position(… in …)`).
    const heavy = () =>
      statements
        .map((st) => st.sql.replace(/(?:"offices"\.)?"contract_(watermark|blocks)" is not null/g, '').replace(/position\([^)]*"contract_blocks"[^)]*\)/g, ''))
        .filter((text) => /contract_watermark"|contract_blocks"/.test(text));

    statements.length = 0;
    const branding = await run((c) => officeModule.getBranding(c));
    expect(branding).toMatchObject({ name: 'Escritório da Ana', registered: true });
    expect(branding.logo).toMatch(/^data:image\/png;base64,/);
    expect(heavy()).toEqual([]);

    statements.length = 0;
    const office = await run((c) => officeModule.getOffice(c));
    expect(office.contract).toMatchObject({ source: 'custom', watermark: { source: 'custom', enabled: true } });
    // The custom template has no Pix placeholder: the key is not required.
    expect(office.missingForContract).not.toContain('Chave Pix');
    expect(heavy()).toEqual([]);

    // Back to the factory template (it uses the Pix key): now it is required.
    expect((await ana.put('/office/contract-template', { blocks: null })).status).toBe(200);
    expect((await run((c) => officeModule.getOffice(c))).missingForContract).toContain('Chave Pix');
  });
});

