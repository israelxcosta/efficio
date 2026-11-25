import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from 'radix-ui';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const VARIANTS = {
  primary:
    'bg-primary text-primary-fg shadow-xs hover:bg-primary-hover disabled:bg-primary/50',
  soft: 'bg-primary-soft text-primary-soft-fg hover:bg-brand-200/70',
  outline:
    'border border-border bg-surface text-fg shadow-xs hover:border-border-strong hover:bg-surface-muted',
  ghost: 'text-muted hover:bg-bg-subtle hover:text-fg',
  danger: 'bg-danger text-white shadow-xs hover:brightness-95',
  'danger-soft': 'bg-danger-soft text-danger hover:brightness-95',
  success: 'bg-success text-white shadow-xs hover:brightness-95',
  link: 'text-brand-text underline-offset-4 hover:underline px-0 h-auto active:scale-100',
} as const;

const SIZES = {
  xs: 'h-7 gap-1 rounded-sm px-2 text-mini',
  sm: 'h-8 gap-1.5 rounded-[10px] px-3 text-caption',
  /** Filter and tool bars: the 36px of `Select size_="sm"`, so one bar has one height. */
  toolbar: 'h-9 gap-1.5 rounded-[10px] px-3 text-caption',
  md: 'h-10 gap-2 rounded-md px-4 text-body-sm',
  lg: 'h-11 gap-2 rounded-md px-5 text-[15px]',
  icon: 'size-10 rounded-md',
  'icon-sm': 'size-8 rounded-[10px]',
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  loading?: boolean;
  asChild?: boolean;
}

/** Press feedback: every variant (except the inline link) scales to .97 over --dur-press. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, disabled, asChild, children, type, ...props },
  ref,
) {
  const classes = cn(
    'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-semibold transition-[background-color,border-color,color,box-shadow,scale] duration-(--dur-press) ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
  if (asChild) {
    return (
      <Slot.Root ref={ref} className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button ref={ref} type={type ?? 'button'} className={classes} disabled={disabled || loading} {...props}>
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});

/**
 * Extends a small icon button (32px) to a 44px touch target without changing how it looks: an invisible
 * ::after reaches 6px past each side. Use on arrows and other icon-only controls people tap on phones.
 */
export const HIT_44 = "relative after:absolute after:-inset-1.5 after:content-['']";
