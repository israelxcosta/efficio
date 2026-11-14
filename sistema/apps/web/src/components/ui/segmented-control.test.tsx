// SegmentedControl keyboard (WAI-ARIA radio group): the arrows move the focus and the choice together.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SegmentedControl, segmentTarget } from './segmented-control';

describe('segmentTarget', () => {
  it('moves to the next and previous option, wrapping', () => {
    expect(segmentTarget('ArrowRight', 0, 3)).toBe(1);
    expect(segmentTarget('ArrowDown', 2, 3)).toBe(0);
    expect(segmentTarget('ArrowLeft', 0, 3)).toBe(2);
    expect(segmentTarget('ArrowUp', 1, 3)).toBe(0);
  });

  it('goes to the ends with Home and End, and starts at an end when nothing is chosen', () => {
    expect(segmentTarget('Home', 2, 3)).toBe(0);
    expect(segmentTarget('End', 0, 3)).toBe(2);
    expect(segmentTarget('ArrowRight', -1, 3)).toBe(0);
    expect(segmentTarget('ArrowLeft', -1, 3)).toBe(2);
  });

  it('ignores other keys and empty controls', () => {
    expect(segmentTarget('Enter', 0, 3)).toBeNull();
    expect(segmentTarget('a', 0, 3)).toBeNull();
    expect(segmentTarget('ArrowRight', 0, 0)).toBeNull();
  });
});

describe('SegmentedControl', () => {
  const options = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
    { value: 'c', label: 'C' },
  ];
  const tabStops = (value: string) => [...renderToStaticMarkup(<SegmentedControl value={value} onChange={() => {}} options={options} />).matchAll(/tabindex="(-?\d)"/g)].map((m) => m[1]);

  it('has one tab stop, on the chosen option', () => {
    expect(tabStops('b')).toEqual(['-1', '0', '-1']);
  });

  it('keeps a tab stop on the first option while none is chosen', () => {
    expect(tabStops('z')).toEqual(['0', '-1', '-1']);
  });
});
