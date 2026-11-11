import { CHART_COLORS, CHART_TEXT } from '@/components/charts/chart-utils';

/**
 * Month on a chart's X axis ("Out/26"); the `partial` one gets "parcial" on a second line (kept out of
 * the tick value, so recharts measures only "Nov/26" when spacing the labels). `active` is bold.
 */
export function MonthTick(props: { x?: number | string; y?: number | string; payload?: { value?: string }; active?: string; partial?: string }) {
  const value = String(props.payload?.value ?? '');
  const month = value;
  const note = props.partial !== undefined && props.partial === value ? 'parcial' : null;
  const bold = props.active !== undefined && props.active === value;
  return (
    <g transform={`translate(${Number(props.x ?? 0)},${Number(props.y ?? 0)})`}>
      <text dy={10} textAnchor="middle" fontSize={CHART_TEXT.category} fontWeight={bold ? 600 : 400} fill={bold ? 'var(--app-fg)' : CHART_COLORS.axis}>
        {month}
      </text>
      {note ? (
        <text dy={22} textAnchor="middle" fontSize={CHART_TEXT.category} fill={CHART_COLORS.axis}>
          {note}
        </text>
      ) : null}
    </g>
  );
}
