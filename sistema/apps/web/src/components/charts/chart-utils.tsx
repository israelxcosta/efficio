import { useId, type ReactElement, type ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { formatBRL } from '@effinance/shared';
import { cn } from '@/lib/utils';

export const CHART_COLORS = {
  income: 'var(--app-chart-income)',
  incomeStrong: 'var(--app-chart-income-strong)',
  expense: 'var(--app-chart-expense)',
  expenseStrong: 'var(--app-chart-expense-strong)',
  neutral: 'var(--app-chart-neutral)',
  grid: 'var(--app-chart-grid)',
  axis: 'var(--app-subtle)',
  brand: 'var(--app-primary)',
  success: 'var(--app-success)',
  danger: 'var(--app-danger)',
} as const;

/** Fallback palette for categories without a color / "Outros". */
export const SERIES_PALETTE = ['#152B61', '#3F64BE', '#0EA5E9', '#14B8A6', '#12A150', '#EAB308', '#F97316', '#E5484D', '#EC4899', '#A855F7', '#64748B'];

/** Chart text sizes (px): small and fixed, whatever the size of the chart. */
export const CHART_TEXT = { axis: 10, category: 10.5, value: 11.5 } as const;

/** Value axis (Y): 10px ticks. */
export const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: CHART_COLORS.axis, fontSize: CHART_TEXT.axis },
} as const;

/** Category axis (X): 10.5px labels, first and last always shown, the rest as space allows. */
export const categoryAxisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: CHART_COLORS.axis, fontSize: CHART_TEXT.category },
  interval: 'preserveStartEnd',
  minTickGap: 8,
} as const;

/**
 * Takes all the height left in a flex column (the card body) and gives Recharts a definite size,
 * so charts grow with the card. The absolute inner box avoids the flex ↔ ResponsiveContainer
 * resize loop.
 */
export function ChartBox({ children, minHeight = 96, className }: { children: ReactElement; minHeight?: number; className?: string }) {
  return (
    <div className={cn('relative min-h-0 flex-1', className)} style={{ minHeight }}>
      <div className="absolute inset-0">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export { moneyAxisFormatter } from './chart-axis';

/**
 * Diagonal stripe patterns (Graniq-style hatched bars). Render inside a chart's <defs>.
 * Use as `fill="url(#stripe-income)"`; ids and colors are listed in STRIPES.
 */
const STRIPES = {
  'stripe-income': CHART_COLORS.income,
  'stripe-expense': CHART_COLORS.expense,
  'stripe-neutral': CHART_COLORS.neutral,
  'stripe-brand': CHART_COLORS.incomeStrong,
  'stripe-success': CHART_COLORS.success,
  'stripe-danger': CHART_COLORS.danger,
} as const;

/** `scope` prefixes the ids (from `useStripeScope`) so several charts on one page never share them. */
export function StripeDefs({ scope = '' }: { scope?: string } = {}) {
  return (
    <defs>
      {Object.entries(STRIPES).map(([id, color]) => (
        <Stripe key={id} id={`${scope}${id}`} color={color} />
      ))}
    </defs>
  );
}

/** Unique, CSS-safe prefix for the stripe ids of one chart. */
export function useStripeScope(): string {
  return `s${useId().replace(/[^a-zA-Z0-9_-]/g, '')}-`;
}

/** `fill` for a striped series: `stripeFill('income', scope)` → `url(#<scope>stripe-income)`. */
export function stripeFill(name: 'income' | 'expense' | 'neutral' | 'brand' | 'success' | 'danger', scope = ''): string {
  return `url(#${scope}stripe-${name})`;
}

/** Solid color behind a series fill, resolving `url(#…stripe-…)` patterns (for tooltips). */
function seriesColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const pattern = /^url\(#[\w-]*?(stripe-[a-z]+)\)$/.exec(value);
  if (!pattern) return value;
  return STRIPES[pattern[1] as keyof typeof STRIPES];
}

function Stripe({ id, color }: { id: string; color: string }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
      <rect width="8" height="8" fill={color} opacity="0.55" />
      <rect width="4" height="8" fill={color} />
    </pattern>
  );
}

interface TooltipRow {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  fill?: string;
  dataKey?: string | number | ((obj: unknown) => unknown);
  payload?: Record<string, unknown>;
}

interface MoneyTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: readonly TooltipRow[] | TooltipRow[];
  /** Map a series name to a friendly label. */
  names?: Record<string, string>;
  footer?: (payload: readonly TooltipRow[]) => ReactNode;
  hideZero?: boolean;
  /** Adds a "Total" row when two or more series are shown. */
  total?: boolean;
  labelFormatter?: (label: string | number | undefined) => ReactNode;
}

/** Card-like tooltip with BRL formatting. Pass as `content={<MoneyTooltip />}`. */
export function MoneyTooltip({ active, label, payload, names, footer, hideZero, total, labelFormatter }: MoneyTooltipProps) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => (!hideZero || Number(p.value) !== 0) && p.value !== null && p.value !== undefined);
  const projected = Boolean(payload[0]?.payload?.projected);
  const sum = rows.reduce((acc, p) => acc + Number(p.value ?? 0), 0);
  return (
    <div className="min-w-[148px] rounded-lg border border-border bg-surface px-2.5 py-2 text-caption shadow-lg">
      <p className="mb-1.5 flex items-center gap-2 text-caption font-semibold text-muted">
        {labelFormatter ? labelFormatter(label) : label}
        {projected ? <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] text-primary-soft-fg">Projeção</span> : null}
      </p>
      <div className="flex flex-col gap-1">
        {rows.map((p, i) => {
          const key = String(p.name ?? p.dataKey ?? i);
          const color = seriesColor(p.fill) ?? seriesColor(p.color);
          return (
            <div key={key + i} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted">
                <span className={cn('size-2 rounded-full', !color && 'bg-brand-400')} style={color ? { backgroundColor: color } : undefined} />
                {names?.[key] ?? key}
              </span>
              <span className="tabular font-semibold whitespace-nowrap text-fg">{formatBRL(Number(p.value ?? 0))}</span>
            </div>
          );
        })}
      </div>
      {total && rows.length > 1 ? (
        <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-border pt-1.5">
          <span className="text-muted">Total</span>
          <span className="tabular font-semibold whitespace-nowrap text-fg">{formatBRL(sum)}</span>
        </div>
      ) : null}
      {footer ? <div className="mt-1.5 border-t border-border pt-1.5">{footer(payload)}</div> : null}
    </div>
  );
}

export function LegendDot({ color, label, striped, size = 'md' }: { color: string; label: string; striped?: boolean; size?: 'sm' | 'md' }) {
  return (
    <span className={cn('flex items-center gap-1.5 font-medium text-muted', size === 'sm' ? 'text-caption' : 'text-xs')}>
      <span
        className={cn('shrink-0 rounded-full', size === 'sm' ? 'size-2' : 'size-2.5')}
        style={{
          background: striped ? `repeating-linear-gradient(45deg, ${color} 0 2px, color-mix(in oklab, ${color} 55%, transparent) 2px 4px)` : color,
        }}
      />
      {label}
    </span>
  );
}
