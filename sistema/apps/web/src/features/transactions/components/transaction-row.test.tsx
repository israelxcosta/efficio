// The one-line density of the dashboard lists (docs/dashboards-redesign.md §7.3): one row of one
// height, without the "+ Empregados" chip (it stays in the menu) and without the account column.
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { Transaction } from '@effinance/shared';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TransactionActionsContext } from '../transaction-actions';
import { TransactionRow } from './transaction-row';

// The full row draws the category icon, whose color follows the theme.
vi.mock('@/lib/theme', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/theme')>()), useTone: () => (color: string) => color }));

const noop = () => {};
const actions = {
  openTransaction: noop,
  openTransfer: noop,
  edit: noop,
  duplicate: noop,
  remove: noop,
  togglePaid: noop,
  anticipate: noop,
  savingPaidId: null,
  readOnlyReason: null,
};

const feeTx = {
  id: 'tx-1',
  type: 'income',
  description: 'Honorários ref. 10/2026',
  amount: 163714,
  date: '2026-11-10',
  paid: false,
  paidAt: null,
  effectiveDate: '2026-11-10',
  overdue: false,
  accountId: null,
  toAccountId: null,
  creditCardId: null,
  invoiceMonth: null,
  categoryId: null,
  subcategoryId: null,
  contactId: 'c-1',
  paymentMethod: null,
  notes: null,
  transferKind: null,
  recurrenceId: null,
  recurrenceKind: 'none',
  frequency: null,
  installmentNumber: null,
  installmentTotal: null,
  occurrenceNumber: null,
  splitGroupId: null,
  origin: 'manual',
  importBatchId: null,
  lateFeeOf: null,
  lateFeeKind: null,
  lateFees: null,
  feeCompetence: '2026-10',
  feeKind: 'fee',
  feeOf: null,
  employees: null,
  feeDiscountBps: null,
  discountOf: null,
  discount: null,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  category: null,
  subcategory: null,
  account: null,
  toAccount: null,
  creditCard: null,
  contact: { id: 'c-1', name: 'Transportadora Rota Sul Ltda' },
} as unknown as Transaction;

function row(density: 'line' | 'default', tx: Transaction = feeTx) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <TransactionActionsContext.Provider value={actions}>
          <TransactionRow tx={tx} density={density} neutralAmount />
        </TransactionActionsContext.Provider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('TransactionRow density "line"', () => {
  it('has no "+ Empregados" chip and no account column', () => {
    const html = row('line');
    expect(html).not.toContain('aria-label="+ Empregados');
    expect(html).not.toContain('Sem conta');
  });

  it('keeps the description, the client on the same line and the menu', () => {
    const html = row('line');
    expect(html).toContain('Honorários ref. 10/2026');
    expect(html).toContain('Transportadora Rota Sul Ltda');
    expect(html).toContain('aria-label="Ações de Honorários ref. 10/2026"');
    expect(html).toContain('h-10');
  });
});

/** The class list of the element wrapping the row menu ("Ações de …"). */
function menuWrapper(html: string, description: string): string {
  const at = html.indexOf(`aria-label="Ações de ${description}"`);
  expect(at).toBeGreaterThan(-1);
  const open = html.lastIndexOf('<span class="contents', at);
  return html.slice(open, html.indexOf('>', open));
}

// Phones (P1-2 of the 2026-11-19 design review): the full row drops its "⋯" (a tap opens the edit
// sheet, which carries the actions) and tightens the gap, so the description is not cut short.
describe('TransactionRow on phones', () => {
  it('hides the menu below sm and tightens the gap', () => {
    const expense = { ...feeTx, type: 'expense', description: 'Aluguel do escritório', feeKind: null } as unknown as Transaction;
    const html = row('default', expense);
    expect(menuWrapper(html, 'Aluguel do escritório')).toContain('max-sm:hidden');
    expect(html).toContain('max-sm:gap-2.5');
  });

  it('keeps the menu of transfers, whose sheet has no other way to their actions', () => {
    const transfer = { ...feeTx, type: 'transfer', description: 'Transferência', transferKind: 'transfer', feeKind: null } as unknown as Transaction;
    expect(menuWrapper(row('default', transfer), 'Transferência')).not.toContain('max-sm:hidden');
  });
});
