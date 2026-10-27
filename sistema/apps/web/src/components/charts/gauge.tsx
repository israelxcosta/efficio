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
  const angle = Math.PI * (1 - clamped / 1000);
  const mx = cx + r * Math.cos(angle);
  const my = cy - r * Math.sin(angle);
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
        stroke={clamped < 400 ? 'var(--app-danger)' : 'var(--app-data)'}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${progress} ${length}`}
        style={{ transition: 'stroke-dasharray 700ms cubic-bezier(.2,.8,.2,1)' }}
      />
      <circle cx={mx} cy={my} r="7" fill="var(--app-surface)" stroke="var(--app-fg)" strokeWidth="2.5" />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={fontSize} fontWeight="700" fill="var(--app-fg)" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(clamped)}
      </text>
    </svg>
  );
}
