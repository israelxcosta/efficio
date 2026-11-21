import { describe, expect, it } from 'vitest';
import type { ReceiptsReportResponse, Transaction } from '@effinance/shared';
import { csvCell, csvMoney, receiptsCsv } from './receipts-csv';

describe('receipts CSV', () => {
  it('neutralises formulas, even after spaces, and escapes quotes', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('  +1')).toBe(`"'  +1"`);
    expect(csvCell('@SUM')).toBe(`"'@SUM"`);
    expect(csvCell('Honorários 10/2026')).toBe('"Honorários 10/2026"');
    expect(csvCell(null)).toBe('""');
  });

  it('writes cents as numbers spreadsheets read (comma decimal, no thousands)', () => {
    expect(csvMoney(123456)).toBe('1234,56');
    expect(csvMoney(5)).toBe('0,05');
  });

  it('lists each receipt with the day received, account and method', () => {
    const tx = {
      id: 't1', description: 'Honorários A', amount: 100000, date: '2026-03-05', paidAt: '2026-03-10',
      contact: { id: 'c', name: 'Padaria' }, account: { id: 'a', name: 'Banco' }, paymentMethod: 'pix',
    } as unknown as Transaction;
    const report = { items: [tx] } as ReceiptsReportResponse;
    const lines = receiptsCsv(report).replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toBe('"Recebido em";"Vencimento";"Descrição";"Cliente/contato";"Conta";"Forma de recebimento";"Valor"');
    expect(lines[1]).toBe('"10/03/2026";"05/03/2026";"Honorários A";"Padaria";"Banco";"Pix";"1000,00"');
  });
});
