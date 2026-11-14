// Audit trail of security, membership, billing and data-protection events. Entries carry ids, the
// masked IP and the user agent — never names, e-mails, documents or amounts.

import type { DbExecutor } from '../db/client';
import { auditLogs } from '../db/schema';
import { maskIp, shortUserAgent } from './ip';

export interface AuditContext {
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditEntry extends AuditContext {
  action: string;
  workspaceId?: string | null;
  userId?: string | null;
  entity?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Security events also written as one structured log line (`docker logs` / any log shipper), with
 * ids and the masked IP only: failures and token reuse at `warn`, the rest at `info`.
 */
export const SECURITY_LOG_ACTIONS: ReadonlyMap<string, 'warn' | 'info'> = new Map([
  ['auth.login_failed', 'warn'],
  ['auth.mfa_failed', 'warn'],
  ['auth.refresh_token_reuse', 'warn'],
  ['client.credential_revealed', 'info'],
  ['data.exported', 'info'],
  ['auth.password_reset', 'info'],
  ['auth.password_changed', 'info'],
  ['auth.mfa_enabled', 'info'],
  ['auth.mfa_disabled', 'info'],
  ['auth.owner_bootstrapped', 'info'],
  ['member.role_changed', 'info'],
  ['member.permissions_changed', 'info'],
  ['account.deleted', 'info'],
  ['workspace.deleted', 'info'],
]);

export type SecurityLogSink = (level: 'warn' | 'info', line: Record<string, unknown>, message: string) => void;

let securityLog: SecurityLogSink | null = null;

/** Where security events are logged (the API's pino logger; the browser demo sets none). */
export function setSecurityLogSink(sink: SecurityLogSink | null): void {
  securityLog = sink;
}

export async function audit(db: DbExecutor, entry: AuditEntry): Promise<void> {
  const level = SECURITY_LOG_ACTIONS.get(entry.action);
  if (level && securityLog) {
    // Never names, e-mails, user agents or metadata: ids and the masked IP are enough to correlate.
    securityLog(
      level,
      {
        audit: entry.action,
        userId: entry.userId ?? null,
        workspaceId: entry.workspaceId ?? null,
        entity: entry.entity ?? null,
        entityId: entry.entityId ?? null,
        ip: maskIp(entry.ip),
      },
      'security event',
    );
  }
  await db.insert(auditLogs).values({
    action: entry.action,
    workspaceId: entry.workspaceId ?? null,
    userId: entry.userId ?? null,
    entity: entry.entity ?? null,
    entityId: entry.entityId ?? null,
    ip: maskIp(entry.ip),
    userAgent: shortUserAgent(entry.userAgent),
    metadata: entry.metadata ?? null,
  });
}
