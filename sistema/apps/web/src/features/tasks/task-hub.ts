// Tarefas: the creation hub (every kind of task in one place, only what the person may create) and
// the ranking of pending work per client (the card further down). Pure functions, tested in
// task-hub.test.ts.

import type { PermissionKey, TaskListSummary } from '@effinance/shared';

export type CreateActionId = 'task' | 'appointment' | 'recurring' | 'process' | 'regimeGroup';

export interface CreateAction {
  id: CreateActionId;
  label: string;
  /** One line under the button's name (menus and the tooltip). */
  description: string;
  /** Pages that create it (the others open a sheet or a menu over Tarefas). */
  href?: string;
}

/**
 * The hub's buttons, in order. Tasks, appointments and processes are day-to-day work (every member;
 * an inactive subscription disables them, the WriteGate says why); recurring tasks and the regime
 * groups are registries (`registry`) and live on the page of recurring tasks (`page.recurring`), so
 * they are hidden — not disabled — from whoever lacks either.
 */
export function createActions(can: (key: PermissionKey) => boolean): CreateAction[] {
  const registry = can('registry') && can('page.recurring');
  const all: (CreateAction & { show: boolean })[] = [
    { id: 'task', label: 'Tarefa', description: 'Uma tarefa avulsa, com prazo e responsável.', show: true },
    { id: 'appointment', label: 'Compromisso', description: 'Com horário na agenda (reunião, visita).', show: true },
    {
      id: 'recurring',
      label: 'Tarefa recorrente',
      description: 'Uma obrigação que se repete para os clientes a cada período.',
      href: '/tarefas/recorrentes?recorrente=nova',
      show: registry,
    },
    { id: 'process', label: 'Processo', description: 'Etapas em sequência: a partir de um modelo ou avulso.', show: true },
    {
      id: 'regimeGroup',
      label: 'Grupo por regime',
      description: 'As obrigações padrão de um regime, geradas todo mês para cada empresa dele.',
      href: '/tarefas/recorrentes?visao=regimes',
      show: registry,
    },
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
