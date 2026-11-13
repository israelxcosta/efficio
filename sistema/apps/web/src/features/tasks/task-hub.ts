// Tarefas: the hub of icons in the headers of Tarefas, Auditoria, Recorrentes and Processos (spec
// §2.9: Ver navigates, Criar acts, only what the person may see or create) and the ranking of pending
// work per client (the card further down). Pure functions, tested in task-hub.test.ts.

import type { PermissionKey, TaskListSummary } from '@effinance/shared';
import { writeTaskFilters, type TaskView } from './url-state';

export type HubViewId = 'list' | 'board' | 'calendar' | 'audit' | 'recurring' | 'regimes' | 'processes';

export interface HubViewItem {
  id: HubViewId;
  /** The tooltip and the `aria-label` (on the computer the hub has no visible text). */
  label: string;
  /**
   * The name under the icon on touch or narrow screens, where a tap opens no tooltip. Always a part
   * of `label`, so the visible name is in the accessible one (WCAG 2.5.3).
   */
  short: string;
  /** `views` are the views of Tarefas; `pages` the other pages (a divider separates them). */
  group: 'views' | 'pages';
}

const HUB_VIEWS: (HubViewItem & { permission?: PermissionKey })[] = [
  { id: 'list', label: 'Lista', short: 'Lista', group: 'views' },
  { id: 'board', label: 'Quadro', short: 'Quadro', group: 'views' },
  { id: 'calendar', label: 'Calendário', short: 'Calendário', group: 'views' },
  { id: 'audit', label: 'Auditoria mensal', short: 'Auditoria', group: 'pages', permission: 'page.audit' },
  { id: 'recurring', label: 'Tarefas recorrentes', short: 'Recorrentes', group: 'pages', permission: 'page.recurring' },
  { id: 'regimes', label: 'Grupos por regime', short: 'Por regime', group: 'pages', permission: 'page.recurring' },
  { id: 'processes', label: 'Processos', short: 'Processos', group: 'pages', permission: 'page.processes' },
];

/** Items of Ver, in order; the pages turned off for the person (spec §13.10) are not there. */
export function hubViewItems(can: (key: PermissionKey) => boolean): HubViewItem[] {
  return HUB_VIEWS.filter((v) => !v.permission || can(v.permission)).map(({ permission: _p, ...v }) => v);
}

const VIEW_IDS: Record<TaskView, HubViewId> = { list: 'list', board: 'board', calendar: 'calendar' };
const VIEW_PARAMS: Record<'list' | 'board' | 'calendar', string> = { list: 'lista', board: 'quadro', calendar: 'calendario' };

function hubPath(pathname: string): string {
  const path = (pathname.split(/[?#]/)[0] || '/').toLowerCase().replace(/\/+$/, '');
  return path || '/';
}

const under = (path: string, to: string) => path === to || path.startsWith(`${to}/`);

/** The item of the current page: on `/tarefas`, the view on screen (Lista when none). */
export function activeHubView(pathname: string, params: URLSearchParams, currentView?: TaskView): HubViewId | null {
  const path = hubPath(pathname);
  if (path === '/tarefas') return VIEW_IDS[currentView ?? 'list'];
  if (under(path, '/tarefas/auditoria')) return 'audit';
  if (under(path, '/tarefas/recorrentes')) return params.get('visao')?.toLowerCase() === 'regimes' ? 'regimes' : 'recurring';
  if (under(path, '/tarefas/processos')) return 'processes';
  return null;
}

/** Sheets opened through the URL, closed when the view changes. */
const SHEET_PARAMS = ['tarefa', 'nova', 'recorrente', 'periodo'];

/**
 * Destination of an item of Ver. On Tarefas the views change only `visao` and keep the filters (no
 * sheet, back to page 1); elsewhere they open Tarefas with the view (the remembered scope applies).
 */
export function hubViewHref(id: HubViewId, pathname: string, params: URLSearchParams): string {
  if (id === 'audit') return '/tarefas/auditoria';
  if (id === 'recurring') return '/tarefas/recorrentes';
  if (id === 'regimes') return '/tarefas/recorrentes?visao=regimes';
  if (id === 'processes') return '/tarefas/processos';
  if (hubPath(pathname) !== '/tarefas') return `/tarefas?visao=${VIEW_PARAMS[id]}`;
  const next = writeTaskFilters(params, { view: id });
  for (const key of SHEET_PARAMS) next.delete(key);
  const query = next.toString();
  return query ? `/tarefas?${query}` : '/tarefas';
}

export type CreateActionId = 'task' | 'appointment' | 'recurring' | 'process';

export interface CreateAction {
  id: CreateActionId;
  /** The tooltip and the `aria-label`. */
  label: string;
  /** The name under the icon on touch screens (a part of `label`, like `HubViewItem.short`). */
  short: string;
  /** One line about what it creates (menus). */
  description: string;
  /** Pages that create it (the others open a sheet or a menu over the page). */
  href?: string;
}

/**
 * Buttons of Criar, in order. Tasks, appointments and processes are day-to-day work (every member;
 * an inactive subscription disables them, the WriteGate says why); recurring tasks of the registry
 * need `registry` and live on the page of recurring tasks (`page.recurring`), so they are hidden —
 * not disabled — from whoever lacks either. The regime groups are a page of Ver (spec §2.9).
 */
export function createActions(can: (key: PermissionKey) => boolean): CreateAction[] {
  const registry = can('registry') && can('page.recurring');
  const all: (CreateAction & { show: boolean })[] = [
    { id: 'task', label: 'Nova tarefa', short: 'Tarefa', description: 'Uma tarefa avulsa ou que se repete, com prazo e responsável.', show: true },
    { id: 'appointment', label: 'Novo compromisso', short: 'Compromisso', description: 'Com horário na agenda (reunião, visita).', show: true },
    {
      id: 'recurring',
      label: 'Nova tarefa recorrente',
      short: 'Recorrente',
      description: 'Uma obrigação que se repete para os clientes a cada período.',
      href: '/tarefas/recorrentes?recorrente=nova',
      show: registry,
    },
    { id: 'process', label: 'Novo processo', short: 'Processo', description: 'Etapas em sequência: a partir de um modelo ou avulso.', show: true },
  ];
  return all.filter((a) => a.show).map(({ show: _show, ...a }) => a);
}

export interface ClientPendingRow {
  rank: number;
  id: string;
  name: string;
  open: number;
  overdue: number;
  /** Open work relative to the client with the most (the bar's length). */
  share: number;
  /** Overdue part of the client's own bar. */
  overdueShare: number;
}

export interface ClientPendingRanking {
  rows: ClientPendingRow[];
  /** Clients beyond the limit. */
  hidden: number;
  /** Open internal tasks (no client): said apart, they are not a client's. */
  internal: number;
  totals: { clients: number; open: number; overdue: number; overdueClients: number };
}

/** Clients with open work, most open first (then most overdue, then by name), up to `limit`. */
export function clientPendingRanking(rows: TaskListSummary['openByClient'], limit: number): ClientPendingRanking {
  const clients = rows
    .filter((r): r is typeof r & { client: NonNullable<typeof r.client> } => r.client !== null && r.open > 0)
    .sort((a, b) => b.open - a.open || b.overdue - a.overdue || a.client.name.localeCompare(b.client.name, 'pt-BR'));
  const internal = rows.filter((r) => r.client === null).reduce((s, r) => s + r.open, 0);
  const max = Math.max(1, ...clients.map((r) => r.open));
  return {
    rows: clients.slice(0, Math.max(0, limit)).map((r, i) => ({
      rank: i + 1,
      id: r.client.id,
      name: r.client.name,
      open: r.open,
      overdue: r.overdue,
      share: r.open / max,
      overdueShare: r.open ? Math.min(1, r.overdue / r.open) : 0,
    })),
    hidden: Math.max(0, clients.length - Math.max(0, limit)),
    internal,
    totals: {
      clients: clients.length,
      open: clients.reduce((s, r) => s + r.open, 0),
      overdue: clients.reduce((s, r) => s + r.overdue, 0),
      overdueClients: clients.filter((r) => r.overdue > 0).length,
    },
  };
}
