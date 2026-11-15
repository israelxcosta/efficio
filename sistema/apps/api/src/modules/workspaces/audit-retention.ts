// Retention of the audit trail (`audit_logs`: who did what, with IP and user agent). Records are kept
// `AUDIT_LOG_RETENTION_MONTHS` (default 24, minimum 6) and then deleted by the daily clean-up and by
// `db:migrate` (db/retention.ts). Before that, the members with the `members` permission are warned —
// in the system (GET /workspaces/current/audit/retention) and once per period by e-mail (daily job) —
// and may download the period as CSV (GET /workspaces/current/audit/export, audited as `audit.exported`).

import { and, asc, count, eq, isNotNull, lt, max, min, sql } from 'drizzle-orm';
import {
  AUDIT_RETENTION_NOTICE_DAYS,
  dateInTimeZone,
  effectivePermissions,
  monthKey,
  TASK_TIME_ZONE,
  type AuditRetentionResponse,
} from '@effinance/shared';
import type { DbExecutor } from '../../db/client';
import { auditLogs, users, workspaceMembers } from '../../db/schema';
import type { Mailer } from '../../lib/mailer';
import { ValidationError } from '../../lib/errors';

const DAY_MS = 86_400_000;
/** Marker of the e-mail warning (one per workspace and month of the records about to go). */
export const AUDIT_RETENTION_NOTICE_ACTION = 'audit.retention_notified';
const NOTICE_ENTITY = 'audit_retention';

/** `now` minus `months` calendar months (UTC). */
export function monthsBefore(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/** Records created before this instant are deleted by the clean-up. */
export function auditRetentionCutoff(now: Date, months: number): Date {
  return monthsBefore(now, months);
}

/** Records created before this instant are deleted within the notice window (the next 30 days). */
function noticeWindowEnd(now: Date, months: number): Date {
  return monthsBefore(new Date(now.getTime() + AUDIT_RETENTION_NOTICE_DAYS * DAY_MS), months);
}

const day = (instant: Date) => dateInTimeZone(instant, TASK_TIME_ZONE);

function pendingOf(
  row: { n: number; oldest: Date | null; newest: Date | null } | undefined,
  now: Date,
  months: number,
): AuditRetentionResponse['pending'] {
  if (!row || row.n === 0 || !row.oldest || !row.newest) return null;
  const today = day(now);
  const firstPurge = day(monthsBefore(row.oldest, -months));
  return { count: row.n, from: day(row.oldest), to: day(row.newest), purgeDate: firstPurge > today ? firstPurge : today };
}

/** GET /workspaces/current/audit/retention: what goes within the next 30 days, and when. */
export async function auditRetentionStatus(db: DbExecutor, workspaceId: string, months: number, now: Date = new Date()): Promise<AuditRetentionResponse> {
  const [row] = await db
    .select({ n: count(), oldest: min(auditLogs.createdAt), newest: max(auditLogs.createdAt) })
    .from(auditLogs)
    .where(and(eq(auditLogs.workspaceId, workspaceId), lt(auditLogs.createdAt, noticeWindowEnd(now, months))));
  return { retentionMonths: months, cutoff: day(auditRetentionCutoff(now, months)), pending: pendingOf(row, now, months) };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

const CSV_HEADER = ['Data e hora', 'Usuário', 'Ação', 'Entidade', 'ID da entidade', 'IP', 'Navegador', 'Detalhes'];
/** A cell a spreadsheet would read as a formula is prefixed with an apostrophe (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value: string | null | undefined): string {
  let v = value ?? '';
  if (FORMULA_START.test(v)) v = `'${v}`;
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const dateTimeFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TASK_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/**
 * GET /workspaces/current/audit/export: the workspace's records of the period (days in
 * America/Sao_Paulo, inclusive), oldest first, as CSV (UTF-8 with BOM, `;`, CRLF — opens in Excel
 * pt-BR). Without a period: the one about to be deleted.
 */
export async function exportAuditCsv(
  db: DbExecutor,
  workspaceId: string,
  months: number,
  query: { from?: string; to?: string },
  now: Date = new Date(),
): Promise<{ csv: string; from: string; to: string; count: number }> {
  let { from, to } = query;
  if (!from || !to) {
    const { pending } = await auditRetentionStatus(db, workspaceId, months, now);
    if (!from && !to && !pending) {
      throw new ValidationError('Nenhum registro será apagado nos próximos 30 dias: informe o período a baixar.');
    }
    from ??= pending?.from ?? to!;
    to ??= pending?.to ?? day(now);
    if (from > to) throw new ValidationError('O início deve ser antes do fim');
  }
  const rows = await db
    .select({ log: auditLogs, userName: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(
      and(
        eq(auditLogs.workspaceId, workspaceId),
        sql`${auditLogs.createdAt} >= (${from}::date)::timestamp at time zone ${TASK_TIME_ZONE}`,
        sql`${auditLogs.createdAt} < (${to}::date + 1)::timestamp at time zone ${TASK_TIME_ZONE}`,
      ),
    )
    .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id));
  const lines = [CSV_HEADER.join(';')];
  for (const { log, userName } of rows) {
    lines.push(
      [
        dateTimeFormat.format(log.createdAt),
        userName,
        log.action,
        log.entity,
        log.entityId,
        log.ip,
        log.userAgent,
        log.metadata ? JSON.stringify(log.metadata) : null,
      ]
        .map(csvCell)
        .join(';'),
    );
  }
  return { csv: `﻿${lines.join('\r\n')}\r\n`, from, to, count: rows.length };
}

// ---------------------------------------------------------------------------
// E-mail warning (daily job)
// ---------------------------------------------------------------------------

export interface AuditNoticeOptions {
  mailer: Mailer;
  appUrl: string;
  months: number;
  now?: Date;
  log?: { warn: (obj: object, msg: string) => void };
}

/** E-mails of the members who hold the `members` permission (the owner, by default). */
async function noticeRecipients(db: DbExecutor, workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ email: users.email, role: workspaceMembers.role, permissions: workspaceMembers.permissions })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId));
  return rows.filter((r) => effectivePermissions(r.role, r.permissions).members).map((r) => r.email);
}

const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * Warns by e-mail, once per workspace and month of the newest record about to go (marker: an audit
 * record `audit.retention_notified` with that month as `entity_id`), the members with the `members`
 * permission that records will be deleted within 30 days. The marker is written only after every
 * message went out, so a failed send is retried the next day. Returns the workspaces warned.
 */
export async function notifyAuditRetention(db: DbExecutor, o: AuditNoticeOptions): Promise<number> {
  const now = o.now ?? new Date();
  const pending = await db
    .select({ workspaceId: auditLogs.workspaceId, n: count(), oldest: min(auditLogs.createdAt), newest: max(auditLogs.createdAt) })
    .from(auditLogs)
    .where(and(isNotNull(auditLogs.workspaceId), lt(auditLogs.createdAt, noticeWindowEnd(now, o.months))))
    .groupBy(auditLogs.workspaceId);
  let warned = 0;
  for (const row of pending) {
    const workspaceId = row.workspaceId!;
    const period = pendingOf(row, now, o.months);
    if (!period) continue;
    const marker = monthKey(period.to);
    const [done] = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(and(eq(auditLogs.workspaceId, workspaceId), eq(auditLogs.entityId, marker), eq(auditLogs.action, AUDIT_RETENTION_NOTICE_ACTION)))
      .limit(1);
    if (done) continue;
    const recipients = await noticeRecipients(db, workspaceId);
    if (recipients.length === 0) continue;
    try {
      for (const to of recipients) {
        await o.mailer.send({
          to,
          subject: 'Registros de auditoria serão apagados em breve',
          text: [
            `${period.count} registro(s) de auditoria de ${brDate(period.from)} a ${brDate(period.to)} serão apagados a partir de ${brDate(period.purgeDate)}`,
            `(prazo de guarda de ${o.months} meses).`,
            '',
            `Para guardar uma cópia, baixe o arquivo em Configurações › Privacidade: ${o.appUrl}/configuracoes?aba=privacidade`,
          ].join('\n'),
        });
      }
    } catch (err) {
      o.log?.warn({ job: 'audit-retention', workspaceId, err }, 'audit retention notice not sent (retried tomorrow)');
      continue;
    }
    await db.insert(auditLogs).values({
      workspaceId,
      action: AUDIT_RETENTION_NOTICE_ACTION,
      entity: NOTICE_ENTITY,
      entityId: marker,
      metadata: { count: period.count, from: period.from, to: period.to, purgeDate: period.purgeDate, recipients: recipients.length },
    });
    warned++;
  }
  return warned;
}
