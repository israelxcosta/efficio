import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { env } from '../env';
import { configureKeyring } from '../lib/crypto/keyring';
import { createKeyProvider } from '../setup';
import { backfillEncryption, needsBackfill } from './backfill';
import { createDb } from './client';
import { purgeExpiredSecurityRows } from './retention';
import { sql } from 'drizzle-orm';

/**
 * CHECKs added as NOT VALID (migrations 0026/0027: encrypted-or-empty text and blind-index format).
 * New writes are checked from the start; once the backfill has encrypted the legacy rows, the old
 * rows are validated here so no manual step is needed after an update. A failure (plain text left)
 * is only reported: the constraint stays NOT VALID and the next run tries again.
 */
export const DEFERRED_CHECKS: readonly (readonly [table: string, constraint: string])[] = [
  ['contacts', 'contacts_encrypted_fields_chk'],
  ['contacts', 'contacts_blind_index_chk'],
  ['transactions', 'transactions_notes_chk'],
  ['goals', 'goals_notes_chk'],
  ['goal_contributions', 'goal_contributions_note_chk'],
  ['recurrences', 'recurrences_template_notes_chk'],
];

export async function validateDeferredChecks(db: ReturnType<typeof createDb>['db']) {
  const pending = (await db.execute(sql`
    select conrelid::regclass::text as "table", conname as "constraint"
    from pg_constraint where not convalidated and contype = 'c'
  `)) as unknown as { table: string; constraint: string }[];
  const wanted = new Set(DEFERRED_CHECKS.map(([t, c]) => `${t}.${c}`));
  const result = { validated: 0, failed: [] as string[] };
  for (const row of pending) {
    const key = `${row.table}.${row.constraint}`;
    if (!wanted.has(key)) continue;
    try {
      // Identifiers come from the fixed list above (never from input).
      await db.execute(sql.raw(`alter table ${row.table} validate constraint ${row.constraint}`));
      result.validated++;
    } catch (err) {
      result.failed.push(key);
      console.error(`✖ ${key} not validated (plain text left?): ${(err as Error).message}`);
    }
  }
  return result;
}

const here = path.dirname(fileURLToPath(import.meta.url));
// Works both from src/db (tsx) and dist (bundled build).
export const migrationsFolder = path.resolve(here, here.endsWith(path.join('src', 'db')) ? '../../drizzle' : '../drizzle');

export async function runMigrations(url?: string) {
  const { db, client } = createDb(url, { purpose: 'migrator' });
  try {
    await migrate(db, { migrationsFolder });
    if (await needsBackfill(db)) {
      configureKeyring({ provider: await createKeyProvider(env), db });
      const result = await backfillEncryption(db);
      console.log(`✔ encryption backfill: ${result.workspaces} workspaces, ${result.rows} rows encrypted`);
      // Old plain-text versions of the updated rows stay in dead tuples until vacuumed (and in WAL and
      // backups until they expire). When rows > 0, run `VACUUM FULL contacts, transactions,
      // recurrences, goals, goal_contributions, tasks, task_comments` in a maintenance window.
    }
    const checks = await validateDeferredChecks(db);
    if (checks.validated || checks.failed.length) {
      console.log(`✔ deferred checks: ${checks.validated} validated${checks.failed.length ? `, ${checks.failed.length} pending` : ''}`);
    }
    const purged = await purgeExpiredSecurityRows(db, new Date(), { auditLogRetentionMonths: env.AUDIT_LOG_RETENTION_MONTHS });
    console.log(
      `✔ retention: ${purged.sessions} sessions, ${purged.passwordResets} reset links, ${purged.invites} invites, ${purged.webhookEvents} webhook events, ${purged.auditLogs} audit records removed`,
    );
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runMigrations()
    .then(() => {
      console.log('✔ migrations applied');
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
