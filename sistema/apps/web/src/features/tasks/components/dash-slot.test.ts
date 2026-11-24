// Grid of the Início (docs/dashboards-redesign.md §4 and §8.2): the same row heights as the
// financial board, and widths by container band (12, 2 or 1 columns).
import { describe, expect, it } from 'vitest';
import { heightForRows } from '@/features/dashboard/layout/layout';
import { moveCard, orderCards, slotColumns, slotRows, stepCard } from './dash-slot';

describe('slotColumns', () => {
  it('takes the wide span on 12 columns, the medium one on 2 and the full width on 1', () => {
    expect(slotColumns({ wide: 8, medium: 2 }, 4)).toBe(8);
    expect(slotColumns({ wide: 8, medium: 2 }, 2)).toBe(2);
    expect(slotColumns({ wide: 8, medium: 2 }, 1)).toBe(1);
    expect(slotColumns({ wide: 3, medium: 1 }, 2)).toBe(1);
  });
});

describe('slotRows', () => {
  it('uses the medium rows below 4 columns and the phone rows on 1', () => {
    expect(slotRows({ rows: 4, mediumRows: 3 }, 4)).toBe(4);
    expect(slotRows({ rows: 4, mediumRows: 3 }, 2)).toBe(3);
    expect(slotRows({ rows: 4, mediumRows: 3 }, 1)).toBe(3);
    expect(slotRows({ rows: 3, mediumRows: 3, phoneRows: 4 }, 1)).toBe(4);
    expect(slotRows({ rows: 3 }, 2)).toBe(3);
  });

  it('shares the height contract with the financial board', () => {
    expect(heightForRows(3, 2)).toBe(296);
    expect(heightForRows(4, 4)).toBe(432);
  });
});

describe('sortable board order', () => {
  const defaults = ['mine', 'status', 'flow', 'agenda'];

  it('keeps the default order without a saved one and drops unknown or repeated ids', () => {
    expect(orderCards(defaults, null)).toEqual(defaults);
    expect(orderCards(defaults, ['agenda', 'gone', 'mine', 'agenda', 'status', 'flow'])).toEqual(['agenda', 'mine', 'status', 'flow']);
  });

  it('places a new card after its default neighbour', () => {
    expect(orderCards([...defaults, 'requests'], ['flow', 'agenda', 'mine', 'status'])).toEqual(['flow', 'agenda', 'requests', 'mine', 'status']);
    expect(orderCards(['first', ...defaults], ['flow', 'agenda', 'mine', 'status'])).toEqual(['first', 'flow', 'agenda', 'mine', 'status']);
  });

  it('moves a card to where another one is (after it from before, before it from after)', () => {
    expect(moveCard(defaults, 'mine', 'flow')).toEqual(['status', 'flow', 'mine', 'agenda']);
    expect(moveCard(defaults, 'agenda', 'status')).toEqual(['mine', 'agenda', 'status', 'flow']);
    expect(moveCard(defaults, 'mine', 'mine')).toEqual(defaults);
  });

  it('steps with the keyboard and stops at the ends', () => {
    expect(stepCard(defaults, 'status', -1)).toEqual(['status', 'mine', 'flow', 'agenda']);
    expect(stepCard(defaults, 'status', 1)).toEqual(['mine', 'flow', 'status', 'agenda']);
    expect(stepCard(defaults, 'mine', -1)).toEqual(defaults);
    expect(stepCard(defaults, 'agenda', 1)).toEqual(defaults);
  });
});
