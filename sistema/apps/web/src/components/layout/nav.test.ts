import { describe, expect, it } from 'vitest';
import { RAIL_GAP_PX, RAIL_ITEM_PX, splitRail } from './nav';

const items = Array.from({ length: 12 }, (_, i) => i);
const heightFor = (slots: number) => slots * RAIL_ITEM_PX + (slots - 1) * RAIL_GAP_PX;

describe('splitRail', () => {
  it('keeps every icon when they fit', () => {
    expect(splitRail(items, heightFor(12))).toEqual({ visible: items, hidden: [] });
    expect(splitRail(items, 2000).hidden).toEqual([]);
  });

  it('gives the last slot to the "more" button when they do not fit', () => {
    const { visible, hidden } = splitRail(items, heightFor(8));
    expect(visible).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(hidden).toEqual([7, 8, 9, 10, 11]);
  });

  it('shows everything before the first measure', () => {
    expect(splitRail(items, 0).hidden).toEqual([]);
  });

  it('keeps at least the button on a tiny rail', () => {
    expect(splitRail(items, 10)).toEqual({ visible: [], hidden: items });
  });
});
