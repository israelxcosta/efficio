import type { HTMLAttributes, ReactNode } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { formatBRL } from '@effinance/shared';
import { cn, displayFigure } from '@/lib/utils';
import { errorMessage } from '@/lib/api';
import { Button } from './button';
import { HelpTip } from './help-tip';

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn('flex flex-col items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft/50 p-5', className)} role="alert">
      <div className="flex items-center gap-2 text-sm font-semibold text-danger">
        <TriangleAlert className="size-4" /> Não consegui carregar agora
      </div>
      <p className="text-sm text-muted">{errorMessage(error)}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw /> Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Explanation of a rule, behind a "?" next to the title. */
  info?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Classes of the actions row (e.g. full width on phones). */
  actionsClassName?: string;
}

/**
 * Page title (h1) with one plain line about the data under it; no label above the title. Top-aligned, so
 * the title sits at the same height on every page whatever the size of the actions beside it.
 */
export function PageHeader({ title, description, info, actions, className, actionsClassName }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {info ? (
          <div className="flex items-center gap-1.5">
            <h1 className="text-[22px] font-semibold tracking-tight text-fg">{title}</h1>
            <HelpTip label="Mais informações" side="bottom">{info}</HelpTip>
          </div>
        ) : (
          <h1 className="text-[22px] font-semibold tracking-tight text-fg">{title}</h1>
        )}
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className={cn('flex flex-wrap items-center gap-2', actionsClassName)}>{actions}</div> : null}
    </div>
  );
}

interface MoneyProps {
  value: number;
  /** Paint by sign: positive green, negative red. */
  signed?: boolean;
  /** Force a tone. */
  tone?: 'income' | 'expense' | 'neutral' | 'muted';
  showPlus?: boolean;
  className?: string;
}

export function Money({ value, signed, tone, showPlus, className }: MoneyProps) {
  const resolved = tone ?? (signed ? (value > 0 ? 'income' : value < 0 ? 'expense' : 'muted') : 'neutral');
  return (
    <span
      className={cn(
        'tabular font-semibold whitespace-nowrap',
        resolved === 'income' && 'text-success',
        resolved === 'expense' && 'text-danger',
        resolved === 'muted' && 'text-muted',
        className,
      )}
    >
      {showPlus && value > 0 ? '+' : ''}
      {displayFigure(formatBRL(value))}
    </span>
  );
}

export function StatPill({ label, value, tone = 'neutral', className }: { label: ReactNode; value: ReactNode; tone?: 'success' | 'danger' | 'neutral' | 'brand' | 'warning'; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-md px-3 py-1.5 text-[13px]',
        tone === 'success' && 'bg-success-soft text-success',
        tone === 'danger' && 'bg-danger-soft text-danger',
        tone === 'neutral' && 'bg-bg-subtle text-muted',
        tone === 'brand' && 'bg-primary-soft text-primary-soft-fg',
        tone === 'warning' && 'bg-warning-soft text-warning',
        className,
      )}
    >
      <span className="font-medium">{label}</span>
      <span className="tabular font-semibold">{value}</span>
    </div>
  );
}

interface MiniStatProps {
  label: string;
  value: ReactNode;
  /** Only `danger`/`warning` paint the figure, and only when it flags a problem (see `amount`). */
  tone?: 'success' | 'danger' | 'warning' | 'brand';
  /**
   * Raw number behind `value`. When given, zero renders in `text-subtle` (zero is grey) and the
   * `danger`/`warning` tone is dropped: "Vencido R$ 0,00" is not a problem.
   */
  amount?: number | null;
  hint?: ReactNode;
  info?: ReactNode;
  className?: string;
  /**
   * The solid (navy) cell of the strip, for the one figure that asks for action now ("Vencido" > 0):
   * the "Seu dia" spotlight inside a strip. With `onClick` the cell is a button (filters the list).
   */
  solid?: boolean;
  onClick?: () => void;
  action?: string;
}

/**
 * The KPI group of a page (one pattern with `MetricStrip`, app-screens §5): a single bordered
 * container whose `MiniStat` cells are split by 1px dividers. Pass the grid columns in `className`
 * (e.g. `grid-cols-2 lg:grid-cols-4`); phones keep 2 columns. Fill every row (an odd last cell takes
 * `col-span-2`), or the divider colour shows in the gap.
 */
export function MiniStatGroup({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border', className)} {...props}>
      {children}
    </div>
  );
}

/** A cell of `MiniStatGroup`: label over the value (18px on phones, 24px `text-kpi` from `sm`), left-aligned. */
export function MiniStat({ label, value, tone, amount, hint, info, className, solid, onClick, action }: MiniStatProps) {
  const isZero = amount === 0;
  const alert = isZero ? undefined : tone;
  if (solid && !isZero) {
    const body = (
      <>
        <span className="flex min-w-0 items-center justify-between gap-2">
          <span className="truncate text-caption font-medium text-hero-accent">{label}</span>
          {action ? <span className="shrink-0 text-caption font-semibold text-white underline decoration-white/40 underline-offset-2">{action}</span> : null}
        </span>
        <span className="tabular mt-1 block text-lg leading-tight font-semibold tracking-tight text-white sm:mt-1.5 sm:text-kpi">{displayFigure(value)}</span>
        {hint ? <span className={cn('mt-1 block text-caption', tone === 'danger' ? 'text-on-solid-danger' : 'text-hero-accent')}>{hint}</span> : null}
      </>
    );
    const cls = cn('min-w-0 bg-hero-from px-4 py-3 text-left sm:px-5 sm:py-4', className);
    return onClick ? (
      <button type="button" onClick={onClick} className={cn(cls, 'transition-colors hover:bg-hero-from/92 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white')}>
        {body}
      </button>
    ) : (
      <div className={cls}>{body}</div>
    );
  }
  return (
    <div className={cn('min-w-0 bg-surface px-4 py-3 sm:px-5 sm:py-4', className)}>
      <div className="flex min-w-0 items-center gap-1">
        <p className="truncate text-caption font-medium text-muted">{label}</p>
        {info ? <HelpTip label={`Sobre ${label.toLowerCase()}`}>{info}</HelpTip> : null}
      </div>
      {/* Figures stay in ink; colour only flags a problem (a negative result, an overdue total > 0). Zero is grey. */}
      <p
        className={cn(
          'tabular mt-1 text-lg leading-tight font-semibold tracking-tight sm:mt-1.5 sm:text-kpi',
          isZero ? 'text-subtle' : 'text-fg',
          alert === 'danger' && 'text-danger',
          alert === 'warning' && 'text-warning',
        )}
      >
        {displayFigure(value)}
      </p>
      {hint ? <p className="mt-1 text-caption text-muted">{hint}</p> : null}
    </div>
  );
}
