import type { ReactNode } from 'react';
import { ArrowRight, Info, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from 'react-router';
import { formatPercent } from '@effinance/shared';
import { cn } from '@/lib/utils';
import { Tooltip } from './tooltip';

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
  /** Dashboard strip: 12px label, 22px value, tighter padding. */
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
  const hasChange = change !== undefined;
  const up = (change ?? 0) >= 0;
  // Colour says good or bad (an expense rise is bad); no change stays grey.
  const flat = change === 0 || (change !== null && change !== undefined && Math.abs(change) < 0.0005);
  const good = invert ? !up : up;
  const tone = flat ? 'text-muted' : good ? 'text-success' : 'text-danger';
  const Icon = up ? TrendingUp : TrendingDown;
  const changeText =
    change === null || change === undefined
      ? ''
      : changeUnit === 'pp'
        ? `${up ? '+' : '−'}${Math.abs(change * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`
        : `${up ? '+' : ''}${formatPercent(change)}`;
  const footer = (
    <div className={cn('flex items-center justify-between gap-2 border-t border-border bg-surface-muted text-muted', compact ? 'px-3.5 py-2 text-caption' : 'px-4 py-2.5 text-xs')}>
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        {footerContent ? (
          footerContent
        ) : hasChange && change !== null ? (
          <>
            {flat ? null : <Icon className={cn('size-3.5', tone)} aria-hidden />}
            <span className={cn('tabular font-semibold', tone)}>{changeText}</span>
            {footerLabel}
          </>
        ) : (
          <span>Sem base de comparação</span>
        )}
      </span>
      {href ? <ArrowRight className="size-3.5 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden /> : null}
    </div>
  );
  const body = (
    <>
      <div className={compact ? 'px-3.5 pt-3 pb-2.5' : 'px-4 pt-4 pb-3.5'}>
        <div className={cn('flex items-center gap-1.5 font-medium text-muted', compact ? 'text-[12px]' : 'text-[13px]')}>
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
        {/* Numbers sit on the right edge of the card (label stays on the left). */}
        <div className={cn('tabular flex justify-end text-right leading-tight font-semibold tracking-tight text-fg', compact ? 'mt-1 truncate text-kpi' : 'mt-1.5 text-[26px]', valueClassName)}>
          {value}
        </div>
        {children}
      </div>
      {footer}
    </>
  );
  const classes = cn(
    'group flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-surface transition-colors',
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
