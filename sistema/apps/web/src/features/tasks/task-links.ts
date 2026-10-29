import { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import type { TaskStatus } from '@effinance/shared';
import { areaOf } from '@/components/layout/nav';

// The task sheet opens over any Gestão page through the URL (spec §2.5): `?tarefa=<id>` for an
// existing task, `?nova=1` to create one (with `&horario=1` for an appointment, `&estado=` from a
// board column, `&duplicar=<id>` to copy one). Elsewhere it opens over the task list.

export const SHEET_PARAMS = ['tarefa', 'nova', 'horario', 'estado', 'duplicar'] as const;

const STATUS_PARAM: Partial<Record<TaskStatus, string>> = {
  in_progress: 'em-andamento',
  waiting_client: 'aguardando',
};

export function statusFromParam(value: string | null): TaskStatus {
  if (value === 'em-andamento') return 'in_progress';
  if (value === 'aguardando') return 'waiting_client';
  return 'todo';
}

export interface NewTaskOptions {
  /** Appointment: 09:00–10:00 today. */
  appointment?: boolean;
  status?: TaskStatus;
  duplicateOf?: string;
}

/** Search string with the sheet params of `base` replaced. */
export function withSheetParams(base: URLSearchParams, sheet: Record<string, string>): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const key of SHEET_PARAMS) next.delete(key);
  for (const [k, v] of Object.entries(sheet)) next.set(k, v);
  return next;
}

function newTaskParams(options: NewTaskOptions): Record<string, string> {
  const out: Record<string, string> = { nova: '1' };
  if (options.appointment) out.horario = '1';
  const status = options.status ? STATUS_PARAM[options.status] : undefined;
  if (status) out.estado = status;
  if (options.duplicateOf) out.duplicar = options.duplicateOf;
  return out;
}

export function useTaskSheetLinks() {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const here = areaOf(pathname) === 'gestao';

  const openTask = useCallback(
    (id: string) => {
      if (here) setParams(withSheetParams(params, { tarefa: id }));
      else navigate(`/tarefas?${withSheetParams(new URLSearchParams(), { tarefa: id })}`);
    },
    [here, navigate, params, setParams],
  );

  const newTask = useCallback(
    (options: NewTaskOptions = {}) => {
      const sheet = newTaskParams(options);
      if (here) setParams(withSheetParams(params, sheet));
      else navigate(`/tarefas?${withSheetParams(new URLSearchParams(), sheet)}`);
    },
    [here, navigate, params, setParams],
  );

  return { openTask, newTask };
}

/** Href that opens the sheet of a task over the task list (notifications, other areas). */
export function taskHref(id: string): string {
  return `/tarefas?tarefa=${encodeURIComponent(id)}`;
}
