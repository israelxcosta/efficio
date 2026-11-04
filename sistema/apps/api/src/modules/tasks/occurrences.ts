// Recurring occurrences aggregated per recurring task and period (the list row "DCTFWeb · 12 de 30
// clientes pendentes", the board card, the calendar item, the audit column and the start page's
// obligations), counted in SQL over the occurrence rows that match the caller's filters (so "Minhas"
// counts only the occurrences whose responsible is you). Internal to the module.

import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import {
  dateInTimeZone,
  daysOverdue,
  isTargetMissed,
  isTaskOverdue,
  occurrenceSituationOf,
  occurrenceStatusOf,
  TASK_TIME_ZONE,
  type AssigneeSource,
  type OccurrenceAssigneeCount,
  type OccurrenceCell,
  type OccurrenceClient,
  type RecurringOccurrence,
  type TaskCategoryRef,
  type TaskStatus,
} from '@effinance/shared';
import { contacts, recurringTasks, taskCategories, tasks } from '../../db/schema';
import { appendTo } from '../../lib/collections';
import { inChunks } from '../../lib/sql';
import type { TaskContext } from './access';
import { clientDisplayName, departmentNames, memberRef, personRef } from './shared';
import { COMPLETED_DAY, OCCURRENCE_SQL, OPEN_SQL } from './task-rows';

const count = (cond?: SQL) =>
  (cond ? sql<number>`count(*) filter (where ${cond})` : sql<number>`count(*)`).mapWith(Number);

/** Most groups any single response carries (lists, calendar, audit columns). */
export const MAX_OCCURRENCE_GROUPS = 200;

/**
 * Groups of occurrences matching `where` (besides the workspace), ordered by target then name. The
 * deadlines of a group are those of its open occurrences (a concluded one keeps the deadline it had).
 */
export async function aggregateOccurrences(
  ctx: Pick<TaskContext, 'db' | 'workspaceId' | 'members' | 'today'>,
  where: SQL | undefined,
  opts: { limit?: number } = {},
): Promise<RecurringOccurrence[]> {
  const t = ctx.today;
  const base = and(eq(tasks.workspaceId, ctx.workspaceId), OCCURRENCE_SQL, where);
  const legal = sql<string>`coalesce(min(${tasks.dueDate}) filter (where ${OPEN_SQL}), min(${tasks.dueDate}))::text`;
  const target = sql<string>`coalesce(min(${tasks.targetDate}) filter (where ${OPEN_SQL}), min(${tasks.targetDate}))::text`;
  const groups = await ctx.db
    .select({
      recurringTaskId: tasks.recurringTaskId,
      periodKey: tasks.periodKey,
      competence: sql<string>`min(${tasks.competence})`,
      referenceMonth: sql<string>`min(${tasks.referenceMonth})`,
      legal,
      target,
      total: count(),
      done: count(sql`${tasks.status} = 'done'`),
      doneLate: count(sql`${tasks.status} = 'done' and ${COMPLETED_DAY} > ${tasks.dueDate}`),
      canceled: count(sql`${tasks.status} = 'canceled'`),
      inProgress: count(sql`${tasks.status} in ('in_progress', 'waiting_client')`),
      pending: count(OPEN_SQL),
      overduePending: count(sql`${OPEN_SQL} and ${tasks.dueDate} < ${t}`),
      targetMissedPending: count(sql`${OPEN_SQL} and ${tasks.targetDate} < ${t} and ${tasks.dueDate} >= ${t}`),
    })
    .from(tasks)
    .where(base)
    .groupBy(tasks.recurringTaskId, tasks.periodKey)
    .orderBy(sql`${target} asc`, asc(tasks.periodKey), asc(tasks.recurringTaskId))
    .limit(opts.limit ?? MAX_OCCURRENCE_GROUPS);
  if (groups.length === 0) return [];

  const defIds = [...new Set(groups.map((g) => g.recurringTaskId!))];
  const [defs, departments, assignees] = await Promise.all([
    ctx.db
      .select({
        id: recurringTasks.id,
        name: recurringTasks.name,
        period: recurringTasks.period,
        departmentId: recurringTasks.departmentId,
        defaultAssigneeId: recurringTasks.defaultAssigneeId,
        categoryId: taskCategories.id,
        categoryName: taskCategories.name,
        categoryIcon: taskCategories.icon,
        categoryColor: taskCategories.color,
      })
      .from(recurringTasks)
      .leftJoin(
        taskCategories,
        and(eq(taskCategories.workspaceId, recurringTasks.workspaceId), eq(taskCategories.id, recurringTasks.categoryId)),
      )
      .where(and(eq(recurringTasks.workspaceId, ctx.workspaceId), inArray(recurringTasks.id, defIds))),
    departmentNames(ctx.db, ctx.workspaceId),
    ctx.db
      .select({ recurringTaskId: tasks.recurringTaskId, periodKey: tasks.periodKey, assigneeId: tasks.assigneeId, n: count() })
      .from(tasks)
      .where(and(base, inArray(tasks.recurringTaskId, defIds)))
      .groupBy(tasks.recurringTaskId, tasks.periodKey, tasks.assigneeId),
  ]);
  const defById = new Map(defs.map((d) => [d.id, d]));
  const people = new Map<string, OccurrenceAssigneeCount[]>();
  for (const a of assignees) {
    const key = `${a.recurringTaskId}:${a.periodKey}`;
    appendTo(people, key, { assignee: memberRef(ctx, a.assigneeId), count: a.n });
  }

  return groups.flatMap((g) => {
    const def = defById.get(g.recurringTaskId!);
    if (!def) return [];
    const category: TaskCategoryRef | null =
      def.categoryId && def.categoryName ? { id: def.categoryId, name: def.categoryName, icon: def.categoryIcon!, color: def.categoryColor! } : null;
    const overdue = g.overduePending > 0;
    const departmentName = def.departmentId ? departments.get(def.departmentId) : undefined;
    return [
      {
        recurringTaskId: def.id,
        name: def.name,
        period: def.period,
        periodKey: g.periodKey!,
        competence: g.competence,
        referenceMonth: g.referenceMonth,
        legalDueDate: g.legal,
        targetDate: g.target,
        department: def.departmentId && departmentName ? { id: def.departmentId, name: departmentName } : null,
        category,
        defaultAssignee: memberRef(ctx, def.defaultAssigneeId),
        assignees: (people.get(`${g.recurringTaskId}:${g.periodKey}`) ?? []).sort(
          (a, b) => b.count - a.count || (a.assignee?.name ?? '~').localeCompare(b.assignee?.name ?? '~', 'pt-BR'),
        ),
        total: g.total,
        done: g.done,
        doneLate: g.doneLate,
        canceled: g.canceled,
        inProgress: g.inProgress,
        pending: g.pending,
        overdue,
        daysOverdue: overdue ? daysOverdue(g.legal, ctx.today) : 0,
        targetMissed: !overdue && g.targetMissedPending > 0,
        status: occurrenceStatusOf(g),
      },
    ];
  });
}

/** Pending first (overdue, then past the target), then by target, complete ones last. */
export function byUrgency(a: RecurringOccurrence, b: RecurringOccurrence): number {
  const rank = (o: RecurringOccurrence) => (o.pending === 0 ? 3 : o.overdue ? 0 : o.targetMissed ? 1 : 2);
  return rank(a) - rank(b) || a.targetDate.localeCompare(b.targetDate) || a.name.localeCompare(b.name, 'pt-BR');
}

// ---------------------------------------------------------------------------
// Cells (one occurrence: client × recurring task × period)
// ---------------------------------------------------------------------------

export interface CellRow {
  id: string;
  recurringTaskId: string | null;
  clientId: string | null;
  periodKey: string | null;
  competence: string | null;
  status: TaskStatus;
  assigneeId: string | null;
  assigneeSource: AssigneeSource | null;
  dueDate: string | null;
  targetDate: string | null;
  completedAt: Date | null;
  completedBy: string | null;
  completedByName: string | null;
}

/** Columns a cell needs (no description: cells never carry it). */
export const CELL_COLUMNS = {
  id: tasks.id,
  recurringTaskId: tasks.recurringTaskId,
  clientId: tasks.clientId,
  periodKey: tasks.periodKey,
  competence: tasks.competence,
  status: tasks.status,
  assigneeId: tasks.assigneeId,
  assigneeSource: tasks.assigneeSource,
  dueDate: tasks.dueDate,
  targetDate: tasks.targetDate,
  completedAt: tasks.completedAt,
  completedBy: tasks.completedBy,
  completedByName: tasks.completedByName,
};

/**
 * Only who concluded an occurrence, or whoever may reopen others' conclusions (`reopenOthers`; by
 * default the administrators), may reopen it (it is an audit record).
 */
export function canReopenOccurrence(ctx: Pick<TaskContext, 'permissions' | 'userId'>, row: Pick<CellRow, 'status' | 'completedBy'>): boolean {
  return row.status === 'done' && (ctx.permissions.reopenOthers || row.completedBy === ctx.userId);
}

export function toOccurrenceCell(ctx: Pick<TaskContext, 'members' | 'today' | 'permissions' | 'userId'>, row: CellRow): OccurrenceCell {
  const legal = row.dueDate!;
  const target = row.targetDate!;
  const done = row.status === 'done' && row.completedAt !== null;
  return {
    taskId: row.id,
    recurringTaskId: row.recurringTaskId!,
    clientId: row.clientId!,
    periodKey: row.periodKey!,
    competence: row.competence!,
    status: row.status,
    situation: occurrenceSituationOf({ status: row.status, dueDate: legal, targetDate: target, completedAt: row.completedAt }, ctx.today),
    assignee: memberRef(ctx, row.assigneeId),
    assigneeSource: row.assigneeId ? row.assigneeSource : null,
    legalDueDate: legal,
    targetDate: target,
    overdue: isTaskOverdue({ status: row.status, dueDate: legal }, ctx.today),
    targetMissed: isTargetMissed({ status: row.status, dueDate: legal, targetDate: target }, ctx.today),
    concludedBy: done ? personRef(ctx, row.completedBy, row.completedByName) : null,
    concludedAt: done ? row.completedAt!.toISOString() : null,
    concludedOnTime: done ? dateInTimeZone(row.completedAt!, TASK_TIME_ZONE) <= legal : null,
    canReopen: canReopenOccurrence(ctx, row),
  };
}

/** Clients of the cells, with the CNPJ decrypted (the audit shows it under the name). */
export async function occurrenceClients(
  ctx: Pick<TaskContext, 'db' | 'workspaceId' | 'cipher'>,
  ids: readonly string[],
): Promise<Map<string, OccurrenceClient>> {
  const out = new Map<string, OccurrenceClient>();
  for (const chunk of inChunks([...new Set(ids)])) {
    const rows = await ctx.db
      .select({ id: contacts.id, name: contacts.name, tradeName: contacts.tradeName, document: contacts.document, taxRegime: contacts.taxRegime })
      .from(contacts)
      .where(and(eq(contacts.workspaceId, ctx.workspaceId), eq(contacts.kind, 'client'), inArray(contacts.id, chunk)));
    for (const r of rows) {
      out.set(r.id, {
        id: r.id,
        name: clientDisplayName(r),
        legalName: r.name,
        document: (await ctx.cipher.decrypt('contacts', 'document', r.document)) ?? '',
        taxRegime: r.taxRegime ?? 'other',
      });
    }
  }
  return out;
}
