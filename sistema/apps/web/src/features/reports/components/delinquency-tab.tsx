import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlarmClock, CalendarX2, Coins, Percent } from 'lucide-react';
import { DELINQUENCY_RISKS, DELINQUENCY_RISK_LABELS, formatBRL, formatDateBR, formatPercent, type DelinquencyClient, type DelinquencyReportResponse } from '@effinance/shared';
import { Card, CardHeader } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { ErrorState } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, pluralize } from '@/lib/utils';
import { useDelinquencyReport } from '../api';
import { collectionName } from '../delinquency-message';
import { countByRisk, formatChance, formatDays, probabilityZone } from '../delinquency-view';
import { CollectionMessageDialog } from './collection-message-dialog';
import { DelinquencyChart } from './delinquency-chart';
import { DelinquencyClients, DelinquencyClientsEmpty } from './delinquency-clients';
import { RISK_TONE, RiskBadge, Thermometer } from './delinquency-gauges';

const MONTH_OPTIONS = [6, 12, 24] as const;
type Months = (typeof MONTH_OPTIONS)[number];
const DEFAULT_MONTHS: Months = 12;

/** Period of the report, kept in the URL (`?meses=6|24`; 12 is the default and stays out). */
export function useDelinquencyMonths(): [Months, (months: Months) => void] {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get('meses'));
  const months = (MONTH_OPTIONS as readonly number[]).includes(raw) ? (raw as Months) : DEFAULT_MONTHS;
  const set = (next: Months) => {
    const p = new URLSearchParams(params);
    if (next === DEFAULT_MONTHS) p.delete('meses');
    else p.set('meses', String(next));
    setParams(p, { replace: true });
  };
  return [months, set];
}

/** Header control of the tab (in place of the reports' period filter). */
export function DelinquencyMonthsControl() {
  const [months, setMonths] = useDelinquencyMonths();
  return (
    <SegmentedControl<`${Months}`>
      ariaLabel="Período do relatório de inadimplência"
      value={`${months}`}
      onChange={(v) => setMonths(Number(v) as Months)}
      options={MONTH_OPTIONS.map((m) => ({ value: `${m}`, label: `${m} meses` }))}
    />
  );
}

const THERMOMETER_HELP =
  'Chance média de uma mensalidade ser paga com atraso, pelo histórico de cada cliente no período: os meses recentes pesam mais (um atraso de 6 meses atrás vale metade) e quem tem pouco histórico parte de 20%. A média da carteira pondera cada cliente pelo número de mensalidades. Zonas: até 20% Bom pagador · 20–40% Atenção · 40–60% Risco alto · acima de 60% Crítico.';

/** "Inadimplência": how clients pay their fees (late count, days late, interest/fines), a portfolio thermometer and a score per client. */
export function DelinquencyTab() {
  const [months] = useDelinquencyMonths();
  const report = useDelinquencyReport(months);
  const [messageFor, setMessageFor] = useState<DelinquencyClient | null>(null);
  const r = report.data;

  if (report.isError) return <ErrorState error={report.error} onRetry={() => report.refetch()} />;

  return (
    <div className={cn('@container flex flex-col gap-4 transition-opacity', report.isPlaceholderData && 'opacity-70')}>
      <DelinquencyKpis r={r} />
      {!r ? (
        <>
          <div className="grid gap-4 xl:grid-cols-5">
            <Skeleton className="h-[300px] rounded-xl xl:col-span-2" />
            <Skeleton className="h-[300px] rounded-xl xl:col-span-3" />
          </div>
          <Skeleton className="h-96 rounded-xl" />
        </>
      ) : r.clients.length === 0 ? (
        <DelinquencyClientsEmpty />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-5">
            <PortfolioCard r={r} months={months} className="xl:col-span-2" />
            <div className="min-w-0 xl:col-span-3">
              <DelinquencyChart monthly={r.monthly} />
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
  const fees = s ? s.interestTotal + s.fineTotal : 0;
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
        info="Parte das mensalidades vencidas no período que foram pagas depois do vencimento ou seguem em aberto"
        value={s ? formatPercent(s.lateRate) : loading}
        footerContent={<span className="truncate">{s ? `${s.lateCount} de ${s.dueCount} mensalidades com atraso` : '—'}</span>}
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

/** Portfolio thermometer: average chance of paying late, its zone, the real late rate and clients per risk band. */
function PortfolioCard({ r, months, className }: { r: DelinquencyReportResponse; months: number; className?: string }) {
  const s = r.summary;
  const zone = probabilityZone(s.probability);
  const byRisk = countByRisk(r.clients);
  const total = r.clients.length;
  const oneIn = s.probability > 0 ? Math.max(1, Math.round(1 / s.probability)) : null;
  return (
    <Card className={cn('flex flex-col p-4 sm:p-5', className)}>
      <CardHeader title="Termômetro de inadimplência" subtitle={`Carteira · vencimentos de ${formatDateBR(r.from)} a ${formatDateBR(r.to)}`} info={THERMOMETER_HELP} />
      <div className="mt-4 flex flex-1 items-center gap-4 sm:gap-6">
        <Thermometer probability={s.probability} />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-caption leading-snug font-medium text-muted">Chance média de atrasar a próxima mensalidade</span>
              <span className={cn('tabular text-kpi leading-none font-semibold tracking-tight', RISK_TONE[zone].text)}>{formatChance(s.probability)}</span>
            </div>
            <div className="mt-1.5 flex justify-end">
              <RiskBadge risk={zone} />
            </div>
            <p className="mt-2 text-caption text-muted">
              {oneIn === null
                ? 'Nenhum atraso no histórico recente da carteira.'
                : oneIn <= 1
                  ? 'Pelo histórico, praticamente toda mensalidade tende a atrasar.'
                  : `Pelo histórico, cerca de 1 em cada ${oneIn} mensalidades tende a atrasar.`}
            </p>
          </div>
          <dl className="flex flex-col gap-1.5 border-t border-border pt-3 text-body-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Taxa de atraso real ({months} meses)</dt>
              <dd className="tabular font-semibold text-fg">{formatPercent(s.lateRate)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Clientes em risco alto ou crítico</dt>
              <dd className={cn('tabular font-semibold', s.clientsAtRisk > 0 ? 'text-danger' : 'text-fg')}>
                {s.clientsAtRisk} de {total}
              </dd>
            </div>
          </dl>
          <div>
            <div
              role="img"
              aria-label={`Clientes por faixa: ${DELINQUENCY_RISKS.map((k) => `${DELINQUENCY_RISK_LABELS[k]} ${byRisk[k]}`).join(', ')}`}
              className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-bg-subtle"
            >
              {DELINQUENCY_RISKS.filter((k) => byRisk[k] > 0).map((k) => (
                <span key={k} className={cn('h-full min-w-1', RISK_TONE[k].bg)} style={{ width: `${(byRisk[k] / Math.max(1, total)) * 100}%` }} />
              ))}
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {DELINQUENCY_RISKS.map((k) => (
                <li key={k} className={cn('flex items-center gap-1.5 text-caption', byRisk[k] === 0 ? 'text-subtle' : 'text-muted')}>
                  <span className={cn('size-2 shrink-0 rounded-[3px]', RISK_TONE[k].bg, byRisk[k] === 0 && 'opacity-40')} aria-hidden />
                  {DELINQUENCY_RISK_LABELS[k]}
                  <span className="tabular font-semibold text-fg">{byRisk[k]}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Card>
  );
}
