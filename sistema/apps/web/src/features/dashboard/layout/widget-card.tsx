import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type Key,
  type ReactNode,
  type Ref,
} from 'react';
import { Link } from 'react-router';
import { EyeOff, GripVertical, Info } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { useElementSize } from '@/lib/use-element-size';
import { cn } from '@/lib/utils';
import { fitCount } from './layout';
import type { WidgetAlert, WidgetId } from './types';

/** What the grid gives each card: its title, the move/hide controls and the resize state. */
export interface WidgetChrome {
  id: WidgetId;
  title: string;
  onHide: () => void;
  /** Mouse/pen drag from the header. */
  headerProps: Pick<HTMLAttributes<HTMLElement>, 'onPointerDown'>;
  /** Touch drag and keyboard moves. */
  gripProps: ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> };
  /** The corner handle is being dragged (charts skip their animations meanwhile). */
  resizing: boolean;
}

export const WidgetChromeContext = createContext<WidgetChrome | null>(null);

/** True while the card is being resized: pass `isAnimationActive={!resizing}` to Recharts marks. */
export function useWidgetResizing(): boolean {
  return useContext(WidgetChromeContext)?.resizing ?? false;
}

/** Controls revealed on hover/focus (always visible on touch screens). */
const chromeButton =
  'flex size-6 items-center justify-center rounded-md text-muted opacity-0 transition-opacity group-hover/widget:opacity-60 group-focus-within/widget:opacity-100 hover:!opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-70 [&_svg]:size-3.5';

function ChromeButtons({ chrome, onDark }: { chrome: WidgetChrome; onDark: boolean }) {
  const { ref, className, ...grip } = chrome.gripProps;
  return (
    <div className="-mr-1 flex shrink-0 items-center">
      <button
        ref={ref}
        type="button"
        {...grip}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          chromeButton,
          'cursor-grab touch-none select-none [-webkit-touch-callout:none] active:cursor-grabbing',
          onDark ? 'text-white/80 hover:bg-white/10' : 'hover:bg-bg-subtle hover:text-fg',
          className,
        )}
      >
        <GripVertical />
      </button>
      <button
        type="button"
        onClick={chrome.onHide}
        aria-label={`Ocultar ${chrome.title}`}
        title="Ocultar card"
        className={cn(chromeButton, onDark ? 'text-white/80 hover:bg-white/10' : 'hover:bg-danger-soft hover:text-danger')}
      >
        <EyeOff />
      </button>
    </div>
  );
}

interface WidgetCardProps {
  /** Defaults to the widget's catalog title. */
  title?: ReactNode;
  subtitle?: ReactNode;
  info?: ReactNode;
  /** Header controls (period tabs, filters). Below 384px of card width they drop to a second row. */
  action?: ReactNode;
  alert?: WidgetAlert;
  footer?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
  /** Flat navy surface with white text. */
  variant?: 'default' | 'hero';
}

/**
 * Card of a dashboard widget: fixed header and footer, body taking the remaining height so
 * charts and lists grow with the card. Small text: title 14px, subtitle 11.5px.
 */
export function WidgetCard({ title, subtitle, info, action, alert, footer, children, bodyClassName, className, variant = 'default' }: WidgetCardProps) {
  const chrome = useContext(WidgetChromeContext);
  const heading = title ?? chrome?.title;
  const hero = variant === 'hero';
  return (
    <section
      className={cn(
        '@container relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border p-5',
        hero ? 'border-transparent bg-hero-from text-white' : 'border-border bg-surface',
        className,
      )}
      aria-label={typeof heading === 'string' ? heading : undefined}
    >
      <header {...chrome?.headerProps} className={cn('flex shrink-0 flex-wrap items-start gap-x-2 gap-y-2', chrome && 'cursor-grab active:cursor-grabbing')}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {alert ? <span className="size-1.5 shrink-0 rounded-full bg-danger" aria-hidden /> : null}
            <h3 className={cn('truncate text-title-sm font-semibold tracking-tight', hero ? 'text-white' : 'text-fg')}>{heading}</h3>
            {info ? (
              <Tooltip content={info}>
                <button type="button" className={cn('shrink-0', hero ? 'text-white/60 hover:text-white' : 'text-subtle hover:text-muted')} aria-label="Mais informações">
                  <Info className="size-3.5" />
                </button>
              </Tooltip>
            ) : null}
          </div>
          {subtitle ? <p className={cn('mt-0.5 truncate text-caption', hero ? 'text-white/65' : 'text-muted')}>{subtitle}</p> : null}
        </div>
        {action ? <div className="order-last flex basis-full items-center gap-1 @sm:order-none @sm:basis-auto @sm:shrink-0">{action}</div> : null}
        {chrome ? <ChromeButtons chrome={chrome} onDark={hero} /> : null}
      </header>
      <div className={cn('mt-3.5 flex min-h-0 flex-1 flex-col', bodyClassName)}>{children}</div>
      {footer ? <div className="mt-3 shrink-0">{footer}</div> : null}
    </section>
  );
}

/** Height of the "+ N …" line under a cut list. */
const MORE_LINE_PX = 20;

interface FitListProps<T> {
  items: readonly T[];
  getKey: (item: T) => Key;
  renderItem: (item: T, index: number) => ReactNode;
  /** Real number of rows when `items` is only part of them (server-capped lists). */
  total?: number;
  /** "+ N {moreLabel}" (e.g. "vencimento(s)"). */
  moreLabel: string;
  moreHref?: string;
  /** Classes of the list itself (`flex flex-col gap-1`, `divide-y`…); rows are its direct children. */
  className?: string;
  /** Changes in row content that keep the same count but may change heights. */
  contentKey?: string;
}

/**
 * List cut to the rows that fit in the remaining height of the card, re-measured on every resize.
 * Rows may have different heights (each one is measured). A "+ N …" line replaces what was cut.
 * Takes `flex-1` of a column flex parent (the card body).
 */
export function FitList<T>({ items, getKey, renderItem, total, moreLabel, moreHref, className, contentKey = '' }: FitListProps<T>) {
  const box = useElementSize();
  const listRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(items.length);
  const realTotal = Math.max(total ?? items.length, items.length);
  const signature = `${items.length}:${realTotal}:${box.width}:${box.height}:${contentKey}`;

  // Size or content changed: render every row again, then measure them below.
  useLayoutEffect(() => {
    setCount(items.length);
  }, [signature, items.length]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || box.height === 0) return;
    const rows = Array.from(list.children) as HTMLElement[];
    if (rows.length !== items.length) return;
    const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
    const next = fitCount(
      rows.map((row) => row.offsetHeight),
      box.height,
      MORE_LINE_PX,
      gap,
      realTotal > items.length,
    );
    if (next !== count) setCount(next);
  });

  const shown = items.slice(0, count);
  const hidden = realTotal - shown.length;
  return (
    <div ref={box.ref} className="relative min-h-0 flex-1 overflow-hidden">
      <div ref={listRef} className={className}>
        {shown.map((item, i) => (
          <div key={getKey(item)} className="min-w-0">
            {renderItem(item, i)}
          </div>
        ))}
      </div>
      {hidden > 0 ? (
        <p className="absolute inset-x-0 bottom-0 flex h-5 items-end px-1 text-caption text-muted">
          {moreHref ? (
            <Link to={moreHref} className="font-medium text-brand-text hover:underline">
              {`+ ${hidden} ${moreLabel}`}
            </Link>
          ) : (
            `+ ${hidden} ${moreLabel}`
          )}
        </p>
      ) : null}
    </div>
  );
}
