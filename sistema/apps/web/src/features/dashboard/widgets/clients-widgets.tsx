import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Building2, CalendarCheck, ClipboardCheck } from 'lucide-react';
import {
  formatBRL,
  formatDateBR,
  monthRange,
  TAX_REGIME_LABELS,
  todayISO,
  type CategoryAmount,
  type Client,
  type ISODate,
  type MonthKey,
  type Transaction,
  type TransactionListResponse,
  type TransactionQuery,
} from '@effinance/shared';
import { DonutChart } from '@/components/charts/donut-chart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useTone } from '@/lib/theme';
import { useElementSize } from '@/lib/use-element-size';
import { cn, pluralize } from '@/lib/utils';
import { REGIME_COLORS } from '@/features/clients/clients-summary';
import { useContactReport, useEvolutionReport } from '@/features/reports/api';
import type { WidgetProps } from '../layout/types';
import { FitList, WidgetCard } from '../layout/widget-card';
import { feesMonthInsight, portfolioInsight } from './insight-lines';
import { StackBar } from '@/components/charts/stack-bar';
import {
  billableClients,
  clientIncome,
  feeCompetence,
  feePeriodAlerts,
  FEE_ENDING_DAYS,
  generatedFees,
  hasFeeFields,
  incompleteClients,
  regimeChartLayout,
  regimeStats,
  type FeePeriodAlert,
} from './clients-math';
import { useOfficeClients } from './data';
import { BodyEmpty, ListSkeleton } from './shared';

const clientHref = (id: string) => `/clientes?consultar=${id}`;

/** "Nenhum cliente cadastrado" with the way to the clients page. */
function NoClients() {
  return (
    <BodyEmpty
      icon={<Building2 />}
      title="Nenhum cliente cadastrado"
      description="Cadastre as empresas atendidas para acompanhar a carteira e os honorários."
      action={
        <Button size="sm" variant="outline" asChild>
          <Link to="/clientes">Ir para Clientes</Link>
        </Button>
      }
    />
  );
}

type TileTone = 'danger' | 'warning';

/** Number tile: label and small lines on the left, the number on the right. */
function StatTile({
  label,
  value,
  hint,
  tone,
  wrapLabel,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: TileTone;
  /** Label on up to two lines (narrow tiles) instead of cut. */
  wrapLabel?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-lg px-3 py-1.5',
        tone === 'danger' ? 'bg-danger-soft' : tone === 'warning' ? 'bg-warning-soft' : 'bg-surface-muted',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-caption',
            wrapLabel ? 'line-clamp-2 leading-tight' : 'truncate',
            tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-muted',
          )}
        >
          {label}
        </p>
        {hint ? <p className={cn('truncate text-micro', tone ? 'text-fg/70' : 'text-muted')}>{hint}</p> : null}
      </div>
      <span
        className={cn(
          'shrink-0 text-title-sm leading-5 font-semibold tabular',
          tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-fg',
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Carteira de clientes
// ---------------------------------------------------------------------------

/** Narrow or short boxes: one stacked bar and the regimes listed below it. */
function RegimeShares({ slices, total }: { slices: CategoryAmount[]; total: number }) {
  const tone = useTone();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex h-2.5 w-full shrink-0 gap-0.5 overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
        {slices.map((s) => (
          <span key={s.categoryId} className="h-full min-w-1" style={{ width: `${(s.amount / total) * 100}%`, backgroundColor: tone(s.color) }} />
        ))}
      </div>
      <FitList
        items={slices}
        getKey={(s) => s.categoryId ?? s.name}
        moreLabel="regime(s)"
        moreHref="/clientes"
        className="flex flex-col"
        renderItem={(s) => (
          <div className="flex items-center gap-2 px-1.5 py-1 text-[12px]">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tone(s.color) }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-fg">{s.name}</span>
            <span className="shrink-0 text-mini text-muted tabular">{Math.round(s.share * 100)}%</span>
            <span className="shrink-0 font-semibold text-fg tabular">{formatBRL(s.amount)}</span>
          </div>
        )}
      />
    </div>
  );
}

/** Active and inactive clients, the monthly fixed fees and how they split by tax regime. */
export function ClientsPortfolioWidget({ size, alert }: WidgetProps) {
  const clients = useOfficeClients();
  // The change of the base against the previous month (spec §4.1): the evolution of the current month.
  const evolution = useEvolutionReport({ months: 1 });
  const comparison = evolution.data?.comparison;
  const tone = useTone();
  const chartBox = useElementSize();
  const data = clients.data;
  const summary = data?.summary;
  const stats = useMemo(() => (data ? regimeStats(data.items, data.summary.byRegime) : []), [data]);
  // From 3 columns the regimes also get their own panel (clients and average fee per regime).
  const wide = size.c >= 3;
  // Short card: the tiles go on one row without hint lines and the chart caption is dropped.
  const compact = size.r <= 3;

  const slices: CategoryAmount[] = useMemo(() => {
    const total = stats.reduce((a, s) => a + s.amount, 0);
    return stats
      .filter((s) => s.amount > 0)
      .map((s) => ({
        categoryId: s.regime,
        name: wide ? TAX_REGIME_LABELS[s.regime] : `${TAX_REGIME_LABELS[s.regime]} (${s.clients})`,
        icon: 'tag',
        color: REGIME_COLORS[s.regime],
        amount: s.amount,
        share: total > 0 ? s.amount / total : 0,
      }));
  }, [stats, wide]);
  const feesTotal = slices.reduce((a, s) => a + s.amount, 0);
  const maxClients = Math.max(1, ...stats.map((s) => s.clients));
  const chart = regimeChartLayout(slices.length, chartBox.width, chartBox.height);

  let body;
  if (clients.isPending) {
    body = (
      <div className="flex min-h-0 flex-1 flex-col gap-3" aria-busy="true" aria-label="Carregando">
        <div className="grid shrink-0 grid-cols-3 gap-2 @3xl:grid-cols-4">
          <Skeleton className="col-span-3 h-9 @3xl:col-span-1" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
        <Skeleton className="min-h-0 w-full flex-1" />
      </div>
    );
  } else if (clients.isError) {
    body = <ErrorState error={clients.error} onRetry={() => clients.refetch()} className="p-3" />;
  } else if (!data || !summary || summary.active + summary.inactive === 0) {
    body = <NoClients />;
  } else {
    const withFee = summary.active - (summary.withoutCurrentFee ?? 0);
    // Hint lines only when the card has the height and the tiles the width for them.
    const hint = (text: string) => (compact ? undefined : <span className="hidden @md:inline">{text}</span>);
    body = (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div
          className={cn(
            'grid shrink-0 grid-cols-3 gap-2',
            compact ? '@md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]' : '@3xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]',
          )}
        >
          <StatTile
            className={cn('col-span-3', compact ? '@md:col-span-1' : '@3xl:col-span-1')}
            label="Honorário fixo mensal"
            value={formatBRL(summary.monthlyFees ?? 0)}
            hint={hint(`ticket médio ${formatBRL(summary.averageFee ?? 0)} · ${pluralize(withFee, 'cliente', 'clientes')}`)}
            wrapLabel={compact}
          />
          <StatTile label="Ativos" value={summary.active} hint={hint('na carteira')} />
          <StatTile label="Inativos" value={summary.inactive} hint={hint('fora da carteira')} />
          <StatTile
            label="Sem vigência"
            value={summary.withoutCurrentFee ?? 0}
            hint={hint((summary.withoutCurrentFee ?? 0) > 0 ? 'cadastrar ou reajustar' : 'todas em dia')}
            tone={(summary.withoutCurrentFee ?? 0) > 0 ? 'danger' : undefined}
          />
        </div>
        <div className="flex min-h-0 flex-1 gap-6">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {compact ? null : <p className="mb-1 shrink-0 text-caption font-medium text-muted">Honorários por regime</p>}
            <div
              ref={chartBox.ref}
              role="img"
              aria-label={`Honorários por regime: ${stats
                .filter((s) => s.amount > 0)
                .map((s) => `${TAX_REGIME_LABELS[s.regime]} ${formatBRL(s.amount)}`)
                .join(', ')}`}
              className="flex min-h-0 flex-1 flex-col"
            >
              {feesTotal === 0 ? (
                <p className="flex flex-1 items-center justify-center text-center text-caption text-muted">Nenhum honorário vigente nos clientes ativos.</p>
              ) : chartBox.height === 0 ? null : chart.donut ? (
                <DonutChart fill itemColors data={slices} total={feesTotal} centerLabel="por mês" maxItems={chart.maxItems} />
              ) : (
                <RegimeShares slices={slices} total={feesTotal} />
              )}
            </div>
          </div>
          {wide ? (
            <div className="flex min-h-0 w-[42%] min-w-0 shrink-0 flex-col">
              {compact ? null : <p className="mb-1 shrink-0 text-caption font-medium text-muted">Clientes ativos por regime</p>}
              <FitList
                items={stats}
                getKey={(s) => s.regime}
                moreLabel="regime(s)"
                moreHref="/clientes"
                className="flex flex-col gap-1"
                renderItem={(s) => (
                  <div className="grid grid-cols-[auto_minmax(0,8.5rem)_minmax(0,1fr)_4.5rem] items-center gap-x-2.5 px-1.5 py-0.5">
                    <span className="size-2 rounded-full" style={{ backgroundColor: tone(REGIME_COLORS[s.regime]) }} aria-hidden />
                    <span className="truncate text-[12px] font-medium text-fg" title={TAX_REGIME_LABELS[s.regime]}>
                      {TAX_REGIME_LABELS[s.regime]}
                    </span>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${(s.clients / maxClients) * 100}%`, backgroundColor: tone(REGIME_COLORS[s.regime]) }}
                      />
                    </span>
                    <span className="text-right text-body-sm font-semibold text-fg tabular">{pluralize(s.clients, 'cliente', 'clientes')}</span>
                    <span className="col-start-2 col-end-5 truncate text-micro text-muted">
                      {s.withFee > 0
                        ? `ticket médio ${formatBRL(Math.round(s.amount / s.withFee))}${s.withFee < s.clients ? ` · ${s.clients - s.withFee} sem vigência` : ''}`
                        : 'sem honorário vigente'}
                    </span>
                  </div>
                )}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <WidgetCard
      subtitle={
        (summary &&
          portfolioInsight(summary.active, summary.averageFee || null, comparison ? { diff: comparison.metrics.activeClients.diff, previous: comparison.previous } : null)) ??
        'Clientes ativos, inativos e honorários'
      }
      info="Honorário fixo: soma dos honorários mensais vigentes hoje dos clientes ativos (sem a taxa por empregado). O gráfico divide esse total por regime tributário; entre parênteses, os clientes ativos de cada regime."
      alert={alert}
      footer={
        summary ? (
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-caption text-muted">{pluralize(summary.active + summary.inactive, 'empresa', 'empresas')} na carteira</p>
            <span className="flex shrink-0 items-center gap-2 text-caption">
              <Link to="/relatorios?aba=evolucao" className="font-medium whitespace-nowrap text-brand-text hover:underline">
                Ver evolução →
              </Link>
              <span className="text-subtle" aria-hidden>
                ·
              </span>
              <Link to="/clientes" className="font-medium whitespace-nowrap text-brand-text hover:underline">
                Ver clientes →
              </Link>
            </span>
          </div>
        ) : undefined
      }
    >
      {body}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Vigências de honorários
// ---------------------------------------------------------------------------

/** Second line of a row; the monthly fee joins it on narrow cards (its own column on wide ones). */
function alertMeta(a: FeePeriodAlert): ReactNode {
  if (a.kind === 'ending') {
    return (
      <>
        <span className="@2xl:hidden">{formatBRL(a.client.currentFee?.amount ?? 0)}/mês · </span>
        {a.days <= 0 ? 'termina hoje' : `faltam ${pluralize(a.days, 'dia', 'dias')}`}
      </>
    );
  }
  if (a.reason === 'expired' && a.date) return `Reajuste pendente · encerrou em ${formatDateBR(a.date)}`;
  if (a.reason === 'future' && a.date) return `Próxima vigência começa em ${formatDateBR(a.date)}`;
  return 'Nenhum honorário cadastrado';
}

/** Clients without a current fee period, then the periods that end in the next 60 days. */
type FeeRow = FeePeriodAlert | { kind: 'renewal'; client: Client; date: ISODate; first: boolean };

export function FeePeriodsWidget({ alert }: WidgetProps) {
  const clients = useOfficeClients();
  const today = todayISO();
  const data = clients.data;
  const alerts = useMemo(() => (data ? feePeriodAlerts(data.items, today) : []), [data, today]);
  // Below the alerts, the next renewals as reference, so the card shows the whole calendar of periods.
  const rows = useMemo<FeeRow[]>(() => {
    if (!data) return [];
    const flagged = new Set(alerts.map((a) => a.client.id));
    const renewals = data.items
      .filter((c) => c.status === 'active' && c.currentFee && !flagged.has(c.id))
      .sort((a, b) => a.currentFee!.endDate.localeCompare(b.currentFee!.endDate))
      .map((client, i): FeeRow => ({ kind: 'renewal', client, date: client.currentFee!.endDate, first: i === 0 }));
    return [...alerts, ...renewals];
  }, [data, alerts]);
  const missing = alerts.filter((a) => a.kind === 'missing').length;
  const ending = alerts.length - missing;

  let body;
  if (clients.isPending) {
    body = <ListSkeleton rowClassName="h-9" />;
  } else if (clients.isError) {
    body = <ErrorState error={clients.error} onRetry={() => clients.refetch()} className="p-3" />;
  } else if (!data || data.items.length === 0) {
    body = <NoClients />;
  } else if (rows.length === 0) {
    body = (
      <BodyEmpty
        icon={<CalendarCheck />}
        title="Todas as vigências estão em dia"
        description={`Nenhum cliente ativo sem honorário vigente ou com vigência terminando em ${FEE_ENDING_DAYS} dias.`}
      />
    );
  } else {
    body = (
      <FitList
        items={rows}
        getKey={(a) => a.client.id}
        moreLabel="cliente(s)"
        moreHref="/clientes"
        className="flex flex-col gap-0.5"
        renderItem={(a) => {
          const name = a.client.name;
          if (a.kind === 'renewal') {
            return (
              <div>
                {a.first ? <p className="mt-2 mb-1 px-1.5 text-caption font-medium text-muted">{alerts.length ? 'Próximas renovações' : 'Todas em dia · próximas renovações'}</p> : null}
                <Link
                  to={clientHref(a.client.id)}
                  className="flex items-center gap-3 rounded-md px-1.5 py-1.5 transition-colors hover:bg-surface-muted"
                  aria-label={`${name}: vigência até ${formatDateBR(a.date)}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm font-medium text-fg" title={name}>
                      {name}
                    </span>
                    <span className="mt-0.5 block truncate text-mini text-muted">vigência até {formatDateBR(a.date)}</span>
                  </span>
                  <span className="shrink-0 text-right text-caption text-muted tabular">{formatBRL(a.client.currentFee?.amount ?? 0)}/mês</span>
                </Link>
              </div>
            );
          }
          return (
            <Link
              to={clientHref(a.client.id)}
              className="flex items-center gap-3 rounded-md px-1.5 py-1.5 transition-colors hover:bg-surface-muted"
              aria-label={`${name}: ${a.kind === 'missing' ? 'sem vigência' : `vigência vence em ${formatDateBR(a.date)}`}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm font-semibold text-fg" title={name}>
                  {name}
                </span>
                <span className="mt-0.5 block truncate text-mini text-muted">{alertMeta(a)}</span>
              </span>
              <span className="hidden w-28 shrink-0 truncate text-caption text-muted @2xl:block">{TAX_REGIME_LABELS[a.client.taxRegime]}</span>
              <span
                className={cn('hidden w-28 shrink-0 text-right text-caption tabular @2xl:block', a.kind === 'ending' ? 'font-medium text-fg' : 'text-subtle')}
                title={a.kind === 'missing' && a.client.latestFee ? 'Último honorário cadastrado' : undefined}
              >
                {a.kind === 'ending' ? `${formatBRL(a.client.currentFee?.amount ?? 0)}/mês` : a.client.latestFee ? `${formatBRL(a.client.latestFee.amount)}/mês` : '—'}
              </span>
              {a.kind === 'missing' ? (
                <Badge tone="danger" className="shrink-0">
                  Sem vigência
                </Badge>
              ) : (
                <Badge tone="warning" className="shrink-0 tabular">
                  {a.days <= 0 ? 'Vence hoje' : `Vence em ${formatDateBR(a.date)}`}
                </Badge>
              )}
            </Link>
          );
        }}
      />
    );
  }

  const parts = [missing ? `${missing} sem vigência` : '', ending ? `${ending} ${ending === 1 ? 'vence' : 'vencem'} em até ${FEE_ENDING_DAYS} dias` : ''].filter(Boolean);
  return (
    <WidgetCard
      subtitle={parts.length ? <span className={cn(missing > 0 && 'text-danger')}>{parts.join(' · ')}</span> : `Sem vigência e vencendo em até ${FEE_ENDING_DAYS} dias`}
      alert={alert}
    >
      {body}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Honorários do mês
// ---------------------------------------------------------------------------

/** Income rows read for a month (fees are one or two per client; 5 pages of 200). */
const MONTH_ROWS_LIMIT = 1000;
const MONTH_ROWS_PAGE = 200;

interface MonthIncome {
  items: Transaction[];
  truncated: boolean;
}

/** Every receivable due in `month` (up to MONTH_ROWS_LIMIT), read page by page. */
function useMonthIncome(month: MonthKey) {
  const { from, to } = monthRange(month);
  const params = { type: 'income', status: 'all', from, to, sort: 'date_asc', pageSize: MONTH_ROWS_PAGE } satisfies TransactionQuery;
  return useQuery({
    queryKey: qk.transactions({ ...params, all: MONTH_ROWS_LIMIT }),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<MonthIncome> => {
      const items: Transaction[] = [];
      for (let page = 1; ; page++) {
        const res = await api<TransactionListResponse>('/transactions', { query: { ...params, page } });
        items.push(...res.items);
        if (items.length >= res.total || res.items.length === 0 || items.length >= MONTH_ROWS_LIMIT) {
          return { items: items.slice(0, MONTH_ROWS_LIMIT), truncated: res.total > MONTH_ROWS_LIMIT };
        }
      }
    },
  });
}

const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** One step of the fees strip: label, amount and, when there is a reference, its bullet and share. */
function FeeStep({
  label,
  value,
  hint,
  bar,
}: {
  label: string;
  value: number;
  hint?: string;
  /** Bullet against a reference: filled share (0–1 of the scale), mark of the reference, text. */
  bar?: { fill: number; mark: number; className: string; text: string };
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-x-3 @lg:flex @lg:flex-col @lg:items-stretch @lg:justify-center @lg:gap-0.5">
      <p className="truncate text-caption text-muted">{label}</p>
      <p className="order-last text-right text-body-sm font-semibold whitespace-nowrap text-fg tabular @lg:order-none @lg:text-left @lg:text-[18px] @lg:leading-6">
        {formatBRL(value)}
      </p>
      {bar ? (
        <div className="flex min-w-0 items-center gap-2 @lg:mt-1">
          <StackBar
            size="sm"
            className="min-w-0 flex-1"
            segments={[
              { value: bar.fill, className: bar.className },
              { value: Math.max(0, 1 - bar.fill), className: 'bg-transparent' },
            ]}
            marker={bar.mark < 1 ? { at: bar.mark, label: '' } : undefined}
          />
          <span className="shrink-0 text-micro font-semibold text-fg tabular">{bar.text}</span>
        </div>
      ) : (
        <p className="truncate text-micro text-muted">{hint}</p>
      )}
    </div>
  );
}

/**
 * Fees of the month. With "Gerar honorários" (receivables carrying `feeCompetence`): generated,
 * received and open for the competence due this month, and the clients still without one.
 * Older APIs: income of clients in the month from the contacts report.
 */
export function FeesMonthWidget({ month, d, loading, alert }: WidgetProps) {
  const today = todayISO();
  const clients = useOfficeClients();
  const income = useMonthIncome(month);
  const competence = feeCompetence(month);
  const rows = income.data?.items;
  // The fee fields show on any transaction of a recent API (the dashboard's own list included).
  const fromRows = rows ? hasFeeFields(rows) : false;
  const feeAware = fromRows || hasFeeFields(d?.upcoming ?? []);
  const modeKnown = Boolean(rows) && (fromRows || !loading);
  const reportEnabled = modeKnown && !feeAware;
  const range = monthRange(month);
  const billedReport = useContactReport({ ...range, granularity: 'month', status: 'all' }, reportEnabled);
  const paidReport = useContactReport({ ...range, granularity: 'month', status: 'paid' }, reportEnabled);

  const data = clients.data;
  const view = useMemo(() => {
    if (!data || !rows) return null;
    if (feeAware) {
      const gen = generatedFees(rows, competence, today);
      const billable = billableClients(data.items, competence);
      return {
        billed: gen.generated,
        received: gen.received,
        open: gen.open,
        overdue: gen.overdue,
        count: gen.count,
        base: billable.length,
        missing: billable.filter((c) => !gen.clientIds.has(c.id)),
      };
    }
    const ids = new Set(data.items.map((c) => c.id));
    const billed = clientIncome(billedReport.data, ids);
    const received = clientIncome(paidReport.data, ids);
    const active = data.items.filter((c) => c.status === 'active');
    return {
      billed: billed.total,
      received: received.total,
      open: Math.max(0, billed.total - received.total),
      overdue: 0,
      count: 0,
      base: active.length,
      missing: active.filter((c) => !billed.clientIds.has(c.id)),
    };
  }, [data, rows, feeAware, competence, today, billedReport.data, paidReport.data]);

  const failed = [clients, income, ...(reportEnabled ? [billedReport, paidReport] : [])].find((q) => q.isError);
  const pending = clients.isPending || income.isPending || !modeKnown || (reportEnabled && (billedReport.isPending || paidReport.isPending));
  const billedLabel = feeAware ? 'Gerado' : 'Faturado';
  const compLabel = `${competence.slice(5)}/${competence.slice(0, 4)}`;
  const monthLabel = `${month.slice(5)}/${month.slice(0, 4)}`;

  let body;
  if (failed) {
    body = <ErrorState error={failed.error} onRetry={() => failed.refetch()} className="p-3" />;
  } else if (pending || !view || !data) {
    body = (
      <div className="flex min-h-0 flex-1 flex-col justify-evenly gap-3" aria-busy="true" aria-label="Carregando">
        <Skeleton className="h-5 w-full shrink-0" />
        <Skeleton className="h-5 w-4/5 shrink-0" />
        <Skeleton className="h-5 w-3/5 shrink-0" />
      </div>
    );
  } else if (data.items.length === 0) {
    body = <NoClients />;
  } else {
    const { summary } = data;
    const withFee = summary.active - (summary.withoutCurrentFee ?? 0);
    const planned = summary.monthlyFees ?? 0;
    // Generated against planned (mark on 100% when it went past it); received against generated.
    const genScale = Math.max(planned, view.billed, 1);
    const missing = view.missing.length;
    body = (
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5 @lg:grid @lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,13rem)] @lg:gap-x-6">
        <FeeStep label="Previsto" value={planned} hint={pluralize(withFee, 'cliente com vigência', 'clientes com vigência')} />
        <FeeStep
          label={billedLabel}
          value={view.billed}
          bar={
            planned > 0
              ? { fill: view.billed / genScale, mark: planned / genScale, className: 'bg-[var(--app-chart-3)]', text: `${share(view.billed, planned)}%` }
              : undefined
          }
          hint={planned > 0 ? undefined : 'nada previsto'}
        />
        <FeeStep
          label="Recebido"
          value={view.received}
          bar={view.billed > 0 ? { fill: Math.min(1, view.received / view.billed), mark: 1, className: 'bg-data', text: `${share(view.received, view.billed)}%` } : undefined}
          hint={view.billed > 0 ? undefined : `nada ${billedLabel.toLowerCase()}`}
        />
        <dl className="hidden min-w-0 flex-col justify-center gap-1 border-l border-border pl-5 text-caption @lg:flex">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="truncate text-muted">Em aberto</dt>
            <dd className={cn('font-semibold whitespace-nowrap tabular', view.overdue > 0 ? 'text-danger' : 'text-fg')}>{formatBRL(view.open)}</dd>
          </div>
          {view.overdue > 0 ? <p className="-mt-1 text-right text-micro text-danger">{formatBRL(view.overdue)} vencido</p> : null}
          <div className="flex items-baseline justify-between gap-3">
            <dt className="truncate text-muted">{feeAware ? 'Sem honorário gerado' : 'Sem lançamento'}</dt>
            <dd className={cn('font-semibold tabular', missing > 0 ? 'text-warning' : 'text-fg')}>{missing}</dd>
          </div>
        </dl>
      </div>
    );
  }

  const insight = view && data && !pending && !failed ? feesMonthInsight(data.summary.monthlyFees ?? 0, view.billed, view.received) : null;
  const finding = insight && feeAware ? `Competência ${compLabel} · ${insight.charAt(0).toLowerCase()}${insight.slice(1)}` : insight;
  return (
    <WidgetCard
      subtitle={finding ?? (feeAware ? `Competência ${compLabel} · vencimento em ${monthLabel}` : `Lançamentos de clientes em ${monthLabel}`)}
      info={
        feeAware
          ? `Honorários gerados em Contas a receber para a competência ${compLabel} (mês do serviço), que vencem em ${monthLabel}. Recebido e em aberto contam só esses lançamentos. O previsto não inclui a taxa por empregado.${income.data?.truncated ? ` Calculado sobre os ${MONTH_ROWS_LIMIT.toLocaleString('pt-BR')} primeiros lançamentos do mês.` : ''}`
          : `Receitas lançadas para clientes em ${monthLabel}, pela data de vencimento. Lançamentos sem cliente vinculado não entram nesta conta. O previsto não inclui a taxa por empregado.`
      }
      alert={alert}
      footer={
        view && data && data.items.length > 0 && !pending && !failed ? (
          <div className="flex items-center justify-between gap-3 text-caption text-muted">
            <p className="min-w-0 truncate">
              <span className="@lg:hidden">
                Em aberto <span className={cn('font-semibold tabular', view.overdue > 0 ? 'text-danger' : 'text-fg')}>{formatBRL(view.open)}</span>
                {' · '}
              </span>
              {view.missing.length > 0
                ? `${pluralize(view.missing.length, 'cliente', 'clientes')} sem ${feeAware ? 'honorário gerado' : 'lançamento no mês'}`
                : feeAware
                  ? 'Todos os clientes com honorário gerado'
                  : 'Todos os clientes com lançamento'}
            </p>
            {feeAware && view.missing.length > 0 ? (
              <Link to="/contas-a-receber" className="shrink-0 font-medium whitespace-nowrap text-brand-text hover:underline">
                Gerar honorários →
              </Link>
            ) : null}
          </div>
        ) : undefined
      }
    >
      {body}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Cadastro incompleto
// ---------------------------------------------------------------------------

/** Active clients missing e-mail, phone, responsible person or city, the most incomplete first. */
export function IncompleteClientsWidget({ alert }: WidgetProps) {
  const clients = useOfficeClients();
  const data = clients.data;
  const items = useMemo(() => (data ? incompleteClients(data.items) : []), [data]);

  let body;
  if (clients.isPending) {
    body = <ListSkeleton rowClassName="h-9" />;
  } else if (clients.isError) {
    body = <ErrorState error={clients.error} onRetry={() => clients.refetch()} className="p-3" />;
  } else if (!data || data.items.length === 0) {
    body = <NoClients />;
  } else if (items.length === 0) {
    body = <BodyEmpty icon={<ClipboardCheck />} title="Todos os cadastros estão completos" />;
  } else {
    body = (
      <FitList
        items={items}
        getKey={(x) => x.client.id}
        moreLabel="cliente(s)"
        moreHref="/clientes"
        className="flex flex-col gap-0.5"
        renderItem={({ client, missing }) => (
          <Link
            to={clientHref(client.id)}
            className="flex flex-col gap-0.5 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-muted @lg:grid @lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] @lg:items-center @lg:gap-4 @2xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
            aria-label={`${client.name}: falta ${missing.join(', ')}`}
          >
            <span className="min-w-0 truncate text-[12px] font-semibold text-fg" title={client.name}>
              {client.name}
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-1">
              <span className="text-micro text-muted">falta</span>
              {missing.map((m) => (
                <span key={m} className="rounded-full bg-warning-soft px-1.5 text-micro leading-4 font-medium text-warning">
                  {m}
                </span>
              ))}
            </span>
          </Link>
        )}
      />
    );
  }

  return (
    <WidgetCard
      subtitle={items.length ? `${pluralize(items.length, 'cliente ativo', 'clientes ativos')} com dados faltando` : 'Sem e-mail, telefone, responsável ou cidade'}
      alert={alert}
    >
      {body}
    </WidgetCard>
  );
}

