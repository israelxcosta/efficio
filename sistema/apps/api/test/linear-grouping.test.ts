// Security review (phases 2 and 3): lists that grow with the data were grouped in quadratic time —
// `[...(map.get(k) ?? []), x]` copies the list on every push, and a `filter` per group walks every item
// for each group. Re-syncing a weekly recurring task of 2 000 clients (26 000 occurrences going to one
// person) blocked the event loop — every tenant's requests — for ~4 s; 100 000 rows, for over a minute.
// Grouping goes through lib/collections.ts (linear); this guard keeps the pattern from coming back.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { appendTo, groupBy } from '../src/lib/collections';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

describe('grouping in linear time', () => {
  it('no source groups by copying the list on every push', () => {
    const offenders = sources(SRC).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ file: path.relative(SRC, file), line: i + 1, text: line }))
        .filter(({ text }) => /\[\s*\.\.\.\s*\(\s*[\w.]+\.get\(/.test(text) && !text.trimStart().startsWith('//')),
    );
    expect(offenders).toEqual([]);
  });

  it('groups 100 000 items under one key in well under a second, keeping the order', () => {
    const items = Array.from({ length: 100_000 }, (_, i) => ({ key: i % 3 === 0 ? 'a' : 'b', i }));
    const started = performance.now();
    const groups = groupBy(items, (x) => x.key);
    const one = new Map<string, number[]>();
    for (let i = 0; i < 100_000; i++) appendTo(one, 'same', i);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(groups.get('a')!.length + groups.get('b')!.length).toBe(100_000);
    expect(groups.get('a')!.slice(0, 3).map((x) => x.i)).toEqual([0, 3, 6]);
    expect(one.get('same')!.length).toBe(100_000);
    expect(one.get('same')![99_999]).toBe(99_999);
  });
});
