// The dashboard's one finding: the fact in this month's data that most needs attention, shown under
// the title next to the action it drives (pure, unit tested).

import { formatBRL, type ISODate, type Transaction } from '@effinance/shared';
import { pluralize } from '@/lib/utils';

export interface DashboardFinding {
  text: string;
  /** Overdue receivables exist: the line is a signal, not a note. */
  alert: boolean;
}

type Receivable = Pick<Transaction, 'amount' | 'contactId' | 'contact'>;

/** Total of the rows and the client holding most of it, when one holds at least half. */
function concentration(rows: readonly Receivable[]): { total: number; top: string | null; share: number } {
  let total = 0;
  const byClient = new Map<string, { name: string; amount: number }>();
  for (const t of rows) {
    total += t.amount;
    if (!t.contactId || !t.contact) continue;
    const row = byClient.get(t.contactId) ?? { name: t.contact.name, amount: 0 };
    row.amount += t.amount;
    byClient.set(t.contactId, row);
  }
  const top = [...byClient.values()].sort((a, b) => b.amount - a.amount)[0];
  const share = top && total > 0 ? Math.round((top.amount / total) * 100) : 0;
  return { total, top: top && share >= 50 ? top.name : null, share };
}

/** ", 84% com Rota Sul" — or ", todo de Rota Sul" when a single client holds it all. */
function withHolder(base: string, top: string | null, share: number): string {
  if (!top) return base;
  return share >= 100 ? `${base}, todo de ${top}` : `${base}, ${share}% com ${top}`;
}

/**
 * "R$ 6.540,00 vencidos a receber, 84% com Rota Sul" — the overdue total and the client holding most
 * of it (named only when one client holds at least half); null when nothing is overdue.
 */
export function overdueFinding(overdue: readonly Receivable[]): DashboardFinding | null {
  const { total, top, share } = concentration(overdue);
  if (total <= 0) return null;
  return { text: withHolder(`${formatBRL(total)} vencidos a receber`, top, share), alert: true };
}

/**
 * The finding of another month, from the receivables due in it: what is still overdue (and with
 * whom), else what is still to come, else that everything was received.
 */
export function monthFinding(
  rows: readonly (Receivable & Pick<Transaction, 'paid' | 'date' | 'lateFeeOf'>)[],
  today: ISODate,
): DashboardFinding {
  // Interest and fines are paid with the receivable: they are not receivables of their own.
  const receivables = rows.filter((t) => !t.lateFeeOf);
  if (receivables.length === 0) return { text: 'nenhum recebimento com vencimento no mês', alert: false };
  const overdue = receivables.filter((t) => !t.paid && t.date < today);
  if (overdue.length > 0) {
    const { total, top, share } = concentration(overdue);
    return { text: withHolder(`${formatBRL(total)} do mês vencidos em aberto`, top, share), alert: true };
  }
  const open = receivables.filter((t) => !t.paid);
  if (open.length > 0) {
    const total = open.reduce((acc, t) => acc + t.amount, 0);
    return { text: `${formatBRL(total)} a receber no mês (${pluralize(open.length, 'título', 'títulos')})`, alert: false };
  }
  const received = receivables.reduce((acc, t) => acc + t.amount, 0);
  return { text: `recebimentos do mês quitados (${formatBRL(received)})`, alert: false };
}
