import { useMemo } from 'react';
import { Bar, CartesianGrid, ComposedChart, LabelList, Line, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarClock } from 'lucide-react';
import { formatBRL, formatMonthKey, formatPercent, type DelinquencyMonth } from '@effinance/shared';
import { axisProps, categoryAxisProps, CHART_COLORS, CHART_TEXT, ChartBox, LegendDot } from '@/components/charts/chart-utils';
import { yAxisWidth } from '@/components/charts/chart-scale';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDays } from '../delinquency-view';

const DAYS_COLOR = CHART_COLORS.expense;
const RATE_COLOR = CHART_COLORS.incomeStrong;

interface Point {
  month: string;
  label: string;
  /** Average days late (null when nothing was late). */
  days: number | null;
  /** Late rate in % (null when nothing was due). */
  rate: number | null;
  dueCount: number;
  lateCount: number;
  lateAmount: number;
}

const daysTick = (v: number) => `${v}d`;
const rateTick = (v: number) => `${v}%`;

/** Bars: average days late per due month. Line: share of the month's receivables paid late or open. */
export function DelinquencyChart({ monthly }: { monthly: DelinquencyMonth[] }) {
  const data = useMemo<Point[]>(
    () =>
      monthly.map((m) => ({
        month: m.month,
        label: formatMonthKey(m.month, 'short'),
        days: m.avgDaysLate,
        rate: m.dueCount > 0 ? Math.round(m.lateRate * 1000) / 10 : null,
        dueCount: m.dueCount,
        lateCount: m.lateCount,
        lateAmount: m.lateAmount,
      })),
    [monthly],
  );
  const hasData = data.some((d) => d.dueCount > 0);
  const maxRate = Math.max(0, ...data.map((d) => d.rate ?? 0));
  const rateMax = Math.min(100, Math.max(20, Math.ceil(maxRate / 10) * 10));

  return (
    <Card className="flex flex-col p-4 sm:p-5">
      <CardHeader
        title="Média de dias de atraso por mês"
        subtitle="Pelo mês de vencimento · em aberto contam até hoje"
        info="Barras: média de dias entre o vencimento e o pagamento das mensalidades pagas com atraso (as ainda em aberto contam até hoje). Linha: parte das mensalidades do mês pagas com atraso ou em aberto."
      />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <LegendDot size="sm" color={DAYS_COLOR} label="Média de dias de atraso" />
        <LegendDot size="sm" color={RATE_COLOR} label="Taxa de atraso (%)" />
      </div>
      {hasData ? (
        <div className="mt-3 flex h-64 flex-col sm:h-72">
          <ChartBox>
            <ComposedChart data={data} margin={{ top: 16, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} strokeDasharray="4 4" />
              <XAxis dataKey="label" {...categoryAxisProps} />
              <YAxis
                yAxisId="days"
                {...axisProps}
                allowDecimals={false}
                tickFormatter={daysTick}
                // Ticks round up past the data (91 → 100d): size the gutter for that label.
                width={yAxisWidth([Math.max(0, ...data.map((d) => d.days ?? 0)) * 1.25], daysTick)}
              />
              <YAxis yAxisId="rate" orientation="right" {...axisProps} domain={[0, rateMax]} tickFormatter={rateTick} width={yAxisWidth([rateMax], rateTick)} />
              <Tooltip cursor={{ fill: 'var(--app-bg-subtle)' }} content={<DelinquencyTooltip />} />
              <Bar yAxisId="days" dataKey="days" name="Média de dias" fill={DAYS_COLOR} radius={[4, 4, 0, 0]} maxBarSize={30}>
                {data.length <= 12 ? (
                  <LabelList
                    dataKey="days"
                    position="top"
                    formatter={(v: unknown) => (typeof v === 'number' && v > 0 ? Math.round(v) : '')}
                    style={{ fontSize: CHART_TEXT.axis, fill: 'var(--app-muted)', fontVariantNumeric: 'tabular-nums' }}
                  />
                ) : null}
              </Bar>
              <Line
                yAxisId="rate"
                dataKey="rate"
                name="Taxa de atraso"
                type="linear"
                stroke={RATE_COLOR}
                strokeWidth={2}
                dot={{ r: 2.5, fill: RATE_COLOR, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
                connectNulls
              />
            </ComposedChart>
          </ChartBox>
        </div>
      ) : (
        <EmptyState compact className="mt-4" icon={<CalendarClock />} title="Nenhuma mensalidade vencida no período" description="O gráfico aparece quando houver recebimentos de clientes com vencimento nestes meses." />
      )}
    </Card>
  );
}

function DelinquencyTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: Point }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="min-w-[180px] rounded-lg border border-border bg-surface px-2.5 py-2 text-caption shadow-lg">
      <p className="mb-1.5 font-semibold text-muted capitalize">{formatMonthKey(p.month)}</p>
      {p.dueCount === 0 ? (
        <p className="text-muted">Nenhuma mensalidade vencida.</p>
      ) : (
        <div className="flex flex-col gap-1">
          <Row color={DAYS_COLOR} label="Média de atraso" value={p.days === null ? 'sem atraso' : formatDays(p.days)} />
          <Row color={RATE_COLOR} label="Taxa de atraso" value={formatPercent((p.rate ?? 0) / 100)} />
          <p className="mt-0.5 border-t border-border pt-1 text-muted">
            {p.lateCount} de {p.dueCount} com atraso{p.lateAmount > 0 ? ` · ${formatBRL(p.lateAmount)}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted">
        <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="tabular font-semibold whitespace-nowrap text-fg">{value}</span>
    </div>
  );
}
