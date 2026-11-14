// VPS database roles (deploy/db-init/10-efficio.sh): the API and `migrate` log in as `efficio`, a
// NON-superuser that owns the database and every table, and each tenant request switches to
// `effinance_app` (SET LOCAL ROLE). The rest of the suite owns the tables as the superuser `postgres`,
// which bypasses RLS even when it is forced — so nothing there proves the VPS setup. This file mirrors it
// in a database of its own: the whole migration chain must run as that owner (0021 reclassifies interest
// and fines under FORCE RLS), FORCE must keep the owner login itself out of every workspace's rows unless
// it pins one, and the per-request role must stay confined to its workspace.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/db/migrate';
import { ADMIN_URL, IDENTITY_TABLES } from './db-roles';

// Derived from the test database so parallel runs on other databases of the cluster never collide.
const BASE = new URL(ADMIN_URL).pathname.slice(1).replace(/[^a-z0-9_]/gi, '_');
const OWNER = `${BASE}_vps_owner`;
const DB = `${BASE}_vps`;

function urlAs(user: string, password: string, database: string): string {
  const url = new URL(ADMIN_URL);
  url.username = user;
  url.password = password;
  url.pathname = `/${database}`;
  return url.toString();
}

let admin: postgres.Sql;
let owner: postgres.Sql;

async function dropScenario() {
  await admin.unsafe(`drop database if exists ${DB} with (force)`);
  await admin.unsafe(`drop role if exists ${OWNER}`);
}

beforeAll(async () => {
  admin = postgres(ADMIN_URL, { onnotice: () => {}, max: 1 });
  await dropScenario();
  // Same attributes as 10-efficio.sh (effinance_app is cluster-wide and already exists).
  await admin.unsafe(
    `create role ${OWNER} login nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '${OWNER}'`,
  );
  await admin.unsafe(`grant effinance_app to ${OWNER} with admin option`);
  await admin.unsafe(`create database ${DB} owner ${OWNER} encoding 'UTF8' template template0`);
  await admin.unsafe(`revoke all on database ${DB} from public`);
  await runMigrations(urlAs(OWNER, OWNER, DB));
  owner = postgres(urlAs(OWNER, OWNER, DB), { onnotice: () => {}, max: 1 });
}, 120_000);

afterAll(async () => {
  await owner?.end();
  if (admin) {
    await dropScenario();
    await admin.end();
  }
});

/** Runs `fn` as the owner login with `app.workspace_id` pinned (and optionally as effinance_app). */
async function as<T>(
  ws: string | null,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
  role?: 'effinance_app',
): Promise<T> {
  return (await owner.begin(async (tx) => {
    if (role) await tx`select set_config('role', ${role}, true)`;
    if (ws !== null) await tx`select set_config('app.workspace_id', ${ws}, true)`;
    return fn(tx);
  })) as T;
}

async function code(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

async function workspace(name: string): Promise<string> {
  const [row] = await owner<{ id: string }[]>`insert into workspaces (name, kind) values (${name}, 'business') returning id`;
  return row!.id;
}

describe('VPS: API and migrations as the non-superuser owner of the tables', () => {
  it('the owner has no way around RLS and every workspace table is ENABLE + FORCE, owned by it', async () => {
    const [role] = await admin<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      select rolsuper, rolbypassrls from pg_roles where rolname = ${OWNER}`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
    const tables = await owner<{ name: string; rls: boolean; force: boolean; owner: string }[]>`
      select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as force, pg_get_userbyid(c.relowner) as owner
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'workspace_id' and not a.attisdropped)`;
    const tenant = tables.filter((t) => !(IDENTITY_TABLES as readonly string[]).includes(t.name));
    expect(tenant.length).toBeGreaterThanOrEqual(37);
    expect(tenant.filter((t) => !t.rls || !t.force).map((t) => t.name)).toEqual([]);
    expect(new Set(tables.map((t) => t.owner))).toEqual(new Set([OWNER]));
  });

  it('FORCE binds the owner login itself: no workspace pinned = nothing read, nothing written', async () => {
    const a = await workspace('Escritório A');
    const b = await workspace('Escritório B');
    for (const ws of [a, b]) {
      await as(ws, (tx) => tx`insert into categories (workspace_id, name, type, icon, color)
                              values (${ws}, 'Aluguel', 'expense', 'home', '#123456')`);
    }
    // Outside any request context (a code path that forgot withTenant): zero rows, never all of them.
    const [none] = await owner<{ n: number }[]>`select count(*)::int as n from categories`;
    expect(none!.n).toBe(0);
    expect(await as('', (tx) => tx`select count(*)::int as n from categories`)).toEqual([{ n: 0 }]);
    expect(
      await code(owner`insert into categories (workspace_id, name, type, icon, color) values (${a}, 'X', 'expense', 'home', '#123456')`),
    ).toBe('42501');
    // Pinned to A: only A, and A cannot write rows of B (WITH CHECK) — for the owner too.
    expect(await as(a, (tx) => tx`select count(*)::int as n from categories`)).toEqual([{ n: 1 }]);
    expect(await code(as(a, (tx) => tx`update categories set workspace_id = ${b}`))).toBe('42501');
    expect(
      await code(as(a, (tx) => tx`insert into fee_adjustments (workspace_id, month, applied_bps, adjust_employee_fee, applied_by_name)
                                  values (${b}, '2026-11', 500, false, 'Ana')`)),
    ).toBe('42501');
  });

  it('the per-request role stays inside its workspace and away from identity tables and DDL', async () => {
    const a = await workspace('Escritório C');
    const b = await workspace('Escritório D');
    await as(b, (tx) => tx`insert into fee_adjustments (workspace_id, month, applied_bps, adjust_employee_fee, applied_by_name)
                           values (${b}, '2026-11', 500, false, 'Bruno')`);
    expect(await as(a, (tx) => tx`select count(*)::int as n from fee_adjustments`, 'effinance_app')).toEqual([{ n: 0 }]);
    expect(await as(b, (tx) => tx`select count(*)::int as n from fee_adjustments`, 'effinance_app')).toEqual([{ n: 1 }]);
    expect(await as(null, (tx) => tx`select count(*)::int as n from fee_adjustments`, 'effinance_app')).toEqual([{ n: 0 }]);
    expect(await code(as(a, (tx) => tx`select id from users limit 1`, 'effinance_app'))).toBe('42501');
    expect(await code(as(a, (tx) => tx`select id from audit_logs limit 1`, 'effinance_app'))).toBe('42501');
    expect(await code(as(a, (tx) => tx`truncate fee_adjustments`, 'effinance_app'))).toBe('42501');
    expect(await code(as(a, (tx) => tx`alter table fee_adjustments no force row level security`, 'effinance_app'))).toBe('42501');
  });

  it('migration 0021 reclassifies interest and fines workspace by workspace as the owner under FORCE RLS', async () => {
    const a = await workspace('Escritório E');
    const b = await workspace('Escritório F');
    const late = await as(a, async (tx) => {
      const [services] = await tx<{ id: string }[]>`insert into categories (workspace_id, name, type, icon, color)
        values (${a}, 'Serviços Prestados', 'income', 'briefcase', '#123456') returning id`;
      const [original] = await tx<{ id: string }[]>`insert into transactions (workspace_id, type, description, amount, date, category_id)
        values (${a}, 'income', 'Honorários', 80000, '2026-09-15', ${services!.id}) returning id`;
      const [row] = await tx<{ id: string }[]>`insert into transactions (workspace_id, type, description, amount, date, category_id, late_fee_of, late_fee_kind)
        values (${a}, 'income', 'Juros', 533, '2026-10-05', ${services!.id}, ${original!.id}, 'interest') returning id`;
      return row!.id;
    });
    const source = await readFile(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle/0021_late_fees_fee_adjustments.sql'),
      'utf8',
    );
    // As `migrate` does on the VPS: one transaction, the owner login, no workspace pinned.
    await owner.begin(async (tx) => {
      for (const statement of source.split('--> statement-breakpoint')) if (statement.trim()) await tx.unsafe(statement);
      const [setting] = await tx<{ ws: string | null }[]>`select nullif(current_setting('app.workspace_id', true), '') as ws`;
      expect(setting!.ws).toBeNull();
    });
    const [moved] = await as(a, (tx) => tx<{ parent: string; sub: string }[]>`
      select p.name as parent, s.name as sub from transactions t
        join categories p on p.id = t.category_id join categories s on s.id = t.subcategory_id where t.id = ${late}`);
    expect(moved).toEqual({ parent: 'Receitas financeiras', sub: 'Juros e multas recebidos' });
    // The other workspace (no interest or fines) got nothing.
    expect(await as(b, (tx) => tx`select count(*)::int as n from categories`)).toEqual([{ n: 0 }]);
  });
});
