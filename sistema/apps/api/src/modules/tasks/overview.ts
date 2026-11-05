// The personal area ("clicar no avatar", Effy's `view-perfil`): `GET /tasks/me/overview`, what the screen
// needs beyond the existing endpoints (calendar with `scope=mine|department`, notes, start page, dashboard).
// Everything in SQL aggregates over tasks and occurrences (one per client, like the start page):
// - open: what is open with you now, in any department (the horizon and visibility of "Minhas");
// - productivity: what you concluded (you clicked "Concluir") in the month — on time = conclusion day in
//   the office time zone ≤ due date (legal deadline), without due date counts on time — and 6 months of trend;
// - upcoming: your next 14 days (tasks one by one; the registry's occurrences aggregated);
// - workload: your open items per weekday in the next 4 weeks and your conclusions per weekday in the last 8;
// - comparison: you × the average per current member of your department, only with
//   MIN_DEPARTMENT_COMPARISON_MEMBERS or more (fewer would reveal a colleague's own numbers);
// - insights: sentences from the above (overview-insights.ts).
// No individual number of anyone else ever leaves here.

import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import {
  addDays,
  addMonthKey,
  MIN_DEPARTMENT_COMPARISON_MEMBERS,
  monthKey,
  type MonthKey,
  type TaskComparisonFigures,
  type TaskMyOverviewResponse,
  type taskMyOverviewQuerySchema,
  type TaskProductivityPoint,
} from '@effinance/shared';
import type { z } from 'zod';
import { taskDepartmentMembers, tasks } from '../../db/schema';
import type { TaskContext } from './access';
import { defaultWindow, ensureOccurrences } from './generation';
import { aggregateOccurrences } from './occurrences';
import { buildMyInsights } from './overview-insights';
import { departmentNames, departmentOfMember } from './shared';
import { bucketSql, COMPLETED_DAY, OPEN_SQL, overdueRef, priorityRank, ROW_SQL, selectTasks, visibleSeriesSql, WORK_DATE } from './task-rows';

type OverviewQuery = z.output<typeof taskMyOverviewQuerySchema>;

/** Next days of `upcoming`, weeks of `workload.due` and of `workload.concluded`, months of the trend. */
export const UPCOMING_DAYS = 14;
export const UPCOMING_TASKS = 15;
const WORKLOAD_DAYS = 28;
const CONCLUDED_DAYS = 56;
const TREND_MONTHS = 6;

const count = (cond?: SQL) => (cond ? sql<number>`count(*) filter (where ${cond})` : sql<number>`count(*)`).mapWith(Number);
const rate = (onTime: number, concluded: number) => (concluded > 0 ? Math.round((onTime / concluded) * 100) : null);
const round1 = (n: number) => Math.round(n * 10) / 10;
const ON_TIME = sql`${tasks.dueDate} is null or ${COMPLETED_DAY} <= ${tasks.dueDate}`;
const CREATED_DAY = sql`(${tasks.createdAt} at time zone 'America/Sao_Paulo')::date`;
/** First instant of an office day (a range of `completed_at`: the partial index `tasks_completed_idx` serves it). */
const dayStart = (day: string) => sql`((${day}::date)::timestamp at time zone 'America/Sao_Paulo')`;
/** Conclusions in [from, to) office days; `status = 'done'` literal so the partial index matches. */
const concludedBetween = (from: string, to: string) =>
  and(sql`${tasks.status} = 'done'`, sql`${tasks.completedAt} >= ${dayStart(from)}`, sql`${tasks.completedAt} < ${dayStart(to)}`);

export async function myOverview(ctx: TaskContext, q: OverviewQuery): Promise<TaskMyOverviewResponse> {
  const t = ctx.today;
  const current = monthKey(t);
  const month: MonthKey = q.month ?? current;
  await ensureOccurrences(ctx, defaultWindow(t));
  const tomorrow = addDays(t, 1);
  const week = addDays(t, 7);
  const upcomingTo = addDays(t, UPCOMING_DAYS);
  const dueTo = addDays(t, WORKLOAD_DAYS - 1);
  const concludedFrom = addDays(t, -(CONCLUDED_DAYS - 1));
  const trendFrom = addMonthKey(month, -(TREND_MONTHS - 1));
  const ws = eq(tasks.workspaceId, ctx.workspaceId);
  // Open with someone now: occurrences up to the next competence, tasks' recurrences as in the list.
  const openNow = and(OPEN_SQL, sql`(${tasks.recurringTaskId} is null or ${tasks.competence} <= ${addMonthKey(current, 1)})`, visibleSeriesSql(t));
  const mine = eq(tasks.assigneeId, ctx.userId);
  const targetMissed = sql`${bucketSql('targetMissed', t)}`;
  const upcomingRange = sql`${WORK_DATE} between ${t}::date and ${upcomingTo}::date and ${tasks.dueDate} >= ${t}`;

  const [myDepartment, names] = await Promise.all([departmentOfMember(ctx.db, ctx.workspaceId, ctx.userId), departmentNames(ctx.db, ctx.workspaceId)]);
  const [[open], [oldest], trendRows, upcomingTasks, upcomingOccurrences, [upcomingCount], dueRows, concludedRows, members] = await Promise.all([
    ctx.db
      .select({
        total: count(),
        overdue: count(sql`${tasks.dueDate} < ${t}`),
        dueToday: count(sql`${WORK_DATE} = ${t} and ${tasks.dueDate} >= ${t}`),
        dueTomorrow: count(sql`${WORK_DATE} = ${tomorrow} and ${tasks.dueDate} >= ${t}`),
        next7Days: count(sql`${WORK_DATE} > ${t} and ${WORK_DATE} <= ${week}`),
        targetMissed: count(targetMissed),
        targetMissedNext: sql<string | null>`min(${tasks.dueDate}) filter (where ${targetMissed})::text`,
        waitingClient: count(sql`${tasks.status} = 'waiting_client'`),
        noDueDate: count(sql`${tasks.dueDate} is null`),
      })
      .from(tasks)
      .where(and(ws, mine, openNow)),
    selectTasks(ctx, { where: and(mine, openNow, sql`${tasks.dueDate} < ${t}`), orderBy: [asc(tasks.dueDate), sql`${priorityRank}`], limit: 1 }),
    ctx.db
      .select({
        month: sql<string>`to_char(${COMPLETED_DAY}, 'YYYY-MM')`,
        concluded: count(),
        onTime: count(ON_TIME),
        averageDays: sql<number | null>`round(avg(greatest(${COMPLETED_DAY} - ${CREATED_DAY}, 0)), 1)`.mapWith((v) => (v === null ? null : Number(v))),
      })
      .from(tasks)
      .where(and(ws, eq(tasks.completedBy, ctx.userId), concludedBetween(`${trendFrom}-01`, `${addMonthKey(month, 1)}-01`)))
      .groupBy(sql`to_char(${COMPLETED_DAY}, 'YYYY-MM')`),
    selectTasks(ctx, {
      where: and(mine, openNow, ROW_SQL, upcomingRange),
      orderBy: [sql`${WORK_DATE} asc`, sql`${tasks.startTime} asc nulls last`, sql`${priorityRank}`, sql`lower(${tasks.title})`, sql`${tasks.id}`],
      limit: UPCOMING_TASKS,
    }),
    aggregateOccurrences(ctx, and(mine, OPEN_SQL, sql`${tasks.targetDate} between ${t}::date and ${upcomingTo}::date and ${tasks.dueDate} >= ${t}`)),
    ctx.db.select({ n: count() }).from(tasks).where(and(ws, mine, openNow, upcomingRange)),
    // The next 4 weeks of load: every open item (not only the visible ones of a recurrence).
    ctx.db
      .select({ weekday: sql<number>`extract(isodow from ${WORK_DATE})::int`.mapWith(Number), n: count() })
      .from(tasks)
      .where(and(ws, mine, OPEN_SQL, sql`${WORK_DATE} between ${t}::date and ${dueTo}::date`))
      .groupBy(sql`extract(isodow from ${WORK_DATE})`),
    ctx.db
      .select({ weekday: sql<number>`extract(isodow from ${COMPLETED_DAY})::int`.mapWith(Number), n: count() })
      .from(tasks)
      .where(and(ws, eq(tasks.completedBy, ctx.userId), concludedBetween(concludedFrom, addDays(t, 1))))
      .groupBy(sql`extract(isodow from ${COMPLETED_DAY})`),
    myDepartment
      ? ctx.db
          .select({ userId: taskDepartmentMembers.userId })
          .from(taskDepartmentMembers)
          .where(and(eq(taskDepartmentMembers.workspaceId, ctx.workspaceId), eq(taskDepartmentMembers.departmentId, myDepartment)))
      : Promise.resolve([] as { userId: string }[]),
  ]);

  const byMonth = new Map(trendRows.map((r) => [r.month, r]));
  const trend: TaskProductivityPoint[] = [];
  for (let m = trendFrom; m <= month; m = addMonthKey(m, 1)) {
    const r = byMonth.get(m);
    const concluded = r?.concluded ?? 0;
    const onTime = r?.onTime ?? 0;
    trend.push({ month: m, concluded, onTime, late: concluded - onTime, onTimeRate: rate(onTime, concluded) });
  }
  const point = trend.at(-1)!;
  const previous = trend.at(-2);
  const rateChange = point.onTimeRate !== null && previous?.onTimeRate != null ? point.onTimeRate - previous.onTimeRate : null;

  const o = open!;
  const openBlock: TaskMyOverviewResponse['open'] = {
    total: o.total,
    overdue: o.overdue,
    dueToday: o.dueToday,
    dueTomorrow: o.dueTomorrow,
    next7Days: o.next7Days,
    targetMissed: o.targetMissed,
    targetMissedNextLegalDate: o.targetMissedNext,
    waitingClient: o.waitingClient,
    noDueDate: o.noDueDate,
    oldestOverdue: oldest ? overdueRef(oldest, t) : null,
  };

  let comparison: TaskMyOverviewResponse['comparison'] = null;
  if (myDepartment) {
    const ids = members.map((m) => m.userId);
    const me: TaskComparisonFigures = { concluded: point.concluded, onTimeRate: point.onTimeRate, open: o.total, overdue: o.overdue };
    let average: TaskComparisonFigures | null = null;
    if (ids.length >= MIN_DEPARTMENT_COMPARISON_MEMBERS) {
      const [[done], [load]] = await Promise.all([
        ctx.db
          .select({ concluded: count(), onTime: count(ON_TIME) })
          .from(tasks)
          .where(and(ws, inArray(tasks.completedBy, ids), concludedBetween(`${month}-01`, `${addMonthKey(month, 1)}-01`))),
        ctx.db
          .select({ open: count(), overdue: count(sql`${tasks.dueDate} < ${t}`) })
          .from(tasks)
          .where(and(ws, inArray(tasks.assigneeId, ids), openNow)),
      ]);
      average = {
        concluded: round1(done!.concluded / ids.length),
        onTimeRate: rate(done!.onTime, done!.concluded),
        open: round1(load!.open / ids.length),
        overdue: round1(load!.overdue / ids.length),
      };
    }
    comparison = { department: { id: myDepartment, name: names.get(myDepartment) ?? '' }, members: ids.length, me, average };
  }

  const dueBy = new Map(dueRows.map((r) => [r.weekday, r.n]));
  const concludedBy = new Map(concludedRows.map((r) => [r.weekday, r.n]));
  const days = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, due: dueBy.get(weekday) ?? 0, concluded: concludedBy.get(weekday) ?? 0 }));
  const productivity: TaskMyOverviewResponse['productivity'] = {
    ...point,
    averageDays: byMonth.get(month)?.averageDays ?? null,
    trend,
    rateChange,
  };

  return {
    today: t,
    month,
    department: myDepartment ? { id: myDepartment, name: names.get(myDepartment) ?? '' } : null,
    open: openBlock,
    productivity,
    upcoming: {
      from: t,
      to: upcomingTo,
      total: upcomingCount?.n ?? 0,
      tasks: upcomingTasks,
      occurrences: upcomingOccurrences,
    },
    workload: { dueFrom: t, dueTo, concludedFrom, days },
    comparison,
    insights: buildMyInsights({
      today: t,
      month,
      current: month === current,
      open: openBlock,
      productivity: { concluded: point.concluded, onTime: point.onTime, late: point.late, onTimeRate: point.onTimeRate, rateChange },
      comparison,
      workload: days,
    }),
  };
}
