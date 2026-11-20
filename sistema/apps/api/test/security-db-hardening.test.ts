// Database security review (migration 0026 and catalog invariants not covered elsewhere):
// - personal data of `contacts` is refused in clear text by the database (all 13 columns the API
//   encrypts, plus the blind indexes), legacy clear text is encrypted by the backfill and the
//   constraint can then be validated;
// - foreign keys never let a tenant row reference another workspace (generic, for future tables);
// - notes of transactions, goals, contributions and series templates likewise (0027);
// - the public onboarding policy shows only the row of the token, read-only, only while the link is
//   usable (0027), and nothing without it;
// - API connections carry an idle-in-transaction limit (the migrator does not).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { backfillEncryption, needsBackfill } from '../src/db/backfill';
import { createDb } from '../src/db/client';
import { executeRows } from '../src/lib/sql';
import { withTenant } from '../src/lib/tenant';
import { TENANT_TABLES } from './db-roles';
import { admin, createTestApp, registerUser, resetDb } from './helpers';
import { createClient, workspaceOf } from './task-helpers';

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');

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

const rows = <T>(query: ReturnType<typeof sql>) => executeRows<T>(admin(), query);
const CIPHERTEXT_SHAPED = `v1.${'A'.repeat(16)}.${'B'.repeat(23)}`;
const CIPHERTEXT = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{23,}$/;

async function failure(
  promise: Promise<unknown>,
): Promise<{ code?: string; message?: string } | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return ((error as { cause?: unknown }).cause ?? error) as { code?: string; message?: string };
  }
}

async function rerunMigration(file: string) {
  const source = await readFile(path.join(migrationsFolder, file), 'utf8');
  for (const statement of source.split('--> statement-breakpoint')) {
    if (statement.trim()) await admin().execute(sql.raw(statement));
  }
}

const ENCRYPTED_CONTACT_COLUMNS = [
  'document',
  'email',
  'phone',
  'zip_code',
  'street',
  'number',
  'complement',
  'district',
  'notes',
  'responsible_name',
  'responsible_email',
  'responsible_phone',
  'inactivation_notes',
] as const;

describe('contacts: personal data never in clear text (0026)', () => {
  it('the tenant role cannot write clear text in any encrypted column nor a clear CPF/CNPJ in a blind index', async () => {
    const ana = await registerUser(app, 'Ana Segura');
    const ws = await workspaceOf(ana);
    const client = await createClient(ana);

    for (const column of ENCRYPTED_CONTACT_COLUMNS) {
      const write = (value: string | null) =>
        withTenant(app.db, ws, (tx) =>
          tx.execute(
            sql`update contacts set ${sql.identifier(column)} = ${value} where id = ${client}`,
          ),
        );
      expect((await failure(write('52998224725')))?.code, column).toBe('23514');
      expect(await failure(write(CIPHERTEXT_SHAPED)), column).toBeNull();
      expect(await failure(write('')), column).toBeNull();
      expect(await failure(write(null)), column).toBeNull();
    }
    for (const column of ['document_hash', 'responsible_name_hash'] as const) {
      const write = (value: string) =>
        withTenant(app.db, ws, (tx) =>
          tx.execute(
            sql`update contacts set ${sql.identifier(column)} = ${value} where id = ${client}`,
          ),
        );
      expect((await failure(write('12345678000195')))?.code, column).toBe('23514');
      expect(await failure(write('a'.repeat(64))), column).toBeNull();
    }
    // Inserting a new contact in clear text fails the same way.
    const insert = withTenant(app.db, ws, (tx) =>
      tx.execute(
        sql`insert into contacts (workspace_id, kind, name, email) values (${ws}, 'supplier', 'Fornecedor', 'fulano@exemplo.com')`,
      ),
    );
    expect((await failure(insert))?.code).toBe('23514');
  });

  it('what the API writes passes the checks (every stored value is ciphertext)', async () => {
    const ana = await registerUser(app, 'Ana Segura');
    const client = await createClient(ana);
    const [row] = await rows<Record<string, string | null>>(
      sql`select document, document_hash from contacts where id = ${client}`,
    );
    expect(row!.document).toMatch(CIPHERTEXT);
    expect(row!.document_hash).toMatch(/^[0-9a-f]{64}$/);
    const [check] = await rows<{ validated: boolean }>(
      sql`select convalidated as validated from pg_constraint where conname = 'contacts_encrypted_fields_chk'`,
    );
    expect(check).toBeDefined();
  });

  it('legacy clear text (also in the client-only fields) is encrypted by the backfill; the checks then validate', async () => {
    const ana = await registerUser(app, 'Ana Segura');
    const ws = await workspaceOf(ana);
    const client = await createClient(ana);

    // The database as it was before 0026, with clear text written by an old code path.
    await admin().execute(
      sql.raw('alter table contacts drop constraint contacts_encrypted_fields_chk'),
    );
    let restored = false;
    try {
      await admin()
        .execute(sql`update contacts set email = 'cliente@exemplo.com', responsible_email = 'socio@exemplo.com',
                                       responsible_phone = '11999998888', inactivation_notes = 'mudou de contador' where id = ${client}`);
      expect(await needsBackfill(app.db)).toBe(false);

      // 0026 again (re-runnable, NOT VALID over the clear text) marks every workspace for the backfill…
      await rerunMigration('0026_db_security_hardening.sql');
      restored = true;
      expect(await needsBackfill(app.db)).toBe(true);
      // …and refuses new clear text right away.
      expect(
        (
          await failure(
            admin().execute(sql`update contacts set phone = '1133334444' where id = ${client}`),
          )
        )?.code,
      ).toBe('23514');

      const result = await backfillEncryption(app.db);
      expect(result.rows).toBeGreaterThanOrEqual(1);
      const [stored] = await rows<Record<string, string>>(
        sql`select email, responsible_email, responsible_phone, inactivation_notes from contacts where id = ${client}`,
      );
      for (const value of Object.values(stored!)) expect(value).toMatch(CIPHERTEXT);
      const [copies] = await rows<{ n: number }>(
        sql`select count(*)::int as n from contacts where workspace_id = ${ws} and (email like '%@exemplo.com' or responsible_email like '%@exemplo.com')`,
      );
      expect(copies!.n).toBe(0);
      // Nothing in clear text is left: the constraints can be validated.
      await admin().execute(
        sql.raw('alter table contacts validate constraint contacts_encrypted_fields_chk'),
      );
      await admin().execute(
        sql.raw('alter table contacts validate constraint contacts_blind_index_chk'),
      );

      // The API still reads them (same key, same AAD as the client service).
      const detail = (await ana.get(`/clients/${client}`)).body;
      expect(detail.email).toBe('cliente@exemplo.com');
      expect(detail.responsibleEmail).toBe('socio@exemplo.com');
    } finally {
      if (!restored) await rerunMigration('0026_db_security_hardening.sql');
    }
  });
});

describe('notes never in clear text (0027)', () => {
  const NOTE_CHECKS = [
    ['transactions', 'transactions_notes_chk'],
    ['goals', 'goals_notes_chk'],
    ['goal_contributions', 'goal_contributions_note_chk'],
    ['recurrences', 'recurrences_template_notes_chk'],
  ] as const;

  async function seedNotes(ws: string, note: string) {
    const [tx] = await rows<{
      id: string;
    }>(sql`insert into transactions (workspace_id, type, description, amount, date, notes)
      values (${ws}, 'expense', 'Aluguel', 100, '2026-10-01', ${note}) returning id`);
    const [goal] = await rows<{
      id: string;
    }>(sql`insert into goals (workspace_id, name, target_amount, icon, color, notes)
      values (${ws}, 'Reserva', 1000, 'wallet', '#000000', ${note}) returning id`);
    const [contribution] = await rows<{
      id: string;
    }>(sql`insert into goal_contributions (workspace_id, goal_id, amount, date, note)
      values (${ws}, ${goal!.id}, 10, '2026-10-01', ${note}) returning id`);
    const template = {
      type: 'expense',
      description: 'Aluguel',
      amount: 100,
      accountId: null,
      creditCardId: null,
      categoryId: null,
      subcategoryId: null,
      contactId: null,
      paymentMethod: null,
      notes: note,
    };
    const [series] = await rows<{
      id: string;
    }>(sql`insert into recurrences (workspace_id, kind, frequency, start_date, template)
      values (${ws}, 'fixed', 'monthly', '2026-10-01', ${JSON.stringify(template)}::jsonb) returning id`);
    return { tx: tx!.id, goal: goal!.id, contribution: contribution!.id, series: series!.id };
  }

  it('clear notes are refused; ciphertext, empty and null are accepted', async () => {
    const ana = await registerUser(app, 'Ana Segura');
    const ws = await workspaceOf(ana);
    for (const note of [CIPHERTEXT_SHAPED, '', null])
      expect(await failure(seedNotes(ws, note as string))).toBeNull();
    const refused = await failure(
      withTenant(app.db, ws, (tx) =>
        tx.execute(
          sql`insert into transactions (workspace_id, type, description, amount, date, notes) values (${ws}, 'expense', 'X', 1, '2026-10-01', 'pagar em dinheiro')`,
        ),
      ),
    );
    expect(refused?.code).toBe('23514');
    for (const [table, name] of NOTE_CHECKS) {
      const clear =
        table === 'recurrences'
          ? sql`update recurrences set template = jsonb_set(template, '{notes}', '"senha do cofre"') where workspace_id = ${ws}`
          : sql`update ${sql.identifier(table)} set ${sql.identifier(table === 'goal_contributions' ? 'note' : 'notes')} = 'senha do cofre' where workspace_id = ${ws}`;
      const err = await failure(withTenant(app.db, ws, (tx) => tx.execute(clear)));
      expect(err?.code, name).toBe('23514');
    }
  });

  it('legacy clear notes are encrypted by the backfill; the checks then validate', async () => {
    const ana = await registerUser(app, 'Ana Segura');
    const ws = await workspaceOf(ana);
    for (const [table, name] of NOTE_CHECKS)
      await admin().execute(sql.raw(`alter table ${table} drop constraint ${name}`));
    let restored = false;
    try {
      const ids = await seedNotes(ws, 'nota antiga em claro');
      await rerunMigration('0027_encrypted_notes_public_token.sql');
      restored = true;
      expect(await needsBackfill(app.db)).toBe(true);
      const result = await backfillEncryption(app.db);
      expect(result.rows).toBe(4);
      const [stored] = await rows<Record<string, string>>(sql`select
        (select notes from transactions where id = ${ids.tx}) as tx,
        (select notes from goals where id = ${ids.goal}) as goal,
        (select note from goal_contributions where id = ${ids.contribution}) as contribution,
        (select template ->> 'notes' from recurrences where id = ${ids.series}) as series`);
      for (const value of Object.values(stored!)) expect(value).toMatch(CIPHERTEXT);
      for (const [table, name] of NOTE_CHECKS)
        await admin().execute(sql.raw(`alter table ${table} validate constraint ${name}`));
      expect((await ana.get(`/transactions/${ids.tx}`)).body.notes).toBe('nota antiga em claro');
    } finally {
      if (!restored) await rerunMigration('0027_encrypted_notes_public_token.sql');
    }
  });
});

describe('catalog: integrity across tenants', () => {
  it('every foreign key between RLS tables carries workspace_id on both sides', async () => {
    const leaks = await rows<{ name: string }>(sql`
      select con.conname as name
        from pg_constraint con
        join pg_class src on src.oid = con.conrelid
        join pg_class dst on dst.oid = con.confrelid
       where con.contype = 'f' and src.relrowsecurity and dst.relrowsecurity
         and not exists (
           select 1 from unnest(con.conkey, con.confkey) as k(s, d)
             join pg_attribute sa on sa.attrelid = con.conrelid and sa.attnum = k.s
             join pg_attribute da on da.attrelid = con.confrelid and da.attnum = k.d
            where sa.attname = 'workspace_id' and da.attname = 'workspace_id')`);
    expect(leaks).toEqual([]);
  });

  it('tenant tables only reference identity tables through the workspace (members: composite with workspace_id)', async () => {
    const refs = await rows<{ name: string; target: string; has_ws: boolean }>(sql`
      select con.conname as name, dst.relname as target,
             exists (select 1 from unnest(con.conkey) k join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k
                      where a.attname = 'workspace_id') as has_ws
        from pg_constraint con
        join pg_class src on src.oid = con.conrelid
        join pg_class dst on dst.oid = con.confrelid
       where con.contype = 'f' and src.relrowsecurity and not dst.relrowsecurity`);
    for (const r of refs) {
      expect(['workspaces', 'users', 'workspace_members'], r.name).toContain(r.target);
      if (r.target === 'workspace_members') expect(r.has_ws, r.name).toBe(true);
    }
    // Every tenant table has NOT NULL workspace_id (a NULL row would belong to no tenant).
    const nullable = await rows<{ table_name: string }>(sql`
      select c.table_name from information_schema.columns c
       where c.table_schema = 'public' and c.column_name = 'workspace_id' and c.is_nullable = 'YES'
         and c.table_name = any (${sql.raw(`array[${TENANT_TABLES.map((t) => `'${t}'`).join(',')}]`)}::text[])`);
    expect(nullable).toEqual([]);
  });
});

describe('public onboarding policy', () => {
  async function seedLink() {
    const ana = await registerUser(app, 'Ana Segura');
    const ws = await workspaceOf(ana);
    const client = await createClient(ana);
    const hash = randomBytes(32).toString('hex');
    const [link] = await rows<{ id: string }>(sql`
      insert into onboarding_links (workspace_id, client_id, token_hash, channel, recipient_to, created_by_name, expires_at)
      values (${ws}, ${client}, ${hash}, 'email', ${CIPHERTEXT_SHAPED}, 'Ana Segura', now() + interval '30 days') returning id`);
    return { ws, client, hash, link: link!.id };
  }

  /** A transaction as the tenant role with only `app.onboarding_token` (what the public route does). */
  function asPublic<T>(
    hash: string | null,
    fn: (tx: Parameters<Parameters<App['db']['transaction']>[0]>[0]) => Promise<T>,
  ) {
    return app.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('role', 'effinance_app', true), set_config('app.onboarding_token', ${hash ?? ''}, true)`,
      );
      return fn(tx);
    });
  }

  it('shows the single row of the token, read-only; nothing of other tables or without the token', async () => {
    const a = await seedLink();
    const b = await seedLink();

    const seen = await asPublic(a.hash, (tx) =>
      executeRows<{ id: string }>(tx, sql`select id from onboarding_links`),
    );
    expect(seen.map((r) => r.id)).toEqual([a.link]);
    expect(
      await asPublic(null, (tx) => executeRows(tx, sql`select id from onboarding_links`)),
    ).toEqual([]);
    expect(
      await asPublic('f'.repeat(64), (tx) => executeRows(tx, sql`select id from onboarding_links`)),
    ).toEqual([]);

    // The token opens nothing else of that workspace (or of the other one).
    for (const table of TENANT_TABLES) {
      if (table === 'onboarding_links') continue;
      const found = await asPublic(a.hash, (tx) =>
        executeRows<{ n: number }>(
          tx,
          sql`select count(*)::int as n from ${sql.identifier(table)}`,
        ),
      );
      expect(found[0]!.n, table).toBe(0);
    }

    // Read-only: no update, delete or insert through the token.
    const updated = await asPublic(a.hash, (tx) =>
      executeRows(
        tx,
        sql`update onboarding_links set revoked_at = null, expires_at = now() + interval '10 years' where id = ${a.link} returning id`,
      ),
    );
    expect(updated).toEqual([]);
    const deleted = await asPublic(a.hash, (tx) =>
      executeRows(tx, sql`delete from onboarding_links returning id`),
    );
    expect(deleted).toEqual([]);
    const inserted = asPublic(a.hash, (tx) =>
      tx.execute(sql`insert into onboarding_links (workspace_id, client_id, token_hash, channel, recipient_to, created_by_name, expires_at)
                     values (${a.ws}, ${a.client}, ${'e'.repeat(64)}, 'email', ${CIPHERTEXT_SHAPED}, 'X', now() + interval '1 day')`),
    );
    expect((await failure(inserted))?.code).toBe('42501');
    const [count] = await rows<{ n: number }>(sql`select count(*)::int as n from onboarding_links`);
    expect(count!.n).toBe(2);
    expect(b.link).not.toBe(a.link);
  });

  it('a revoked or expired link is invisible to its token (0027)', async () => {
    const a = await seedLink();
    const visible = () =>
      asPublic(a.hash, (tx) =>
        executeRows<{ id: string }>(tx, sql`select id from onboarding_links`),
      );
    expect((await visible()).length).toBe(1);
    await admin().execute(
      sql`update onboarding_links set revoked_at = now(), revoked_by_name = 'Ana Segura' where id = ${a.link}`,
    );
    expect(await visible()).toEqual([]);
    await admin()
      .execute(sql`update onboarding_links set revoked_at = null, revoked_by_name = null, created_at = now() - interval '40 days',
                                     expires_at = now() - interval '1 minute' where id = ${a.link}`);
    expect(await visible()).toEqual([]);
  });
});

describe('connection limits', () => {
  it('API connections end a transaction left idle; the migrator connection has no such limit', async () => {
    const [runtime] = await executeRows<{ idle: string; app: string }>(
      app.db,
      sql`select current_setting('idle_in_transaction_session_timeout') as idle, current_setting('application_name') as app`,
    );
    expect(runtime).toEqual({ idle: '30s', app: 'efficio-api' });

    const migrator = createDb(process.env.ADMIN_DATABASE_URL, { purpose: 'migrator' });
    try {
      const [m] = await executeRows<{ idle: string }>(
        migrator.db,
        sql`select current_setting('idle_in_transaction_session_timeout') as idle`,
      );
      expect(m!.idle).toBe('0');
    } finally {
      await migrator.client.end({ timeout: 5 });
    }
  });
});
