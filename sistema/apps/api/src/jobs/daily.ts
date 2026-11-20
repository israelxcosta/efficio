// Daily maintenance run by the API's scheduler (scheduler.ts; JOBS_ENABLED, one API instance):
// 1. retention of expired security rows (db/retention.ts, which also runs on every `migrate`);
// 2. the recurring obligations of the current and the next competence for every workspace — the same
//    idempotent generation the task screens trigger when opened (modules/tasks/generation.ts).
// 3. onboarding accesses of links expired more than 12 months ago (LGPD: minimization), per workspace
//    in its tenant transaction (modules/onboarding/service.ts).
// Each part fails on its own: an error is logged and the rest goes on. Server-only (never in the demo).

import { asc, eq } from 'drizzle-orm';
import { addMonthKey, AUDIT_LOG_RETENTION_MONTHS_DEFAULT, dateInTimeZone, effectivePermissions, monthKey, TASK_TIME_ZONE, type MonthKey } from '@effinance/shared';
import type { DbExecutor } from '../db/client';
import { purgeExpiredSecurityRows, type PurgeResult } from '../db/retention';
import type { Mailer } from '../lib/mailer';
import { notifyAuditRetention } from '../modules/workspaces/audit-retention';
import { subscriptions, workspaces } from '../db/schema';
import { inTenant } from '../lib/tenant-scope';
import { summarizeSubscription } from '../modules/billing/entitlements';
import { loadMembers } from '../modules/tasks/access';
import { ensureOccurrences } from '../modules/tasks/generation';
import { purgeExpiredAccesses } from '../modules/onboarding/service';

export interface JobLog {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

export interface DailyJobsOptions {
  /** System connection (owner of the request-independent work; tenant work goes through RLS). */
  db: DbExecutor;
  /**
   * Connection for the retention deletes (default `db`). A least-privileged API login has no DELETE
   * on `sessions`/`open_finance_events`: then the clean-up is skipped with a warning (it still runs
   * on every `migrate`).
   */
  maintenanceDb?: DbExecutor;
  billingEnabled: boolean;
  log: JobLog;
  /** Injected clock (tests). */
  now?: () => Date;
  /** Months the audit trail is kept (`AUDIT_LOG_RETENTION_MONTHS`; default 24). */
  auditLogRetentionMonths?: number;
  /** Sends the warning that audit records go within 30 days (absent: no e-mail). */
  mailer?: Mailer;
  /** Public URL of the web app (link of the warning). */
  appUrl?: string;
}

export interface DailyJobsResult {
  /** Rows removed, or why the clean-up did not happen. */
  retention: PurgeResult | 'skipped_no_privilege' | 'failed';
  /** Competences generated (current and next, in the office time zone). */
  competences: MonthKey[];
  workspaces: number;
  created: number;
  failed: number;
  /** Workspaces warned by e-mail that audit records go within 30 days (`skipped`: no mailer). */
  auditNotices: number | 'skipped' | 'failed';
  /** Onboarding accesses deleted (links expired more than 12 months ago), or `failed`. */
  onboardingAccesses: number | 'failed';
}

const INSUFFICIENT_PRIVILEGE = '42501';

function pgCode(error: unknown): string | undefined {
  const e = error as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = e?.code ?? e?.cause?.code;
  return typeof code === 'string' ? code : undefined;
}

async function runRetention(o: DailyJobsOptions, at: Date): Promise<DailyJobsResult['retention']> {
  try {
    const result = await purgeExpiredSecurityRows(o.maintenanceDb ?? o.db, at, { auditLogRetentionMonths: o.auditLogRetentionMonths });
    if (result.auditLogs === 'skipped_no_privilege') {
      o.log.warn({ job: 'retention' }, 'audit trail clean-up skipped: the database login has no DELETE on audit_logs (it runs on migrate)');
    }
    return result;
  } catch (error) {
    if (pgCode(error) === INSUFFICIENT_PRIVILEGE) {
      o.log.warn({ job: 'retention' }, 'retention skipped: the database login has no DELETE on the security tables (it runs on migrate)');
      return 'skipped_no_privilege';
    }
    o.log.error({ job: 'retention', err: error }, 'retention failed');
    return 'failed';
  }
}

/** Generates the obligations of `competences` in every workspace whose subscription allows writing. */
async function generateAll(o: DailyJobsOptions, at: Date, competences: MonthKey[]) {
  const today = dateInTimeZone(at, TASK_TIME_ZONE);
  const rows = await o.db
    .select({ id: workspaces.id, subscription: subscriptions })
    .from(workspaces)
    .leftJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id))
    .orderBy(asc(workspaces.createdAt));
  let created = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const canWrite = summarizeSubscription(row.subscription, o.billingEnabled, at).canWrite;
      const members = await loadMembers(o.db, row.id);
      const owner = [...members.values()].find((m) => m.role === 'owner') ?? members.values().next().value;
      if (!canWrite || !owner) continue;
      created += await inTenant(o.db, row.id, (db, cipher) =>
        ensureOccurrences(
          {
            db,
            workspaceId: row.id,
            // No person behind the run: generated rows are authored by GENERATED_BY.
            userId: owner.id,
            role: 'owner',
            isAdmin: true,
            permissions: effectivePermissions('owner'),
            canWrite,
            members,
            today,
            cipher,
            log: o.log,
          },
          competences,
        ),
      );
    } catch (error) {
      failed += 1;
      o.log.error({ job: 'recurring_tasks', workspaceId: row.id, err: error }, 'recurring obligations generation failed');
    }
  }
  return { workspaces: rows.length, created, failed };
}

/** One maintenance run. Never throws for a failing part (each one is logged). */
/** Every workspace: the accesses of its links expired more than 12 months ago. */
async function purgeOnboardingAccesses(o: DailyJobsOptions): Promise<number> {
  const rows = await o.db.select({ id: workspaces.id }).from(workspaces);
  let deleted = 0;
  for (const row of rows) {
    try {
      deleted += await inTenant(o.db, row.id, (db) => purgeExpiredAccesses(db, row.id));
    } catch (error) {
      o.log.warn({ job: 'onboarding-accesses', workspaceId: row.id, err: error }, 'onboarding accesses clean-up failed (retried tomorrow)');
    }
  }
  return deleted;
}

export async function runDailyJobs(o: DailyJobsOptions): Promise<DailyJobsResult> {
  const at = (o.now ?? (() => new Date()))();
  const retention = await runRetention(o, at);
  const current = monthKey(dateInTimeZone(at, TASK_TIME_ZONE));
  const competences = [current, addMonthKey(current, 1)];
  let generation = { workspaces: 0, created: 0, failed: 0 };
  try {
    generation = await generateAll(o, at, competences);
  } catch (error) {
    o.log.error({ job: 'recurring_tasks', err: error }, 'recurring obligations generation failed');
    generation.failed = 1;
  }
  let auditNotices: DailyJobsResult['auditNotices'] = 'skipped';
  if (o.mailer) {
    try {
      auditNotices = await notifyAuditRetention(o.db, {
        mailer: o.mailer,
        appUrl: o.appUrl ?? '',
        months: o.auditLogRetentionMonths ?? AUDIT_LOG_RETENTION_MONTHS_DEFAULT,
        now: at,
        log: o.log,
      });
    } catch (error) {
      o.log.error({ job: 'audit-retention', err: error }, 'audit retention notices failed');
      auditNotices = 'failed';
    }
  }
  let onboardingAccesses: DailyJobsResult['onboardingAccesses'] = 0;
  try {
    onboardingAccesses = await purgeOnboardingAccesses(o);
  } catch (error) {
    o.log.error({ job: 'onboarding-accesses', err: error }, 'onboarding accesses clean-up failed');
    onboardingAccesses = 'failed';
  }
  return { retention, competences, ...generation, auditNotices, onboardingAccesses };
}
