import { useSyncExternalStore } from 'react';

// Row density of the long lists (Contas a pagar/receber, Extrato, Tarefas), chosen once and kept in this
// browser: "Confortável" (two lines per row, the default) or "Compacta" (less padding, ~40% more rows on
// screen). Every list follows the same choice and updates together.

export type ListDensity = 'comfortable' | 'compact';

const KEY = 'efficio.listDensity';
const listeners = new Set<() => void>();

function read(): ListDensity {
  try {
    return localStorage.getItem(KEY) === 'compact' ? 'compact' : 'comfortable';
  } catch {
    return 'comfortable';
  }
}

let current: ListDensity = typeof window === 'undefined' ? 'comfortable' : read();

export function setListDensity(value: ListDensity): void {
  current = value;
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* storage unavailable: the choice lasts while the page is open */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useListDensity(): [ListDensity, (value: ListDensity) => void] {
  return [useSyncExternalStore(subscribe, () => current, () => 'comfortable' as const), setListDensity];
}
