// Rules of the task module shared by the API and the web: open/overdue, due-date groups, the office
// time zone, the national holiday calendar, the schedule of recurring tasks (competence, reference
// month, legal deadline, internal target, non-business days) and the derived situation of an
// occurrence.

import {
  OPEN_TASK_STATUSES,
  RECURRENCE_PERIOD_MONTHS,
  TASK_TIME_ZONE,
  type NonBusinessDayRule,
  type OccurrenceSituation,
  type OccurrenceStatus,
  type OpenTaskStatus,
  type RecurrencePeriod,
  type TaskDueBucket,
  type TaskStatus,
} from '../constants';
import {
  addDays,
  addMonthKey,
  dayOfWeek,
  daysInMonth,
  diffInDays,
  monthKey,
  monthRange,
  parseISODate,
  toISODate,
  type ISODate,
  type MonthKey,
} from './dates';

/** Wall-clock time "HH:MM" (00:00–23:59); zero-padded, so string comparison orders it. */
export const TASK_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `YYYY-MM` (monthly and longer periods) or the Monday `YYYY-MM-DD` of a weekly occurrence. */
export const OCCURRENCE_PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;

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

/**
 * "Fora da meta": an open recurring occurrence whose internal target is before today while the legal
 * deadline is today or later (past the legal deadline it is overdue instead).
 */
export function isTargetMissed(
  task: { status: TaskStatus; dueDate: ISODate | null; targetDate: ISODate | null },
  today: ISODate,
): boolean {
  return (
    isOpenTaskStatus(task.status) &&
    task.targetDate !== null &&
    task.targetDate < today &&
    !(task.dueDate !== null && task.dueDate < today)
  );
}

/** Days past the due date (0 when not overdue). */
export function daysOverdue(dueDate: ISODate | null, today: ISODate): number {
  return dueDate !== null && dueDate < today ? diffInDays(today, dueDate) : 0;
}

/**
 * Group of an open item in the list. The work date is the due date of a task and the internal target
 * of a recurring occurrence (`targetDate`): Atrasadas (due date / legal deadline passed), Fora da meta,
 * Hoje, Próximos 7 dias, Mais tarde, Sem vencimento.
 */
export function dueBucketOf(dueDate: ISODate | null, today: ISODate, targetDate: ISODate | null = null): TaskDueBucket {
  if (dueDate === null) return 'noDueDate';
  if (dueDate < today) return 'overdue';
  const work = targetDate ?? dueDate;
  if (work < today) return 'targetMissed';
  if (work === today) return 'today';
  return work <= addDays(today, 7) ? 'next7Days' : 'later';
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

/** Due date of a process step with a relative deadline: N calendar days after the base date (0 = same day). */
export function dueFromRelativeDays(base: ISODate, days: number): ISODate {
  return addDays(base, days);
}

// ---------------------------------------------------------------------------
// Non-business days: weekends and the national holiday calendar.
// ---------------------------------------------------------------------------

/** Returns true when the date is a holiday. Deadline functions take one (default: the national calendar). */
export type HolidayCalendar = (date: ISODate) => boolean;
export const NO_HOLIDAYS: HolidayCalendar = () => false;

/** Easter Sunday (Gregorian calendar; Meeus/Jones/Butcher algorithm). */
export function easterSunday(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toISODate(year, month, day);
}

const FIXED_HOLIDAYS: { md: string; name: string; since?: number }[] = [
  { md: '01-01', name: 'Confraternização Universal' },
  { md: '04-21', name: 'Tiradentes' },
  { md: '05-01', name: 'Dia do Trabalho' },
  { md: '09-07', name: 'Independência do Brasil' },
  { md: '10-12', name: 'Nossa Senhora Aparecida' },
  { md: '11-02', name: 'Finados' },
  { md: '11-15', name: 'Proclamação da República' },
  // Lei 14.759/2023: national holiday from 2024 on.
  { md: '11-20', name: 'Dia Nacional de Zumbi e da Consciência Negra', since: 2024 },
  { md: '12-25', name: 'Natal' },
];

const holidayCache = new Map<number, Map<ISODate, string>>();

/**
 * National holidays of a year (date → name): the fixed ones (Leis 662/1949, 6.802/1980, 14.759/2023)
 * and the ones that move with Easter. Carnaval (Monday and Tuesday) and Corpus Christi are federal
 * "pontos facultativos" without bank operations across the country (Febraban's national calendar), so
 * tax deadlines treat them as non-business days, like Good Friday. State and municipal holidays are
 * not included (a later per-office setting).
 */
export function nationalHolidays(year: number): Map<ISODate, string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const out = new Map<ISODate, string>();
  for (const h of FIXED_HOLIDAYS) {
    if (h.since === undefined || year >= h.since) out.set(`${year}-${h.md}`, h.name);
  }
  const easter = easterSunday(year);
  out.set(addDays(easter, -48), 'Carnaval');
  out.set(addDays(easter, -47), 'Carnaval');
  out.set(addDays(easter, -2), 'Sexta-feira Santa');
  out.set(addDays(easter, 60), 'Corpus Christi');
  holidayCache.set(year, out);
  return out;
}

/** Name of the national holiday on that date, or null. */
export function nationalHolidayName(date: ISODate): string | null {
  return nationalHolidays(parseISODate(date).year).get(date) ?? null;
}

/** The national calendar as a `HolidayCalendar` (the default of every deadline function). */
export const NATIONAL_HOLIDAYS: HolidayCalendar = (date) => nationalHolidayName(date) !== null;

export function isBusinessDay(date: ISODate, holidays: HolidayCalendar = NATIONAL_HOLIDAYS): boolean {
  const dow = dayOfWeek(date);
  return dow !== 0 && dow !== 6 && !holidays(date);
}

/** Moves a deadline off a non-business day: to the previous business day, the next one, or keeps it. */
export function adjustToBusinessDay(
  date: ISODate,
  rule: NonBusinessDayRule,
  holidays: HolidayCalendar = NATIONAL_HOLIDAYS,
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
// Recurring tasks: competences, reference month and deadlines.
// ---------------------------------------------------------------------------

export interface RecurringSchedule {
  period: RecurrencePeriod;
  /**
   * Legal deadline: day of the month (1–31; a day the month lacks becomes its last day) or, for weekly
   * tasks, the ISO weekday (1 = Monday … 7 = Sunday).
   */
  dueDay: number;
  /** Anchor month (1–12) of bimonthly, quarterly, semiannual and annual tasks; null otherwise. */
  dueMonth: number | null;
  /** Internal target ("meta interna"): this many calendar days before the legal deadline (0 = the deadline itself). */
  targetDaysBefore: number;
  nonBusinessDayRule: NonBusinessDayRule;
  /** Months between the competence and the reference month (0 = same, 1 = previous…); weekly: 0. */
  referenceOffset: number;
}

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * Months (1–12) in which the task has occurrences: every month for weekly and monthly tasks; the anchor
 * month and every 2, 3, 6 months from it for bimonthly, quarterly and semiannual ones (anchor 1,
 * quarterly → jan, apr, jul, oct); the anchor month for annual ones.
 */
export function recurringMonths(schedule: Pick<RecurringSchedule, 'period' | 'dueMonth'>): number[] {
  const step = RECURRENCE_PERIOD_MONTHS[schedule.period];
  if (schedule.period === 'weekly' || step === 1) return ALL_MONTHS;
  const anchor = schedule.dueMonth ?? 1;
  return ALL_MONTHS.filter((m) => (((m - anchor) % step) + step) % step === 0);
}

export function occursInCompetence(
  schedule: Pick<RecurringSchedule, 'period' | 'dueMonth'>,
  competence: MonthKey,
): boolean {
  return recurringMonths(schedule).includes(Number(competence.slice(5, 7)));
}

export interface OccurrenceDates {
  /** Legal deadline ("prazo legal"), after the non-business-day rule. */
  legalDueDate: ISODate;
  /** Internal target ("meta interna"): `targetDaysBefore` before the legal deadline, moved back to a business day. */
  targetDate: ISODate;
}

/**
 * Deadlines from the nominal date of the legal deadline: the non-business-day rule (it may cross into
 * the next month when postponing), then the target, always anticipated to a business day (an internal
 * goal never lands after a weekend), never after the legal deadline.
 */
export function deadlinesFrom(
  nominal: ISODate,
  schedule: Pick<RecurringSchedule, 'targetDaysBefore' | 'nonBusinessDayRule'>,
  holidays: HolidayCalendar = NATIONAL_HOLIDAYS,
): OccurrenceDates {
  const legalDueDate = adjustToBusinessDay(nominal, schedule.nonBusinessDayRule, holidays);
  const targetDate =
    schedule.targetDaysBefore > 0
      ? adjustToBusinessDay(addDays(legalDueDate, -schedule.targetDaysBefore), 'anticipate', holidays)
      : legalDueDate;
  return { legalDueDate, targetDate };
}

/** One occurrence of a recurring task (per client, the API adds the client). */
export interface ScheduledOccurrence extends OccurrenceDates {
  /** Identity inside the recurring task: the competence, or the Monday of the week for weekly tasks. */
  periodKey: string;
  /** Month the (nominal) legal deadline falls in: the column of the monthly audit. */
  competence: MonthKey;
  /** The month the obligation refers to ("ref. 09/2026"). */
  referenceMonth: MonthKey;
  /** The legal deadline before the non-business-day rule. */
  nominalDate: ISODate;
  /** Name of the national holiday on the nominal date (why it moved), or null. */
  holiday: string | null;
}

const isoWeekday = (date: ISODate) => dayOfWeek(date) || 7;

/**
 * Occurrences of a recurring task in a competence: none, one (monthly and longer periods: the due day
 * of that month, 31 → last day of short months) or one per week (weekly: the weeks whose deadline
 * weekday falls in the month).
 */
export function occurrencesInCompetence(
  schedule: RecurringSchedule,
  competence: MonthKey,
  holidays: HolidayCalendar = NATIONAL_HOLIDAYS,
): ScheduledOccurrence[] {
  const { year, month } = parseISODate(`${competence}-01`);
  const build = (periodKey: string, nominal: ISODate, referenceMonth: MonthKey): ScheduledOccurrence => ({
    periodKey,
    competence,
    referenceMonth,
    nominalDate: nominal,
    holiday: nationalHolidayName(nominal),
    ...deadlinesFrom(nominal, schedule, holidays),
  });
  if (schedule.period === 'weekly') {
    const out: ScheduledOccurrence[] = [];
    const { from, to } = monthRange(competence);
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (isoWeekday(d) !== schedule.dueDay) continue;
      out.push(build(addDays(d, -(schedule.dueDay - 1)), d, competence));
    }
    return out;
  }
  if (!occursInCompetence(schedule, competence)) return [];
  const nominal = toISODate(year, month, Math.min(schedule.dueDay, daysInMonth(year, month)));
  return [build(competence, nominal, addMonthKey(competence, -schedule.referenceOffset))];
}

/** The competence of a period key (weekly: the month of the deadline weekday of that week). */
export function competenceOfPeriod(schedule: Pick<RecurringSchedule, 'period' | 'dueDay'>, periodKey: string): MonthKey {
  if (periodKey.length === 7) return periodKey;
  return monthKey(addDays(periodKey, schedule.period === 'weekly' ? schedule.dueDay - 1 : 0));
}

/** The next `count` occurrences from a competence on (the registry's preview). */
export function nextOccurrences(
  schedule: RecurringSchedule,
  from: MonthKey,
  count: number,
  holidays: HolidayCalendar = NATIONAL_HOLIDAYS,
): ScheduledOccurrence[] {
  const out: ScheduledOccurrence[] = [];
  for (let m = from, guard = 0; out.length < count && guard < 36; m = addMonthKey(m, 1), guard++) {
    out.push(...occurrencesInCompetence(schedule, m, holidays));
  }
  return out.slice(0, count);
}

/** State of an aggregated occurrence (list row, board column): none done → A fazer; all done → Concluída. */
export function occurrenceStatusOf(counts: {
  total: number;
  done: number;
  inProgress: number;
  canceled?: number;
}): OccurrenceStatus {
  const live = counts.total - (counts.canceled ?? 0);
  if (live > 0 && counts.done >= live) return 'done';
  return counts.done > 0 || counts.inProgress > 0 ? 'in_progress' : 'todo';
}

/** Derived situation of one occurrence (or any task with a due date and an optional target). */
export function occurrenceSituationOf(
  task: { status: TaskStatus; dueDate: ISODate | null; targetDate: ISODate | null; completedAt: string | Date | null },
  today: ISODate,
): OccurrenceSituation {
  if (task.status === 'canceled') return 'canceled';
  if (task.status === 'done') {
    if (task.dueDate === null || task.completedAt === null) return 'done_on_time';
    const day = dateInTimeZone(typeof task.completedAt === 'string' ? new Date(task.completedAt) : task.completedAt);
    return day <= task.dueDate ? 'done_on_time' : 'done_late';
  }
  if (isTaskOverdue(task, today)) return 'overdue';
  if (isTargetMissed(task, today)) return 'target_missed';
  return task.status === 'todo' ? 'not_started' : 'in_progress';
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

/**
 * File name safe to store and to put in a Content-Disposition header: no path, no control or
 * reserved characters, no leading dots, at most 255 characters (the extension is kept).
 */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? '';
  let clean = base
    .normalize('NFC')
    // Control characters, quotes and the characters Windows reserves.
    .replace(/[\u0000-\u001f\u007f-\u009f"*:<>?|]/g, '')
    .replace(/[​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  if (clean.length > 255) {
    const dot = clean.lastIndexOf('.');
    const ext = dot > 0 && clean.length - dot <= 10 ? clean.slice(dot) : '';
    clean = clean.slice(0, 255 - ext.length).trimEnd() + ext;
  }
  return clean || 'arquivo';
}

/** Lower-case extension of a file name without the dot ('' when none). */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}
