import { cn } from '@/lib/utils';
import { useTone } from '@/lib/theme';

interface ProgressBarProps {
  /** 0..1 */
  value: number;
  color?: string;
  tone?: 'brand' | 'success' | 'danger' | 'warning';
  className?: string;
  size?: 'sm' | 'md';
  label?: string;
}

const TONES = {
  brand: 'bg-primary',
  success: 'bg-success',
  danger: 'bg-danger',
  // Marks use the chart yellow (visible on the track); the warning text colour stays text-warning.
  warning: 'bg-chart-yellow',
} as const;

export function ProgressBar({ value, color, tone = 'brand', className, size = 'md', label }: ProgressBarProps) {
  const toneColor = useTone();
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
      className={cn('w-full overflow-hidden rounded-full bg-bg-subtle', size === 'sm' ? 'h-1.5' : 'h-2', className)}
    >
      {/*
        The fill is full width and slides in with `translate` (compositor-only, no layout per frame).
        Its right end stays rounded; the left one is clipped by the track's overflow-hidden.
      */}
      <div
        className={cn('h-full w-full rounded-full transition-[translate] duration-(--dur-chart) ease-out', !color && TONES[tone])}
        style={{ translate: `${pct - 100}% 0`, ...(color ? { backgroundColor: color.startsWith('#') ? toneColor(color) : color } : {}) }}
      />
    </div>
  );
}
