import { useNavigate } from 'react-router';
import { ArrowLeftRight, CreditCard, Plus, Search } from 'lucide-react';
import { useTransactionActions } from '@/features/transactions/transaction-actions';
import { WriteGate } from '@/features/auth/permissions';
import { Notifications } from './notifications';

/**
 * Quick actions (desktop): search and the entries people make every day, in the page's top row so
 * they never cover content. Neutral chrome; the screens' data carries the colour.
 */
export function QuickBar({ onSearch }: { onSearch: () => void }) {
  const actions = useTransactionActions();
  const navigate = useNavigate();
  const btn =
    'inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-fg transition-colors hover:bg-bg-subtle disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:text-muted';
  return (
    <div className="mb-5 hidden items-center justify-between gap-3 lg:flex">
      <button
        type="button"
        onClick={onSearch}
        className="flex h-9 w-[min(26rem,40%)] items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-subtle transition-colors hover:border-border-strong"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">Buscar ou executar ação…</span>
        <kbd className="rounded border border-border px-1.5 text-[11px] font-medium text-subtle">Ctrl K</kbd>
      </button>
      <div className="flex items-center gap-1">
        <WriteGate>
          <button type="button" className={btn} onClick={() => actions.openTransaction({ type: 'expense' })}>
            <Plus /> Despesa
          </button>
        </WriteGate>
        <WriteGate>
          <button type="button" className={btn} onClick={() => actions.openTransaction({ type: 'income' })}>
            <Plus /> Receita
          </button>
        </WriteGate>
        <WriteGate>
          <button type="button" className={btn} onClick={() => actions.openTransfer('transfer')}>
            <ArrowLeftRight /> Transferir
          </button>
        </WriteGate>
        <button type="button" className={btn} onClick={() => navigate('/cartoes')}>
          <CreditCard /> Fatura
        </button>
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        <Notifications />
      </div>
    </div>
  );
}
