// Rules of the task module shared by the API and the web: open/overdue, due-date groups, the office
// time zone and the schedule of recurring tasks (legal deadline, internal target, non-business days).

import {
  OPEN_TASK_STATUSES,
  TASK_TIME_ZONE,
  type NonBusinessDayRule,
  type OccurrenceStatus,
  type OpenTaskStatus,
  type RecurrencePeriod,
  type TaskDueBucket,
  type TaskStatus,
} from '../constants';
import {
  addDays,
  dayOfWeek,
  daysInMonth,
  diffInDays,
  parseISODate,
  toISODate,
  type ISODate,
  type MonthKey,
} from './dates';

/** Wall-clock time "HH:MM" (00:00–23:59); zero-padded, so string comparison orders it. */
export const TASK_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isOpenTaskStatus(status: TaskStatus): status is OpenTaskStatus {
  return (OPEN_TASK_STATUSES as readonly TaskStatus[]).includes(status);
}

/** Open and due before today. A task without a due date never becomes overdue. */
export function isTaskOverdue(
  task: { status: TaskStatus; dueDate: ISODate | null },
  today: ISODate,
): boolean {
  return isOpenTaskStatus(task.status) && task.dueDate !== null && task.dueDate < today;
}

/** Days past the due date (0 when not overdue). */
export function daysOverdue(dueDate: ISODate | null, today: ISODate): number {
  return dueDate !== null && dueDate < today ? diffInDays(today, dueDate) : 0;
}

/** Group of an open item in the list: Atrasadas, Hoje, Próximos 7 dias, Mais tarde, Sem vencimento. */
export function dueBucketOf(dueDate: ISODate | null, today: ISODate): TaskDueBucket {
  if (dueDate === null) return 'noDueDate';
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  return dueDate <= addDays(today, 7) ? 'next7Days' : 'later';
}

/** Calendar date of an instant in a time zone (the office's by default), e.g. a conclusion at 23:30 in São Paulo. */
export function dateInTimeZone(instant: Date, timeZone: string = TASK_TIME_ZONE): ISODate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return toISODate(get('year'), get('month'), get('day'));
}

/** Due date of a flow step with a relative deadline: N calendar days after the base date (0 = same day). */
export function dueFromRelativeDays(base: ISODate, days: number): ISODate {
  return addDays(base, days);
}

// ---------------------------------------------------------------------------
// Non-business days. Only weekends for now; holidays plug in through `HolidayCalendar`.
// ---------------------------------------------------------------------------

/**
 * Extension point for holidays: returns true when the date is a holiday. Nothing is shipped yet
 * (national holidays, then state/municipal calendars per office, are a later addition); every
 * deadline function takes one and defaults to `NO_HOLIDAYS`.
 */
export type HolidayCalendar = (date: ISODate) => boolean;
export const NO_HOLIDAYS: HolidayCalendar = () => false;

export function isBusinessDay(date: ISODate, holidays: HolidayCalendar = NO_HOLIDAYS): boolean {
  const dow = dayOfWeek(date);
  return dow !== 0 && dow !== 6 && !holidays(date);
}

/** Moves a deadline off a non-business day: to the previous business day, the next one, or keeps it. */
export function adjustToBusinessDay(
  date: ISODate,
  rule: NonBusinessDayRule,
  holidays: HolidayCalendar = NO_HOLIDAYS,
): ISODate {
  if (rule === 'keep') return date;
  const step = rule === 'anticipate' ? -1 : 1;
  let current = date;
  // A run of non-business days is short; the cap only guards a calendar that marks everything.
  for (let i = 0; i < 31 && !isBusinessDay(current, holidays); i++)
    current = addDays(current, step);
  return current;
}

// ---------------------------------------------------------------------------
// Recurring tasks: in which competences they occur and their deadlines.
// ---------------------------------------------------------------------------

export interface RecurringSchedule {
  period: RecurrencePeriod;
  /** Day of the legal deadline (1–31, clamped to the month's length); null = no deadline. */
  dueDay: number | null;
  /** Anchor month (1–12) of quarterly and annual tasks; null for monthly ones. */
  dueMonth: number | null;
  /** Internal target ("meta interna"): this many calendar days before the legal deadline (0 = same day). */
  targetDaysBefore: number;
  nonBusinessDayRule: NonBusinessDayRule;
}

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * Months (1–12) in which the task occurs. Without a legal due day it shows in the monthly audit every
 * month (but never in lists or the agenda, which need a date). Quarterly: the anchor month and every
 * third month from it (anchor 1 → jan, apr, jul, oct). Annual: the anchor month.
 */
export function recurringMonths(
  schedule: Pick<RecurringSchedule, 'period' | 'dueDay' | 'dueMonth'>,
): number[] {
  if (schedule.dueDay === null || schedule.period === 'monthly') return ALL_MONTHS;
  const anchor = schedule.dueMonth ?? 1;
  if (schedule.period === 'annual') return [anchor];
  return ALL_MONTHS.filter((m) => (((m - anchor) % 3) + 3) % 3 === 0);
}

export function occursInCompetence(
  schedule: Pick<RecurringSchedule, 'period' | 'dueDay' | 'dueMonth'>,
  competence: MonthKey,
): boolean {
  return recurringMonths(schedule).includes(Number(competence.slice(5, 7)));
}

export interface OccurrenceDates {
  /** Legal deadline ("prazo legal"), after the non-business-day rule; null without a due day. */
  legalDueDate: ISODate | null;
  /** Internal target ("meta interna"): `targetDaysBefore` before the legal deadline, moved back to a business day. */
  targetDate: ISODate | null;
}

/**
 * Deadlines of a recurring task in a competence: the due day in that month (31 → last day of short
 * months), then the non-business-day rule (it may cross into the next month when postponing). The
 * target is always anticipated to a business day: an internal goal never lands after a weekend.
 */
export function occurrenceDates(
  schedule: RecurringSchedule,
  competence: MonthKey,
  holidays: HolidayCalendar = NO_HOLIDAYS,
): OccurrenceDates {
  if (schedule.dueDay === null) return { legalDueDate: null, targetDate: null };
  const { year, month } = parseISODate(`${competence}-01`);
  const nominal = toISODate(year, month, Math.min(schedule.dueDay, daysInMonth(year, month)));
  const legalDueDate = adjustToBusinessDay(nominal, schedule.nonBusinessDayRule, holidays);
  const targetDate =
    schedule.targetDaysBefore > 0
      ? adjustToBusinessDay(
          addDays(legalDueDate, -schedule.targetDaysBefore),
          'anticipate',
          holidays,
        )
      : legalDueDate;
  return { legalDueDate, targetDate };
}

/** State of an aggregated occurrence (list row, board column): none done → A fazer; all → Concluída. */
export function occurrenceStatusOf(counts: {
  total: number;
  done: number;
  inProgress: number;
}): OccurrenceStatus {
  if (counts.total > 0 && counts.done >= counts.total) return 'done';
  return counts.done > 0 || counts.inProgress > 0 ? 'in_progress' : 'todo';
}
