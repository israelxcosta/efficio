// Retention of security rows that are useless once expired (LGPD: data minimization). Every refresh
// inserts a session row and rotated rows were never removed; reset links and invites (which hold an
// e-mail address) stayed forever. Runs with the migrator/owner connection: `db:migrate` calls it on
// every deploy and the API runs it daily when JOBS_ENABLED (src/jobs/daily.ts). The audit trail
// (`audit_logs`, with IP and user agent) is kept `AUDIT_LOG_RETENTION_MONTHS` (default 24, minimum 6);
// the members are warned 30 days before (modules/workspaces/audit-retention.ts).

import { and, isNotNull, lt, or } from 'drizzle-orm';
import { AUDIT_LOG_RETENTION_MONTHS_DEFAULT, AUDIT_LOG_RETENTION_MONTHS_MIN } from '@effinance/shared';
import type { DbExecutor } from './client';
import { auditLogs, openFinanceEvents, passwordResets, sessions, workspaceInvites } from './schema';
import { auditRetentionCutoff } from '../modules/workspaces/audit-retention';

const DAY_MS = 86_400_000;
/** Accepted/expired invites stay visible this long (support questions), then go. */
export const INVITE_RETENTION_DAYS = 30;
/** Webhook event ids are kept this long for idempotency (aggregators retry for hours, not weeks). */
export const WEBHOOK_EVENT_RETENTION_DAYS = 30;

export interface PurgeResult {
  sessions: number;
  passwordResets: number;
  invites: number;
  webhookEvents: number;
  /**
   * Audit records removed. `skipped_no_privilege`: the login has no DELETE on `audit_logs` (the API
   * login keeps the trail append-only) — then they go on the next `db:migrate`, which runs as the owner.
   */
  auditLogs: number | 'skipped_no_privilege';
}

export interface PurgeOptions {
  /** Months the audit trail is kept (`AUDIT_LOG_RETENTION_MONTHS`); below the minimum it is raised to it. */
  auditLogRetentionMonths?: number;
}

/** Deletes the audit records older than the retention period (every workspace, and the ones without). */
export async function purgeExpiredAuditLogs(db: DbExecutor, months: number, now: Date = new Date()): Promise<number> {
  const kept = Math.max(AUDIT_LOG_RETENTION_MONTHS_MIN, Math.trunc(months));
  const deleted = await db
    .delete(auditLogs)
    .where(lt(auditLogs.createdAt, auditRetentionCutoff(now, kept)))
    .returning({ id: auditLogs.id });
  return deleted.length;
}

export async function purgeExpiredSecurityRows(db: DbExecutor, now: Date = new Date(), opts: PurgeOptions = {}): Promise<PurgeResult> {
  // A refresh row past `expires_at` is rejected by `rotateSession` before reuse detection, so it no
  // longer protects anything.
  const deletedSessions = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, now))
    .returning({ id: sessions.id });
  const deletedResets = await db
    .delete(passwordResets)
    .where(or(isNotNull(passwordResets.usedAt), lt(passwordResets.expiresAt, now)))
    .returning({ id: passwordResets.id });
  const cutoff = new Date(now.getTime() - INVITE_RETENTION_DAYS * DAY_MS);
  const deletedInvites = await db
    .delete(workspaceInvites)
    .where(
      or(
        lt(workspaceInvites.expiresAt, cutoff),
        and(isNotNull(workspaceInvites.acceptedAt), lt(workspaceInvites.acceptedAt, cutoff)),
      ),
    )
    .returning({ id: workspaceInvites.id });
  const deletedEvents = await db
    .delete(openFinanceEvents)
    .where(lt(openFinanceEvents.createdAt, new Date(now.getTime() - WEBHOOK_EVENT_RETENTION_DAYS * DAY_MS)))
    .returning({ id: openFinanceEvents.id });
  // Last and on its own: the API login may delete the rows above and still not the audit trail.
  let deletedAudit: PurgeResult['auditLogs'];
  try {
    deletedAudit = await purgeExpiredAuditLogs(db, opts.auditLogRetentionMonths ?? AUDIT_LOG_RETENTION_MONTHS_DEFAULT, now);
  } catch (error) {
    const e = error as { code?: unknown; cause?: { code?: unknown } } | null;
    if ((e?.code ?? e?.cause?.code) !== '42501') throw error;
    deletedAudit = 'skipped_no_privilege';
  }
  return {
    auditLogs: deletedAudit,
    sessions: deletedSessions.length,
    passwordResets: deletedResets.length,
    invites: deletedInvites.length,
    webhookEvents: deletedEvents.length,
  };
}
