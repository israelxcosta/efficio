import { useId, useMemo, type ComponentProps } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { TriangleAlert } from 'lucide-react';
import { formatBRL, formatDateBR, type ISODate } from '@effinance/shared';
import { ErrorState } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { axisProps, CHART_COLORS, CHART_TEXT, ChartBox, moneyAxisFormatter, MoneyTooltip } from '@/components/charts/chart-utils';
import { summarizeProjection, yAxisWidth } from '@/components/charts/chart-scale';
import { cn } from '@/lib/utils';
import type { DashboardPrefs, WidgetProps } from '../layout/types';
import { useWidgetResizing, WidgetCard } from '../layout/widget-card';
import { useOverduePayables, useOverdueReceivables, useProjection } from './data';

type Horizon = DashboardPrefs['projecaoDias'];

const HORIZONS = ['30', '60', '90'] as const;

const shortDate = (date: string) => formatDateBR(date).slice(0, 5);

/**
 * Mini-KPI above the chart: label, balance and date. Class strings are joined by hand: `cn`
 * (tailwind-merge) treats the custom sizes (`text-caption`, `text-micro`) as colors and drops them.
 */
function Tile({ label, saldo, date, danger, className }: { label: string; saldo: number; date: ISODate; danger?: boolean; className?: string }) {
  return (
    <div className={cn('flex min-w-[120px] flex-1 flex-col rounded-lg px-3 py-2', danger ? 'bg-danger-soft' : 'bg-surface-muted', className)}>
      <span className={`truncate text-caption ${danger ? 'text-danger' : 'text-muted'}`}>{label}</span>
      <span className={`truncate text-[15px] leading-5 font-semibold tabular ${danger || saldo < 0 ? 'text-danger' : 'text-fg'}`}>{formatBRL(saldo)}</span>
      <span className={`text-micro ${danger ? 'text-danger/80' : 'text-muted'}`}>{formatDateBR(date)}</span>
    </div>
  );
}

/** X labels first / middle / last, anchored inwards so the edge ones stay inside the chart. */
function DateTick({ x = 0, y = 0, index = 0, visibleTicksCount = 1, payload }: { x?: number; y?: number; index?: number; visibleTicksCount?: number; payload?: { value?: string } }) {
  const anchor = index === 0 ? 'start' : index === visibleTicksCount - 1 ? 'end' : 'middle';
  return (
    <text x={x} y={y} dy="0.71em" textAnchor={anchor} fill={CHART_COLORS.axis} fontSize={CHART_TEXT.category}>
      {payload?.value ? shortDate(payload.value) : ''}
    </text>
  );
}

/** MoneyTooltip with the line color on the dot (the area's own fill is a gradient). */
function BalanceTooltip({ color, payload, ...props }: ComponentProps<typeof MoneyTooltip> & { color: string }) {
  return (
    <MoneyTooltip
      {...props}
      payload={payload?.map((p) => ({ ...p, fill: color }))}
      names={{ saldo: 'Saldo previsto' }}
      labelFormatter={(label) => formatDateBR(String(label ?? ''))}
    />
  );
}

/** "Projeção de caixa": balance day by day for the next 30/60/90 days, worst day highlighted. */
export function ProjectionWidget({ prefs, setPref, alert }: WidgetProps) {
  const dias = prefs.projecaoDias;
  const projection = useProjection();
  const receivables = useOverdueReceivables();
  const payables = useOverduePayables();
  const resizing = useWidgetResizing();
  const gradientId = `proj-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const overdueIn = receivables.data?.summary.overdue ?? 0;
  const overdueOut = payables.data?.summary.overdue ?? 0;
  const ready = Boolean(projection.data && receivables.data && payables.data);
  const summary = useMemo(
    () => (ready && projection.data ? summarizeProjection(projection.data, overdueIn - overdueOut, dias) : null),
    [ready, projection.data, overdueIn, overdueOut, dias],
  );

  const failed = [projection, receivables, payables].filter((q) => q.isError);
  const color = summary?.negativeFrom ? 'var(--app-danger)' : 'var(--app-data)';

  const action = (
    <SegmentedControl
      size="sm"
      ariaLabel="Horizonte da projeção"
      value={String(dias) as (typeof HORIZONS)[number]}
      onChange={(v) => setPref('projecaoDias', Number(v) as Horizon)}
      options={HORIZONS.map((n) => ({
        value: n,
        title: `Próximos ${n} dias`,
        label: (
          <>
            <span className="@sm:hidden">{n}d</span>
            <span className="hidden @sm:inline">{n} dias</span>
          </>
        ),
      }))}
    />
  );

  let body;
  if (failed.length > 0 && !summary) {
    body = (
      <ErrorState
        error={new Error('Não foi possível carregar a projeção.')}
        onRetry={() => failed.forEach((q) => void q.refetch())}
        className="flex-1 justify-center"
      />
    );
  } else if (!summary) {
    body = (
      <div className="flex min-h-0 flex-1 flex-col gap-2" aria-busy="true" aria-label="Carregando">
        <div className="flex shrink-0 gap-2">
          <Skeleton className="h-[62px] flex-1" />
          <Skeleton className="h-[62px] flex-1" />
        </div>
        <Skeleton className="min-h-24 flex-1" />
      </div>
    );
  } else {
    const { points, worst, milestones, negativeFrom } = summary;
    const first = points[0]?.date;
    const last = points[points.length - 1]?.date;
    const middle = points[Math.floor((points.length - 1) / 2)]?.date;
    const ticks = [first, middle, last].filter((t, i, all): t is ISODate => Boolean(t) && all.indexOf(t) === i);
    const yWidth = yAxisWidth([...points.map((p) => p.saldo), 0]);
    body = (
      <>
        <div className="flex shrink-0 flex-wrap gap-2">
          {worst ? <Tile label="Pior dia do período" saldo={worst.saldo} date={worst.date} danger={worst.saldo < 0} /> : null}
          {milestones.map((m) => (
            <Tile
              key={m.dias}
              label={`Em ${m.dias} dias`}
              saldo={m.saldo}
              date={m.date}
              className={m.dias === dias ? undefined : 'hidden @lg:flex'}
            />
          ))}
        </div>
        {negativeFrom ? (
          <p className="mt-2 flex shrink-0 items-start gap-1.5 text-caption text-fg">
            <TriangleAlert className="mt-px size-3.5 shrink-0 text-danger" aria-hidden />
            <span>
              O saldo fica <strong className="font-semibold text-danger">negativo</strong> em {formatDateBR(negativeFrom)}.
              <span className="hidden @sm:inline"> Antecipe recebimentos ou renegocie prazos antes dessa data.</span>
            </span>
          </p>
        ) : null}
        <div
          role="img"
          aria-label={`Saldo projetado para os próximos ${dias} dias.${worst ? ` Pior dia: ${formatDateBR(worst.date)}, ${formatBRL(worst.saldo)}.` : ''}`}
          className="mt-2 flex min-h-0 flex-1 flex-col"
        >
          <ChartBox>
            <AreaChart data={points} margin={{ top: 6, right: 2, bottom: 0, left: 0 }} accessibilityLayer={false}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.14 }} />
                  <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--app-chart-grid)" strokeDasharray="4 4" />
              <XAxis dataKey="date" ticks={ticks} interval={0} tickLine={false} axisLine={false} tick={<DateTick />} />
              <YAxis {...axisProps} width={yWidth} tickCount={3} tickFormatter={moneyAxisFormatter} />
              <Tooltip
                cursor={{ stroke: 'var(--app-border-strong)', strokeDasharray: '3 3' }}
                content={<BalanceTooltip color={color} />}
              />
              <ReferenceLine y={0} stroke="var(--app-border-strong)" />
              {worst ? <ReferenceLine x={worst.date} stroke={CHART_COLORS.axis} strokeDasharray="3 3" strokeOpacity={0.45} /> : null}
              <Area
                type="linear"
                dataKey="saldo"
                name="saldo"
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                activeDot={{ r: 4, fill: color, stroke: 'var(--app-surface)', strokeWidth: 2 }}
                isAnimationActive={!resizing}
              />
              {worst ? <ReferenceDot x={worst.date} y={worst.saldo} r={4} fill={color} stroke="var(--app-surface)" strokeWidth={2} /> : null}
            </AreaChart>
          </ChartBox>
        </div>
      </>
    );
  }

  const footer =
    summary && (overdueIn !== 0 || overdueOut !== 0) ? (
      <p className="text-micro text-muted">
        Inclui o que já está vencido e em aberto ({formatBRL(overdueIn)} a receber, {formatBRL(overdueOut)} a pagar), contado a partir de hoje.
      </p>
    ) : undefined;

  return (
    <WidgetCard
      alert={alert}
      subtitle={summary ? `Saldo hoje ${formatBRL(summary.today)} · o que está em aberto até ${dias} dias` : 'Saldo previsto com o que está em aberto'}
      info="Saldo das contas somado ao que está para entrar e sair (lançamentos em aberto e faturas de cartão pelo vencimento). O que já venceu e segue em aberto entra hoje."
      action={action}
      footer={footer}
    >
      {body}
    </WidgetCard>
  );
}
