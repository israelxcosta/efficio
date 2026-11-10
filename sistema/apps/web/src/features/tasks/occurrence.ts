// Recurring occurrences in the lists, the board, the calendar and the sheets (spec §3.5, §5.6, §8.2):
// the wording of the two deadlines (internal target and legal deadline), the period labels, the
// grouping of the list (tasks and aggregated occurrences together, by work date) and the board cards
// of a recurring task. Pure functions, tested in phase2-logic.test.ts.

import {
  type AssigneeSource,
  dateInTimeZone,
  diffInDays,
  dueBucketOf,
  formatMonthKey,
  OCCURRENCE_PERIOD_RE,
  TASK_DUE_BUCKETS,
  type ISODate,
  type MonthKey,
  type RecurringOccurrence,
  type Task,
  type TaskDueBucket,
  type TaskStatus,
} from '@effinance/shared';
import { isUuid } from '@/lib/safe-url';
import { daysText, shortDate, shortName, type DueInfo } from './due';

/** "ref. 09/2026". */
export function referenceLabel(month: MonthKey): string {
  return `ref. ${month.slice(5, 7)}/${month.slice(0, 4)}`;
}

/** "outubro de 2026" (lower case, to go after a name). */
export function competenceName(month: MonthKey): string {
  const long = formatMonthKey(month, 'long');
  return long.charAt(0).toLowerCase() + long.slice(1);
}

/** Period of an occurrence: "outubro de 2026", or "semana de 26/10" for a weekly one. */
export function periodLabel(o: Pick<RecurringOccurrence, 'period' | 'periodKey' | 'competence'>, today: ISODate): string {
  if (o.period === 'weekly' && o.periodKey.length === 10) return `semana de ${shortDate(o.periodKey, today)}`;
  return competenceName(o.competence);
}

/** "DCTFWeb · outubro de 2026" / "Folha semanal · semana de 26/10". */
export function occurrenceTitle(o: Pick<RecurringOccurrence, 'name' | 'period' | 'periodKey' | 'competence'>, today: ISODate): string {
  return `${o.name} · ${periodLabel(o, today)}`;
}

interface Deadlines {
  legalDueDate: ISODate;
  targetDate: ISODate;
}

/**
 * Wording of an open occurrence's deadlines (§3.5, "meta e prazo legal"): the colour follows the most
 * serious one. `beside` goes next to the target date (does not repeat it); inline carries the dates.
 */
export function openDeadlineInfo({ legalDueDate: legal, targetDate: target }: Deadlines, today: ISODate, beside = false): DueInfo {
  const toLegal = diffInDays(legal, today);
  if (toLegal < 0) return { text: `Prazo legal venceu há ${daysText(-toLegal)}`, tone: 'danger' };
  if (toLegal === 0) return { text: 'Prazo legal hoje', tone: 'warning-strong' };
  const legalShort = shortDate(legal, today);
  if (target >= legal) {
    // Target = legal deadline (0 days): like a standalone task, with "Prazo legal" instead of "Vence".
    if (toLegal === 1) return { text: 'Prazo legal amanhã', tone: 'warning' };
    if (toLegal <= 5) return { text: `Prazo legal em ${daysText(toLegal)}`, tone: 'warning' };
    return { text: beside ? `Prazo legal em ${daysText(toLegal)}` : `Prazo legal ${legalShort}`, tone: 'muted' };
  }
  const toTarget = diffInDays(target, today);
  if (toTarget < 0) {
    const legalPart = toLegal === 1 ? 'legal amanhã' : `legal em ${daysText(toLegal)}`;
    return { text: `Meta venceu há ${daysText(-toTarget)} · ${legalPart}`, tone: 'warning-strong' };
  }
  if (toTarget === 0) return { text: `Meta hoje · legal ${legalShort}`, tone: 'warning-strong' };
  const tone = toTarget <= 5 ? 'warning' : 'muted';
  if (!beside) return { text: `Meta ${shortDate(target, today)} · legal ${legalShort}`, tone };
  return { text: `${toTarget === 1 ? 'Meta amanhã' : `Meta em ${daysText(toTarget)}`} · legal ${legalShort}`, tone };
}

/** Deadline text of one occurrence (a task with `occurrence`), concluded and canceled included. */
export function occurrenceTaskDueInfo(
  task: Pick<Task, 'status' | 'dueDate' | 'completedAt' | 'occurrence'>,
  today: ISODate,
  beside = false,
): DueInfo {
  if (task.status === 'canceled') return { text: 'Cancelada', tone: 'subtle' };
  const legal = task.dueDate;
  const target = task.occurrence?.targetDate ?? legal;
  if (task.status === 'done') {
    const day = task.completedAt ? dateInTimeZone(new Date(task.completedAt)) : null;
    if (!day) return { text: 'Concluída', tone: 'muted' };
    const late = legal !== null && day > legal;
    return { text: `Concluída em ${shortDate(day, today)}${late ? ', com atraso' : ''}`, tone: 'muted' };
  }
  if (!legal || !target) return { text: 'Sem vencimento', tone: 'subtle' };
  return openDeadlineInfo({ legalDueDate: legal, targetDate: target }, today, beside);
}

/** Deadline text of an aggregated occurrence: the pending ones decide; a complete one is just the dates. */
export function groupDeadlineInfo(o: Pick<RecurringOccurrence, 'legalDueDate' | 'targetDate' | 'pending'>, today: ISODate, beside = false): DueInfo {
  if (o.pending === 0) {
    const legal = shortDate(o.legalDueDate, today);
    return { text: o.targetDate < o.legalDueDate ? `Meta ${shortDate(o.targetDate, today)} · legal ${legal}` : `Prazo legal ${legal}`, tone: 'muted' };
  }
  return openDeadlineInfo(o, today, beside);
}

/** Tooltip of the date: "Meta 15/10 (5 dias antes) · Prazo legal 20/10". */
export function deadlineTip({ legalDueDate: legal, targetDate: target }: Deadlines, today: ISODate): string {
  const legalText = `Prazo legal ${shortDate(legal, today)}`;
  if (target >= legal) return `${legalText} (a meta é o próprio prazo legal)`;
  return `Meta ${shortDate(target, today)} (${daysText(diffInDays(legal, target))} antes) · ${legalText}`;
}

/** "Ana P. 12 · Bruno C. 8 · Marina S. 3 (padrão) · sem responsável 2". */
export function assigneesTip(o: Pick<RecurringOccurrence, 'assignees' | 'defaultAssignee'>): string {
  return o.assignees
    .map((a) => {
      if (!a.assignee) return `sem responsável ${a.count}`;
      const isDefault = o.defaultAssignee?.id === a.assignee.id;
      return `${shortName(a.assignee.name)} ${a.count}${isDefault ? ' (padrão)' : ''}`;
    })
    .join(' · ');
}

/**
 * Count text of an aggregated row: "8 de 12 dos seus clientes pendentes" (Minhas) or "18 de 30
 * clientes pendentes"; when the view only has pending ones (Abertas), "12 clientes pendentes".
 */
export function pendingText(o: Pick<RecurringOccurrence, 'pending' | 'total' | 'canceled'>, mine: boolean): string {
  const live = o.total - o.canceled;
  const noun = mine ? 'dos seus clientes' : live === 1 ? 'cliente' : 'clientes';
  if (o.pending === 0) return mine ? `Seus ${live} ${live === 1 ? 'cliente concluído' : 'clientes concluídos'}` : `${live} ${live === 1 ? 'cliente concluído' : 'clientes concluídos'}`;
  if (o.pending === live) {
    if (mine) return `${o.pending} ${o.pending === 1 ? 'dos seus clientes pendente' : 'dos seus clientes pendentes'}`;
    return `${o.pending} ${o.pending === 1 ? 'cliente pendente' : 'clientes pendentes'}`;
  }
  return `${o.pending} de ${live} ${noun} ${o.pending === 1 ? 'pendente' : 'pendentes'}`;
}

/** Fraction concluded (canceled ones out of the total). */
export function doneFraction(o: Pick<RecurringOccurrence, 'done' | 'total' | 'canceled'>): number {
  const live = o.total - o.canceled;
  return live > 0 ? o.done / live : 0;
}

// ---------------------------------------------------------------------------
// The list: tasks and aggregated occurrences grouped by work date
// ---------------------------------------------------------------------------

export type ListItem =
  | {
      type: 'task';
      key: string;
      task: Task;
      work: ISODate | null;
      /** The following occurrences of the same repetition in the group, joined into this row ("+3 até 12/11"). */
      more?: { count: number; until: ISODate };
    }
  | { type: 'occurrence'; key: string; occurrence: RecurringOccurrence; work: ISODate };

export function occurrenceKey(o: Pick<RecurringOccurrence, 'recurringTaskId' | 'periodKey'>): string {
  return `${o.recurringTaskId}:${o.periodKey}`;
}

/** Group of an open aggregated occurrence: by its target (work date) and legal deadline. */
export function occurrenceBucket(o: Pick<RecurringOccurrence, 'legalDueDate' | 'targetDate'>, today: ISODate): TaskDueBucket {
  return dueBucketOf(o.legalDueDate, today, o.targetDate);
}

/** Group of a task (an occurrence task by its target, the others by the due date). */
export function taskBucket(t: Pick<Task, 'dueDate' | 'occurrence'>, today: ISODate): TaskDueBucket {
  return dueBucketOf(t.dueDate, today, t.occurrence?.targetDate ?? null);
}

/**
 * Rows of one page split into due-date groups (Atrasadas, Fora da meta, Hoje, Próximos 7 dias, Mais
 * tarde, Sem vencimento), tasks and aggregated occurrences together, each group by work date (the
 * target of an occurrence). Occurrences with nothing pending stay out of the grouped (open) lists.
 */
export function groupListItems(tasks: Task[], occurrences: RecurringOccurrence[], today: ISODate): { bucket: TaskDueBucket; items: ListItem[] }[] {
  const groups = new Map<TaskDueBucket, ListItem[]>();
  const push = (bucket: TaskDueBucket, item: ListItem) => groups.set(bucket, [...(groups.get(bucket) ?? []), item]);
  for (const t of tasks) push(taskBucket(t, today), { type: 'task', key: t.id, task: t, work: t.occurrence?.targetDate ?? t.dueDate });
  for (const o of occurrences) {
    if (o.pending === 0) continue;
    push(occurrenceBucket(o, today), { type: 'occurrence', key: occurrenceKey(o), occurrence: o, work: o.targetDate });
  }
  return TASK_DUE_BUCKETS.filter((b) => groups.has(b)).map((bucket) => {
    // Stable: tasks keep the API order among themselves; occurrences slot in by work date.
    const items = [...groups.get(bucket)!].sort((a, b) => (a.work ?? '9999-12-31').localeCompare(b.work ?? '9999-12-31'));
    return { bucket, items: JOINED_BUCKETS.has(bucket) ? joinSeries(items) : items };
  });
}

/** Future groups where the occurrences of one repetition become one row; the others ask action each. */
const JOINED_BUCKETS = new Set<TaskDueBucket>(['next7Days', 'later']);

/**
 * The occurrences of the same repetition (origin `task`) in a group, joined into the nearest one with
 * "+N até <date>", even with other tasks between them (spec §5.3). The registry's come aggregated.
 */
function joinSeries(items: ListItem[]): ListItem[] {
  const firstOf = new Map<string, Extract<ListItem, { type: 'task' }>>();
  const out: ListItem[] = [];
  for (const item of items) {
    const series = item.type === 'task' && item.task.occurrence?.origin === 'task' ? item.task.occurrence.recurringTaskId : null;
    if (!series || item.type !== 'task') {
      out.push(item);
      continue;
    }
    const first = firstOf.get(series);
    if (!first) {
      const copy = { ...item };
      firstOf.set(series, copy);
      out.push(copy);
      continue;
    }
    const until = item.task.dueDate ?? item.work ?? first.more?.until ?? '';
    first.more = { count: (first.more?.count ?? 0) + 1, until: first.more && first.more.until > until ? first.more.until : until };
  }
  return out;
}

/** Items counted like the API (an aggregated occurrence counts its clients; a joined row, its series). */
export function itemCount(items: ListItem[]): number {
  return items.reduce((n, i) => n + (i.type === 'task' ? 1 + (i.more?.count ?? 0) : i.occurrence.pending), 0);
}

// ---------------------------------------------------------------------------
// The board: one card per recurring task and status
// ---------------------------------------------------------------------------

export interface OccurrenceCard {
  key: string;
  status: TaskStatus;
  /** Clients in this status. */
  count: number;
  occurrence: RecurringOccurrence;
}

/**
 * Cards of the aggregated occurrences on the board: per recurring task and status, the clients in that
 * status ("DCTFWeb · 18 clientes" in A fazer). "Em andamento" includes the ones waiting for the client
 * (the aggregate counts them together).
 */
export function occurrenceCards(occurrences: RecurringOccurrence[]): OccurrenceCard[] {
  const out: OccurrenceCard[] = [];
  for (const o of occurrences) {
    const parts: [TaskStatus, number][] = [
      ['todo', Math.max(0, o.pending - o.inProgress)],
      ['in_progress', o.inProgress],
      ['done', o.done],
      ['canceled', o.canceled],
    ];
    for (const [status, count] of parts) {
      if (count > 0) out.push({ key: `${occurrenceKey(o)}:${status}`, status, count, occurrence: o });
    }
  }
  return out;
}

/**
 * Whether `?recorrente=&periodo=` name an occurrence: a recurring task id and a period key (`2026-10`
 * or, weekly, `2026-10-05`). Anything else never reaches the API path and shows "não encontrada".
 */
export function isOccurrenceRef(id: string | null, period: string | null): boolean {
  return isUuid(id) && typeof period === 'string' && OCCURRENCE_PERIOD_RE.test(period);
}

/** `?recorrente=<id>&periodo=<key>` (the occurrence sheet over any Gestão page). */
export function occurrenceParams(o: Pick<RecurringOccurrence, 'recurringTaskId' | 'periodKey'>): Record<string, string> {
  return { recorrente: o.recurringTaskId, periodo: o.periodKey };
}

export function occurrenceHref(o: Pick<RecurringOccurrence, 'recurringTaskId' | 'periodKey'>, base = '/tarefas'): string {
  return `${base}?${new URLSearchParams(occurrenceParams(o)).toString()}`;
}

/** The audit page on this recurring task ("Abrir na auditoria"). */
export function auditHref(o: Pick<RecurringOccurrence, 'recurringTaskId' | 'competence'>): string {
  return `/tarefas/auditoria?${new URLSearchParams({ visao: 'tarefa', recorrente: o.recurringTaskId, competencia: o.competence }).toString()}`;
}

/**
 * Where the responsible of an occurrence comes from: the recurring task's default responsible (every
 * client of it) or assigned by hand for that competence. There is no responsible per client.
 */
export function assigneeSourceText(source: AssigneeSource | null | undefined): string | null {
  if (source === 'default') return 'Responsável padrão da recorrente';
  if (source === 'manual') return 'Atribuída só nesta competência';
  return null;
}
