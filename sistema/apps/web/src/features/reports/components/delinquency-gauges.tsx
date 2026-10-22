import { useId } from 'react';
import { DELINQUENCY_RISK_LABELS, type DelinquencyRisk } from '@effinance/shared';
import { CHART_TEXT } from '@/components/charts/chart-utils';
import { cn } from '@/lib/utils';
import { formatChance, PROBABILITY_ZONES, probabilityZone } from '../delinquency-view';

/** Colors of each risk band (tokens only): good payer green → amber → orange → red. */
export const RISK_TONE: Record<DelinquencyRisk, { text: string; bg: string; soft: string; color: string }> = {
  baixo: { text: 'text-success', bg: 'bg-success', soft: 'bg-success-soft text-success', color: 'var(--app-success)' },
  moderado: { text: 'text-warning', bg: 'bg-warning', soft: 'bg-warning-soft text-warning', color: 'var(--app-warning)' },
  alto: { text: 'text-aging-2', bg: 'bg-aging-2', soft: 'bg-aging-2/15 text-aging-2', color: 'var(--app-aging-2)' },
  critico: { text: 'text-danger', bg: 'bg-danger', soft: 'bg-danger-soft text-danger', color: 'var(--app-danger)' },
};

export function RiskBadge({ risk, className }: { risk: DelinquencyRisk; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 items-center rounded-full px-2 text-mini font-semibold whitespace-nowrap', RISK_TONE[risk].soft, className)}>
      {DELINQUENCY_RISK_LABELS[risk]}
    </span>
  );
}

// Geometry of the vertical thermometer (px; drawn 1:1 so the 10px labels stay 10px).
const W = 132;
const TUBE_X = 34;
const TUBE_W = 16;
const TOP = 8;
const BOTTOM = 178;
const BULB_R = 15;
const BULB_CY = BOTTOM + 8;
const H = BULB_CY + BULB_R + 3;
const levelY = (p: number) => BOTTOM - Math.max(0, Math.min(1, p)) * (BOTTOM - TOP - TUBE_W / 2);

/**
 * Portfolio thermometer: a tube graded green → amber → red by the chance of paying late, filled up
 * to `probability`, with the risk zones labelled on the side.
 */
export function Thermometer({ probability }: { probability: number }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const zone = probabilityZone(probability);
  const y = levelY(probability);
  const tube = { x: TUBE_X, y: TOP, width: TUBE_W, height: BOTTOM - TOP + TUBE_W / 2, rx: TUBE_W / 2 };
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Termômetro: ${formatChance(probability)} de chance média de atraso, zona ${DELINQUENCY_RISK_LABELS[zone]}`}
      className="shrink-0 overflow-visible"
    >
      <defs>
        {/* Absolute positions so the color of a level never changes with the fill height. */}
        <linearGradient id={`${id}-g`} gradientUnits="userSpaceOnUse" x1="0" y1={levelY(0)} x2="0" y2={levelY(1)}>
          <stop offset="0" style={{ stopColor: RISK_TONE.baixo.color }} />
          <stop offset="0.12" style={{ stopColor: RISK_TONE.baixo.color }} />
          <stop offset="0.32" style={{ stopColor: RISK_TONE.moderado.color }} />
          <stop offset="0.5" style={{ stopColor: RISK_TONE.alto.color }} />
          <stop offset="0.72" style={{ stopColor: RISK_TONE.critico.color }} />
          <stop offset="1" style={{ stopColor: RISK_TONE.critico.color }} />
        </linearGradient>
        <clipPath id={`${id}-c`}>
          <rect {...tube} />
          <circle cx={TUBE_X + TUBE_W / 2} cy={BULB_CY} r={BULB_R - 3} />
        </clipPath>
      </defs>

      {/* Glass: tube + bulb. */}
      <rect {...tube} x={TUBE_X - 3} y={TOP - 3} width={TUBE_W + 6} height={tube.height + 3} rx={(TUBE_W + 6) / 2} fill="var(--app-surface)" stroke="var(--app-border-strong)" />
      <circle cx={TUBE_X + TUBE_W / 2} cy={BULB_CY} r={BULB_R} fill="var(--app-surface)" stroke="var(--app-border-strong)" />
      {/* Zones, faint, then the "mercury" up to the level. */}
      <g clipPath={`url(#${id}-c)`}>
        <rect x={TUBE_X} y={TOP} width={TUBE_W} height={BOTTOM - TOP + BULB_R * 2} fill={`url(#${id}-g)`} opacity={0.18} />
        <rect x={TUBE_X} y={y} width={TUBE_W} height={BULB_CY - y + BULB_R} fill={`url(#${id}-g)`} />
        <circle cx={TUBE_X + TUBE_W / 2} cy={BULB_CY} r={BULB_R} fill={RISK_TONE[zone].color} />
      </g>
      {/* Level marker. */}
      <line x1={TUBE_X - 6} x2={TUBE_X + TUBE_W + 6} y1={y} y2={y} stroke="var(--app-fg)" strokeWidth={2} strokeLinecap="round" />

      {/* Zone boundaries (left) and names (right). */}
      {PROBABILITY_ZONES.slice(1).map((z) => (
        <g key={z.risk}>
          <line x1={TUBE_X - 9} x2={TUBE_X - 4} y1={levelY(z.from)} y2={levelY(z.from)} stroke="var(--app-border-strong)" />
          <text x={TUBE_X - 11} y={levelY(z.from) + 3.5} textAnchor="end" fontSize={CHART_TEXT.axis} fill="var(--app-subtle)" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(z.from * 100)}%
          </text>
        </g>
      ))}
      {PROBABILITY_ZONES.map((z) => {
        const active = z.risk === zone;
        return (
          <text
            key={z.risk}
            x={TUBE_X + TUBE_W + 10}
            y={levelY((z.from + Math.min(z.to, 0.8)) / 2) + 3.5}
            fontSize={CHART_TEXT.category}
            fontWeight={active ? 700 : 500}
            fill={active ? RISK_TONE[z.risk].color : 'var(--app-muted)'}
          >
            {DELINQUENCY_RISK_LABELS[z.risk]}
          </text>
        );
      })}
    </svg>
  );
}

/** Small horizontal gauge of a client's score (0..1000), filled in the color of its risk band. */
export function ScoreBar({ score, risk, className }: { score: number; risk: DelinquencyRisk; className?: string }) {
  const pct = Math.max(0, Math.min(1000, score)) / 10;
  return (
    <span className={cn('block h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle', className)} aria-hidden>
      <span className={cn('block h-full min-w-1 rounded-full', RISK_TONE[risk].bg)} style={{ width: `${pct}%` }} />
    </span>
  );
}
