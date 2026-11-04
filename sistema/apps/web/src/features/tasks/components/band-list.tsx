import { cn } from '@/lib/utils';
import { BAND_DOT, type Band, type BandTone } from '../dashboard-logic';

const COUNT_TONE: Record<BandTone, string> = {
  danger: 'text-danger',
  warning: 'text-warning',
  success: 'text-fg',
  muted: 'text-fg',
  data: 'text-fg',
};

/**
 * The bands of a dashboard card (Effy's "cert-stat-line"): a dot, the name and the count. Each band is
 * a button that opens the list behind it; an empty band stays visible but cannot be opened.
 */
export function BandList<K extends string>({ bands, onSelect, ariaLabel, className }: { bands: Band<K>[]; onSelect: (key: K) => void; ariaLabel: string; className?: string }) {
  return (
    <ul className={cn('-mx-2 flex flex-col', className)} aria-label={ariaLabel}>
      {bands.map((b) => (
        <li key={b.key}>
          <button
            type="button"
            disabled={b.count === 0}
            onClick={() => onSelect(b.key)}
            aria-label={`${b.label}: ${b.count}${b.hint ? ` (${b.hint})` : ''}. Ver a lista.`}
            className="group/band flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors enabled:hover:bg-surface-muted disabled:cursor-default"
          >
            <span className={cn('size-2 shrink-0 rounded-full', BAND_DOT[b.tone], b.count === 0 && 'opacity-40')} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className={cn('block truncate text-body-sm', b.count ? 'text-fg' : 'text-muted')}>{b.label}</span>
              {b.hint ? <span className="block truncate text-caption text-muted">{b.hint}</span> : null}
            </span>
            <span className={cn('tabular text-body-sm font-semibold', b.count ? COUNT_TONE[b.tone] : 'text-subtle')}>{b.count}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const STROKE: Record<BandTone, string> = {
  danger: 'stroke-danger',
  warning: 'stroke-warning',
  success: 'stroke-success',
  muted: 'stroke-border-strong',
  data: 'stroke-data',
};

/** Ring of the bands (decorative: the bands beside it carry the numbers). */
export function MiniDonut({ segments, center, caption, size = 112 }: { segments: { value: number; tone: BandTone }[]; center: string; caption: string; size?: number }) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0);
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-bg-subtle" />
        {total > 0
          ? segments
              .filter((s) => s.value > 0)
              .map((s, i) => {
                const len = (s.value / total) * c;
                const el = (
                  <circle
                    key={i}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    strokeWidth={stroke}
                    strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`}
                    strokeDashoffset={-offset}
                    className={STROKE[s.tone]}
                  />
                );
                offset += len;
                return el;
              })
          : null}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular text-[22px] leading-7 font-semibold tracking-tight text-fg">{center}</span>
        <span className="text-caption text-muted">{caption}</span>
      </span>
    </div>
  );
}

/** Horizontal bar split in parts (done, pending, overdue…), without track gaps. */
export function SegmentBar({ segments, className }: { segments: { value: number; tone: BandTone }[]; className?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <span className={cn('flex h-1.5 min-w-0 overflow-hidden rounded-full bg-bg-subtle', className)} aria-hidden>
      {total > 0
        ? segments
            .filter((s) => s.value > 0)
            .map((s, i) => <span key={i} className={cn('h-full', BAND_DOT[s.tone])} style={{ width: `${(s.value / total) * 100}%` }} />)
        : null}
    </span>
  );
}
