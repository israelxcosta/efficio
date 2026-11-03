// Tasks (Effy's "solicitações"): CRUD, the list with its summary, the status change (conclude,
// reopen, move on the board, undo), subtasks, comments, the history and the recent activity.
//
// Rules ported from Effy's task.service:
// - the department is derived from the assignee (an unassigned task may sit in a department's queue);
//   a recurring occurrence belongs to its recurring task's department;
// - concluding records who/when on the server, only on the transition to `done`; leaving `done`
//   clears both; "Atrasada" is derived (open + due date before today), never stored;
// - concluding a process step activates the next one (flow-engine.ts, idempotent);
// - every member works on tasks; deleting one is for administrators.
// Recurring occurrences are tasks too (one per client and period, generation.ts): the list shows them
// aggregated (`occurrences`) and counts them one per client; their registry fields are locked (they come
// from the recurring task), and reopening a concluded one is only for who concluded it or an
// administrator, with a reason (the audit record). Every write leaves an entry in the history.
// Every statement filters by the workspace, even after an ownership check (test/tasks-scope.test.ts);
// free text is encrypted per field (encrypted-text.ts).

import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, lte, sql, type SQL } from 'drizzle-orm';
import {
  addDays,
  addMonthKey,
  isOpenTaskStatus,
  monthKey,
  monthRange,
  TASK_STATUSES,
  type ISODate,
  type MonthKey,
  type TaskActivityItem,
  type TaskComment,
  type taskCommentInputSchema,
  type TaskDetail,
  type TaskDueBucket,
  type TaskFieldChange,
  type TaskHistoryResponse,
  type taskInputSchema,
  type TaskListResponse,
  type TaskListSummary,
  type TaskLockedField,
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
import { contacts, taskCategories, taskComments, taskEvents, taskSubtasks, tasks, type TaskRow } from '../../db/schema';
import { now } from '../../lib/clock';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors';
import { likePattern } from '../../lib/sql';
import type { TaskContext } from './access';
import { listAttachments } from './attachments';
import {
  decryptTaskText,
  encryptTaskText,
  TASK_COMMENT_TEXT,
  TASK_DESCRIPTION,
} from './encrypted-text';
import { HISTORY_LIMIT, recordEvent, recordEvents, toHistoryItem, type EventInput } from './events';
import { advanceOnCompletion, beforeStepReopens, flowOfTask } from './flow-engine';
import { defaultWindow, ensureOccurrences } from './generation';
import { aggregateOccurrences, canReopenOccurrence } from './occurrences';
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
  bucketSql,
  CLOSED_SQL,
  defaultOrder,
  NOT_OCCURRENCE_SQL,
  OCCURRENCE_SQL,
  OPEN_SQL,
  overdueRef,
  priorityRank,
  selectTask,
  selectTasks,
  WORK_DATE,
} from './task-rows';

type TaskInput = z.output<typeof taskInputSchema>;
type TaskPatch = z.output<typeof taskUpdateSchema>;
type TaskQuery = z.output<typeof taskQuerySchema>;
type SubtaskInput = z.output<typeof subtaskInputSchema>;
type SubtaskPatch = z.output<typeof subtaskUpdateSchema>;
type CommentInput = z.output<typeof taskCommentInputSchema>;

/** Fields an occurrence takes from its recurring task (PATCH answers 422 for them). */
const OCCURRENCE_LOCKED: TaskLockedField[] = ['title', 'clientId', 'categoryId', 'departmentId', 'startDate', 'dueDate', 'startTime', 'endTime'];

/** The author of a conclusion may undo it without a reason within this window ("Desfazer"). */
export const UNDO_WINDOW_MS = 15 * 60_000;

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** A task of the request's workspace, by id. */
function taskKey(ctx: Pick<TaskContext, 'workspaceId'>, id: string): SQL {
  return and(eq(tasks.workspaceId, ctx.workspaceId), eq(tasks.id, id))!;
}

export async function getTaskRowOrThrow(
  ctx: Pick<TaskContext, 'db' | 'workspaceId'>,
  id: string,
): Promise<TaskRow> {
  const [row] = await ctx.db.select().from(tasks).where(taskKey(ctx, id));
  if (!row) throw new NotFoundError('Tarefa não encontrada');
  return row;
}

function canReopen(ctx: TaskContext, row: Pick<TaskRow, 'status' | 'completedBy' | 'recurringTaskId'>): boolean {
  if (isOpenTaskStatus(row.status)) return false;
  return row.recurringTaskId && row.status === 'done' ? canReopenOccurrence(ctx, row) : true;
}

export async function getTaskDetail(ctx: TaskContext, id: string): Promise<TaskDetail> {
  const task = await selectTask(ctx, id);
  if (!task) throw new NotFoundError('Tarefa não encontrada');
  const [row] = await ctx.db
    .select({ description: tasks.description, completedBy: tasks.completedBy })
    .from(tasks)
    .where(taskKey(ctx, id));
  const [subtasks, comments, attachments, flowProgress] = await Promise.all([
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
    listAttachments(ctx, id),
    task.flow ? flowOfTask(ctx, id) : Promise.resolve(null),
  ]);
  const [description, texts] = await Promise.all([
    decryptTaskText(ctx.cipher, TASK_DESCRIPTION, row?.description ?? null),
    Promise.all(comments.map((c) => decryptTaskText(ctx.cipher, TASK_COMMENT_TEXT, c.text))),
  ]);
  return {
    ...task,
    description,
    subtasks: subtasks.map(toSubtask),
    comments: comments.map((c, i) => toComment(ctx, c, texts[i]!)),
    attachments,
    flowProgress,
    lockedFields: task.occurrence ? OCCURRENCE_LOCKED : [],
    canReopen: canReopen(ctx, {
      status: task.status,
      completedBy: row?.completedBy ?? null,
      recurringTaskId: task.occurrence?.recurringTaskId ?? null,
    }),
  };
}

function toSubtask(row: typeof taskSubtasks.$inferSelect): TaskSubtask {
  return { id: row.id, title: row.title, done: row.done, createdAt: row.createdAt.toISOString() };
}

/** `text` is the decrypted comment (the row holds the ciphertext). */
function toComment(
  ctx: TaskContext,
  row: typeof taskComments.$inferSelect,
  text: string,
): TaskComment {
  return {
    id: row.id,
    author: personRef(ctx, row.authorId, row.authorName),
    text,
    isYours: row.authorId === ctx.userId,
    canDelete: ctx.permissions.deleteTasks || row.authorId === ctx.userId,
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
  /** A date filter was given (month, due date or range). */
  dated: boolean;
}

// Outer columns spelled out: Drizzle leaves them unqualified in a single-table select (pitfall #11).
const IN_FLOW = sql`exists (select 1 from task_flow_steps fs where fs.workspace_id = tasks.workspace_id and fs.task_id = tasks.id)`;

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
  if (!q.occurrences) base.push(NOT_OCCURRENCE_SQL);
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
  if (q.kind === 'recurring') base.push(OCCURRENCE_SQL);
  if (q.kind === 'flow') base.push(NOT_OCCURRENCE_SQL, IN_FLOW);
  if (q.kind === 'standalone') base.push(NOT_OCCURRENCE_SQL, sql`not ${IN_FLOW}`);
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
    dated: Boolean(q.month || q.dueDate || q.dueFrom || q.dueTo),
  };
}

const count = (cond: SQL) => sql<number>`count(*) filter (where ${cond})`.mapWith(Number);

export async function listTasks(ctx: TaskContext, q: TaskQuery): Promise<TaskListResponse> {
  if (q.occurrences) await ensureOccurrences(ctx, q.month ? [q.month] : defaultWindow(ctx.today));
  const myDepartment =
    q.scope === 'department' ? await departmentOfMember(ctx.db, ctx.workspaceId, ctx.userId) : null;
  const f = buildFilters(ctx, q, myDepartment);
  const current = monthKey(ctx.today);
  // Occurrences are generated ahead (generation.ts); without a date filter the list goes up to the next
  // competence only, so obligations two months away do not swell "Em aberto" and "Mais tarde".
  if (q.occurrences && !f.dated)
    f.base.push(sql`(${tasks.recurringTaskId} is null or ${tasks.competence} <= ${addMonthKey(current, 1)})`);
  // Occurrences are listed aggregated (`occurrences`), never as rows of the page.
  const pageWhere = and(...f.base, NOT_OCCURRENCE_SQL, f.situation, f.bucket, f.closed);
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
  const notOverdue = sql`${tasks.dueDate} >= ${t}`;
  // Without a date filter, the aggregated occurrences are the open ones and those of the recent window.
  const occurrenceWindow = f.dated ? undefined : sql`(${OPEN_SQL} or ${tasks.competence} >= ${addMonthKey(current, -2)})`;

  const [items, [totals], [agg], byAssigneeRows, byClientRows, [oldest], monthRows, occurrences] =
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
          targetMissed: count(sql`${OPEN_SQL} and ${bucketSql('targetMissed', t)}`),
          dueToday: count(sql`${OPEN_SQL} and ${WORK_DATE} = ${t} and ${notOverdue}`),
          dueNext7: count(sql`${OPEN_SQL} and ${WORK_DATE} > ${t} and ${WORK_DATE} <= ${week}`),
          waiting: count(eq(tasks.status, 'waiting_client')),
          monthDue: count(sql`${tasks.dueDate} between ${monthFrom} and ${monthTo}`),
          monthDone: count(
            sql`${tasks.dueDate} between ${monthFrom} and ${monthTo} and ${CLOSED_SQL}`,
          ),
          gOverdue: count(sql`${grouped} and ${bucketSql('overdue', t)}`),
          gTargetMissed: count(sql`${grouped} and ${bucketSql('targetMissed', t)}`),
          gToday: count(sql`${grouped} and ${bucketSql('today', t)}`),
          gNext7: count(sql`${grouped} and ${bucketSql('next7Days', t)}`),
          gLater: count(sql`${grouped} and ${bucketSql('later', t)}`),
          gNone: count(sql`${grouped} and ${bucketSql('noDueDate', t)}`),
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
          and(eq(tasks.workspaceId, ctx.workspaceId), sql`${tasks.dueDate} is not null`, f.scope, q.occurrences ? undefined : NOT_OCCURRENCE_SQL),
        ),
      q.occurrences && q.kind !== 'standalone' && q.kind !== 'flow'
        ? aggregateOccurrences(ctx, and(...f.base, f.situation, f.bucket, f.closed, occurrenceWindow))
        : Promise.resolve([]),
    ]);
  const a = agg!;

  const summary: TaskListSummary = {
    month: summaryMonth,
    overdue: a.overdue,
    oldestOverdue: oldest ? overdueRef(oldest, t) : null,
    targetMissed: a.targetMissed,
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
    targetMissed: a.gTargetMissed,
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
    occurrences,
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
  if (isOpenTaskStatus(next)) fields.reopenStatus = null;
  else if (prev && isOpenTaskStatus(prev)) fields.reopenStatus = prev;
  else if (!prev || !previous?.reopenStatus) fields.reopenStatus = 'todo';
  return fields;
}

const personOf = (ctx: TaskContext, id: string | null) => {
  const m = id ? ctx.members.get(id) : undefined;
  return m ? { id: m.id, name: m.name } : null;
};

const PLAIN_FIELDS = ['title', 'priority', 'startDate', 'dueDate', 'startTime', 'endTime'] as const;

/** Before/after of the changed fields for the history (client and category by name; never the description). */
async function fieldChanges(ctx: TaskContext, current: TaskRow, patch: TaskPatch): Promise<TaskFieldChange[]> {
  const out: TaskFieldChange[] = [];
  for (const field of PLAIN_FIELDS) {
    const to = patch[field];
    if (to === undefined || to === current[field]) continue;
    out.push({ field, from: current[field] ?? null, to: to ?? null });
  }
  if (patch.clientId !== undefined && patch.clientId !== current.clientId) {
    const ids = [current.clientId, patch.clientId].filter((v): v is string => v !== null);
    const rows = ids.length
      ? await ctx.db
          .select({ id: contacts.id, name: contacts.name, tradeName: contacts.tradeName })
          .from(contacts)
          .where(and(eq(contacts.workspaceId, ctx.workspaceId), inArray(contacts.id, ids)))
      : [];
    const name = (id: string | null) => {
      const r = rows.find((x) => x.id === id);
      return r ? (r.tradeName?.trim() ? r.tradeName : r.name) : null;
    };
    out.push({ field: 'clientId', from: name(current.clientId), to: name(patch.clientId) });
  }
  if (patch.categoryId !== undefined && patch.categoryId !== current.categoryId) {
    const ids = [current.categoryId, patch.categoryId].filter((v): v is string => v !== null);
    const rows = ids.length
      ? await ctx.db
          .select({ id: taskCategories.id, name: taskCategories.name })
          .from(taskCategories)
          .where(and(eq(taskCategories.workspaceId, ctx.workspaceId), inArray(taskCategories.id, ids)))
      : [];
    const name = (id: string | null) => rows.find((x) => x.id === id)?.name ?? null;
    out.push({ field: 'categoryId', from: name(current.categoryId), to: name(patch.categoryId) });
  }
  return out;
}

export async function createTask(ctx: TaskContext, input: TaskInput): Promise<TaskDetail> {
  await assertRefs(ctx, input);
  const departmentId = await resolveTaskDepartment(ctx, input.assigneeId, input.departmentId);
  const [row] = await ctx.db
    .insert(tasks)
    .values({
      workspaceId: ctx.workspaceId,
      title: input.title,
      description: await encryptTaskText(ctx.cipher, TASK_DESCRIPTION, input.description),
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
      createdAt: now(),
      updatedAt: now(),
      ...statusFields(ctx, null, input.status),
    })
    .returning({ id: tasks.id });
  await recordEvent(ctx, { taskId: row!.id, kind: 'created', data: { origin: 'manual', status: input.status } });
  return getTaskDetail(ctx, row!.id);
}

/**
 * Field-by-field autosave. The department follows the assignee (or the queue sent for an unassigned
 * task). An occurrence takes only the description, the priority and the assignee (for that competence
 * only: `assignee_source = 'manual'`); the rest comes from its recurring task.
 */
export async function updateTask(
  ctx: TaskContext,
  id: string,
  patch: TaskPatch,
): Promise<TaskDetail> {
  const current = await getTaskRowOrThrow(ctx, id);
  const sent = Object.keys(patch) as (keyof TaskPatch)[];
  if (current.recurringTaskId) {
    const locked = sent.filter((k) => (OCCURRENCE_LOCKED as string[]).includes(k));
    if (locked.length > 0)
      throw new ValidationError('Este campo vem da tarefa recorrente; altere o cadastro da recorrente.', { fields: locked });
  }
  const merged = { ...current, ...patch };
  assertDates(merged);
  await assertRefs(ctx, {
    clientId: patch.clientId !== undefined ? patch.clientId : undefined,
    categoryId: patch.categoryId !== undefined ? patch.categoryId : undefined,
    assigneeId: patch.assigneeId !== undefined ? patch.assigneeId : undefined,
  });
  const set: Partial<typeof tasks.$inferInsert> = { ...patch };
  delete set.departmentId;
  if (patch.description !== undefined)
    set.description = await encryptTaskText(ctx.cipher, TASK_DESCRIPTION, patch.description);
  if (current.recurringTaskId) {
    if (patch.assigneeId !== undefined) set.assigneeSource = patch.assigneeId ? 'manual' : null;
  } else if (patch.assigneeId !== undefined || patch.departmentId !== undefined) {
    set.departmentId = await resolveTaskDepartment(
      ctx,
      merged.assigneeId,
      patch.departmentId !== undefined ? patch.departmentId : current.departmentId,
    );
  }
  if (Object.keys(set).length > 0) await ctx.db.update(tasks).set(set).where(taskKey(ctx, id));

  const events: EventInput[] = [];
  if (patch.assigneeId !== undefined && patch.assigneeId !== current.assigneeId) {
    events.push({
      taskId: id,
      kind: 'assigned',
      data: { fromAssignee: personOf(ctx, current.assigneeId), toAssignee: personOf(ctx, patch.assigneeId) },
      note: current.recurringTaskId ? 'Atribuída só nesta competência' : null,
    });
  }
  const fields = sent.filter((k) => k !== 'assigneeId' && k !== 'departmentId');
  if (fields.length > 0) events.push({ taskId: id, kind: 'updated', data: { fields, changes: await fieldChanges(ctx, current, patch) } });
  for (const e of events) await recordEvent(ctx, e);
  return getTaskDetail(ctx, id);
}

/**
 * Concludes, reopens, moves or undoes. Repeating the current status changes nothing (the conclusion
 * keeps its original who/when). Concluding a process step activates the next one (`activated`);
 * reopening one puts the next back to waiting if it has not started, and is refused (409) otherwise.
 * Reopening a concluded occurrence (an audit record) is for who concluded it or an administrator, with
 * a reason — except its author undoing it within the undo window.
 */
export async function changeTaskStatus(
  ctx: TaskContext,
  id: string,
  status: TaskStatus,
  reason: string | null = null,
): Promise<TaskStatusChangeResponse> {
  const current = await getTaskRowOrThrow(ctx, id);
  let activated: string | null = null;
  if (current.status !== status) {
    const leavingConclusion = current.status === 'done';
    if (leavingConclusion && current.recurringTaskId) {
      if (!canReopenOccurrence(ctx, current))
        throw new ForbiddenError('Só quem concluiu ou um administrador pode reabrir esta tarefa.');
      const undo =
        current.completedBy === ctx.userId &&
        current.completedAt !== null &&
        now().getTime() - current.completedAt.getTime() <= UNDO_WINDOW_MS;
      if (!reason && !undo) throw new ValidationError('Informe o motivo da reabertura.');
    }
    await ctx.db
      .update(tasks)
      .set(statusFields(ctx, current, status))
      .where(taskKey(ctx, id));
    const reopened = !isOpenTaskStatus(current.status) && isOpenTaskStatus(status);
    await recordEvent(ctx, {
      taskId: id,
      kind: reopened ? 'reopened' : 'status',
      data: { from: current.status, to: status },
      note: reason,
    });
    // A process step leaving `done`: the next step goes back to waiting, or the change is refused (409;
    // the whole request is one transaction, so nothing above stays).
    if (leavingConclusion) await beforeStepReopens(ctx, id);
    if (status === 'done') activated = await advanceOnCompletion(ctx, id);
  }
  return {
    task: await getTaskDetail(ctx, id),
    activated: activated ? await selectTask(ctx, activated) : null,
  };
}

/**
 * Administrators. Subtasks, comments, attachments and history go with it. Occurrences are not deleted
 * (the generation would bring them back): cancel them, or change the recurring task.
 */
export async function deleteTask(ctx: TaskContext, id: string): Promise<void> {
  const row = await getTaskRowOrThrow(ctx, id);
  if (row.recurringTaskId)
    throw new ConflictError(
      'Ocorrências de tarefas recorrentes não são excluídas: cancele a ocorrência ou ajuste o cadastro da recorrente (exceções, encerramento).',
    );
  await ctx.db.delete(tasks).where(taskKey(ctx, id));
}

/** The history of a task, newest first (up to HISTORY_LIMIT entries). */
export async function taskHistory(ctx: TaskContext, id: string): Promise<TaskHistoryResponse> {
  await getTaskRowOrThrow(ctx, id);
  const where = and(eq(taskEvents.workspaceId, ctx.workspaceId), eq(taskEvents.taskId, id));
  const [rows, [total]] = await Promise.all([
    ctx.db.select().from(taskEvents).where(where).orderBy(desc(taskEvents.seq)).limit(HISTORY_LIMIT),
    ctx.db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(taskEvents).where(where),
  ]);
  return { items: await Promise.all(rows.map((r) => toHistoryItem(ctx, r))), total: total?.n ?? 0 };
}

// ---------------------------------------------------------------------------
// Subtasks and comments (any member)
// ---------------------------------------------------------------------------

async function touch(ctx: TaskContext, id: string) {
  await ctx.db.update(tasks).set({ updatedAt: now() }).where(taskKey(ctx, id));
}

/**
 * Ceilings per task: the detail (`GET /tasks/:id`) returns every subtask and comment, and any member
 * adds them, so without a ceiling one task could grow a response (and its queries) without bound.
 */
export const MAX_SUBTASKS_PER_TASK = 100;
export const MAX_COMMENTS_PER_TASK = 500;

const childCount = sql<number>`count(*)`.mapWith(Number);

export async function addSubtask(
  ctx: TaskContext,
  taskId: string,
  input: SubtaskInput,
): Promise<TaskSubtask> {
  await getTaskRowOrThrow(ctx, taskId);
  const [existing] = await ctx.db
    .select({ n: childCount })
    .from(taskSubtasks)
    .where(and(eq(taskSubtasks.workspaceId, ctx.workspaceId), eq(taskSubtasks.taskId, taskId)));
  if ((existing?.n ?? 0) >= MAX_SUBTASKS_PER_TASK)
    throw new ValidationError(
      `Uma tarefa pode ter até ${MAX_SUBTASKS_PER_TASK} subtarefas. Remova alguma antes de adicionar outra.`,
    );
  const [row] = await ctx.db
    .insert(taskSubtasks)
    .values({ workspaceId: ctx.workspaceId, taskId, title: input.title })
    .returning();
  await touch(ctx, taskId);
  return toSubtask(row!);
}

/** A subtask of the request's workspace, reached through its own task. */
function subtaskKey(ctx: Pick<TaskContext, 'workspaceId'>, taskId: string, subtaskId: string): SQL {
  return and(
    eq(taskSubtasks.workspaceId, ctx.workspaceId),
    eq(taskSubtasks.taskId, taskId),
    eq(taskSubtasks.id, subtaskId),
  )!;
}

async function getSubtaskOrThrow(ctx: TaskContext, taskId: string, subtaskId: string) {
  const [row] = await ctx.db
    .select()
    .from(taskSubtasks)
    .where(subtaskKey(ctx, taskId, subtaskId));
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
    .where(subtaskKey(ctx, taskId, subtaskId))
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
  await ctx.db.delete(taskSubtasks).where(subtaskKey(ctx, taskId, subtaskId));
  await touch(ctx, taskId);
}

/** The author is always the member of the session (never taken from the request). */
export async function addComment(
  ctx: TaskContext,
  taskId: string,
  input: CommentInput,
): Promise<TaskComment> {
  await getTaskRowOrThrow(ctx, taskId);
  const [existing] = await ctx.db
    .select({ n: childCount })
    .from(taskComments)
    .where(and(eq(taskComments.workspaceId, ctx.workspaceId), eq(taskComments.taskId, taskId)));
  if ((existing?.n ?? 0) >= MAX_COMMENTS_PER_TASK)
    throw new ValidationError(
      `Esta tarefa chegou ao limite de ${MAX_COMMENTS_PER_TASK} comentários.`,
    );
  const [row] = await ctx.db
    .insert(taskComments)
    .values({
      workspaceId: ctx.workspaceId,
      taskId,
      authorId: ctx.userId,
      authorName: myName(ctx),
      text: await encryptTaskText(ctx.cipher, TASK_COMMENT_TEXT, input.text),
    })
    .returning();
  await recordEvent(ctx, { taskId, kind: 'commented', data: { commentId: row!.id } });
  return toComment(ctx, row!, input.text);
}

/** The author, or an administrator. The history keeps that a comment was removed (not its text). */
export async function deleteComment(ctx: TaskContext, taskId: string, commentId: string): Promise<void> {
  const key = and(
    eq(taskComments.workspaceId, ctx.workspaceId),
    eq(taskComments.taskId, taskId),
    eq(taskComments.id, commentId),
  );
  const [row] = await ctx.db.select({ authorId: taskComments.authorId }).from(taskComments).where(key);
  if (!row) throw new NotFoundError('Comentário não encontrado');
  // The author, or whoever may delete tasks (`deleteTasks`: removing someone else's content).
  if (!ctx.permissions.deleteTasks && row.authorId !== ctx.userId)
    throw new ForbiddenError('Só quem escreveu ou um administrador pode remover este comentário.');
  await ctx.db.delete(taskComments).where(key);
  await recordEvents(ctx, [{ taskId, kind: 'comment_removed', data: { commentId } }]);
}

const ACTIVITY_DAYS = 5;

/**
 * What others did on my tasks (assigned to or created by me) in the last 5 days: comments, newest
 * first, with an 80-character excerpt (Effy's `atividadeRecente`).
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
  return Promise.all(
    rows.map(async ({ comment, taskTitle }) => {
      const text = await decryptTaskText(ctx.cipher, TASK_COMMENT_TEXT, comment.text);
      return {
        id: comment.id,
        taskId: comment.taskId,
        taskTitle,
        author: personRef(ctx, comment.authorId, comment.authorName),
        text: text.length > 80 ? `${text.slice(0, 80)}…` : text,
        createdAt: comment.createdAt.toISOString(),
      };
    }),
  );
}
