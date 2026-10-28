import {
  Component as ReactComponent,
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { LayoutGrid, MoveDiagonal2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DashboardResponse, WorkspaceKind } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import {
  boardBottom,
  clampSize,
  columnsForWidth,
  commitCols,
  GRID,
  heightForRows,
  moveItem,
  nudgeItem,
  resizeItem,
  resolveBoard,
  rowPxFor,
  sameBoard,
  snapResize,
  type NudgeDirection,
} from './layout';
import { useDashboardLayout } from './layout-store';
import { SPEC_BY_ID, WIDGET_SPECS } from './specs';
import type { BoardCols, BoardItem, GridCell, WidgetAlert, WidgetId, WidgetProps, WidgetSize, WidgetSpec } from './types';
import { WidgetChromeContext, type WidgetChrome } from './widget-card';

export type WidgetComponents = Record<WidgetId, ComponentType<WidgetProps>>;

/** Id of the "Personalizar" button (focus lands there when the last card is hidden). */
export const CUSTOMIZE_BUTTON_ID = 'dashboard-personalizar';

interface BoardProps {
  /** Width of the board (the page's content box); 0 until measured. */
  width: number;
  month: string;
  d: DashboardResponse | undefined;
  loading: boolean;
  kind: WorkspaceKind | undefined;
  components: WidgetComponents;
  alerts: Partial<Record<WidgetId, WidgetAlert>>;
  onCustomize: () => void;
}

/** Pixel geometry of a board. */
interface Geometry {
  cols: BoardCols;
  colW: number;
  rowPx: number;
  gap: number;
}

function geometryFor(width: number): Geometry {
  const cols = columnsForWidth(width);
  return { cols, colW: (width - GRID.gap * (cols - 1)) / cols, rowPx: rowPxFor(cols), gap: GRID.gap };
}

/** Pixel box of a card; edges rounded so text never sits on half pixels. */
function boxOf(item: BoardItem, g: Geometry) {
  const left = Math.round(item.x * (g.colW + g.gap));
  const right = Math.round((item.x + item.c) * (g.colW + g.gap) - g.gap);
  return { left, top: item.y * (g.rowPx + g.gap), width: right - left, height: heightForRows(item.r, g.cols) };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Room kept above fixed bottom bars (mobile nav, quick bar) for the drag auto-scroll. */
function bottomInset(): number {
  let inset = 0;
  for (const el of document.querySelectorAll<HTMLElement>('[data-bottom-bar]')) {
    const rect = el.getBoundingClientRect();
    if (rect.height > 0) inset = Math.max(inset, window.innerHeight - rect.top);
  }
  return inset;
}

/** Swallows the click the browser fires right after a drag ends on a link or button. */
function suppressNextClick() {
  const stop = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
}

/** Interactive elements inside a header never start a drag. */
const NO_DRAG = 'button, a, input, select, textarea, label, [role="radio"], [role="tab"], [role="combobox"], [role="switch"], .recharts-wrapper';

const KEY_DIRECTIONS: Partial<Record<string, NudgeDirection>> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/** Board being dragged or resized: what it would look like if the pointer were released now. */
interface Preview {
  id: WidgetId;
  mode: 'move' | 'resize';
  items: BoardItem[];
}

/**
 * The dashboard board: one free grid where each card sits on any cell. Dropping a card on others
 * pushes them down; nothing rises on its own ("Organizar", in the page header, closes the gaps).
 */
export function DashboardBoard({ width, month, d, loading, kind, components, alerts, onCustomize }: BoardProps) {
  const api = useDashboardLayout();
  const g = useMemo(() => geometryFor(width), [width]);
  const { cols } = g;
  const base = useMemo(() => resolveBoard(api.layout, WIDGET_SPECS, kind, cols), [api.layout, kind, cols]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const gripRefs = useRef(new Map<WidgetId, HTMLButtonElement>());
  const shown = useMemo(() => new Map((preview?.items ?? base).map((i) => [i.id, i])), [preview, base]);
  const rows = Math.max(boardBottom(base), boardBottom(preview?.items ?? []));
  const widgetProps = useMemo(
    () => ({ month, d, loading, prefs: api.prefs, setPref: api.setPref, business: kind === 'business' }),
    [month, d, loading, api.prefs, api.setPref, kind],
  );

  const describe = useCallback(
    (id: WidgetId, items: BoardItem[]) => {
      const item = items.find((i) => i.id === id);
      if (!item) return '';
      const where = cols === 1 ? `posição ${items.indexOf(item) + 1} de ${items.length}` : `coluna ${item.x + 1}, linha ${item.y + 1}`;
      return `${SPEC_BY_ID[id].title}: ${where}`;
    },
    [cols],
  );

  /** Pointer drag (mouse/pen from the header, any pointer from the grip). */
  const beginDrag = useCallback(
    (e: ReactPointerEvent, id: WidgetId, fromGrip: boolean) => {
      if (e.button !== 0) return;
      if (!fromGrip && (e.pointerType === 'touch' || (e.target as HTMLElement).closest(NO_DRAG))) return;
      const card = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-widget-id]');
      const start = base.find((i) => i.id === id);
      if (!card || !start) return;
      // A card may go below the others, not further (the board does not grow empty rows at the end).
      const maxY = Math.max(start.y, boardBottom(base.filter((i) => i.id !== id)));
      const step = { x: g.colW + g.gap, y: g.rowPx + g.gap };
      const startX = e.clientX;
      const startY = e.clientY;
      const startScroll = window.scrollY;
      let lastX = startX;
      let lastY = startY;
      let started = false;
      let cell: GridCell = { x: start.x, y: start.y };
      let frame = 0;
      let scrollZone = { top: 80, bottom: window.innerHeight - 80 };

      // The card follows the pointer (scroll included); the board shows where it would land.
      const place = () => {
        const dx = lastX - startX;
        const dy = lastY - startY + window.scrollY - startScroll;
        card.style.translate = `${dx}px ${dy}px`;
        const next = { x: clamp(Math.round(start.x + dx / step.x), 0, cols - start.c), y: clamp(Math.round(start.y + dy / step.y), 0, maxY) };
        if (next.x === cell.x && next.y === cell.y) return;
        cell = next;
        setPreview({ id, mode: 'move', items: moveItem(base, id, cell, cols) });
      };
      const scroll = () => {
        if (lastY < scrollZone.top) window.scrollBy(0, -16);
        else if (lastY > scrollZone.bottom) window.scrollBy(0, 16);
        place();
        frame = requestAnimationFrame(scroll);
      };
      const onMove = (ev: PointerEvent) => {
        if (!started) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
          started = true;
          document.body.style.userSelect = 'none';
          scrollZone = { top: 80, bottom: window.innerHeight - 80 - bottomInset() };
          setPreview({ id, mode: 'move', items: base });
          frame = requestAnimationFrame(scroll);
        }
        ev.preventDefault();
        lastX = ev.clientX;
        lastY = ev.clientY;
        place();
      };
      const end = (commit: boolean) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey);
        cancelAnimationFrame(frame);
        document.body.style.userSelect = '';
        // With the transition back on, the card glides from where it was dropped to its cell.
        card.style.translate = '';
        if (!started) return;
        suppressNextClick();
        const items = moveItem(base, id, cell, cols);
        if (commit && !sameBoard(items, base)) {
          api.saveBoard(cols, items);
          setAnnouncement(describe(id, items));
        }
        setPreview(null);
      };
      const onUp = () => end(true);
      const onCancel = () => end(false);
      const onKey = (ev: globalThis.KeyboardEvent) => {
        if (ev.key === 'Escape') end(false);
      };
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey);
    },
    [api, base, cols, g, describe],
  );

  /** Arrows move one cell (trading places with a card in the way); Home/End go to the top/bottom. */
  const moveWithKeyboard = (e: KeyboardEvent, spec: WidgetSpec) => {
    const item = base.find((i) => i.id === spec.id);
    const dir = KEY_DIRECTIONS[e.key];
    if (!item || (!dir && e.key !== 'Home' && e.key !== 'End')) return;
    e.preventDefault();
    const others = base.filter((i) => i.id !== spec.id);
    // Home asks for a row above everything (clamped to the first one); End for the row below the others.
    const next = dir
      ? nudgeItem(base, spec.id, dir, cols)
      : moveItem(base, spec.id, { x: item.x, y: e.key === 'Home' ? -GRID.maxRow : boardBottom(others) }, cols);
    if (sameBoard(next, base)) return;
    api.saveBoard(cols, next);
    setAnnouncement(describe(spec.id, next));
    // The card moved in the DOM (reading order): give the focus back to its grip.
    requestAnimationFrame(() => gripRefs.current.get(spec.id)?.focus());
  };

  const previewResize = (id: WidgetId, size: WidgetSize | null) =>
    setPreview(size ? { id, mode: 'resize', items: resizeItem(base, id, size, cols) } : null);

  const commitResize = (spec: WidgetSpec, displayed: WidgetSize, startCols: number) => {
    const stored = clampSize(api.layout.sizes[spec.id] ?? spec.defaultSize, spec);
    // On narrow boards the stored (desktop) width survives a drag that did not change the shown one.
    const size = { c: commitCols(stored.c, startCols, displayed.c), r: displayed.r };
    if (size.c !== stored.c || size.r !== stored.r) api.resize(cols, spec.id, size, resizeItem(base, spec.id, displayed, cols));
    setPreview(null);
    setAnnouncement(`${spec.title}: ${displayed.c} × ${displayed.r}`);
  };

  const hide = (spec: WidgetSpec) => {
    const before = api.layout;
    // Focus goes to the next card's grip (or the previous one, or "Personalizar") instead of the page.
    const index = base.findIndex((i) => i.id === spec.id);
    const nextId = base[index + 1]?.id ?? base[index - 1]?.id;
    api.setVisible(spec.id, false);
    requestAnimationFrame(() => {
      const target = (nextId && gripRefs.current.get(nextId)) || document.getElementById(CUSTOMIZE_BUTTON_ID);
      target?.focus();
    });
    toast(`"${spec.title}" foi ocultado.`, {
      description: 'Reexiba em Personalizar.',
      duration: 8000,
      action: { label: 'Desfazer', onClick: () => api.restore(before) },
    });
  };

  // The board waits for its width so charts mount once, at the right size.
  if (width === 0) return null;
  if (base.length === 0) {
    return (
      <EmptyState
        icon={<LayoutGrid />}
        title="Nenhum card no painel"
        description="Escolha os cards que quer acompanhar em Personalizar."
        action={
          <Button variant="outline" size="sm" onClick={onCustomize}>
            Personalizar
          </Button>
        }
      />
    );
  }
  const moving = preview?.mode === 'move' ? shown.get(preview.id) : undefined;
  return (
    <div data-widget-grid data-cols={cols} className="relative" style={{ height: rows > 0 ? rows * (g.rowPx + g.gap) - g.gap : 0 }}>
      {moving ? (
        <div
          aria-hidden
          data-drop-target
          className="pointer-events-none absolute top-0 left-0 rounded-xl border-2 border-dashed border-primary/60 bg-primary/5 transition-transform duration-150 ease-out motion-reduce:transition-none"
          style={ghostStyle(moving, g)}
        />
      ) : null}
      {base.map((committed) => {
        const spec = SPEC_BY_ID[committed.id];
        const dragging = preview?.mode === 'move' && preview.id === spec.id;
        // The dragged card stays on its cell (moved by `translate`); the others show the preview.
        const item = dragging ? committed : (shown.get(spec.id) ?? committed);
        return (
          <WidgetFrame
            key={spec.id}
            spec={spec}
            item={item}
            geometry={g}
            dragging={dragging}
            resizing={preview?.mode === 'resize' && preview.id === spec.id}
            Body={components[spec.id]}
            widgetProps={widgetProps}
            alert={alerts[spec.id]}
            onResizePreview={(size) => previewResize(spec.id, size)}
            onResizeCommit={(size, startCols) => commitResize(spec, size, startCols)}
            chrome={{
              id: spec.id,
              title: spec.title,
              resizing: false,
              onHide: () => hide(spec),
              headerProps: { onPointerDown: (e) => beginDrag(e, spec.id, false) },
              gripProps: {
                ref: (el: HTMLButtonElement | null) => {
                  if (el) gripRefs.current.set(spec.id, el);
                  else gripRefs.current.delete(spec.id);
                },
                'aria-label': `Mover ${spec.title}`,
                title: 'Arraste para qualquer lugar do painel (ou use as setas)',
                onPointerDown: (e) => {
                  e.stopPropagation();
                  beginDrag(e, spec.id, true);
                },
                onKeyDown: (e) => moveWithKeyboard(e, spec),
              },
            }}
          />
        );
      })}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function ghostStyle(item: BoardItem, g: Geometry) {
  const box = boxOf(item, g);
  return { width: box.width, height: box.height, transform: `translate(${box.left}px, ${box.top}px)` };
}

/** Widget content, skipped while only positions change (drag and resize previews). */
const WidgetBody = memo(function WidgetBody({ Body, ...props }: WidgetProps & { Body: ComponentType<WidgetProps> }) {
  return <Body {...props} />;
});

interface FrameProps {
  spec: WidgetSpec;
  /** Cell and span as displayed (the preview while something is dragged or resized). */
  item: BoardItem;
  geometry: Geometry;
  dragging: boolean;
  resizing: boolean;
  Body: ComponentType<WidgetProps>;
  widgetProps: Omit<WidgetProps, 'size' | 'alert'>;
  alert: WidgetAlert | undefined;
  chrome: WidgetChrome;
  onResizePreview: (size: WidgetSize | null) => void;
  onResizeCommit: (size: WidgetSize, startCols: number) => void;
}

/** Positioned card: its box on the board and the corner resize handle (pointer drag or arrow keys). */
function WidgetFrame({ spec, item, geometry, dragging, resizing, Body, widgetProps, alert, chrome, onResizePreview, onResizeCommit }: FrameProps) {
  const { cols } = geometry;
  const box = boxOf(item, geometry);
  const size = useMemo(() => ({ c: item.c, r: item.r }), [item.c, item.r]);
  const chromeValue = useMemo(() => ({ ...chrome, resizing }), [chrome, resizing]);
  // The corner handle grows the card to the right edge of the board, never past it.
  const room = cols - item.x;

  const onResizeStart = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY, size: { c: item.c, r: item.r } };
    const metrics = { ...geometry, cols: room };
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    let latest = start.size;
    let done = false;
    const onMove = (ev: PointerEvent) => {
      const next = snapResize(start.size, ev.clientX - start.x, ev.clientY - start.y, metrics, spec);
      if (next.c === latest.c && next.r === latest.r) return;
      latest = next;
      onResizePreview(next);
    };
    const finish = (save: boolean) => {
      if (done) return;
      done = true;
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('lostpointercapture', onLost);
      window.removeEventListener('keydown', onKey);
      if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
      if (save && (latest.c !== start.size.c || latest.r !== start.size.r)) onResizeCommit(latest, start.size.c);
      else onResizePreview(null);
    };
    const onUp = () => finish(true);
    const onLost = () => finish(false);
    // Escape puts the card (and the cards it pushed) back as they were before the drag.
    const onKey = (ev: globalThis.KeyboardEvent) => {
      if (ev.key === 'Escape') finish(false);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('lostpointercapture', onLost);
    window.addEventListener('keydown', onKey);
  };

  const onResizeKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key] as [number, number] | undefined;
    if (!step) return;
    e.preventDefault();
    const next = clampSize({ c: Math.min(item.c + step[0], room), r: item.r + step[1] }, spec);
    const shown = { c: Math.min(next.c, room), r: next.r };
    if (shown.c !== item.c || shown.r !== item.r) onResizeCommit(shown, item.c);
  };

  return (
    <div
      data-widget-id={spec.id}
      data-cell={`${item.x},${item.y}`}
      data-size={`${item.c}x${item.r}`}
      style={{ width: box.width, height: box.height, transform: `translate(${box.left}px, ${box.top}px)` }}
      className={cn(
        'group/widget absolute top-0 left-0 min-h-0 min-w-0 rounded-xl transition-[transform,translate] duration-200 ease-out motion-reduce:transition-none',
        dragging && 'pointer-events-none z-30 shadow-lg transition-none',
        resizing && 'z-20 outline-2 outline-offset-2 outline-primary',
      )}
    >
      <WidgetChromeContext.Provider value={chromeValue}>
        <WidgetErrorBoundary title={spec.title}>
          <WidgetBody Body={Body} {...widgetProps} size={size} alert={alert} />
        </WidgetErrorBoundary>
      </WidgetChromeContext.Provider>
      {resizing ? (
        <span className="tabular pointer-events-none absolute right-7 bottom-1.5 z-10 rounded-md bg-fg px-1.5 py-0.5 text-mini font-semibold text-surface">
          {item.c} × {item.r}
        </span>
      ) : null}
      <button
        type="button"
        onPointerDown={onResizeStart}
        onKeyDown={onResizeKey}
        aria-label={`Redimensionar ${spec.title}`}
        title="Arraste para redimensionar (ou use as setas)"
        className={cn(
          'absolute right-1 bottom-1 z-10 flex size-[18px] cursor-nwse-resize touch-none items-center justify-center rounded text-muted transition-opacity',
          'opacity-0 group-hover/widget:opacity-60 hover:!opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-70',
          resizing && 'opacity-100',
        )}
      >
        <MoveDiagonal2 className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

class WidgetErrorBoundary extends ReactComponent<{ title: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-surface p-4 text-center">
        <p className="text-title-sm font-semibold text-fg">{this.props.title}</p>
        <p className="text-caption text-muted">Não foi possível exibir este card agora.</p>
      </div>
    );
  }
}
