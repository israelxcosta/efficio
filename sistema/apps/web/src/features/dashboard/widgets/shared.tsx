// Pieces shared by the widget files: list skeleton, empty state and the compact transaction row
// (TransactionRow is too tall for a dashboard card).

import { diffInDays, formatDateBR, type Transaction } from '@effinance/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { Money } from '@/components/ui/misc';
import { PaidToggle } from '@/components/ui/paid-toggle';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, pluralize } from '@/lib/utils';
import { RowMenu } from '@/features/transactions/components/transaction-row';
import { useTransactionActions } from '@/features/transactions/transaction-actions';

/** Placeholder rows filling the body while a list loads. */
export function ListSkeleton({ rowClassName = 'h-10' }: { rowClassName?: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className={cn('w-full shrink-0', rowClassName)} />
      ))}
    </div>
  );
}

/** Compact empty state that takes the card body. */
export function BodyEmpty(props: Parameters<typeof EmptyState>[0]) {
  return <EmptyState {...props} compact className={cn('min-h-0 flex-1 overflow-hidden py-3', props.className)} />;
}

/** "Venceu há 3 dias" / "Vence hoje" / "Vence em 2 dias" / "Vence em dd/mm/aaaa"; settled rows say when. */
export function dueText(tx: Transaction, today: string): { text: string; tone: string } {
  if (tx.paid) {
    const when = tx.paidAt ? ` em ${formatDateBR(tx.paidAt)}` : '';
    return { text: `${tx.type === 'income' ? 'Recebido' : 'Pago'}${when}`, tone: 'text-success' };
  }
  const days = diffInDays(tx.date, today);
  if (days < 0) return { text: `Venceu há ${pluralize(-days, 'dia', 'dias')}`, tone: 'font-semibold text-danger' };
  if (days === 0) return { text: 'Vence hoje', tone: 'font-semibold text-warning' };
  if (days <= 5) return { text: `Vence em ${pluralize(days, 'dia', 'dias')}`, tone: 'font-medium text-warning' };
  return { text: `Vence em ${formatDateBR(tx.date)}`, tone: 'text-muted' };
}

/** Compact transaction row: paid toggle, description, due status, amount and the row menu. */
export function CompactTransactionRow({ tx, today }: { tx: Transaction; today: string }) {
  const actions = useTransactionActions();
  const readOnly = Boolean(actions.readOnlyReason);
  const Main = readOnly ? 'div' : 'button';
  const due = dueText(tx, today);
  const detail = [tx.contact?.name, tx.category?.name].filter(Boolean).join(' · ');
  return (
    <div className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-surface-muted">
      <PaidToggle
        size="sm"
        paid={tx.paid}
        kind={tx.type === 'income' ? 'income' : 'expense'}
        loading={actions.savingPaidId === tx.id}
        disabled={readOnly}
        disabledReason={actions.readOnlyReason ?? undefined}
        onToggle={(paid) => actions.togglePaid(tx, paid)}
      />
      <Main
        {...(readOnly ? {} : { type: 'button' as const, onClick: () => actions.edit(tx) })}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-body-sm font-semibold text-fg">{tx.description}</span>
        <span className="mt-px flex min-w-0 items-center gap-1 text-mini">
          <span className={cn('shrink-0 @xl:hidden', due.tone)}>{due.text}</span>
          {detail ? (
            <span className="truncate text-muted">
              <span className="@xl:hidden">· </span>
              {detail}
            </span>
          ) : null}
        </span>
      </Main>
      <span className="hidden w-28 shrink-0 text-right @xl:block">
        <span className="block text-caption font-medium text-fg tabular">{formatDateBR(tx.date)}</span>
        <span className={cn('block text-mini', due.tone)}>{due.text}</span>
      </span>
      <span className="shrink-0 text-right text-body-sm @md:w-24">
        <Money value={tx.type === 'expense' ? -tx.amount : tx.amount} signed />
      </span>
      <RowMenu tx={tx} />
    </div>
  );
}
