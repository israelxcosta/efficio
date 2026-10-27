import { describe, expect, it } from 'vitest';
import { overdueFinding } from './finding';

const row = (amount: number, contactId: string | null, name = 'Cliente') => ({
  amount,
  contactId,
  contact: contactId ? { id: contactId, name } : null,
});

describe('overdueFinding', () => {
  it('names the client holding most of the overdue amount', () => {
    const f = overdueFinding([row(550000, 'a', 'Rota Sul'), row(104000, 'b', 'Ju Prado')]);
    expect(f).toEqual({ text: 'R$ 6.540,00 vencidos a receber, 84% com Rota Sul', alert: true });
  });

  it('gives only the total when no client holds half of it', () => {
    const f = overdueFinding([row(10000, 'a'), row(10000, 'b'), row(10000, 'c')]);
    expect(f?.text).toBe('R$ 300,00 vencidos a receber');
  });

  it('is null when nothing is overdue', () => {
    expect(overdueFinding([])).toBeNull();
  });
});
