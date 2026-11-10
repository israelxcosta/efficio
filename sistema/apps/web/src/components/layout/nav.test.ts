import { describe, expect, it } from 'vitest';
import { areaOf, FINANCE_NAV_ITEMS, GESTAO_NAV_ITEMS, hostsTaskSheets, isActivePath, MY_AREA_ITEM, navItemsFor, RAIL_GAP_PX, RAIL_ITEM_PX, railItemsFor, splitRail } from './nav';

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

  it('matches like the router: any letter case and percent-encoded letters (security regression)', () => {
    // React Router opens /FINANCEIRO and /%65xtrato as finance pages; they must count as finance too.
    for (const path of ['/FINANCEIRO', '/Extrato/', '/%65xtrato', '/Contas-A-Pagar?status=overdue', '/Cartoes/ABC'])
      expect(areaOf(path)).toBe('financeiro');
    expect(areaOf('/TAREFAS/Clientes')).toBe('gestao');
    // An encoded slash stays one segment (the router answers 404 there), and bad encodings do not throw.
    expect(areaOf('/financeiro%2F..')).toBe('common');
    expect(areaOf('/%E0%A4%A')).toBe('common');
  });

  it('treats settings and unknown pages as common, and does not confuse prefixes', () => {
    expect(areaOf('/configuracoes')).toBe('common');
    expect(areaOf('/nada')).toBe('common');
    expect(areaOf('/clientes-x')).toBe('common');
    expect(areaOf('/tarefasx')).toBe('common');
  });

  it('has the 5-item rail of the Gestão and keeps the hub pages in the list (spec §2.2, revision 4)', () => {
    expect(GESTAO_NAV_ITEMS.map((i) => i.to)).toEqual([
      '/',
      '/tarefas',
      '/tarefas/clientes',
      '/tarefas/relatorios',
      '/tarefas/cadastros',
      '/tarefas/auditoria',
      '/tarefas/recorrentes',
      '/tarefas/processos',
    ]);
    expect(railItemsFor('gestao').map((i) => i.short ?? i.label)).toEqual(['Início', 'Tarefas', 'Clientes', 'Relatórios', 'Cadastros']);
    expect(GESTAO_NAV_ITEMS.filter((i) => i.place === 'hub').map((i) => i.to)).toEqual(['/tarefas/auditoria', '/tarefas/recorrentes', '/tarefas/processos']);
    expect(GESTAO_NAV_ITEMS.filter((i) => i.mobile).map((i) => i.label)).toEqual(['Início', 'Tarefas', 'Clientes']);
    expect(navItemsFor('gestao')).toBe(GESTAO_NAV_ITEMS);
    expect(railItemsFor('financeiro')).toEqual(FINANCE_NAV_ITEMS);
  });

  it('moves the finance panel to /financeiro', () => {
    expect(FINANCE_NAV_ITEMS[0]).toMatchObject({ to: '/financeiro', label: 'Painel financeiro' });
    expect(FINANCE_NAV_ITEMS.some((i) => i.to === '/')).toBe(false);
    expect(navItemsFor('financeiro')).toBe(FINANCE_NAV_ITEMS);
  });
});

describe('isActivePath', () => {
  it('marks Tarefas on its page and on the hub pages, not on the other Gestão pages', () => {
    const tarefas = GESTAO_NAV_ITEMS[1]!;
    expect(isActivePath('/tarefas', tarefas)).toBe(true);
    expect(isActivePath('/tarefas/auditoria', tarefas)).toBe(true);
    expect(isActivePath('/tarefas/recorrentes', tarefas)).toBe(true);
    expect(isActivePath('/tarefas/processos/x', tarefas)).toBe(true);
    expect(isActivePath('/tarefas/clientes', tarefas)).toBe(false);
    expect(isActivePath('/tarefas/relatorios', tarefas)).toBe(false);
    expect(isActivePath('/tarefas/auditoriax', tarefas)).toBe(false);
    expect(isActivePath('/tarefas/clientes', GESTAO_NAV_ITEMS.find((i) => i.to === '/tarefas/clientes')!)).toBe(true);
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

describe('Minha área (spec §15.4)', () => {
  it('is a common route that still hosts the task sheets', () => {
    expect(areaOf('/minha-area')).toBe('common');
    expect(hostsTaskSheets('/minha-area')).toBe(true);
    expect(hostsTaskSheets('/Minha-Area')).toBe(true);
    expect(hostsTaskSheets('/minha-area?tarefa=x')).toBe(true);
    expect(hostsTaskSheets('/tarefas/auditoria')).toBe(true);
    expect(hostsTaskSheets('/')).toBe(true);
    expect(hostsTaskSheets('/configuracoes')).toBe(false);
    expect(hostsTaskSheets('/extrato')).toBe(false);
    expect(hostsTaskSheets('/minha-areax')).toBe(false);
  });

  it('has its item for ⌘K and the "Mais"', () => {
    expect(MY_AREA_ITEM).toMatchObject({ to: '/minha-area', label: 'Minha área' });
    expect(MY_AREA_ITEM.keywords).toContain('perfil');
  });
});
