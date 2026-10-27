import { describe, expect, it } from 'vitest';
import {
  clampSize,
  columnsForWidth,
  commitCols,
  displaySpan,
  emptyLayout,
  fitCount,
  GRID,
  heightForRows,
  hiddenCount,
  isVisible,
  mergeOrder,
  moveBy,
  moveWidget,
  resolveSection,
  sanitizeLayout,
  snapResize,
} from './layout';
import { SECTIONS, SPEC_BY_ID, WIDGET_SPECS } from './specs';
import type { WidgetId, WidgetSize, WidgetSpec } from './types';

const sections = SECTIONS.map((s) => s.id);
const fluxo = SPEC_BY_ID['fluxo-caixa'];

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

describe('order', () => {
  const defaults: WidgetId[] = ['fluxo-caixa', 'saude', 'saldo-contas', 'insights'];

  it('merges the saved order with new widgets', () => {
    expect(mergeOrder(['saude', 'bogus', 'saude', 7, 'fluxo-caixa'], defaults)).toEqual(['saude', 'fluxo-caixa', 'saldo-contas', 'insights']);
    expect(mergeOrder(undefined, defaults)).toEqual(defaults);
  });

  it('drops after the target when coming from above, before it when coming from below', () => {
    expect(moveWidget(defaults, 'fluxo-caixa', 'saldo-contas')).toEqual(['saude', 'saldo-contas', 'fluxo-caixa', 'insights']);
    expect(moveWidget(defaults, 'insights', 'saude')).toEqual(['fluxo-caixa', 'insights', 'saude', 'saldo-contas']);
    expect(moveWidget(defaults, 'saude', 'saude')).toEqual(defaults);
    expect(moveWidget(defaults, 'saude', 'metas')).toEqual(defaults);
  });

  it('moves with the keyboard inside the bounds', () => {
    expect(moveBy(defaults, 'saude', -1)).toEqual(['saude', 'fluxo-caixa', 'saldo-contas', 'insights']);
    expect(moveBy(defaults, 'fluxo-caixa', -1)).toEqual(defaults);
    expect(moveBy(defaults, 'saude', 'last')).toEqual(['fluxo-caixa', 'saldo-contas', 'insights', 'saude']);
    expect(moveBy(defaults, 'insights', 'first')).toEqual(['insights', 'fluxo-caixa', 'saude', 'saldo-contas']);
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
    expect(isVisible(layout, SPEC_BY_ID.competencia, 'business')).toBe(true);
    expect(hiddenCount({ ...layout, visible: { 'saldo-contas': false, evolucao: false } }, WIDGET_SPECS, 'business')).toBe(1);
  });

  it('resolves a section in order with clamped sizes', () => {
    const layout = { ...emptyLayout(), order: { 'visao-geral': ['projecao-caixa' as WidgetId] }, sizes: { 'saldo-contas': { c: 9, r: 9 } } };
    const resolved = resolveSection(layout, 'visao-geral', WIDGET_SPECS, 'business');
    expect(resolved[0]!.spec.id).toBe('projecao-caixa');
    expect(resolved.find((x) => x.spec.id === 'saldo-contas')!.size).toEqual({ c: 2, r: 7 });
  });
});

describe('sanitize', () => {
  it('rejects anything that is not a v1 layout', () => {
    for (const raw of [null, 'x', 42, [], { v: 2 }, { sizes: {} }]) expect(sanitizeLayout(raw, WIDGET_SPECS, sections)).toEqual(emptyLayout());
  });

  it('keeps only known widgets, sections and allowed preference values', () => {
    const out = sanitizeLayout(
      {
        v: 1,
        sizes: { saude: { c: 2, r: 4 }, bogus: { c: 1, r: 1 }, metas: 'big' },
        order: { 'visao-geral': ['insights', 'nope'], invented: ['saude'] },
        visible: { evolucao: true, saude: 'yes', bogus: false },
        collapsed: ['analises', 'analises', 'nope'],
        prefs: { fluxoModo: 'S', projecaoDias: 45, proximosFiltro: 'receber', extra: 1 },
      },
      WIDGET_SPECS,
      sections,
    );
    expect(out.sizes).toEqual({ saude: { c: 2, r: 4 } });
    expect(out.order['visao-geral']![0]).toBe('insights');
    expect(Object.keys(out.order)).toEqual(['visao-geral']);
    expect(out.visible).toEqual({ evolucao: true });
    expect(out.collapsed).toEqual(['analises']);
    expect(out.prefs).toEqual({ fluxoModo: 'S', proximosFiltro: 'receber' });
  });
});

/** CSS grid with `grid-auto-flow: dense`: each item takes the first free slot from the top. */
function pack(items: WidgetSize[], cols: number): { rows: number; holes: number } {
  const grid: boolean[][] = [];
  const free = (row: number, col: number, size: WidgetSize) => {
    for (let r = row; r < row + size.r; r++) for (let c = col; c < col + size.c; c++) if (grid[r]?.[c]) return false;
    return true;
  };
  for (const item of items) {
    const size = { c: Math.min(item.c, cols), r: item.r };
    let placed = false;
    for (let row = 0; !placed; row++) {
      for (let col = 0; col + size.c <= cols && !placed; col++) {
        if (!free(row, col, size)) continue;
        for (let r = row; r < row + size.r; r++) for (let c = col; c < col + size.c; c++) (grid[r] ??= [])[c] = true;
        placed = true;
      }
    }
  }
  const rows = grid.length;
  let used = 0;
  for (const row of grid) used += row.filter(Boolean).length;
  return { rows, holes: rows * cols - used };
}

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

  it('packs every section with no holes at 4 columns', () => {
    for (const section of sections) {
      const items = resolveSection(emptyLayout(), section, WIDGET_SPECS, 'business').map((x) => x.size);
      expect(pack(items, 4).holes, section).toBe(0);
    }
  });

  it('has unique ids and a known section for every widget', () => {
    const ids = WIDGET_SPECS.map((w: WidgetSpec) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const w of WIDGET_SPECS) expect(sections).toContain(w.section);
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
