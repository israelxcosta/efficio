// Layout of a free board persisted per workspace + user in localStorage (sizes, cells of each board,
// hidden cards and the options of each widget). One store serves every board (the Painel financeiro,
// the Minha área): each has its own key prefix and its own specs (`BoardConfig`). Storage can be
// missing or throw (private windows, blocked site data): the layout then lives in memory for the page
// load. The finance key keeps its `v1`; the object carries its own version (v1 layouts, with
// sections, are migrated when read).

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { WorkspaceKind } from '@effinance/shared';
import { useAuth } from '@/features/auth/auth-context';
import { applySize, arrangeBoard, DEFAULT_PREFS, emptyLayout, sanitizeLayout, setWidgetVisible, showAllWidgets, withBoard } from './layout';
import { WIDGET_SPECS } from './specs';
import type { BoardCols, BoardItem, CardId, DashboardLayout, DashboardPrefs, WidgetSize, WidgetSpec } from './types';

/** A free board: where its layout is saved and which cards it has. */
export interface BoardConfig {
  /** Prefix of the localStorage key (the workspace and the user are appended). */
  storagePrefix: string;
  specs: readonly WidgetSpec[];
}

/** The Painel financeiro's board. */
export const FINANCE_BOARD: BoardConfig = { storagePrefix: 'effinance.dashboardLayout.v1', specs: WIDGET_SPECS };

export function layoutStorageKey(workspaceId: string, userId: string, prefix = FINANCE_BOARD.storagePrefix): string {
  return `${prefix}:${workspaceId}:${userId}`;
}

export function readLayout(
  key: string,
  kind: WorkspaceKind | undefined,
  storage: Pick<Storage, 'getItem'> | undefined = safeStorage(),
  specs: readonly WidgetSpec[] = WIDGET_SPECS,
): DashboardLayout {
  try {
    const raw = storage?.getItem(key);
    return raw ? sanitizeLayout(JSON.parse(raw), specs, kind) : emptyLayout();
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
// Workspace kind and specs of each key (default visibility, used when reading and migrating).
const kinds = new Map<string, WorkspaceKind | undefined>();
const specsOf = new Map<string, readonly WidgetSpec[]>();
const listeners = new Set<() => void>();
const MEMORY_KEY = '__memory__';

function current(key: string, kind: WorkspaceKind | undefined, specs: readonly WidgetSpec[]): DashboardLayout {
  let layout = cache.get(key);
  if (!layout) {
    kinds.set(key, kind);
    specsOf.set(key, specs);
    layout = key.startsWith(MEMORY_KEY) ? emptyLayout() : readLayout(key, kind, undefined, specs);
    cache.set(key, layout);
  }
  return layout;
}

function commit(key: string, next: DashboardLayout) {
  cache.set(key, next);
  if (!key.startsWith(MEMORY_KEY)) writeLayout(key, next);
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed the same layout.
  const onStorage = (e: StorageEvent) => {
    if (e.key && cache.has(e.key)) {
      cache.set(e.key, readLayout(e.key, kinds.get(e.key), undefined, specsOf.get(e.key)));
      listener();
    }
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

export interface DashboardLayoutApi {
  layout: DashboardLayout;
  prefs: DashboardPrefs;
  /** Saves a board after a drag or a keyboard move (every visible card with its cell). */
  saveBoard: (cols: BoardCols, items: readonly BoardItem[]) => void;
  /** Corner handle: new stored size and the board as resized (other arranged boards push down too). */
  resize: (cols: BoardCols, id: CardId, size: WidgetSize, items: readonly BoardItem[]) => void;
  /** Size chosen in "Personalizar". */
  setSize: (id: CardId, size: WidgetSize) => void;
  /** On: first free space that fits; off: the card leaves its space empty. */
  setVisible: (id: CardId, visible: boolean) => void;
  showAll: () => void;
  /** "Organizar": closes the empty spaces of the board shown at `cols` columns. */
  arrange: (cols: BoardCols) => void;
  setPref: <K extends keyof DashboardPrefs>(key: K, value: DashboardPrefs[K]) => void;
  /** Undo: puts back a layout taken before the change. */
  restore: (layout: DashboardLayout) => void;
  reset: () => void;
}

/** The layout of a free board, shared by every component that reads it. */
export function useBoardLayout(board: BoardConfig): DashboardLayoutApi {
  const { user, workspace } = useAuth();
  const kind = workspace?.kind;
  const { specs, storagePrefix } = board;
  const key = user && workspace ? layoutStorageKey(workspace.id, user.id, storagePrefix) : `${MEMORY_KEY}:${storagePrefix}`;
  const layout = useSyncExternalStore(
    subscribe,
    () => current(key, kind, specs),
    () => current(key, kind, specs),
  );

  const update = useCallback((fn: (l: DashboardLayout) => DashboardLayout) => commit(key, fn(current(key, kind, specs))), [key, kind, specs]);

  return useMemo<DashboardLayoutApi>(
    () => ({
      layout,
      prefs: { ...DEFAULT_PREFS, ...layout.prefs },
      saveBoard: (cols, items) => update((l) => withBoard(l, cols, items)),
      resize: (cols, id, size, items) => update((l) => withBoard(applySize(l, id, size, specs, kind), cols, items)),
      setSize: (id, size) => update((l) => applySize(l, id, size, specs, kind)),
      setVisible: (id, visible) => update((l) => setWidgetVisible(l, id, visible, specs, kind)),
      showAll: () => update((l) => showAllWidgets(l, specs, kind)),
      arrange: (cols) => update((l) => arrangeBoard(l, cols, specs, kind)),
      setPref: (k, v) => update((l) => ({ ...l, prefs: { ...l.prefs, [k]: v } })),
      restore: (previous) => update(() => previous),
      reset: () => update(() => emptyLayout()),
    }),
    [layout, update, kind, specs],
  );
}

/** The Painel financeiro's layout. */
export function useDashboardLayout(): DashboardLayoutApi {
  return useBoardLayout(FINANCE_BOARD);
}
