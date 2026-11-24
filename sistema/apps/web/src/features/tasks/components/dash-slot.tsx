// Cards of the Início on the same size system as the financial board (docs/dashboards-redesign.md
// §4): rows of 96px (88px below 4 columns) with 16px gaps, heights from `heightForRows`, and widths
// by container band — 12 columns from 900px, 2 from 560px, 1 below.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Link } from 'react-router';
import { GripHorizontal, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { heightForRows } from '@/features/dashboard/layout/layout';
import { FitList } from '@/features/dashboard/layout/widget-card';
import type { BoardCols } from '@/features/dashboard/layout/types';
import { cn, pluralize } from '@/lib/utils';

/** Width of a card: columns of 12 on wide grids (`wide`) and of 2 on medium ones (`medium`). */
export interface SlotSpan {
  wide: 3 | 4 | 6 | 8 | 12;
  medium: 1 | 2;
}

type Rows = 2 | 3 | 4;

/** Grid columns a card spans: `wide` (of 12) at 4 board columns, `medium` (of 2) at 2, 1 on phones. */
export function slotColumns(span: SlotSpan, cols: BoardCols): number {
  if (cols === 4) return span.wide;
  if (cols === 2) return span.medium;
  return 1;
}

/** Rows of a card: `rows` on wide grids, `mediumRows` below (and `phoneRows`, when given, on phones). */
export function slotRows(r: { rows: Rows; mediumRows?: Rows; phoneRows?: Rows }, cols: BoardCols): Rows {
  if (cols === 4) return r.rows;
  if (cols === 1 && r.phoneRows) return r.phoneRows;
  return r.mediumRows ?? r.rows;
}

/** Column band of the page (the page measures itself, like the financial board). */
export const DashColsContext = createContext<BoardCols>(4);

export function useDashCols(): BoardCols {
  return useContext(DashColsContext);
}

/** Grid classes of a section: 12 columns, 2 or 1, with 16px gaps. */
export function dashGridClass(cols: BoardCols): string {
  return cols === 4 ? 'grid grid-cols-12 gap-4' : cols === 2 ? 'grid grid-cols-2 gap-4' : 'grid grid-cols-1 gap-4';
}

/** True inside a `fit` slot: the card takes its content height, so lists are capped by count. */
const SlotFitContext = createContext(false);

export function useSlotFit(): boolean {
  return useContext(SlotFitContext);
}

/**
 * A card of the Início: fixed height by rows and its span on the section grid. `grow` makes the height a
 * minimum (a card whose content has a fixed shape, like Minha área's calendar, never overflows it).
 * `fit` is for cards without an adjustable list (spec app-screens §4.2, "a card only stretches when
 * it has content to fill"): the height follows the content, from 2 rows up, and the grid row takes the
 * tallest card, so neighbours stay aligned at the bottom without a void. Lists inside use `SlotList`.
 */
export function DashSlot({
  rows,
  span,
  mediumRows,
  phoneRows,
  grow,
  fit,
  children,
}: {
  rows: Rows;
  span: SlotSpan;
  mediumRows?: Rows;
  phoneRows?: Rows;
  grow?: boolean;
  fit?: boolean;
  children: ReactNode;
}) {
  const cols = useDashCols();
  const height = heightForRows(fit ? 2 : slotRows({ rows, mediumRows, phoneRows }, cols), cols);
  return (
    <div className="min-w-0" style={{ ...(grow || fit ? { minHeight: height } : { height }), gridColumn: `span ${slotColumns(span, cols)}` }}>
      <SlotFitContext.Provider value={Boolean(fit)}>{children}</SlotFitContext.Provider>
    </div>
  );
}

type SlotListProps<T> = ComponentProps<typeof FitList<T>> & {
  /** Rows shown in a `fit` slot (the rest become the "+ N …" line). */
  cap: number;
};

/**
 * The list of a card: in a fixed slot, `FitList` (rows cut to the height); in a `fit` slot, the
 * first `cap` rows in the flow (the card grows with them) and the "+ N …" line under them.
 */
export function SlotList<T>({ cap, ...props }: SlotListProps<T>) {
  const fit = useSlotFit();
  if (!fit) return <FitList {...props} />;
  const { items, getKey, renderItem, total, moreLabel, moreHref, className, showMore = true } = props;
  const shown = items.slice(0, cap);
  const hidden = Math.max(total ?? items.length, items.length) - shown.length;
  const more = `+ ${pluralize(hidden, moreLabel[0], moreLabel[1])}`;
  return (
    <div className="min-w-0">
      <div className={className}>
        {shown.map((item, i) => (
          <div key={getKey(item)} className="min-w-0">
            {renderItem(item, i)}
          </div>
        ))}
      </div>
      {hidden > 0 && showMore ? (
        <p className="mt-1 flex h-5 items-end px-1 text-caption text-muted">
          {moreHref ? (
            <Link to={moreHref} className="font-medium text-brand-text hover:underline">
              {more}
            </Link>
          ) : (
            more
          )}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable board: the cards of the Início and Minha área in two large columns, in the order each
// person chose (drag a card by its title or its grip; arrow keys on the grip). Saved per workspace and
// person in this browser.
// ---------------------------------------------------------------------------

export interface BoardCard {
  id: string;
  title: string;
  rows: Rows;
  mediumRows?: Rows;
  phoneRows?: Rows;
  fit?: boolean;
  grow?: boolean;
  /** `full`: a whole row of the board (a group of small cards side by side, like the due dates). */
  span?: 'half' | 'full';
  node: ReactNode;
}

/** The cards in the stored order: unknown ids dropped, new cards placed after their default neighbour. */
export function orderCards(defaults: readonly string[], stored: readonly string[] | null): string[] {
  if (!stored) return [...defaults];
  const out = stored.filter((id, i) => defaults.includes(id) && stored.indexOf(id) === i);
  defaults.forEach((id, i) => {
    if (out.includes(id)) return;
    const prev = defaults
      .slice(0, i)
      .reverse()
      .find((p) => out.includes(p));
    out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, id);
  });
  return out;
}

/** Moves `id` to where `target` is (after it when coming from before, before it otherwise). */
export function moveCard(order: readonly string[], id: string, target: string): string[] {
  const from = order.indexOf(id);
  const to = order.indexOf(target);
  if (from < 0 || to < 0 || from === to) return [...order];
  const next = order.filter((x) => x !== id);
  next.splice(to, 0, id);
  return next;
}

/** One step earlier (-1) or later (+1): the keyboard way of moving a card. */
export function stepCard(order: readonly string[], id: string, delta: -1 | 1): string[] {
  const i = order.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return [...order];
  return moveCard(order, id, order[j]!);
}

function readOrder(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.every((x) => typeof x === 'string') ? parsed : null;
  } catch {
    return null;
  }
}

function useStoredOrder(key: string): [string[] | null, (next: string[] | null) => void] {
  const [stored, setStored] = useState<string[] | null>(() => readOrder(key));
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setStored(readOrder(key));
  }
  const save = useCallback(
    (next: string[] | null) => {
      setStored(next);
      try {
        if (next) localStorage.setItem(key, JSON.stringify(next));
        else localStorage.removeItem(key);
      } catch {
        // Private mode or full storage: the order lasts until the page reloads.
      }
    },
    [key],
  );
  return [stored, save];
}

/** Interactive parts of a card header that keep their own click (they never start a drag). */
const NO_DRAG = 'button, a, input, select, textarea, [role="radio"], [role="tab"], [role="switch"]';

export function SortableBoard({ cards, storeKey, label }: { cards: BoardCard[]; storeKey: string; label: string }) {
  const cols = useDashCols();
  const defaults = cards.map((c) => c.id);
  const [stored, setStored] = useStoredOrder(storeKey);
  const order = orderCards(defaults, stored);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const [dragging, setDragging] = useState<string | null>(null);
  // Where the pointer went down: a drag only starts from a card's title or grip, never from its buttons.
  const origin = useRef<HTMLElement | null>(null);
  const board = useRef<HTMLDivElement>(null);
  // The browser picks the drag source when the button goes down, so each card's header is draggable
  // from the start (the cards are not ours to render; every render may bring a new header).
  useEffect(() => {
    board.current?.querySelectorAll<HTMLElement>(':scope > [role="listitem"] header').forEach((h) => {
      if (!h.draggable) h.draggable = true;
    });
  });
  const [announce, setAnnounce] = useState('');
  const custom = stored !== null && order.join('|') !== defaults.join('|');

  function moveTo(next: string[]) {
    if (next.join('|') !== order.join('|')) setStored(next);
  }

  return (
    <>
      {/* Dense flow: after a reorder, a half card fills the hole a full row may leave beside another. */}
      <div ref={board} className={cn(dashGridClass(cols), 'grid-flow-row-dense')} role="list" aria-label={label}>
        {order.map((id, index) => {
          const c = byId.get(id)!;
          const height = heightForRows(c.fit ? 2 : slotRows(c, cols), cols);
          return (
            <div
              key={id}
              role="listitem"
              className={cn('group/card relative min-w-0 transition-opacity [&_header]:cursor-grab', dragging === id && 'opacity-40', dragging && '[&_header]:cursor-grabbing')}
              style={{ ...(c.grow || c.fit ? { minHeight: height } : { height }), gridColumn: `span ${slotColumns(c.span === 'full' ? { wide: 12, medium: 2 } : { wide: 6, medium: 1 }, cols)}` }}
              onPointerDown={(e) => {
                origin.current = e.target as HTMLElement;
              }}
              onDragStart={(e) => {
                const from = origin.current;
                const ok = from && (from.closest('[data-card-grip]') || (from.closest('header') && !from.closest(NO_DRAG)));
                if (!ok) {
                  e.preventDefault();
                  return;
                }
                setDragging(id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', id);
                // The whole card follows the pointer, not just its header.
                const card = e.currentTarget.getBoundingClientRect();
                e.dataTransfer.setDragImage(e.currentTarget, e.clientX - card.left, e.clientY - card.top);
              }}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                if (dragging !== id) moveTo(moveCard(order, dragging, id));
              }}
              onDrop={(e) => e.preventDefault()}
              onDragEnd={() => {
                setDragging(null);
                origin.current = null;
                setAnnounce(`${c.title} na posição ${order.indexOf(id) + 1} de ${order.length}.`);
              }}
            >
              <button
                type="button"
                data-card-grip
                draggable
                aria-label={`Mover o card ${c.title} (posição ${index + 1} de ${order.length}). Use as setas.`}
                title="Arraste para mudar a posição (ou use as setas)"
                onKeyDown={(e) => {
                  const delta = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : 0;
                  if (!delta) return;
                  e.preventDefault();
                  const next = stepCard(order, id, delta);
                  moveTo(next);
                  setAnnounce(`${c.title} na posição ${next.indexOf(id) + 1} de ${order.length}.`);
                }}
                className="absolute top-1 left-1/2 z-[2] flex h-4 w-10 -translate-x-1/2 cursor-grab items-center justify-center rounded-full text-subtle opacity-0 transition-opacity group-hover/card:opacity-100 hover:bg-bg-subtle hover:text-muted focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary pointer-coarse:hidden"
              >
                <GripHorizontal className="size-4" aria-hidden />
              </button>
              <SlotFitContext.Provider value={Boolean(c.fit)}>{c.node}</SlotFitContext.Provider>
            </div>
          );
        })}
      </div>
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
      {custom ? (
        <div className="-mt-2 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setStored(null)}>
            <RotateCcw /> Restaurar a ordem dos cards
          </Button>
        </div>
      ) : null}
    </>
  );
}

/**
 * A row of small cards side by side (4 on wide boards, 2 on medium, 1 on phones), each `rows` tall: the
 * due dates (certificates, "laudos", agreements, fees). It is one item of the sortable board.
 */
export function CardRow({ rows = 3, children }: { rows?: Rows; children: ReactNode[] }) {
  const cols = useDashCols();
  const items = children.filter(Boolean);
  const per = cols === 4 ? Math.min(4, items.length) : cols === 2 ? 2 : 1;
  const height = heightForRows(rows, cols);
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${per}, minmax(0, 1fr))` }}>
      {items.map((child, i) => (
        <div key={i} className="min-w-0" style={{ height }}>
          {child}
        </div>
      ))}
    </div>
  );
}

