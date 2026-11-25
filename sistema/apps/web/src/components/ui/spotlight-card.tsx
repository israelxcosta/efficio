import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';

interface SpotlightCardProps {
  /** Small label at the top ("Atrasadas no escritório"). */
  label: ReactNode;
  /** Chip at the right of the label ("há 40 dias"). */
  badge?: ReactNode;
  /** Big figure ("34", "R$ 13.130,00") or, without it, a short title ("Nada atrasado"). */
  value?: ReactNode;
  title?: ReactNode;
  /** One or two short lines under the figure (plain text: the whole card is the link). */
  caption?: ReactNode;
  /** The card opens this page… */
  to?: string;
  /** …or runs this (opening a task). */
  onClick?: () => void;
  loading?: boolean;
  className?: string;
}

/**
 * The solid (navy) card of a page: one per screen, on the first row beside the number strip and as tall
 * as it, for the figure that asks for action now (overdue, delinquency). The whole card is the action.
 * When nothing is urgent the page passes the calm message in the same place, so the layout does not jump.
 */
export function SpotlightCard({ label, badge, value, title, caption, to, onClick, loading, className }: SpotlightCardProps) {
  const base = cn('flex h-full min-h-[104px] min-w-0 flex-col rounded-xl bg-hero-from p-4 text-left text-white', className);
  if (loading) {
    return (
      <section className={base} aria-busy="true">
        <Skeleton className="h-3 w-32 bg-white/15" />
        <Skeleton className="mt-3 h-7 w-20 bg-white/15" />
        <Skeleton className="mt-2 h-3 w-40 bg-white/15" />
      </section>
    );
  }
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-caption font-medium text-hero-accent">{label}</span>
        {badge ? <span className="tabular inline-flex h-5 shrink-0 items-center rounded-full bg-white/12 px-2 text-micro font-semibold text-white">{badge}</span> : null}
      </span>
      <span className="mt-1.5 flex items-end justify-between gap-2">
        {value !== undefined ? (
          <span className="tabular text-display font-semibold tracking-tight">{value}</span>
        ) : (
          <span className="text-title-sm font-semibold">{title}</span>
        )}
        {to || onClick ? <ChevronRight className="mb-1 size-4 shrink-0 text-hero-accent transition-transform group-hover/spot:translate-x-0.5" aria-hidden /> : null}
      </span>
      {caption ? <span className="mt-1 line-clamp-2 text-caption text-pretty text-hero-accent" title={typeof caption === 'string' ? caption : undefined}>{caption}</span> : null}
    </>
  );
  const interactive = cn(base, 'group/spot transition-colors hover:bg-hero-from/92 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary');
  if (to) {
    return (
      <Link to={to} className={interactive}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={interactive}>
        {body}
      </button>
    );
  }
  return <section className={base}>{body}</section>;
}

/** First row of a dashboard: the number strip and, beside it (stacked below 1280px), the solid card. */
export function SpotlightRow({ spotlight, children, className }: { spotlight: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_17.5rem]', className)}>
      <div className="min-w-0">{children}</div>
      {spotlight}
    </div>
  );
}
