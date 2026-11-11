import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarClock } from 'lucide-react';
import { formatBRL, formatMonthKey, type DelinquencyClient, type DelinquencyMonth, type MonthKey } from '@effinance/shared';
import { axisProps, CHART_COLORS, CHART_TEXT, ChartBox, LegendDot, moneyAxisFormatter, StripeDefs, stripeFill, useStripeScope } from '@/components/charts/chart-utils';
import { niceDomain, trimLeadingEmpty, yAxisWidth } from '@/components/charts/chart-scale';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { cn, pluralize } from '@/lib/utils';
import { formatDays, lateFinding, lateTrend, monthBars, type BarMode, type MonthBar } from '../delinquency-view';
import { MonthTick } from './month-tick';

const ON_TIME = 'var(--app-data)';
const PAID_LATE = 'var(--app-warning)';
const OPEN_LATE = CHART_COLORS.danger;

const CHART_HELP =
  'Cada barra é um mês de vencimento: as mensalidades pagas no prazo, as pagas com atraso e as que venceram e seguem em aberto. No topo, a parte com atraso (em vermelho quando passa da média do período). O mês corrente ainda não teve tempo de atrasar e fica sem taxa.';

const wholePercent = (ratio: number) => `${Math.round(ratio * 100)}%`;

interface Point extends MonthBar {
  /** "Out/26" (the axis value; "parcial" goes on a second line). */
  tick: string;
  source: DelinquencyMonth;
  /** Days since the oldest receivable of the month still open (from the clients' overdue lists). */
  openAge: number | null;
}

/** Oldest open receivable of each due month, in days (the tooltip says "vencida há N dias"). */
function openAges(clients: readonly DelinquencyClient[]): Map<MonthKey, number> {
  const ages = new Map<MonthKey, number>();
  for (const c of clients) {
    for (const item of c.overdue) {
      const month = item.date.slice(0, 7) as MonthKey;
      ages.set(month, Math.max(ages.get(month) ?? 0, item.daysLate));
    }
  }
  return ages;
}

/**
 * "Como cada mês foi pago" (spec §5.1): one stacked bar per due month (no prazo · pago com atraso ·
 * vencido em aberto), by count or by value, the late share on top and the current month marked as
 * partial. One axis; the days late live in the tooltip (only the ones paid late).
 */
export function DelinquencyChart({ monthly, clients, lateRate }: { monthly: DelinquencyMonth[]; clients: readonly DelinquencyClient[]; lateRate: number }) {
  const [mode, setMode] = useState<BarMode>('count');
  const scope = useStripeScope();
  const ages = useMemo(() => openAges(clients), [clients]);
  // Leading months without receivables say nothing (a new office): start at the first one, 4 at least.
  const data = useMemo<Point[]>(() => {
    const bars = monthBars(monthly, mode).map((bar, i) => ({ ...bar, tick: formatMonthKey(bar.month, 'short'), source: monthly[i]!, openAge: ages.get(bar.month) ?? null }));
    return bars.slice(trimLeadingEmpty(monthly.map((m) => m.dueCount)));
  }, [monthly, mode, ages]);
  const hasData = data.some((d) => d.onTime + d.paidLate + d.openLate > 0);
  const axis = niceDomain(data.map((d) => d.onTime + d.paidLate + d.openLate));
  const tick = mode === 'count' ? (v: number) => String(v) : moneyAxisFormatter;
  // Red label above the period's average (by count or by value, as the bars).
  const complete = data.filter((d) => !d.partial);
  const totalLate = complete.reduce((s, d) => s + d.paidLate + d.openLate, 0);
  const total = complete.reduce((s, d) => s + d.onTime + d.paidLate + d.openLate, 0);
  const average = total > 0 ? totalLate / total : 0;
  const trend = lateTrend(monthly);
  const partial = data.find((d) => d.partial);
  const modeControl = (
    <SegmentedControl<BarMode>
      size="sm"
      ariaLabel="Medida do gráfico"
      value={mode}
      onChange={setMode}
      options={[
        { value: 'count', label: 'Quantidade' },
        { value: 'amount', label: 'Valor' },
      ]}
    />
  );

  return (
    <Card className="@container flex min-w-0 flex-col p-4 sm:p-5">
      <CardHeader
        title="Como cada mês foi pago"
        info={CHART_HELP}
        subtitle={
          trend ? (
            <>
              {'Últimos 3 meses: '}
              <b className={cn('font-semibold', trend.recent > trend.previous ? 'text-danger' : 'text-fg')}>{`${wholePercent(trend.recent)} com atraso`}</b>
              {` (eram ${wholePercent(trend.previous)} nos 3 anteriores)`}
            </>
          ) : (
            lateFinding(monthly, lateRate)
          )
        }
        action={<span className="hidden @[480px]:block">{modeControl}</span>}
      />
      {/* Narrow cards: the control under the title, so the title keeps its width. */}
      <div className="mt-3 @[480px]:hidden">{modeControl}</div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <LegendDot size="sm" color={ON_TIME} label="No prazo" />
        <LegendDot size="sm" color={PAID_LATE} label="Pago com atraso" />
        <LegendDot size="sm" color={OPEN_LATE} label="Vencido em aberto" striped />
        <span className="text-caption text-subtle">· no topo: % com atraso</span>
      </div>
      {hasData ? (
        <>
          <div className="mt-2 flex h-64 flex-col sm:h-72" role="img" aria-label={`${lateFinding(monthly, lateRate)}. ${data.map((d) => `${d.label}: ${d.rate === null ? 'sem taxa' : wholePercent(d.rate)}`).join('; ')}.`}>
            <ChartBox>
              <BarChart data={data} margin={{ top: 18, right: 4, left: 0, bottom: 0 }} barCategoryGap="26%" accessibilityLayer={false}>
                <StripeDefs scope={scope} />
                <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} strokeDasharray="4 4" />
                <XAxis dataKey="tick" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={4} height={30} tick={<MonthTick partial={partial?.tick} />} />
                <YAxis {...axisProps} domain={axis.domain} ticks={axis.ticks} interval={0} allowDecimals={false} tickFormatter={tick} width={yAxisWidth(axis.ticks, tick)} />
                <Tooltip cursor={{ fill: 'var(--app-bg-subtle)', radius: 6 }} content={<PaidTooltip mode={mode} />} />
                {SEGMENTS.map((seg) => (
                  <Bar key={seg} dataKey={seg} name={SEGMENT_NAMES[seg]} stackId="paid" fill={seg === 'openLate' ? stripeFill('danger', scope) : SEGMENT_FILL[seg]} maxBarSize={36} isAnimationActive={false}>
                    {data.map((d) => (
                      <Cell key={d.month} fillOpacity={d.partial ? 0.6 : 1} />
                    ))}
                    {/* The rate sits on the top non-empty segment of each month (the others get no value). */}
                    {data.length <= 13 ? (
                      <LabelList dataKey={(d: Point) => (topSegment(d) === seg ? d.rate : null)} position="top" content={<RateLabel average={average} />} />
                    ) : null}
                  </Bar>
                ))}
              </BarChart>
            </ChartBox>
          </div>
          <p className="mt-2 text-caption text-subtle">
            {partial
              ? `Por mês de vencimento. ${formatMonthKey(partial.month).split(' ')[0]} parcial: ainda não teve tempo de atrasar, fica sem taxa.`
              : 'Por mês de vencimento.'}
          </p>
        </>
      ) : (
        <EmptyState compact className="mt-4" icon={<CalendarClock />} title="Nenhuma mensalidade vencida no período" description="O gráfico aparece quando houver recebimentos de clientes com vencimento nestes meses." />
      )}
    </Card>
  );
}

const SEGMENTS = ['onTime', 'paidLate', 'openLate'] as const;
type Segment = (typeof SEGMENTS)[number];
const SEGMENT_NAMES: Record<Segment, string> = { onTime: 'No prazo', paidLate: 'Pago com atraso', openLate: 'Vencido em aberto' };
const SEGMENT_FILL: Record<Segment, string> = { onTime: ON_TIME, paidLate: PAID_LATE, openLate: OPEN_LATE };

/** The highest non-empty segment of a month (where its rate is drawn). */
function topSegment(p: Pick<MonthBar, Segment>): Segment | null {
  return [...SEGMENTS].reverse().find((seg) => p[seg] > 0) ?? null;
}

/** "34%" over the stack; red when above the period's average; nothing in the partial month. */
function RateLabel(props: { x?: number | string; y?: number | string; width?: number | string; value?: unknown; average: number }) {
  const { value, average } = props;
  if (typeof value !== 'number') return null;
  const x = Number(props.x ?? 0) + Number(props.width ?? 0) / 2;
  const y = Number(props.y ?? 0) - 5;
  const high = value > average + 1e-9;
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={CHART_TEXT.axis} fontWeight={high ? 600 : 500} fill={high ? 'var(--app-danger)' : 'var(--app-muted)'} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {wholePercent(value)}
    </text>
  );
}

function PaidTooltip({ active, payload, mode }: { active?: boolean; payload?: readonly { payload?: Point }[]; mode: BarMode }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const m = p.source;
  const value = (count: number, amount: number) => (mode === 'count' ? String(count) : formatBRL(amount));
  return (
    <div className="w-[236px] rounded-lg border border-border bg-surface px-2.5 py-2 text-caption shadow-lg">
      <p className="mb-1.5 font-semibold text-muted">{`${formatMonthKey(m.month).split(' ')[0]} · ${pluralize(m.dueCount, 'mensalidade', 'mensalidades')}${m.partial ? ' · parcial' : ''}`}</p>
      {m.dueCount === 0 ? (
        <p className="text-muted">Nenhuma mensalidade vencida.</p>
      ) : (
        <div className="flex flex-col gap-1">
          <Row color={ON_TIME} label="No prazo" value={value(m.onTimeCount, m.onTimeAmount)} />
          <Row color={PAID_LATE} label="Pagas com atraso" value={value(m.paidLateCount, m.paidLateAmount)} />
          {m.paidLateAvgDays !== null ? <p className="-mt-0.5 pl-3.5 text-micro text-subtle">{`média de ${formatDays(m.paidLateAvgDays)} de atraso`}</p> : null}
          <Row color={OPEN_LATE} striped label="Vencidas em aberto" value={value(m.openLateCount, m.openLateAmount)} />
          {m.openLateCount > 0 && p.openAge !== null ? <p className="-mt-0.5 pl-3.5 text-micro text-subtle">{`a mais antiga vencida há ${formatDays(p.openAge)}`}</p> : null}
          <div className="mt-0.5 flex justify-between gap-3 border-t border-border pt-1.5 text-muted">
            <span className="whitespace-nowrap">{p.rate === null ? 'mês parcial, sem taxa' : `${wholePercent(p.rate)} com atraso`}</span>
            {m.lateAmount > 0 ? <span className="tabular font-semibold whitespace-nowrap text-fg">{`${formatBRL(m.lateAmount)} em atraso`}</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ color, label, value, striped }: { color: string; label: string; value: string; striped?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <LegendDot size="sm" color={color} label={label} striped={striped} />
      <span className="tabular font-semibold whitespace-nowrap text-fg">{value}</span>
    </div>
  );
}
