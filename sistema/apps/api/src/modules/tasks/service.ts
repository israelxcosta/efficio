// Tasks (Effy's "solicitações"): CRUD, the list with its summary, the status change (conclude,
// reopen, move on the board, undo), subtasks, comments and the recent activity.
//
// Rules ported from Effy's task.service:
// - the department is derived from the assignee (an unassigned task may sit in a department's queue);
// - concluding records who/when on the server, only on the transition to `done`; leaving `done`
//   clears both; "Atrasada" is derived (open + due date before today), never stored;
// - every member works on tasks; deleting one is for administrators.
// Phase 1: recurring occurrences and flows come later (the list returns `occurrences: []` and
// `flow: null` until then).

import { and, asc, desc, eq, gte, ilike, isNull, lt, lte, sql, type SQL } from 'drizzle-orm';
import {
  addDays,
  daysOverdue,
  monthKey,
  monthRange,
  TASK_DUE_BUCKETS,
  TASK_STATUSES,
  type ISODate,
  type MonthKey,
  type Task,
  type TaskActivityItem,
  type TaskComment,
  type taskCommentInputSchema,
  type TaskDetail,
  type TaskDueBucket,
  type taskInputSchema,
  type TaskListResponse,
  type TaskListSummary,
  type TaskMemberRef,
  type taskQuerySchema,
  type TaskStatus,
  type TaskStatusChangeResponse,
  type TaskStatusCount,
  type TaskSubtask,
  type subtaskInputSchema,
  type subtaskUpdateSchema,
  type taskUpdateSchema,
} from '@effinance/shared';
import type { z } from 'zod';
import { contacts, taskComments, taskSubtasks, tasks, type TaskRow } from '../../db/schema';
import { now } from '../../lib/clock';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { likePattern } from '../../lib/sql';
import type { TaskContext } from './access';
import {
  assertMember,
  clientRef,
  departmentOfMember,
  getTaskCategoryOrThrow,
  getTaskClientOrThrow,
  memberRef,
  myName,
  personRef,
  resolveTaskDepartment,
} from './shared';
import {
  CLOSED_SQL,
  defaultOrder,
  OPEN_SQL,
  priorityRank,
  selectTask,
  selectTasks,
} from './task-rows';

type TaskInput = z.output<typeof taskInputSchema>;
type TaskPatch = z.output<typeof taskUpdateSchema>;
type TaskQuery = z.output<typeof taskQuerySchema>;
type SubtaskInput = z.output<typeof subtaskInputSchema>;
type SubtaskPatch = z.output<typeof subtaskUpdateSchema>;
type CommentInput = z.output<typeof taskCommentInputSchema>;

const OPEN_STATUSES: readonly TaskStatus[] = ['todo', 'in_progress', 'waiting_client'];
const isOpen = (s: TaskStatus) => OPEN_STATUSES.includes(s);

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export async function getTaskRowOrThrow(
  ctx: Pick<TaskContext, 'db' | 'workspaceId'>,
  id: string,
): Promise<TaskRow> {
  const [row] = await ctx.db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.workspaceId, ctx.workspaceId)));
  if (!row) throw new NotFoundError('Tarefa não encontrada');
  return row;
}

export async function getTaskDetail(ctx: TaskContext, id: string): Promise<TaskDetail> {
  const task = await selectTask(ctx, id);
  if (!task) throw new NotFoundError('Tarefa não encontrada');
  const [row] = await ctx.db
    .select({ description: tasks.description })
    .from(tasks)
    .where(eq(tasks.id, id));
  const [subtasks, comments] = await Promise.all([
    ctx.db
      .select()
      .from(taskSubtasks)
      .where(and(eq(taskSubtasks.workspaceId, ctx.workspaceId), eq(taskSubtasks.taskId, id)))
      .orderBy(asc(taskSubtasks.createdAt), asc(taskSubtasks.id)),
    ctx.db
      .select()
      .from(taskComments)
      .where(and(eq(taskComments.workspaceId, ctx.workspaceId), eq(taskComments.taskId, id)))
      .orderBy(asc(taskComments.createdAt), asc(taskComments.id)),
  ]);
  return {
    ...task,
    description: row?.description ?? null,
    subtasks: subtasks.map(toSubtask),
    comments: comments.map((c) => toComment(ctx, c)),
    flowProgress: null,
  };
}

function toSubtask(row: typeof taskSubtasks.$inferSelect): TaskSubtask {
  return { id: row.id, title: row.title, done: row.done, createdAt: row.createdAt.toISOString() };
}

function toComment(ctx: TaskContext, row: typeof taskComments.$inferSelect): TaskComment {
  return {
    id: row.id,
    author: personRef(ctx, row.authorId, row.authorName),
    text: row.text,
    isYours: row.authorId === ctx.userId,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

interface Filters {
  /** Every filter except the situation/status, the due-date group and `closedFrom`. */
  base: SQL[];
  /** Only the scope (Minhas / Meu departamento). */
  scope: SQL | undefined;
  situation: SQL | undefined;
  bucket: SQL | undefined;
  closed: SQL | undefined;
}

function bucketSql(bucket: TaskDueBucket, today: ISODate): SQL {
  const week = addDays(today, 7);
  switch (bucket) {
    case 'overdue':
      return lt(tasks.dueDate, today);
    case 'today':
      return eq(tasks.dueDate, today);
    case 'next7Days':
      return sql`${tasks.dueDate} > ${today} and ${tasks.dueDate} <= ${week}`;
    case 'later':
      return sql`${tasks.dueDate} > ${week}`;
    case 'noDueDate':
      return isNull(tasks.dueDate);
  }
}

function buildFilters(ctx: TaskContext, q: TaskQuery, myDepartment: string | null): Filters {
  const scope =
    q.scope === 'mine'
      ? eq(tasks.assigneeId, ctx.userId)
      : q.scope === 'department'
        ? myDepartment
          ? eq(tasks.departmentId, myDepartment)
          : sql`false`
        : undefined;
  const base: SQL[] = [eq(tasks.workspaceId, ctx.workspaceId)];
  if (scope) base.push(scope);
  if (q.clientId)
    base.push(q.clientId === 'internal' ? isNull(tasks.clientId) : eq(tasks.clientId, q.clientId));
  if (q.assigneeId)
    base.push(
      q.assigneeId === 'none' ? isNull(tasks.assigneeId) : eq(tasks.assigneeId, q.assigneeId),
    );
  if (q.departmentId) base.push(eq(tasks.departmentId, q.departmentId));
  if (q.categoryId) base.push(eq(tasks.categoryId, q.categoryId));
  if (q.priority) base.push(eq(tasks.priority, q.priority));
  // Every task is standalone until flows and recurring work exist (later phases).
  if (q.kind === 'flow' || q.kind === 'recurring') base.push(sql`false`);
  if (q.month) {
    const { from, to } = monthRange(q.month);
    base.push(gte(tasks.dueDate, from), lte(tasks.dueDate, to));
  }
  if (q.dueDate) base.push(eq(tasks.dueDate, q.dueDate));
  if (q.dueFrom) base.push(gte(tasks.dueDate, q.dueFrom));
  if (q.dueTo) base.push(lte(tasks.dueDate, q.dueTo));
  if (q.search) base.push(ilike(tasks.title, likePattern(q.search)));

  const situations: SQL[] = [];
  if (q.situation === 'open') situations.push(OPEN_SQL);
  if (q.situation === 'overdue')
    situations.push(sql`${OPEN_SQL} and ${tasks.dueDate} < ${ctx.today}`);
  if (q.situation === 'waiting') situations.push(eq(tasks.status, 'waiting_client'));
  if (q.situation === 'done') situations.push(CLOSED_SQL);
  if (q.status) situations.push(eq(tasks.status, q.status));
  return {
    base,
    scope,
    situation: situations.length ? and(...situations) : undefined,
    bucket: q.dueBucket ? and(OPEN_SQL, bucketSql(q.dueBucket, ctx.today)) : undefined,
    closed: q.closedFrom
      ? sql`(not (${CLOSED_SQL}) or (coalesce(${tasks.completedAt}, ${tasks.updatedAt}) at time zone 'America/Sao_Paulo')::date >= ${q.closedFrom})`
      : undefined,
  };
}

const count = (cond: SQL) => sql<number>`count(*) filter (where ${cond})`.mapWith(Number);

export async function listTasks(ctx: TaskContext, q: TaskQuery): Promise<TaskListResponse> {
  const myDepartment =
    q.scope === 'department' ? await departmentOfMember(ctx.db, ctx.workspaceId, ctx.userId) : null;
  const f = buildFilters(ctx, q, myDepartment);
  const pageWhere = and(...f.base, f.situation, f.bucket, f.closed);
  const order =
    q.situation === 'done'
      ? [sql`coalesce(${tasks.completedAt}, ${tasks.updatedAt}) desc`, sql`${tasks.id}`]
      : defaultOrder();
  const summaryMonth = q.month ?? monthKey(ctx.today);
  const { from: monthFrom, to: monthTo } = monthRange(summaryMonth);
  const week = addDays(ctx.today, 7);
  const t = ctx.today;
  const grouped = and(OPEN_SQL, f.situation ?? sql`true`);
  const closedOk = f.closed ?? sql`true`;

  const [items, [totals], [agg], byAssigneeRows, byClientRows, [oldest], monthRows] =
    await Promise.all([
      selectTasks(ctx, {
        where: pageWhere,
        orderBy: order,
        limit: q.pageSize,
        offset: (q.page - 1) * q.pageSize,
      }),
      ctx.db
        .select({ total: sql<number>`count(*)`.mapWith(Number) })
        .from(tasks)
        .where(pageWhere),
      ctx.db
        .select({
          open: count(OPEN_SQL),
          overdue: count(sql`${OPEN_SQL} and ${tasks.dueDate} < ${t}`),
          dueToday: count(sql`${OPEN_SQL} and ${tasks.dueDate} = ${t}`),
          dueNext7: count(
            sql`${OPEN_SQL} and ${tasks.dueDate} > ${t} and ${tasks.dueDate} <= ${week}`,
          ),
          waiting: count(eq(tasks.status, 'waiting_client')),
          monthDue: count(sql`${tasks.dueDate} between ${monthFrom} and ${monthTo}`),
          monthDone: count(
            sql`${tasks.dueDate} between ${monthFrom} and ${monthTo} and ${CLOSED_SQL}`,
          ),
          gOverdue: count(sql`${grouped} and ${tasks.dueDate} < ${t}`),
          gToday: count(sql`${grouped} and ${tasks.dueDate} = ${t}`),
          gNext7: count(
            sql`${grouped} and ${tasks.dueDate} > ${t} and ${tasks.dueDate} <= ${week}`,
          ),
          gLater: count(sql`${grouped} and ${tasks.dueDate} > ${week}`),
          gNone: count(sql`${grouped} and ${tasks.dueDate} is null`),
          sTodo: count(sql`${tasks.status} = 'todo' and ${closedOk}`),
          sInProgress: count(sql`${tasks.status} = 'in_progress' and ${closedOk}`),
          sWaiting: count(sql`${tasks.status} = 'waiting_client' and ${closedOk}`),
          sDone: count(sql`${tasks.status} = 'done' and ${closedOk}`),
          sCanceled: count(sql`${tasks.status} = 'canceled' and ${closedOk}`),
          oTodo: count(sql`${tasks.status} = 'todo' and ${tasks.dueDate} < ${t}`),
          oInProgress: count(sql`${tasks.status} = 'in_progress' and ${tasks.dueDate} < ${t}`),
          oWaiting: count(sql`${tasks.status} = 'waiting_client' and ${tasks.dueDate} < ${t}`),
        })
        .from(tasks)
        .where(and(...f.base)),
      ctx.db
        .select({
          id: tasks.assigneeId,
          open: sql<number>`count(*)`.mapWith(Number),
          overdue: count(sql`${tasks.dueDate} < ${t}`),
        })
        .from(tasks)
        .where(and(...f.base, OPEN_SQL))
        .groupBy(tasks.assigneeId),
      ctx.db
        .select({
          id: tasks.clientId,
          name: contacts.name,
          tradeName: contacts.tradeName,
          open: sql<number>`count(*)`.mapWith(Number),
          overdue: count(sql`${tasks.dueDate} < ${t}`),
        })
        .from(tasks)
        .leftJoin(
          contacts,
          and(eq(contacts.workspaceId, tasks.workspaceId), eq(contacts.id, tasks.clientId)),
        )
        .where(and(...f.base, OPEN_SQL))
        .groupBy(tasks.clientId, contacts.name, contacts.tradeName),
      selectTasks(ctx, {
        where: and(...f.base, OPEN_SQL, lt(tasks.dueDate, t)),
        orderBy: [asc(tasks.dueDate), sql`${priorityRank}`],
        limit: 1,
      }),
      ctx.db
        .selectDistinct({ month: sql<string>`to_char(${tasks.dueDate}, 'YYYY-MM')` })
        .from(tasks)
        .where(
          and(eq(tasks.workspaceId, ctx.workspaceId), sql`${tasks.dueDate} is not null`, f.scope),
        ),
    ]);
  const a = agg!;

  const summary: TaskListSummary = {
    month: summaryMonth,
    overdue: a.overdue,
    oldestOverdue: oldest
      ? {
          kind: 'task',
          id: oldest.id,
          competence: null,
          title: oldest.title,
          dueDate: oldest.dueDate!,
          daysOverdue: daysOverdue(oldest.dueDate, t),
          client: oldest.client,
        }
      : null,
    open: a.open,
    dueToday: a.dueToday,
    dueNext7Days: a.dueNext7,
    waitingClient: a.waiting,
    monthDue: a.monthDue,
    monthDone: a.monthDone,
    openByAssignee: byAssigneeRows
      .map((r) => ({
        assignee: memberRef(ctx, r.id) as TaskMemberRef | null,
        open: r.open,
        overdue: r.overdue,
      }))
      .sort((x, y) => y.open - x.open || y.overdue - x.overdue),
    openByClient: byClientRows
      .map((r) => ({
        client: clientRef({ id: r.id, name: r.name, tradeName: r.tradeName }),
        open: r.open,
        overdue: r.overdue,
      }))
      .sort((x, y) => y.open - x.open || y.overdue - x.overdue),
  };
  const groups: Record<TaskDueBucket, number> = {
    overdue: a.gOverdue,
    today: a.gToday,
    next7Days: a.gNext7,
    later: a.gLater,
    noDueDate: a.gNone,
  };
  const byStatus = Object.fromEntries(
    TASK_STATUSES.map((st) => [st, { count: 0, overdue: 0 }]),
  ) as Record<TaskStatus, TaskStatusCount>;
  byStatus.todo = { count: a.sTodo, overdue: a.oTodo };
  byStatus.in_progress = { count: a.sInProgress, overdue: a.oInProgress };
  byStatus.waiting_client = { count: a.sWaiting, overdue: a.oWaiting };
  byStatus.done = { count: a.sDone, overdue: 0 };
  byStatus.canceled = { count: a.sCanceled, overdue: 0 };

  const months = new Set<MonthKey>(monthRows.map((r) => r.month));
  months.add(monthKey(t));
  return {
    items,
    total: totals?.total ?? 0,
    page: q.page,
    pageSize: q.pageSize,
    today: t,
    occurrences: [],
    summary,
    groups,
    byStatus,
    months: [...months].sort(),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

interface DatesShape {
  startDate: string | null;
  dueDate: string | null;
  startTime: string | null;
  endTime: string | null;
}

/** The schema checks each request; the merged task is checked again (a PATCH sends one field). */
function assertDates(v: DatesShape) {
  if (v.startDate && v.dueDate && v.startDate > v.dueDate)
    throw new ValidationError('O início não pode ser depois do vencimento');
  if (v.endTime && !v.startTime) throw new ValidationError('Informe a hora de início');
  if (v.startTime && v.endTime && v.endTime <= v.startTime)
    throw new ValidationError('A hora de término deve ser posterior à de início');
  if ((v.startTime || v.endTime) && !v.dueDate)
    throw new ValidationError('Informe o vencimento para definir o horário');
}

async function assertRefs(
  ctx: TaskContext,
  refs: { clientId?: string | null; categoryId?: string | null; assigneeId?: string | null },
) {
  if (refs.clientId) await getTaskClientOrThrow(ctx.db, ctx.workspaceId, refs.clientId);
  if (refs.categoryId) await getTaskCategoryOrThrow(ctx.db, ctx.workspaceId, refs.categoryId);
  assertMember(ctx, refs.assigneeId);
}

/** Fields that record a status change (Effy's `camposDeConclusao`, plus where "Reabrir" goes back to). */
function statusFields(
  ctx: TaskContext,
  previous: Pick<TaskRow, 'status' | 'reopenStatus'> | null,
  next: TaskStatus,
) {
  const prev = previous?.status ?? null;
  const fields: Partial<typeof tasks.$inferInsert> = { status: next };
  if (next === 'done' && prev !== 'done') {
    fields.completedAt = now();
    fields.completedBy = ctx.userId;
    fields.completedByName = myName(ctx);
  }
  if (next !== 'done' && prev === 'done') {
    fields.completedAt = null;
    fields.completedBy = null;
    fields.completedByName = null;
  }
  if (isOpen(next)) fields.reopenStatus = null;
  else if (prev && isOpen(prev))
    fields.reopenStatus = prev as 'todo' | 'in_progress' | 'waiting_client';
  else if (!prev || !previous?.reopenStatus) fields.reopenStatus = 'todo';
  return fields;
}

export async function createTask(ctx: TaskContext, input: TaskInput): Promise<TaskDetail> {
  await assertRefs(ctx, input);
  const departmentId = await resolveTaskDepartment(ctx, input.assigneeId, input.departmentId);
  const [row] = await ctx.db
    .insert(tasks)
    .values({
      workspaceId: ctx.workspaceId,
      title: input.title,
      description: input.description,
      clientId: input.clientId,
      categoryId: input.categoryId,
      assigneeId: input.assigneeId,
      departmentId,
      priority: input.priority,
      startDate: input.startDate,
      dueDate: input.dueDate,
      startTime: input.startTime,
      endTime: input.endTime,
      createdBy: ctx.userId,
      createdByName: myName(ctx),
      ...statusFields(ctx, null, input.status),
    })
    .returning({ id: tasks.id });
  return getTaskDetail(ctx, row!.id);
}

/** Field-by-field autosave. The department follows the assignee (or the queue sent for an unassigned task). */
export async function updateTask(
  ctx: TaskContext,
  id: string,
  patch: TaskPatch,
): Promise<TaskDetail> {
  const current = await getTaskRowOrThrow(ctx, id);
  const merged = { ...current, ...patch };
  assertDates(merged);
  await assertRefs(ctx, {
    clientId: patch.clientId !== undefined ? patch.clientId : undefined,
    categoryId: patch.categoryId !== undefined ? patch.categoryId : undefined,
    assigneeId: patch.assigneeId !== undefined ? patch.assigneeId : undefined,
  });
  const set: Partial<typeof tasks.$inferInsert> = { ...patch };
  delete set.departmentId;
  if (patch.assigneeId !== undefined || patch.departmentId !== undefined) {
    set.departmentId = await resolveTaskDepartment(
      ctx,
      merged.assigneeId,
      patch.departmentId !== undefined ? patch.departmentId : current.departmentId,
    );
  }
  if (Object.keys(set).length > 0) await ctx.db.update(tasks).set(set).where(eq(tasks.id, id));
  return getTaskDetail(ctx, id);
}

/**
 * Concludes, reopens, moves or undoes. Repeating the current status changes nothing (the conclusion
 * keeps its original who/when). `activated` will carry the next flow step's task once flows exist.
 */
export async function changeTaskStatus(
  ctx: TaskContext,
  id: string,
  status: TaskStatus,
): Promise<TaskStatusChangeResponse> {
  const current = await getTaskRowOrThrow(ctx, id);
  if (current.status !== status) {
    await ctx.db
      .update(tasks)
      .set(statusFields(ctx, current, status))
      .where(eq(tasks.id, id));
  }
  return { task: await getTaskDetail(ctx, id), activated: null };
}

/** Administrators. Subtasks and comments go with it. */
export async function deleteTask(ctx: TaskContext, id: string): Promise<void> {
  await getTaskRowOrThrow(ctx, id);
  await ctx.db.delete(tasks).where(eq(tasks.id, id));
}

// ---------------------------------------------------------------------------
// Subtasks and comments (any member)
// ---------------------------------------------------------------------------

async function touch(ctx: TaskContext, id: string) {
  await ctx.db.update(tasks).set({ updatedAt: now() }).where(eq(tasks.id, id));
}

export async function addSubtask(
  ctx: TaskContext,
  taskId: string,
  input: SubtaskInput,
): Promise<TaskSubtask> {
  await getTaskRowOrThrow(ctx, taskId);
  const [row] = await ctx.db
    .insert(taskSubtasks)
    .values({ workspaceId: ctx.workspaceId, taskId, title: input.title })
    .returning();
  await touch(ctx, taskId);
  return toSubtask(row!);
}

async function getSubtaskOrThrow(ctx: TaskContext, taskId: string, subtaskId: string) {
  const [row] = await ctx.db
    .select()
    .from(taskSubtasks)
    .where(
      and(
        eq(taskSubtasks.id, subtaskId),
        eq(taskSubtasks.taskId, taskId),
        eq(taskSubtasks.workspaceId, ctx.workspaceId),
      ),
    );
  if (!row) throw new NotFoundError('Subtarefa não encontrada');
  return row;
}

export async function updateSubtask(
  ctx: TaskContext,
  taskId: string,
  subtaskId: string,
  patch: SubtaskPatch,
): Promise<TaskSubtask> {
  await getSubtaskOrThrow(ctx, taskId, subtaskId);
  const [row] = await ctx.db
    .update(taskSubtasks)
    .set(patch)
    .where(eq(taskSubtasks.id, subtaskId))
    .returning();
  await touch(ctx, taskId);
  return toSubtask(row!);
}

export async function deleteSubtask(
  ctx: TaskContext,
  taskId: string,
  subtaskId: string,
): Promise<void> {
  await getSubtaskOrThrow(ctx, taskId, subtaskId);
  await ctx.db.delete(taskSubtasks).where(eq(taskSubtasks.id, subtaskId));
  await touch(ctx, taskId);
}

/** The author is always the member of the session (never taken from the request). */
export async function addComment(
  ctx: TaskContext,
  taskId: string,
  input: CommentInput,
): Promise<TaskComment> {
  await getTaskRowOrThrow(ctx, taskId);
  const [row] = await ctx.db
    .insert(taskComments)
    .values({
      workspaceId: ctx.workspaceId,
      taskId,
      authorId: ctx.userId,
      authorName: myName(ctx),
      text: input.text,
    })
    .returning();
  return toComment(ctx, row!);
}

const ACTIVITY_DAYS = 5;

/**
 * What others did on my tasks (assigned to or created by me) in the last 5 days: comments, newest
 * first, with an 80-character excerpt (Effy's `atividadeRecente`; attachments are not ported).
 */
export async function recentActivity(ctx: TaskContext): Promise<TaskActivityItem[]> {
  const since = new Date(now().getTime() - ACTIVITY_DAYS * 86_400_000);
  const rows = await ctx.db
    .select({ comment: taskComments, taskTitle: tasks.title })
    .from(taskComments)
    .innerJoin(
      tasks,
      and(eq(tasks.workspaceId, taskComments.workspaceId), eq(tasks.id, taskComments.taskId)),
    )
    .where(
      and(
        eq(taskComments.workspaceId, ctx.workspaceId),
        gte(taskComments.createdAt, since),
        sql`${taskComments.authorId} is distinct from ${ctx.userId}`,
        sql`(${tasks.assigneeId} = ${ctx.userId} or ${tasks.createdBy} = ${ctx.userId})`,
      ),
    )
    .orderBy(desc(taskComments.createdAt))
    .limit(50);
  return rows.map(({ comment, taskTitle }) => ({
    id: comment.id,
    taskId: comment.taskId,
    taskTitle,
    author: personRef(ctx, comment.authorId, comment.authorName),
    text: comment.text.length > 80 ? `${comment.text.slice(0, 80)}…` : comment.text,
    createdAt: comment.createdAt.toISOString(),
  }));
}
