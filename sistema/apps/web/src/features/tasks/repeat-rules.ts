// Tarefas › "Não se repete / Repete" (spec §9.4 and §10.6): the form of a task's recurrence, the preview
// with the schedule of the contract (the same as the API, holidays included), the summary sentence, the
// validation with the contract's schema and the mode of the control by kind of task. Pure functions,
// tested in repeat-rules.test.ts.

import {
  dayOfWeek,
  firstScheduledOccurrence,
  formatDateBR,
  monthKey,
  addMonthKey,
  occurrencesInCompetence,
  RECURRENCE_FREQUENCY_LABELS,
  recurringMonths,
  seriesEndDate,
  taskRecurrenceInputSchema,
  type ISODate,
  type RecurrenceFrequency,
  type RecurringSchedule,
  type TaskDetail,
  type TaskRecurrence,
  type TaskRecurrenceInput,
  type TaskLockedField,
  type TaskUpdateInput,
} from '@effinance/shared';
import { shortDate } from './due';
import { shortMonthsWarning } from './recurring-rules';

export interface RepeatForm {
  frequency: RecurrenceFrequency;
  /** "A cada N" (daily, weekly and monthly). */
  interval: string;
  /** Weekly: ISO weekdays (1 = Monday … 7 = Sunday). */
  weekdays: number[];
  /** Monthly and longer: day of the deadline ("31" = or the last day). */
  dueDay: string;
  /** Bimonthly…annual: the anchor month. */
  dueMonth: string;
  /** Daily and weekly: "Só em dias úteis" (`skip`; off = `keep`). */
  skipNonBusiness: boolean;
  /** Monthly and longer: Antecipar, Postergar or Manter. */
  nonBusinessDayRule: 'anticipate' | 'postpone' | 'keep';
  ends: 'never' | 'date' | 'count';
  endDate: ISODate | '';
  count: string;
  targetDaysBefore: string;
  referenceOffset: string;
  /** What the person chose: a new start date no longer moves it. */
  touched: { weekdays: boolean; dueDay: boolean; dueMonth: boolean };
}

const DAY_BASED = new Set<RecurrenceFrequency>(['daily', 'weekly']);
const WITH_INTERVAL = new Set<RecurrenceFrequency>(['daily', 'weekly', 'monthly']);
const ANCHORED = new Set<RecurrenceFrequency>(['bimonthly', 'quarterly', 'semiannual', 'annual']);

/** Whether the frequency takes "A cada N". */
export const hasInterval = (f: RecurrenceFrequency) => WITH_INTERVAL.has(f);
/** Whether the frequency has an anchor month. */
export const isAnchored = (f: RecurrenceFrequency) => ANCHORED.has(f);
/** Daily and weekly: the non-business day is a switch ("Só em dias úteis"), and there is no reference month. */
export const isDayBased = (f: RecurrenceFrequency) => DAY_BASED.has(f);

/** ISO weekday (1 = Monday … 7 = Sunday). */
export const isoWeekday = (date: ISODate) => dayOfWeek(date) || 7;

/** Monthly, every 1, on the weekday, day and month of the start; business days; never ends. */
export function defaultRepeatForm(start: ISODate): RepeatForm {
  return {
    frequency: 'monthly',
    interval: '1',
    weekdays: [isoWeekday(start)],
    dueDay: String(Number(start.slice(8, 10))),
    dueMonth: String(Number(start.slice(5, 7))),
    skipNonBusiness: true,
    nonBusinessDayRule: 'anticipate',
    ends: 'never',
    endDate: '',
    count: '',
    targetDaysBefore: '0',
    referenceOffset: '0',
    touched: { weekdays: false, dueDay: false, dueMonth: false },
  };
}

/** A new "Começa em" moves the weekday, the day and the month that were still the default. */
export function withStartDate(form: RepeatForm, start: ISODate): RepeatForm {
  const d = defaultRepeatForm(start);
  return {
    ...form,
    weekdays: form.touched.weekdays ? form.weekdays : d.weekdays,
    dueDay: form.touched.dueDay ? form.dueDay : d.dueDay,
    dueMonth: form.touched.dueMonth ? form.dueMonth : d.dueMonth,
  };
}

/** The form of a saved rule (editing it changes nothing until the person does). */
export function repeatFormOf(rule: TaskRecurrence): RepeatForm {
  const d = defaultRepeatForm(rule.startDate);
  return {
    frequency: rule.frequency,
    interval: String(rule.interval),
    weekdays: rule.weekdays.length ? [...rule.weekdays] : d.weekdays,
    dueDay: rule.dueDay ? String(rule.dueDay) : d.dueDay,
    dueMonth: rule.dueMonth ? String(rule.dueMonth) : d.dueMonth,
    skipNonBusiness: rule.nonBusinessDayRule === 'skip',
    nonBusinessDayRule: rule.nonBusinessDayRule === 'skip' ? 'anticipate' : rule.nonBusinessDayRule,
    ends: rule.ends,
    endDate: rule.ends === 'date' && rule.endDate ? rule.endDate : '',
    count: rule.count ? String(rule.count) : '',
    targetDaysBefore: String(rule.targetDaysBefore),
    referenceOffset: String(rule.referenceOffset),
    touched: { weekdays: true, dueDay: true, dueMonth: true },
  };
}

/** A whole number from a field ("" and garbage → NaN, which the schema refuses with its message). */
const toInt = (s: string) => (s.trim() === '' ? Number.NaN : Number(s));

function nonBusinessOf(form: Pick<RepeatForm, 'frequency' | 'skipNonBusiness' | 'nonBusinessDayRule'>): TaskRecurrence['nonBusinessDayRule'] {
  if (isDayBased(form.frequency)) return form.skipNonBusiness ? 'skip' : 'keep';
  return form.nonBusinessDayRule;
}

/** The body of `recurrence` in `POST /tasks` and `PATCH /tasks/:id`. */
export function toRecurrenceInput(form: RepeatForm, start: ISODate): TaskRecurrenceInput {
  const f = form.frequency;
  return {
    frequency: f,
    interval: hasInterval(f) ? toInt(form.interval) : 1,
    weekdays: f === 'weekly' ? [...form.weekdays].sort((a, b) => a - b) : [],
    dueDay: isDayBased(f) ? null : toInt(form.dueDay),
    dueMonth: isAnchored(f) ? toInt(form.dueMonth) : null,
    startDate: start || undefined,
    ends: form.ends,
    endDate: form.ends === 'date' ? form.endDate || null : null,
    count: form.ends === 'count' ? toInt(form.count) : null,
    targetDaysBefore: f === 'daily' ? 0 : toInt(form.targetDaysBefore || '0'),
    nonBusinessDayRule: nonBusinessOf(form),
    referenceOffset: isDayBased(f) ? 0 : toInt(form.referenceOffset || '0'),
  };
}

/** The schedule of the contract for the preview (without the end computed from "Após N vezes"). */
export function scheduleOf(form: RepeatForm, start: ISODate): RecurringSchedule {
  const f = form.frequency;
  const int = (s: string, fallback: number) => (Number.isInteger(toInt(s)) ? toInt(s) : fallback);
  return {
    period: f,
    dueDay: isDayBased(f) ? (form.weekdays[0] ?? isoWeekday(start)) : Math.min(31, Math.max(1, int(form.dueDay, Number(start.slice(8, 10))))),
    dueMonth: isAnchored(f) ? Math.min(12, Math.max(1, int(form.dueMonth, Number(start.slice(5, 7))))) : null,
    targetDaysBefore: f === 'daily' ? 0 : Math.max(0, int(form.targetDaysBefore, 0)),
    nonBusinessDayRule: nonBusinessOf(form),
    referenceOffset: isDayBased(f) ? 0 : Math.max(0, int(form.referenceOffset, 0)),
    interval: hasInterval(f) ? Math.max(1, int(form.interval, 1)) : 1,
    weekdays: f === 'weekly' ? form.weekdays : null,
    startDate: start,
    endDate: form.ends === 'date' && form.endDate ? form.endDate : null,
  };
}

/** The schedule with the end of "Após N vezes" (`seriesEndDate`, as the API records it). */
function boundedSchedule(form: RepeatForm, start: ISODate): RecurringSchedule | null {
  if (!start || (form.frequency === 'weekly' && form.weekdays.length === 0)) return null;
  const schedule = scheduleOf(form, start);
  if (form.ends !== 'count') return schedule;
  const count = toInt(form.count);
  if (!Number.isInteger(count) || count < 1) return schedule;
  const end = seriesEndDate(schedule, count);
  return end ? { ...schedule, endDate: end } : schedule;
}

type ErrorKey = 'startDate' | 'interval' | 'weekdays' | 'endDate' | 'count' | 'targetDaysBefore';
const ERROR_KEYS = new Set<string>(['startDate', 'interval', 'weekdays', 'endDate', 'count', 'targetDaysBefore']);

/** Inline errors by the contract's schema (messages with a period), plus "Informe quando começa.". */
export function repeatErrors(form: RepeatForm, start: ISODate | ''): Partial<Record<ErrorKey, string>> {
  if (!start) return { startDate: 'Informe quando começa.' };
  const parsed = taskRecurrenceInputSchema.safeParse(toRecurrenceInput(form, start));
  if (parsed.success) return {};
  const errors: Partial<Record<ErrorKey, string>> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? '');
    if (!ERROR_KEYS.has(key) || errors[key as ErrorKey]) continue;
    errors[key as ErrorKey] = issue.message.endsWith('.') ? issue.message : `${issue.message}.`;
  }
  return errors;
}

/**
 * The next legal deadlines of the rule: the first from `firstScheduledOccurrence` (the task's new due
 * date) and the following ones month by month with `occurrencesInCompetence`, until the end.
 */
export function nextDates(form: RepeatForm, start: ISODate, count = 3): ISODate[] {
  const schedule = boundedSchedule(form, start);
  if (!schedule) return [];
  const first = firstScheduledOccurrence(schedule);
  if (!first) return [];
  const out: ISODate[] = [first.legalDueDate];
  const last = schedule.endDate ? monthKey(schedule.endDate) : null;
  for (let m = monthKey(first.nominalDate), guard = 0; out.length < count && guard < 120 && (!last || m <= last); m = addMonthKey(m, 1), guard++) {
    for (const o of occurrencesInCompetence(schedule, m)) {
      if (o.nominalDate <= first.nominalDate) continue;
      out.push(o.legalDueDate);
      if (out.length >= count) break;
    }
  }
  return out;
}

const DOW_ABBR = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const WEEKDAY_SHORT: Record<number, string> = { 1: 'segunda', 2: 'terça', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sábado', 7: 'domingo' };
const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`;
}

const dm = (d: ISODate) => formatDateBR(d).slice(0, 5);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Esta tarefa passa a vencer em 11/11 (qua), o primeiro dia da regra." when it is not the start date. */
export function firstDateNotice(form: RepeatForm, start: ISODate): string | null {
  const schedule = boundedSchedule(form, start);
  const first = schedule ? firstScheduledOccurrence(schedule) : null;
  if (!first || first.legalDueDate === start) return null;
  return `Esta tarefa passa a vencer em ${dm(first.legalDueDate)} (${DOW_ABBR[dayOfWeek(first.legalDueDate)]}), o primeiro dia da regra.`;
}

type RuleShape = Pick<TaskRecurrence, 'frequency' | 'interval' | 'weekdays' | 'dueDay' | 'dueMonth' | 'nonBusinessDayRule'>;

function ruleOfForm(form: RepeatForm, start: ISODate): RuleShape {
  const s = scheduleOf(form, start);
  return {
    frequency: form.frequency,
    interval: s.interval ?? 1,
    weekdays: [...form.weekdays].sort((a, b) => a - b),
    dueDay: isDayBased(form.frequency) ? null : s.dueDay,
    dueMonth: s.dueMonth,
    nonBusinessDayRule: s.nonBusinessDayRule,
  };
}

/** "na segunda e na quarta", "no sábado". */
const onWeekdays = (days: number[]) => joinList(days.map((d) => `${d >= 6 ? 'no' : 'na'} ${WEEKDAY_SHORT[d] ?? ''}`));

/** First part of the summary: "Toda semana na segunda e na quarta", "Todo dia útil", "Todo dia 31 (em fevereiro, dia 28)". */
function rulePhrase(r: RuleShape): string {
  const n = Math.max(1, r.interval);
  if (r.frequency === 'daily') {
    if (n === 1) return r.nonBusinessDayRule === 'skip' ? 'Todo dia útil' : 'Todo dia';
    return `A cada ${n} dias${r.nonBusinessDayRule === 'skip' ? ', só em dias úteis' : ''}`;
  }
  if (r.frequency === 'weekly') return `${n === 1 ? 'Toda semana' : `A cada ${n} semanas`} ${onWeekdays(r.weekdays)}`;
  const day = r.dueDay ?? 1;
  let text: string;
  if (r.frequency === 'monthly') text = n === 1 ? `Todo dia ${day}` : `A cada ${n} meses, no dia ${day}`;
  else if (r.frequency === 'annual') text = `Todo ano em ${String(day).padStart(2, '0')}/${String(r.dueMonth ?? 1).padStart(2, '0')}`;
  else text = `Dia ${day} de ${joinList(recurringMonths({ period: r.frequency, dueMonth: r.dueMonth }).map((m) => MONTH_ABBR[m - 1]!))}`;
  const short = shortMonthsWarning({ period: r.frequency, dueDay: day, dueMonth: r.dueMonth });
  return short ? `${text} (${short.charAt(0).toLowerCase()}${short.slice(1).replace(/\.$/, '')})` : text;
}

function summaryOf(r: RuleShape, dates: ISODate[], end: { ends: RepeatForm['ends']; endDate: ISODate | null; count: number | null }, today: ISODate): string {
  const next = dates.length ? ` · próximas: ${joinList(dates.map((d) => shortDate(d, today)))}` : ' · nenhuma data no período';
  const tail =
    end.ends === 'count' && end.count ? ` · ${plural(end.count, 'vez', 'vezes')}` : end.ends === 'date' && end.endDate ? ` · até ${shortDate(end.endDate, today)}` : '';
  return `${rulePhrase(r)}${next}${tail}.`;
}

/** "Toda semana na segunda e na quarta · próximas: 11/11, 16/11 e 18/11 · 12 vezes." (the form). */
export function repeatSummary(form: RepeatForm, start: ISODate, today: ISODate): string {
  const count = toInt(form.count);
  return summaryOf(ruleOfForm(form, start), nextDates(form, start, 3), { ends: form.ends, endDate: form.endDate || null, count: Number.isInteger(count) ? count : null }, today);
}

/** The same sentence for a saved series, with the dates the API computed (`upcoming`). */
export function repeatSummaryOf(rule: TaskRecurrence, today: ISODate): string {
  return summaryOf(rule, rule.upcoming.slice(0, 3).map((u) => u.legalDueDate), { ends: rule.ends, endDate: rule.endDate, count: rule.count }, today);
}

/** A few words for subtitles and toasts: "toda segunda", "a cada 2 semanas", "todo dia útil", "todo dia 10", "trimestral". */
export function repeatShortText(rule: Pick<TaskRecurrence, 'frequency' | 'interval' | 'weekdays' | 'dueDay' | 'nonBusinessDayRule'>): string {
  const n = Math.max(1, rule.interval);
  if (rule.frequency === 'daily') return n > 1 ? `a cada ${n} dias` : rule.nonBusinessDayRule === 'skip' ? 'todo dia útil' : 'todo dia';
  if (rule.frequency === 'weekly') {
    if (n > 1) return `a cada ${n} semanas`;
    const days = [...rule.weekdays].sort((a, b) => a - b);
    if (days.length === 0) return 'toda semana';
    return `${days[0]! >= 6 ? 'todo' : 'toda'} ${joinList(days.map((d) => WEEKDAY_SHORT[d] ?? ''))}`;
  }
  if (rule.frequency === 'monthly') return n > 1 ? `a cada ${n} meses` : `todo dia ${rule.dueDay ?? 1}`;
  return RECURRENCE_FREQUENCY_LABELS[rule.frequency].toLowerCase();
}

/**
 * How the control behaves on a task (spec §9.4, "Detalhe"): `hidden` on process steps; `registry` on an
 * occurrence of the registry (disabled); `series` on an occurrence of an active repetition; `ended` on
 * one whose series stopped; `convert` on the rest (a task without repetition).
 */
export type RepeatMode = 'convert' | 'ended' | 'series' | 'registry' | 'hidden';

export function repeatModeOf(task: Pick<TaskDetail, 'kind' | 'occurrence' | 'recurrence'>): RepeatMode {
  if (task.kind === 'flow') return 'hidden';
  if (task.occurrence?.origin === 'registry') return 'registry';
  if (task.recurrence?.active) return 'series';
  if (task.occurrence?.origin === 'task') return 'ended';
  return 'convert';
}

// ---------------------------------------------------------------------------
// "Só esta" or "Esta e as próximas" on an occurrence of a repetition (spec §9.4)
// ---------------------------------------------------------------------------

export type ApplyScope = 'occurrence' | 'series';

/**
 * Fields of the series: on "Só esta" they are disabled ("Mude em Esta e as próximas."). The department
 * queue too: the API refuses it on a single occurrence.
 */
const SERIES_FIELDS: TaskLockedField[] = ['title', 'clientId', 'categoryId', 'departmentId', 'startTime', 'endTime'];
/** The dates always come from the rule ("Vem da repetição."). */
const RULE_DATES: TaskLockedField[] = ['startDate', 'dueDate'];

/**
 * The PATCH an edit sends. An occurrence of an active repetition: "Esta e as próximas" adds
 * `applyTo: 'series'`; "Só esta" never sends a series field (null: the screen does not send it). Other
 * tasks: the patch as it came.
 */
export function patchFor(scope: ApplyScope, mode: RepeatMode, patch: TaskUpdateInput): TaskUpdateInput | null {
  if (mode !== 'series') return patch;
  if (scope === 'series') return { ...patch, applyTo: 'series' };
  return SERIES_FIELDS.some((f) => patch[f] !== undefined) ? null : patch;
}

/** Fields locked on an occurrence of a repetition by the chosen scope. */
export function seriesLockedFields(scope: ApplyScope): Set<TaskLockedField> {
  return new Set(scope === 'occurrence' ? [...SERIES_FIELDS, ...RULE_DATES] : RULE_DATES);
}
