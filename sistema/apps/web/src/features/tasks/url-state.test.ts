import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  CLEARED_FILTERS,
  homeDepartmentKey,
  isGroupedSituation,
  parseTaskFilters,
  readHomeDepartment,
  readTaskView,
  sanitizeTaskView,
  taskViewKey,
  tasksHref,
  toTaskQuery,
  writeHomeDepartment,
  writeTaskFilters,
  writeTaskView,
} from './url-state';

const ID = '3f1c2b7a-9d4e-4c1a-8b2f-5e6d7c8b9a01';
const ID2 = '7a1c2b3d-9d4e-4c1a-8b2f-5e6d7c8b9a02';
const TODAY = '2026-10-28';
const p = (qs: string) => new URLSearchParams(qs);

describe('parseTaskFilters', () => {
  it('reads every filter of the URL', () => {
    const f = parseTaskFilters(
      p(`escopo=todas&visao=quadro&situacao=atrasadas&busca=balancete&cliente=${ID}&responsavel=nenhum&departamento=${ID2}&categoria=${ID}&prioridade=urgente&mes=2026-10&vencimento=2026-10-30&pagina=3&atrasadas=1`),
    );
    expect(f).toEqual({
      scope: 'all',
      view: 'board',
      situation: 'overdue',
      search: 'balancete',
      client: ID,
      assignee: 'none',
      department: ID2,
      category: ID,
      priority: 'urgent',
      month: '2026-10',
      dueDate: '2026-10-30',
      onlyOverdue: true,
      page: 3,
    });
  });

  it('falls back to the remembered scope and view, and to open tasks', () => {
    const f = parseTaskFilters(p(''), { scope: 'department', view: 'board' });
    expect(f).toMatchObject({ scope: 'department', view: 'board', situation: 'open', page: 1, client: '', assignee: '' });
  });

  it('ignores malformed values instead of sending them to the API', () => {
    const f = parseTaskFilters(p('escopo=tudo&situacao=x&cliente=../../billing&responsavel=1&mes=2026-13&vencimento=2026-02-31x&prioridade=altissima&pagina=-2'));
    expect(f).toMatchObject({ scope: 'mine', situation: 'open', client: '', assignee: '', month: '', dueDate: '', priority: '', page: 1 });
  });

  it('understands "Internas"', () => {
    expect(parseTaskFilters(p('cliente=interna')).client).toBe('internal');
  });
});

describe('writeTaskFilters', () => {
  it('writes Portuguese params, keeps unrelated ones and goes back to page 1', () => {
    const next = writeTaskFilters(p(`tarefa=${ID}&pagina=4&escopo=minhas`), { client: 'internal', assignee: 'none', situation: 'done', priority: 'high' });
    expect(next.get('tarefa')).toBe(ID);
    expect(next.get('cliente')).toBe('interna');
    expect(next.get('responsavel')).toBe('nenhum');
    expect(next.get('situacao')).toBe('concluidas');
    expect(next.get('prioridade')).toBe('alta');
    expect(next.has('pagina')).toBe(false);
  });

  it('drops defaults and empty values', () => {
    const next = writeTaskFilters(p('situacao=atrasadas&busca=x&atrasadas=1'), { situation: 'open', search: '  ', onlyOverdue: false });
    expect(next.toString()).toBe('');
  });

  it('round-trips through parse', () => {
    const patch = { scope: 'all' as const, view: 'list' as const, situation: 'waiting' as const, department: ID, month: '2026-11' as const };
    const f = parseTaskFilters(writeTaskFilters(p(''), patch));
    expect(f).toMatchObject(patch);
  });

  it('clears the filters but not scope, view and situation', () => {
    const before = p(`escopo=todas&visao=quadro&situacao=concluidas&busca=x&cliente=${ID}&categoria=${ID}&mes=2026-10`);
    const f = parseTaskFilters(writeTaskFilters(before, CLEARED_FILTERS));
    expect(activeFilterCount(f)).toBe(0);
    expect(f).toMatchObject({ scope: 'all', view: 'board', situation: 'done' });
  });
});

describe('toTaskQuery', () => {
  it('builds the list query with paging and without recurring occurrences (phase 1)', () => {
    const f = parseTaskFilters(p(`escopo=todas&situacao=atrasadas&responsavel=${ID}&pagina=2`));
    expect(toTaskQuery(f, TODAY)).toMatchObject({ scope: 'all', situation: 'overdue', assigneeId: ID, page: 2, pageSize: 50, occurrences: 'false' });
  });

  it('never filters "Minhas" by another assignee', () => {
    const f = parseTaskFilters(p(`escopo=minhas&responsavel=${ID}`));
    expect(toTaskQuery(f, TODAY).assigneeId).toBeUndefined();
  });

  it('loads every status for the board, closed ones from the last 14 days', () => {
    const board = toTaskQuery(parseTaskFilters(p('visao=quadro&situacao=concluidas')), TODAY);
    expect(board).toMatchObject({ situation: 'all', closedFrom: '2026-10-14', pageSize: 200 });
    expect(toTaskQuery(parseTaskFilters(p('visao=quadro&atrasadas=1')), TODAY).situation).toBe('overdue');
  });

  it('groups only the open situations', () => {
    expect(['open', 'overdue', 'waiting'].every((s) => isGroupedSituation(s as never))).toBe(true);
    expect(isGroupedSituation('done')).toBe(false);
    expect(isGroupedSituation('all')).toBe(false);
  });
});

describe('tasksHref', () => {
  it('links to the filtered list', () => {
    expect(tasksHref({ scope: 'mine', situation: 'overdue' })).toBe('/tarefas?escopo=minhas&situacao=atrasadas');
    expect(tasksHref({})).toBe('/tarefas');
  });
});

describe('remembered preferences', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: Partial<Storage> }).localStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it('keeps scope and view per workspace and user', () => {
    const key = taskViewKey('ws', 'me');
    expect(key).toBe('effinance.tasks.view.v1:ws:me');
    expect(readTaskView(key)).toEqual({ scope: 'mine', view: 'list' });
    writeTaskView(key, { scope: 'all', view: 'board' });
    expect(store.get(key)).toBe('{"escopo":"todas","visao":"quadro"}');
    expect(readTaskView(key)).toEqual({ scope: 'all', view: 'board' });
  });

  it('validates what it reads', () => {
    expect(sanitizeTaskView({ escopo: 'tudo', visao: 42 })).toEqual({ scope: 'mine', view: 'list' });
    store.set(taskViewKey('ws', 'me'), 'nope');
    expect(readTaskView(taskViewKey('ws', 'me'))).toEqual({ scope: 'mine', view: 'list' });
  });

  it('remembers the department of the home page', () => {
    const key = homeDepartmentKey('ws', 'me');
    writeHomeDepartment(key, 'all');
    expect(readHomeDepartment(key)).toBe('all');
    writeHomeDepartment(key, ID);
    expect(readHomeDepartment(key)).toBe(ID);
    store.set(key, '{"departamento":"../x"}');
    expect(readHomeDepartment(key)).toBeNull();
    writeHomeDepartment(key, null);
    expect(store.has(key)).toBe(false);
  });
});
