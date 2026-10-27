import {
  Component as ReactComponent,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { ChevronDown, MoveDiagonal2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import type { DashboardResponse, WorkspaceKind } from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import { useElementSize } from '@/lib/use-element-size';
import { cn } from '@/lib/utils';
import { clampSize, columnsForWidth, commitCols, displaySpan, GRID, moveWidget, resolveSection, rowPxFor, snapResize } from './layout';
import { useDashboardLayout, type DashboardLayoutApi } from './layout-store';
import { SECTIONS, WIDGET_SPECS } from './specs';
import type { SectionId, SectionSpec, WidgetAlert, WidgetId, WidgetProps, WidgetSize, WidgetSpec } from './types';
import { WidgetChromeContext, type WidgetChrome } from './widget-card';
import { SectionAlertModal } from './alerts';

export type WidgetComponents = Record<WidgetId, ComponentType<WidgetProps>>;

/** Id of the "Personalizar" button (focus lands there when the last card of a section is hidden). */
export const CUSTOMIZE_BUTTON_ID = 'dashboard-personalizar';

interface BoardProps {
  month: string;
  d: DashboardResponse | undefined;
  loading: boolean;
  kind: WorkspaceKind | undefined;
  components: WidgetComponents;
  alerts: Partial<Record<WidgetId, WidgetAlert>>;
}

/** Room kept above fixed bottom bars (mobile nav, quick bar) for the drag auto-scroll. */
function bottomInset(): number {
  let inset = 0;
  for (const el of document.querySelectorAll<HTMLElement>('[data-bottom-bar]')) {
    const rect = el.getBoundingClientRect();
    if (rect.height > 0) inset = Math.max(inset, window.innerHeight - rect.top);
  }
  return inset;
}

/** Swallows the click the browser fires right after a drag ends on a link or button. */
function suppressNextClick() {
  const stop = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
}

/** Interactive elements inside a header never start a drag. */
const NO_DRAG = 'button, a, input, select, textarea, label, [role="radio"], [role="tab"], [role="combobox"], [role="switch"], .recharts-wrapper';

/** The dashboard grid: one collapsible section per group, each with its own widget order. */
export function DashboardBoard({ month, d, loading, kind, components, alerts }: BoardProps) {
  const api = useDashboardLayout();
  const { ref, width } = useElementSize();
  const cols = columnsForWidth(width);
  const [announcement, setAnnouncement] = useState('');

  // The wrapper always renders; the sections wait for its width so charts mount once, at the right size.
  return (
    <div ref={ref} className="flex flex-col gap-8">
      {width === 0 ? null : SECTIONS.map((section) => {
        const items = resolveSection(api.layout, section.id, WIDGET_SPECS, kind);
        if (items.length === 0) return null;
        return (
          <DashboardSection
            key={section.id}
            section={section}
            items={items}
            cols={cols}
            api={api}
            collapsed={api.layout.collapsed.includes(section.id)}
            alerts={alerts}
            components={components}
            widgetProps={{ month, d, loading, prefs: api.prefs, setPref: api.setPref, business: kind === 'business' }}
            announce={setAnnouncement}
          />
        );
      })}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

interface SectionProps {
  section: SectionSpec;
  items: { spec: WidgetSpec; size: WidgetSize }[];
  cols: number;
  api: DashboardLayoutApi;
  collapsed: boolean;
  alerts: Partial<Record<WidgetId, WidgetAlert>>;
  components: WidgetComponents;
  widgetProps: Omit<WidgetProps, 'size' | 'alert'>;
  announce: (message: string) => void;
}

function DashboardSection({ section, items, cols, api, collapsed, alerts, components, widgetProps, announce }: SectionProps) {
  const [drag, setDrag] = useState<{ id: WidgetId; overId: WidgetId | null } | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const gripRefs = useRef(new Map<WidgetId, HTMLButtonElement>());
  const gridId = `secao-${section.id}`;
  const visibleIds = useMemo(() => items.map((i) => i.spec.id), [items]);
  const titleOf = useCallback((id: WidgetId) => items.find((i) => i.spec.id === id)?.spec.title ?? '', [items]);
  const sectionAlerts = items
    .map((i) => (alerts[i.spec.id] ? { spec: i.spec, alert: alerts[i.spec.id]! } : null))
    .filter((x): x is { spec: WidgetSpec; alert: WidgetAlert } => x !== null);
  const alertTotal = sectionAlerts.reduce((sum, a) => sum + a.alert.count, 0);

  /** Pointer drag (mouse/pen from the header, any pointer from the grip). */
  const beginDrag = useCallback(
    (e: ReactPointerEvent, id: WidgetId, fromGrip: boolean) => {
      if (e.button !== 0) return;
      if (!fromGrip && (e.pointerType === 'touch' || (e.target as HTMLElement).closest(NO_DRAG))) return;
      const card = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-widget-id]');
      if (!card) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const startScroll = window.scrollY;
      let lastX = startX;
      let lastY = startY;
      let started = false;
      let over: WidgetId | null = null;
      let frame = 0;
      let scrollZone = { top: 80, bottom: window.innerHeight - 80 };

      // The card follows the pointer (scroll included); pointer-events off so the target below is found.
      const place = () => {
        card.style.transform = `translate(${lastX - startX}px, ${lastY - startY + window.scrollY - startScroll}px)`;
      };
      const scroll = () => {
        if (lastY < scrollZone.top) window.scrollBy(0, -16);
        else if (lastY > scrollZone.bottom) window.scrollBy(0, 16);
        place();
        frame = requestAnimationFrame(scroll);
      };
      const onMove = (ev: PointerEvent) => {
        if (!started) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
          started = true;
          document.body.style.userSelect = 'none';
          card.style.pointerEvents = 'none';
          scrollZone = { top: 80, bottom: window.innerHeight - 80 - bottomInset() };
          setDrag({ id, overId: null });
          frame = requestAnimationFrame(scroll);
        }
        ev.preventDefault();
        lastX = ev.clientX;
        lastY = ev.clientY;
        place();
        // Over a gap the last target is kept, so a drop between cards still lands.
        const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-widget-id]');
        if (el && el.dataset.section === section.id && el.dataset.widgetId !== id && el.dataset.widgetId !== over) {
          over = el.dataset.widgetId as WidgetId;
          setDrag({ id, overId: over });
        }
      };
      const end = (commit: boolean) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey);
        cancelAnimationFrame(frame);
        document.body.style.userSelect = '';
        card.style.transform = '';
        card.style.pointerEvents = '';
        if (!started) return;
        suppressNextClick();
        if (commit && over) {
          const order = moveWidget(visibleIds, id, over);
          api.move(section.id, id, over);
          toast('Cards reorganizados.');
          announce(`${titleOf(id)}: posição ${order.indexOf(id) + 1} de ${order.length}`);
        }
        setDrag(null);
      };
      const onUp = () => end(true);
      const onCancel = () => end(false);
      const onKey = (ev: globalThis.KeyboardEvent) => {
        if (ev.key === 'Escape') end(false);
      };
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey);
    },
    [api, section.id, visibleIds, announce, titleOf],
  );

  const moveWithKeyboard = (e: KeyboardEvent, spec: WidgetSpec) => {
    const delta = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1, Home: 'first', End: 'last' }[e.key] as number | 'first' | 'last' | undefined;
    if (delta === undefined) return;
    e.preventDefault();
    const from = visibleIds.indexOf(spec.id);
    const to = delta === 'first' ? 0 : delta === 'last' ? visibleIds.length - 1 : Math.min(Math.max(from + delta, 0), visibleIds.length - 1);
    if (to === from) return;
    api.moveBy(section.id, spec.id, delta, visibleIds);
    announce(`${spec.title}: posição ${to + 1} de ${visibleIds.length}`);
    requestAnimationFrame(() => gripRefs.current.get(spec.id)?.focus());
  };

  const hide = (spec: WidgetSpec) => {
    // Focus goes to the next card's grip (or the previous one, or "Personalizar") instead of the page.
    const index = visibleIds.indexOf(spec.id);
    const nextId = visibleIds[index + 1] ?? visibleIds[index - 1];
    api.setVisible(spec.id, false);
    requestAnimationFrame(() => {
      const target = (nextId && gripRefs.current.get(nextId)) || document.getElementById(CUSTOMIZE_BUTTON_ID);
      target?.focus();
    });
    toast(`"${spec.title}" foi ocultado.`, {
      description: 'Reexiba em Personalizar.',
      duration: 8000,
      action: { label: 'Desfazer', onClick: () => api.setVisible(spec.id, true) },
    });
  };

  return (
    <section aria-labelledby={`${gridId}-titulo`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          id={`${gridId}-titulo`}
          aria-expanded={!collapsed}
          aria-controls={collapsed ? undefined : gridId}
          onClick={() => api.toggleSection(section.id)}
          className="flex items-center gap-1.5 rounded-md py-0.5 pr-1.5 text-[17px] font-semibold tracking-tight text-fg hover:text-brand-text"
        >
          <ChevronDown className={cn('size-4 text-muted transition-transform', collapsed && '-rotate-90')} aria-hidden />
          {section.title}
        </button>
        {alertTotal > 0 ? (
          <Tooltip content={sectionAlerts.map((a) => `${a.spec.title}: ${a.alert.count}`).join(' · ')}>
            <button type="button" onClick={() => setAlertsOpen(true)} className="rounded-full">
              <Badge tone="danger">
                <TriangleAlert />
                {alertTotal === 1 ? '1 exige atenção' : `${alertTotal} exigem atenção`}
              </Badge>
            </button>
          </Tooltip>
        ) : null}
      </div>
      {collapsed ? null : (
        <div
          id={gridId}
          data-widget-grid
          className="grid grid-flow-row-dense gap-4"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: `${rowPxFor(cols)}px` }}
        >
          {items.map(({ spec, size }) => {
            const WidgetBody = components[spec.id];
            return (
              <WidgetFrame
                key={spec.id}
                spec={spec}
                size={size}
                cols={cols}
                section={section.id}
                api={api}
                dragging={drag?.id === spec.id}
                dropTarget={drag?.overId === spec.id}
                announce={announce}
                chrome={{
                  id: spec.id,
                  title: spec.title,
                  resizing: false,
                  onHide: () => hide(spec),
                  headerProps: { onPointerDown: (e) => beginDrag(e, spec.id, false) },
                  gripProps: {
                    ref: (el: HTMLButtonElement | null) => {
                      if (el) gripRefs.current.set(spec.id, el);
                      else gripRefs.current.delete(spec.id);
                    },
                    'aria-label': `Mover ${spec.title}`,
                    title: 'Arraste para mover (ou use as setas)',
                    onPointerDown: (e) => {
                      e.stopPropagation();
                      beginDrag(e, spec.id, true);
                    },
                    onKeyDown: (e) => moveWithKeyboard(e, spec),
                  },
                }}
              >
                {(displayed) => <WidgetBody {...widgetProps} size={displayed} alert={alerts[spec.id]} />}
              </WidgetFrame>
            );
          })}
        </div>
      )}
      <SectionAlertModal
        open={alertsOpen}
        onOpenChange={setAlertsOpen}
        title={`${section.title} — exigem atenção`}
        items={sectionAlerts.map((a) => ({ title: a.spec.title, alert: a.alert }))}
      />
    </section>
  );
}

interface FrameProps {
  spec: WidgetSpec;
  size: WidgetSize;
  cols: number;
  section: SectionId;
  api: DashboardLayoutApi;
  dragging: boolean;
  dropTarget: boolean;
  chrome: WidgetChrome;
  announce: (message: string) => void;
  children: (displayed: WidgetSize) => ReactNode;
}

/** Grid item: spans, drag states and the corner resize handle (pointer drag or arrow keys). */
function WidgetFrame({ spec, size, cols, section, api, dragging, dropTarget, chrome, announce, children }: FrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<WidgetSize | null>(null);
  const shown = preview ?? size;
  const displayed = useMemo(() => ({ c: displaySpan(shown.c, cols), r: shown.r }), [shown.c, shown.r, cols]);
  const style: CSSProperties = { gridColumn: `span ${displayed.c}`, gridRow: `span ${displayed.r}` };
  const resizing = preview !== null;
  const chromeValue = useMemo(() => ({ ...chrome, resizing }), [chrome, resizing]);

  const commit = (next: WidgetSize, startDisplayed: number) => {
    const stored = { c: commitCols(size.c, startDisplayed, next.c), r: next.r };
    if (stored.c !== size.c || stored.r !== size.r) api.setSize(spec.id, stored);
    announce(`${spec.title}: ${displaySpan(stored.c, cols)} × ${stored.r}`);
  };

  const onResizeStart = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const grid = frameRef.current?.closest<HTMLElement>('[data-widget-grid]');
    if (!grid) return;
    const css = getComputedStyle(grid);
    const gap = parseFloat(css.columnGap) || GRID.gap;
    const rowPx = parseFloat(css.gridAutoRows) || rowPxFor(cols);
    const colW = (grid.getBoundingClientRect().width - gap * (cols - 1)) / cols;
    const start = { x: e.clientX, y: e.clientY, size: { c: displaySpan(size.c, cols), r: size.r } };
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    let latest = start.size;
    let done = false;
    const onMove = (ev: PointerEvent) => {
      latest = snapResize(start.size, ev.clientX - start.x, ev.clientY - start.y, { colW, rowPx, gap, cols }, spec);
      setPreview((prev) => (prev && prev.c === latest.c && prev.r === latest.r ? prev : latest));
    };
    const finish = (save: boolean) => {
      if (done) return;
      done = true;
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('lostpointercapture', onLost);
      window.removeEventListener('keydown', onKey);
      if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
      if (save) commit(latest, start.size.c);
      setPreview(null);
    };
    const onUp = () => finish(true);
    const onLost = () => finish(false);
    // Escape puts the card back to the size it had before the drag.
    const onKey = (ev: globalThis.KeyboardEvent) => {
      if (ev.key === 'Escape') finish(false);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('lostpointercapture', onLost);
    window.addEventListener('keydown', onKey);
  };

  const onResizeKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key] as [number, number] | undefined;
    if (!step) return;
    e.preventDefault();
    const current = { c: displaySpan(size.c, cols), r: size.r };
    const next = clampSize({ c: Math.min(current.c + step[0], cols), r: current.r + step[1] }, spec);
    commit({ c: Math.min(next.c, cols), r: next.r }, current.c);
  };

  return (
    <div
      ref={frameRef}
      data-widget-id={spec.id}
      data-section={section}
      data-size={`${displayed.c}x${displayed.r}`}
      style={style}
      className={cn(
        'group/widget relative min-h-0 min-w-0 rounded-xl',
        dragging && 'z-30 opacity-90 shadow-lg',
        dropTarget && 'outline-2 outline-offset-2 outline-primary outline-dashed',
        preview && 'z-20 outline-2 outline-offset-2 outline-primary',
      )}
    >
      <WidgetChromeContext.Provider value={chromeValue}>
        <WidgetErrorBoundary title={spec.title}>{children(displayed)}</WidgetErrorBoundary>
      </WidgetChromeContext.Provider>
      {preview ? (
        <span className="tabular pointer-events-none absolute right-7 bottom-1.5 z-10 rounded-md bg-fg px-1.5 py-0.5 text-mini font-semibold text-surface">
          {displayed.c} × {displayed.r}
        </span>
      ) : null}
      <button
        type="button"
        onPointerDown={onResizeStart}
        onKeyDown={onResizeKey}
        aria-label={`Redimensionar ${spec.title}`}
        title="Arraste para redimensionar (ou use as setas)"
        className={cn(
          'absolute right-1 bottom-1 z-10 flex size-[18px] cursor-nwse-resize touch-none items-center justify-center rounded text-muted transition-opacity',
          'opacity-0 group-hover/widget:opacity-60 hover:!opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-70',
          preview && 'opacity-100',
        )}
      >
        <MoveDiagonal2 className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

class WidgetErrorBoundary extends ReactComponent<{ title: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-surface p-4 text-center">
        <p className="text-title-sm font-semibold text-fg">{this.props.title}</p>
        <p className="text-caption text-muted">Não foi possível exibir este card agora.</p>
      </div>
    );
  }
}
