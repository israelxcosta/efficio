// Tarefas: the creation hub at the top (every kind of task in one place) and the card of pending work
// per client further down.
import { describe, expect, it } from 'vitest';
import { rolePermissions, type PermissionKey } from '@effinance/shared';
import { activeHubView, clientPendingRanking, createActions, hubViewHref, hubViewItems } from './task-hub';

const can = (role: 'owner' | 'editor' | 'viewer', patch: Partial<Record<PermissionKey, boolean>> = {}) => {
  const map = { ...rolePermissions(role), ...patch };
  return (k: PermissionKey) => map[k] === true;
};

describe('hub: Ver (spec §2.9)', () => {
  const UUID = '0b8f3c1e-2a4d-4f6b-9c1d-123456789abc';

  it('lists the three views and the four pages for an administrator', () => {
    expect(hubViewItems(can('owner')).map((i) => i.id)).toEqual(['list', 'board', 'calendar', 'audit', 'recurring', 'regimes', 'processes']);
    expect(hubViewItems(can('owner')).map((i) => i.label)).toEqual([
      'Lista',
      'Quadro',
      'Calendário',
      'Auditoria mensal',
      'Tarefas recorrentes',
      'Grupos por regime',
      'Processos',
    ]);
    expect(hubViewItems(can('owner')).map((i) => i.group)).toEqual(['views', 'views', 'views', 'pages', 'pages', 'pages', 'pages']);
  });

  it('hides the pages turned off for the person', () => {
    expect(hubViewItems(can('viewer', { 'page.audit': false })).map((i) => i.id)).not.toContain('audit');
    const ids = hubViewItems(can('viewer', { 'page.recurring': false })).map((i) => i.id);
    expect(ids).not.toContain('recurring');
    expect(ids).not.toContain('regimes');
    expect(hubViewItems(can('viewer', { 'page.processes': false })).map((i) => i.id)).not.toContain('processes');
  });

  it('knows which item is the current page', () => {
    expect(activeHubView('/tarefas', new URLSearchParams(), 'board')).toBe('board');
    expect(activeHubView('/tarefas', new URLSearchParams())).toBe('list');
    expect(activeHubView('/tarefas/auditoria', new URLSearchParams())).toBe('audit');
    expect(activeHubView('/tarefas/recorrentes', new URLSearchParams())).toBe('recurring');
    expect(activeHubView('/tarefas/recorrentes', new URLSearchParams('visao=regimes'))).toBe('regimes');
    expect(activeHubView('/TAREFAS/Processos', new URLSearchParams())).toBe('processes');
    expect(activeHubView('/tarefas/processos/abc', new URLSearchParams())).toBe('processes');
    expect(activeHubView('/tarefas/clientes', new URLSearchParams())).toBeNull();
  });

  it('on Tarefas, changes only the view, keeps the filters and drops the sheets and the page', () => {
    const href = hubViewHref('board', '/tarefas', new URLSearchParams(`escopo=todas&cliente=${UUID}&tarefa=${UUID}&pagina=3&nova=1&recorrente=x&periodo=y`));
    const url = new URL(href, 'http://x');
    expect(url.pathname).toBe('/tarefas');
    expect(url.searchParams.get('visao')).toBe('quadro');
    expect(url.searchParams.get('escopo')).toBe('todas');
    expect(url.searchParams.get('cliente')).toBe(UUID);
    for (const key of ['tarefa', 'pagina', 'nova', 'recorrente', 'periodo']) expect(url.searchParams.has(key)).toBe(false);
  });

  it('from the other pages, goes to Tarefas with the view, and to each page by its path', () => {
    expect(hubViewHref('calendar', '/tarefas/auditoria', new URLSearchParams('competencia=2026-10'))).toBe('/tarefas?visao=calendario');
    expect(hubViewHref('list', '/tarefas/processos', new URLSearchParams())).toBe('/tarefas?visao=lista');
    expect(hubViewHref('regimes', '/tarefas', new URLSearchParams('visao=quadro'))).toBe('/tarefas/recorrentes?visao=regimes');
    expect(hubViewHref('audit', '/tarefas', new URLSearchParams())).toBe('/tarefas/auditoria');
    expect(hubViewHref('recurring', '/tarefas/recorrentes', new URLSearchParams('visao=regimes'))).toBe('/tarefas/recorrentes');
    expect(hubViewHref('processes', '/tarefas', new URLSearchParams())).toBe('/tarefas/processos');
  });
});

describe('hub: Criar (spec §2.9)', () => {
  it('offers every kind of task to an administrator, in the order of the hub', () => {
    expect(createActions(can('owner')).map((a) => a.id)).toEqual(['task', 'appointment', 'recurring', 'process']);
    expect(createActions(can('owner')).map((a) => a.label)).toEqual(['Nova tarefa', 'Novo compromisso', 'Nova tarefa recorrente', 'Novo processo']);
  });

  it('hides from a collaborator what only the registries create (recurring tasks)', () => {
    expect(createActions(can('viewer')).map((a) => a.id)).toEqual(['task', 'appointment', 'process']);
  });

  it('hides the recurring ones when the page of recurring tasks is hidden for the person', () => {
    expect(createActions(can('editor', { 'page.recurring': false })).map((a) => a.id)).toEqual(['task', 'appointment', 'process']);
  });

  it('opens the recurring task through the URL', () => {
    const byId = Object.fromEntries(createActions(can('owner')).map((a) => [a.id, a]));
    expect(byId.recurring!.href).toBe('/tarefas/recorrentes?recorrente=nova');
  });
});

describe('pending work per client', () => {
  const ref = (id: string, name: string) => ({ id, name });
  const rows = [
    { client: ref('b', 'Bravo'), open: 5, overdue: 0 },
    { client: null, open: 9, overdue: 3 },
    { client: ref('a', 'Alfa'), open: 5, overdue: 2 },
    { client: ref('c', 'Caju'), open: 2, overdue: 2 },
    { client: ref('d', 'Delta'), open: 1, overdue: 0 },
  ];

  it('ranks the clients by what is open, then by what is overdue, and leaves the internal tasks aside', () => {
    const r = clientPendingRanking(rows, 10);
    expect(r.rows.map((x) => [x.rank, x.id, x.open, x.overdue])).toEqual([
      [1, 'a', 5, 2],
      [2, 'b', 5, 0],
      [3, 'c', 2, 2],
      [4, 'd', 1, 0],
    ]);
    expect(r.internal).toBe(9);
  });

  it('sizes the bars by the largest client and splits the overdue part', () => {
    const r = clientPendingRanking(rows, 10);
    expect(r.rows[0]).toMatchObject({ share: 1, overdueShare: 0.4 });
    expect(r.rows[2]).toMatchObject({ share: 0.4, overdueShare: 1 });
  });

  it('sums the clients with pending work and the overdue ones', () => {
    expect(clientPendingRanking(rows, 10).totals).toEqual({ clients: 4, open: 13, overdue: 4, overdueClients: 2 });
  });

  it('shows the top of the ranking and says how many are left', () => {
    const r = clientPendingRanking(rows, 2);
    expect(r.rows.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r.hidden).toBe(2);
  });

  it('is empty without clients', () => {
    expect(clientPendingRanking([{ client: null, open: 2, overdue: 0 }], 5)).toEqual({ rows: [], hidden: 0, internal: 2, totals: { clients: 0, open: 0, overdue: 0, overdueClients: 0 } });
  });
});
