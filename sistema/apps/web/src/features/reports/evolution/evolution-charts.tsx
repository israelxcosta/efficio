import { useMemo } from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBRL, formatMonthKey, type EvolutionMonth, type MonthKey } from '@effinance/shared';
import { axisProps, CHART_COLORS, CHART_TEXT, ChartBox, LegendDot, moneyAxisFormatter, StripeDefs, stripeFill, useStripeScope } from '@/components/charts/chart-utils';
import { niceDomain, yAxisWidth } from '@/components/charts/chart-scale';
import { Card, CardHeader } from '@/components/ui/card';
import { useElementSize } from '@/lib/use-element-size';
import { cn } from '@/lib/utils';
import { MonthTick } from '../components/month-tick';
import { evolutionFinding, moneyFinding, signedCount } from './evolution-logic';

const NEW = 'var(--app-data)';
const CHURNED = CHART_COLORS.danger;
const ACTIVE = 'var(--app-fg)';
const BILLED = CHART_COLORS.expense;
const RECEIVED = 'var(--app-data)';

export const REACTIVATION_NOTE = 'Reativações reescrevem o histórico: o cliente conta como ativo desde o início do contrato.';

interface Point {
  month: MonthKey;
  label: string;
  partial: boolean;
  source: EvolutionMonth;
}

const pointOf = (m: EvolutionMonth): Point => ({ month: m.month, label: formatMonthKey(m.month, 'short'), partial: m.partial, source: m });
const monthOnly = (key: MonthKey) => formatMonthKey(key).split(' ')[0]!;
const intTick = (v: number) => String(v);

/** Count axis with whole steps (1, 2, 3, 5, 10, 20, 25, 50…) holding the data and zero in at most 6 marks. */
export function countAxis(values: readonly number[]): { domain: [number, number]; ticks: number[] } {
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  if (min === 0 && max === 0) return { domain: [0, 3], ticks: [0, 1, 2, 3] };
  for (let scale = 1; ; scale *= 10) {
    for (const m of [1, 2, 3, 5]) {
      const step = m * scale;
      const lo = Math.floor(min / step);
      const hi = Math.ceil(max / step);
      if (hi - lo + 1 <= 6 && hi - lo + 1 >= 3) return { domain: [lo * step, hi * step], ticks: Array.from({ length: hi - lo + 1 }, (_, i) => (lo + i) * step) };
      if (hi - lo + 1 < 3) return { domain: [lo * step, Math.max(hi, lo + 2) * step], ticks: Array.from({ length: Math.max(hi, lo + 2) - lo + 1 }, (_, i) => (lo + i) * step) };
    }
  }
}

interface ChartProps {
  months: readonly EvolutionMonth[];
  active: MonthKey;
  onPick: (month: MonthKey) => void;
  className?: string;
}

/** Picks the month under a click on the chart (recharts gives the index of the hovered category). */
function pickFrom(points: readonly Point[], onPick: (m: MonthKey) => void) {
  return (state: { activeTooltipIndex?: number | string | null }) => {
    const point = points[Number(state?.activeTooltipIndex)];
    if (point) onPick(point.month);
  };
}

/**
 * "Carteira mês a mês" (spec §4.3): one count axis (both series are clients): new clients up, churned
 * down, and the active base as a step line labelled at its last point. The reference month is shaded;
 * a click picks another.
 */
export function PortfolioChart({ months, active, onPick, className }: ChartProps) {
  const box = useElementSize();
  const data = useMemo(
    () => months.map((m) => ({ ...pointOf(m), newClients: m.newClients, churned: -m.churnedClients, activeClients: m.activeClients })),
    [months],
  );
  const axis = countAxis(data.flatMap((d) => [d.newClients, d.churned, d.activeClients]));
  const activeLabel = data.find((d) => d.month === active)?.label;
  const last = data.length - 1;
  const narrow = box.width > 0 && box.width < 520;
  return (
    <Card className={cn('flex min-w-0 flex-col p-4 sm:p-5 print:break-inside-avoid', className)}>
      <CardHeader title="Carteira mês a mês" subtitle={evolutionFinding(months, active)} info={`Clientes novos (início do contrato no mês), encerrados (inativação no mês) e ativos no fim de cada mês. ${REACTIVATION_NOTE}`} />
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <LegendDot size="sm" color={NEW} label="Novos" />
        <LegendDot size="sm" color={CHURNED} label="Encerrados" />
        <span className="flex items-center gap-1.5 text-caption font-medium text-muted">
          <span className="h-0.5 w-3.5 rounded-full bg-fg" aria-hidden />
          Clientes ativos
        </span>
      </div>
      <div
        ref={box.ref}
        className="mt-2 flex h-[220px] flex-col sm:h-72"
        role="img"
        aria-label={`${evolutionFinding(months, active)}. ${data.map((d) => `${d.label}: ${d.activeClients} ativos, ${signedCount(d.newClients)} novos, ${d.churned === 0 ? 0 : signedCount(d.churned)} encerrados`).join('; ')}.`}
      >
        <ChartBox>
          <ComposedChart
            data={data}
            stackOffset="sign"
            margin={{ top: 16, right: narrow ? 8 : 56, left: 0, bottom: 0 }}
            barCategoryGap="30%"
            accessibilityLayer={false}
            onClick={pickFrom(data, onPick)}
            className="cursor-pointer"
          >
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} strokeDasharray="4 4" />
            {activeLabel ? <ReferenceArea x1={activeLabel} x2={activeLabel} fill="var(--app-bg-subtle)" fillOpacity={1} ifOverflow="extendDomain" /> : null}
            <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={4} height={30} tick={<MonthTick active={activeLabel} partial={data.find((d) => d.partial)?.label} />} />
            <YAxis {...axisProps} domain={axis.domain} ticks={axis.ticks} interval={0} allowDecimals={false} tickFormatter={intTick} width={yAxisWidth(axis.ticks, intTick)} />
            <ReferenceLine y={0} stroke="var(--app-border-strong)" />
            <Tooltip cursor={{ fill: 'var(--app-bg-subtle)', fillOpacity: 0.6 }} content={<PortfolioTooltip />} />
            <Bar dataKey="newClients" stackId="moves" fill={NEW} maxBarSize={26} radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {data.length <= 13 ? (
                <LabelList dataKey="newClients" position="top" formatter={(v: unknown) => (typeof v === 'number' && v > 0 ? signedCount(v) : '')} style={{ fontSize: CHART_TEXT.axis, fill: 'var(--app-data)', fontWeight: 600 }} />
              ) : null}
            </Bar>
            <Bar dataKey="churned" stackId="moves" fill={CHURNED} maxBarSize={26} radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {data.length <= 13 ? (
                <LabelList dataKey="churned" position="bottom" formatter={(v: unknown) => (typeof v === 'number' && v < 0 ? signedCount(v) : '')} style={{ fontSize: CHART_TEXT.axis, fill: 'var(--app-danger)', fontWeight: 600 }} />
              ) : null}
            </Bar>
            <Line dataKey="activeClients" type="stepAfter" stroke={ACTIVE} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: 'var(--app-surface)', stroke: ACTIVE, strokeWidth: 2 }} isAnimationActive={false}>
              {narrow ? null : (
                <LabelList
                  dataKey="activeClients"
                  content={(p: { x?: number | string; y?: number | string; index?: number; value?: unknown }) =>
                    p.index === last ? (
                      <text x={Number(p.x ?? 0) + 8} y={Number(p.y ?? 0) + 4} fontSize={CHART_TEXT.value} fontWeight={600} fill="var(--app-fg)">
                        {`${String(p.value)} ativos`}
                      </text>
                    ) : null
                  }
                />
              )}
            </Line>
          </ComposedChart>
        </ChartBox>
      </div>
    </Card>
  );
}

function PortfolioTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: Point }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const m = p.source;
  return (
    <div className="min-w-[180px] rounded-lg border border-border bg-surface px-2.5 py-2 text-caption shadow-lg">
      <p className="mb-1.5 font-semibold text-muted">{`${monthOnly(m.month)}${m.partial ? ' · parcial' : ''}`}</p>
      <div className="tabular flex flex-col gap-1">
        <TipRow label="Clientes ativos" value={String(m.activeClients)} />
        <TipRow label="Novos" value={signedCount(m.newClients)} color={NEW} />
        <TipRow label="Encerrados" value={String(m.churnedClients)} color={CHURNED} />
        <p className="mt-0.5 border-t border-border pt-1 text-muted">{`Variação ${signedCount(m.netChange)}`}</p>
      </div>
    </div>
  );
}

function TipRow({ label, value, color, dashed }: { label: string; value: string; color?: string; dashed?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted">
        {color ? (
          dashed ? (
            <span className="w-3 border-t-[1.5px] border-dashed" style={{ borderColor: color }} aria-hidden />
          ) : (
            <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          )
        ) : null}
        {label}
      </span>
      <span className="font-semibold whitespace-nowrap text-fg">{value}</span>
    </div>
  );
}

/**
 * "Faturado, recebido e honorário mensal" (spec §4.3): billed (grey) and received (data hue) bars and
 * the monthly fee as a dashed ink line, all in R$ on one axis; the partial month is hatched.
 */
export function MoneyChart({ months, active, onPick, className }: ChartProps) {
  const scope = useStripeScope();
  const box = useElementSize();
  const data = useMemo(() => months.map((m) => ({ ...pointOf(m), billed: m.billed, received: m.received, recurringFees: m.recurringFees })), [months]);
  const axis = niceDomain(data.flatMap((d) => [d.billed, d.received, d.recurringFees]));
  const activeLabel = data.find((d) => d.month === active)?.label;
  const last = data.length - 1;
  const narrow = box.width > 0 && box.width < 640;
  return (
    <Card className={cn('flex min-w-0 flex-col p-4 sm:p-5 print:break-inside-avoid', className)}>
      <CardHeader
        title="Faturado, recebido e honorário mensal"
        subtitle={moneyFinding(months, active)}
        info="Faturado: recebíveis de clientes com vencimento no mês (pagos ou não). Recebido: o que entrou dos clientes no mês pela data de pagamento, com juros e multa e sem os descontos. Honorário mensal: a soma das vigências dos clientes ativos no fim do mês."
      />
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <LegendDot size="sm" color={BILLED} label="Faturado" />
        <LegendDot size="sm" color={RECEIVED} label="Recebido" />
        <span className="flex items-center gap-1.5 text-caption font-medium text-muted">
          <span className="w-3.5 border-t-[1.5px] border-dashed border-fg" aria-hidden />
          Honorário mensal recorrente
        </span>
        {data.some((d) => d.partial) ? <LegendDot size="sm" color={BILLED} label="Mês parcial" striped /> : null}
      </div>
      <div ref={box.ref} className="mt-2 flex h-[220px] flex-col sm:h-72" role="img" aria-label={moneyFinding(months, active)}>
        <ChartBox>
          <ComposedChart data={data} margin={{ top: 12, right: narrow ? 8 : 112, left: 0, bottom: 0 }} barCategoryGap="22%" barGap={3} accessibilityLayer={false} onClick={pickFrom(data, onPick)} className="cursor-pointer">
            <StripeDefs scope={scope} />
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} strokeDasharray="4 4" />
            {activeLabel ? <ReferenceArea x1={activeLabel} x2={activeLabel} fill="var(--app-bg-subtle)" fillOpacity={1} ifOverflow="extendDomain" /> : null}
            <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={4} height={30} tick={<MonthTick active={activeLabel} partial={data.find((d) => d.partial)?.label} />} />
            <YAxis {...axisProps} domain={axis.domain} ticks={axis.ticks} interval={0} tickFormatter={moneyAxisFormatter} width={yAxisWidth(axis.ticks, moneyAxisFormatter)} />
            <Tooltip cursor={{ fill: 'var(--app-bg-subtle)', fillOpacity: 0.6 }} content={<MoneyChartTooltip />} />
            <Bar dataKey="billed" fill={BILLED} maxBarSize={24} radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.month} fill={d.partial ? stripeFill('expense', scope) : BILLED} />
              ))}
            </Bar>
            <Bar dataKey="received" fill={RECEIVED} maxBarSize={24} radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.month} fill={d.partial ? stripeFill('income', scope) : RECEIVED} />
              ))}
            </Bar>
            <Line dataKey="recurringFees" type="linear" stroke={ACTIVE} strokeWidth={1.5} strokeDasharray="4 4" dot={{ r: 2, fill: ACTIVE, strokeWidth: 0 }} activeDot={{ r: 3.5 }} isAnimationActive={false}>
              {narrow ? null : (
                <LabelList
                  dataKey="recurringFees"
                  content={(p: { x?: number | string; y?: number | string; index?: number; value?: unknown }) =>
                    p.index === last ? (
                      <text x={Number(p.x ?? 0) + 10} y={Number(p.y ?? 0)} fontSize={CHART_TEXT.axis} fill="var(--app-fg)">
                        <tspan x={Number(p.x ?? 0) + 10} dy={0} fontWeight={600}>
                          {formatBRL(Number(p.value ?? 0))}
                        </tspan>
                        <tspan x={Number(p.x ?? 0) + 10} dy={13} fill="var(--app-muted)">
                          honorário mensal
                        </tspan>
                      </text>
                    ) : null
                  }
                />
              )}
            </Line>
          </ComposedChart>
        </ChartBox>
      </div>
    </Card>
  );
}

function MoneyChartTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: Point }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const m = p.source;
  return (
    <div className="min-w-[200px] rounded-lg border border-border bg-surface px-2.5 py-2 text-caption shadow-lg">
      <p className="mb-1.5 font-semibold text-muted">{`${formatMonthKey(m.month)}${m.partial ? ` · até ${m.asOf.slice(8, 10)}/${m.asOf.slice(5, 7)}` : ''}`}</p>
      <div className="tabular flex flex-col gap-1">
        <TipRow label="Faturado" value={formatBRL(m.billed)} color={BILLED} />
        <TipRow label="Recebido" value={formatBRL(m.received)} color={RECEIVED} />
        <TipRow label="Honorário mensal" value={formatBRL(m.recurringFees)} color={ACTIVE} dashed />
        {m.billed > 0 ? <p className="mt-0.5 border-t border-border pt-1 text-muted">{`${Math.round((m.received / m.billed) * 100)}% do faturado recebido${m.partial ? ' até hoje' : ''}`}</p> : null}
      </div>
    </div>
  );
}
