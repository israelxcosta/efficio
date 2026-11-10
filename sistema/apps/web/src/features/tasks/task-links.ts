import { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import type { TaskStatus } from '@effinance/shared';
import { hostsTaskSheets } from '@/components/layout/nav';

// The task sheet opens over any Gestão page through the URL (spec §2.5): `?tarefa=<id>` for an
// existing task, `?nova=1` to create one (with `&horario=1` for an appointment, `&estado=` from a
// board column, `&duplicar=<id>` to copy one, `&prazo=<date>` from a calendar day). Elsewhere it opens
// over the task list. (`prazo`, not `vencimento`: on the list `vencimento` is a filter that must stay.)
// Phase 3: `&titulo=` (renewal of a document, salary adjustment of an agreement) and `&para-cliente=<id>`
// (the client of the new task; `cliente` is a filter of the list and must stay).

export const SHEET_PARAMS = ['tarefa', 'nova', 'horario', 'estado', 'duplicar', 'prazo', 'titulo', 'para-cliente'] as const;

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
  /** Due date of the new task (a calendar day). */
  dueDate?: string;
  /** Title already filled ("Renovar certificado digital"). */
  title?: string;
  /** Client of the new task. */
  clientId?: string;
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
  if (options.dueDate) out.prazo = options.dueDate;
  if (options.title) out.titulo = options.title.slice(0, 200);
  if (options.clientId) out['para-cliente'] = options.clientId;
  return out;
}

/** Href that opens a new task over the task list, from anywhere (toasts, other areas). */
export function newTaskHref(options: NewTaskOptions = {}): string {
  return `/tarefas?${withSheetParams(new URLSearchParams(), newTaskParams(options))}`;
}

export function useTaskSheetLinks() {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const here = hostsTaskSheets(pathname);

  const openTask = useCallback(
    (id: string) => {
      if (here) setParams(withSheetParams(params, { tarefa: id }));
      else navigate(`/tarefas?${withSheetParams(new URLSearchParams(), { tarefa: id })}`);
    },
    [here, navigate, params, setParams],
  );

  const newTask = useCallback(
    (options: NewTaskOptions = {}, { drop = [] }: { drop?: string[] } = {}) => {
      const sheet = newTaskParams(options);
      // `drop`: params of another sheet that opened this one (`vencimentos`), so only one stays open.
      const base = new URLSearchParams(params);
      for (const k of drop) base.delete(k);
      if (here) setParams(withSheetParams(base, sheet));
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
