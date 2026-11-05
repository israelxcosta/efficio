import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { Info } from 'lucide-react';
import { Sparkline } from '@/components/charts/sparkline';
import { cn } from '@/lib/utils';
import { Card } from './card';
import { Skeleton } from './skeleton';
import { Tooltip } from './tooltip';

export interface MetricCell {
  key: string;
  label: string;
  info?: string;
  value: ReactNode;
  /** One line under the value (the comparison); truncated, with `footerTitle` as its tooltip. */
  footer?: ReactNode;
  footerTitle?: string;
  href?: string;
  /** Accessible name of the link (defaults to the visible text). */
  aria?: string;
  spark?: { values: number[]; tone: 'data' | 'neutral' };
  /** Wider cell (1.3 fraction) with a 32px number when the strip is one row. */
  hero?: boolean;
  /** Colour of the value (red for a negative result, overdue tasks). */
  tone?: 'danger' | 'warning';
  loading?: boolean;
}

interface MetricStripProps {
  cells: MetricCell[];
  /** Cells per row between 560 and 999px of strip width. */
  medium?: 2 | 3;
  className?: string;
}

const VALUE_TONE = { danger: 'text-danger', warning: 'text-warning' } as const;

/**
 * Number strip on top of a dashboard (docs/dashboards-redesign.md §5): one card, cells split by
 * 1px dividers. ≥ 1000px of strip: one row (a hero cell gets 1.3 fractions); 560–999px: `medium`
 * per row; below: each cell is a line (label and footer on the left, the whole value on the right,
 * 20px). The value is never truncated nor compacted.
 */
export function MetricStrip({ cells, medium = 2, className }: MetricStripProps) {
  const wide = cells.map((c) => (c.hero ? '1.3fr' : '1fr')).join(' ');
  return (
    <Card className={cn('@container overflow-hidden', className)}>
      <div
        style={{ '--strip-cols': wide } as CSSProperties}
        className={cn(
          'grid grid-cols-1 gap-px bg-border',
          medium === 3 ? '@[560px]:grid-cols-3' : '@[560px]:grid-cols-2',
          '@[1000px]:[grid-template-columns:var(--strip-cols)]',
        )}
      >
        {cells.map((cell) => (
          <MetricCellView key={cell.key} cell={cell} />
        ))}
      </div>
    </Card>
  );
}

/**
 * One cell. With `href` the whole cell is a link (a stretched overlay, so footers may hold their own
 * buttons and links above it, and the grid keeps one layout for every width).
 */
function MetricCellView({ cell }: { cell: MetricCell }) {
  return (
    <div
      className={cn(
        'relative grid min-w-0 grid-cols-[minmax(0,1fr)_auto] content-start gap-x-3 bg-surface px-4 py-3 @[560px]:grid-cols-[auto_minmax(0,1fr)] @[560px]:px-5 @[560px]:py-4 @[1000px]:px-4',
        cell.href && 'transition-colors has-[>a:hover]:bg-surface-muted',
      )}
    >
      {cell.href ? (
        <Link
          to={cell.href}
          aria-label={cell.aria ?? cell.label}
          className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        />
      ) : null}
      <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-1.5 text-caption font-medium text-muted @[560px]:col-span-2">
        <span className="truncate">{cell.label}</span>
        {cell.info ? (
          <Tooltip content={cell.info}>
            <span tabIndex={0} role="img" aria-label={cell.info} className="relative z-10 shrink-0 rounded-sm text-subtle hover:text-muted">
              <Info className="size-3.5" aria-hidden />
            </span>
          </Tooltip>
        ) : null}
      </div>
      <div
        data-metric-value
        className={cn(
          'tabular col-start-2 row-span-2 row-start-1 self-center text-right text-[20px] leading-tight font-semibold tracking-tight whitespace-nowrap',
          '@[560px]:col-start-1 @[560px]:row-span-1 @[560px]:row-start-2 @[560px]:mt-1 @[560px]:self-end @[560px]:text-left @[560px]:text-kpi',
          cell.hero && '@[1000px]:text-[32px] @[1000px]:leading-[38px]',
          cell.tone ? VALUE_TONE[cell.tone] : 'text-fg',
        )}
      >
        {cell.loading ? <Skeleton className="h-6 w-24 @[560px]:h-7 @[560px]:w-32" /> : cell.value}
      </div>
      {cell.spark && !cell.loading ? (
        <div className="hidden min-w-0 justify-end self-end overflow-hidden @[560px]:col-start-2 @[560px]:row-start-2 @[560px]:flex">
          <Sparkline values={cell.spark.values} tone={cell.spark.tone} />
        </div>
      ) : null}
      <div
        title={cell.footerTitle}
        className="col-start-1 row-start-2 mt-0.5 min-w-0 truncate text-caption text-muted @[560px]:col-span-2 @[560px]:row-start-3 @[560px]:mt-1.5 [&_a]:relative [&_a]:z-10 [&_button]:relative [&_button]:z-10"
      >
        {cell.loading ? <Skeleton className="h-3.5 w-28" /> : (cell.footer ?? '\u00a0')}
      </div>
    </div>
  );
}
