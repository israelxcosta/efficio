import { describe, expect, it } from 'vitest';
import type { Client, ClientResponsible } from '@effinance/shared';
import { settingsTabsFor } from '@/features/settings/pages/settings';
import { filterClients, missingDepartments, type ClientFilters } from './client-filters';
import { applyTaskPatch, newTaskDefaults } from './components/task-sheet';
import { clientOptionsFor, memberOptions } from './components/pickers';
import { resolveHomeDepartment } from './home-view';
import { CONTABIL, FISCAL, makeDetail, makeOptions, makeTask } from './test-fixtures';
import { optimisticTask, statusMessage } from './use-task-status';

describe('status changes', () => {
  it('words each change like the spec', () => {
    expect(statusMessage('todo', 'done', 'toggle')).toBe('Tarefa concluída.');
    expect(statusMessage('done', 'in_progress', 'toggle')).toBe('Tarefa reaberta.');
    expect(statusMessage('todo', 'waiting_client', 'move')).toBe('Movida para Aguardando cliente.');
    expect(statusMessage('todo', 'in_progress', 'menu')).toBe('Situação: Em andamento.');
    expect(statusMessage('todo', 'canceled', 'menu')).toBe('Tarefa cancelada.');
    expect(statusMessage('done', 'todo', 'undo')).toBeNull();
  });

  it('records who concluded and where to reopen, optimistically', () => {
    const open = makeTask({ status: 'in_progress', dueDate: '2026-10-20', overdue: true, daysOverdue: 8 });
    const done = optimisticTask(open, 'done', '2026-10-28', { id: 'me', name: 'Marina' }, '2026-10-28T15:00:00Z');
    expect(done).toMatchObject({ status: 'done', overdue: false, daysOverdue: 0, completedAt: '2026-10-28T15:00:00Z', reopenStatus: 'in_progress' });
    expect(done.completedBy).toEqual({ id: 'me', name: 'Marina' });
    const back = optimisticTask(done, 'in_progress', '2026-10-28', null, 'x');
    expect(back).toMatchObject({ status: 'in_progress', overdue: true, daysOverdue: 8, completedAt: null, completedBy: null });
  });
});

describe('pickers', () => {
  const o = makeOptions();

  it('puts you first, then the department, then the others', () => {
    const opts = memberOptions(o.members, { allowNone: true, allowAll: true, meFirst: true, departmentId: FISCAL.id });
    expect(opts.map((x) => x.value)).toEqual(['', 'none', 'me', 'ana', 'bruno', 'rafael']);
    expect(opts[2]!.label).toBe('Marina Costa (você)');
    expect(opts[3]!.group).toBe('Do Fiscal');
    expect(opts[4]!.group).toBe('Outros membros');
    expect(opts[5]!.hint).toBe('Sem departamento');
  });

  it('offers active clients, "Interna" on top and an inactive one only when chosen', () => {
    expect(clientOptionsFor(o.clients, '', { allowInternal: true }).map((x) => x.value)).toEqual(['internal', 'c1']);
    expect(clientOptionsFor(o.clients, 'c2', {}).map((x) => [x.value, x.hint])).toEqual([
      ['c2', 'Inativo'],
      ['c1', 'Simples Nacional'],
    ]);
  });
});

describe('task sheet', () => {
  const o = makeOptions();

  it('places an assigned task in the assignee department (the API rule) when patching', () => {
    const t = makeDetail({ department: CONTABIL });
    const next = applyTaskPatch(t, { assigneeId: 'ana' }, o);
    expect(next.assignee).toEqual({ id: 'ana', name: 'Ana Paula Ribeiro' });
    expect(next.department).toEqual(FISCAL);
    // Someone without department keeps the queue the task was in.
    expect(applyTaskPatch(t, { assigneeId: 'rafael' }, o).department).toEqual(CONTABIL);
  });

  it('recomputes overdue when the due date changes', () => {
    const t = makeDetail({ dueDate: '2026-11-10' });
    expect(applyTaskPatch(t, { dueDate: '2026-10-20' }, o)).toMatchObject({ overdue: true, daysOverdue: 8 });
    expect(applyTaskPatch(t, { clientId: null, categoryId: 'cat' }, o)).toMatchObject({ client: null, category: { id: 'cat', name: 'Impostos' } });
  });

  it('fills a new task from the URL: column, appointment, department and client filters, "Minhas"', () => {
    const params = new URLSearchParams(`nova=1&estado=em-andamento&horario=1&departamento=${FISCAL.id}&cliente=interna&escopo=minhas`);
    expect(newTaskDefaults(params, o, undefined)).toMatchObject({
      status: 'in_progress',
      dueDate: '2026-10-28',
      startTime: '09:00',
      endTime: '10:00',
      departmentId: FISCAL.id,
      clientId: '',
      assigneeId: 'me',
    });
    expect(newTaskDefaults(new URLSearchParams('nova=1&departamento=x'), o, undefined)).toMatchObject({ status: 'todo', departmentId: '', dueDate: '' });
  });

  it('copies a task to duplicate it, as a new open task', () => {
    const copy = makeDetail({ title: 'DAS', status: 'done', priority: 'urgent', client: { id: 'c1', name: 'Padaria' }, description: 'Guia' });
    expect(newTaskDefaults(new URLSearchParams('nova=1'), o, copy)).toMatchObject({ title: 'DAS', status: 'todo', priority: 'urgent', clientId: 'c1', description: 'Guia' });
  });
});

describe('home department', () => {
  it('lets administrators choose (URL, then the remembered one, then their own, then all)', () => {
    const o = makeOptions();
    expect(resolveHomeDepartment(o, 'todos', null)).toBe('all');
    expect(resolveHomeDepartment(o, CONTABIL.id, 'all')).toBe(CONTABIL.id);
    expect(resolveHomeDepartment(o, 'outro', CONTABIL.id)).toBe(CONTABIL.id);
    expect(resolveHomeDepartment(o, null, null)).toBe(FISCAL.id);
    expect(resolveHomeDepartment({ ...o, me: { ...o.me, department: null } }, null, null)).toBe('all');
  });

  it('gives collaborators their own department only (the API decides)', () => {
    const o = makeOptions();
    expect(resolveHomeDepartment({ ...o, me: { ...o.me, isAdmin: false, role: 'viewer' } }, CONTABIL.id, 'all')).toBeUndefined();
  });
});

describe('clients of the Gestão', () => {
  const client = (id: string, name: string, patch: Partial<Client> = {}) =>
    ({ id, name, tradeName: null, document: '12345678000190', taxRegime: 'simples_nacional', status: 'active', ...patch }) as Client;
  const clients = [
    client('a', 'Alicerce Engenharia', { tradeName: 'Alicerce', document: '08241739000105', taxRegime: 'presumed_profit' }),
    client('b', 'Padaria Pão Quente Ltda', { tradeName: 'Pão Quente' }),
    client('c', 'Clínica Sorriso', { status: 'inactive' }),
  ];
  const departments = [FISCAL, CONTABIL];
  const items: ClientResponsible[] = [
    { clientId: 'a', departmentId: FISCAL.id, user: { id: 'ana', name: 'Ana' } },
    { clientId: 'a', departmentId: CONTABIL.id, user: { id: 'bruno', name: 'Bruno' } },
    { clientId: 'b', departmentId: FISCAL.id, user: { id: 'me', name: 'Marina' } },
  ];
  const base: ClientFilters = { search: '', situation: 'active', regime: '', department: '', responsible: '', unassigned: false };
  const ids = (f: Partial<ClientFilters>) => filterClients(clients, { ...base, ...f }, departments, items).map((c) => c.id);

  it('filters by situation, regime and search (name without accents, or CNPJ digits)', () => {
    expect(ids({})).toEqual(['a', 'b']);
    expect(ids({ situation: 'all' })).toEqual(['a', 'c', 'b']);
    expect(ids({ regime: 'presumed_profit' })).toEqual(['a']);
    expect(ids({ search: 'pao' })).toEqual(['b']);
    expect(ids({ search: '08.241.739' })).toEqual(['a']);
  });

  it('filters by responsible (the portfolio) and by gaps', () => {
    expect(ids({ responsible: 'bruno' })).toEqual(['a']);
    expect(ids({ responsible: 'ana', department: CONTABIL.id })).toEqual([]);
    expect(ids({ unassigned: true })).toEqual(['b']);
    expect(ids({ unassigned: true, department: FISCAL.id })).toEqual([]);
    expect(missingDepartments('b', departments, items)).toEqual([CONTABIL]);
  });
});

describe('settings', () => {
  it('hides the finance sections from collaborators', () => {
    expect(settingsTabsFor(false)).toEqual(['perfil', 'seguranca', 'membros', 'privacidade']);
    expect(settingsTabsFor(true)).toContain('integracoes');
    expect(settingsTabsFor(true)).toContain('assinatura');
  });
});
