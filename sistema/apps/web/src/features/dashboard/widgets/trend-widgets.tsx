import { useMemo, type ComponentProps } from 'react';
import { useNavigate } from 'react-router';
import { Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Line, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartColumnStacked, TrendingUp } from 'lucide-react';
import { formatBRL, formatCompactBRL, formatMonthKey, todayISO, type MonthKey } from '@effinance/shared';
import {
  axisProps,
  CHART_COLORS,
  CHART_TEXT,
  ChartBox,
  LegendDot,
  moneyAxisFormatter,
  MoneyTooltip,
  SERIES_PALETTE,
  StripeDefs,
  stripeFill,
  useStripeScope,
} from '@/components/charts/chart-utils';
import { trimLeadingEmpty, yAxisWidth } from '@/components/charts/chart-scale';
import { ErrorState } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { useCategoryReport } from '@/features/reports/api';
import { categoryListHref } from '@/features/transactions/links';
import { useElementSize } from '@/lib/use-element-size';
import { useTone } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { WidgetProps } from '../layout/types';
import { useWidgetResizing, WidgetCard } from '../layout/widget-card';
import { BodyEmpty } from './shared';
import {
  changeText,
  changeTone,
  evolutionData,
  fitTicks,
  groupSeries,
  maxAbsIndex,
  monthWindow,
  OTHERS_KEY,
  shortMonth,
  type EvolutionData,
  type EvolutionRow,
} from './trend-math';

type Side = 'income' | 'expense';

const TYPE_OPTIONS: { value: Side; label: string }[] = [
  { value: 'expense', label: 'Despesas' },
  { value: 'income', label: 'Receitas' },
];

const SIDE_COLOR: Record<Side, string> = { income: CHART_COLORS.income, expense: CHART_COLORS.expense };

const TONE_TEXT = { success: 'text-success', danger: 'text-danger', neutral: 'text-muted' } as const;
const TONE_BADGE = {
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-bg-subtle text-muted',
} as const;

/** "out/26": Effy's short month for hints and chips. */
const monthShort = (month: MonthKey) => shortMonth(month, true).toLowerCase();

function TypeControl({ value, onChange }: { value: Side; onChange: (v: Side) => void }) {
  return <SegmentedControl size="sm" ariaLabel="Tipo" value={value} onChange={onChange} options={TYPE_OPTIONS} />;
}

/** Short value above one column (the highest). */
function PeakLabel(props: { x?: unknown; y?: unknown; width?: unknown; value?: unknown; index?: number; peak: number }) {
  if (props.index !== props.peak) return null;
  const x = Number(props.x ?? 0) + Number(props.width ?? 0) / 2;
  return (
    <text
      x={x}
      y={Number(props.y ?? 0) - 5}
      textAnchor="middle"
      fill="var(--app-fg)"
      fontSize={CHART_TEXT.value}
      fontWeight={600}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {formatCompactBRL(Number(props.value ?? 0))}
    </text>
  );
}

// ---------------------------------------------------------------------------
// Evolução do total
// ---------------------------------------------------------------------------

const MONTHS = 12;
/** Body width (px) from which 2 / 4 stats fit in one row, and the change list sits beside the chart. */
const STATS_2_PX = 384;
const STATS_4_PX = 672;

interface Stat {
  label: string;
  hint: string;
  value: string;
  tone?: keyof typeof TONE_TEXT;
}

/** Number tile: label and a small line on the left, the value on the right. */
function StatTile({ label, hint, value, tone }: Stat) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-surface-muted px-3 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-caption text-muted">{label}</p>
        <p className="truncate text-micro text-subtle">{hint}</p>
      </div>
      <p className={cn('shrink-0 text-body-sm font-semibold tabular', tone ? TONE_TEXT[tone] : 'text-fg')}>{value}</p>
    </div>
  );
}

function evolutionStats(data: EvolutionData, type: Side, month: MonthKey): Stat[] {
  const first = monthWindow(month, MONTHS * 2).from.slice(0, 7);
  const lastBefore = monthWindow(month, MONTHS + 1).from.slice(0, 7);
  return [
    { label: 'Total do período', hint: `${MONTHS} meses até ${monthShort(month)}`, value: formatBRL(data.total) },
    {
      label: 'vs. período anterior',
      hint: data.vsPrevious === null ? 'sem histórico anterior' : `${formatBRL(data.previousTotal)} em ${monthShort(first)}–${monthShort(lastBefore)}`,
      value: changeText(data.vsPrevious),
      tone: changeTone(data.vsPrevious, type),
    },
    { label: 'Média mensal', hint: 'sobre os meses com movimento', value: formatBRL(data.average) },
    { label: 'Maior mês', hint: data.best ? monthShort(data.best.month) : '—', value: data.best ? formatBRL(data.best.value) : '—' },
  ];
}

type TooltipProps = ComponentProps<typeof MoneyTooltip>;

/** Realizado / Em aberto of the hovered month (the trend line is left out). */
function EvolutionTooltip(props: TooltipProps) {
  const row = props.payload?.[0]?.payload as EvolutionRow | undefined;
  return (
    <MoneyTooltip
      {...props}
      payload={props.payload?.filter((p) => p.dataKey !== 'trend')}
      names={{ realizado: 'Realizado', aberto: 'Em aberto' }}
      total
      hideZero
      labelFormatter={() => (row ? formatMonthKey(row.month) : null)}
    />
  );
}

/** "Mês a mês · variação contra o mês anterior" (newest first). */
function ChangeList({ data, type, beside }: { data: EvolutionData; type: Side; beside: boolean }) {
  return (
    <div className={cn('flex min-h-0 flex-col', beside ? 'w-60 shrink-0 border-l border-border pl-4' : 'mt-3 shrink-0 border-t border-border pt-2')}>
      <p className="shrink-0 text-caption font-medium text-muted">Mês a mês · variação contra o mês anterior</p>
      <ul className={cn('mt-1 min-h-0', beside ? 'flex flex-1 flex-col justify-around' : 'grid gap-x-6 @md:grid-cols-2')}>
        {data.changes.map((c) => {
          const tone = changeTone(c.ratio, type);
          return (
            <li key={c.month} className="flex items-center gap-2 py-1 text-caption">
              <span className="w-12 shrink-0 text-muted">{shortMonth(c.month, true)}</span>
              <span className="min-w-0 flex-1 truncate text-right font-medium text-fg tabular">{formatBRL(c.value)}</span>
              <span className={cn('w-16 shrink-0 rounded-full px-1.5 py-px text-center text-micro font-semibold tabular', TONE_BADGE[tone])}>
                {changeText(c.ratio)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "Evolução do total": 12 months of realized and open amounts, with the trend and "hoje". */
export function EvolutionWidget({ month, size, prefs, setPref, alert }: WidgetProps) {
  const type = prefs.evolucaoTipo;
  const resizing = useWidgetResizing();
  const scope = useStripeScope();
  const body = useElementSize();
  const chart = useElementSize();

  const range = monthWindow(month, MONTHS);
  const all = useCategoryReport({ from: monthWindow(month, MONTHS * 2).from, to: range.to, type, granularity: 'month', status: 'all' });
  const paid = useCategoryReport({ ...range, type, granularity: 'month', status: 'paid' });

  const data = useMemo(() => {
    if (!all.data || !paid.data) return null;
    const keys = all.data.periods.slice(-MONTHS).map((p) => p.key);
    const trim = trimLeadingEmpty(all.data.totals.slice(-MONTHS), 4);
    return evolutionData(keys, all.data.totals, paid.data.totals, trim, 6);
  }, [all.data, paid.data]);

  const noun = type === 'expense' ? 'despesa' : 'receita';
  const action = <TypeControl value={type} onChange={(v) => setPref('evolucaoTipo', v)} />;

  let content;
  if (all.isError || paid.isError) {
    content = (
      <ErrorState
        error={all.error ?? paid.error}
        onRetry={() => [all, paid].forEach((q) => q.isError && void q.refetch())}
        className="flex-1 justify-center"
      />
    );
  } else if (!data) {
    content = (
      <div className="flex min-h-0 flex-1 flex-col gap-2" aria-busy="true" aria-label="Carregando">
        <Skeleton className="h-[42px] w-full shrink-0" />
        <Skeleton className="min-h-24 w-full flex-1" />
      </div>
    );
  } else if (data.total === 0) {
    content = <BodyEmpty icon={<TrendingUp />} title={`Nenhum lançamento de ${noun} nos últimos ${MONTHS} meses`} />;
  } else {
    const { rows } = data;
    const color = SIDE_COLOR[type];
    const today = todayISO().slice(0, 7);
    const todayRow = rows.find((r) => r.month === today);
    const todayIsLast = rows[rows.length - 1]?.month === today;
    const peak = maxAbsIndex(rows.map((r) => r.total));
    const yWidth = yAxisWidth(rows.map((r) => r.total));
    const ticks = fitTicks(
      rows.map((r) => r.label),
      chart.width - yWidth - 8,
    );
    const stats = evolutionStats(data, type, month);
    const perRow = body.width >= STATS_4_PX ? 4 : body.width >= STATS_2_PX ? 2 : 1;
    const showList = size.r >= 5 && data.changes.length > 0;
    const beside = showList && body.width >= STATS_4_PX;

    content = (
      <div ref={body.ref} className="flex min-h-0 flex-1 flex-col">
        <div className={cn('grid shrink-0 gap-2', perRow === 4 ? 'grid-cols-4' : perRow === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
          {stats.slice(0, perRow).map((s) => (
            <StatTile key={s.label} {...s} />
          ))}
        </div>
        <div className="mt-2 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
          <LegendDot size="sm" color={color} label="Realizado" />
          {data.hasOpen ? <LegendDot size="sm" color={color} label="Em aberto" striped /> : null}
          <span className="flex items-center gap-1.5 text-caption font-medium text-muted">
            <span className="w-3 border-t-[1.5px] border-dashed border-muted" aria-hidden />
            Tendência
          </span>
          {data.since ? (
            <span className="ml-auto rounded-full bg-bg-subtle px-2 py-px text-micro font-medium text-muted">desde {monthShort(data.since)}</span>
          ) : null}
        </div>
        <div className={cn('mt-2 flex min-h-0 flex-1', beside ? 'flex-row gap-4' : 'flex-col')}>
          <div
            ref={chart.ref}
            role="img"
            aria-label={`Total de ${noun}s por mês nos últimos ${MONTHS} meses: ${formatBRL(data.total)}.${data.best ? ` Maior mês: ${formatMonthKey(data.best.month)}, ${formatBRL(data.best.value)}.` : ''}`}
            className="flex min-h-0 min-w-0 flex-1 flex-col"
          >
            <ChartBox>
              <ComposedChart
                data={rows}
                barCategoryGap="22%"
                margin={{ top: 16, right: todayRow && todayIsLast ? 12 : 4, bottom: 0, left: 0 }}
                accessibilityLayer={false}
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
                <YAxis {...axisProps} width={yWidth} tickCount={4} tickFormatter={moneyAxisFormatter} domain={[0, (max: number) => max * 1.12]} />
                <Tooltip cursor={{ fill: 'var(--app-bg-subtle)', radius: 8 }} content={<EvolutionTooltip />} />
                <Bar dataKey="realizado" name="realizado" stackId="t" fill={color} maxBarSize={56} isAnimationActive={!resizing} />
                <Bar dataKey="aberto" name="aberto" stackId="t" fill={stripeFill(type, scope)} radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={!resizing}>
                  <LabelList dataKey="total" content={(p) => <PeakLabel {...p} peak={peak} />} />
                </Bar>
                <Line
                  dataKey="trend"
                  type="linear"
                  stroke="var(--app-muted)"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  strokeOpacity={0.7}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={!resizing}
                />
                {todayRow ? (
                  <ReferenceLine
                    x={todayRow.label}
                    position="end"
                    stroke={CHART_COLORS.axis}
                    strokeDasharray="3 3"
                    strokeOpacity={0.7}
                    label={{ value: 'hoje', position: 'top', fill: CHART_COLORS.axis, fontSize: CHART_TEXT.axis, offset: 4 }}
                  />
                ) : null}
              </ComposedChart>
            </ChartBox>
          </div>
          {showList ? <ChangeList data={data} type={type} beside={beside} /> : null}
        </div>
      </div>
    );
  }

  return (
    <WidgetCard alert={alert} subtitle="Total por mês, com linha de tendência" action={action}>
      {content}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Composição mês a mês
// ---------------------------------------------------------------------------

const COMPOSITION_MONTHS = 6;
/** Body width (px) from which the legend shows each category's total. */
const LEGEND_TOTALS_PX = 448;

/** Every category of the hovered month, with the month's total. */
function CompositionTooltip({ names, ...props }: TooltipProps & { names: Record<string, string> }) {
  const row = props.payload?.[0]?.payload as { month?: MonthKey } | undefined;
  return (
    <MoneyTooltip
      {...props}
      payload={props.payload ? [...props.payload].reverse() : undefined}
      names={names}
      total
      hideZero
      labelFormatter={() => (row?.month ? formatMonthKey(row.month) : null)}
    />
  );
}

/** "Composição mês a mês": 6 months stacked by category, the largest 8 and "Outras (N)". */
export function CompositionWidget({ month, prefs, setPref, alert }: WidgetProps) {
  const type = prefs.composicaoTipo;
  const navigate = useNavigate();
  const resizing = useWidgetResizing();
  const tone = useTone();
  const body = useElementSize();
  const chart = useElementSize();

  const report = useCategoryReport({ ...monthWindow(month, COMPOSITION_MONTHS), type, granularity: 'month', status: 'all' });
  const r = report.data;

  const { series, rows, grouped } = useMemo(() => {
    const { items, grouped } = groupSeries(r?.series ?? [], 8);
    const series = items.map((s, i) => ({ ...s, color: tone(SERIES_PALETTE[i % SERIES_PALETTE.length]!) }));
    const rows = (r?.periods ?? []).map((p, i) => ({
      month: p.key,
      label: shortMonth(p.key),
      ...Object.fromEntries(series.map((s) => [s.key, s.values[i] ?? 0])),
    }));
    return { series, rows, grouped };
  }, [r, tone]);

  const noun = type === 'expense' ? 'despesa' : 'receita';
  const names = Object.fromEntries(series.map((s) => [s.key, s.name]));

  let content;
  if (report.isError) {
    content = <ErrorState error={report.error} onRetry={() => void report.refetch()} className="flex-1 justify-center" />;
  } else if (!r) {
    content = <Skeleton className="min-h-24 flex-1" />;
  } else if (r.total === 0 || series.length === 0) {
    content = <BodyEmpty icon={<ChartColumnStacked />} title={`Nenhuma ${noun} nos últimos ${COMPOSITION_MONTHS} meses`} />;
  } else {
    const totals = rows.map((row) => series.reduce((a, s) => a + Number((row as Record<string, unknown>)[s.key] ?? 0), 0));
    const yWidth = yAxisWidth(totals);
    const ticks = fitTicks(
      rows.map((row) => row.label),
      chart.width - yWidth - 8,
    );
    const largest = series[0]!;
    content = (
      <div ref={body.ref} className="flex min-h-0 flex-1 flex-col">
        <div
          ref={chart.ref}
          role="img"
          aria-label={`${noun === 'despesa' ? 'Despesas' : 'Receitas'} por categoria nos últimos ${COMPOSITION_MONTHS} meses: total ${formatBRL(r.total)}; maior categoria ${largest.name}, ${formatBRL(largest.total)}.`}
          className="flex min-h-0 flex-1 flex-col"
        >
          <ChartBox>
            <BarChart data={rows} barCategoryGap="22%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }} accessibilityLayer={false}>
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
              <Tooltip cursor={{ fill: 'var(--app-bg-subtle)', radius: 8 }} content={<CompositionTooltip names={names} />} />
              {series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.key}
                  stackId="c"
                  fill={s.color}
                  stroke="var(--app-surface)"
                  strokeWidth={1}
                  radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                  maxBarSize={56}
                  isAnimationActive={!resizing}
                  className={s.categoryId ? 'cursor-pointer' : undefined}
                  onClick={(entry: { payload?: { month?: MonthKey } }) => {
                    if (s.categoryId && s.key !== OTHERS_KEY && entry.payload?.month) navigate(categoryListHref(type, s.categoryId, entry.payload.month));
                  }}
                />
              ))}
            </BarChart>
          </ChartBox>
        </div>
        <ul className="mt-2 flex shrink-0 flex-wrap gap-x-3 gap-y-1" aria-label="Categorias">
          {series.map((s) => (
            <li key={s.key} className="flex min-w-0 items-center gap-1">
              <LegendDot size="sm" color={s.color} label={s.name} />
              {body.width >= LEGEND_TOTALS_PX ? <span className="text-caption font-medium text-fg tabular">{formatBRL(s.total)}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <WidgetCard
      alert={alert}
      subtitle={grouped > 0 ? `Últimos ${COMPOSITION_MONTHS} meses · menores agrupadas em "Outras"` : `Últimos ${COMPOSITION_MONTHS} meses por categoria`}
      info="Total de cada mês dividido pelas categorias (pela data de competência, pagas e em aberto). Clique num bloco para ver os lançamentos daquela categoria no mês."
      action={<TypeControl value={type} onChange={(v) => setPref('composicaoTipo', v)} />}
    >
      {content}
    </WidgetCard>
  );
}
