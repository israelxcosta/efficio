import { Check } from 'lucide-react';
import { formatBRL, formatMonthKey } from '@effinance/shared';
import { Card, CardHeader } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Tooltip } from '@/components/ui/tooltip';
import { cn, pluralize } from '@/lib/utils';
import { formatDays } from '../delinquency-view';
import { paymentBuckets, paymentMap, yearSummaries, type ClientAnalysis, type PaymentMapCell, type ReceivableStatus } from './client-report';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** One hue for "paid on time"; amber and red only where the client was or is late. */
const CELL: Record<ReceivableStatus | 'none', string> = {
  em_dia: 'bg-data-soft text-data',
  atrasado: 'bg-warning-soft text-warning',
  vencido: 'bg-danger-soft text-danger',
  aberto: 'border border-dashed border-border-strong text-subtle',
  none: 'bg-bg-subtle',
};

const LEGEND: { key: keyof typeof CELL; label: string }[] = [
  { key: 'em_dia', label: 'Pago no prazo' },
  { key: 'atrasado', label: 'Pago com atraso' },
  { key: 'vencido', label: 'Vencido em aberto' },
  { key: 'aberto', label: 'A vencer' },
  { key: 'none', label: 'Sem cobrança' },
];

function cellText(c: PaymentMapCell): string {
  const month = formatMonthKey(c.month);
  if (!c.status) return `${month}: sem cobrança`;
  const what = `${pluralize(c.count, 'cobrança', 'cobranças')}, ${formatBRL(c.amount)}`;
  if (c.status === 'em_dia') return `${month}: ${what}, paga no prazo`;
  if (c.status === 'aberto') return `${month}: ${what}, a vencer`;
  if (c.status === 'vencido') return `${month}: ${what}, vencida há ${formatDays(c.daysLate)}`;
  return `${month}: ${what}, paga com ${formatDays(c.daysLate)} de atraso`;
}

/** Year × month grid of how each due month was paid, like a credit report's payment history. */
export function PaymentMapCard({ analysis: a, className }: { analysis: ClientAnalysis; className?: string }) {
  const years = paymentMap(a.receivables);
  return (
    <Card className={cn('flex flex-col p-5 print:break-inside-avoid', className)}>
      <CardHeader
        title="Mapa de pagamentos"
        subtitle="Cada mês de vencimento, do mais recente ao primeiro"
        info="Quando o mês tem mais de uma cobrança (honorário e empregados), vale a pior situação. O número é o maior atraso do mês, em dias."
      />
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {LEGEND.map((l) => (
          <li key={l.key} className="flex items-center gap-1.5 text-caption text-muted">
            <span className={cn('size-3 rounded-[4px]', CELL[l.key])} aria-hidden />
            {l.label}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-col gap-1.5">
        <div className="grid grid-cols-[2.5rem_repeat(12,minmax(0,1fr))] gap-1 text-center text-micro text-subtle" aria-hidden>
          <span />
          {MONTHS.map((m) => (
            <span key={m}>
              <span className="sm:hidden">{m[0]!.toUpperCase()}</span>
              <span className="hidden sm:inline">{m}</span>
            </span>
          ))}
        </div>
        {years.map((y) => (
          <div key={y.year} className="grid grid-cols-[2.5rem_repeat(12,minmax(0,1fr))] items-center gap-1">
            <span className="tabular text-caption font-medium text-muted">{y.year}</span>
            {y.cells.map((c) => (
              <Tooltip key={c.month} content={cellText(c)}>
                <span
                  tabIndex={c.status ? 0 : -1}
                  aria-label={cellText(c)}
                  className={cn(
                    'tabular flex h-8 items-center justify-center rounded-md text-micro font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/25',
                    CELL[c.status ?? 'none'],
                  )}
                >
                  {c.status === 'em_dia' ? <Check className="size-3.5" aria-hidden /> : null}
                  {(c.status === 'atrasado' || c.status === 'vencido') && c.daysLate > 0 ? <span className="hidden sm:inline">{c.daysLate}d</span> : null}
                </span>
              </Tooltip>
            ))}
          </div>
        ))}
      </div>
      <YearTable analysis={a} />
    </Card>
  );
}

/** Year by year: punctuality, average days late, billed and received. */
function YearTable({ analysis: a }: { analysis: ClientAnalysis }) {
  const years = yearSummaries(a.receivables);
  return (
    <div className="mt-5 border-t border-border pt-4">
      <p className="text-caption font-medium text-muted">Ano a ano</p>
      <table className="mt-1 w-full text-body-sm">
        <thead>
          <tr className="text-left text-micro text-subtle">
            <th className="py-1.5 pr-2 font-medium">Ano</th>
            <th className="px-2 py-1.5 font-medium">No prazo</th>
            <th className="hidden px-2 py-1.5 font-medium sm:table-cell">Atraso médio</th>
            <th className="hidden px-2 py-1.5 text-right font-medium sm:table-cell">Faturado</th>
            <th className="py-1.5 pl-2 text-right font-medium">Recebido</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {years.map((y) => (
            <tr key={y.year} className="tabular">
              <td className="py-2 pr-2 font-medium text-fg">{y.year}</td>
              <td className="px-2 py-2 whitespace-nowrap text-fg">
                {y.dueCount ? `${y.onTimeCount} de ${y.dueCount}` : '—'}
                {y.dueCount ? <span className="text-muted"> · {Math.round((y.onTimeCount / y.dueCount) * 100)}%</span> : null}
              </td>
              <td className="hidden px-2 py-2 text-muted sm:table-cell">{y.avgDaysLate === null ? 'sem atrasos' : formatDays(y.avgDaysLate)}</td>
              <td className="hidden px-2 py-2 text-right whitespace-nowrap text-muted sm:table-cell">{formatBRL(y.billed)}</td>
              <td className="py-2 pl-2 text-right font-semibold whitespace-nowrap text-fg">{formatBRL(y.received)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-caption text-muted">
        No total: {a.onTimeCount} no prazo · {a.paidLateCount} com atraso · {a.overdueCount} {a.overdueCount === 1 ? 'vencida' : 'vencidas'} · {a.openCount - a.overdueCount} a vencer
      </p>
    </div>
  );
}

/** Distribution of the payments by days after the due date. */
export function PaymentTimingCard({ analysis: a, className }: { analysis: ClientAnalysis; className?: string }) {
  const buckets = paymentBuckets(a.receivables);
  return (
    <Card className={cn('flex flex-col p-5 print:break-inside-avoid', className)}>
      <CardHeader title="Quando paga" subtitle={a.paidCount ? `Dias do vencimento ao pagamento, nas ${pluralize(a.paidCount, 'cobrança paga', 'cobranças pagas')}` : 'Nenhuma cobrança paga ainda'} />
      <ul className="mt-4 flex flex-col gap-3">
        {buckets.map((b, i) => (
          <li key={b.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-body-sm">
              <span className={cn('truncate', b.count ? 'text-fg' : 'text-subtle')}>{b.label}</span>
              <span className="tabular shrink-0 text-muted">
                <span className={cn('font-semibold', b.count ? 'text-fg' : 'text-subtle')}>{b.count}</span>
                {b.count ? ` · ${Math.round(b.share * 100)}%` : ''}
              </span>
            </div>
            {/* On time in the data hue; late in grey (the map already flags them in colour). */}
            <ProgressBar value={b.share} size="sm" color={i < 2 ? 'var(--app-data)' : 'var(--app-chart-expense)'} label={`${b.label}: ${b.count}`} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
