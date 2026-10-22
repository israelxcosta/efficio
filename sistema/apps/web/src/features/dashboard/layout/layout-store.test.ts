import { describe, expect, it } from 'vitest';
import { emptyLayout } from './layout';
import { layoutStorageKey, readLayout, writeLayout } from './layout-store';

describe('layout storage', () => {
  const key = layoutStorageKey('ws-1', 'user-1');

  it('keys the layout by workspace and user', () => {
    expect(key).toBe('effinance.dashboardLayout.v1:ws-1:user-1');
  });

  it('falls back to the default layout when storage throws or holds garbage', () => {
    const throwing = { getItem: () => { throw new Error('blocked'); } };
    expect(readLayout(key, throwing)).toEqual(emptyLayout());
    expect(readLayout(key, { getItem: () => '{not json' })).toEqual(emptyLayout());
    expect(readLayout(key, undefined)).toEqual(emptyLayout());
    expect(() => writeLayout(key, emptyLayout(), { setItem: () => { throw new Error('quota'); } })).not.toThrow();
  });

  it('round-trips through sanitizing', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const layout = { ...emptyLayout(), sizes: { saude: { c: 2, r: 4 } }, collapsed: ['analises' as const], prefs: { projecaoDias: 30 as const } };
    writeLayout(key, layout, storage);
    expect(readLayout(key, storage)).toEqual(layout);
  });
});
