// The one-line density of the dashboard lists (docs/dashboards-redesign.md §7.3): one row of one
// height, without the "+ Empregados" chip (it stays in the menu) and without the account column.
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { Transaction } from '@effinance/shared';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TransactionActionsContext } from '../transaction-actions';
import { TransactionRow } from './transaction-row';

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

function row(density: 'line') {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <TransactionActionsContext.Provider value={actions}>
          <TransactionRow tx={feeTx} density={density} />
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
