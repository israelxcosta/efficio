import { useMemo, type ComponentProps } from 'react';
import { Link, useNavigate } from 'react-router';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartPie, Scale } from 'lucide-react';
import {
  formatBRL,
  formatCompactBRL,
  formatMonthKey,
  formatPercent,
  percentChange,
  todayISO,
  type DashboardResponse,
  type MonthKey,
} from '@effinance/shared';
import { DonutChart } from '@/components/charts/donut-chart';
import {
  axisProps,
  CHART_COLORS,
  CHART_TEXT,
  ChartBox,
  moneyAxisFormatter,
  MoneyTooltip,
} from '@/components/charts/chart-utils';
import { niceDomain, yAxisWidth } from '@/components/charts/chart-scale';
import { StackBar } from '@/components/charts/stack-bar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { WriteGate } from '@/features/auth/permissions';
import { categoryListHref } from '@/features/transactions/links';
import { useTransactionActions } from '@/features/transactions/transaction-actions';
import { useElementSize } from '@/lib/use-element-size';
import { cn, pluralize } from '@/lib/utils';
import type { WidgetProps } from '../layout/types';
import { useWidgetResizing, WidgetCard } from '../layout/widget-card';
import { categoryInsight, summaryInsight } from './insight-lines';
import { BodyEmpty } from './shared';
import { changeParts } from '../kpi-logic';
import { donutMaxItems, fitTicks, maxAbsIndex, resultStats, shortMonth, summaryBar, topConcentration } from './trend-math';

type Side = 'income' | 'expense';

const SIDE = {
  income: { label: 'Receitas', paid: 'Recebido', pending: 'A receber', color: CHART_COLORS.income },
  expense: { label: 'Despesas', paid: 'Pago', pending: 'A pagar', color: CHART_COLORS.expense },
} as const;

const linkClass = 'shrink-0 text-caption font-medium text-brand-text hover:underline';

const CHANGE_TONE = { success: 'text-success', danger: 'text-danger', muted: 'text-muted' } as const;

// ---------------------------------------------------------------------------
// Resumo do período
// ---------------------------------------------------------------------------

/** Paid fill and open hatch of each side (receitas in the data blue, despesas in grey). */
const SUMMARY_FILL = {
  income: { paid: 'bg-data', hatch: 'var(--app-data)' },
  expense: { paid: 'bg-[var(--app-chart-expense-strong)]', hatch: 'var(--app-chart-expense-strong)' },
} as const;

/**
 * One side of the summary as a bullet: total and change vs the previous month, then paid (solid)
 * and open (hatched) on the scale of the larger month, with the previous month's total marked.
 */
function SummaryBox({ side, d, past }: { side: Side; d: DashboardResponse; past: boolean }) {
  const s = d.summary;
  const income = side === 'income';
  const meta = SIDE[side];
  const total = income ? s.income : s.expense;
  const paid = income ? s.paidIncome : s.paidExpense;
  const pending = income ? s.pendingIncome : s.pendingExpense;
  const previous = income ? d.previous.income : d.previous.expense;
  const change = changeParts(percentChange(total, previous), 'percent', !income);
  const bar = summaryBar(total, paid, previous);
  const fill = SUMMARY_FILL[side];
  // In past months what is still unpaid is overdue, not "to receive".
  const pendingLabel = past ? 'Em aberto' : meta.pending;
  const paidShare = total > 0 ? Math.round((paid / total) * 100) : 0;

  return (
    <div className="flex min-w-0 flex-col justify-center gap-2">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-caption font-medium text-muted">{meta.label}</p>
          <p className="text-[18px] leading-6 font-semibold tracking-tight whitespace-nowrap text-fg tabular">{formatBRL(total)}</p>
        </div>
        <p className="min-w-0 truncate text-right text-caption">
          {change ? (
            <>
              <span className={cn('font-semibold tabular', CHANGE_TONE[change.tone])}>{change.text}</span>{' '}
              <span className="text-muted">vs mês anterior</span>
            </>
          ) : (
            <span className="text-subtle">Sem base de comparação</span>
          )}
        </p>
      </div>
      <StackBar
        segments={[
          { value: bar.paid, className: fill.paid, label: `${meta.paid} ${formatBRL(paid)}` },
          { value: bar.open, hatch: fill.hatch, label: `${pendingLabel} ${formatBRL(pending)}` },
          { value: Math.max(0, 1 - bar.paid - bar.open), className: 'bg-transparent' },
        ]}
        marker={bar.marker !== null ? { at: bar.marker, label: 'mês anterior' } : undefined}
      />
      <p className="flex min-w-0 flex-wrap gap-x-3 text-caption text-muted">
        <span className="whitespace-nowrap">
          {meta.paid} <span className="font-semibold text-fg tabular">{formatBRL(paid)}</span> · {paidShare}%
        </span>
        <span className="whitespace-nowrap">
          {pendingLabel}{' '}
          <span className={cn('font-semibold tabular', past && pending > 0 ? 'text-danger' : 'text-fg')}>{formatBRL(pending)}</span>
        </span>
      </p>
    </div>
  );
}

/** "Resumo do período": receitas and despesas of the month, paid and open, against the previous month. */
export function SummaryWidget({ month, d, alert }: WidgetProps) {
  const past = month < todayISO().slice(0, 7);
  const s = d?.summary;
  return (
    <WidgetCard
      alert={alert}
      subtitle={(d && summaryInsight(d.summary)) ?? formatMonthKey(month)}
      info="Receitas e despesas do mês pela data de competência (inclui compras no cartão): o sólido é o que já foi pago ou recebido, o hachurado o que está em aberto. A marca na barra é o total do mês anterior."
      footer={
        s ? (
          <p className="truncate text-caption text-muted">
            Saldo do mês <span className={cn('font-semibold tabular', s.net < 0 ? 'text-danger' : 'text-fg')}>{formatBRL(s.net)}</span>
            {s.savingsRate !== null ? (
              <>
                {' · '}eficiência <span className="font-semibold text-fg tabular">{formatPercent(s.savingsRate, 0)}</span>
              </>
            ) : null}
          </p>
        ) : undefined
      }
    >
      {d ? (
        <div className="grid min-h-0 flex-1 grid-rows-2 divide-y divide-border @3xl:grid-cols-2 @3xl:grid-rows-1 @3xl:gap-8 @3xl:divide-y-0">
          <div className="flex min-h-0 flex-col justify-center pb-3 @3xl:pb-0">
            <SummaryBox side="income" d={d} past={past} />
          </div>
          <div className="flex min-h-0 flex-col justify-center pt-3 @3xl:pt-0">
            <SummaryBox side="expense" d={d} past={past} />
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-rows-2 gap-4 @3xl:grid-cols-2 @3xl:grid-rows-1" aria-busy="true" aria-label="Carregando">
          <Skeleton className="h-full" />
          <Skeleton className="h-full" />
        </div>
      )}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Despesas / Receitas por categoria
// ---------------------------------------------------------------------------

const CATEGORY_TEXT = {
  expense: {
    empty: 'Nenhuma despesa neste período',
    hint: 'Registre uma despesa ou selecione outro período para visualizar a distribuição por categoria.',
    cta: 'Adicionar despesa',
    noun: 'despesas',
  },
  income: {
    empty: 'Nenhuma receita registrada no período',
    hint: 'Registre uma receita ou selecione outro período para visualizar a distribuição por categoria.',
    cta: 'Adicionar receita',
    noun: 'receitas',
  },
} as const;

/** Donut of the month by category; a slice or legend row opens the filtered list. */
function CategoryWidget({ type, month, d, size, alert }: WidgetProps & { type: Side }) {
  const navigate = useNavigate();
  const actions = useTransactionActions();
  const box = useElementSize();
  const items = useMemo(() => (type === 'expense' ? d?.expensesByCategory : d?.incomeByCategory) ?? [], [d, type]);
  const total = items.reduce((a, c) => a + c.amount, 0);
  const text = CATEGORY_TEXT[type];
  const concentration = topConcentration(items.map((c) => c.amount));

  let body;
  if (!d) {
    body = (
      <div className="flex min-h-0 flex-1 items-center gap-4" aria-busy="true" aria-label="Carregando">
        <Skeleton className="aspect-square h-full max-h-40 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    );
  } else if (items.length === 0 || total <= 0) {
    body = (
      <BodyEmpty
        icon={<ChartPie />}
        title={text.empty}
        description={size.r >= 4 ? text.hint : undefined}
        action={
          <WriteGate>
            <Button variant="outline" size="sm" onClick={() => actions.openTransaction({ type })}>
              {text.cta}
            </Button>
          </WriteGate>
        }
      />
    );
  } else {
    body = (
      <div
        ref={box.ref}
        role="group"
        aria-label={`${categoryInsight(items, text.noun) ?? ''}. ${SIDE[type].label} de ${formatMonthKey(month)} por categoria: total ${formatBRL(total)}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        <DonutChart
          fill
          data={items}
          total={total}
          centerLabel="no mês"
          maxItems={donutMaxItems(items.length, size, box.width, box.height)}
          onSelect={(c) => {
            if (c.categoryId) navigate(categoryListHref(type, c.categoryId, month));
          }}
        />
      </div>
    );
  }

  const footer =
    d && total > 0 ? (
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-caption text-muted">
          {concentration && concentration.count > 1
            ? `As ${concentration.count} maiores categorias somam ${formatPercent(concentration.share, 0)}`
            : pluralize(items.length, 'categoria no mês', 'categorias no mês')}
        </p>
        <Link to="/relatorios?aba=categories" className={linkClass}>
          Ver todas →
        </Link>
      </div>
    ) : undefined;

  return (
    <WidgetCard
      alert={alert}
      subtitle={categoryInsight(items, text.noun) ?? formatMonthKey(month)}
      info={`Distribuição das ${text.noun} de ${formatMonthKey(month)} por categoria. Clique numa categoria para ver os lançamentos.`}
      footer={footer}
    >
      {body}
    </WidgetCard>
  );
}

export function ExpenseCategoryWidget(props: WidgetProps) {
  return <CategoryWidget {...props} type="expense" />;
}

export function IncomeCategoryWidget(props: WidgetProps) {
  return <CategoryWidget {...props} type="income" />;
}

// ---------------------------------------------------------------------------
// Resultado mês a mês
// ---------------------------------------------------------------------------

/** Body height (px) from which the best / worst month tiles show up above the chart. */
const RESULT_TILES_PX = 240;

interface ResultRow {
  month: MonthKey;
  label: string;
  net: number;
}

/** Short value above (or below, when negative) the bar with the largest absolute result. */
function PeakLabel(props: { x?: unknown; y?: unknown; width?: unknown; height?: unknown; value?: unknown; index?: number; peak: number }) {
  const { index, peak } = props;
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const height = Number(props.height ?? 0);
  const value = Number(props.value ?? 0);
  if (index !== peak || !Number.isFinite(value)) return null;
  const top = Math.min(y, y + height);
  const bottom = Math.max(y, y + height);
  return (
    <text
      x={x + width / 2}
      y={value < 0 ? bottom + 13 : top - 5}
      textAnchor="middle"
      fill="var(--app-fg)"
      fontSize={CHART_TEXT.value}
      fontWeight={600}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {formatCompactBRL(value)}
    </text>
  );
}

/** Number tile: label and a small line on the left, the value on the right. */
function Tile({ label, hint, value, tone, className }: { label: string; hint?: string; value: number; tone?: boolean; className?: string }) {
  return (
    <div className={cn('flex min-w-0 items-center justify-between gap-3 rounded-lg bg-surface-muted px-3 py-1.5', className)}>
      <div className="min-w-0">
        <p className="truncate text-caption text-muted">{label}</p>
        {hint ? <p className="truncate text-micro text-subtle">{hint}</p> : null}
      </div>
      <p className={cn('shrink-0 text-body-sm font-semibold tabular', tone ? (value < 0 ? 'text-danger' : 'text-success') : 'text-fg')}>{formatBRL(value)}</p>
    </div>
  );
}

type TooltipProps = ComponentProps<typeof MoneyTooltip>;

/** Result of the hovered month with its receitas and despesas. */
function ResultTooltip({ d, ...props }: TooltipProps & { d: DashboardResponse }) {
  const row = props.payload?.[0]?.payload as ResultRow | undefined;
  const month = row ? d.monthly.find((m) => m.month === row.month) : undefined;
  return (
    <MoneyTooltip
      {...props}
      names={{ net: 'Resultado do mês' }}
      labelFormatter={() => (row ? formatMonthKey(row.month) : null)}
      footer={() =>
        month ? (
          <div className="flex flex-col gap-0.5 text-micro text-muted">
            <span className="flex justify-between gap-4">
              Receitas <span className="tabular">{formatBRL(month.income)}</span>
            </span>
            <span className="flex justify-between gap-4">
              Despesas <span className="tabular">{formatBRL(month.expense)}</span>
            </span>
          </div>
        ) : null
      }
    />
  );
}

/** "Resultado mês a mês": receitas − despesas of the last 6 months, green above zero, red below. */
export function MonthlyResultWidget({ d, alert }: WidgetProps) {
  const resizing = useWidgetResizing();
  const body = useElementSize();
  const chart = useElementSize();

  const rows = useMemo<ResultRow[]>(() => (d?.monthly ?? []).map((m) => ({ month: m.month, label: shortMonth(m.month), net: m.net })), [d?.monthly]);
  const stats = useMemo(() => resultStats(rows), [rows]);
  const empty = rows.every((r) => r.net === 0);
  const peak = maxAbsIndex(rows.map((r) => r.net));

  let content;
  if (!d) {
    content = (
      <div className="flex min-h-0 flex-1 flex-col gap-3" aria-busy="true" aria-label="Carregando">
        <Skeleton className="h-9 w-full shrink-0" />
        <Skeleton className="min-h-0 w-full flex-1" />
      </div>
    );
  } else if (empty) {
    content = <BodyEmpty icon={<Scale />} title="Sem movimentações nos últimos 6 meses." />;
  } else {
    const values = rows.map((r) => r.net);
    // Round axis: a −R$ 30 month only stretches the domain, it does not open a −2,5k band.
    const axis = niceDomain(values);
    const yWidth = yAxisWidth(axis.ticks);
    const ticks = fitTicks(
      rows.map((r) => r.label),
      chart.width - yWidth - 8,
    );
    const tiles = body.height >= RESULT_TILES_PX;
    const positive = stats.total >= 0;
    content = (
      <div ref={body.ref} className="flex min-h-0 flex-1 flex-col">
        {/* Hero: label and a small line on the left, the total on the right. */}
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-caption text-muted">Resultado em {rows.length} meses</p>
            <p className="truncate text-micro text-subtle">
              {positive ? 'sobrou no período' : 'faltou no período'} · média {formatBRL(stats.average)}/mês
            </p>
          </div>
          <p className={cn('shrink-0 text-[18px] leading-6 font-semibold tracking-tight tabular', positive ? 'text-success' : 'text-danger')}>
            {formatBRL(stats.total)}
          </p>
        </div>
        {tiles && stats.best && stats.worst ? (
          <div className="mt-2 grid shrink-0 gap-2 @sm:grid-cols-2">
            <Tile label="Melhor mês" hint={formatMonthKey(stats.best.month)} value={stats.best.value} tone />
            <Tile label="Pior mês" hint={formatMonthKey(stats.worst.month)} value={stats.worst.value} tone className="hidden @sm:flex" />
          </div>
        ) : null}
        <div
          ref={chart.ref}
          role="img"
          aria-label={`Resultado dos últimos ${rows.length} meses: ${pluralize(stats.positives, 'mês positivo', 'meses positivos')}, média ${formatBRL(stats.average)}, total ${formatBRL(stats.total)}.${stats.worst ? ` Pior mês: ${formatMonthKey(stats.worst.month)}, ${formatBRL(stats.worst.value)}.` : ''}`}
          className="mt-2 flex min-h-0 flex-1 flex-col"
        >
          <ChartBox>
            <BarChart data={rows} barCategoryGap="22%" margin={{ top: 18, right: 4, bottom: 0, left: 0 }} accessibilityLayer={false}>
              <CartesianGrid vertical={false} stroke="var(--app-chart-grid)" strokeDasharray="4 4" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: CHART_COLORS.axis, fontSize: CHART_TEXT.category }}
                ticks={ticks}
                interval={ticks ? 0 : 'preserveStartEnd'}
              />
              <YAxis {...axisProps} width={yWidth} domain={axis.domain} ticks={axis.ticks} interval={0} tickFormatter={moneyAxisFormatter} />
              <Tooltip cursor={{ fill: 'var(--app-bg-subtle)', radius: 8 }} content={<ResultTooltip d={d} />} />
              <ReferenceLine y={0} stroke="var(--app-border-strong)" />
              <Bar dataKey="net" name="net" radius={[3, 3, 3, 3]} maxBarSize={44} isAnimationActive={!resizing}>
                {rows.map((r) => (
                  <Cell key={r.month} fill={r.net < 0 ? CHART_COLORS.danger : CHART_COLORS.income} />
                ))}
                <LabelList dataKey="net" content={(p) => <PeakLabel {...p} peak={peak} />} />
              </Bar>
            </BarChart>
          </ChartBox>
        </div>
      </div>
    );
  }

  return (
    <WidgetCard
      alert={alert}
      subtitle={d && !empty ? `${stats.positives} de ${pluralize(rows.length, 'mês positivo', 'meses positivos').replace(/^\d+ /, '')} · média ${formatBRL(stats.average)}` : 'Últimos 6 meses'}
      info="Receitas menos despesas de cada mês, pela data de competência. Acima de zero sobrou; abaixo, faltou."
    >
      {content}
    </WidgetCard>
  );
}
