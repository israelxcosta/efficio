// Due-date wording of a task (spec §3.5), shared by the row, the card, the sheet and the summaries.
// Beside the date column the text never repeats the date; inline (narrow rows) it carries it.

import { dateInTimeZone, diffInDays, dueBucketOf, formatDateBR, TASK_DUE_BUCKETS, type ISODate, type Task, type TaskDueBucket } from '@effinance/shared';

export type DueTone = 'danger' | 'warning-strong' | 'warning' | 'muted' | 'subtle';

export interface DueInfo {
  text: string;
  tone: DueTone;
}

export const DUE_TONE_CLASS: Record<DueTone, string> = {
  danger: 'font-semibold text-danger',
  'warning-strong': 'font-semibold text-warning',
  warning: 'font-medium text-warning',
  muted: 'text-muted',
  subtle: 'text-subtle',
};

export const daysText = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

/** "05/10" in the current year, "05/10/25" otherwise. */
export function shortDate(date: ISODate, today: ISODate): string {
  const [y, m, d] = date.split('-');
  return y === today.slice(0, 4) ? `${d}/${m}` : `${d}/${m}/${y!.slice(2)}`;
}

export function timeRange(task: Pick<Task, 'startTime' | 'endTime'>): string | null {
  if (!task.startTime) return null;
  return task.endTime ? `${task.startTime}–${task.endTime}` : task.startTime;
}

/** Day the task was concluded, in the office time zone. */
export function completedDay(task: Pick<Task, 'completedAt'>): ISODate | null {
  return task.completedAt ? dateInTimeZone(new Date(task.completedAt)) : null;
}

export function taskDueInfo(
  task: Pick<Task, 'status' | 'dueDate' | 'completedAt' | 'startTime' | 'endTime'>,
  today: ISODate,
  beside = false,
): DueInfo {
  if (task.status === 'canceled') return { text: 'Cancelada', tone: 'subtle' };
  if (task.status === 'done') {
    const day = completedDay(task);
    if (!day) return { text: 'Concluída', tone: 'muted' };
    if (beside && task.dueDate === day) return { text: 'Concluída no vencimento', tone: 'muted' };
    return { text: `Concluída em ${shortDate(day, today)}`, tone: 'muted' };
  }
  if (!task.dueDate) return { text: 'Sem vencimento', tone: 'subtle' };
  const days = diffInDays(task.dueDate, today);
  if (days < 0) return { text: `Venceu há ${daysText(-days)}`, tone: 'danger' };
  if (days === 0) {
    const time = timeRange(task);
    return { text: time ? `Hoje, ${time}` : 'Vence hoje', tone: 'warning-strong' };
  }
  if (days === 1) return { text: 'Vence amanhã', tone: 'warning' };
  if (days <= 5) return { text: `Vence em ${daysText(days)}`, tone: 'warning' };
  return { text: beside ? `Vence em ${daysText(days)}` : `Vence ${shortDate(task.dueDate, today)}`, tone: 'muted' };
}

/** "Concluída por Bruno Carvalho em 14/10/2026 às 09:12" (tooltip of a concluded task). */
export function completedByText(task: Pick<Task, 'completedAt' | 'completedBy'>, formatDateTime: (iso: string) => string): string | null {
  if (!task.completedAt) return null;
  return `Concluída${task.completedBy ? ` por ${task.completedBy.name}` : ''} em ${formatDateTime(task.completedAt)}`;
}

/** "28/10/2026" or "—". */
export function dueDateText(date: ISODate | null): string {
  return date ? formatDateBR(date) : '—';
}

/** Short name for narrow columns: "Ana Paula Ribeiro" → "Ana P.". */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? name;
  return `${parts[0]} ${parts[parts.length - 1]![0]}.`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Rows of one page split into due-date groups, in the order of the list (the API sorts by due date). */
export function groupByDue(tasks: Task[], today: string): { bucket: TaskDueBucket; tasks: Task[] }[] {
  const groups = new Map<TaskDueBucket, Task[]>();
  for (const t of tasks) {
    const bucket = dueBucketOf(t.dueDate, today);
    groups.set(bucket, [...(groups.get(bucket) ?? []), t]);
  }
  return TASK_DUE_BUCKETS.filter((b) => groups.has(b)).map((bucket) => ({ bucket, tasks: groups.get(bucket)! }));
}
