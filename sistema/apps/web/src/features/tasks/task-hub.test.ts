// Tarefas: the creation hub at the top (every kind of task in one place) and the card of pending work
// per client further down.
import { describe, expect, it } from 'vitest';
import { rolePermissions, type PermissionKey } from '@effinance/shared';
import { clientPendingRanking, createActions } from './task-hub';

const can = (role: 'owner' | 'editor' | 'viewer', patch: Partial<Record<PermissionKey, boolean>> = {}) => {
  const map = { ...rolePermissions(role), ...patch };
  return (k: PermissionKey) => map[k] === true;
};

describe('creation hub', () => {
  it('offers every kind of task to an administrator, in the order of the hub', () => {
    expect(createActions(can('owner')).map((a) => a.id)).toEqual(['task', 'appointment', 'recurring', 'process', 'regimeGroup']);
  });

  it('hides from a collaborator what only the registries create (recurring tasks and regime groups)', () => {
    expect(createActions(can('viewer')).map((a) => a.id)).toEqual(['task', 'appointment', 'process']);
  });

  it('hides the recurring ones when the page of recurring tasks is hidden for the person', () => {
    expect(createActions(can('editor', { 'page.recurring': false })).map((a) => a.id)).toEqual(['task', 'appointment', 'process']);
  });

  it('opens the recurring tasks and the regime groups through the URL, and the process with both ways', () => {
    const byId = Object.fromEntries(createActions(can('owner')).map((a) => [a.id, a]));
    expect(byId.recurring!.href).toBe('/tarefas/recorrentes?recorrente=nova');
    expect(byId.regimeGroup!.href).toBe('/tarefas/recorrentes?visao=regimes');
    expect(byId.task!.label).toBe('Tarefa');
    expect(byId.process!.label).toBe('Processo');
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
