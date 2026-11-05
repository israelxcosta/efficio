import { cn } from '@/lib/utils';
import { stackSegments } from './chart-scale';

export interface StackSegment {
  value: number;
  /** Fill class (`bg-data`, `bg-danger`, `bg-data/45`, `bg-border-strong`…). */
  className?: string;
  /** Hatched fill (open/forecast) in this CSS colour instead of `className`. */
  hatch?: string;
  label?: string;
}

interface StackBarProps {
  segments: StackSegment[];
  /** Reference mark (0–1) with a short label under the bar ("dia 5", "mês anterior"; '' = no label). */
  marker?: { at: number; label: string };
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Proportional stacked bar (6px `sm`, 10px `md`): exact widths from `stackSegments`, 2px between
 * segments, full radius. Decorative (`aria-hidden`): the text beside it carries the numbers.
 */
export function StackBar({ segments, marker, size = 'md', className }: StackBarProps) {
  const parts = stackSegments(segments.map((s) => s.value));
  const height = size === 'sm' ? 'h-1.5' : 'h-2.5';
  const at = marker ? Math.max(0, Math.min(1, Number.isFinite(marker.at) ? marker.at : 0)) : 0;
  return (
    <div aria-hidden className={cn('relative w-full', marker?.label && 'pb-4', className)}>
      <div className={cn('flex w-full gap-0.5 overflow-hidden rounded-full bg-bg-subtle', height)}>
        {segments.map((s, i) => {
          const w = parts[i]!.width;
          if (w <= 0) return null;
          return (
            <span
              key={i}
              title={s.label}
              className={cn('h-full min-w-1 rounded-full', !s.hatch && s.className)}
              style={{
                flexGrow: w * 100,
                flexBasis: 0,
                ...(s.hatch
                  ? { background: `repeating-linear-gradient(135deg, ${s.hatch} 0 2px, color-mix(in oklab, ${s.hatch} 30%, transparent) 2px 5px)` } // taste-skill-ignore
                  : {}),
              }}
            />
          );
        })}
      </div>
      {marker && (
        <>
          <span
            className={cn('absolute top-[-3px] w-0.5 -translate-x-1/2 rounded-full bg-fg', size === 'sm' ? 'h-3' : 'h-4')}
            style={{ left: `${at * 100}%` }}
          />
          {marker.label ? (
          <span
            className={cn(
              'absolute bottom-0 whitespace-nowrap text-micro text-muted',
              at < 0.12 ? 'translate-x-0' : at > 0.88 ? '-translate-x-full' : '-translate-x-1/2',
            )}
            style={{ left: `${at * 100}%` }}
          >
            {marker.label}
          </span>
          ) : null}
        </>
      )}
    </div>
  );
}
