import { stackSegments } from '@/components/charts/chart-scale';
import { StackBar } from '@/components/charts/stack-bar';
import { cn } from '@/lib/utils';
import { BAND_DOT, type Band, type BandTone } from '../dashboard-logic';

const COUNT_TONE: Record<BandTone, string> = {
  danger: 'text-danger',
  warning: 'text-warning',
  success: 'text-fg',
  data: 'text-fg',
  dataSoft: 'text-fg',
  muted: 'text-fg',
};

const HERO_TONE: Partial<Record<BandTone, string>> = { danger: 'text-danger', warning: 'text-warning' };

/**
 * Top of a StatusCard (docs/dashboards-redesign.md §5): an optional hero number (coloured only when
 * it is an alert) with its label, then the 10px stacked bar (progress or distribution) and an
 * optional "today" mark. Replaces the rings: the bar is proportional and the bands carry the numbers.
 */
export function StatusSummary({
  hero,
  segments,
  marker,
  className,
}: {
  hero?: { value: string; label: string; tone?: BandTone };
  segments: { value: number; tone: BandTone }[];
  marker?: { at: number; label: string };
  className?: string;
}) {
  return (
    <div className={cn('flex shrink-0 flex-col gap-2', className)}>
      {hero ? (
        <p className="flex min-w-0 items-baseline gap-2">
          <span className={cn('tabular text-kpi font-semibold tracking-tight whitespace-nowrap', (hero.tone && HERO_TONE[hero.tone]) ?? 'text-fg')}>
            {hero.value}
          </span>
          <span className="truncate text-caption text-muted">{hero.label}</span>
        </p>
      ) : null}
      <StackBar size="md" segments={segments.map((s) => ({ value: s.value, className: BAND_DOT[s.tone] }))} marker={marker} />
    </div>
  );
}

/**
 * The bands of a dashboard card (Effy's "cert-stat-line"): a dot, the name, its share of `total`
 * (when given) and the count. Each band is a button that opens the list behind it; an empty band
 * stays visible but cannot be opened. `dense`: 32px rows without the hint line (5 bands in a card M of
 * 320px); `dense="tight"`: 28px rows, for the 296px cards M below 4 columns.
 */
export function BandList<K extends string>({
  bands,
  onSelect,
  ariaLabel,
  className,
  total,
  dense = false,
}: {
  bands: Band<K>[];
  onSelect: (key: K) => void;
  ariaLabel: string;
  className?: string;
  total?: number;
  dense?: boolean | 'tight';
}) {
  const shares = total !== undefined ? stackSegments(bands.map((b) => b.count)) : null;
  return (
    <ul className={cn('-mx-2 flex flex-col', className)} aria-label={ariaLabel}>
      {bands.map((b, i) => (
        <li key={b.key}>
          <button
            type="button"
            disabled={b.count === 0}
            onClick={() => onSelect(b.key)}
            aria-label={`${b.label}: ${b.count}${b.hint ? ` (${b.hint})` : ''}. Ver a lista.`}
            className={cn(
              'group/band flex w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors enabled:hover:bg-surface-muted disabled:cursor-default',
              dense === 'tight' ? 'h-7' : dense ? 'h-8' : 'min-h-9 py-1.5',
            )}
          >
            <span className={cn('size-2 shrink-0 rounded-full', BAND_DOT[b.tone], b.count === 0 && 'opacity-40')} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className={cn('block truncate text-body-sm', b.count ? 'text-fg' : 'text-muted')}>{b.label}</span>
              {b.hint && !dense ? <span className="block truncate text-caption text-muted">{b.hint}</span> : null}
            </span>
            {shares && b.count > 0 ? <span className="tabular shrink-0 text-micro text-muted">{shares[i]!.pct}%</span> : null}
            <span className={cn('tabular w-6 shrink-0 text-right text-body-sm font-semibold', b.count ? COUNT_TONE[b.tone] : 'text-subtle')}>{b.count}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Thin progress bar of a list row (done, overdue, pending…): the shared stacked bar at 6px. */
export function SegmentBar({ segments, className }: { segments: { value: number; tone: BandTone }[]; className?: string }) {
  return <StackBar size="sm" className={className} segments={segments.map((s) => ({ value: s.value, className: BAND_DOT[s.tone] }))} />;
}
