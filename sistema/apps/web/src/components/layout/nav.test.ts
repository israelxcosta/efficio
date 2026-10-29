import { describe, expect, it } from 'vitest';
import { areaOf, FINANCE_NAV_ITEMS, GESTAO_NAV_ITEMS, isActivePath, navItemsFor, RAIL_GAP_PX, RAIL_ITEM_PX, splitRail } from './nav';

const items = Array.from({ length: 12 }, (_, i) => i);
const heightFor = (slots: number) => slots * RAIL_ITEM_PX + (slots - 1) * RAIL_GAP_PX;

describe('splitRail', () => {
  it('keeps every icon when they fit', () => {
    expect(splitRail(items, heightFor(12))).toEqual({ visible: items, hidden: [] });
    expect(splitRail(items, 2000).hidden).toEqual([]);
  });

  it('gives the last slot to the "more" button when they do not fit', () => {
    const { visible, hidden } = splitRail(items, heightFor(8));
    expect(visible).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(hidden).toEqual([7, 8, 9, 10, 11]);
  });

  it('shows everything before the first measure', () => {
    expect(splitRail(items, 0).hidden).toEqual([]);
  });

  it('keeps at least the button on a tiny rail', () => {
    expect(splitRail(items, 10)).toEqual({ visible: [], hidden: items });
  });
});

describe('areas', () => {
  it('puts the start page and /tarefas/* in the Gestão', () => {
    expect(areaOf('/')).toBe('gestao');
    expect(areaOf('/tarefas')).toBe('gestao');
    expect(areaOf('/tarefas/clientes')).toBe('gestao');
    expect(areaOf('/tarefas?escopo=todas')).toBe('gestao');
  });

  it('keeps every finance path (and its sub-paths) in the Financeiro', () => {
    for (const path of ['/financeiro', '/extrato', '/contas-a-pagar', '/cartoes/abc', '/relatorios/cliente/1', '/clientes', '/categorias', '/contatos'])
      expect(areaOf(path)).toBe('financeiro');
  });

  it('treats settings and unknown pages as common, and does not confuse prefixes', () => {
    expect(areaOf('/configuracoes')).toBe('common');
    expect(areaOf('/nada')).toBe('common');
    expect(areaOf('/clientes-x')).toBe('common');
    expect(areaOf('/tarefasx')).toBe('common');
  });

  it('has the phase 1 rail of the Gestão only (no audit, recurring, processes or reports yet)', () => {
    expect(GESTAO_NAV_ITEMS.map((i) => i.to)).toEqual(['/', '/tarefas', '/tarefas/clientes', '/tarefas/cadastros']);
    expect(GESTAO_NAV_ITEMS.filter((i) => i.mobile).map((i) => i.label)).toEqual(['Início', 'Tarefas', 'Clientes']);
    expect(navItemsFor('gestao')).toBe(GESTAO_NAV_ITEMS);
  });

  it('moves the finance panel to /financeiro', () => {
    expect(FINANCE_NAV_ITEMS[0]).toMatchObject({ to: '/financeiro', label: 'Painel financeiro' });
    expect(FINANCE_NAV_ITEMS.some((i) => i.to === '/')).toBe(false);
    expect(navItemsFor('financeiro')).toBe(FINANCE_NAV_ITEMS);
  });
});

describe('isActivePath', () => {
  it('marks Tarefas only on its own page (the other Gestão pages live under it)', () => {
    const tarefas = GESTAO_NAV_ITEMS[1]!;
    expect(isActivePath('/tarefas', tarefas)).toBe(true);
    expect(isActivePath('/tarefas/clientes', tarefas)).toBe(false);
    expect(isActivePath('/tarefas/clientes', GESTAO_NAV_ITEMS[2]!)).toBe(true);
  });

  it('marks the start page only on /', () => {
    expect(isActivePath('/', GESTAO_NAV_ITEMS[0]!)).toBe(true);
    expect(isActivePath('/tarefas', GESTAO_NAV_ITEMS[0]!)).toBe(false);
  });

  it('keeps sub-paths active for finance items', () => {
    expect(isActivePath('/cartoes/123', { to: '/cartoes' })).toBe(true);
    expect(isActivePath('/cartoesx', { to: '/cartoes' })).toBe(false);
  });
});
