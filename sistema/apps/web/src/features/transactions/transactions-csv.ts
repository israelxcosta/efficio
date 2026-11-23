import { PAYMENT_METHOD_LABELS, displayCompanyName, formatDateBR, type Transaction } from '@effinance/shared';
import { csvMoney, toCsv } from '@/lib/csv';

const statusOf = (t: Transaction) =>
  t.paid ? (t.type === 'income' ? 'Recebido' : 'Pago') : t.overdue ? 'Vencido' : t.type === 'income' ? 'A receber' : 'Pendente';

/** Contas a pagar/receber as CSV: due date, payment, description, category, contact, account, method, status, amount. */
export function transactionsCsv(items: readonly Transaction[]): string {
  const head = ['Vencimento', 'Pago/recebido em', 'Descrição', 'Categoria', 'Cliente/fornecedor', 'Conta/cartão', 'Forma de pagamento', 'Situação', 'Valor'];
  return toCsv(
    head,
    items.map((t) => [
      formatDateBR(t.date),
      t.paidAt ? formatDateBR(t.paidAt) : '',
      t.description,
      t.category ? `${t.category.name}${t.subcategory ? ` › ${t.subcategory.name}` : ''}` : '',
      t.contact ? displayCompanyName(t.contact.name) : '',
      t.account?.name ?? t.creditCard?.name ?? '',
      t.paymentMethod ? PAYMENT_METHOD_LABELS[t.paymentMethod] : '',
      statusOf(t),
      csvMoney(t.type === 'expense' ? -t.amount : t.amount),
    ]),
  );
}
