import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';
import * as schema from './schema';

/** TLS to the database: `verify-full` checks the certificate chain (RDS CA bundle) and host name. */
function sslOptions(): postgres.Options<Record<string, never>>['ssl'] {
  if (env.DATABASE_SSL === 'verify-full') {
    return { rejectUnauthorized: true, ca: readFileSync(env.DATABASE_CA_FILE!, 'utf8') };
  }
  return env.DATABASE_SSL === 'require' ? 'require' : false;
}

/**
 * Session limits of the API connections, sent at connection start (they win over `ALTER ROLE … SET`,
 * so they are never looser than docs/deploy-aws.md and deploy/db-init): a transaction left open by a
 * bug or a slow external call is ended by the server after 30 s instead of holding locks and a pooled
 * connection; tenant transactions still pin their own statement_timeout (lib/tenant.ts).
 */
export const RUNTIME_SESSION_SETTINGS = {
  application_name: 'efficio-api',
  idle_in_transaction_session_timeout: '30s',
} as const;

export interface CreateDbOptions {
  /** `migrator`: DDL, backfill and VACUUM can legitimately run long — no session limits. */
  purpose?: 'runtime' | 'migrator';
}

export function createDb(url: string = env.DATABASE_URL, options: CreateDbOptions = {}) {
  const client = postgres(url, {
    max: env.NODE_ENV === 'test' ? 4 : 10,
    ssl: sslOptions(),
    onnotice: () => {},
    connection: options.purpose === 'migrator' ? { application_name: 'efficio-migrate' } : { ...RUNTIME_SESSION_SETTINGS },
  });
  const db = drizzle(client, { schema, casing: 'snake_case' });
  return { db, client };
}

export type Database = ReturnType<typeof createDb>['db'];
/** A db handle or a transaction handle (both expose the same query API). */
export type DbExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];
