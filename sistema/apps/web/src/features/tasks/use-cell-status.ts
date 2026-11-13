import { useCallback, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  isOpenTaskStatus,
  TASK_STATUS_LABELS,
  type AuditMatrixResponse,
  type OccurrenceCell,
  type RecurringOccurrenceDetail,
  type TaskOptionsResponse,
  type TaskStatus,
  type TaskStatusChangeResponse,
} from '@effinance/shared';
import { api } from '@/lib/api';
import { toastError } from '@/lib/notify';
import { qk } from '@/lib/query-keys';
import { invalidateTasks } from './api';
import { staleAfterTaskChange } from './task-cache';

/** Toast after a cell concludes (spec §17), with the month closed when it was the last pending one. */
export function cellDoneMessage(taskName: string, clientName: string, monthName: string | null): string {
  return monthName ? `${taskName} concluída. ${monthName} concluído para ${clientName}.` : `${taskName} concluída para ${clientName}.`;
}

/** The cell as it looks right after the change, before the server answers. */
export function optimisticCell<T extends OccurrenceCell>(cell: T, status: TaskStatus, me: { id: string; name: string } | null, now: string): T {
  const done = status === 'done';
  return {
    ...cell,
    status,
    concludedBy: done ? (cell.status === 'done' ? cell.concludedBy : me ? { id: me.id, name: me.name } : null) : null,
    concludedAt: done ? (cell.status === 'done' ? cell.concludedAt : now) : null,
    concludedOnTime: done ? now.slice(0, 10) <= cell.legalDueDate : null,
    canReopen: done ? true : cell.canReopen,
    overdue: isOpenTaskStatus(status) ? cell.overdue : false,
    targetMissed: isOpenTaskStatus(status) ? cell.targetMissed : false,
  };
}

function patchCells(qc: QueryClient, taskId: string, fn: <T extends OccurrenceCell>(c: T) => T) {
  qc.setQueriesData<unknown>({ queryKey: ['tasks'] }, (old: unknown) => {
    if (!old || typeof old !== 'object' || !Array.isArray((old as { cells?: unknown }).cells)) return old;
    const data = old as AuditMatrixResponse | RecurringOccurrenceDetail;
    if (!data.cells.some((c) => c.taskId === taskId)) return old;
    return { ...data, cells: (data.cells as OccurrenceCell[]).map((c) => (c.taskId === taskId ? fn(c) : c)) };
  });
}

export interface CellChangeContext {
  taskName: string;
  clientName: string;
  /** "Outubro" when concluding this cell closes the client's month. */
  monthCloses?: string | null;
  /** Screen-reader announcement ("DCTFWeb, Padaria: Em andamento."). */
  announce?: (text: string) => void;
}

/**
 * Changes the status of an occurrence cell (matrix, accordions, occurrence sheet): optimistic in the
 * audit and occurrence caches, a toast with "Desfazer" when it concludes (the API accepts the undo of
 * who concluded within minutes, without a reason), and the reason when reopening a concluded one.
 */
export function useCellStatus() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const change = useCallback(
    async (cell: OccurrenceCell, status: TaskStatus, ctx: CellChangeContext, opts: { reason?: string; undo?: boolean } = {}): Promise<boolean> => {
      if (cell.status === status) return true;
      const from = cell.status;
      const me = qc.getQueryData<TaskOptionsResponse>(qk.taskOptions)?.me ?? null;
      const snapshots = qc.getQueriesData<unknown>({ predicate: (q) => staleAfterTaskChange(q.queryKey, 'status') });
      patchCells(qc, cell.taskId, (c) => optimisticCell(c, status, me, new Date().toISOString()));
      setBusy((b) => new Set(b).add(cell.taskId));
      try {
        await api<TaskStatusChangeResponse>(`/tasks/${cell.taskId}/status`, {
          method: 'PATCH',
          body: opts.reason ? { status, reason: opts.reason } : { status },
        });
        ctx.announce?.(`${ctx.taskName}, ${ctx.clientName}: ${TASK_STATUS_LABELS[status]}.${status === 'done' && ctx.monthCloses ? ` ${ctx.monthCloses} concluído para ${ctx.clientName}.` : ''}`);
        if (opts.reason) toast(`${ctx.taskName} reaberta para ${ctx.clientName}.`);
        else if (status === 'done' && !opts.undo) {
          toast(cellDoneMessage(ctx.taskName, ctx.clientName, ctx.monthCloses ?? null), {
            duration: 6000,
            action: { label: 'Desfazer', onClick: () => void change({ ...cell, status: 'done' }, from, { ...ctx, monthCloses: null }, { undo: true }) },
          });
        }
        void invalidateTasks(qc, { change: 'status' });
        return true;
      } catch (error) {
        for (const [key, data] of snapshots) qc.setQueryData(key, data);
        toastError(error);
        return false;
      } finally {
        setBusy((b) => {
          const next = new Set(b);
          next.delete(cell.taskId);
          return next;
        });
      }
    },
    [qc],
  );

  return { change, isBusy: (taskId: string) => busy.has(taskId) };
}
