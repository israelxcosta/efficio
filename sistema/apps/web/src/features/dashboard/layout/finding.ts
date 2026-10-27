// The dashboard's one finding: the fact in this month's data that most needs attention, shown under
// the title next to the action it drives (pure, unit tested).

import { formatBRL, type Transaction } from '@effinance/shared';

export interface DashboardFinding {
  text: string;
  /** Overdue receivables exist: the line is a signal, not a note. */
  alert: boolean;
}

/**
 * "R$ 6.540,00 vencidos a receber, 84% com Rota Sul" — the overdue total and the client holding most
 * of it (named only when one client holds at least half); null when nothing is overdue.
 */
export function overdueFinding(overdue: readonly Pick<Transaction, 'amount' | 'contactId' | 'contact'>[]): DashboardFinding | null {
  let total = 0;
  const byClient = new Map<string, { name: string; amount: number }>();
  for (const t of overdue) {
    total += t.amount;
    if (!t.contactId || !t.contact) continue;
    const row = byClient.get(t.contactId) ?? { name: t.contact.name, amount: 0 };
    row.amount += t.amount;
    byClient.set(t.contactId, row);
  }
  if (total <= 0) return null;
  const top = [...byClient.values()].sort((a, b) => b.amount - a.amount)[0];
  const share = top ? Math.round((top.amount / total) * 100) : 0;
  const base = `${formatBRL(total)} vencidos a receber`;
  return { text: top && share >= 50 ? `${base}, ${share}% com ${top.name}` : base, alert: true };
}
