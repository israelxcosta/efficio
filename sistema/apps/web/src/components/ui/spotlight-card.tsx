import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';

export interface SpotlightRow {
  label: ReactNode;
  value: ReactNode;
  /** Red on the solid surface (overdue figures). */
  danger?: boolean;
  to?: string;
}

export interface SpotlightAction {
  label: string;
  to?: string;
  onClick?: () => void;
}

interface SpotlightCardProps {
  /** Small label at the top ("Atrasadas no escritório"). */
  label: ReactNode;
  /** Chip at the right of the label ("há 40 dias"); `badgeDanger` paints it in the soft red. */
  badge?: ReactNode;
  badgeDanger?: boolean;
  /** Big figure ("12", "R$ 6.530,00") or, without it, a title ("Retificar DCTFWeb"). */
  value?: ReactNode;
  title?: ReactNode;
  caption?: ReactNode;
  rows?: SpotlightRow[];
  /** Free content between the rule and the actions (a progress bar). */
  children?: ReactNode;
  action?: SpotlightAction;
  secondary?: SpotlightAction;
  loading?: boolean;
  className?: string;
}

/**
 * The solid (navy) card of a page: one per screen, at the top of the right column, for the figure that
 * asks for action now (overdue, due today, to check). When nothing is urgent the page passes the calm
 * message in the same place, so the layout does not jump.
 */
export function SpotlightCard({ label, badge, badgeDanger, value, title, caption, rows, children, action, secondary, loading, className }: SpotlightCardProps) {
  if (loading) {
    return (
      <section className={cn('rounded-xl bg-hero-from p-4', className)} aria-busy="true">
        <Skeleton className="h-3 w-32 bg-white/15" />
        <Skeleton className="mt-3 h-7 w-20 bg-white/15" />
        <Skeleton className="mt-2 h-3 w-40 bg-white/15" />
        <Skeleton className="mt-4 h-9 w-full bg-white/15" />
      </section>
    );
  }
  return (
    <section className={cn('flex flex-col rounded-xl bg-hero-from p-4 text-white', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-caption font-medium text-hero-accent">{label}</h2>
        {badge ? (
          <span
            className={cn(
              'tabular inline-flex h-5 shrink-0 items-center rounded-full px-2 text-micro font-semibold',
              badgeDanger ? 'bg-chart-red/20 text-on-solid-danger ring-1 ring-chart-red/45 ring-inset' : 'bg-white/12 text-white',
            )}
          >
            {badge}
          </span>
        ) : null}
      </div>
      {value !== undefined ? <p className="tabular mt-2 text-[28px] leading-[1.1] font-bold tracking-tight">{value}</p> : null}
      {title ? <p className="mt-2 text-[15px] leading-snug font-semibold">{title}</p> : null}
      {caption ? <p className="mt-1 line-clamp-2 text-mini text-hero-accent">{caption}</p> : null}
      {rows?.length || children ? <div className="my-3 h-px bg-white/14" aria-hidden /> : null}
      {children}
      {rows?.length ? (
        <dl className="flex flex-col">
          {rows.map((r, i) => {
            const inner = (
              <>
                <dt className="min-w-0 truncate text-hero-accent">{r.label}</dt>
                <dd className={cn('tabular shrink-0 font-semibold', r.danger ? 'text-on-solid-danger' : 'text-white')}>{r.value}</dd>
              </>
            );
            const cls = 'flex items-baseline justify-between gap-3 py-0.5 text-mini';
            return r.to ? (
              <Link key={i} to={r.to} className={cn(cls, 'rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-white')}>
                {inner}
              </Link>
            ) : (
              <div key={i} className={cls}>
                {inner}
              </div>
            );
          })}
        </dl>
      ) : null}
      {action || secondary ? (
        <div className="mt-3 flex gap-2">
          {action ? <SolidButton action={action} primary /> : null}
          {secondary ? <SolidButton action={secondary} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function SolidButton({ action, primary }: { action: SpotlightAction; primary?: boolean }) {
  const cls = cn(
    'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-caption font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
    primary ? 'flex-1 bg-white text-hero-from hover:bg-white/90' : 'text-white ring-1 ring-white/30 ring-inset hover:bg-white/10',
  );
  const content = (
    <>
      {action.label}
      {primary ? <ArrowRight className="size-4" aria-hidden /> : null}
    </>
  );
  if (action.to) {
    return (
      <Link to={action.to} className={cls}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={cls}>
      {content}
    </button>
  );
}
