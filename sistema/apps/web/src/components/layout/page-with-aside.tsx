import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const LAYOUT = {
  // From 1280px: content on the left, the spotlight and the small cards on the right.
  xl: {
    grid: 'xl:grid-cols-[minmax(0,1fr)_300px] xl:grid-rows-[auto_1fr] xl:gap-x-6 xl:gap-y-3.5',
    spot: 'xl:col-start-2 xl:row-start-1',
    main: 'xl:col-start-1 xl:row-span-2 xl:row-start-1',
    aside: 'sm:grid-cols-2 xl:col-start-2 xl:row-start-2 xl:grid-cols-1',
    hidden: 'hidden xl:block',
    hiddenGrid: 'hidden xl:grid',
  },
  // From 1536px only: pages whose main list needs the whole width on laptops (the task list).
  '2xl': {
    grid: '2xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-rows-[auto_1fr] 2xl:gap-x-6 2xl:gap-y-3.5',
    spot: '2xl:col-start-2 2xl:row-start-1',
    main: '2xl:col-start-1 2xl:row-span-2 2xl:row-start-1',
    aside: '2xl:col-start-2 2xl:row-start-2 2xl:grid-cols-1',
    hidden: 'hidden 2xl:block',
    hiddenGrid: 'hidden 2xl:grid',
  },
} as const;

/**
 * Page body with the narrow right column (300px) of the "Seu dia" style.
 * - From `from` (default 1280px): content on the left, the spotlight (solid card) and the small cards
 *   on the right.
 * - Below, `stack` (default): the spotlight first, then the content, then the small cards (they never
 *   push the page's main list away on a phone). `hide`: the column is not shown (the page already shows
 *   the same figures elsewhere and the list needs the width).
 */
export function PageWithAside({
  spotlight,
  aside,
  children,
  className,
  from = 'xl',
  below = 'stack',
}: {
  spotlight?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  from?: 'xl' | '2xl';
  below?: 'stack' | 'hide';
}) {
  const l = LAYOUT[from];
  const hide = below === 'hide';
  return (
    <div className={cn('grid items-start gap-6', l.grid, className)}>
      {spotlight ? <div className={cn('min-w-0', l.spot, hide && l.hidden)}>{spotlight}</div> : null}
      <div className={cn('flex min-w-0 flex-col gap-6', l.main)}>{children}</div>
      {aside ? <aside className={cn('grid min-w-0 gap-3.5', l.aside, hide && l.hiddenGrid)}>{aside}</aside> : null}
    </div>
  );
}

/** Small card of the right column: title, a muted figure at the right and the body. */
export function AsideCard({ title, meta, children, footer, className }: { title: ReactNode; meta?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded-xl border border-border bg-surface px-4 py-4', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="truncate text-body-sm font-semibold text-fg">{title}</h2>
        {meta ? <span className="tabular shrink-0 text-caption text-muted">{meta}</span> : null}
      </div>
      <div className="mt-2 min-w-0">{children}</div>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </section>
  );
}
