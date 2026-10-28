import { describe, expect, it } from 'vitest';
import { emptyLayout } from './layout';
import { layoutStorageKey, readLayout, writeLayout } from './layout-store';

describe('layout storage', () => {
  const key = layoutStorageKey('ws-1', 'user-1');
  const memory = () => {
    const store = new Map<string, string>();
    return { store, getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  };

  it('keys the layout by workspace and user', () => {
    expect(key).toBe('effinance.dashboardLayout.v1:ws-1:user-1');
  });

  it('falls back to the default layout when storage throws or holds garbage', () => {
    const throwing = { getItem: () => { throw new Error('blocked'); } };
    expect(readLayout(key, 'business', throwing)).toEqual(emptyLayout());
    expect(readLayout(key, 'business', { getItem: () => '{not json' })).toEqual(emptyLayout());
    expect(readLayout(key, 'business', undefined)).toEqual(emptyLayout());
    expect(() => writeLayout(key, emptyLayout(), { setItem: () => { throw new Error('quota'); } })).not.toThrow();
  });

  it('round-trips through sanitizing', () => {
    const storage = memory();
    const layout = {
      ...emptyLayout(),
      sizes: { saude: { c: 2, r: 4 } },
      visible: { saude: true },
      cells: { 4: { saude: { x: 2, y: 0 }, inadimplencia: { x: 0, y: 0 } }, 1: { saude: { x: 0, y: 0 }, inadimplencia: { x: 0, y: 4 } } },
      prefs: { projecaoDias: 30 as const },
    };
    writeLayout(key, layout, storage);
    expect(readLayout(key, 'business', storage)).toEqual(layout);
  });

  it('migrates a saved v1 layout (sections) to cells on the board', () => {
    const storage = memory();
    storage.setItem(
      key,
      JSON.stringify({ v: 1, sizes: {}, order: { 'visao-geral': ['insights'] }, visible: {}, collapsed: ['visao-geral'], prefs: { fluxoModo: 'A' } }),
    );
    const layout = readLayout(key, 'business', storage);
    expect(layout.v).toBe(2);
    expect(layout.prefs).toEqual({ fluxoModo: 'A' });
    // Caixa came after Honorários e cobrança (6 rows), with Insights first.
    expect(layout.cells[4]!.insights).toEqual({ x: 0, y: 6 });
    expect(layout.cells[4]!['fluxo-caixa']).toEqual({ x: 0, y: 8 });
    writeLayout(key, layout, storage);
    expect(JSON.parse(storage.store.get(key)!)).toEqual(layout);
  });
});
