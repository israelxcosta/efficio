interface GaugeProps {
  /** 0..1000 */
  score: number;
  size?: number;
}

/**
 * Semicircular health gauge: one hue on a grey track, red only below 400 (where the score is a
 * problem). The band's name sits under the number, so colour is not the only signal.
 */
export function Gauge({ score, size = 200 }: GaugeProps) {
  const clamped = Math.max(0, Math.min(1000, score));
  const r = 80;
  const cx = 100;
  const cy = 95;
  // The knob is drawn at the arc's start and rotated around the centre, so it travels along the arc
  // with the stroke instead of jumping to the end while the stroke animates.
  const deg = (clamped / 1000) * 180;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const length = Math.PI * r;
  const progress = (clamped / 1000) * length;
  // The score is drawn at 20–28px on screen whatever the gauge size (viewBox is 200 wide).
  const scale = size / 200;
  const fontSize = Math.min(28, Math.max(20, 30 * scale)) / scale;
  return (
    <svg viewBox="0 0 200 110" width={size} height={size * 0.55} role="img" aria-label={`Pontuação ${Math.round(clamped)} de 1000`}>
      <path d={arc} fill="none" stroke="var(--app-bg-subtle)" strokeWidth="10" strokeLinecap="round" />
      <path
        d={arc}
        fill="none"
        stroke={clamped < 400 ? 'var(--app-chart-red-strong)' : 'var(--app-data)'}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${progress} ${length}`}
        style={{ transition: 'stroke-dasharray var(--dur-chart) var(--ease-out)' }}
      />
      <g style={{ transform: `rotate(${deg}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: 'transform var(--dur-chart) var(--ease-out)' }}>
        <circle cx={cx - r} cy={cy} r="7" fill="var(--app-surface)" stroke="var(--app-fg)" strokeWidth="2.5" />
      </g>
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={fontSize} fontWeight="700" fill="var(--app-fg)" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(clamped)}
      </text>
    </svg>
  );
}
