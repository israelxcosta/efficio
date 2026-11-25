// Grid of the Início (docs/dashboards-redesign.md §4 and §8.2): the same row heights as the
// financial board, and widths by container band (12, 2 or 1 columns).
import { describe, expect, it } from 'vitest';
import { heightForRows } from '@/features/dashboard/layout/layout';
import { slotColumns, slotRows } from './dash-slot';

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
