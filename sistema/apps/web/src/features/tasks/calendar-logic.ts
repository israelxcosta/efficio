// Calendar of Tarefas (spec §7.6): the weeks of the month grid (Sunday first), the national holidays,
// and the items of each day — standalone tasks by due date, recurring occurrences on their target —
// filtered by the situation and ordered appointments first, then overdue, then by priority. Pure
// functions, tested in phase2-logic.test.ts.

import {
  addDays,
  dayOfWeek,
  isOpenTaskStatus,
  nationalHolidayName,
  TASK_PRIORITY_RANK,
  type ISODate,
  type MonthKey,
  type RecurringOccurrence,
  type Task,
  type TaskPriority,
  type TaskSituation,
} from '@effinance/shared';
import { calendarRange } from './url-state';

export interface CalendarDay {
  date: ISODate;
  inMonth: boolean;
  weekend: boolean;
  holiday: string | null;
}

/** Weeks of the month grid, from the Sunday before the 1st to the Saturday after the last day. */
export function calendarWeeks(month: MonthKey): CalendarDay[][] {
  const { from, to } = calendarRange(month);
  const weeks: CalendarDay[][] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (dayOfWeek(d) === 0) weeks.push([]);
    const dow = dayOfWeek(d);
    weeks.at(-1)!.push({ date: d, inMonth: d.slice(0, 7) === month, weekend: dow === 0 || dow === 6, holiday: nationalHolidayName(d) });
  }
  return weeks;
}

export type CalendarItem = { type: 'task'; key: string; task: Task } | { type: 'occurrence'; key: string; occurrence: RecurringOccurrence };

function taskMatches(t: Task, situation: TaskSituation): boolean {
  if (situation === 'open') return isOpenTaskStatus(t.status);
  if (situation === 'overdue') return t.overdue;
  if (situation === 'waiting') return t.status === 'waiting_client';
  if (situation === 'done') return t.status === 'done';
  return true;
}

function occurrenceMatches(o: RecurringOccurrence, situation: TaskSituation): boolean {
  if (situation === 'open' || situation === 'waiting') return o.pending > 0;
  if (situation === 'overdue') return o.overdue;
  if (situation === 'done') return o.done > 0;
  return true;
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

function rank(item: CalendarItem): [number, string, number, string] {
  if (item.type === 'task') {
    const t = item.task;
    return [t.startTime ? 0 : t.overdue ? 1 : 2, t.startTime ?? '', TASK_PRIORITY_RANK[t.priority], t.title];
  }
  const o = item.occurrence;
  return [o.overdue ? 1 : 2, '', TASK_PRIORITY_RANK.medium, o.name];
}

/**
 * Items per day: tasks on their due date and occurrences on their target, with the situation and the
 * search/priority of the list applied (the calendar endpoint does not filter those).
 */
export function itemsByDay(
  tasks: Task[],
  occurrences: RecurringOccurrence[],
  f: { situation: TaskSituation; search?: string; priority?: TaskPriority | '' },
): Map<ISODate, CalendarItem[]> {
  const q = f.search ? normalize(f.search.trim()) : '';
  const out = new Map<ISODate, CalendarItem[]>();
  const push = (date: ISODate, item: CalendarItem) => out.set(date, [...(out.get(date) ?? []), item]);
  for (const t of tasks) {
    if (!t.dueDate || !taskMatches(t, f.situation)) continue;
    if (q && !normalize(t.title).includes(q)) continue;
    if (f.priority && t.priority !== f.priority) continue;
    push(t.dueDate, { type: 'task', key: t.id, task: t });
  }
  for (const o of occurrences) {
    if (!occurrenceMatches(o, f.situation)) continue;
    if (q && !normalize(o.name).includes(q)) continue;
    if (f.priority && f.priority !== 'medium') continue;
    push(o.targetDate, { type: 'occurrence', key: `${o.recurringTaskId}:${o.periodKey}`, occurrence: o });
  }
  for (const [date, items] of out) {
    out.set(
      date,
      [...items].sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        return ra[0] - rb[0] || ra[1].localeCompare(rb[1]) || ra[2] - rb[2] || ra[3].localeCompare(rb[3], 'pt-BR');
      }),
    );
  }
  return out;
}

/** Number of items of the month (the empty band and the agenda). */
export function monthItemCount(byDay: Map<ISODate, CalendarItem[]>, month: MonthKey): number {
  let n = 0;
  for (const [date, items] of byDay) if (date.slice(0, 7) === month) n += items.length;
  return n;
}

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** "Sex, 30/10" (+ " · Finados" on a holiday): the day headers of the agenda. */
export function agendaDayTitle(day: CalendarDay): string {
  return `${WEEKDAY_SHORT[dayOfWeek(day.date)]}, ${day.date.slice(8, 10)}/${day.date.slice(5, 7)}${day.holiday ? ` · ${day.holiday}` : ''}`;
}

export const CALENDAR_WEEKDAYS = WEEKDAY_SHORT;
