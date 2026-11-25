import type { ReactNode } from 'react';
import { ArrowRight, Info, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from 'react-router';
import { changeParts } from '@/features/dashboard/kpi-logic';
import { cn, displayFigure } from '@/lib/utils';
import { Tooltip } from './tooltip';

const CHANGE_TONE = { success: 'text-success', danger: 'text-danger', muted: 'text-muted' } as const;

interface KpiCardProps {
  label: string;
  value: ReactNode;
  info?: string;
  /** Change vs. previous period: relative (0.1 = +10%) or, with `changeUnit="pp"`, a difference of rates (0.046 = +4,6 p.p.). */
  change?: number | null;
  changeUnit?: 'percent' | 'pp';
  /** When true, an increase is bad (e.g. expenses) and is painted red. */
  invert?: boolean;
  footerLabel?: string;
  href?: string;
  className?: string;
  valueClassName?: string;
  /** Replaces the default trend footer content. */
  footerContent?: ReactNode;
  /** Small icon before the label (dashboard strip). */
  icon?: ReactNode;
  /** Dense grids: 12px label and tighter padding (the value is always `text-kpi`, 24px). */
  compact?: boolean;
  /** Extra content under the value (full width, left-aligned), e.g. a breakdown band. */
  children?: ReactNode;
}

export function KpiCard({
  label,
  value,
  info,
  change,
  changeUnit = 'percent',
  invert,
  footerLabel = 'vs mês anterior',
  href,
  className,
  valueClassName,
  footerContent,
  icon,
  compact = false,
  children,
}: KpiCardProps) {
  // Colour says good or bad (an expense rise is bad); no change stays grey.
  const parts = changeParts(change, changeUnit, invert);
  const tone = parts ? CHANGE_TONE[parts.tone] : 'text-muted';
  const Icon = parts?.up === false ? TrendingDown : TrendingUp;
  // The comparison is a line of text under the value (as in `MetricStrip`), not a grey band.
  const footer = (
    <div className={cn('flex items-center justify-between gap-2 text-caption text-muted', compact ? 'mt-2' : 'mt-2.5')}>
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        {footerContent ? (
          footerContent
        ) : parts ? (
          <>
            {parts.tone === 'muted' ? null : <Icon className={cn('size-3.5', tone)} aria-hidden />}
            <span className={cn('tabular font-semibold', tone)}>{parts.text}</span>
            {footerLabel}
          </>
        ) : (
          <span>Sem base de comparação</span>
        )}
      </span>
      {href ? <ArrowRight className="size-3.5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden /> : null}
    </div>
  );
  const body = (
    <div className={cn('flex flex-1 flex-col', compact ? 'px-4 py-3.5' : 'px-5 py-4')}>
      <div className={cn('flex items-center gap-1.5 font-medium text-muted', compact ? 'text-mini' : 'text-caption')}>
        {icon ? <span className="flex shrink-0 text-subtle [&_svg]:size-4">{icon}</span> : null}
        {label}
        {info ? (
          <Tooltip content={info}>
            <span className="text-subtle" aria-label={info}>
              <Info className="size-3.5" />
            </span>
          </Tooltip>
        ) : null}
      </div>
      {/* Label over the value, both on the left (app-screens §5, same as MetricStrip). */}
      <div className={cn('tabular mt-1.5 text-kpi font-semibold tracking-tight text-fg', compact && 'truncate', valueClassName)}>{displayFigure(value)}</div>
      {children}
      <div className="mt-auto">{footer}</div>
    </div>
  );
  const classes = cn(
    'group flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-colors',
    href && 'hover:border-border-strong',
    className,
  );
  return href ? (
    <Link to={href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
