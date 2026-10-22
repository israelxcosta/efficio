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
