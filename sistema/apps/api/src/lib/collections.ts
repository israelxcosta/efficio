// Grouping helpers in linear time. Lists that grow with the data (occurrences × clients, union links,
// recurring-task links) must never be grouped with `[...(map.get(k) ?? []), x]` (copies the list on
// every push: quadratic) nor with a `filter` per group (groups × items): with a few thousand clients
// that blocks the event loop — every tenant's requests — for seconds. Pure (runs in the browser demo).

/** Appends `value` to the list of `key` (creating it), in place. */
export function appendTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** The items by key, in their original order. */
export function groupBy<T, K>(items: Iterable<T>, keyOf: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) appendTo(out, keyOf(item), item);
  return out;
}
