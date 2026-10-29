// Filters of the Tarefas screen live in the URL (shareable, back button), in Portuguese like the rest
// of the app (spec §2.5). Scope and view also have a remembered default per workspace and user
// (localStorage); the other filters exist only in the URL. Pure functions, tested in url-state.test.ts.

import {
  addDays,
  TASK_PRIORITIES,
  type ISODate,
  type MonthKey,
  type TaskPriority,
  type TaskQuery,
  type TaskScope,
  type TaskSituation,
} from '@effinance/shared';
import { isUuid } from '@/lib/safe-url';

export type TaskView = 'list' | 'board';

export interface TaskFilters {
  scope: TaskScope;
  view: TaskView;
  situation: TaskSituation;
  search: string;
  /** Client id or `internal`. */
  client: string;
  /** Member id or `none`. */
  assignee: string;
  department: string;
  category: string;
  priority: TaskPriority | '';
  month: MonthKey | '';
  dueDate: ISODate | '';
  /** Board: only overdue cards. */
  onlyOverdue: boolean;
  page: number;
}

const SCOPE_PARAM: Record<TaskScope, string> = { mine: 'minhas', department: 'departamento', all: 'todas' };
const VIEW_PARAM: Record<TaskView, string> = { list: 'lista', board: 'quadro' };
const SITUATION_PARAM: Record<TaskSituation, string> = {
  open: 'abertas',
  overdue: 'atrasadas',
  waiting: 'aguardando',
  done: 'concluidas',
  all: 'todas',
};
const PRIORITY_PARAM: Record<TaskPriority, string> = { low: 'baixa', medium: 'media', high: 'alta', urgent: 'urgente' };

function fromParam<T extends string>(map: Record<T, string>, value: string | null): T | undefined {
  if (!value) return undefined;
  return (Object.keys(map) as T[]).find((k) => map[k] === value);
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export interface TaskViewPreference {
  scope: TaskScope;
  view: TaskView;
}

export const DEFAULT_TASK_VIEW: TaskViewPreference = { scope: 'mine', view: 'list' };

/** Reads the URL; anything malformed (ids, dates, enums) is ignored instead of reaching the API. */
export function parseTaskFilters(params: URLSearchParams, defaults: TaskViewPreference = DEFAULT_TASK_VIEW): TaskFilters {
  const client = params.get('cliente') ?? '';
  const assignee = params.get('responsavel') ?? '';
  const id = (v: string | null) => (isUuid(v) ? v : '');
  const month = params.get('mes') ?? '';
  const dueDate = params.get('vencimento') ?? '';
  const page = Number(params.get('pagina') ?? '1');
  return {
    scope: fromParam(SCOPE_PARAM, params.get('escopo')) ?? defaults.scope,
    view: fromParam(VIEW_PARAM, params.get('visao')) ?? defaults.view,
    situation: fromParam(SITUATION_PARAM, params.get('situacao')) ?? 'open',
    search: (params.get('busca') ?? '').slice(0, 200),
    client: client === 'interna' ? 'internal' : id(client),
    assignee: assignee === 'nenhum' ? 'none' : id(assignee),
    department: id(params.get('departamento')),
    category: id(params.get('categoria')),
    priority: fromParam(PRIORITY_PARAM, params.get('prioridade')) ?? '',
    month: MONTH.test(month) ? (month as MonthKey) : '',
    dueDate: DATE.test(dueDate) ? (dueDate as ISODate) : '',
    onlyOverdue: params.get('atrasadas') === '1',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export type TaskFilterPatch = Partial<Omit<TaskFilters, 'page'>> & { page?: number };

/**
 * Applies a change to the URL, keeping unrelated params (e.g. `tarefa` of the open sheet). Default
 * values are written only for scope and view (so the remembered preference does not override a
 * shared link); every filter change goes back to page 1.
 */
export function writeTaskFilters(params: URLSearchParams, patch: TaskFilterPatch): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string | null) => (value ? next.set(key, value) : next.delete(key));
  if (patch.scope !== undefined) set('escopo', SCOPE_PARAM[patch.scope]);
  if (patch.view !== undefined) set('visao', VIEW_PARAM[patch.view]);
  if (patch.situation !== undefined) set('situacao', patch.situation === 'open' ? null : SITUATION_PARAM[patch.situation]);
  if (patch.search !== undefined) set('busca', patch.search.trim());
  if (patch.client !== undefined) set('cliente', patch.client === 'internal' ? 'interna' : patch.client);
  if (patch.assignee !== undefined) set('responsavel', patch.assignee === 'none' ? 'nenhum' : patch.assignee);
  if (patch.department !== undefined) set('departamento', patch.department);
  if (patch.category !== undefined) set('categoria', patch.category);
  if (patch.priority !== undefined) set('prioridade', patch.priority ? PRIORITY_PARAM[patch.priority] : null);
  if (patch.month !== undefined) set('mes', patch.month);
  if (patch.dueDate !== undefined) set('vencimento', patch.dueDate);
  if (patch.onlyOverdue !== undefined) set('atrasadas', patch.onlyOverdue ? '1' : null);
  if (patch.page !== undefined) set('pagina', patch.page > 1 ? String(patch.page) : null);
  else next.delete('pagina');
  return next;
}

/** Filters that narrow the list beyond scope, view and situation (the "Limpar" button). */
export function activeFilterCount(f: TaskFilters): number {
  return [f.search, f.client, f.assignee, f.department, f.category, f.priority, f.month, f.dueDate].filter(Boolean).length;
}

export const CLEARED_FILTERS: TaskFilterPatch = {
  search: '',
  client: '',
  assignee: '',
  department: '',
  category: '',
  priority: '',
  month: '',
  dueDate: '',
};

export const TASK_PAGE_SIZE = 50;
/** The board loads every open card and the ones closed in the last 14 days. */
export const BOARD_PAGE_SIZE = 200;
export const BOARD_CLOSED_DAYS = 14;

/** The API query of the list (or of the board) for these filters. */
export function toTaskQuery(f: TaskFilters, today: ISODate): TaskQuery {
  const base: TaskQuery = {
    scope: f.scope,
    search: f.search || undefined,
    clientId: (f.client || undefined) as TaskQuery['clientId'],
    // "Minhas" is already about one person.
    assigneeId: f.scope === 'mine' ? undefined : ((f.assignee || undefined) as TaskQuery['assigneeId']),
    departmentId: f.department || undefined,
    categoryId: f.category || undefined,
    priority: f.priority || undefined,
    month: f.month || undefined,
    dueDate: f.dueDate || undefined,
    // Recurring occurrences come with phase 2.
    occurrences: 'false',
  };
  if (f.view === 'board') {
    return {
      ...base,
      situation: f.onlyOverdue ? 'overdue' : 'all',
      closedFrom: addDays(today, -BOARD_CLOSED_DAYS),
      page: 1,
      pageSize: BOARD_PAGE_SIZE,
    };
  }
  return { ...base, situation: f.situation, page: f.page, pageSize: TASK_PAGE_SIZE };
}

/** Situations whose list is grouped by due date (Atrasadas, Hoje, Próximos 7 dias…). */
export function isGroupedSituation(s: TaskSituation): boolean {
  return s === 'open' || s === 'overdue' || s === 'waiting';
}

// ---------------------------------------------------------------------------
// Remembered preferences (localStorage, validated on read like the dashboard layout)
// ---------------------------------------------------------------------------

export function taskViewKey(workspaceId: string, userId: string): string {
  return `effinance.tasks.view.v1:${workspaceId}:${userId}`;
}

export function homeDepartmentKey(workspaceId: string, userId: string): string {
  return `effinance.tasks.home.v1:${workspaceId}:${userId}`;
}

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function sanitizeTaskView(raw: unknown): TaskViewPreference {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const scope = fromParam(SCOPE_PARAM, typeof r.escopo === 'string' ? r.escopo : null) ?? DEFAULT_TASK_VIEW.scope;
  const view = fromParam(VIEW_PARAM, typeof r.visao === 'string' ? r.visao : null) ?? DEFAULT_TASK_VIEW.view;
  return { scope, view };
}

export function readTaskView(key: string): TaskViewPreference {
  try {
    const raw = local()?.getItem(key);
    return raw ? sanitizeTaskView(JSON.parse(raw)) : DEFAULT_TASK_VIEW;
  } catch {
    return DEFAULT_TASK_VIEW;
  }
}

export function writeTaskView(key: string, pref: TaskViewPreference): void {
  try {
    local()?.setItem(key, JSON.stringify({ escopo: SCOPE_PARAM[pref.scope], visao: VIEW_PARAM[pref.view] }));
  } catch {
    // ignore
  }
}

/** Department chosen on the home page: an id or `all`; anything else is dropped. */
export function readHomeDepartment(key: string): string | null {
  try {
    const raw = local()?.getItem(key);
    if (!raw) return null;
    const value = (JSON.parse(raw) as { departamento?: unknown }).departamento;
    return value === 'todos' ? 'all' : isUuid(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeHomeDepartment(key: string, department: string | null): void {
  try {
    if (!department) local()?.removeItem(key);
    else local()?.setItem(key, JSON.stringify({ departamento: department === 'all' ? 'todos' : department }));
  } catch {
    // ignore
  }
}

export const PRIORITY_OPTIONS = [...TASK_PRIORITIES].reverse();

/** Link to the task list with filters (summary cells, home blocks, notifications). */
export function tasksHref(patch: TaskFilterPatch & { scope?: TaskScope }): string {
  const params = writeTaskFilters(new URLSearchParams(), patch);
  const qs = params.toString();
  return qs ? `/tarefas?${qs}` : '/tarefas';
}
