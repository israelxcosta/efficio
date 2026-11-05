import { describe, expect, it } from 'vitest';
import { updatedLabel } from './updated-label';

describe('updatedLabel', () => {
  const t = Date.parse('2026-11-05T17:32:00Z');

  it('says "agora" in the first minute and the minutes up to an hour', () => {
    expect(updatedLabel(t, t + 30_000)).toBe('atualizado agora');
    expect(updatedLabel(t, t + 5 * 60_000)).toBe('atualizado há 5 min');
  });

  it('gives the time in the office time zone after an hour', () => {
    expect(updatedLabel(Date.parse('2026-11-05T17:32:00Z'), Date.parse('2026-11-05T19:40:00Z'))).toBe('atualizado às 14:32');
  });

  it('says nothing before the first load', () => {
    expect(updatedLabel(0, t)).toBe('');
  });
});
