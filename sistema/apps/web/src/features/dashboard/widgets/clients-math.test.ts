import { describe, expect, it } from 'vitest';
import type { Client, Transaction } from '@effinance/shared';
import { competenceRuler } from './clients-math';

const fee = { index: 0, startDate: '2026-01-01', endDate: '2026-12-31', id: 'f', clientId: 'x', amount: 1000, employeeFee: 0, discountBps: 0, createdAt: '' };
const client = (id: string, name: string, extra: Partial<Client> = {}) =>
  ({ id, name, tradeName: null, status: 'active', contractStartDate: '2026-01-01', currentFee: fee, latestFee: fee, ...extra }) as Client;
const tx = (contactId: string, extra: Partial<Transaction>) =>
  ({ type: 'income', contactId, contact: { id: contactId, name: contactId }, amount: 1000, paid: false, date: '2026-10-10', feeCompetence: '2026-09', feeKind: 'fee', ...extra }) as Transaction;

describe('competenceRuler', () => {
  const clients = [client('a', 'Alfa'), client('b', 'Beta'), client('c', 'Gama'), client('d', 'Delta')];
  const rows = [
    tx('a', { paid: true }),
    tx('b', { date: '2026-10-05' }),
    tx('b', { date: '2026-10-05', feeKind: 'employees', amount: 500 }),
    tx('c', { date: '2026-10-20' }),
  ];

  it('gives each client the status of its fee, what needs doing first', () => {
    const ruler = competenceRuler(clients, rows, '2026-09', '2026-10-12');
    expect(ruler.map((e) => [e.name, e.status])).toEqual([
      ['Beta', 'atrasado'],
      ['Gama', 'aberto'],
      ['Delta', 'sem'],
      ['Alfa', 'pago'],
    ]);
    expect(ruler[0]).toMatchObject({ amount: 1500, dueDate: '2026-10-05', daysLate: 7 });
  });

  it('counts a fee due today as open, not late', () => {
    const ruler = competenceRuler(clients, rows, '2026-09', '2026-10-05');
    expect(ruler.find((e) => e.clientId === 'b')).toMatchObject({ status: 'aberto', daysLate: 0 });
  });

  it('leaves out other competences and clients that are not billable', () => {
    const inactive = client('e', 'Épsilon', { status: 'inactive' });
    const ruler = competenceRuler([...clients, inactive], [...rows, tx('a', { feeCompetence: '2026-08' })], '2026-09', '2026-10-12');
    expect(ruler).toHaveLength(4);
    expect(ruler.find((e) => e.clientId === 'a')!.amount).toBe(1000);
  });
});
