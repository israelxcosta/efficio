import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('keeps a custom text size next to a text color', () => {
    expect(cn('mt-0.5 truncate text-caption text-muted')).toBe('mt-0.5 truncate text-caption text-muted');
    expect(cn('text-title-sm', 'text-fg')).toBe('text-title-sm text-fg');
    expect(cn('text-kpi text-danger')).toBe('text-kpi text-danger');
  });

  it('lets a later size replace an earlier one', () => {
    expect(cn('text-caption', 'text-xs')).toBe('text-xs');
    expect(cn('text-[13px]', 'text-body-sm')).toBe('text-body-sm');
  });
});

describe('displayFigure', () => {
  it('uses the true minus sign on negative figures and leaves the rest alone', async () => {
    const { displayFigure } = await import('./utils');
    expect(displayFigure('-R$ 610,59')).toBe('−R$ 610,59');
    expect(displayFigure('-4,3%')).toBe('−4,3%');
    expect(displayFigure('R$ 10,00')).toBe('R$ 10,00');
    expect(displayFigure('Pagar - hoje')).toBe('Pagar - hoje');
    expect(displayFigure(12)).toBe(12);
  });
});
