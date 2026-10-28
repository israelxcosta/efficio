// Pure rules of the dashboard board (no React): sizes, snapping, free placement (cards pushed down
// on collision, nothing rises on its own), "Organizar", visibility and the sanitizing of whatever
// comes back from localStorage (including layouts v1, which had sections).

import type { WorkspaceKind } from '@effinance/shared';
import type {
  BoardCols,
  BoardItem,
  DashboardLayout,
  DashboardPrefs,
  GridCell,
  WidgetGroupId,
  WidgetId,
  WidgetSize,
  WidgetSpec,
} from './types';

/** Global limits: up to 4 columns, 2–7 rows of 96px (7 rows = 768px). */
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

/** Boards by column count, widest first: a board never arranged follows the one before it. */
export const BOARD_COLS: readonly BoardCols[] = [4, 2, 1];

/** Column count from the grid's own width (the sidebar rail is not part of it). */
export function columnsForWidth(width: number): BoardCols {
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

// ── Board geometry ───────────────────────────────────────────────────────────────────────────

type Box = GridCell & WidgetSize;

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.c && b.x < a.x + a.c && a.y < b.y + b.r && b.y < a.y + a.r;
}

/** Top to bottom, then left to right (DOM, focus and screen-reader order). */
export function byReading(a: GridCell, b: GridCell): number {
  return a.y - b.y || a.x - b.x;
}

/** First row below every card. */
export function boardBottom(items: readonly Box[]): number {
  return items.reduce((max, i) => Math.max(max, i.y + i.r), 0);
}

/** First cell from the top (then from the left) where a card of `size` fits without overlapping. */
export function firstFit(items: readonly Box[], size: WidgetSize, cols: number): GridCell {
  const c = displaySpan(size.c, cols);
  for (let y = 0; ; y++) {
    for (let x = 0; x + c <= cols; x++) {
      if (!items.some((o) => overlaps(o, { x, y, c, r: size.r }))) return { x, y };
    }
  }
}

/**
 * Removes overlaps without moving anything up: the `first` cards keep their cells (in that order),
 * then the others, top to bottom, slide down below whatever they hit. Cells are clamped to the grid.
 */
export function settle(items: readonly BoardItem[], cols: number, first: readonly WidgetId[] = []): BoardItem[] {
  const rank = (i: BoardItem) => (first.includes(i.id) ? first.indexOf(i.id) : first.length);
  const placed: BoardItem[] = [];
  for (const item of [...items].sort((a, b) => rank(a) - rank(b) || byReading(a, b))) {
    const c = clamp(item.c, 1, cols);
    const next = { ...item, c, x: clamp(item.x, 0, cols - c), y: Math.max(0, item.y) };
    for (let hit = placed.find((p) => overlaps(p, next)); hit; hit = placed.find((p) => overlaps(p, next))) next.y = hit.y + hit.r;
    placed.push(next);
  }
  return placed.sort(byReading);
}

/** On a board without overlaps, each card, top to bottom, rises in its columns as far as it can. */
export function compact(items: readonly BoardItem[]): BoardItem[] {
  const placed: BoardItem[] = [];
  for (const item of [...items].sort(byReading)) {
    const next = { ...item };
    while (next.y > 0 && !placed.some((p) => overlaps(p, { ...next, y: next.y - 1 }))) next.y--;
    placed.push(next);
  }
  return placed.sort(byReading);
}

/**
 * "Organizar": cards rise in their columns; then, in reading order, a card that a wider card
 * keeps from rising moves to the first free space higher up where it fits (never down, never just
 * sideways), and the board rises again — until nothing can go up.
 */
export function arrange(items: readonly BoardItem[], cols: number): BoardItem[] {
  let board = compact(items);
  for (let moved = true; moved; ) {
    moved = false;
    for (const item of board) {
      const others = board.filter((o) => o.id !== item.id);
      const cell = firstFit(others, item, cols);
      if (cell.y >= item.y) continue;
      board = compact([...others, { ...item, ...cell }]);
      moved = true;
      break;
    }
  }
  return board;
}

/** "Organizar" would change something (there are empty spaces a card can go up into). */
export function canArrange(items: readonly BoardItem[], cols: number): boolean {
  return !sameBoard(arrange(items, cols), items);
}

/** Same cells and spans for the same cards. */
export function sameBoard(a: readonly BoardItem[], b: readonly BoardItem[]): boolean {
  const byId = new Map(b.map((i) => [i.id, i]));
  return a.length === b.length && a.every((i) => {
    const o = byId.get(i.id);
    return o !== undefined && o.x === i.x && o.y === i.y && o.c === i.c && o.r === i.r;
  });
}

/**
 * Drop on a cell: the card keeps it and the cards it lands on are pushed down (nothing rises, so
 * the space it left stays empty). On one column the board is a list: the card passes every card
 * whose middle its leading edge (top going up, bottom going down) went past.
 */
export function moveItem(items: readonly BoardItem[], id: WidgetId, cell: GridCell, cols: number): BoardItem[] {
  const moving = items.find((i) => i.id === id);
  if (!moving) return [...items];
  if (cols === 1) {
    const others = items.filter((i) => i.id !== id).sort(byReading);
    const before =
      cell.y < moving.y
        ? others.filter((o) => o.y + o.r / 2 <= cell.y).length
        : others.filter((o) => o.y + o.r / 2 < cell.y + moving.r).length;
    others.splice(before, 0, moving);
    let y = 0;
    return others.map((i) => {
      const next = { ...i, x: 0, c: 1, y };
      y += i.r;
      return next;
    });
  }
  return settle(items.map((i) => (i.id === id ? { ...i, x: cell.x, y: cell.y } : i)), cols, [id]);
}

/** Corner handle: the card keeps its cell and pushes down the cards it now covers. */
export function resizeItem(items: readonly BoardItem[], id: WidgetId, size: WidgetSize, cols: number): BoardItem[] {
  const next = settle(items.map((i) => (i.id === id ? { ...i, c: displaySpan(size.c, cols), r: size.r } : i)), cols, [id]);
  return cols === 1 ? compact(next) : next;
}

export type NudgeDirection = 'left' | 'right' | 'up' | 'down';

/**
 * Keyboard move by one cell. Cards in the way trade places with the moving one instead of being
 * chased down (so the arrows can pass them); a free move down stops at the bottom of the others.
 */
export function nudgeItem(items: readonly BoardItem[], id: WidgetId, dir: NudgeDirection, cols: number): BoardItem[] {
  const a = items.find((i) => i.id === id);
  if (!a) return [...items];
  const others = items.filter((i) => i.id !== id);
  const target = { ...a, x: a.x + (dir === 'left' ? -1 : dir === 'right' ? 1 : 0), y: a.y + (dir === 'up' ? -1 : dir === 'down' ? 1 : 0) };
  if (target.x < 0 || target.x + a.c > cols || target.y < 0) return [...items];
  const blockers = others.filter((o) => overlaps(o, target)).sort(byReading);
  if (blockers.length === 0) {
    if (dir === 'down' && target.y > boardBottom(others)) return [...items];
    return [...others, target].sort(byReading);
  }
  // The blockers shift into the space the card leaves; the card lands right past them.
  const moved =
    dir === 'up'
      ? { ...a, y: Math.min(...blockers.map((b) => b.y)) }
      : dir === 'down'
        ? { ...a, y: Math.max(...blockers.map((b) => b.y + b.r)) - a.r }
        : dir === 'left'
          ? { ...a, x: Math.min(...blockers.map((b) => b.x)) }
          : { ...a, x: Math.max(...blockers.map((b) => b.x + b.c)) - a.c };
  const shift = (b: BoardItem): BoardItem =>
    dir === 'up' ? { ...b, y: b.y + a.r } : dir === 'down' ? { ...b, y: b.y - a.r } : dir === 'left' ? { ...b, x: b.x + a.c } : { ...b, x: b.x - a.c };
  const ids = new Set(blockers.map((b) => b.id));
  const next = settle([...others.map((o) => (ids.has(o.id) ? shift(o) : o)), moved], cols, [id, ...blockers.map((b) => b.id)]);
  return cols === 1 ? compact(next) : next;
}

// ── Layout → boards ──────────────────────────────────────────────────────────────────────────

function sizeOf(layout: DashboardLayout, spec: WidgetSpec): WidgetSize {
  return clampSize(layout.sizes[spec.id] ?? spec.defaultSize, spec);
}

/** The user placed cards on this board (otherwise it follows the default or the wider board). */
export function isArranged(layout: DashboardLayout, cols: BoardCols): boolean {
  return Object.keys(layout.cells[cols] ?? {}).length > 0;
}

/**
 * Visible cards of a board, in reading order. Saved cells are settled (overlaps pushed down, the
 * `first` cards keep theirs); cards without a cell take the first free space, in catalog order —
 * or, on a board never arranged at this width, in the reading order of the next wider board.
 * One column is always a list with no gaps.
 */
export function resolveBoard(
  layout: DashboardLayout,
  specs: readonly WidgetSpec[],
  kind: WorkspaceKind | undefined,
  cols: BoardCols,
  first: readonly WidgetId[] = [],
): BoardItem[] {
  const shown = specs.filter((s) => isVisible(layout, s, kind));
  const saved = layout.cells[cols] ?? {};
  const item = (spec: WidgetSpec, cell: GridCell): BoardItem => {
    const size = sizeOf(layout, spec);
    return { id: spec.id, x: cell.x, y: cell.y, c: displaySpan(size.c, cols), r: size.r };
  };
  const withCell = shown.filter((s) => saved[s.id]);
  const items = settle(withCell.map((s) => item(s, saved[s.id]!)), cols, first);
  const order =
    withCell.length > 0 || cols === 4
      ? shown
      : resolveBoard(layout, specs, kind, cols === 2 ? 4 : 2).map((i) => shown.find((s) => s.id === i.id)!);
  for (const spec of order) {
    if (items.some((i) => i.id === spec.id)) continue;
    items.push(item(spec, firstFit(items, sizeOf(layout, spec), cols)));
  }
  return cols === 1 ? compact(items) : items.sort(byReading);
}

/** Stores the cells of a board (only visible cards have cells). */
export function withBoard(layout: DashboardLayout, cols: BoardCols, items: readonly BoardItem[]): DashboardLayout {
  return { ...layout, cells: { ...layout.cells, [cols]: Object.fromEntries(items.map((i) => [i.id, { x: i.x, y: i.y }])) } };
}

/** New size (corner handle or "Personalizar"): on every arranged board the card pushes what it now covers. */
export function applySize(
  layout: DashboardLayout,
  id: WidgetId,
  size: WidgetSize,
  specs: readonly WidgetSpec[],
  kind: WorkspaceKind | undefined,
): DashboardLayout {
  let next: DashboardLayout = { ...layout, sizes: { ...layout.sizes, [id]: size } };
  for (const cols of BOARD_COLS) if (isArranged(next, cols)) next = withBoard(next, cols, resolveBoard(next, specs, kind, cols, [id]));
  return next;
}

function withoutCells(cells: DashboardLayout['cells'], ids: readonly WidgetId[]): DashboardLayout['cells'] {
  const out: DashboardLayout['cells'] = {};
  for (const cols of BOARD_COLS) {
    const board = cells[cols];
    if (board) out[cols] = Object.fromEntries(Object.entries(board).filter(([id]) => !ids.includes(id as WidgetId)));
  }
  return out;
}

/**
 * Cards coming back: the ones on screen stay where they are (the default board is kept as it is
 * now) and each new card takes the first free space that fits, in catalog order.
 */
function reveal(
  layout: DashboardLayout,
  ids: readonly WidgetId[],
  visible: DashboardLayout['visible'],
  specs: readonly WidgetSpec[],
  kind: WorkspaceKind | undefined,
): DashboardLayout {
  let next: DashboardLayout = { ...layout, cells: withoutCells(layout.cells, ids) };
  if (!isArranged(next, 4)) next = withBoard(next, 4, resolveBoard(next, specs, kind, 4));
  next = { ...next, visible };
  for (const cols of BOARD_COLS) if (isArranged(next, cols)) next = withBoard(next, cols, resolveBoard(next, specs, kind, cols));
  return next;
}

/** Shows a card in the first free space, or hides it (its cells go away; the space stays empty). */
export function setWidgetVisible(
  layout: DashboardLayout,
  id: WidgetId,
  visible: boolean,
  specs: readonly WidgetSpec[],
  kind: WorkspaceKind | undefined,
): DashboardLayout {
  const spec = specs.find((s) => s.id === id);
  if (!spec || isVisible(layout, spec, kind) === visible) return { ...layout, visible: { ...layout.visible, [id]: visible } };
  if (!visible) return { ...layout, visible: { ...layout.visible, [id]: false }, cells: withoutCells(layout.cells, [id]) };
  return reveal(layout, [id], { ...layout.visible, [id]: true }, specs, kind);
}

/** "Reexibir todos": default cards the user hid come back; default-hidden ones turned on stay on. */
export function showAllWidgets(layout: DashboardLayout, specs: readonly WidgetSpec[], kind: WorkspaceKind | undefined): DashboardLayout {
  const visible = Object.fromEntries(Object.entries(layout.visible).filter(([, v]) => v)) as DashboardLayout['visible'];
  const back = specs.filter((s) => !isVisible(layout, s, kind) && isVisible({ ...layout, visible }, s, kind)).map((s) => s.id);
  if (back.length === 0) return { ...layout, visible };
  return reveal(layout, back, visible, specs, kind);
}

/** "Organizar": closes the empty spaces of one board by moving cards up. */
export function arrangeBoard(layout: DashboardLayout, cols: BoardCols, specs: readonly WidgetSpec[], kind: WorkspaceKind | undefined): DashboardLayout {
  const items = resolveBoard(layout, specs, kind, cols);
  const next = arrange(items, cols);
  return sameBoard(next, items) ? layout : withBoard(layout, cols, next);
}

// ── Storage ──────────────────────────────────────────────────────────────────────────────────

export function emptyLayout(): DashboardLayout {
  return { v: 2, sizes: {}, cells: {}, visible: {}, prefs: {} };
}

/** Sections of layouts v1, top to bottom (their ids live on as widget groups). */
const V1_SECTIONS: readonly WidgetGroupId[] = ['receber-pagar', 'visao-geral', 'clientes', 'analises', 'planejamento'];

const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

/**
 * Anything read from storage goes through here: wrong shapes are dropped, never trusted. Cells
 * outside the grid are clamped, overlaps are pushed down and hidden cards lose theirs. Layouts v1
 * (one grid per section) become cells on the 4-column board.
 */
export function sanitizeLayout(raw: unknown, specs: readonly WidgetSpec[], kind: WorkspaceKind | undefined): DashboardLayout {
  if (!raw || typeof raw !== 'object') return emptyLayout();
  const src = raw as Record<string, unknown>;
  if (src.v !== 1 && src.v !== 2) return emptyLayout();
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const specById = new Map(specs.map((s) => [s.id, s]));
  let out = emptyLayout();

  for (const [id, size] of Object.entries(obj(src.sizes))) {
    const spec = specById.get(id as WidgetId);
    if (spec && size && typeof size === 'object') out.sizes[spec.id] = clampSize(size as WidgetSize, spec);
  }
  for (const [id, value] of Object.entries(obj(src.visible))) {
    if (specById.has(id as WidgetId) && typeof value === 'boolean') out.visible[id as WidgetId] = value;
  }
  const prefs = obj(src.prefs);
  for (const key of Object.keys(PREF_VALUES) as (keyof DashboardPrefs)[]) {
    const allowed = PREF_VALUES[key] as readonly unknown[];
    if (allowed.includes(prefs[key])) (out.prefs as Record<string, unknown>)[key] = prefs[key];
  }
  if (src.v === 1) return migrateV1(out, obj(src.order), specs, kind);

  // No legit layout needs a card to start lower than every card stacked at its tallest.
  const maxRow = specs.length * GRID.maxRow;
  const cells = obj(src.cells);
  for (const cols of BOARD_COLS) {
    const board = obj(cells[cols]);
    const items: BoardItem[] = [];
    for (const spec of specs) {
      const cell = obj(board[spec.id]);
      const x = int(cell.x);
      const y = int(cell.y);
      if (x === null || y === null || !isVisible(out, spec, kind)) continue;
      const size = sizeOf(out, spec);
      items.push({ id: spec.id, x, y: clamp(y, 0, maxRow), c: displaySpan(size.c, cols), r: size.r });
    }
    if (items.length > 0) out = withBoard(out, cols, cols === 1 ? compact(settle(items, 1)) : settle(items, cols));
  }
  return out;
}

/**
 * Layout v1 had one dense grid per section, sections stacked: the same packing, section after
 * section, gives each card its cell on the 4-column board (collapsed sections come back open).
 * Untouched order and sizes keep the default board instead.
 */
function migrateV1(out: DashboardLayout, order: Record<string, unknown>, specs: readonly WidgetSpec[], kind: WorkspaceKind | undefined): DashboardLayout {
  const savedOrder = (section: WidgetGroupId) => (Array.isArray(order[section]) ? (order[section] as unknown[]) : undefined);
  if (!V1_SECTIONS.some(savedOrder) && Object.keys(out.sizes).length === 0) return out;
  const items: BoardItem[] = [];
  let top = 0;
  for (const section of V1_SECTIONS) {
    const inSection = specs.filter((s) => s.group === section);
    const packed: BoardItem[] = [];
    for (const id of mergeOrder(savedOrder(section), inSection.map((s) => s.id))) {
      const spec = inSection.find((s) => s.id === id)!;
      if (!isVisible(out, spec, kind)) continue;
      const size = sizeOf(out, spec);
      packed.push({ id, ...firstFit(packed, size, 4), ...size });
    }
    items.push(...packed.map((i) => ({ ...i, y: i.y + top })));
    top += boardBottom(packed);
  }
  return items.length > 0 ? withBoard(out, 4, items) : out;
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
