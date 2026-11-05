// Cards of the Início on the same size system as the financial board (docs/dashboards-redesign.md
// §4): rows of 96px (88px below 4 columns) with 16px gaps, heights from `heightForRows`, and widths
// by container band — 12 columns from 1000px, 2 from 560px, 1 below.

import { createContext, useContext, type ReactNode } from 'react';
import { heightForRows } from '@/features/dashboard/layout/layout';
import type { BoardCols } from '@/features/dashboard/layout/types';

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

/** A card of the Início: fixed height by rows and its span on the section grid. */
export function DashSlot({ rows, span, mediumRows, phoneRows, children }: { rows: Rows; span: SlotSpan; mediumRows?: Rows; phoneRows?: Rows; children: ReactNode }) {
  const cols = useDashCols();
  return (
    <div className="min-w-0" style={{ height: heightForRows(slotRows({ rows, mediumRows, phoneRows }, cols), cols), gridColumn: `span ${slotColumns(span, cols)}` }}>
      {children}
    </div>
  );
}
