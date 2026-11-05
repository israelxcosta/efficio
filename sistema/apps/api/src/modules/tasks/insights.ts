// Reports, CSV export and the calendar of the task module, computed in SQL (GROUP BY) over tasks and
// recurring occurrences — one unit per task and per client of an occurrence, the same counting as the
// lists and the start page. On time = concluded on or before the due date (the legal deadline of an
// occurrence), by the day of the conclusion in the office time zone; canceled ones count apart.

import { and, asc, eq, gte, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import {
  addMonthKey,
  dateInTimeZone,
  diffInDays,
  formatDateBR,
  monthKey,
  TASK_KIND_LABELS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type MonthKey,
  type Task,
  type TaskBreakdownRow,
  type TaskCalendarResponse,
  type taskCalendarQuerySchema,
  type TaskKind,
  type TaskProductivityRow,
  type taskReportExportQuerySchema,
  type taskReportQuerySchema,
  type TaskReportResponse,
  type TaskReportRow,
  type TaskStatus,
} from '@effinance/shared';
import type { z } from 'zod';
import { contacts, taskCategories, tasks } from '../../db/schema';
import { ValidationError } from '../../lib/errors';
import type { TaskContext } from './access';
import { ensureOccurrences, generationBounds } from './generation';
import { csvCell } from './csv';
import { aggregateOccurrences } from './occurrences';
import { clientRef, departmentNames, departmentOfMember, memberRef, personRef } from './shared';
import {
  bucketSql,
  COMPLETED_DAY,
  NOT_OCCURRENCE_SQL,
  OCCURRENCE_SQL,
  OPEN_SQL,
  priorityRank,
  ROW_SQL,
  selectTasks,
  TASK_SERIES_SQL,
} from './task-rows';

type ReportQuery = z.output<typeof taskReportQuerySchema>;
type ExportQuery = z.output<typeof taskReportExportQuerySchema>;
type CalendarQuery = z.output<typeof taskCalendarQuerySchema>;

/** A report covers up to a year. */
export const MAX_REPORT_DAYS = 366;
/** Rows of a CSV export (refine the filters beyond it). */
export const MAX_EXPORT_ROWS = 10_000;
/** Tasks a calendar range returns (appointments and due tasks; occurrences are aggregated). */
export const MAX_CALENDAR_TASKS = 1000;

const count = (cond?: SQL) => (cond ? sql<number>`count(*) filter (where ${cond})` : sql<number>`count(*)`).mapWith(Number);
// Outer columns spelled out: Drizzle leaves them unqualified in a single-table select (pitfall #11).
const IN_FLOW = sql`exists (select 1 from task_flow_steps fs where fs.workspace_id = tasks.workspace_id and fs.task_id = tasks.id)`;
const CREATED_DAY = sql`(${tasks.createdAt} at time zone 'America/Sao_Paulo')::date`;
const KIND_SQL = sql<TaskKind>`case when ${tasks.recurringTaskId} is not null then 'recurring' when ${IN_FLOW} then 'flow' else 'standalone' end`;

function outcomes(today: string) {
  return {
    total: count(),
    doneOnTime: count(sql`${tasks.status} = 'done' and (${tasks.dueDate} is null or ${COMPLETED_DAY} <= ${tasks.dueDate})`),
    doneLate: count(sql`${tasks.status} = 'done' and ${tasks.dueDate} is not null and ${COMPLETED_DAY} > ${tasks.dueDate}`),
    canceled: count(sql`${tasks.status} = 'canceled'`),
    open: count(sql`${OPEN_SQL} and (${tasks.dueDate} is null or ${tasks.dueDate} >= ${today})`),
    overdue: count(sql`${OPEN_SQL} and ${tasks.dueDate} < ${today}`),
  };
}

type OutcomeRow = { total: number; doneOnTime: number; doneLate: number; canceled: number; open: number; overdue: number };

const toBreakdown = (key: string | null, label: string, r: OutcomeRow): TaskBreakdownRow => ({
  key,
  label,
  total: r.total,
  done: r.doneOnTime + r.doneLate,
  doneOnTime: r.doneOnTime,
  doneLate: r.doneLate,
  canceled: r.canceled,
  open: r.open,
  overdue: r.overdue,
});

const byTotal = (a: TaskBreakdownRow, b: TaskBreakdownRow) =>
  b.total - a.total || b.overdue - a.overdue || a.label.localeCompare(b.label, 'pt-BR');

/** Every filter of the report but the period. */
function filtersOf(ctx: TaskContext, q: ExportQuery): SQL[] {
  const out: SQL[] = [];
  if (q.departmentId) out.push(eq(tasks.departmentId, q.departmentId));
  if (q.assigneeId) out.push(q.assigneeId === 'none' ? isNull(tasks.assigneeId) : eq(tasks.assigneeId, q.assigneeId));
  if (q.categoryId) out.push(eq(tasks.categoryId, q.categoryId));
  if (q.clientId) out.push(q.clientId === 'internal' ? isNull(tasks.clientId) : eq(tasks.clientId, q.clientId));
  if (q.priority) out.push(eq(tasks.priority, q.priority));
  if (q.status) out.push(eq(tasks.status, q.status));
  if (q.kind === 'recurring') out.push(OCCURRENCE_SQL);
  if (q.kind === 'flow') out.push(NOT_OCCURRENCE_SQL, IN_FLOW);
  if (q.kind === 'standalone') out.push(NOT_OCCURRENCE_SQL, sql`not ${IN_FLOW}`);
  if (q.situation === 'open') out.push(OPEN_SQL);
  if (q.situation === 'done') out.push(eq(tasks.status, 'done'));
  if (q.situation === 'overdue') out.push(sql`${OPEN_SQL} and ${tasks.dueDate} < ${ctx.today}`);
  if (q.situation === 'doneOnTime')
    out.push(sql`${tasks.status} = 'done' and (${tasks.dueDate} is null or ${COMPLETED_DAY} <= ${tasks.dueDate})`);
  if (q.situation === 'doneLate')
    out.push(sql`${tasks.status} = 'done' and ${tasks.dueDate} is not null and ${COMPLETED_DAY} > ${tasks.dueDate}`);
  return out;
}

/** Due date (legal deadline) in the period; without a due date, created in it. */
const inPeriod = (q: ExportQuery) =>
  or(and(gte(tasks.dueDate, q.from), lte(tasks.dueDate, q.to)), and(isNull(tasks.dueDate), sql`${CREATED_DAY} between ${q.from} and ${q.to}`))!;

async function prepare(ctx: TaskContext, q: ExportQuery): Promise<SQL> {
  if (diffInDays(q.to, q.from) > MAX_REPORT_DAYS) throw new ValidationError('Escolha um período de até 1 ano.');
  if (q.kind !== 'standalone' && q.kind !== 'flow') {
    // Occurrences whose legal deadline falls in the period (postponed ones may cross into the next month).
    const { min, max } = generationBounds(ctx.today);
    const competences: MonthKey[] = [];
    for (let m = addMonthKey(monthKey(q.from), -1); m <= monthKey(q.to); m = addMonthKey(m, 1)) {
      if (m >= min && m <= max) competences.push(m);
    }
    await ensureOccurrences(ctx, competences);
  }
  return and(eq(tasks.workspaceId, ctx.workspaceId), inPeriod(q), ...filtersOf(ctx, q))!;
}

function toReportRow(task: Task): TaskReportRow {
  return {
    id: task.id,
    kind: task.kind,
    recurringTaskId: task.occurrence?.recurringTaskId ?? null,
    competence: task.occurrence?.competence ?? null,
    referenceMonth: task.occurrence?.referenceMonth ?? null,
    title: task.title,
    client: task.client,
    department: task.department,
    category: task.category,
    assignee: task.assignee,
    priority: task.priority,
    dueDate: task.dueDate,
    targetDate: task.occurrence?.targetDate ?? null,
    status: task.status,
    overdue: task.overdue,
    targetMissed: task.occurrence?.targetMissed ?? false,
    completedAt: task.completedAt,
    completedBy: task.completedBy,
    completedOnTime:
      task.status === 'done' && task.completedAt
        ? task.dueDate === null || dateInTimeZone(new Date(task.completedAt)) <= task.dueDate
        : null,
  };
}

const REPORT_ORDER = () => [sql`${tasks.dueDate} asc nulls last`, sql`lower(${tasks.title})`, sql`${priorityRank}`, sql`${tasks.id}`];

export async function taskReport(ctx: TaskContext, q: ReportQuery): Promise<TaskReportResponse> {
  const where = await prepare(ctx, q);
  const t = ctx.today;
  const o = outcomes(t);
  const [[summary], statusRows, priorityRows, departmentRows, assigneeRows, categoryRows, clientRows, kindRows, monthRows, productivityRows, items, departments] =
    await Promise.all([
      ctx.db
        .select({ ...o, targetMissed: count(sql`${OPEN_SQL} and ${bucketSql('targetMissed', t)}`) })
        .from(tasks)
        .where(where),
      ctx.db.select({ status: tasks.status, n: count() }).from(tasks).where(where).groupBy(tasks.status),
      ctx.db.select({ key: tasks.priority, ...o }).from(tasks).where(where).groupBy(tasks.priority),
      ctx.db.select({ key: tasks.departmentId, ...o }).from(tasks).where(where).groupBy(tasks.departmentId),
      ctx.db.select({ key: tasks.assigneeId, ...o }).from(tasks).where(where).groupBy(tasks.assigneeId),
      ctx.db
        .select({ key: tasks.categoryId, name: taskCategories.name, ...o })
        .from(tasks)
        .leftJoin(taskCategories, and(eq(taskCategories.workspaceId, tasks.workspaceId), eq(taskCategories.id, tasks.categoryId)))
        .where(where)
        .groupBy(tasks.categoryId, taskCategories.name),
      ctx.db
        .select({ key: tasks.clientId, name: contacts.name, tradeName: contacts.tradeName, ...o })
        .from(tasks)
        .leftJoin(contacts, and(eq(contacts.workspaceId, tasks.workspaceId), eq(contacts.id, tasks.clientId)))
        .where(where)
        .groupBy(tasks.clientId, contacts.name, contacts.tradeName),
      ctx.db.select({ key: KIND_SQL, ...o }).from(tasks).where(where).groupBy(KIND_SQL),
      ctx.db
        .select({ key: sql<string | null>`to_char(${tasks.dueDate}, 'YYYY-MM')`, ...o })
        .from(tasks)
        .where(where)
        .groupBy(sql`to_char(${tasks.dueDate}, 'YYYY-MM')`),
      // Productivity: conclusions in the period (by the day of the conclusion), per who concluded.
      ctx.db
        .select({
          id: tasks.completedBy,
          name: tasks.completedByName,
          concluded: count(),
          onTime: count(sql`${tasks.dueDate} is null or ${COMPLETED_DAY} <= ${tasks.dueDate}`),
          late: count(sql`${tasks.dueDate} is not null and ${COMPLETED_DAY} > ${tasks.dueDate}`),
          averageDays: sql<number | null>`round(avg(greatest(${COMPLETED_DAY} - ${CREATED_DAY}, 0)), 1)`.mapWith((v) => (v === null ? null : Number(v))),
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.workspaceId, ctx.workspaceId),
            // A range of `completed_at` (office days → instants) and `status = 'done'` as a literal: the
            // partial index `tasks_completed_idx` (migration 0018) serves it; a parameter would not match.
            sql`${tasks.status} = 'done'`,
            sql`${tasks.completedAt} >= ((${q.from}::date)::timestamp at time zone 'America/Sao_Paulo')`,
            sql`${tasks.completedAt} < (((${q.to}::date) + 1)::timestamp at time zone 'America/Sao_Paulo')`,
            ...filtersOf(ctx, { ...q, situation: undefined, status: undefined }),
          ),
        )
        .groupBy(tasks.completedBy, tasks.completedByName),
      selectTasks(ctx, { where, orderBy: REPORT_ORDER(), limit: q.pageSize, offset: (q.page - 1) * q.pageSize }),
      departmentNames(ctx.db, ctx.workspaceId),
    ]);
  const s = summary!;
  const byStatus = Object.fromEntries(TASK_STATUSES.map((st) => [st, 0])) as Record<TaskStatus, number>;
  for (const r of statusRows) byStatus[r.status] = r.n;
  const empty: OutcomeRow = { total: 0, doneOnTime: 0, doneLate: 0, canceled: 0, open: 0, overdue: 0 };
  return {
    from: q.from,
    to: q.to,
    today: t,
    summary: {
      total: s.total,
      done: s.doneOnTime + s.doneLate,
      doneOnTime: s.doneOnTime,
      doneLate: s.doneLate,
      canceled: s.canceled,
      open: s.open,
      overdue: s.overdue,
      targetMissed: s.targetMissed,
    },
    byStatus,
    byPriority: [...TASK_PRIORITIES]
      .reverse()
      .map((p) => toBreakdown(p, TASK_PRIORITY_LABELS[p], priorityRows.find((r) => r.key === p) ?? empty)),
    byDepartment: departmentRows
      .map((r) => toBreakdown(r.key, (r.key ? departments.get(r.key) : undefined) ?? 'Sem departamento', r))
      .sort(byTotal),
    byAssignee: assigneeRows.map((r) => toBreakdown(r.key, memberRef(ctx, r.key)?.name ?? 'Sem responsável', r)).sort(byTotal),
    byCategory: categoryRows.map((r) => toBreakdown(r.key, r.name ?? 'Sem categoria', r)).sort(byTotal),
    byClient: clientRows
      .map((r) => toBreakdown(r.key, clientRef({ id: r.key, name: r.name, tradeName: r.tradeName })?.name ?? 'Interna', r))
      .sort(byTotal),
    byKind: kindRows.map((r) => toBreakdown(r.key, TASK_KIND_LABELS[r.key], r)).sort(byTotal),
    byMonth: monthRows
      .map((r) => toBreakdown(r.key, r.key ?? 'Sem vencimento', r))
      .sort((a, b) => (a.key ?? '9999').localeCompare(b.key ?? '9999')),
    productivity: productivityRows
      .map(
        (r): TaskProductivityRow => ({
          member: r.name ? personRef(ctx, r.id, r.name) : null,
          concluded: r.concluded,
          onTime: r.onTime,
          late: r.late,
          averageDays: r.averageDays,
        }),
      )
      .sort((a, b) => b.concluded - a.concluded || (a.member?.name ?? '').localeCompare(b.member?.name ?? '', 'pt-BR')),
    items: { items: items.map(toReportRow), total: s.total, page: q.page, pageSize: q.pageSize },
  };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
  'Tarefa',
  'Tipo',
  'Competência',
  'Referência',
  'Cliente',
  'Departamento',
  'Categoria',
  'Responsável',
  'Prioridade',
  'Vencimento',
  'Meta',
  'Situação',
  'Concluída em',
  'No prazo',
  'Concluída por',
] as const;

const competenceLabel = (m: string | null) => (m ? `${m.slice(5, 7)}/${m.slice(0, 4)}` : '');

function concludedLabel(iso: string | null): string {
  if (!iso) return '';
  const instant = new Date(iso);
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(instant);
  return `${formatDateBR(dateInTimeZone(instant))} ${time}`;
}

/** The report's rows as CSV (`;`, UTF-8 with BOM, CRLF): the detail table of the screen. */
export async function exportTaskReport(ctx: TaskContext, q: ExportQuery): Promise<{ fileName: string; csv: string }> {
  const where = await prepare(ctx, q);
  const [total] = await ctx.db.select({ n: count() }).from(tasks).where(where);
  if ((total?.n ?? 0) > MAX_EXPORT_ROWS)
    throw new ValidationError(`A exportação vai até ${MAX_EXPORT_ROWS.toLocaleString('pt-BR')} linhas. Refine os filtros ou o período.`);
  const rows = (await selectTasks(ctx, { where, orderBy: REPORT_ORDER() })).map(toReportRow);
  const lines = [CSV_COLUMNS.join(';')];
  for (const r of rows) {
    const situation = r.overdue ? 'Atrasada' : r.targetMissed ? 'Fora da meta' : TASK_STATUS_LABELS[r.status];
    lines.push(
      [
        r.title,
        TASK_KIND_LABELS[r.kind],
        competenceLabel(r.competence),
        competenceLabel(r.referenceMonth),
        r.client?.name ?? 'Interna',
        r.department?.name ?? '',
        r.category?.name ?? '',
        r.assignee?.name ?? '',
        TASK_PRIORITY_LABELS[r.priority],
        r.dueDate ? formatDateBR(r.dueDate) : '',
        r.targetDate ? formatDateBR(r.targetDate) : '',
        situation,
        concludedLabel(r.completedAt),
        r.completedOnTime === null ? '' : r.completedOnTime ? 'Sim' : 'Não',
        r.completedBy?.name ?? '',
      ]
        .map(csvCell)
        .join(';'),
    );
  }
  return { fileName: `relatorio-tarefas-${ctx.today}.csv`, csv: `﻿${lines.join('\r\n')}\r\n` };
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

/**
 * Items by work date in a range (spec §7.6): standalone tasks, process steps and the occurrences of
 * tasks' recurrences by due date (appointments first within a day), occurrences of the registry
 * aggregated per recurring task and period on their target ("DCTFWeb · 12/30").
 */
export async function taskCalendar(ctx: TaskContext, q: CalendarQuery): Promise<TaskCalendarResponse> {
  const { min, max } = generationBounds(ctx.today);
  if (q.kind !== 'standalone' && q.kind !== 'flow') {
    const competences: MonthKey[] = [];
    for (let m = addMonthKey(monthKey(q.from), -1); m <= addMonthKey(monthKey(q.to), 1); m = addMonthKey(m, 1)) {
      if (m >= min && m <= max) competences.push(m);
    }
    await ensureOccurrences(ctx, competences);
  }
  const filters: SQL[] = [];
  if (q.scope === 'mine') filters.push(eq(tasks.assigneeId, ctx.userId));
  if (q.scope === 'department') {
    const own = await departmentOfMember(ctx.db, ctx.workspaceId, ctx.userId);
    filters.push(own ? eq(tasks.departmentId, own) : sql`false`);
  }
  if (q.assigneeId) filters.push(q.assigneeId === 'none' ? isNull(tasks.assigneeId) : eq(tasks.assigneeId, q.assigneeId));
  if (q.departmentId) filters.push(eq(tasks.departmentId, q.departmentId));
  if (q.clientId) filters.push(q.clientId === 'internal' ? isNull(tasks.clientId) : eq(tasks.clientId, q.clientId));
  if (q.categoryId) filters.push(eq(tasks.categoryId, q.categoryId));
  // Tasks: standalone ones, process steps and tasks' recurrences (by due date, one by one); occurrences
  // of the registry are aggregated on their target.
  const taskKind =
    q.kind === 'recurring'
      ? TASK_SERIES_SQL
      : q.kind === 'flow'
        ? and(NOT_OCCURRENCE_SQL, IN_FLOW)
        : q.kind === 'standalone'
          ? and(NOT_OCCURRENCE_SQL, sql`not ${IN_FLOW}`)
          : ROW_SQL;
  const wantsOccurrences = q.kind !== 'standalone' && q.kind !== 'flow';
  const [list, occurrences, [noDue]] = await Promise.all([
    selectTasks(ctx, {
      where: and(taskKind, gte(tasks.dueDate, q.from), lte(tasks.dueDate, q.to), ...filters),
      orderBy: [asc(tasks.dueDate), sql`${tasks.startTime} asc nulls last`, sql`${priorityRank}`, sql`lower(${tasks.title})`, sql`${tasks.id}`],
      limit: MAX_CALENDAR_TASKS + 1,
    }),
    wantsOccurrences
      ? aggregateOccurrences(ctx, and(gte(tasks.targetDate, q.from), lte(tasks.targetDate, q.to), ...filters))
      : Promise.resolve([]),
    // Every occurrence has a due date: only standalone tasks and process steps lack one.
    q.kind === 'recurring'
      ? Promise.resolve([{ n: 0 }])
      : ctx.db
          .select({ n: count() })
          .from(tasks)
          .where(and(eq(tasks.workspaceId, ctx.workspaceId), NOT_OCCURRENCE_SQL, taskKind, OPEN_SQL, isNull(tasks.dueDate), ...filters)),
  ]);
  return {
    from: q.from,
    to: q.to,
    today: ctx.today,
    tasks: list.slice(0, MAX_CALENDAR_TASKS),
    occurrences,
    noDueDate: noDue?.n ?? 0,
    truncated: list.length > MAX_CALENDAR_TASKS,
  };
}
