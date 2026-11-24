import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Page body with the narrow right column (300px) of the "Seu dia" style.
 * - From 1280px (xl): content on the left, the spotlight (solid card) and the small cards on the right.
 * - Below: the spotlight comes first, then the content, then the small cards (they never push the
 *   page's main list away on a phone).
 */
export function PageWithAside({ spotlight, aside, children, className }: { spotlight?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-x-6 xl:gap-y-3.5', className)}>
      {spotlight ? <div className="min-w-0 xl:col-start-2 xl:row-start-1">{spotlight}</div> : null}
      <div className="flex min-w-0 flex-col gap-6 xl:col-start-1 xl:row-span-2 xl:row-start-1">{children}</div>
      {aside ? <aside className="grid min-w-0 gap-3.5 sm:grid-cols-2 xl:col-start-2 xl:row-start-2 xl:grid-cols-1">{aside}</aside> : null}
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
