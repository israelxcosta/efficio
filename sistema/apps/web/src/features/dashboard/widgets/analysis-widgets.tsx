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
  StripeDefs,
  stripeFill,
  useStripeScope,
} from '@/components/charts/chart-utils';
import { yAxisWidth } from '@/components/charts/chart-scale';
import { Button } from '@/components/ui/button';
import { StatPill } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { WriteGate } from '@/features/auth/permissions';
import { categoryListHref } from '@/features/transactions/links';
import { useTransactionActions } from '@/features/transactions/transaction-actions';
import { useElementSize } from '@/lib/use-element-size';
import { cn, pluralize } from '@/lib/utils';
import type { WidgetProps } from '../layout/types';
import { useWidgetResizing, WidgetCard } from '../layout/widget-card';
import { BodyEmpty } from './shared';
import { averageWithData, donutMaxItems, fitTicks, maxAbsIndex, resultStats, shortMonth, topConcentration } from './trend-math';

type Side = 'income' | 'expense';

const SIDE = {
  income: { label: 'Receitas', paid: 'Recebido', pending: 'A receber', color: CHART_COLORS.income },
  expense: { label: 'Despesas', paid: 'Pago', pending: 'A pagar', color: CHART_COLORS.expense },
} as const;

const linkClass = 'shrink-0 text-caption font-medium text-brand-text hover:underline';

/** "+12,3% vs mês anterior" coloured by side (expenses going up are bad); null without a base. */
function Comparison({ change, side }: { change: number | null; side: Side }) {
  if (change === null) return <span className="text-subtle">Sem base de comparação</span>;
  const up = change >= 0;
  const good = side === 'expense' ? !up : up;
  return (
    <>
      <span className={cn('font-semibold', change === 0 ? 'text-muted' : good ? 'text-success' : 'text-danger')}>
        {up ? '+' : ''}
        {formatPercent(change)}
      </span>{' '}
      <span className="text-muted">vs mês anterior</span>
    </>
  );
}

// ---------------------------------------------------------------------------
// Resumo do período
// ---------------------------------------------------------------------------

/** Content heights (px) of a summary box, used to drop pills and footer before they overflow. */
const BOX_HEAD_PX = 32;
const BOX_GAP_PX = 8;
const PILL_PX = 24;
const BOX_FOOTER_PX = 25;
/** Box content width from which the two pills sit side by side. */
const PILLS_INLINE_PX = 300;
/** The 6-month mini chart only shows up when this much height is left. */
const MINI_CHART_PX = 56;

interface MiniRow {
  month: MonthKey;
  label: string;
  pago: number;
  aberto: number;
}

/** Paid and open amounts of one side over the last 6 months, the active month highlighted. */
function SideMonths({ side, d }: { side: Side; d: DashboardResponse }) {
  const box = useElementSize();
  const scope = useStripeScope();
  const resizing = useWidgetResizing();
  const rows = useMemo<MiniRow[]>(
    () =>
      d.monthly.map((m) => ({
        month: m.month,
        label: shortMonth(m.month),
        pago: side === 'income' ? m.paidIncome : m.paidExpense,
        aberto: side === 'income' ? m.pendingIncome : m.pendingExpense,
      })),
    [d.monthly, side],
  );
  const meta = SIDE[side];
  const show = box.height >= MINI_CHART_PX && rows.some((r) => r.pago + r.aberto > 0);
  return (
    <div ref={box.ref} className="flex min-h-0 flex-1 flex-col" aria-hidden={!show}>
      {show ? (
        <ChartBox minHeight={0}>
          <BarChart data={rows} barCategoryGap="22%" margin={{ top: 2, right: 0, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <StripeDefs scope={scope} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} height={16} tick={{ fill: CHART_COLORS.axis, fontSize: CHART_TEXT.category }} />
            <Tooltip
              cursor={{ fill: 'var(--app-bg-subtle)', radius: 6 }}
              content={
                <MoneyTooltip
                  names={{ pago: meta.paid, aberto: 'Em aberto' }}
                  total
                  hideZero
                  labelFormatter={(label) => {
                    const row = rows.find((r) => r.label === label);
                    return row ? formatMonthKey(row.month) : label;
                  }}
                />
              }
            />
            <Bar dataKey="pago" name="pago" stackId="m" fill={meta.color} maxBarSize={40} isAnimationActive={!resizing}>
              {rows.map((r) => (
                <Cell key={r.month} fillOpacity={r.month === d.month ? 1 : 0.45} radius={r.aberto > 0 ? 0 : 4} />
              ))}
            </Bar>
            <Bar dataKey="aberto" name="aberto" stackId="m" fill={stripeFill(side, scope)} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={!resizing}>
              {rows.map((r) => (
                <Cell key={r.month} fillOpacity={r.month === d.month ? 1 : 0.45} />
              ))}
            </Bar>
          </BarChart>
        </ChartBox>
      ) : null}
    </div>
  );
}

/** One side of the summary: total, comparison, paid / open pills, 6-month bars and a footer line. */
function SummaryBox({ side, d, past }: { side: Side; d: DashboardResponse; past: boolean }) {
  const box = useElementSize();
  const s = d.summary;
  const income = side === 'income';
  const meta = SIDE[side];
  const total = income ? s.income : s.expense;
  const paid = income ? s.paidIncome : s.paidExpense;
  const pending = income ? s.pendingIncome : s.pendingExpense;
  const change = percentChange(total, income ? d.previous.income : d.previous.expense);
  // In past months what is still unpaid is overdue, not "to receive".
  const pendingLabel = past ? 'Em aberto' : meta.pending;

  // The box height comes from the grid, not from its content: drop pills, then the footer, to fit.
  const measured = box.height > 0;
  const inline = box.width >= PILLS_INLINE_PX;
  const pillsPx = inline ? PILL_PX : PILL_PX * 2 + 4;
  const showPills = !measured || box.height >= BOX_HEAD_PX + BOX_GAP_PX + pillsPx;
  const showFooter = !measured || (showPills && box.height >= BOX_HEAD_PX + BOX_GAP_PX * 2 + pillsPx + BOX_FOOTER_PX);

  const average = averageWithData(d.monthly.map((m) => m.expense));
  const footer = income ? (
    <>
      Saldo do mês{' '}
      <span className={cn('font-semibold tabular', s.net < 0 ? 'text-danger' : 'text-fg')}>{formatBRL(s.net)}</span>
      {s.savingsRate !== null ? (
        <>
          {' · '}eficiência <span className="font-semibold text-fg tabular">{formatPercent(s.savingsRate, 0)}</span>
        </>
      ) : null}
    </>
  ) : (
    <>
      Média mensal (6 meses) <span className="font-semibold text-fg tabular">{formatBRL(average)}</span>
    </>
  );

  return (
    <div ref={box.ref} className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border p-3">
      {/* Label and comparison on the left, total on the right. */}
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-caption font-medium text-muted">{meta.label}</p>
          <p className="mt-0.5 truncate text-micro">
            {showPills ? (
              <Comparison change={change} side={side} />
            ) : (
              // No room for the pills: their numbers move to this line.
              <span className="text-muted">
                {meta.paid} <span className="font-semibold text-success tabular">{formatBRL(paid)}</span> · {pendingLabel}{' '}
                <span className={cn('font-semibold tabular', pending > 0 ? 'text-danger' : 'text-fg')}>{formatBRL(pending)}</span>
              </span>
            )}
          </p>
        </div>
        <p className="shrink-0 text-right text-[18px] leading-6 font-semibold tracking-tight text-fg tabular">{formatBRL(total)}</p>
      </div>
      {showPills ? (
        <div className={cn('mt-2 grid shrink-0 gap-1', inline && 'grid-cols-2 gap-1.5')}>
          <StatPill label={meta.paid} value={formatBRL(paid)} tone="success" className="min-w-0 gap-2 px-2.5 py-1 text-caption" />
          <StatPill label={pendingLabel} value={formatBRL(pending)} tone={pending > 0 ? 'danger' : 'neutral'} className="min-w-0 gap-2 px-2.5 py-1 text-caption" />
        </div>
      ) : null}
      <SideMonths side={side} d={d} />
      {showFooter ? <p className="mt-2 shrink-0 truncate border-t border-border pt-2 text-caption text-muted">{footer}</p> : null}
    </div>
  );
}

/** "Resumo do período": receitas and despesas of the month, paid and open, with the last 6 months. */
export function SummaryWidget({ month, d, alert }: WidgetProps) {
  const past = month < todayISO().slice(0, 7);
  return (
    <WidgetCard
      alert={alert}
      subtitle={formatMonthKey(month)}
      info="Receitas e despesas do mês pela data de competência (inclui compras no cartão), separadas entre pagas e em aberto. As barras mostram os últimos 6 meses."
    >
      {d ? (
        <div className="grid min-h-0 flex-1 grid-rows-2 gap-2 @xl:grid-cols-2 @xl:grid-rows-1 @xl:gap-3">
          <SummaryBox side="income" d={d} past={past} />
          <SummaryBox side="expense" d={d} past={past} />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-rows-2 gap-2 @xl:grid-cols-2 @xl:grid-rows-1 @xl:gap-3" aria-busy="true" aria-label="Carregando">
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
        aria-label={`${SIDE[type].label} de ${formatMonthKey(month)} por categoria: total ${formatBRL(total)}`}
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
          {concentration
            ? concentration.count === 1
              ? `A maior categoria soma ${formatPercent(concentration.share, 0)}`
              : `As ${concentration.count} maiores categorias somam ${formatPercent(concentration.share, 0)}`
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
      subtitle={formatMonthKey(month)}
      info={`Distribuição das ${text.noun} do mês por categoria. Clique numa categoria para ver os lançamentos.`}
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
  const scope = useStripeScope();
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
    const yWidth = yAxisWidth([...values, 0]);
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
          aria-label={`Resultado dos últimos ${rows.length} meses: ${pluralize(stats.positives, 'mês positivo', 'meses positivos')}, total ${formatBRL(stats.total)}.${stats.worst ? ` Pior mês: ${formatMonthKey(stats.worst.month)}, ${formatBRL(stats.worst.value)}.` : ''}`}
          className="mt-2 flex min-h-0 flex-1 flex-col"
        >
          <ChartBox>
            <BarChart data={rows} barCategoryGap="22%" margin={{ top: 18, right: 4, bottom: 0, left: 0 }} accessibilityLayer={false}>
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
              <Tooltip cursor={{ fill: 'var(--app-bg-subtle)', radius: 8 }} content={<ResultTooltip d={d} />} />
              <ReferenceLine y={0} stroke="var(--app-border-strong)" />
              <Bar dataKey="net" name="net" radius={[6, 6, 6, 6]} maxBarSize={44} isAnimationActive={!resizing}>
                {rows.map((r) => (
                  <Cell key={r.month} fill={stripeFill(r.net < 0 ? 'danger' : 'success', scope)} />
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
      subtitle={d ? `Últimos ${rows.length} meses · ${stats.positives} de ${rows.length} positivos` : 'Últimos 6 meses'}
      info="Receitas menos despesas de cada mês, pela data de competência. Acima de zero sobrou; abaixo, faltou."
    >
      {content}
    </WidgetCard>
  );
}
