import { PAYMENT_METHOD_LABELS, formatDateBR, type ReceiptsReportResponse } from '@effinance/shared';

export { csvCell, csvMoney } from '@/lib/csv';
import { csvCell, csvMoney } from '@/lib/csv';

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
