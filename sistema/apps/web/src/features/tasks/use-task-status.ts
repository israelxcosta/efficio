import { useCallback, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  daysOverdue,
  isOpenTaskStatus,
  TASK_STATUS_LABELS,
  todayISO,
  type OpenTaskStatus,
  type Task,
  type TaskDetail,
  type TaskHomeResponse,
  type TaskListResponse,
  type TaskOptionsResponse,
  type TaskStatus,
  type TaskStatusChangeResponse,
} from '@effinance/shared';
import { api } from '@/lib/api';
import { toastError } from '@/lib/notify';
import { qk } from '@/lib/query-keys';
import { invalidateTasks } from './api';
import { firstName, shortDate } from './due';
import { useTaskSheetLinks } from './task-links';

export type StatusChangeKind = 'toggle' | 'move' | 'menu' | 'undo';

/** Toast text of a status change (spec §17). */
export function statusMessage(from: TaskStatus, to: TaskStatus, kind: StatusChangeKind): string | null {
  if (kind === 'undo') return null;
  if (kind === 'move') return `Movida para ${TASK_STATUS_LABELS[to]}.`;
  if (to === 'done') return 'Tarefa concluída.';
  if ((from === 'done' || from === 'canceled') && isOpenTaskStatus(to)) return 'Tarefa reaberta.';
  if (to === 'canceled') return 'Tarefa cancelada.';
  return `Situação: ${TASK_STATUS_LABELS[to]}.`;
}

/**
 * Toast of a concluded process step whose next step became a task (spec §17): "Tarefa concluída.
 * Próxima etapa criada para Rafael: Contrato social (vence 04/11)."
 */
export function nextStepMessage(next: Pick<Task, 'title' | 'assignee' | 'dueDate'>, today: string): string {
  const who = next.assignee ? ` para ${firstName(next.assignee.name)}` : '';
  const due = next.dueDate ? ` (vence ${shortDate(next.dueDate, today)})` : '';
  return `Tarefa concluída. Próxima etapa criada${who}: ${next.title}${due}.`;
}

/** The task as it looks right after the change, before the server answers. */
export function optimisticTask<T extends Task>(task: T, status: TaskStatus, today: string, me: { id: string; name: string } | null, now: string): T {
  const open = isOpenTaskStatus(status);
  const overdue = open && task.dueDate !== null && task.dueDate < today;
  return {
    ...task,
    status,
    overdue,
    daysOverdue: overdue ? daysOverdue(task.dueDate, today) : 0,
    completedAt: status === 'done' ? (task.status === 'done' ? task.completedAt : now) : null,
    completedBy: status === 'done' ? (task.status === 'done' ? task.completedBy : me ? { id: me.id, name: me.name } : null) : null,
    reopenStatus: isOpenTaskStatus(task.status) ? (task.status as OpenTaskStatus) : task.reopenStatus,
  };
}

function patchCaches(qc: QueryClient, id: string, fn: <T extends Task>(t: T) => T) {
  qc.setQueriesData<unknown>({ queryKey: ['tasks'] }, (old: unknown) => {
    if (!old || typeof old !== 'object') return old;
    const o = old as Partial<TaskListResponse & TaskHomeResponse & TaskDetail>;
    if (Array.isArray(o.items) && 'summary' in o) {
      const list = old as TaskListResponse;
      return { ...list, items: list.items.map((t) => (t.id === id ? fn(t) : t)) };
    }
    if (o.mine && Array.isArray(o.mine.tasks)) {
      const home = old as TaskHomeResponse;
      return { ...home, mine: { ...home.mine, tasks: home.mine.tasks.map((t) => (t.id === id ? fn(t) : t)) } };
    }
    if ((old as TaskDetail).id === id && 'subtasks' in (old as TaskDetail)) return fn(old as TaskDetail);
    return old;
  });
}

/**
 * Concludes, reopens, moves or changes the status of a task: the caches change at once (rows keep
 * their place, faded, while the toast is open), the server confirms, and "Desfazer" goes back to the
 * previous status. Lists refresh when the toast closes.
 */
export function useTaskStatusChange() {
  const qc = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);
  const { openTask } = useTaskSheetLinks();

  const change = useCallback(
    async (task: Task, status: TaskStatus, kind: StatusChangeKind = 'menu', reason?: string): Promise<boolean> => {
      if (task.status === status) return true;
      const from = task.status;
      const options = qc.getQueryData<TaskOptionsResponse>(qk.taskOptions);
      const today = options?.today ?? todayISO();
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const snapshots = qc.getQueriesData<unknown>({ queryKey: ['tasks'] });
      patchCaches(qc, task.id, (t) => optimisticTask(t, status, today, options?.me ?? null, new Date().toISOString()));
      setSavingId(task.id);
      try {
        const res = await api<TaskStatusChangeResponse>(`/tasks/${task.id}/status`, {
          method: 'PATCH',
          body: reason ? { status, reason } : { status },
        });
        qc.setQueryData(qk.task(task.id), res.task);
        patchCaches(qc, task.id, (t) => ({ ...t, ...pickTask(res.task) }));
        // A concluded process step started the next one: no undo (§18, item 8), a link to the new step.
        if (res.activated && kind !== 'undo') {
          const next = res.activated;
          void invalidateTasks(qc, { keepDetail: task.id });
          toast(nextStepMessage(next, today), { duration: 8000, action: { label: 'Ver etapa', onClick: () => openTask(next.id) } });
          return true;
        }
        // Reopening with a reason is a recorded decision: no undo (§11.6).
        const message = reason ? 'Tarefa reaberta.' : statusMessage(from, status, kind);
        if (reason && message) {
          void invalidateTasks(qc, { keepDetail: task.id });
          toast(message);
          return true;
        }
        if (!message) {
          void invalidateTasks(qc, { keepDetail: task.id });
          return true;
        }
        let settled = false;
        const refresh = () => {
          if (settled) return;
          settled = true;
          void invalidateTasks(qc, { keepDetail: task.id });
        };
        toast(message, {
          duration: 6000,
          action: {
            label: 'Desfazer',
            onClick: () => {
              settled = true;
              void change(res.task, from, 'undo');
            },
          },
          onAutoClose: refresh,
          onDismiss: refresh,
        });
        // Safety net when the toast is dropped without callbacks (page change, too many toasts).
        setTimeout(refresh, 7000);
        return true;
      } catch (error) {
        for (const [key, data] of snapshots) qc.setQueryData(key, data);
        toastError(error);
        return false;
      } finally {
        setSavingId(null);
      }
    },
    [qc, openTask],
  );

  /** The status button of a row: conclude an open task, reopen a concluded one where it was. */
  const toggle = useCallback(
    (task: Task, action: 'done' | 'reopen') => change(task, action === 'done' ? 'done' : task.reopenStatus, 'toggle'),
    [change],
  );

  return { change, toggle, savingId };
}

/** Fields of a Task (a TaskDetail carries more; list caches keep their own shape). */
function pickTask(t: TaskDetail): Partial<Task> {
  return {
    status: t.status,
    reopenStatus: t.reopenStatus,
    overdue: t.overdue,
    daysOverdue: t.daysOverdue,
    completedAt: t.completedAt,
    completedBy: t.completedBy,
    updatedAt: t.updatedAt,
  };
}
