import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  areaMemoryKey,
  clearAreaMemories,
  landingPath,
  lastPathOf,
  railAreaFor,
  readAreaMemory,
  rememberAreaPath,
  sanitizeAreaMemory,
} from './area-memory';

/** Minimal Storage for the Node test environment. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}

const KEY = areaMemoryKey('ws-1', 'user-1');

describe('area memory', () => {
  beforeEach(() => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = new MemoryStorage();
  });
  afterEach(() => {
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
  });

  it('keys the memory by workspace and user', () => {
    expect(KEY).toBe('effinance.area.last.v1:ws-1:user-1');
  });

  it('remembers the last page (with the query) of each area and the last area used', () => {
    rememberAreaPath(KEY, '/tarefas?escopo=todas&visao=quadro');
    rememberAreaPath(KEY, '/contas-a-pagar?status=overdue');
    expect(readAreaMemory(KEY)).toEqual({
      gestao: '/tarefas?escopo=todas&visao=quadro',
      financeiro: '/contas-a-pagar?status=overdue',
      last: 'financeiro',
    });
    rememberAreaPath(KEY, '/tarefas/clientes');
    expect(readAreaMemory(KEY)).toMatchObject({ gestao: '/tarefas/clientes', financeiro: '/contas-a-pagar?status=overdue', last: 'gestao' });
  });

  it('does not remember common pages', () => {
    rememberAreaPath(KEY, '/');
    rememberAreaPath(KEY, '/configuracoes?aba=membros');
    expect(readAreaMemory(KEY)).toEqual({ gestao: '/', last: 'gestao' });
  });

  it('sends the switch button to the last page of the other area, else its home', () => {
    expect(lastPathOf({}, 'financeiro')).toBe('/financeiro');
    expect(lastPathOf({}, 'gestao')).toBe('/');
    expect(lastPathOf({ financeiro: '/extrato' }, 'financeiro')).toBe('/extrato');
  });

  it('drops tampered values: foreign hosts, paths of the wrong area, unknown areas', () => {
    expect(
      sanitizeAreaMemory({ gestao: '//evil.example/x', financeiro: '/tarefas', last: 'admin' }),
    ).toEqual({});
    expect(sanitizeAreaMemory({ gestao: 'https://evil.example/', financeiro: '/extrato?conta=1', last: 'gestao' })).toEqual({
      financeiro: '/extrato?conta=1',
      last: 'gestao',
    });
    sessionStorage.setItem(KEY, '{not json');
    expect(readAreaMemory(KEY)).toEqual({});
    expect(sanitizeAreaMemory(null)).toEqual({});
  });

  it('forgets the other workspaces when the workspace changes', () => {
    const other = areaMemoryKey('ws-2', 'user-1');
    rememberAreaPath(KEY, '/extrato');
    rememberAreaPath(other, '/metas');
    sessionStorage.setItem('effinance.activeMonth', '2026-10');
    clearAreaMemories(other);
    expect(readAreaMemory(KEY)).toEqual({});
    expect(readAreaMemory(other)).toMatchObject({ financeiro: '/metas' });
    expect(sessionStorage.getItem('effinance.activeMonth')).toBe('2026-10');
  });

  it('survives a browser without storage', () => {
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
    // The page still knows where it is; nothing is stored.
    expect(rememberAreaPath(KEY, '/extrato')).toEqual({ financeiro: '/extrato', last: 'financeiro' });
    expect(readAreaMemory(KEY)).toEqual({});
    expect(() => clearAreaMemories()).not.toThrow();
  });
});

describe('railAreaFor', () => {
  it('follows the page area for administrators and keeps the last one on common pages', () => {
    expect(railAreaFor('/extrato', {}, true)).toBe('financeiro');
    expect(railAreaFor('/tarefas', { last: 'financeiro' }, true)).toBe('gestao');
    expect(railAreaFor('/configuracoes', { last: 'financeiro' }, true)).toBe('financeiro');
    expect(railAreaFor('/pagina-inexistente', {}, true)).toBe('gestao');
  });

  it('always shows the Gestão to collaborators, also on a finance URL', () => {
    expect(railAreaFor('/contas-a-pagar', { last: 'financeiro' }, false)).toBe('gestao');
    expect(railAreaFor('/configuracoes', { last: 'financeiro' }, false)).toBe('gestao');
  });
});

describe('landingPath', () => {
  it('sends a collaborator with a finance `from` to the start page', () => {
    expect(landingPath('/contas-a-pagar?status=overdue', 'viewer')).toBe('/');
    expect(landingPath('/financeiro', null)).toBe('/');
  });

  it('keeps the page otherwise', () => {
    expect(landingPath('/contas-a-pagar', 'owner')).toBe('/contas-a-pagar');
    expect(landingPath('/contas-a-pagar', 'editor')).toBe('/contas-a-pagar');
    expect(landingPath('/tarefas?tarefa=1', 'viewer')).toBe('/tarefas?tarefa=1');
    expect(landingPath('/configuracoes', 'viewer')).toBe('/configuracoes');
  });
});
