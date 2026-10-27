import { Fragment, useMemo, useState } from 'react';
import { ListX } from 'lucide-react';
import { diffInDays, formatBRL, formatDateBR, formatMonthKey, type ISODate } from '@effinance/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { cn, pluralize } from '@/lib/utils';
import { formatDays } from '../delinquency-view';
import type { ClientReceivable, ReceivableStatus } from './client-report';

type Filter = 'all' | 'em_dia' | 'late' | 'open';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'em_dia', label: 'No prazo' },
  { value: 'late', label: 'Com atraso' },
  { value: 'open', label: 'Em aberto' },
];

const matches: Record<Filter, (r: ClientReceivable) => boolean> = {
  all: () => true,
  em_dia: (r) => r.status === 'em_dia',
  late: (r) => r.status === 'atrasado' || r.status === 'vencido',
  open: (r) => r.paidAt === null,
};

export const STATUS: Record<ReceivableStatus, { label: string; tone: BadgeProps['tone'] }> = {
  em_dia: { label: 'Pago no prazo', tone: 'success' },
  atrasado: { label: 'Pago com atraso', tone: 'warning' },
  vencido: { label: 'Vencido', tone: 'danger' },
  aberto: { label: 'A vencer', tone: 'neutral' },
};

/** "15 dias de atraso", "2 dias antes", "vencido há 17 dias", "vence em 5 dias", "no vencimento". */
export function timingText(r: ClientReceivable, today: ISODate): string {
  if (r.status === 'vencido') return `vencido há ${formatDays(r.daysLate)}`;
  if (r.status === 'aberto') {
    const days = diffInDays(r.dueDate, today);
    return days === 0 ? 'vence hoje' : `vence em ${formatDays(days)}`;
  }
  if (r.daysLate > 0) return `${formatDays(r.daysLate)} de atraso`;
  if (r.daysEarly > 0) return `${formatDays(r.daysEarly)} antes`;
  return 'no vencimento';
}

const describe = (r: ClientReceivable) =>
  [r.kind === 'employees' ? 'Empregados' : r.kind === 'fee' ? 'Honorário' : null, r.competence ? `competência ${formatMonthKey(r.competence, 'short')}` : null]
    .filter(Boolean)
    .join(' · ');

/** Every receivable of the client, year by year with the year's totals, filterable by situation. */
export function HistoryTable({ receivables, today }: { receivables: ClientReceivable[]; today: ISODate }) {
  const [filter, setFilter] = useState<Filter>('all');
  const years = useMemo(() => {
    const groups = new Map<string, ClientReceivable[]>();
    for (const r of receivables.filter(matches[filter])) {
      const year = r.dueDate.slice(0, 4);
      groups.set(year, [...(groups.get(year) ?? []), r]);
    }
    return [...groups.entries()].map(([year, items]) => ({
      year,
      items,
      billed: items.reduce((a, r) => a + r.amount, 0),
      received: items.reduce((a, r) => a + r.received, 0),
      late: items.filter((r) => r.status === 'atrasado' || r.status === 'vencido').length,
    }));
  }, [receivables, filter]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between">
        <CardHeader title="Histórico de cobranças" subtitle={`${pluralize(receivables.length, 'cobrança', 'cobranças')}, do vencimento mais recente ao primeiro`} />
        <SegmentedControl<Filter> size="sm" ariaLabel="Filtrar cobranças" value={filter} onChange={setFilter} options={FILTERS} className="shrink-0 self-start print:hidden" />
      </div>

      {years.length === 0 ? (
        <EmptyState compact className="m-5" icon={<ListX />} title="Nenhuma cobrança nesta situação" />
      ) : (
        <>
          {/* Phones and tablets: one block per receivable. */}
          <div className="lg:hidden print:hidden">
            {years.map((y) => (
              <section key={y.year}>
                <YearHeader {...y} className="px-4" />
                <ul className="divide-y divide-border">
                  {y.items.map((r) => (
                    <li key={r.id} className="flex flex-col gap-2 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-body-sm font-medium text-fg" title={r.description}>
                            {r.description}
                          </p>
                          <p className="text-caption text-muted">{describe(r) || 'Recebimento avulso'}</p>
                        </div>
                        <span className="tabular shrink-0 text-body-sm font-semibold text-fg">{formatBRL(r.amount)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted">
                        <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                        <span className="tabular">Venc. {formatDateBR(r.dueDate)}</span>
                        {r.paidAt ? <span className="tabular">Pago {formatDateBR(r.paidAt)}</span> : null}
                        <span className={cn(r.daysLate > 0 && 'text-fg')}>{timingText(r, today)}</span>
                      </div>
                      {r.interest + r.fine > 0 || r.discount > 0 || r.paidAt ? (
                        <p className="tabular text-caption text-muted">
                          {r.interest + r.fine > 0 ? `Juros e multa ${formatBRL(r.interest + r.fine)} · ` : ''}
                          {r.discount > 0 ? `Desconto ${formatBRL(r.discount)} · ` : ''}
                          {r.paidAt ? (
                            <>
                              Recebido <span className="font-semibold text-fg">{formatBRL(r.received)}</span>
                            </>
                          ) : null}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {/* Desktop and print: the full table. */}
          <div className="hidden lg:block print:block">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="py-2.5 pr-3 pl-5">Vencimento</th>
                  <th className="px-3 py-2.5">Descrição</th>
                  <th className="px-3 py-2.5 text-right">Valor</th>
                  <th className="px-3 py-2.5">Pagamento</th>
                  <th className="px-3 py-2.5">Prazo</th>
                  <th className="px-3 py-2.5 text-right">Juros e multa</th>
                  <th className="px-3 py-2.5 text-right">Desconto</th>
                  <th className="px-3 py-2.5 text-right">Recebido</th>
                  <th className="py-2.5 pr-5 pl-3">Situação</th>
                </tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <Fragment key={y.year}>
                    <tr className="border-b border-border bg-surface-muted/60">
                      <td colSpan={9} className="p-0">
                        <YearHeader {...y} className="px-5" />
                      </td>
                    </tr>
                    {y.items.map((r) => (
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-muted/60 print:break-inside-avoid">
                        <td className="tabular py-2.5 pr-3 pl-5 whitespace-nowrap text-fg">{formatDateBR(r.dueDate)}</td>
                        <td className="max-w-[320px] px-3 py-2.5">
                          <span className="block truncate text-fg" title={r.description}>
                            {r.description}
                          </span>
                          {describe(r) ? <span className="block text-micro text-muted">{describe(r)}</span> : null}
                        </td>
                        <td className="tabular px-3 py-2.5 text-right font-medium whitespace-nowrap text-fg">{formatBRL(r.amount)}</td>
                        <td className="tabular px-3 py-2.5 whitespace-nowrap text-muted">{r.paidAt ? formatDateBR(r.paidAt) : '—'}</td>
                        <td className={cn('px-3 py-2.5 whitespace-nowrap', r.daysLate > 0 ? 'font-medium text-fg' : 'text-muted')}>{timingText(r, today)}</td>
                        <td className="tabular px-3 py-2.5 text-right whitespace-nowrap text-muted">{r.interest + r.fine > 0 ? formatBRL(r.interest + r.fine) : '—'}</td>
                        <td className="tabular px-3 py-2.5 text-right whitespace-nowrap text-muted">{r.discount > 0 ? `− ${formatBRL(r.discount)}` : '—'}</td>
                        <td className="tabular px-3 py-2.5 text-right font-semibold whitespace-nowrap text-fg">{r.paidAt ? formatBRL(r.received) : '—'}</td>
                        <td className="py-2.5 pr-5 pl-3">
                          <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

function YearHeader({ year, items, billed, received, late, className }: { year: string; items: ClientReceivable[]; billed: number; received: number; late: number; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 bg-surface-muted/60 py-2', className)}>
      <span className="tabular text-body-sm font-semibold text-fg">{year}</span>
      <span className="tabular text-caption text-muted">
        {pluralize(items.length, 'cobrança', 'cobranças')} · faturado <span className="whitespace-nowrap">{formatBRL(billed)}</span> · recebido{' '}
        <span className="whitespace-nowrap">{formatBRL(received)}</span>
        {late ? ` · ${late} com atraso` : ''}
      </span>
    </div>
  );
}
