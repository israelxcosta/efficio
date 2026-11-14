import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  /** Classes applied when this option is active (e.g. red for "Despesa"). */
  activeClassName?: string;
  title?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  /** 'subtle' = white pill on gray track; 'solid' = navy active (main tabs); 'card' = large (sheet). */
  variant?: 'subtle' | 'solid' | 'card';
  size?: 'sm' | 'md';
  className?: string;
  fullWidth?: boolean;
  ariaLabel?: string;
}

/**
 * Index of the option a key moves to, like a radio group: Right/Down the next, Left/Up the previous
 * (wrapping), Home/End the ends; null for any other key.
 */
export function segmentTarget(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0;
  if (step === 0) return null;
  if (index < 0) return step > 0 ? 0 : count - 1;
  return (index + step + count) % count;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  variant = 'subtle',
  size = 'md',
  className,
  fullWidth,
  ariaLabel,
}: SegmentedControlProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = options.findIndex((o) => o.value === value);
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1',
        variant === 'subtle' && 'rounded-md bg-bg-subtle p-1',
        variant === 'solid' && 'rounded-lg border border-border bg-surface p-1',
        variant === 'card' && 'rounded-xl bg-bg-subtle p-1.5',
        fullWidth && 'flex w-full',
        className,
      )}
      onKeyDown={(e) => {
        const target = segmentTarget(e.key, activeIndex, options.length);
        if (target === null) return;
        e.preventDefault();
        // The focus goes with the chosen option (the tab stop moves to it on the next render).
        buttons.current[target]?.focus();
        const next = options[target];
        if (next && next.value !== value) onChange(next.value);
      }}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            // One tab stop: the chosen option, or the first while none is.
            tabIndex={active || (activeIndex < 0 && i === 0) ? 0 : -1}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 font-semibold whitespace-nowrap transition-colors duration-150 [&_svg]:size-4',
              fullWidth && 'flex-1',
              size === 'sm' ? 'h-7 rounded-[8px] px-2.5 text-xs' : 'h-9 rounded-[10px] px-3.5 text-[13px]',
              variant === 'card' && 'h-12 rounded-lg text-[15px]',
              active
                ? (opt.activeClassName ??
                    (variant === 'solid'
                      ? 'bg-bg-subtle text-fg'
                      : 'bg-surface text-fg shadow-xs'))
                : 'text-muted hover:text-fg',
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
