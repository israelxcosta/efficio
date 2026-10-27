// Pure rules of the dashboard grid (no React): sizes, snapping, order, visibility and the
// sanitizing of whatever comes back from localStorage.

import type { WorkspaceKind } from '@effinance/shared';
import type { DashboardLayout, DashboardPrefs, SectionId, WidgetId, WidgetSize, WidgetSpec } from './types';

/** Global limits: up to 4 columns, 2–7 rows of 86px (7 rows = 674px). */
export const GRID = { maxCols: 4, minRow: 2, maxRow: 7, gap: 16 } as const;

export const DEFAULT_PREFS: DashboardPrefs = {
  fluxoModo: 'M',
  projecaoDias: 90,
  proximosFiltro: 'todos',
  evolucaoTipo: 'expense',
  composicaoTipo: 'expense',
};

const PREF_VALUES: { [K in keyof DashboardPrefs]: readonly DashboardPrefs[K][] } = {
  fluxoModo: ['D', 'S', 'M', 'A'],
  projecaoDias: [30, 60, 90],
  proximosFiltro: ['todos', 'pagar', 'receber'],
  evolucaoTipo: ['expense', 'income'],
  composicaoTipo: ['expense', 'income'],
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Column count from the grid's own width (the sidebar rail is not part of it). */
export function columnsForWidth(width: number): 1 | 2 | 4 {
  if (width >= 1000) return 4;
  if (width >= 560) return 2;
  return 1;
}

export function rowPxFor(cols: number): number {
  return cols === 4 ? 96 : 88;
}

/** Pixel height of a widget spanning `rows` rows. */
export function heightForRows(rows: number, cols: number): number {
  return rows * rowPxFor(cols) + (rows - 1) * GRID.gap;
}

/** Rounds and clamps to the spec's limits (inside the global ones); garbage → the default size. */
export function clampSize(size: Partial<WidgetSize> | undefined, spec: WidgetSpec): WidgetSize {
  const c = Number(size?.c);
  const r = Number(size?.r);
  if (!Number.isFinite(c) || !Number.isFinite(r)) return { ...spec.defaultSize };
  return {
    c: clamp(Math.round(c), Math.max(1, spec.min.c), Math.min(GRID.maxCols, spec.max.c)),
    r: clamp(Math.round(r), Math.max(GRID.minRow, spec.min.r), Math.min(GRID.maxRow, spec.max.r)),
  };
}

/** Columns a widget spans on a grid with `cols` columns. */
export function displaySpan(c: number, cols: number): number {
  return Math.min(c, cols);
}

/**
 * Width to store after a resize on a narrow grid: when the drag did not change the displayed
 * width, keep the stored (desktop) width instead of overwriting it with the narrow one.
 */
export function commitCols(stored: number, displayed: number, next: number): number {
  return next === displayed ? stored : next;
}

export interface GridMetrics {
  colW: number;
  rowPx: number;
  gap: number;
  cols: number;
}

/** Corner-handle resize: snaps the pointer offset to whole cells (Effy's rule). */
export function snapResize(start: WidgetSize, dx: number, dy: number, m: GridMetrics, spec: WidgetSpec): WidgetSize {
  const limits = clampSize(spec.max, spec);
  return {
    c: clamp(start.c + Math.round(dx / (m.colW + m.gap)), spec.min.c, Math.min(limits.c, m.cols)),
    r: clamp(start.r + Math.round(dy / (m.rowPx + m.gap)), Math.max(GRID.minRow, spec.min.r), limits.r),
  };
}

/** Saved order first (unknown ids and duplicates dropped), then new widgets in default order. */
export function mergeOrder(saved: readonly unknown[] | undefined, defaults: readonly WidgetId[]): WidgetId[] {
  const known = new Set<WidgetId>(defaults);
  const out: WidgetId[] = [];
  for (const id of saved ?? []) {
    if (typeof id === 'string' && known.has(id as WidgetId) && !out.includes(id as WidgetId)) out.push(id as WidgetId);
  }
  for (const id of defaults) if (!out.includes(id)) out.push(id);
  return out;
}

/** Drop on another card: before it when coming from below, after it when coming from above. */
export function moveWidget(order: readonly WidgetId[], id: WidgetId, targetId: WidgetId): WidgetId[] {
  const from = order.indexOf(id);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return [...order];
  const next = order.filter((x) => x !== id);
  const target = next.indexOf(targetId);
  next.splice(from < to ? target + 1 : target, 0, id);
  return next;
}

/** Keyboard moves among the given (visible) ids. */
export function moveBy(order: readonly WidgetId[], id: WidgetId, delta: number | 'first' | 'last'): WidgetId[] {
  const from = order.indexOf(id);
  if (from < 0) return [...order];
  const to = delta === 'first' ? 0 : delta === 'last' ? order.length - 1 : clamp(from + delta, 0, order.length - 1);
  if (to === from) return [...order];
  const next = order.filter((x) => x !== id);
  next.splice(to, 0, id);
  return next;
}

/**
 * Shown when the user made no choice: client widgets start hidden outside business workspaces
 * (they can still be turned on, since clients exist in every workspace).
 */
export function defaultVisible(spec: WidgetSpec, kind: WorkspaceKind | undefined): boolean {
  return !spec.defaultHidden && (spec.defaultFor !== 'business' || kind === 'business');
}

export function isVisible(layout: DashboardLayout, spec: WidgetSpec, kind: WorkspaceKind | undefined): boolean {
  return layout.visible[spec.id] ?? defaultVisible(spec, kind);
}

/** Visible widgets of a section in their saved order, with clamped sizes. */
export function resolveSection(
  layout: DashboardLayout,
  section: SectionId,
  specs: readonly WidgetSpec[],
  kind: WorkspaceKind | undefined,
): { spec: WidgetSpec; size: WidgetSize }[] {
  const inSection = specs.filter((s) => s.section === section);
  const byId = new Map(inSection.map((s) => [s.id, s]));
  return mergeOrder(layout.order[section], inSection.map((s) => s.id))
    .map((id) => byId.get(id)!)
    .filter((spec) => isVisible(layout, spec, kind))
    .map((spec) => ({ spec, size: clampSize(layout.sizes[spec.id] ?? spec.defaultSize, spec) }));
}

export function emptyLayout(): DashboardLayout {
  return { v: 1, sizes: {}, order: {}, visible: {}, collapsed: [], prefs: {} };
}

/** Anything read from storage goes through here: wrong shapes are dropped, never trusted. */
export function sanitizeLayout(raw: unknown, specs: readonly WidgetSpec[], sections: readonly SectionId[]): DashboardLayout {
  if (!raw || typeof raw !== 'object' || (raw as { v?: unknown }).v !== 1) return emptyLayout();
  const src = raw as Record<string, unknown>;
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const specById = new Map(specs.map((s) => [s.id, s]));
  const out = emptyLayout();

  for (const [id, size] of Object.entries(obj(src.sizes))) {
    const spec = specById.get(id as WidgetId);
    if (spec && size && typeof size === 'object') out.sizes[spec.id] = clampSize(size as WidgetSize, spec);
  }
  for (const [section, ids] of Object.entries(obj(src.order))) {
    if (!sections.includes(section as SectionId) || !Array.isArray(ids)) continue;
    const defaults = specs.filter((s) => s.section === section).map((s) => s.id);
    out.order[section as SectionId] = mergeOrder(ids, defaults);
  }
  for (const [id, value] of Object.entries(obj(src.visible))) {
    if (specById.has(id as WidgetId) && typeof value === 'boolean') out.visible[id as WidgetId] = value;
  }
  if (Array.isArray(src.collapsed)) {
    out.collapsed = [...new Set(src.collapsed.filter((x): x is SectionId => sections.includes(x as SectionId)))];
  }
  const prefs = obj(src.prefs);
  for (const key of Object.keys(PREF_VALUES) as (keyof DashboardPrefs)[]) {
    const allowed = PREF_VALUES[key] as readonly unknown[];
    if (allowed.includes(prefs[key])) (out.prefs as Record<string, unknown>)[key] = prefs[key];
  }
  return out;
}

/** How many default-visible widgets the user hid (badge on "Personalizar"). */
export function hiddenCount(layout: DashboardLayout, specs: readonly WidgetSpec[], kind: WorkspaceKind | undefined): number {
  return specs.filter((s) => defaultVisible(s, kind) && layout.visible[s.id] === false).length;
}

/** Leeway for sub-pixel rounding when adding row heights. */
const FIT_EPSILON = 0.5;

/**
 * How many rows of a list fit in `available` px. When not all of them fit (or `alwaysMore`, when
 * the server has more rows than the list), room is kept for the "+ N" line. Never less than one.
 */
export function fitCount(heights: readonly number[], available: number, morePx: number, gap = 0, alwaysMore = false): number {
  if (heights.length === 0) return 0;
  const total = heights.reduce((sum, h) => sum + h, 0) + gap * (heights.length - 1);
  if (!alwaysMore && total <= available + FIT_EPSILON) return heights.length;
  const space = available - morePx;
  let used = 0;
  let count = 0;
  for (const h of heights) {
    const next = used + (count ? gap : 0) + h;
    if (next > space + FIT_EPSILON) break;
    used = next;
    count++;
  }
  return Math.max(1, count);
}
