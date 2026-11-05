import { sparkPath } from './chart-scale';

interface SparklineProps {
  values: number[];
  /** `data` (blue) for the main series; `neutral` (grey) for expenses. */
  tone?: 'data' | 'neutral';
  width?: number;
  height?: number;
}

const STROKE = { data: 'var(--app-data)', neutral: 'var(--app-chart-expense-strong)' } as const;

/** Tiny trend line (no axes) with a dot on the last value; decorative, the number beside it is the data. */
export function Sparkline({ values, tone = 'data', width = 96, height = 32 }: SparklineProps) {
  const d = sparkPath(values, width, height);
  if (!d) return null;
  const last = d.slice(d.lastIndexOf(d.includes('L') ? 'L' : 'M') + 1).split(' ').map(Number);
  return (
    // Squeezes horizontally when the cell is narrow (the strokes and the dot keep their size).
    <svg aria-hidden width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block max-w-full overflow-visible">
      <path d={d} fill="none" stroke={STROKE[tone]} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <path d={`M${last[0]} ${last[1]} h0`} stroke={STROKE[tone]} strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
