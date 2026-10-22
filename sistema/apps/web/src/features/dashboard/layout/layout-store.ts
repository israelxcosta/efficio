// Dashboard layout persisted per workspace + user in localStorage (sizes, order, hidden cards,
// collapsed sections and the options of each widget). Storage can be missing or throw (private
// windows, blocked site data): the layout then lives in memory for the page load.

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { DEFAULT_PREFS, emptyLayout, mergeOrder, moveBy as moveByRule, moveWidget, sanitizeLayout } from './layout';
import { SECTIONS, WIDGET_SPECS } from './specs';
import type { DashboardLayout, DashboardPrefs, SectionId, WidgetId, WidgetSize } from './types';

const SECTION_IDS = SECTIONS.map((s) => s.id);

export function layoutStorageKey(workspaceId: string, userId: string): string {
  return `effinance.dashboardLayout.v1:${workspaceId}:${userId}`;
}

export function readLayout(key: string, storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): DashboardLayout {
  try {
    const raw = storage?.getItem(key);
    return raw ? sanitizeLayout(JSON.parse(raw), WIDGET_SPECS, SECTION_IDS) : emptyLayout();
  } catch {
    return emptyLayout();
  }
}

export function writeLayout(key: string, layout: DashboardLayout, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  try {
    storage?.setItem(key, JSON.stringify(layout));
  } catch {
    // Quota or blocked storage: keep the in-memory layout.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

// One in-memory copy per key, shared by every component that reads the layout.
const cache = new Map<string, DashboardLayout>();
const listeners = new Set<() => void>();
const MEMORY_KEY = '__memory__';

function current(key: string): DashboardLayout {
  let layout = cache.get(key);
  if (!layout) {
    layout = key === MEMORY_KEY ? emptyLayout() : readLayout(key);
    cache.set(key, layout);
  }
  return layout;
}

function commit(key: string, next: DashboardLayout) {
  cache.set(key, next);
  if (key !== MEMORY_KEY) writeLayout(key, next);
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed the same layout.
  const onStorage = (e: StorageEvent) => {
    if (e.key && cache.has(e.key)) {
      cache.set(e.key, readLayout(e.key));
      listener();
    }
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

function defaultOrder(section: SectionId): WidgetId[] {
  return WIDGET_SPECS.filter((s) => s.section === section).map((s) => s.id);
}

export interface DashboardLayoutApi {
  layout: DashboardLayout;
  prefs: DashboardPrefs;
  setSize: (id: WidgetId, size: WidgetSize) => void;
  /** Drag and drop: `id` lands next to `targetId` (Effy's rule). */
  move: (section: SectionId, id: WidgetId, targetId: WidgetId) => void;
  /** Keyboard: moves among the section's currently visible widgets. */
  moveBy: (section: SectionId, id: WidgetId, delta: number | 'first' | 'last', visibleIds: WidgetId[]) => void;
  setVisible: (id: WidgetId, visible: boolean) => void;
  showAll: () => void;
  toggleSection: (id: SectionId) => void;
  setPref: <K extends keyof DashboardPrefs>(key: K, value: DashboardPrefs[K]) => void;
  reset: () => void;
}

export function useDashboardLayout(): DashboardLayoutApi {
  const { user, workspace } = useAuth();
  const key = user && workspace ? layoutStorageKey(workspace.id, user.id) : MEMORY_KEY;
  const layout = useSyncExternalStore(
    subscribe,
    () => current(key),
    () => current(key),
  );

  const update = useCallback((fn: (l: DashboardLayout) => DashboardLayout) => commit(key, fn(current(key))), [key]);

  return useMemo<DashboardLayoutApi>(
    () => ({
      layout,
      prefs: { ...DEFAULT_PREFS, ...layout.prefs },
      setSize: (id, size) => update((l) => ({ ...l, sizes: { ...l.sizes, [id]: size } })),
      move: (section, id, targetId) =>
        update((l) => ({ ...l, order: { ...l.order, [section]: moveWidget(mergeOrder(l.order[section], defaultOrder(section)), id, targetId) } })),
      moveBy: (section, id, delta, visibleIds) =>
        update((l) => {
          const full = mergeOrder(l.order[section], defaultOrder(section));
          const movedVisible = moveByRule(visibleIds, id, delta);
          // Hidden widgets keep their slots; the visible ones take the remaining slots in the new order.
          const visibleSet = new Set(visibleIds);
          let i = 0;
          const next = full.map((w) => (visibleSet.has(w) ? movedVisible[i++]! : w));
          return { ...l, order: { ...l.order, [section]: next } };
        }),
      setVisible: (id, visible) => update((l) => ({ ...l, visible: { ...l.visible, [id]: visible } })),
      showAll: () =>
        update((l) => ({
          ...l,
          // Default-hidden widgets the user turned on stay on; everything else goes back to visible.
          visible: Object.fromEntries(Object.entries(l.visible).filter(([, v]) => v)),
        })),
      toggleSection: (id) =>
        update((l) => ({ ...l, collapsed: l.collapsed.includes(id) ? l.collapsed.filter((x) => x !== id) : [...l.collapsed, id] })),
      setPref: (k, v) => update((l) => ({ ...l, prefs: { ...l.prefs, [k]: v } })),
      reset: () => update(() => emptyLayout()),
    }),
    [layout, update],
  );
}
