import { useMemo, type ComponentProps } from 'react';
import { useNavigate } from 'react-router';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartColumn } from 'lucide-react';
import {
  addDays,
  addMonths,
  endOfMonth,
  formatBRL,
  formatMonthKey,
  startOfMonth,
  startOfYear,
  todayISO,
  type Granularity,
  type ISODate,
} from '@effinance/shared';
import { EmptyState } from '@/components/ui/empty-state';
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
  StripeDefs,
  stripeFill,
  useStripeScope,
} from '@/components/charts/chart-utils';
import { yAxisWidth } from '@/components/charts/chart-scale';
import { useCashflowReport } from '@/features/reports/api';
import { periodLabel, type PeriodMode } from '@/lib/period';
import { useElementSize } from '@/lib/use-element-size';
import { cn } from '@/lib/utils';
import type { DashboardPrefs, WidgetProps } from '../layout/types';
import { useWidgetResizing, WidgetCard } from '../layout/widget-card';

type Mode = DashboardPrefs['fluxoModo'];

const RANGES: Record<Exclude<Mode, 'M'>, { granularity: Granularity; from: (t: ISODate) => ISODate; to: (t: ISODate) => ISODate }> = {
  D: { granularity: 'day', from: (t) => addDays(t, -13), to: (t) => t },
  S: { granularity: 'week', from: (t) => addDays(t, -7 * 7), to: (t) => t },
  A: { granularity: 'year', from: (t) => `${Number(t.slice(0, 4)) - 3}-01-01`, to: (t) => `${t.slice(0, 4)}-12-31` },
};

const MODES: { value: Mode; label: string; title: string; range: string }[] = [
  { value: 'D', label: 'D', title: 'Últimos 14 dias', range: 'dos últimos 14 dias' },
  { value: 'S', label: 'S', title: 'Últimas 8 semanas', range: 'das últimas 8 semanas' },
  { value: 'M', label: 'M', title: 'Últimos 6 meses', range: 'dos últimos 6 meses' },
  { value: 'A', label: 'A', title: 'Últimos 4 anos', range: 'dos últimos 4 anos' },
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
}

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
  const scope = useStripeScope();
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

  const rows = useMemo<Row[]>(() => {
    if (mode === 'M') {
      return (d?.monthly ?? []).map((m) => ({
        label: formatMonthKey(m.month, 'short').split('/')[0]!,
        start: `${m.month}-01`,
        receita: m.income,
        despesa: m.expense,
        projected: false,
      }));
    }
    return (cashflow.data?.periods ?? []).map((p) => ({
      label: p.label.replace('Sem ', ''),
      start: p.start,
      receita: p.inflow,
      despesa: p.outflow,
      projected: p.projected,
    }));
  }, [mode, d?.monthly, cashflow.data]);

  const totals = useMemo(
    () => rows.reduce((acc, r) => ({ receita: acc.receita + r.receita, despesa: acc.despesa + r.despesa }), { receita: 0, despesa: 0 }),
    [rows],
  );

  const isLoading = mode === 'M' ? loading || !d : cashflow.isPending;
  const failed = mode !== 'M' && cashflow.isError;
  const empty = !isLoading && !failed && rows.every((r) => r.receita === 0 && r.despesa === 0);
  const current = MODES.find((m) => m.value === mode) ?? MODES[2]!;

  const yWidth = yAxisWidth(rows.flatMap((r) => [r.receita, r.despesa]));
  const ticks = labelTicks(rows, box.width - yWidth - 8);

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
      <EmptyState
        compact
        className="min-h-0 flex-1"
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
            <LegendDot size="sm" color={CHART_COLORS.income} label="Receitas" striped />
            <span className="hidden text-caption font-medium text-fg tabular @md:inline">{formatBRL(totals.receita)}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <LegendDot size="sm" color={CHART_COLORS.expense} label="Despesas" striped />
            <span className="hidden text-caption font-medium text-fg tabular @md:inline">{formatBRL(totals.despesa)}</span>
          </span>
        </div>
        <div
          ref={box.ref}
          role="img"
          aria-label={`Receitas e despesas ${current.range}: receitas ${formatBRL(totals.receita)}, despesas ${formatBRL(totals.despesa)}.`}
          className="mt-2 flex min-h-0 flex-1 flex-col"
        >
          <ChartBox className="cursor-pointer">
            <BarChart
              data={rows}
              barCategoryGap="22%"
              barGap={4}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
              accessibilityLayer={false}
              onClick={(state) => openPeriod(state.activeTooltipIndex)}
            >
              <StripeDefs scope={scope} />
              <CartesianGrid vertical={false} stroke="var(--app-chart-grid)" strokeDasharray="4 4" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: CHART_COLORS.axis, fontSize: CHART_TEXT.category }}
                ticks={ticks}
                interval={ticks ? 0 : 'preserveStartEnd'}
              />
              <YAxis {...axisProps} width={yWidth} tickCount={4} tickFormatter={moneyAxisFormatter} />
              <Tooltip cursor={{ fill: 'var(--app-bg-subtle)', radius: 8 }} content={<CashflowTooltip mode={mode} />} />
              <Bar
                dataKey="receita"
                name="receita"
                fill={stripeFill('income', scope)}
                radius={[8, 8, 8, 8]}
                maxBarSize={44}
                isAnimationActive={!resizing}
              />
              <Bar
                dataKey="despesa"
                name="despesa"
                fill={stripeFill('expense', scope)}
                radius={[8, 8, 8, 8]}
                maxBarSize={44}
                isAnimationActive={!resizing}
              />
            </BarChart>
          </ChartBox>
        </div>
      </>
    );
  }

  return (
    <WidgetCard
      alert={alert}
      subtitle={mode === 'M' ? 'Receita vs despesa mensal' : 'Entradas vs saídas nas contas'}
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
