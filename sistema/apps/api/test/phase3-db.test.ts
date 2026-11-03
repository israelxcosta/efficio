// Database review of phase 3 (migration 0015): Row Level Security on every new tenant table,
// composite foreign keys that never cross workspaces, CHECKs (catalogs, ciphertext only, images, the
// owner without adjustments), LGPD (recorded names replaced when the account goes) and re-running the
// migration over existing rows.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CLIENT_DOCUMENT_KINDS, OFFICE_IMAGE_CONTENT_TYPES, PIX_KEY_TYPES, PROFILE_PHOTO_CONTENT_TYPES } from '@effinance/shared';
import type { App } from '../src/app';
import { executeRows } from '../src/lib/sql';
import { withTenant } from '../src/lib/tenant';
import { admin, createTestApp, resetDb } from './helpers';
import { cnpj, createClient, member, office, workspaceOf } from './task-helpers';

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

const PHASE3_TABLES = ['client_documents', 'unions', 'union_conventions', 'union_clients', 'offices'] as const;
const rows = <T>(query: ReturnType<typeof sql>) => executeRows<T>(admin(), query);
const CIPHERTEXT_SHAPED = `v1.${'A'.repeat(16)}.${'B'.repeat(23)}`;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAABACAIAAAAS6ev4AAAAtklEQVR42u3cYQnAIBCAUUuYwlT2McmCWUMjCIIHO558AcY9Njh/rNTWlbhiBIAFWIAFWIAFWIABC7AAC7AAKwh4PTsYAAuwAAMGDBgw4BfAy7l6JQADPo045lMDFTBgwIABAwYMGLA1yRVE8osOowcswAIMGDBgwIABpwWOedDxzV8HGDBgwIABAwYMGLCVyR4MGDBgwAIswIABAwbsJywCLMACLMACDFiABViABViABRiwkrUBk0U/aDulaGkAAAAASUVORK5CYII=';

async function failure(promise: Promise<unknown>): Promise<{ code?: string } | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return ((error as { cause?: unknown }).cause ?? error) as { code?: string };
  }
}

let seedCount = 0;

/** An office with a client (documents, accesses), a union linked to it with a cycle, and the office row. */
async function seed() {
  seedCount += 1;
  const o = await office(app);
  const ws = await workspaceOf(o.ana);
  const client = await createClient(o.ana);
  const updated = await o.ana.put(`/clients/${client}`, {
    name: `Cliente ${seedCount} Ltda`,
    document: (await o.ana.get(`/clients/${client}`)).body.document,
    taxRegime: 'simples_nacional',
    simplesAnnex: 'I',
    contractStartDate: '2025-01-10',
    accountantPassword: { action: 'set', value: 'segredo' },
    documents: [{ kind: 'cndt', expiresAt: '2026-11-01', note: 'nota' }],
  });
  expect(updated.status).toBe(200);
  const union = await o.ana.post('/unions', { name: 'Sindicato', document: cnpj(50_000_000 + seedCount), baseMonth: 11, clientIds: [client] });
  expect(union.status).toBe(201);
  expect((await o.ana.patch(`/unions/${union.body.id}/conventions/2025`, { published: true })).status).toBe(200);
  expect((await o.ana.put('/office', { document: '60.415.732/0001-74', legalName: 'Escritório', responsibleDocument: '529.982.247-25' })).status).toBe(200);
  return { ...o, ws, client, union: union.body.id as string, document: updated.body.documents[0].id as string };
}

describe('phase 3 tables: tenancy', () => {
  it('every new table fails closed without a workspace and shows only the active one', async () => {
    const a = await seed();
    await seed();
    for (const table of PHASE3_TABLES) {
      const all = await rows<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(table)} where workspace_id = ${a.ws}`);
      expect(all[0]!.n, table).toBeGreaterThan(0);
    }
    const seen = await app.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('role', 'effinance_app', true), set_config('app.workspace_id', '', true)`);
      const out: number[] = [];
      for (const table of PHASE3_TABLES) out.push((await executeRows<{ n: number }>(tx, sql`select count(*)::int as n from ${sql.identifier(table)}`))[0]!.n);
      return out;
    });
    expect(seen.every((n) => n === 0)).toBe(true);
    const visible = await withTenant(app.db, a.ws, async (tx) => {
      const out = new Set<string>();
      for (const table of PHASE3_TABLES) {
        for (const r of await executeRows<{ ws: string }>(tx, sql`select distinct workspace_id::text as ws from ${sql.identifier(table)}`)) out.add(r.ws);
      }
      return out;
    });
    expect([...visible]).toEqual([a.ws]);
    // The API login reaches none of them directly.
    const direct = await failure(app.db.execute(sql`select count(*) from unions`));
    expect(direct).not.toBeNull();
  });

  it('references never cross workspaces (refused like unknown ids)', async () => {
    const a = await seed();
    const b = await seed();
    const attempts: [string, ReturnType<typeof sql>][] = [
      ['document → foreign client', sql`insert into client_documents (workspace_id, client_id, kind, updated_by_name) values (${b.ws}, ${a.client}, 'cndt', 'B')`],
      ['cycle → foreign union', sql`insert into union_conventions (workspace_id, union_id, year) values (${b.ws}, ${a.union}, 2030)`],
      ['link → foreign union', sql`insert into union_clients (workspace_id, union_id, client_id) values (${b.ws}, ${a.union}, ${b.client})`],
      ['link → foreign client', sql`insert into union_clients (workspace_id, union_id, client_id) values (${b.ws}, ${b.union}, ${a.client})`],
      ['document moved to a foreign client', sql`update client_documents set client_id = ${a.client} where workspace_id = ${b.ws}`],
    ];
    for (const [label, statement] of attempts) {
      const f = await failure(withTenant(app.db, b.ws, (tx) => tx.execute(statement)));
      expect(f?.code, label).toBe('23503');
    }
    // A supplier is never a union's client nor has documents (`client_kind`).
    const supplier = (await b.ana.post('/contacts', { name: 'Fornecedor' })).body.id as string;
    const f = await failure(
      withTenant(app.db, b.ws, (tx) => tx.execute(sql`insert into union_clients (workspace_id, union_id, client_id) values (${b.ws}, ${b.union}, ${supplier})`)),
    );
    expect(f?.code).toBe('23503');
  });
});

describe('phase 3 tables: integrity', () => {
  it('enumerations follow the contract (a new value needs a migration)', async () => {
    const defs = await rows<{ name: string; def: string }>(sql`
      select conname as name, pg_get_constraintdef(oid) as def from pg_constraint where contype = 'c' and connamespace = 'public'::regnamespace`);
    const values = (name: string) => [...defs.find((d) => d.name === name)!.def.matchAll(/'([^']*)'::text/g)].map((m) => m[1]).sort();
    const sorted = (list: readonly string[]) => [...list].sort();
    expect(values('client_documents_kind_chk')).toEqual(sorted(CLIENT_DOCUMENT_KINDS));
    expect(values('user_photos_type_chk')).toEqual(sorted(PROFILE_PHOTO_CONTENT_TYPES));
    expect(defs.find((d) => d.name === 'offices_pix_chk')!.def).toEqual(expect.stringContaining(PIX_KEY_TYPES.map((t) => `'${t}'::text`).join(', ')));
    for (const t of OFFICE_IMAGE_CONTENT_TYPES) expect(defs.find((d) => d.name === 'offices_logo_chk')!.def).toContain(`'${t}'`);
  });

  it('CHECKs: ciphertext only for secrets, document names, cycle shape, owner without adjustments', async () => {
    const a = await seed();
    const attempts: [string, ReturnType<typeof sql>][] = [
      ['clear access', sql`update contacts set accountant_password = 'segredo' where workspace_id = ${a.ws} and id = ${a.client}`],
      ['clear CPF', sql`update contacts set responsible_document = '52998224725' where workspace_id = ${a.ws} and id = ${a.client}`],
      ['exempt with registration', sql`update contacts set state_registration = '123', state_registration_exempt = true where workspace_id = ${a.ws} and id = ${a.client}`],
      ['other without name', sql`insert into client_documents (workspace_id, client_id, kind, updated_by_name) values (${a.ws}, ${a.client}, 'other', 'A')`],
      ['catalog kind with name', sql`insert into client_documents (workspace_id, client_id, kind, custom_name, updated_by_name) values (${a.ws}, ${a.client}, 'cndt', 'X', 'A')`],
      ['clear note', sql`update client_documents set note = 'nota' where workspace_id = ${a.ws}`],
      ['published without date', sql`update union_conventions set published_at = null where workspace_id = ${a.ws}`],
      ['year out of range', sql`insert into union_conventions (workspace_id, union_id, year) values (${a.ws}, ${a.union}, 1990)`],
      ['union notes in clear', sql`update unions set notes = 'nota' where workspace_id = ${a.ws}`],
      ['base month 13', sql`update unions set base_month = 13 where workspace_id = ${a.ws}`],
      ['pix key without type', sql`update offices set pix_key = ${CIPHERTEXT_SHAPED}, pix_key_type = null where workspace_id = ${a.ws}`],
      ['logo with an SVG type', sql`update offices set logo = '\\x3c737667', logo_type = 'image/svg+xml' where workspace_id = ${a.ws}`],
      ['contract not an array', sql`update offices set contract_blocks = '{}'::jsonb where workspace_id = ${a.ws}`],
    ];
    for (const [label, statement] of attempts) {
      const f = await failure(withTenant(app.db, a.ws, (tx) => tx.execute(statement)));
      expect(f?.code, label).toBe('23514');
    }
    const owner = await failure(admin().execute(sql`update workspace_members set permissions = '{"finance": false}'::jsonb where user_id = ${a.ana.userId}`));
    expect(owner?.code).toBe('23514');
    const array = await failure(admin().execute(sql`update workspace_members set permissions = '[]'::jsonb where user_id = ${a.carla.userId}`));
    expect(array?.code).toBe('23514');
    const photo = await failure(admin().execute(sql`insert into user_photos (user_id, content_type, size_bytes, content) values (${a.carla.userId}, 'image/png', 10, '\\x00')`));
    expect(photo?.code).toBe('23514');
  });

  it('deleting the account replaces the recorded names (LGPD); a client going takes its documents and links', async () => {
    const a = await seed();
    const editor = await member(app, a.ana, 'editor', 'Editora Passageira');
    expect((await editor.patch(`/unions/${a.union}/conventions/2026`, { published: true })).status).toBe(200);
    expect((await editor.put('/office/contract-template', { watermarkEnabled: false })).status).toBe(200);
    expect((await editor.put('/office/logo', { logo: PNG })).status).toBe(200);
    await admin().execute(sql`delete from users where id = ${editor.userId}`);
    const [cycle] = await rows<{ by: string | null; name: string }>(
      sql`select published_by as by, published_by_name as name from union_conventions where workspace_id = ${a.ws} and year = 2026`,
    );
    expect(cycle).toEqual({ by: null, name: 'Usuário excluído' });
    const [officeRow] = await rows<{ contract: string; updated: string }>(
      sql`select contract_updated_by_name as contract, updated_by_name as updated from offices where workspace_id = ${a.ws}`,
    );
    expect(officeRow).toEqual({ contract: 'Usuário excluído', updated: 'Usuário excluído' });

    await withTenant(app.db, a.ws, (tx) => tx.execute(sql`delete from tasks where workspace_id = ${a.ws}`));
    expect((await a.ana.del(`/clients/${a.client}`)).status).toBe(204);
    const [left] = await rows<{ docs: number; links: number }>(
      sql`select (select count(*)::int from client_documents where workspace_id = ${a.ws}) as docs, (select count(*)::int from union_clients where workspace_id = ${a.ws}) as links`,
    );
    expect(left).toEqual({ docs: 0, links: 0 });
  });

  it('the migration runs again over existing rows', async () => {
    const a = await seed();
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle/0015_phase3.sql');
    const source = await readFile(file, 'utf8');
    await admin().transaction(async (tx) => {
      for (const statement of source.split('--> statement-breakpoint')) if (statement.trim()) await tx.execute(sql.raw(statement));
    });
    const client = await a.ana.get(`/clients/${a.client}`);
    expect(client.body.credentials.accountantPassword).toBe(true);
    expect(client.body.documents).toHaveLength(1);
    expect((await a.ana.post(`/clients/${a.client}/credentials/reveal`, { field: 'accountantPassword' })).body.value).toBe('segredo');
    expect((await a.carla.get(`/unions/${a.union}`)).body.conventions).toHaveLength(1);
  });
});
