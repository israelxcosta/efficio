// Loading tasks as the API shows them (row, card, widgets): joins for the names shown with every row
// and correlated counts (subtasks, comments). Shared by the task services.

import { and, eq, sql, type SQL } from 'drizzle-orm';
import { daysOverdue, isTaskOverdue, type Task } from '@effinance/shared';
import { contacts, taskCategories, taskDepartments, tasks } from '../../db/schema';
import type { TaskContext } from './access';
import { clientRef, memberRef, personRef } from './shared';

/** `case` rank of the priority (urgent first). */
export const priorityRank = sql`case ${tasks.priority} when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`;

export const OPEN_SQL = sql`${tasks.status} in ('todo', 'in_progress', 'waiting_client')`;
export const CLOSED_SQL = sql`${tasks.status} in ('done', 'canceled')`;

function rowQuery(ctx: Pick<TaskContext, 'db' | 'workspaceId'>) {
  return ctx.db
    .select({
      task: tasks,
      clientName: contacts.name,
      clientTradeName: contacts.tradeName,
      departmentName: taskDepartments.name,
      categoryName: taskCategories.name,
      categoryIcon: taskCategories.icon,
      categoryColor: taskCategories.color,
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
    );
}

export type TaskQueryRow = Awaited<ReturnType<typeof rowQuery>>[number];

export function toTask(ctx: Pick<TaskContext, 'members' | 'today'>, row: TaskQueryRow): Task {
  const t = row.task;
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    reopenStatus: t.reopenStatus ?? 'todo',
    priority: t.priority,
    client: clientRef({ id: t.clientId, name: row.clientName, tradeName: row.clientTradeName }),
    department:
      t.departmentId && row.departmentName
        ? { id: t.departmentId, name: row.departmentName }
        : null,
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
    overdue: isTaskOverdue(t, ctx.today),
    daysOverdue: isTaskOverdue(t, ctx.today) ? daysOverdue(t.dueDate, ctx.today) : 0,
    completedAt: t.completedAt?.toISOString() ?? null,
    completedBy: t.completedAt ? personRef(ctx, t.completedBy, t.completedByName) : null,
    subtaskCount: { done: row.subtaskDone, total: row.subtaskTotal },
    commentCount: row.commentCount,
    // Flows come in a later phase.
    flow: null,
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

/** Due date first (no due date last), then priority (urgent first), then title. */
export function defaultOrder(): SQL[] {
  return [
    sql`${tasks.dueDate} asc nulls last`,
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
