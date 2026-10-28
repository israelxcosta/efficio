import { describe, expect, it } from 'vitest';
import {
  applySize,
  arrange,
  arrangeBoard,
  boardBottom,
  canArrange,
  clampSize,
  columnsForWidth,
  commitCols,
  compact,
  displaySpan,
  emptyLayout,
  firstFit,
  fitCount,
  GRID,
  heightForRows,
  hiddenCount,
  isVisible,
  mergeOrder,
  moveItem,
  nudgeItem,
  resizeItem,
  resolveBoard,
  sanitizeLayout,
  setWidgetVisible,
  showAllWidgets,
  snapResize,
  withBoard,
} from './layout';
import { SPEC_BY_ID, WIDGET_GROUPS, WIDGET_SPECS } from './specs';
import type { BoardItem, DashboardLayout, WidgetId } from './types';

const fluxo = SPEC_BY_ID['fluxo-caixa'];
const board = (layout: DashboardLayout, cols: 4 | 2 | 1 = 4) => resolveBoard(layout, WIDGET_SPECS, 'business', cols);
const cellOf = (items: readonly BoardItem[], id: WidgetId) => {
  const item = items.find((i) => i.id === id)!;
  return { x: item.x, y: item.y };
};
const item = (id: WidgetId, x: number, y: number, c: number, r: number): BoardItem => ({ id, x, y, c, r });

/** No two cards share a cell and every card is inside the columns. */
function expectValid(items: readonly BoardItem[], cols: number) {
  const taken = new Set<string>();
  for (const i of items) {
    expect(i.x, i.id).toBeGreaterThanOrEqual(0);
    expect(i.y, i.id).toBeGreaterThanOrEqual(0);
    expect(i.x + i.c, i.id).toBeLessThanOrEqual(cols);
    for (let y = i.y; y < i.y + i.r; y++) {
      for (let x = i.x; x < i.x + i.c; x++) {
        expect(taken.has(`${x},${y}`), `${i.id} overlaps at ${x},${y}`).toBe(false);
        taken.add(`${x},${y}`);
      }
    }
  }
}

/** Empty cells above the last row of the board. */
function holes(items: readonly BoardItem[], cols: number): number {
  return boardBottom(items) * cols - items.reduce((sum, i) => sum + i.c * i.r, 0);
}

describe('sizes', () => {
  it('clamps to the spec and the global limits', () => {
    expect(clampSize({ c: 9, r: 99 }, fluxo)).toEqual({ c: 4, r: 7 });
    expect(clampSize({ c: 1, r: 1 }, fluxo)).toEqual({ c: 2, r: 3 });
    expect(clampSize({ c: 2.6, r: 4.4 }, fluxo)).toEqual({ c: 3, r: 4 });
    expect(clampSize({ c: Number.NaN, r: 3 }, fluxo)).toEqual(fluxo.defaultSize);
    expect(clampSize(undefined, fluxo)).toEqual(fluxo.defaultSize);
  });

  it('computes heights from rows', () => {
    expect(heightForRows(3, 4)).toBe(3 * 96 + 2 * 16);
    expect(heightForRows(3, 2)).toBe(3 * 88 + 2 * 16);
  });

  it('limits the displayed span to the grid columns and keeps the desktop width on narrow grids', () => {
    expect(displaySpan(4, 2)).toBe(2);
    expect(displaySpan(1, 4)).toBe(1);
    expect(commitCols(4, 2, 2)).toBe(4);
    expect(commitCols(4, 2, 1)).toBe(1);
  });

  it('snaps a drag to whole cells', () => {
    const m = { colW: 280, rowPx: 86, gap: 12, cols: 4 };
    expect(snapResize({ c: 2, r: 5 }, 140, 48, m, fluxo)).toEqual({ c: 2, r: 5 });
    expect(snapResize({ c: 2, r: 5 }, 1.5 * 292, -98, m, fluxo)).toEqual({ c: 4, r: 4 });
    expect(snapResize({ c: 2, r: 5 }, 2000, 2000, { ...m, cols: 2 }, fluxo)).toEqual({ c: 2, r: 7 });
    expect(snapResize({ c: 2, r: 5 }, -2000, -2000, m, fluxo)).toEqual({ c: 2, r: 3 });
  });

  it('picks columns from the grid width', () => {
    expect(columnsForWidth(559)).toBe(1);
    expect(columnsForWidth(560)).toBe(2);
    expect(columnsForWidth(999)).toBe(2);
    expect(columnsForWidth(1000)).toBe(4);
  });
});

describe('visibility', () => {
  it('honors defaults, explicit choices and the workspace kind', () => {
    const layout = emptyLayout();
    expect(isVisible(layout, SPEC_BY_ID.evolucao, 'business')).toBe(false);
    expect(isVisible({ ...layout, visible: { evolucao: true } }, SPEC_BY_ID.evolucao, 'business')).toBe(true);
    expect(isVisible(layout, SPEC_BY_ID['carteira-clientes'], 'business')).toBe(true);
    expect(isVisible(layout, SPEC_BY_ID['carteira-clientes'], 'personal')).toBe(false);
    // Client widgets can still be turned on outside business workspaces.
    expect(isVisible({ ...layout, visible: { 'carteira-clientes': true } }, SPEC_BY_ID['carteira-clientes'], 'personal')).toBe(true);
    // Personal-finance widgets start hidden in an office (health score, card invoice, goals).
    expect(isVisible(layout, SPEC_BY_ID.saude, 'business')).toBe(false);
    expect(isVisible(layout, SPEC_BY_ID.inadimplencia, 'business')).toBe(true);
    expect(hiddenCount({ ...layout, visible: { 'saldo-contas': false, evolucao: false } }, WIDGET_SPECS, 'business')).toBe(1);
  });
});

describe('default board', () => {
  it('starts with fees and collection, then cash, clients, analyses and recurring entries', () => {
    const items = board(emptyLayout());
    expect(items.map((i) => i.id)).toEqual([
      'inadimplencia',
      'clientes-devedores',
      'proximos-vencimentos',
      'fluxo-caixa',
      'saldo-contas',
      'projecao-caixa',
      'insights',
      'honorarios-mes',
      'carteira-clientes',
      'vigencias-honorarios',
      'resumo-periodo',
      'despesas-categoria',
      'resultado-mensal',
      'gastos-fixos',
      'receitas-fixas',
    ]);
    expect(cellOf(items, 'clientes-devedores')).toEqual({ x: 2, y: 0 });
    expect(cellOf(items, 'fluxo-caixa')).toEqual({ x: 0, y: 6 });
  });

  it('packs with no holes at 4 columns in every workspace kind', () => {
    for (const kind of ['business', 'personal'] as const) {
      const items = resolveBoard(emptyLayout(), WIDGET_SPECS, kind, 4);
      expectValid(items, 4);
      expect(holes(items, 4), kind).toBe(0);
    }
  });

  it('derives narrower boards from the reading order of the wider one', () => {
    const wide = board(withBoard(emptyLayout(), 4, [item('inadimplencia', 0, 0, 2, 3), item('fluxo-caixa', 2, 0, 2, 4)]));
    const medium = board({ ...emptyLayout(), cells: { 4: Object.fromEntries(wide.map((i) => [i.id, { x: i.x, y: i.y }])) } }, 2);
    expect(medium.slice(0, 2).map((i) => i.id)).toEqual(['inadimplencia', 'fluxo-caixa']);
    expectValid(medium, 2);
    const phone = board(emptyLayout(), 1);
    expect(phone.map((i) => i.id)).toEqual(board(emptyLayout(), 2).map((i) => i.id));
    expect(holes(phone, 1)).toBe(0);
  });
});

describe('free placement', () => {
  const start = board(emptyLayout());

  it('drops a card on any free cell, leaving its old space empty', () => {
    const bottom = boardBottom(start);
    const next = moveItem(start, 'inadimplencia', { x: 0, y: bottom }, 4);
    expect(cellOf(next, 'inadimplencia')).toEqual({ x: 0, y: bottom });
    // Nothing rose to fill the 2×3 space it left.
    for (const i of next.filter((i) => i.id !== 'inadimplencia')) expect(cellOf(next, i.id)).toEqual(cellOf(start, i.id));
    expect(next.some((i) => i.x < 2 && i.y < 3)).toBe(false);
    expectValid(next, 4);
  });

  it('pushes the cards it lands on down, and those below them in turn', () => {
    // Saldo (2×4 at 2,6) dropped on Clientes devedores (2×3 at 2,0).
    const next = moveItem(start, 'saldo-contas', { x: 2, y: 0 }, 4);
    expect(cellOf(next, 'saldo-contas')).toEqual({ x: 2, y: 0 });
    expect(cellOf(next, 'clientes-devedores')).toEqual({ x: 2, y: 4 });
    expect(cellOf(next, 'inadimplencia')).toEqual({ x: 0, y: 0 });
    expectValid(next, 4);
  });

  it('keeps the card inside the columns', () => {
    const next = moveItem(start, 'proximos-vencimentos', { x: 3, y: 40 }, 4);
    expect(cellOf(next, 'proximos-vencimentos').x).toBe(0);
    expectValid(next, 4);
  });

  it('pushes down what a resized card now covers', () => {
    const next = resizeItem(start, 'inadimplencia', { c: 2, r: 5 }, 4);
    expect(next.find((i) => i.id === 'inadimplencia')!.r).toBe(5);
    expect(cellOf(next, 'proximos-vencimentos')).toEqual({ x: 0, y: 5 });
    expectValid(next, 4);
  });

  it('"Organizar" moves cards up to close the gaps, keeping their columns', () => {
    // Insights (4×2 at row 14) goes to the bottom: rows 14–15 stay empty until "Organizar".
    const gapped = moveItem(start, 'insights', { x: 0, y: boardBottom(start) }, 4);
    expect(canArrange(gapped, 4)).toBe(true);
    expect(cellOf(gapped, 'honorarios-mes')).toEqual({ x: 0, y: 16 });
    const arranged = arrange(gapped, 4);
    expect(canArrange(arranged, 4)).toBe(false);
    expect(holes(arranged, 4)).toBe(0);
    expect(cellOf(arranged, 'honorarios-mes')).toEqual({ x: 0, y: 14 });
    expect(cellOf(arranged, 'insights')).toEqual({ x: 0, y: boardBottom(start) - 2 });
    expectValid(arranged, 4);
    // Rising in its own columns only would leave this space next to vencimentos (4×3) empty.
    expect(cellOf(compact(gapped), 'insights')).toEqual(cellOf(arranged, 'insights'));

    const layout = withBoard(emptyLayout(), 4, gapped);
    const after = arrangeBoard(layout, 4, WIDGET_SPECS, 'business');
    expect(board(after)).toEqual(arranged);
    expect(arrangeBoard(after, 4, WIDGET_SPECS, 'business')).toBe(after);
  });

  it('"Organizar" sends a card a wider one keeps from rising to a higher free space', () => {
    // Saldo dropped on Inadimplência: the right side of the top rows is left empty.
    const gapped = moveItem(moveItem(start, 'clientes-devedores', { x: 2, y: 34 }, 4), 'saldo-contas', { x: 0, y: 0 }, 4);
    expect(gapped.some((i) => i.x >= 2 && i.y < 7)).toBe(false);
    // Rising in their own columns, no card reaches that space (vencimentos is 4 columns wide).
    expect(compact(gapped).some((i) => i.x >= 2 && i.y < 7)).toBe(false);
    const arranged = arrange(gapped, 4);
    expect(cellOf(arranged, 'saldo-contas')).toEqual({ x: 0, y: 0 });
    expect(cellOf(arranged, 'inadimplencia')).toEqual({ x: 2, y: 0 });
    expect(cellOf(arranged, 'proximos-vencimentos')).toEqual({ x: 0, y: 4 });
    expect(holes(arranged, 4)).toBeLessThan(holes(gapped, 4));
    expect(canArrange(arranged, 4)).toBe(false);
    expectValid(arranged, 4);
  });

  it('"Organizar" leaves a card alone when it could only move sideways', () => {
    const items = [item('clientes-devedores', 2, 0, 2, 3), item('proximos-vencimentos', 0, 3, 4, 3)];
    expect(canArrange(items, 4)).toBe(false);
    expect(arrange(items, 4)).toEqual(items);
  });

  it('finds the first free space from the top', () => {
    const items = [item('inadimplencia', 0, 0, 2, 3), item('fluxo-caixa', 0, 3, 4, 4)];
    expect(firstFit(items, { c: 2, r: 3 }, 4)).toEqual({ x: 2, y: 0 });
    expect(firstFit(items, { c: 2, r: 4 }, 4)).toEqual({ x: 0, y: 7 });
    expect(firstFit(items, { c: 4, r: 2 }, 2)).toEqual({ x: 0, y: 7 });
  });
});

describe('keyboard moves', () => {
  const items = [item('inadimplencia', 0, 0, 2, 3), item('clientes-devedores', 2, 0, 2, 3), item('proximos-vencimentos', 0, 3, 4, 3)];

  it('trades places with the card in the way', () => {
    const right = nudgeItem(items, 'inadimplencia', 'right', 4);
    expect(cellOf(right, 'inadimplencia')).toEqual({ x: 2, y: 0 });
    expect(cellOf(right, 'clientes-devedores')).toEqual({ x: 0, y: 0 });
    const down = nudgeItem(items, 'inadimplencia', 'down', 4);
    expect(cellOf(down, 'proximos-vencimentos')).toEqual({ x: 0, y: 0 });
    expect(cellOf(down, 'inadimplencia')).toEqual({ x: 0, y: 3 });
    expectValid(down, 4);
    const up = nudgeItem(items, 'proximos-vencimentos', 'up', 4);
    expect(cellOf(up, 'proximos-vencimentos')).toEqual({ x: 0, y: 0 });
    expect(cellOf(up, 'inadimplencia')).toEqual({ x: 0, y: 3 });
    expectValid(up, 4);
  });

  it('moves into free cells and stops at the edges and below the others', () => {
    const lone = [item('inadimplencia', 0, 0, 2, 3), item('clientes-devedores', 2, 0, 2, 3)];
    expect(nudgeItem(lone, 'inadimplencia', 'left', 4)).toEqual(lone);
    expect(nudgeItem(lone, 'inadimplencia', 'up', 4)).toEqual(lone);
    const once = nudgeItem(lone, 'inadimplencia', 'down', 4);
    expect(cellOf(once, 'inadimplencia')).toEqual({ x: 0, y: 1 });
    expect(nudgeItem(nudgeItem(nudgeItem(once, 'inadimplencia', 'down', 4), 'inadimplencia', 'down', 4), 'inadimplencia', 'down', 4)).toEqual(
      nudgeItem(nudgeItem(once, 'inadimplencia', 'down', 4), 'inadimplencia', 'down', 4),
    );
  });
});

describe('one column', () => {
  const list = [item('inadimplencia', 0, 0, 1, 3), item('fluxo-caixa', 0, 3, 1, 4), item('insights', 0, 7, 1, 2)];

  it('is a list: a drop reorders it with no gaps', () => {
    const down = moveItem(list, 'inadimplencia', { x: 0, y: 4 }, 1);
    expect(down.map((i) => [i.id, i.y])).toEqual([
      ['fluxo-caixa', 0],
      ['inadimplencia', 4],
      ['insights', 7],
    ]);
    expect(moveItem(list, 'insights', { x: 0, y: 0 }, 1).map((i) => i.id)).toEqual(['insights', 'inadimplencia', 'fluxo-caixa']);
    // A taller card dropped on the first row goes first, and a small move keeps the order.
    expect(moveItem(list, 'fluxo-caixa', { x: 0, y: 0 }, 1).map((i) => i.id)).toEqual(['fluxo-caixa', 'inadimplencia', 'insights']);
    expect(moveItem(list, 'fluxo-caixa', { x: 0, y: 2 }, 1)).toEqual(list);
    expect(moveItem(list, 'inadimplencia', { x: 0, y: 1 }, 1)).toEqual(list);
    expect(nudgeItem(list, 'fluxo-caixa', 'up', 1).map((i) => [i.id, i.y])).toEqual([
      ['fluxo-caixa', 0],
      ['inadimplencia', 4],
      ['insights', 7],
    ]);
    expect(nudgeItem(list, 'fluxo-caixa', 'right', 1)).toEqual(list);
  });

  it('closes the space a smaller card leaves', () => {
    expect(resizeItem(list, 'fluxo-caixa', { c: 1, r: 3 }, 1).map((i) => i.y)).toEqual([0, 3, 6]);
  });
});

describe('showing, hiding and resizing in the layout', () => {
  it('puts a card turned on in the first free space, without moving the others', () => {
    const start = board(emptyLayout());
    // Hiding Clientes devedores leaves a 2×3 hole at the top right once the board is arranged.
    const arranged = withBoard(emptyLayout(), 4, start);
    const hidden = setWidgetVisible(arranged, 'clientes-devedores', false, WIDGET_SPECS, 'business');
    expect(hidden.cells[4]!['clientes-devedores']).toBeUndefined();
    const shown = setWidgetVisible(hidden, 'saude', true, WIDGET_SPECS, 'business');
    const items = board(shown);
    expect(cellOf(items, 'saude')).toEqual({ x: 2, y: 0 });
    for (const i of start.filter((i) => i.id !== 'clientes-devedores')) expect(cellOf(items, i.id)).toEqual(cellOf(start, i.id));
  });

  it('keeps the default board in place when a card is turned on', () => {
    const start = board(emptyLayout());
    const items = board(setWidgetVisible(emptyLayout(), 'metas', true, WIDGET_SPECS, 'business'));
    for (const i of start) expect(cellOf(items, i.id)).toEqual(cellOf(start, i.id));
    expect(cellOf(items, 'metas')).toEqual({ x: 0, y: boardBottom(start) });
  });

  it('brings back the default cards the user hid, in free spaces', () => {
    let layout = withBoard(emptyLayout(), 4, board(emptyLayout()));
    layout = setWidgetVisible(layout, 'insights', false, WIDGET_SPECS, 'business');
    layout = setWidgetVisible(layout, 'evolucao', true, WIDGET_SPECS, 'business');
    const all = showAllWidgets(layout, WIDGET_SPECS, 'business');
    expect(all.visible).toEqual({ evolucao: true });
    expect(board(all).some((i) => i.id === 'insights')).toBe(true);
    expectValid(board(all), 4);
  });

  it('pushes down on every arranged board when a size is chosen in "Personalizar"', () => {
    let layout = withBoard(emptyLayout(), 4, board(emptyLayout()));
    layout = withBoard(layout, 2, board(emptyLayout(), 2));
    const next = applySize(layout, 'inadimplencia', { c: 4, r: 5 }, WIDGET_SPECS, 'business');
    expect(next.sizes.inadimplencia).toEqual({ c: 4, r: 5 });
    for (const cols of [4, 2] as const) {
      const items = board(next, cols);
      expect(cellOf(items, 'inadimplencia')).toEqual({ x: 0, y: 0 });
      expectValid(items, cols);
    }
  });
});

describe('sanitize', () => {
  it('rejects anything that is not a layout', () => {
    for (const raw of [null, 'x', 42, [], { v: 3 }, { sizes: {} }]) expect(sanitizeLayout(raw, WIDGET_SPECS, 'business')).toEqual(emptyLayout());
  });

  it('keeps only known widgets and allowed preference values', () => {
    const out = sanitizeLayout(
      {
        v: 2,
        sizes: { saude: { c: 2, r: 4 }, bogus: { c: 1, r: 1 }, metas: 'big' },
        cells: { 4: { inadimplencia: { x: 0, y: 0 }, bogus: { x: 2, y: 0 } }, 3: { insights: { x: 0, y: 0 } } },
        visible: { evolucao: true, saude: 'yes', bogus: false },
        prefs: { fluxoModo: 'S', projecaoDias: 45, proximosFiltro: 'receber', extra: 1 },
      },
      WIDGET_SPECS,
      'business',
    );
    expect(out.sizes).toEqual({ saude: { c: 2, r: 4 } });
    expect(out.cells).toEqual({ 4: { inadimplencia: { x: 0, y: 0 } } });
    expect(out.visible).toEqual({ evolucao: true });
    expect(out.prefs).toEqual({ fluxoModo: 'S', proximosFiltro: 'receber' });
  });

  it('clamps cells to the grid, pushes overlaps down and drops hidden cards and bad cells', () => {
    const out = sanitizeLayout(
      {
        v: 2,
        cells: {
          4: {
            inadimplencia: { x: 3, y: -4 },
            'clientes-devedores': { x: 0, y: 1 },
            'saldo-contas': { x: 0, y: 1e9 },
            saude: { x: 0, y: 0 },
            insights: { x: '1', y: 0 },
            'fluxo-caixa': { x: 0.4, y: 2.6 },
          },
          2: 'garbage',
        },
      },
      WIDGET_SPECS,
      'business',
    );
    const cells = out.cells[4]!;
    expect(cells.inadimplencia).toEqual({ x: 2, y: 0 });
    expect(cells['clientes-devedores']).toEqual({ x: 0, y: 1 });
    expect(cells['fluxo-caixa']).toEqual({ x: 0, y: 4 });
    expect(cells['saldo-contas']!.y).toBeLessThanOrEqual(WIDGET_SPECS.length * GRID.maxRow);
    expect(cells.saude).toBeUndefined();
    expect(cells.insights).toBeUndefined();
    expect(out.cells[2]).toBeUndefined();
    expectValid(board(out), 4);
  });

  it('round-trips a saved board unchanged', () => {
    const layout = withBoard(emptyLayout(), 4, moveItem(board(emptyLayout()), 'insights', { x: 0, y: 0 }, 4));
    expect(sanitizeLayout(JSON.parse(JSON.stringify(layout)), WIDGET_SPECS, 'business')).toEqual(layout);
  });
});

describe('migration from layouts v1 (sections)', () => {
  it('stacks the old sections in their saved order and sizes, without collapsing anything', () => {
    const out = sanitizeLayout(
      {
        v: 1,
        sizes: { 'clientes-devedores': { c: 2, r: 4 } },
        order: { 'receber-pagar': ['proximos-vencimentos', 'clientes-devedores', 'bogus'], invented: ['saude'] },
        visible: { 'saldo-contas': false },
        collapsed: ['receber-pagar', 'analises'],
        prefs: { projecaoDias: 30 },
      },
      WIDGET_SPECS,
      'business',
    );
    expect(out.v).toBe(2);
    expect('collapsed' in out).toBe(false);
    expect('order' in out).toBe(false);
    expect(out.prefs).toEqual({ projecaoDias: 30 });
    const items = board(out);
    expectValid(items, 4);
    // Honorários e cobrança: vencimentos (4×3), devedores (2×4) | inadimplência (2×3).
    expect(cellOf(items, 'proximos-vencimentos')).toEqual({ x: 0, y: 0 });
    expect(cellOf(items, 'clientes-devedores')).toEqual({ x: 0, y: 3 });
    expect(cellOf(items, 'inadimplencia')).toEqual({ x: 2, y: 3 });
    // Caixa starts below the old section (7 rows); saldo was hidden.
    expect(cellOf(items, 'fluxo-caixa')).toEqual({ x: 0, y: 7 });
    expect(items.some((i) => i.id === 'saldo-contas')).toBe(false);
    expect(out.cells[4]!['saldo-contas']).toBeUndefined();
  });

  it('keeps the default board when the old layout only hid cards or collapsed sections', () => {
    const out = sanitizeLayout({ v: 1, sizes: {}, order: {}, visible: { insights: false }, collapsed: ['clientes'], prefs: {} }, WIDGET_SPECS, 'business');
    expect(out).toEqual({ ...emptyLayout(), visible: { insights: false } });
  });

  it('leaves out client cards outside business workspaces', () => {
    const out = sanitizeLayout({ v: 1, sizes: { 'fluxo-caixa': { c: 4, r: 4 } }, order: {} }, WIDGET_SPECS, 'personal');
    expect(Object.keys(out.cells[4]!)).not.toContain('carteira-clientes');
    expectValid(resolveBoard(out, WIDGET_SPECS, 'personal', 4), 4);
  });
});

describe('catalog', () => {
  it('keeps defaults and presets inside each widget limits', () => {
    for (const spec of WIDGET_SPECS) {
      for (const size of [spec.defaultSize, ...spec.presets]) {
        expect(clampSize(size, spec), `${spec.id} ${size.c}×${size.r}`).toEqual(size);
      }
      expect(spec.min.r).toBeGreaterThanOrEqual(GRID.minRow);
      expect(spec.max.r).toBeLessThanOrEqual(GRID.maxRow);
    }
  });

  it('has unique ids and a known group for every widget', () => {
    const ids = WIDGET_SPECS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    const groups = WIDGET_GROUPS.map((g) => g.id);
    for (const w of WIDGET_SPECS) expect(groups).toContain(w.group);
  });

  it('merges a saved order with new widgets (layouts v1)', () => {
    const defaults: WidgetId[] = ['fluxo-caixa', 'saude', 'saldo-contas', 'insights'];
    expect(mergeOrder(['saude', 'bogus', 'saude', 7, 'fluxo-caixa'], defaults)).toEqual(['saude', 'fluxo-caixa', 'saldo-contas', 'insights']);
    expect(mergeOrder(undefined, defaults)).toEqual(defaults);
  });
});

describe('fitCount', () => {
  it('keeps every row when they all fit', () => {
    expect(fitCount([20, 20, 20], 60, 20)).toBe(3);
    expect(fitCount([20, 20, 20], 70, 20, 5)).toBe(3);
    expect(fitCount([], 100, 20)).toBe(0);
  });

  it('cuts by the real height of each row and leaves room for the "+ N" line', () => {
    // 100px: 30 + 40 + 30 = 100 would fit, but 4 rows do not → keep 80px for rows.
    expect(fitCount([30, 40, 30, 10], 100, 20)).toBe(2);
    expect(fitCount([10, 10, 50, 10], 70, 20, 0)).toBe(2);
    expect(fitCount([20, 20, 20], 64, 20, 4)).toBe(2);
  });

  it('reserves the line when the server has more rows than the list', () => {
    expect(fitCount([20, 20], 60, 20, 0, true)).toBe(2);
    expect(fitCount([20, 20, 20], 60, 20, 0, true)).toBe(2);
  });

  it('never shows less than one row', () => {
    expect(fitCount([200, 20], 50, 20)).toBe(1);
  });
});
