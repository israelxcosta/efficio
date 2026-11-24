// Loading tasks as the API shows them (row, card, widgets): joins for the names shown with every row
// (client, department, category, the process step, the recurring task of an occurrence) and correlated
// counts (subtasks, comments, attachments). Shared by the task services.

import { and, eq, getTableColumns, isNull, lt, sql, type SQL } from 'drizzle-orm';
import {
  addDays,
  daysOverdue,
  isTargetMissed,
  isTaskOverdue,
  monthRange,
  occurrenceSituationOf,
  type ISODate,
  type Task,
  type TaskDueBucket,
  type TaskKind,
  type TaskOverdueRef,
} from '@effinance/shared';
import { contacts, recurringTasks, taskCategories, taskDepartments, taskFlowSteps, taskFlows, tasks } from '../../db/schema';
import type { TaskContext } from './access';
import { clientRef, memberRef, personRef } from './shared';

/** `case` rank of the priority (urgent first). */
export const priorityRank = sql`case ${tasks.priority} when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`;

export const OPEN_SQL = sql`${tasks.status} in ('todo', 'in_progress', 'waiting_client')`;
export const CLOSED_SQL = sql`${tasks.status} in ('done', 'canceled')`;
/** Rows that are recurring occurrences, of the registry or of a task's recurrence (`kind: 'recurring'`). */
export const OCCURRENCE_SQL = sql`${tasks.recurringTaskId} is not null`;
export const NOT_OCCURRENCE_SQL = sql`${tasks.recurringTaskId} is null`;
/**
 * Occurrences of the registry ("Recorrentes", one per client and period): aggregated per recurring task
 * and period in lists, audited, the "obligations" blocks. Migration 0019.
 */
export const AGGREGATED_SQL = sql`${tasks.recurringTaskId} is not null and ${tasks.occurrenceOrigin} = 'registry'`;
/** Rows listed one by one: standalone tasks, process steps and the occurrences of tasks' recurrences. */
export const ROW_SQL = sql`(${tasks.recurringTaskId} is null or ${tasks.occurrenceOrigin} = 'task')`;
/** Occurrences of tasks' recurrences (their client, or internal). */
export const TASK_SERIES_SQL = sql`${tasks.occurrenceOrigin} = 'task'`;
/** Work date: the target of an occurrence, the due date of anything else. */
export const WORK_DATE = sql`coalesce(${tasks.targetDate}, ${tasks.dueDate})`;

/**
 * Lists without a date filter: an open occurrence of a task's recurrence shows when its work date is
 * within the next 7 days (overdue included) or it is the next open one of its series, so a daily
 * recurrence does not fill the list with the coming months. Everything else passes.
 */
export function visibleSeriesSql(today: ISODate): SQL {
  const week = addDays(today, 7);
  // Outer columns spelled out: Drizzle leaves them unqualified in a single-table select (pitfall #11).
  return sql`(${tasks.occurrenceOrigin} is distinct from 'task' or not (${OPEN_SQL}) or ${WORK_DATE} <= ${week} or not exists (select 1 from tasks n where n.workspace_id = tasks.workspace_id and n.recurring_task_id = tasks.recurring_task_id and n.status in ('todo', 'in_progress', 'waiting_client') and (n.due_date, n.id) < (tasks.due_date, tasks.id)))`;
}
/** Calendar day of the conclusion in the office time zone (on time = on or before the due date). */
export const COMPLETED_DAY = sql`(${tasks.completedAt} at time zone 'America/Sao_Paulo')::date`;

/**
 * Columns of a task row as lists show it: everything but the description, which only the detail reads
 * (and decrypts) — no list carries up to a page of ciphertexts it never uses.
 */
const { description: _description, ...TASK_ROW_COLUMNS } = getTableColumns(tasks);

function rowQuery(ctx: Pick<TaskContext, 'db' | 'workspaceId'>) {
  return ctx.db
    .select({
      task: TASK_ROW_COLUMNS,
      clientName: contacts.name,
      clientTradeName: contacts.tradeName,
      departmentName: taskDepartments.name,
      categoryName: taskCategories.name,
      categoryIcon: taskCategories.icon,
      categoryColor: taskCategories.color,
      recurringPeriod: recurringTasks.period,
      flowId: taskFlows.id,
      flowTitle: taskFlows.title,
      flowPosition: taskFlowSteps.position,
      flowStepCount:
        sql<number>`(select count(*) from task_flow_steps fs where fs.workspace_id = ${tasks.workspaceId} and fs.flow_id = ${taskFlowSteps.flowId})`.mapWith(
          Number,
        ),
      subtaskTotal:
        sql<number>`(select count(*) from task_subtasks st where st.workspace_id = ${tasks.workspaceId} and st.task_id = ${tasks.id})`.mapWith(
          Number,
        ),
      subtaskDone:
        sql<number>`(select count(*) from task_subtasks st where st.workspace_id = ${tasks.workspaceId} and st.task_id = ${tasks.id} and st.done)`.mapWith(
          Number,
        ),
      commentCount:
        sql<number>`(select count(*) from task_comments tc where tc.workspace_id = ${tasks.workspaceId} and tc.task_id = ${tasks.id})`.mapWith(
          Number,
        ),
      attachmentCount:
        sql<number>`(select count(*) from task_attachments ta where ta.workspace_id = ${tasks.workspaceId} and ta.task_id = ${tasks.id})`.mapWith(
          Number,
        ),
    })
    .from(tasks)
    .leftJoin(
      contacts,
      and(eq(contacts.workspaceId, tasks.workspaceId), eq(contacts.id, tasks.clientId)),
    )
    .leftJoin(
      taskDepartments,
      and(
        eq(taskDepartments.workspaceId, tasks.workspaceId),
        eq(taskDepartments.id, tasks.departmentId),
      ),
    )
    .leftJoin(
      taskCategories,
      and(
        eq(taskCategories.workspaceId, tasks.workspaceId),
        eq(taskCategories.id, tasks.categoryId),
      ),
    )
    .leftJoin(
      recurringTasks,
      and(eq(recurringTasks.workspaceId, tasks.workspaceId), eq(recurringTasks.id, tasks.recurringTaskId)),
    )
    .leftJoin(
      taskFlowSteps,
      and(eq(taskFlowSteps.workspaceId, tasks.workspaceId), eq(taskFlowSteps.taskId, tasks.id)),
    )
    .leftJoin(
      taskFlows,
      and(eq(taskFlows.workspaceId, taskFlowSteps.workspaceId), eq(taskFlows.id, taskFlowSteps.flowId)),
    );
}

export type TaskQueryRow = Awaited<ReturnType<typeof rowQuery>>[number];

export function kindOf(row: { recurringTaskId: string | null }, inFlow: boolean): TaskKind {
  if (row.recurringTaskId) return 'recurring';
  return inFlow ? 'flow' : 'standalone';
}

export function toTask(ctx: Pick<TaskContext, 'members' | 'today'>, row: TaskQueryRow): Task {
  const t = row.task;
  const overdue = isTaskOverdue(t, ctx.today);
  return {
    id: t.id,
    title: t.title,
    kind: kindOf(t, row.flowId !== null),
    status: t.status,
    reopenStatus: t.reopenStatus ?? 'todo',
    priority: t.priority,
    requestChannel: t.requestChannel ?? null,
    client: clientRef({ id: t.clientId, name: row.clientName, tradeName: row.clientTradeName }),
    department: { id: t.departmentId, name: row.departmentName ?? 'Departamento' },
    category:
      t.categoryId && row.categoryName
        ? {
            id: t.categoryId,
            name: row.categoryName,
            icon: row.categoryIcon!,
            color: row.categoryColor!,
          }
        : null,
    assignee: memberRef(ctx, t.assigneeId),
    startDate: t.startDate,
    dueDate: t.dueDate,
    startTime: t.startTime,
    endTime: t.endTime,
    overdue,
    daysOverdue: overdue ? daysOverdue(t.dueDate, ctx.today) : 0,
    completedAt: t.completedAt?.toISOString() ?? null,
    completedBy: t.completedAt ? personRef(ctx, t.completedBy, t.completedByName) : null,
    subtaskCount: { done: row.subtaskDone, total: row.subtaskTotal },
    commentCount: row.commentCount,
    attachmentCount: row.attachmentCount,
    flow:
      row.flowId && row.flowTitle && row.flowPosition !== null
        ? { id: row.flowId, title: row.flowTitle, position: row.flowPosition, stepCount: row.flowStepCount }
        : null,
    occurrence:
      t.recurringTaskId && t.competence && t.periodKey && t.referenceMonth && t.targetDate
        ? {
            recurringTaskId: t.recurringTaskId,
            origin: t.occurrenceOrigin ?? 'registry',
            period: row.recurringPeriod ?? 'monthly',
            periodKey: t.periodKey,
            competence: t.competence,
            referenceMonth: t.referenceMonth,
            targetDate: t.targetDate,
            targetMissed: isTargetMissed(t, ctx.today),
            assigneeSource: t.assigneeId ? t.assigneeSource : null,
            situation: occurrenceSituationOf(t, ctx.today),
          }
        : null,
    createdBy: personRef(ctx, t.createdBy, t.createdByName),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export interface TaskPage {
  where?: SQL;
  orderBy?: SQL[];
  limit?: number;
  offset?: number;
}

/** Tasks of the workspace matching `where`, already shaped. */
export async function selectTasks(
  ctx: Pick<TaskContext, 'db' | 'workspaceId' | 'members' | 'today'>,
  page: TaskPage = {},
): Promise<Task[]> {
  let query = rowQuery(ctx)
    .where(and(eq(tasks.workspaceId, ctx.workspaceId), page.where))
    .orderBy(...(page.orderBy ?? defaultOrder()))
    .$dynamic();
  if (page.limit !== undefined) query = query.limit(page.limit);
  if (page.offset) query = query.offset(page.offset);
  return (await query).map((row) => toTask(ctx, row));
}

/** Work date first (due date; target of occurrences; none last), then priority (urgent first), then title. */
export function defaultOrder(): SQL[] {
  return [
    sql`${WORK_DATE} asc nulls last`,
    sql`${priorityRank}`,
    sql`lower(${tasks.title})`,
    sql`${tasks.id}`,
  ];
}

export async function selectTask(
  ctx: Pick<TaskContext, 'db' | 'workspaceId' | 'members' | 'today'>,
  id: string,
): Promise<Task | null> {
  const [task] = await selectTasks(ctx, { where: eq(tasks.id, id), limit: 1 });
  return task ?? null;
}

/** Open items by the work date (target of occurrences): legal deadline first, then the target. */
export function bucketSql(bucket: TaskDueBucket, today: ISODate): SQL {
  const week = addDays(today, 7);
  const notOverdue = sql`${tasks.dueDate} >= ${today}`;
  switch (bucket) {
    case 'overdue':
      return lt(tasks.dueDate, today);
    case 'targetMissed':
      return sql`${tasks.targetDate} < ${today} and ${notOverdue}`;
    case 'today':
      return sql`${WORK_DATE} = ${today} and ${notOverdue}`;
    case 'next7Days':
      return sql`${WORK_DATE} > ${today} and ${WORK_DATE} <= ${week}`;
    case 'later':
      return sql`${WORK_DATE} > ${week}`;
    case 'noDueDate':
      return isNull(tasks.dueDate);
  }
}


export function overdueRef(task: Task, today: ISODate): TaskOverdueRef {
  return {
    kind: task.kind,
    id: task.id,
    recurringTaskId: task.occurrence?.recurringTaskId ?? null,
    periodKey: task.occurrence?.periodKey ?? null,
    title: task.title,
    dueDate: task.dueDate!,
    daysOverdue: daysOverdue(task.dueDate, today),
    client: task.client,
    assignee: task.assignee,
  };
}


/**
 * A task's situation on a reference day `r` (the last day of a past competence on the start page and
 * the dashboard; today otherwise): open then = not closed by `r` (still open, or closed after it);
 * done/canceled = closed by `r`. With `r` = today these are exactly OPEN_SQL / done / canceled. The
 * creation date is not a filter on purpose: work registered late (an import, a forgotten task) still
 * belongs to the month it was due. A canceled task's day is its last update (no cancel timestamp).
 */
export function asOfSql(r: ISODate, past = true) {
  // The current competence keeps the plain "now" rules (nothing can be closed after today).
  if (!past) {
    const done = sql`(${tasks.status} = 'done')`;
    const canceled = sql`(${tasks.status} = 'canceled')`;
    return { open: sql`(${OPEN_SQL})`, done, canceled, closed: sql`(${CLOSED_SQL})`, overdue: sql`(${OPEN_SQL} and ${tasks.dueDate} < ${r})` };
  }
  const closedDay = sql`(coalesce(${tasks.completedAt}, ${tasks.updatedAt}) at time zone 'America/Sao_Paulo')::date`;
  const open = sql`(${OPEN_SQL} or (${CLOSED_SQL} and ${closedDay} > ${r}))`;
  const done = sql`(${tasks.status} = 'done' and ${COMPLETED_DAY} <= ${r})`;
  const canceled = sql`(${tasks.status} = 'canceled' and ${closedDay} <= ${r})`;
  return { open, done, canceled, closed: sql`(${done} or ${canceled})`, overdue: sql`(${open} and ${tasks.dueDate} < ${r})` };
}

/** Reference day of a competence: its last day when it is over, today otherwise. */
export function referenceDay(month: string, today: ISODate): ISODate {
  const end = monthRange(month).to;
  return end < today ? end : today;
}
