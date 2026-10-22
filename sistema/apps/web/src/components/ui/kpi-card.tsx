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
  /** Relative change vs. previous period (0.1 = +10%). */
  change?: number | null;
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
}

export function KpiCard({
  label,
  value,
  info,
  change,
  invert,
  footerLabel = 'vs mês anterior',
  href,
  className,
  valueClassName,
  footerContent,
  icon,
  compact = false,
}: KpiCardProps) {
  const hasChange = change !== undefined;
  const up = (change ?? 0) >= 0;
  const good = invert ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  const footer = (
    <div className={cn('flex items-center justify-between gap-2 border-t border-border bg-surface-muted text-muted', compact ? 'px-3.5 py-2 text-caption' : 'px-4 py-2.5 text-xs')}>
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        {footerContent ? (
          footerContent
        ) : hasChange && change !== null ? (
          <>
            <Icon className={cn('size-3.5', good ? 'text-success' : 'text-danger')} aria-hidden />
            <span className={cn('font-semibold', good ? 'text-success' : 'text-danger')}>
              {up ? '+' : ''}
              {formatPercent(change)}
            </span>
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
          {icon ? <span className="flex shrink-0 [&_svg]:size-4">{icon}</span> : null}
          {label}
          {info ? (
            <Tooltip content={info}>
              <span className="text-subtle" aria-label={info}>
                <Info className="size-3.5" />
              </span>
            </Tooltip>
          ) : null}
        </div>
        <div className={cn('tabular leading-tight font-semibold tracking-tight text-fg', compact ? 'mt-1 truncate text-kpi' : 'mt-1.5 text-[26px]', valueClassName)}>
          {value}
        </div>
      </div>
      {footer}
    </>
  );
  const classes = cn(
    'group flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-surface shadow-xs transition-shadow',
    href && 'hover:shadow-sm',
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
