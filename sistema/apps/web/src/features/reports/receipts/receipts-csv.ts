import { PAYMENT_METHOD_LABELS, formatDateBR, type ReceiptsReportResponse } from '@effinance/shared';

/**
 * One CSV cell for spreadsheets (Excel/LibreOffice, `;` separator): quoted, with formulas neutralised
 * (a value starting with = + - @ tab or CR, even after spaces, gets a leading apostrophe).
 */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^\s*[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Cents as "1234,56" (no thousands separator, so spreadsheets read it as a number). */
export const csvMoney = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

/** The receipts of the report as CSV: date received, description, contact, account, method, amount, checked. */
export function receiptsCsv(report: ReceiptsReportResponse): string {
  const head = ['Recebido em', 'Vencimento', 'Descrição', 'Cliente/contato', 'Conta', 'Forma de recebimento', 'Valor', 'Conferido com o extrato'];
  const lines = report.items.map((t) =>
    [
      formatDateBR(t.paidAt ?? t.date),
      formatDateBR(t.date),
      t.description,
      t.contact?.name ?? '',
      t.account?.name ?? '',
      t.paymentMethod ? PAYMENT_METHOD_LABELS[t.paymentMethod] : 'Não informado',
      csvMoney(t.amount),
      t.reconciledAt ? 'Sim' : 'Não',
    ]
      .map(csvCell)
      .join(';'),
  );
  // BOM so Excel opens the accents right.
  return `﻿${[head.map(csvCell).join(';'), ...lines].join('\r\n')}\r\n`;
}
