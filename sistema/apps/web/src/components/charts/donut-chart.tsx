import { useState, type CSSProperties } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { formatBRL, formatCompactBRL, formatPercent, type CategoryAmount } from '@effinance/shared';
import { cn } from '@/lib/utils';
import { useElementSize } from '@/lib/use-element-size';
import { SERIES_PALETTE } from './chart-utils';
import { centerFontSize } from './chart-scale';
import { useTone } from '@/lib/theme';

interface DonutChartProps {
  data: CategoryAmount[];
  total: number;
  centerLabel?: string;
  /** Fixed diameter (reports). Ignored with `fill`. */
  height?: number;
  maxItems?: number;
  showLegend?: boolean;
  /**
   * Dashboard widgets: takes the parent's remaining height and sizes the donut from it, legend
   * beside it on wide cards and below it on narrow ones. Small legend text (12px).
   */
  fill?: boolean;
  /** Makes slices and legend rows clickable (not called for the grouped "Outras" slice). */
  onSelect?: (item: CategoryAmount) => void;
}

export const OTHERS_ID = 'others';

/** Legend row height in fill mode (12px text + py-1). */
const FILL_ROW_PX = 26;

/**
 * Category distribution donut. Hovering a slice or legend row highlights it and shows its name and
 * amount in the center (instead of a floating tooltip that would cover the total).
 */
export function DonutChart({ data, total, centerLabel = 'Total', height = 200, maxItems = 6, showLegend = true, fill = false, onSelect }: DonutChartProps) {
  const tone = useTone();
  const box = useElementSize();
  const [active, setActive] = useState<number | null>(null);
  const sorted = [...data].sort((a, b) => b.amount - a.amount);
  const head = sorted.slice(0, maxItems);
  const rest = sorted.slice(maxItems);
  const items: CategoryAmount[] = rest.length
    ? [
        ...head,
        {
          categoryId: OTHERS_ID,
          name: `Outras (${rest.length})`,
          icon: 'tag',
          color: '#9A9EA5',
          amount: rest.reduce((s, r) => s + r.amount, 0),
          share: rest.reduce((s, r) => s + r.share, 0),
        },
      ]
    : head;
  const chartData = items.map((d, i) => ({ ...d, fill: tone(d.color || SERIES_PALETTE[i % SERIES_PALETTE.length]!) }));
  const focused = active === null ? null : chartData[active];
  const selectable = (d: CategoryAmount) => Boolean(onSelect) && d.categoryId !== OTHERS_ID;

  // Fill mode: legend beside the donut from 448px (like the @md rule), below it otherwise.
  const beside = fill ? box.width >= 448 : false;
  const legendHeight = showLegend ? chartData.length * FILL_ROW_PX : 0;
  const diameter = fill
    ? Math.round(
        Math.min(
          260,
          Math.max(
            96,
            Math.min(beside ? box.width * 0.45 : box.width, beside ? box.height : box.height - legendHeight - 12),
          ),
        ),
      )
    : height;
  const centerValue = focused ? focused.amount : total;
  const full = formatBRL(centerValue);
  const centerText = fill && full.length > 13 ? formatCompactBRL(centerValue) : full;
  const valueStyle: CSSProperties | undefined = fill ? { fontSize: centerFontSize(centerText, diameter) } : undefined;
  const small = !fill && height < 170;

  const donut = (
    <div className="donut relative shrink-0" style={{ width: diameter, height: diameter }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart accessibilityLayer={false}>
          <Pie
            data={chartData}
            dataKey="amount"
            nameKey="name"
            innerRadius="74%"
            outerRadius="100%"
            paddingAngle={2}
            cornerRadius={6}
            stroke="none"
            animationDuration={700}
            rootTabIndex={-1}
            onMouseEnter={(_, index) => setActive(index)}
            onMouseLeave={() => setActive(null)}
            onClick={(_, index) => {
              const item = items[index];
              if (item && selectable(item)) onSelect?.(item);
            }}
          >
            {chartData.map((d, i) => (
              <Cell
                key={d.categoryId ?? d.name}
                fill={d.fill}
                opacity={active === null || active === i ? 1 : 0.35}
                className={cn('outline-none transition-opacity duration-150', selectable(d) && 'cursor-pointer')}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-[18%] text-center">
        <span className={cn('w-full truncate leading-tight font-medium text-muted', fill ? 'text-mini' : 'text-[11px]')}>{focused ? focused.name : centerLabel}</span>
        <span
          className={cn('tabular mt-0.5 font-semibold tracking-tight whitespace-nowrap text-fg', !fill && (small ? 'text-[13px]' : 'text-[15px]'))}
          style={valueStyle}
        >
          {centerText}
        </span>
        {focused ? <span className={cn('leading-tight text-muted', fill ? 'text-mini' : 'text-[11px]')}>{formatPercent(focused.share, 0)}</span> : null}
      </div>
    </div>
  );

  const legend = showLegend ? (
    <ul className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] content-center items-center gap-x-3 gap-y-0.5">
      {chartData.map((d, i) => {
        const clickable = selectable(d);
        const row = (
          <>
            <span className={cn('shrink-0 rounded-full', fill ? 'size-2' : 'size-2.5')} style={{ backgroundColor: d.fill }} />
            <span className="truncate text-left text-fg">{d.name}</span>
            <span className={cn('tabular text-right text-muted', fill ? 'text-mini' : 'text-xs')}>{formatPercent(d.share, 0)}</span>
            <span className="tabular text-right font-semibold whitespace-nowrap text-fg">{formatBRL(d.amount)}</span>
          </>
        );
        const rowClass = cn(
          'col-span-4 grid grid-cols-subgrid items-center rounded-md px-1.5 transition-colors',
          fill ? 'py-1 text-[12px]' : 'py-1.5 text-[13px]',
          active === i && 'bg-bg-subtle',
        );
        return (
          <li key={d.categoryId ?? d.name} className="col-span-4 grid grid-cols-subgrid" onMouseEnter={() => setActive(i)}>
            {clickable ? (
              <button type="button" className={cn(rowClass, 'cursor-pointer')} onClick={() => onSelect?.(d)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}>
                {row}
              </button>
            ) : (
              <div className={rowClass}>{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  ) : null;

  if (fill) {
    return (
      <div ref={box.ref} className={cn('flex min-h-0 flex-1 items-center gap-4', beside ? 'flex-row' : 'flex-col justify-center')} onMouseLeave={() => setActive(null)}>
        {box.width > 0 ? donut : null}
        {legend}
      </div>
    );
  }

  return (
    <div className="@container">
      <div className="flex flex-col items-center gap-4 @md:flex-row @md:items-center" onMouseLeave={() => setActive(null)}>
        {donut}
        {legend}
      </div>
    </div>
  );
}
