import { useMemo, useState } from 'react';
import { AlarmClock, CalendarX2, Coins, Percent, TrendingDown, TrendingUp } from 'lucide-react';
import { addMonths, formatBRL, formatPercent, SCORE_WINDOW_MONTHS, startOfMonth, type DelinquencyClient, type DelinquencyReportResponse } from '@effinance/shared';
import { KpiCard } from '@/components/ui/kpi-card';
import { ErrorState } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, pluralize } from '@/lib/utils';
import { useDelinquencyReport } from '../api';
import { collectionName } from '../delinquency-message';
import { formatDays, lateTrend } from '../delinquency-view';
import { CollectionMessageDialog } from './collection-message-dialog';
import { DelinquencyChart } from './delinquency-chart';
import { DelinquencyClients, DelinquencyClientsEmpty } from './delinquency-clients';
import { PortfolioRiskCardView } from './delinquency-gauges';
import { useReportMonths } from './report-months';

const wholePercent = (ratio: number) => `${Math.round(ratio * 100)}%`;

/**
 * "Inadimplência": how clients pay their fees (late share, days late, interest/fines), how each month
 * was paid, the portfolio by risk and the score of each client (12 months, with the rework).
 */
export function DelinquencyTab() {
  const [months] = useReportMonths();
  const report = useDelinquencyReport(months);
  const [messageFor, setMessageFor] = useState<DelinquencyClient | null>(null);
  const r = report.data;

  if (report.isError) return <ErrorState error={report.error} onRetry={() => report.refetch()} />;

  return (
    <div className={cn('@container flex flex-col gap-4 transition-opacity', report.isPlaceholderData && 'opacity-70')} aria-busy={!r}>
      <DelinquencyKpis r={r} />
      {!r ? (
        <>
          <div className="grid gap-4 xl:grid-cols-5">
            <Skeleton className="h-[360px] rounded-xl xl:col-span-2" />
            <Skeleton className="h-[360px] rounded-xl xl:col-span-3" />
          </div>
          <Skeleton className="h-96 rounded-xl" />
        </>
      ) : r.clients.length === 0 ? (
        <DelinquencyClientsEmpty />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-5">
            <PortfolioRiskCardView
              className="xl:col-span-2"
              clients={r.clients}
              probability={r.summary.probability}
              from={addMonths(startOfMonth(r.to), -(SCORE_WINDOW_MONTHS - 1))}
              to={r.to}
            />
            <div className="min-w-0 xl:col-span-3">
              <DelinquencyChart monthly={r.monthly} clients={r.clients} lateRate={r.summary.lateRate} />
            </div>
          </div>
          <DelinquencyClients clients={r.clients} months={months} onMessage={setMessageFor} />
        </>
      )}
      <CollectionMessageDialog client={messageFor} onClose={() => setMessageFor(null)} />
    </div>
  );
}

function DelinquencyKpis({ r }: { r: DelinquencyReportResponse | undefined }) {
  const s = r?.summary;
  const loading = <Skeleton className="h-7 w-28" />;
  const worst = useMemo(() => r?.clients.reduce<DelinquencyClient | null>((w, c) => (c.maxDaysLate > (w?.maxDaysLate ?? 0) ? c : w), null) ?? null, [r]);
  const trend = useMemo(() => (r ? lateTrend(r.monthly) : null), [r]);
  const fees = s ? s.interestTotal + s.fineTotal : 0;
  const worse = trend ? Math.round(trend.recent * 100) > Math.round(trend.previous * 100) : false;
  const better = trend ? Math.round(trend.recent * 100) < Math.round(trend.previous * 100) : false;
  const TrendIcon = better ? TrendingDown : TrendingUp;
  return (
    <div className="grid grid-cols-1 gap-3 @[420px]:grid-cols-2 @[1000px]:grid-cols-4">
      <KpiCard
        compact
        icon={<CalendarX2 className="text-danger" />}
        label="Em atraso agora"
        info="Mensalidades vencidas e ainda não recebidas, de qualquer data"
        value={s ? formatBRL(s.openAmount) : loading}
        valueClassName={cn(s && s.openAmount > 0 && 'text-danger')}
        footerContent={<span className="truncate">{s ? `${pluralize(s.openCount, 'título', 'títulos')} · ${pluralize(s.openClients, 'cliente', 'clientes')}` : '—'}</span>}
        href="/contas-a-receber?status=overdue&modo=year"
      />
      <KpiCard
        compact
        icon={<Percent className="text-warning" />}
        label="Taxa de atraso"
        info="Parte das mensalidades vencidas no período que foram pagas depois do vencimento ou seguem em aberto. No rodapé, os últimos 3 meses completos contra os 3 anteriores."
        value={s ? formatPercent(s.lateRate) : loading}
        footerContent={
          !s ? (
            '—'
          ) : trend ? (
            <span className="flex min-w-0 items-center gap-1 truncate">
              <span className={cn('inline-flex shrink-0 items-center gap-1 font-semibold', worse ? 'text-danger' : better ? 'text-success' : 'text-fg')}>
                {worse || better ? <TrendIcon className="size-3.5" aria-hidden /> : null}
                {wholePercent(trend.recent)}
              </span>
              <span className="truncate">{`nos últimos 3 meses (eram ${wholePercent(trend.previous)})`}</span>
            </span>
          ) : (
            <span className="truncate">{`${s.lateCount} de ${s.dueCount} mensalidades com atraso`}</span>
          )
        }
      />
      <KpiCard
        compact
        icon={<AlarmClock className="text-aging-2" />}
        label="Média de dias de atraso"
        info="Média de dias entre o vencimento e o pagamento das mensalidades atrasadas; as em aberto contam até hoje"
        value={s ? (s.avgDaysLate === null ? 'sem atrasos' : formatDays(s.avgDaysLate)) : loading}
        footerContent={
          <span className="truncate">{worst ? `maior atraso: ${formatDays(worst.maxDaysLate)} · ${collectionName(worst)}` : s ? 'nenhum atraso no período' : '—'}</span>
        }
      />
      <KpiCard
        compact
        icon={<Coins className="text-success" />}
        label="Juros e multas recebidos"
        info="Juros e multas registrados ao confirmar recebimentos em atraso de mensalidades do período"
        value={s ? formatBRL(fees) : loading}
        valueClassName={cn(fees > 0 && 'text-success')}
        footerContent={
          <span className="truncate">
            {s
              ? s.paidWithFeesCount > 0
                ? `${pluralize(s.paidWithFeesCount, 'pagamento', 'pagamentos')} · juros ${formatBRL(s.interestTotal)} · multa ${formatBRL(s.fineTotal)}`
                : 'nenhum pagamento com juros ou multa'
              : '—'}
          </span>
        }
      />
    </div>
  );
}
