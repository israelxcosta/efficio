import type { ReactNode } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { formatBRL } from '@effinance/shared';
import { cn } from '@/lib/utils';
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

/** Page title (h1) with one plain line about the data under it; no label above the title. */
export function PageHeader({ title, description, info, actions, className, actionsClassName }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
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
      {formatBRL(value)}
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
}

export function MiniStat({ label, value, tone, amount, hint, info, className }: MiniStatProps) {
  const isZero = amount === 0;
  const alert = isZero ? undefined : tone;
  return (
    <div className={cn('rounded-lg border border-border bg-surface px-4 py-3', className)}>
      {info ? (
        <div className="flex items-center gap-1">
          <p className="text-xs font-medium text-muted">{label}</p>
          <HelpTip label={`Sobre ${label.toLowerCase()}`}>{info}</HelpTip>
        </div>
      ) : (
        <p className="text-xs font-medium text-muted">{label}</p>
      )}
      {/* Figures stay in ink; colour only flags a problem (a negative result, an overdue total > 0). Zero is grey. */}
      <p
        className={cn(
          'tabular mt-1 text-lg font-semibold tracking-tight',
          isZero ? 'text-subtle' : 'text-fg',
          alert === 'danger' && 'text-danger',
          alert === 'warning' && 'text-warning',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}
