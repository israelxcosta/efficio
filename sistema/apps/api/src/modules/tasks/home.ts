// Start page summary ("página de início", spec §6): the work of a department in a month, computed in
// SQL so the screen never counts on its own. Members see their own department; administrators any
// department or all of them; a member without department sees only what is assigned to them.
//
// Units are tasks and recurring occurrences (one per client): the open ones (whatever the due date)
// plus those due, concluded or canceled in the month. "Minhas tarefas" is everything open assigned to
// you in any department (occurrences aggregated per recurring task), and "Obrigações da competência" is
// the progress of the recurring tasks of the department in the month (spec §6.5).

import { and, asc, eq, gte, lte, or, sql, type SQL } from 'drizzle-orm';
import {
  addDays,
  addMonthKey,
  monthKey,
  monthRange,
  TASK_STATUSES,
  type MonthKey,
  type Task,
  type TaskAssigneeStats,
  type taskHomeQuerySchema,
  type TaskHomeResponse,
  type TaskStatus,
} from '@effinance/shared';
import type { z } from 'zod';
import { contacts, tasks } from '../../db/schema';
import { ForbiddenError, NotFoundError } from '../../lib/errors';
import { TASK_ADMIN_MESSAGE, type TaskContext } from './access';
import { defaultWindow, ensureOccurrences } from './generation';
import { aggregateOccurrences, byUrgency } from './occurrences';
import { clientRef, departmentNames, departmentOfMember, memberRef } from './shared';
import {
  bucketSql,
  CLOSED_SQL,
  COMPLETED_DAY,
  NOT_OCCURRENCE_SQL,
  OCCURRENCE_SQL,
  OPEN_SQL,
  overdueRef,
  priorityRank,
  selectTasks,
  WORK_DATE,
} from './task-rows';

type HomeQuery = z.output<typeof taskHomeQuerySchema>;

const CLOSED_DAY = sql`(coalesce(${tasks.completedAt}, ${tasks.updatedAt}) at time zone 'America/Sao_Paulo')::date`;

const count = (cond: SQL) => sql<number>`count(*) filter (where ${cond})`.mapWith(Number);

function outcomeCounts(today: string) {
  const overdue = sql`${OPEN_SQL} and ${tasks.dueDate} < ${today}`;
  return {
    total: sql<number>`count(*)`.mapWith(Number),
    open: count(
      sql`${OPEN_SQL} and not (${tasks.dueDate} is not null and ${tasks.dueDate} < ${today})`,
    ),
    overdue: count(overdue),
    dueToday: count(sql`${OPEN_SQL} and ${WORK_DATE} = ${today} and ${tasks.dueDate} >= ${today}`),
    doneOnTime: count(
      sql`${tasks.status} = 'done' and (${tasks.dueDate} is null or ${COMPLETED_DAY} <= ${tasks.dueDate})`,
    ),
    doneLate: count(
      sql`${tasks.status} = 'done' and ${tasks.dueDate} is not null and ${COMPLETED_DAY} > ${tasks.dueDate}`,
    ),
    canceled: count(sql`${tasks.status} = 'canceled'`),
  };
}

/** The start page's department rule (also the dashboard's): another department or `all` needs `registry`. */
export async function resolveView(ctx: TaskContext, requested: HomeQuery['departmentId']) {
  const [own, names] = await Promise.all([
    departmentOfMember(ctx.db, ctx.workspaceId, ctx.userId),
    departmentNames(ctx.db, ctx.workspaceId),
  ]);
  if (requested === 'all') {
    // The department picker of the home page is for whoever manages the task registries (`registry`;
    // by default the administrators, as in phases 1 and 2).
    if (!ctx.permissions.registry) throw new ForbiddenError(TASK_ADMIN_MESSAGE);
    return { view: 'all' as const, department: null };
  }
  if (requested && requested !== own) {
    if (!ctx.permissions.registry) throw new ForbiddenError('Você só pode ver o resumo do seu departamento');
    if (!names.has(requested)) throw new NotFoundError('Departamento não encontrado');
  }
  const id = requested ?? own;
  if (!id) return { view: 'mine' as const, department: null };
  return { view: 'department' as const, department: { id, name: names.get(id)! } };
}

/** Tasks listed in `mine` (the counts cover all of them). */
const MINE_LIMIT = 20;

/** Overdue first (oldest first), then by due date, no due date last. */
function byDue(list: Task[], today: string): Task[] {
  return [...list].sort((a, b) => {
    const ao = a.dueDate !== null && a.dueDate < today ? 0 : 1;
    const bo = b.dueDate !== null && b.dueDate < today ? 0 : 1;
    return ao - bo || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
  });
}

export async function taskHome(ctx: TaskContext, q: HomeQuery): Promise<TaskHomeResponse> {
  const month: MonthKey = q.month ?? monthKey(ctx.today);
  await ensureOccurrences(ctx, [...new Set([month, ...defaultWindow(ctx.today)])]);
  const { from, to } = monthRange(month);
  const t = ctx.today;
  const { view, department } = await resolveView(ctx, q.departmentId);
  const scope =
    view === 'department'
      ? eq(tasks.departmentId, department!.id)
      : view === 'mine'
        ? eq(tasks.assigneeId, ctx.userId)
        : undefined;
  const week = addDays(t, 7);
  const inMonth = or(
    OPEN_SQL,
    and(gte(tasks.dueDate, from), lte(tasks.dueDate, to)),
    and(CLOSED_SQL, sql`${CLOSED_DAY} between ${from} and ${to}`),
  );
  // Occurrences (generated ahead) count when they are of the competence, or still open and either late
  // (an earlier competence) or due within the next 7 days.
  const unit = sql`((${NOT_OCCURRENCE_SQL} and ${inMonth}) or (${OCCURRENCE_SQL} and (${tasks.competence} = ${month} or (${OPEN_SQL} and (${tasks.competence} < ${month} or ${tasks.dueDate} <= ${week})))))`;
  const where = and(eq(tasks.workspaceId, ctx.workspaceId), scope, unit);
  // "Minhas tarefas": occurrences up to the next competence.
  const horizon = sql`(${NOT_OCCURRENCE_SQL} or ${tasks.competence} <= ${addMonthKey(monthKey(t), 1)})`;
  const outcomes = outcomeCounts(t);
  const targetMissed = sql`${OPEN_SQL} and ${bucketSql('targetMissed', t)}`;
  // My open items in any department: counted in SQL; the first tasks loaded (occurrences aggregated).
  const mineOpen = and(eq(tasks.workspaceId, ctx.workspaceId), eq(tasks.assigneeId, ctx.userId), OPEN_SQL, horizon);

  const [[totals], perStatus, perAssignee, perClient, [oldest], mine, [mineTotals], mineOccurrences, obligations] =
    await Promise.all([
      ctx.db
        .select({
          ...outcomes,
          targetMissed: count(targetMissed),
          targetMissedNext: sql<string | null>`min(${tasks.dueDate}) filter (where ${targetMissed})::text`,
          appointmentsToday: count(sql`${OPEN_SQL} and ${tasks.dueDate} = ${t} and ${tasks.startTime} is not null`),
          dueNext7: count(sql`${OPEN_SQL} and ${WORK_DATE} > ${t} and ${WORK_DATE} <= ${week}`),
          waitingClient: count(sql`${tasks.status} = 'waiting_client'`),
          recurring: count(OCCURRENCE_SQL),
        })
        .from(tasks)
        .where(where),
      ctx.db
        .select({ status: tasks.status, n: sql<number>`count(*)`.mapWith(Number) })
        .from(tasks)
        .where(where)
        .groupBy(tasks.status),
      ctx.db
        .select({ id: tasks.assigneeId, ...outcomes })
        .from(tasks)
        .where(where)
        .groupBy(tasks.assigneeId),
      ctx.db
        .select({
          id: tasks.clientId,
          name: contacts.name,
          tradeName: contacts.tradeName,
          ...outcomes,
        })
        .from(tasks)
        .leftJoin(
          contacts,
          and(eq(contacts.workspaceId, tasks.workspaceId), eq(contacts.id, tasks.clientId)),
        )
        .where(where)
        .groupBy(tasks.clientId, contacts.name, contacts.tradeName),
      selectTasks(ctx, {
        where: and(scope, OPEN_SQL, sql`${tasks.dueDate} < ${t}`),
        orderBy: [asc(tasks.dueDate), sql`${priorityRank}`],
        limit: 1,
      }),
      selectTasks(ctx, { where: and(mineOpen, NOT_OCCURRENCE_SQL), limit: MINE_LIMIT }),
      ctx.db
        .select({
          open: sql<number>`count(*)`.mapWith(Number),
          overdue: count(sql`${tasks.dueDate} < ${t}`),
          dueToday: count(sql`${WORK_DATE} = ${t} and ${tasks.dueDate} >= ${t}`),
        })
        .from(tasks)
        .where(mineOpen),
      aggregateOccurrences(ctx, and(eq(tasks.assigneeId, ctx.userId), OPEN_SQL, horizon)),
      aggregateOccurrences(ctx, and(scope, eq(tasks.competence, month))),
    ]);
  const sum = totals!;
  const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<
    TaskStatus,
    number
  >;
  for (const row of perStatus) byStatus[row.status] = row.n;

  const byAssignee: TaskAssigneeStats[] = perAssignee
    .map((r) => ({
      assignee: memberRef(ctx, r.id),
      total: r.total,
      open: r.open,
      overdue: r.overdue,
      dueToday: r.dueToday,
      doneOnTime: r.doneOnTime,
      doneLate: r.doneLate,
      canceled: r.canceled,
    }))
    // "Quem concentra mais": overdue first, then everything still open, then volume.
    .sort(
      (a, b) =>
        b.overdue - a.overdue || b.open + b.overdue - (a.open + a.overdue) || b.total - a.total,
    );

  const byClient = perClient
    .map((r) => ({
      client: clientRef({ id: r.id, name: r.name, tradeName: r.tradeName }),
      total: r.total,
      open: r.open + r.overdue,
      overdue: r.overdue,
    }))
    .filter((r) => r.open > 0)
    .sort(
      (a, b) =>
        b.open - a.open ||
        b.overdue - a.overdue ||
        (a.client?.name ?? '').localeCompare(b.client?.name ?? '', 'pt-BR'),
    );

  const obligationTotals = obligations.reduce(
    (acc, o) => ({
      total: acc.total + o.total,
      done: acc.done + o.done,
      canceled: acc.canceled + o.canceled,
      pending: acc.pending + o.pending,
    }),
    { total: 0, done: 0, canceled: 0, pending: 0 },
  );
  const [obligationOverdue] = await ctx.db
    .select({ n: count(sql`${OPEN_SQL} and ${tasks.dueDate} < ${t}`) })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, ctx.workspaceId), OCCURRENCE_SQL, scope, eq(tasks.competence, month)));

  return {
    today: t,
    month,
    view,
    department,
    totals: {
      total: sum.total,
      byStatus,
      open: sum.open + sum.overdue,
      overdue: sum.overdue,
      targetMissed: sum.targetMissed,
      targetMissedNextLegalDate: sum.targetMissedNext,
      dueToday: sum.dueToday,
      appointmentsToday: sum.appointmentsToday,
      dueNext7Days: sum.dueNext7,
      waitingClient: sum.waitingClient,
      doneOnTime: sum.doneOnTime,
      doneLate: sum.doneLate,
      canceled: sum.canceled,
      standalone: sum.total - sum.recurring,
      recurring: sum.recurring,
    },
    oldestOverdue: oldest ? overdueRef(oldest, t) : null,
    byAssignee,
    byClient,
    mine: {
      open: mineTotals?.open ?? 0,
      overdue: mineTotals?.overdue ?? 0,
      dueToday: mineTotals?.dueToday ?? 0,
      tasks: byDue(mine, t).slice(0, MINE_LIMIT),
      occurrences: mineOccurrences.sort(byUrgency),
    },
    obligations: {
      competence: month,
      ...obligationTotals,
      overdue: obligationOverdue?.n ?? 0,
      items: obligations.sort(byUrgency),
    },
  };
}
