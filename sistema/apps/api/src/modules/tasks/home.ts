// Start page summary ("página de início"): the work of a department in a month, computed in SQL so
// the screen never counts on its own. Members see their own department; administrators any
// department or all of them; a member without department sees only what is assigned to them.
//
// Units in phase 1 are tasks: the open ones (whatever the due date) plus those due, concluded or
// canceled in the month. Recurring occurrences join in a later phase (`totals.recurring` stays 0 and
// `mine.occurrences` empty until then).

import { and, eq, gte, lte, or, sql, type SQL } from 'drizzle-orm';
import {
  addDays,
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
import { clientRef, departmentNames, departmentOfMember, memberRef } from './shared';
import { CLOSED_SQL, OPEN_SQL, selectTasks } from './task-rows';

type HomeQuery = z.output<typeof taskHomeQuerySchema>;

/** Calendar day of the conclusion in the office time zone (on time = on or before the due date). */
const COMPLETED_DAY = sql`(${tasks.completedAt} at time zone 'America/Sao_Paulo')::date`;
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
    dueToday: count(sql`${OPEN_SQL} and ${tasks.dueDate} = ${today}`),
    doneOnTime: count(
      sql`${tasks.status} = 'done' and (${tasks.dueDate} is null or ${COMPLETED_DAY} <= ${tasks.dueDate})`,
    ),
    doneLate: count(
      sql`${tasks.status} = 'done' and ${tasks.dueDate} is not null and ${COMPLETED_DAY} > ${tasks.dueDate}`,
    ),
    canceled: count(sql`${tasks.status} = 'canceled'`),
  };
}

async function resolveView(ctx: TaskContext, requested: HomeQuery['departmentId']) {
  const [own, names] = await Promise.all([
    departmentOfMember(ctx.db, ctx.workspaceId, ctx.userId),
    departmentNames(ctx.db, ctx.workspaceId),
  ]);
  if (requested === 'all') {
    if (!ctx.isAdmin) throw new ForbiddenError(TASK_ADMIN_MESSAGE);
    return { view: 'all' as const, department: null };
  }
  if (requested && requested !== own) {
    if (!ctx.isAdmin) throw new ForbiddenError('Você só pode ver o resumo do seu departamento');
    if (!names.has(requested)) throw new NotFoundError('Departamento não encontrado');
  }
  const id = requested ?? own;
  if (!id) return { view: 'mine' as const, department: null };
  return { view: 'department' as const, department: { id, name: names.get(id)! } };
}

/** Overdue first (oldest first), then by due date, no due date last. */
function byUrgency(list: Task[], today: string): Task[] {
  return [...list].sort((a, b) => {
    const ao = a.dueDate !== null && a.dueDate < today ? 0 : 1;
    const bo = b.dueDate !== null && b.dueDate < today ? 0 : 1;
    return ao - bo || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
  });
}

export async function taskHome(ctx: TaskContext, q: HomeQuery): Promise<TaskHomeResponse> {
  const month: MonthKey = q.month ?? monthKey(ctx.today);
  const { from, to } = monthRange(month);
  const t = ctx.today;
  const { view, department } = await resolveView(ctx, q.departmentId);
  const scope =
    view === 'department'
      ? eq(tasks.departmentId, department!.id)
      : view === 'mine'
        ? eq(tasks.assigneeId, ctx.userId)
        : undefined;
  const inMonth = or(
    OPEN_SQL,
    and(gte(tasks.dueDate, from), lte(tasks.dueDate, to)),
    and(CLOSED_SQL, sql`${CLOSED_DAY} between ${from} and ${to}`),
  );
  const where = and(eq(tasks.workspaceId, ctx.workspaceId), scope, inMonth);
  const week = addDays(t, 7);
  const outcomes = outcomeCounts(t);

  const [[totals], perStatus, perAssignee, perClient, mine] = await Promise.all([
    ctx.db
      .select({
        ...outcomes,
        dueNext7: count(
          sql`${OPEN_SQL} and ${tasks.dueDate} > ${t} and ${tasks.dueDate} <= ${week}`,
        ),
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
    selectTasks(ctx, { where: and(eq(tasks.assigneeId, ctx.userId), OPEN_SQL) }),
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
      dueToday: sum.dueToday,
      dueNext7Days: sum.dueNext7,
      doneOnTime: sum.doneOnTime,
      doneLate: sum.doneLate,
      canceled: sum.canceled,
      standalone: sum.total,
      recurring: 0,
    },
    byAssignee,
    byClient,
    mine: {
      open: mine.length,
      overdue: mine.filter((x) => x.overdue).length,
      dueToday: mine.filter((x) => x.dueDate === t).length,
      tasks: byUrgency(mine, t).slice(0, 20),
      occurrences: [],
    },
  };
}
