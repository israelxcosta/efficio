import { cn } from '@/lib/utils';

export interface StackedBarPart {
  value: number;
  /** Tailwind background class of the part (`bg-chart-red`, `bg-chart-blue-3`…). */
  className: string;
  label?: string;
}

/**
 * Thin horizontal bar in parts (on time × late, overdue × upcoming). `max` scales the whole bar against
 * other rows (the rest stays as track); without it the parts fill the width. Zero parts are skipped.
 */
export function StackedBar({ parts, max, className, label }: { parts: StackedBarPart[]; max?: number; className?: string; label?: string }) {
  const sum = parts.reduce((n, p) => n + Math.max(0, p.value), 0);
  const scale = Math.max(1, max ?? sum);
  const visible = parts.filter((p) => p.value > 0);
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('flex h-2 min-w-0 gap-0.5 overflow-hidden rounded-full bg-bg-subtle', className)}
    >
      {visible.map((p, i) => (
        <span
          key={i}
          className={cn('h-full first:rounded-l-full last:rounded-r-full', p.className)}
          style={{ width: `${(p.value / scale) * 100}%` }}
          title={p.label ? `${p.label}: ${p.value}` : undefined}
        />
      ))}
    </span>
  );
}
