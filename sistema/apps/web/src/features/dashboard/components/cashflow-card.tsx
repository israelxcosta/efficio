import { useMemo, type ComponentProps } from 'react';
import { useNavigate } from 'react-router';
import { Bar, CartesianGrid, ComposedChart, LabelList, Line, Tooltip, XAxis, YAxis } from 'recharts';
import { Check, ChartColumn } from 'lucide-react';
import {
  addDays,
  addMonths,
  endOfMonth,
  formatBRL,
  formatMonthKey,
  startOfMonth,
  startOfYear,
  todayISO,
  type EvolutionMonth,
  type Granularity,
  type ISODate,
  type MonthKey,
} from '@effinance/shared';
import { ErrorState } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import {
  axisProps,
  CHART_COLORS,
  CHART_TEXT,
  ChartBox,
  LegendDot,
  moneyAxisFormatter,
  MoneyTooltip,
} from '@/components/charts/chart-utils';
import { niceDomain, yAxisWidth } from '@/components/charts/chart-scale';
import { useCashflowReport, useEvolutionReport } from '@/features/reports/api';
import { periodLabel, type PeriodMode } from '@/lib/period';
import { useElementSize } from '@/lib/use-element-size';
import { cn } from '@/lib/utils';
import type { DashboardPrefs, WidgetProps } from '../layout/types';
import { useWidgetResizing, WidgetCard } from '../layout/widget-card';
import { cashflowInsight } from '../widgets/insight-lines';
import { BodyEmpty } from '../widgets/shared';

type Mode = DashboardPrefs['fluxoModo'];

const RANGES: Record<Exclude<Mode, 'M'>, { granularity: Granularity; from: (t: ISODate) => ISODate; to: (t: ISODate) => ISODate }> = {
  D: { granularity: 'day', from: (t) => addDays(t, -13), to: (t) => t },
  S: { granularity: 'week', from: (t) => addDays(t, -7 * 7), to: (t) => t },
  A: { granularity: 'year', from: (t) => `${Number(t.slice(0, 4)) - 3}-01-01`, to: (t) => `${t.slice(0, 4)}-12-31` },
};

const MODES: { value: Mode; label: string; title: string; range: string; many: string }[] = [
  { value: 'D', label: 'D', title: 'Últimos 14 dias', range: 'dos últimos 14 dias', many: 'dias' },
  { value: 'S', label: 'S', title: 'Últimas 8 semanas', range: 'das últimas 8 semanas', many: 'semanas' },
  { value: 'M', label: 'M', title: 'Últimos 6 meses', range: 'dos últimos 6 meses', many: 'meses' },
  { value: 'A', label: 'A', title: 'Últimos 4 anos', range: 'dos últimos 4 anos', many: 'anos' },
];

const PERIOD_MODE: Record<Mode, PeriodMode> = { D: 'day', S: 'week', M: 'month', A: 'year' };

/** Room per X label (Effy: about one label every 58px); short labels ("Out", "2026") need less. */
const LABEL_PX = 58;

interface Row {
  label: string;
  start: ISODate;
  receita: number;
  despesa: number;
  projected: boolean;
  /** Active clients at the end of the month (mode M; null without it in the evolution). */
  clientes: number | null;
  clientesDiff: number | null;
}

const CLIENTS_COLOR = 'var(--app-fg)';
const monthIndex = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;

/**
 * Months the evolution report must cover so its window (which always ends in the current month)
 * reaches the 6 months of the chart ending in `month`: the gap + 6, up to the API's 36.
 */
export function evolutionMonthsFor(month: MonthKey, current: MonthKey): number {
  return Math.min(36, Math.max(0, monthIndex(current) - monthIndex(month)) + 6);
}

/** Each row with the active clients of its month and the change against the previous one (null where the evolution has none). */
export function withActiveClients<R extends { start: ISODate }>(
  rows: readonly R[],
  months: readonly EvolutionMonth[] | undefined,
): (R & { clientes: number | null; clientesDiff: number | null })[] {
  const byMonth = new Map((months ?? []).map((m) => [m.month, m]));
  return rows.map((r) => {
    const m = byMonth.get(r.start.slice(0, 7) as MonthKey);
    return { ...r, clientes: m ? m.activeClients : null, clientesDiff: m ? m.netChange : null };
  });
}

/** Ticks of the clients' axis aligned with the money grid: as many marks, integer steps, some headroom. */
function clientTicks(max: number, count: number): number[] {
  const marks = Math.max(2, count);
  const step = Math.max(1, Math.ceil((max * 1.25) / (marks - 1)));
  return Array.from({ length: marks }, (_, i) => i * step);
}
const clientTick = (v: number) => `${v} cl.`;

/** Statement of the period behind a bar (the statement reads `modo`/`data` through useScreenPeriod). */
export function statementHref(mode: Mode, start: ISODate): string {
  const data = mode === 'M' ? startOfMonth(start) : mode === 'A' ? startOfYear(start) : start;
  return `/extrato?modo=${PERIOD_MODE[mode]}&data=${data}`;
}

/** X labels that fit `width`, counted back from the last period so the latest is always shown. */
export function labelTicks(rows: readonly { label: string }[], width: number): string[] | undefined {
  if (width <= 0 || rows.length === 0) return undefined;
  const longest = rows.reduce((m, r) => Math.max(m, r.label.length), 0);
  const room = Math.min(LABEL_PX, longest * 7 + 18);
  const step = Math.ceil(rows.length / Math.max(1, Math.floor(width / room)));
  const ticks: string[] = [];
  for (let i = rows.length - 1; i >= 0; i -= step) ticks.unshift(rows[i]!.label);
  return ticks;
}

type TooltipProps = ComponentProps<typeof MoneyTooltip>;

/** Receitas / Despesas of the hovered period, its balance and the click hint. */
function CashflowTooltip({ mode, ...props }: TooltipProps & { mode: Mode }) {
  const row = props.payload?.[0]?.payload as Row | undefined;
  return (
    <MoneyTooltip
      {...props}
      payload={props.payload?.filter((p) => p.dataKey !== 'clientes')}
      names={{ receita: 'Receitas', despesa: 'Despesas' }}
      labelFormatter={() => (row ? periodLabel({ mode: PERIOD_MODE[mode], anchor: row.start }) : null)}
      footer={() => {
        if (!row) return null;
        const net = row.receita - row.despesa;
        return (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted">Saldo</span>
              <span className={cn('tabular font-semibold whitespace-nowrap', net < 0 ? 'text-danger' : 'text-success')}>{formatBRL(net)}</span>
            </div>
            {row.clientes !== null && props.payload?.some((p) => p.dataKey === 'clientes') ? (
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="h-0.5 w-2.5 rounded-full bg-fg" aria-hidden />
                  Clientes ativos
                </span>
                <span className="tabular font-semibold whitespace-nowrap text-fg">
                  {row.clientes}
                  {row.clientesDiff ? <span className="font-normal text-muted">{` (${row.clientesDiff > 0 ? '+' : '−'}${Math.abs(row.clientesDiff)})`}</span> : null}
                </span>
              </div>
            ) : null}
            <p className="mt-1 text-micro text-subtle">Clique para ver o extrato</p>
          </>
        );
      }}
    />
  );
}

/** "Fluxo de caixa": receitas × despesas by day, week, month or year; a bar opens its statement. */
export function CashflowWidget({ month, d, loading, prefs, setPref, alert }: WidgetProps) {
  const mode = prefs.fluxoModo;
  const navigate = useNavigate();
  const resizing = useWidgetResizing();
  const box = useElementSize();

  const today = todayISO();
  const anchor = month === today.slice(0, 7) ? today : endOfMonth(`${month}-01`);
  const cfg = mode === 'M' ? null : RANGES[mode];
  const cashflow = useCashflowReport(
    cfg
      ? { from: cfg.from(anchor), to: cfg.to(anchor), granularity: cfg.granularity }
      : { from: startOfMonth(addMonths(anchor, -5)), to: anchor, granularity: 'month' },
    mode !== 'M',
  );

  // Mode M: the active clients of each month (spec §4.5), from the evolution report.
  const evolution = useEvolutionReport({ months: evolutionMonthsFor(month as MonthKey, today.slice(0, 7) as MonthKey) }, mode === 'M');

  const rows = useMemo<Row[]>(() => {
    if (mode === 'M') {
      return withActiveClients(
        (d?.monthly ?? []).map((m) => ({
          label: formatMonthKey(m.month, 'short').split('/')[0]!,
          start: `${m.month}-01`,
          receita: m.income,
          despesa: m.expense,
          projected: false,
        })),
        evolution.data?.months,
      );
    }
    return (cashflow.data?.periods ?? []).map((p) => ({
      label: p.label.replace('Sem ', ''),
      start: p.start,
      receita: p.inflow,
      despesa: p.outflow,
      projected: p.projected,
      clientes: null,
      clientesDiff: null,
    }));
  }, [mode, d?.monthly, cashflow.data, evolution.data]);
  // The line shows in mode M when some month has active clients (not in a personal space); the chip turns it off.
  const hasClients = mode === 'M' && rows.some((r) => (r.clientes ?? 0) > 0);
  const showClients = hasClients && prefs.fluxoClientes;
  const lastClients = rows.reduce((last, r, i) => (r.clientes !== null ? i : last), -1);

  const totals = useMemo(
    () => rows.reduce((acc, r) => ({ receita: acc.receita + r.receita, despesa: acc.despesa + r.despesa }), { receita: 0, despesa: 0 }),
    [rows],
  );

  const isLoading = mode === 'M' ? loading || !d : cashflow.isPending;
  const failed = mode !== 'M' && cashflow.isError;
  const empty = !isLoading && !failed && rows.every((r) => r.receita === 0 && r.despesa === 0);
  const current = MODES.find((m) => m.value === mode) ?? MODES[2]!;
  const finding = isLoading || failed ? null : cashflowInsight(rows, current);

  const axis = niceDomain(rows.flatMap((r) => [r.receita, r.despesa]));
  const yWidth = yAxisWidth(axis.ticks);
  const rightTicks = clientTicks(Math.max(0, ...rows.map((r) => r.clientes ?? 0)), axis.ticks.length);
  const rightWidth = showClients ? yAxisWidth(rightTicks, clientTick) : 0;
  const ticks = labelTicks(rows, box.width - yWidth - rightWidth - 8);

  function openPeriod(index: unknown) {
    const row = rows[Number(index)];
    if (row) navigate(statementHref(mode, row.start));
  }

  let body;
  if (isLoading) {
    body = <Skeleton className="min-h-24 flex-1" />;
  } else if (failed) {
    body = <ErrorState error={cashflow.error} onRetry={() => void cashflow.refetch()} className="flex-1 justify-center" />;
  } else if (empty) {
    body = (
      <BodyEmpty
        icon={<ChartColumn />}
        title="Sem movimentações no período"
        description="Adicione lançamentos para ver o fluxo de caixa aqui."
      />
    );
  } else {
    body = (
      <>
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5">
            <LegendDot size="sm" color={CHART_COLORS.income} label="Receitas" />
            <span className="hidden text-caption font-medium text-fg tabular @md:inline">{formatBRL(totals.receita)}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <LegendDot size="sm" color={CHART_COLORS.negative} label="Despesas" />
            <span className="hidden text-caption font-medium text-fg tabular @md:inline">{formatBRL(totals.despesa)}</span>
          </span>
          {hasClients ? (
            <button
              type="button"
              aria-pressed={prefs.fluxoClientes}
              onClick={() => setPref('fluxoClientes', !prefs.fluxoClientes)}
              className={cn(
                'inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-caption font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/25',
                prefs.fluxoClientes ? 'border-border-strong text-fg' : 'border-border text-subtle hover:text-muted',
              )}
            >
              {prefs.fluxoClientes ? <Check className="size-3" aria-hidden /> : null}
              <span className={cn('h-0.5 w-3 rounded-full', prefs.fluxoClientes ? 'bg-fg' : 'bg-subtle')} aria-hidden />
              Clientes ativos <span className="hidden @sm:inline">(eixo direito)</span>
            </button>
          ) : null}
        </div>
        <div
          ref={box.ref}
          role="img"
          aria-label={`${finding ? `${finding}. ` : ''}Receitas e despesas ${current.range}: receitas ${formatBRL(totals.receita)}, despesas ${formatBRL(totals.despesa)}.${showClients && lastClients >= 0 ? ` Clientes ativos: ${rows[lastClients]!.clientes}.` : ''}`}
          className="mt-2 flex min-h-0 flex-1 flex-col"
        >
          <ChartBox className="cursor-pointer">
            <ComposedChart
              data={rows}
              barCategoryGap="22%"
              barGap={4}
              margin={{ top: showClients ? 16 : 4, right: 4, bottom: 0, left: 0 }}
              accessibilityLayer={false}
              onClick={(state) => openPeriod(state.activeTooltipIndex)}
            >
              <CartesianGrid vertical={false} yAxisId="money" stroke="var(--app-chart-grid)" strokeDasharray="4 4" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: CHART_COLORS.axis, fontSize: CHART_TEXT.category }}
                ticks={ticks}
                interval={ticks ? 0 : 'preserveStartEnd'}
              />
              <YAxis yAxisId="money" {...axisProps} width={yWidth} domain={axis.domain} ticks={axis.ticks} interval={0} tickFormatter={moneyAxisFormatter} />
              {/* The one dual axis of the product (spec §4.5): the clients are read on their own, never against the bars. */}
              {showClients ? (
                <YAxis
                  yAxisId="clientes"
                  orientation="right"
                  {...axisProps}
                  width={rightWidth}
                  domain={[0, rightTicks.at(-1)!]}
                  ticks={rightTicks}
                  interval={0}
                  allowDecimals={false}
                  tickFormatter={clientTick}
                />
              ) : null}
              <Tooltip cursor={{ fill: 'var(--app-bg-subtle)', radius: 8 }} content={<CashflowTooltip mode={mode} />} />
              <Bar
                yAxisId="money"
                dataKey="receita"
                name="receita"
                fill={CHART_COLORS.income}
                radius={[4, 4, 0, 0]}
                maxBarSize={44}
                isAnimationActive={!resizing}
              />
              <Bar
                yAxisId="money"
                dataKey="despesa"
                name="despesa"
                fill={CHART_COLORS.negative}
                radius={[4, 4, 0, 0]}
                maxBarSize={44}
                isAnimationActive={!resizing}
              />
              {showClients ? (
                <Line
                  yAxisId="clientes"
                  dataKey="clientes"
                  name="clientes"
                  type="linear"
                  stroke={CLIENTS_COLOR}
                  strokeWidth={1.5}
                  dot={{ r: 3, fill: CLIENTS_COLOR, strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="clientes"
                    content={(p: { x?: number | string; y?: number | string; index?: number; value?: unknown }) =>
                      p.index === lastClients ? (
                        <text x={Number(p.x ?? 0)} y={Number(p.y ?? 0) - 8} textAnchor="end" fontSize={CHART_TEXT.axis} fontWeight={600} fill="var(--app-fg)">
                          {`${String(p.value)} clientes`}
                        </text>
                      ) : null
                    }
                  />
                </Line>
              ) : null}
            </ComposedChart>
          </ChartBox>
        </div>
      </>
    );
  }

  return (
    <WidgetCard
      alert={alert}
      subtitle={finding ?? (mode === 'M' ? 'Receita vs despesa mensal' : 'Entradas vs saídas nas contas')}
      info="Mensal (M) usa a competência dos lançamentos. D, S e A mostram o dinheiro que entrou e saiu das contas. Clique numa barra para abrir o extrato do período."
      action={
        <SegmentedControl
          size="sm"
          ariaLabel="Período do gráfico"
          value={mode}
          onChange={(m) => setPref('fluxoModo', m)}
          options={MODES.map(({ value, label, title }) => ({ value, label, title }))}
        />
      }
    >
      {body}
    </WidgetCard>
  );
}
