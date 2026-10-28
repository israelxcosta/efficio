import { describe, expect, it } from 'vitest';
import { monthFinding, overdueFinding } from './finding';

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

describe('monthFinding', () => {
  const today = '2026-10-27';
  const due = (amount: number, contactId: string | null, date: string, paid = false, name = 'Cliente', lateFeeOf: string | null = null) => ({
    ...row(amount, contactId, name),
    date,
    paid,
    lateFeeOf,
  });

  it('flags what is still overdue from the month, and with whom', () => {
    const f = monthFinding([due(550000, 'a', '2026-05-20', false, 'Rota Sul'), due(217000, 'b', '2026-05-10', false), due(90000, 'c', '2026-05-05', true)], today);
    expect(f).toEqual({ text: 'R$ 7.670,00 do mês vencidos em aberto, 72% com Rota Sul', alert: true });
  });

  it('names the only client holding the overdue amount', () => {
    expect(monthFinding([due(17000, 'a', '2026-05-10', false, 'Ju Prado')], today).text).toBe('R$ 170,00 do mês vencidos em aberto, todo de Ju Prado');
  });

  it('tells what is still to come in a month not due yet', () => {
    expect(monthFinding([due(100000, 'a', '2026-11-10'), due(50000, 'b', '2026-11-20')], today)).toEqual({
      text: 'R$ 1.500,00 a receber no mês (2 títulos)',
      alert: false,
    });
  });

  it('says everything was received, without counting interest rows', () => {
    const f = monthFinding([due(100000, 'a', '2026-04-10', true), due(2000, 'a', '2026-04-20', true, 'Cliente', 'x')], today);
    expect(f).toEqual({ text: 'recebimentos do mês quitados (R$ 1.000,00)', alert: false });
  });

  it('says when nothing falls due in the month', () => {
    expect(monthFinding([], today).text).toBe('nenhum recebimento com vencimento no mês');
  });
});
