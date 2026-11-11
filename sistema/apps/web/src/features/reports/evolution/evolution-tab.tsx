import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CalendarDays, ReceiptText, Repeat, RotateCcw, Ticket, Users } from 'lucide-react';
import { formatDateBR, formatMonthKey, type EvolutionMonth, type MonthKey } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { KpiCard } from '@/components/ui/kpi-card';
import { ErrorState } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useEvolutionReport } from '../api';
import { useReportMonths } from '../components/report-months';
import { EvolutionBridgeView } from './evolution-bridge';
import { MoneyChart, PortfolioChart, REACTIVATION_NOTE } from './evolution-charts';
import { evolutionKpis, evolutionRows, type EvolutionKpi } from './evolution-logic';
import { EvolutionTableView } from './evolution-table';

/**
 * Reference month of the tab (`?ref=2026-10`): the current (last) month by default; a month outside
 * the window falls back to it. Setting the last month removes the param.
 */
export function useEvolutionRef(months: readonly EvolutionMonth[]): [MonthKey, (month: MonthKey) => void] {
  const [params, setParams] = useSearchParams();
  const last = months.at(-1)?.month;
  const raw = params.get('ref');
  const ref = (raw && months.some((m) => m.month === raw) ? raw : last ?? '') as MonthKey;
  const set = (month: MonthKey) => {
    const p = new URLSearchParams(params);
    if (!last || month === last) p.delete('ref');
    else p.set('ref', month);
    setParams(p, { replace: true });
  };
  return [ref, set];
}

const KPI_ICONS: Record<EvolutionKpi['key'], React.ReactNode> = {
  activeClients: <Users />,
  recurringFees: <Repeat />,
  averageFee: <Ticket />,
  billed: <ReceiptText />,
};

const KPI_INFO: Record<EvolutionKpi['key'], string> = {
  activeClients: 'Clientes com contrato iniciado até o último dia do mês (ou hoje) e sem inativação até ele.',
  recurringFees: 'Soma do honorário da vigência em vigor no último dia do mês (ou hoje) dos clientes ativos. Cliente sem vigência conta como ativo e soma zero.',
  averageFee: 'Honorário mensal recorrente dividido pelos clientes ativos com vigência.',
  billed: 'Recebíveis de clientes com vencimento no mês, pagos ou não; o recebido é o que entrou no mês pela data de pagamento.',
};

const TONE = { success: 'text-success', danger: 'text-danger' } as const;

/** Relatórios › Evolução (spec §4): KPIs of the reference month, the portfolio and money charts, the fee bridge and the table. */
export function EvolutionTab() {
  const [months] = useReportMonths();
  const report = useEvolutionReport({ months });
  const list = useMemo(() => report.data?.months ?? [], [report.data]);
  const [ref, setRef] = useEvolutionRef(list);
  const index = list.findIndex((m) => m.month === ref);
  const current = list[index];
  const previous = index > 0 ? list[index - 1] : undefined;
  const kpis = useMemo(() => evolutionKpis(list, ref), [list, ref]);
  const rows = useMemo(() => evolutionRows(list), [list]);
  const last = list.at(-1);

  if (report.isError) return <ErrorState error={report.error} onRetry={() => report.refetch()} />;
  if (!report.data) return <EvolutionSkeleton />;

  const empty = list.every((m) => m.activeClients === 0 && m.newClients === 0 && m.churnedClients === 0 && m.billed === 0 && m.received === 0);
  if (empty || !current) {
    return (
      <EmptyState
        icon={<Users />}
        title="Nenhum cliente cadastrado"
        description="A evolução mostra clientes novos, encerrados e o honorário mensal mês a mês. Cadastre os clientes com a data de início do contrato e o honorário."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/clientes">Cadastrar cliente</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className={cn('@container flex flex-col gap-4 transition-opacity print:gap-3', report.isPlaceholderData && 'opacity-70')}>
      {/* A4 landscape: the table has 11 columns. */}
      <style>{'@media print { @page { size: A4 landscape; } }'}</style>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
        <CalendarDays className="size-3.5 text-subtle" aria-hidden />
        <span>
          Mês de referência: <b className="font-semibold text-fg">{formatMonthKey(ref).toLowerCase()}</b>
        </span>
        {last && ref !== last.month ? (
          <>
            <span className="text-subtle">· escolhido no gráfico</span>
            <button type="button" onClick={() => setRef(last.month)} className="inline-flex items-center gap-1 font-medium text-brand-text hover:underline print:hidden">
              <RotateCcw className="size-3.5" aria-hidden />
              {`Voltar a ${formatMonthKey(last.month).split(' ')[0]!.toLowerCase()} (mês atual)`}
            </button>
          </>
        ) : (
          <span className="text-subtle print:hidden">· clique num mês do gráfico ou da tabela para comparar outro</span>
        )}
      </p>

      <div className="hidden gap-3 @[560px]:grid @[560px]:grid-cols-2 @[1000px]:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard
            key={k.key}
            compact
            icon={KPI_ICONS[k.key]}
            label={k.label}
            info={KPI_INFO[k.key]}
            value={k.value}
            footerContent={
              <span className="truncate" title={k.footer}>
                <KpiFooter kpi={k} />
              </span>
            }
          />
        ))}
      </div>
      {/* Phones: the 4 figures in one list (two columns cannot hold the footers). */}
      <Card className="divide-y divide-border @[560px]:hidden">
        {kpis.map((k) => (
          <div key={k.key} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-muted [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-subtle">
                {KPI_ICONS[k.key]}
                <span className="truncate">{k.label}</span>
              </span>
              <span className="tabular shrink-0 text-[18px] font-semibold tracking-tight text-fg">{k.value}</span>
            </div>
            <p className="mt-0.5 text-caption text-muted">
              <KpiFooter kpi={k} />
            </p>
          </div>
        ))}
      </Card>

      <div className="grid gap-4 xl:grid-cols-5">
        <PortfolioChart className="xl:col-span-3" months={list} active={ref} onPick={setRef} />
        <EvolutionBridgeView className="xl:col-span-2" current={current} previous={previous} />
      </div>
      <MoneyChart months={list} active={ref} onPick={setRef} />
      <EvolutionTableView rows={rows} active={ref} onPick={setRef} />
      <p className="text-caption text-subtle">{`${REACTIVATION_NOTE} Dados de ${formatDateBR(report.data.today)}.`}</p>
    </div>
  );
}

/** The footer of a KPI with colour only on the change (spec §4.3). */
function KpiFooter({ kpi }: { kpi: EvolutionKpi }) {
  return (
    <>
      {kpi.parts.map((part, i) =>
        part.tone ? (
          <span key={i} className={cn('tabular font-semibold', TONE[part.tone])}>
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

function EvolutionSkeleton() {
  return (
    <div className="@container flex flex-col gap-4" aria-busy="true" aria-label="Carregando a evolução da carteira">
      <Skeleton className="h-4 w-72" />
      <div className="grid grid-cols-1 gap-3 @[560px]:grid-cols-2 @[1000px]:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        <Skeleton className="h-[380px] rounded-xl xl:col-span-3" />
        <Skeleton className="h-[380px] rounded-xl xl:col-span-2" />
      </div>
      <Skeleton className="h-[360px] rounded-xl" />
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
