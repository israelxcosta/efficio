import { useState } from 'react';

/**
 * True once `value` has changed after the first render, so an icon swap can animate (`.icon-in`)
 * on a real change but not when the row first mounts or re-mounts while scrolling a list.
 * Uses the "adjust state during render" pattern instead of an effect + ref.
 */
export function useHasChanged<T>(value: T): boolean {
  const [prev, setPrev] = useState(value);
  const [changed, setChanged] = useState(false);
  if (!Object.is(prev, value)) {
    setPrev(value);
    if (!changed) setChanged(true);
  }
  return changed;
}
