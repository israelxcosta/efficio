import { describe, expect, it } from 'vitest';
import type { Transaction } from '@effinance/shared';
import { transactionsCsv } from './transactions-csv';

describe('transactionsCsv', () => {
  it('lists each row with its situation, signed amount and the company name without a MEI CPF', () => {
    const tx = {
      id: 't', type: 'income', description: '=SUM(A1)', amount: 18000, date: '2026-11-10', paid: false, paidAt: null, overdue: true,
      category: { name: 'Serviços Prestados' }, subcategory: { name: 'Honorários contábeis' }, contact: { id: 'c', name: 'Juliana Prado Design 31847759806' },
      account: null, creditCard: null, paymentMethod: 'bank_slip',
    } as unknown as Transaction;
    const lines = transactionsCsv([tx]).replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toContain('"Situação";"Valor"');
    expect(lines[1]).toBe(`"10/11/2026";"";"'=SUM(A1)";"Serviços Prestados › Honorários contábeis";"Juliana Prado Design";"";"Boleto";"Vencido";"180,00"`);
  });
});
