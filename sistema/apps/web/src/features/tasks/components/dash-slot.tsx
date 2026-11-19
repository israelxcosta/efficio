// Cards of the Início on the same size system as the financial board (docs/dashboards-redesign.md
// §4): rows of 96px (88px below 4 columns) with 16px gaps, heights from `heightForRows`, and widths
// by container band — 12 columns from 1000px, 2 from 560px, 1 below.

import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import { Link } from 'react-router';
import { heightForRows } from '@/features/dashboard/layout/layout';
import { FitList } from '@/features/dashboard/layout/widget-card';
import type { BoardCols } from '@/features/dashboard/layout/types';
import { pluralize } from '@/lib/utils';

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
