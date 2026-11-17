import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeftRight, CalendarClock, CircleMinus, CirclePlus, CreditCard, ListPlus, Search, Workflow } from 'lucide-react';
import { useTransactionActions } from '@/features/transactions/transaction-actions';
import { useTaskSheetLinks } from '@/features/tasks/task-links';
import { useTaskActions } from '@/features/tasks/task-actions';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';
import { WriteGate } from '@/features/auth/permissions';
import { Notifications } from './notifications';
import type { Area } from './nav';

const btn =
  'inline-flex size-9 items-center justify-center rounded-full transition-colors hover:bg-bg-subtle disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-[18px]';

/** One icon-only quick action: the name shows in a tooltip and is the button's accessible name. */
function QuickAction({ label, className, onClick, disabled, children }: { label: string; className?: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  // Disabled (WriteGate without permission): the gate's tooltip explains why, so no second tooltip here.
  const button = (
    <button type="button" aria-label={label} disabled={disabled} className={cn(btn, className)} onClick={onClick}>
      {children}
    </button>
  );
  return disabled ? button : <Tooltip content={label}>{button}</Tooltip>;
}

/** Floating quick-action bar (desktop), icons only: the actions of the current area; the search (⌘K) is scoped to it too. */
export function QuickBar({ area, onSearch }: { area: Area; onSearch: () => void }) {
  return (
    <div data-bottom-bar className="pointer-events-none fixed inset-x-0 bottom-5 z-20 hidden justify-center lg:flex lg:pl-[76px] print:hidden">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-surface/95 p-1.5 shadow-lg backdrop-blur">
        <Tooltip content="Buscar ou executar ação (⌘K)">
          <button
            type="button"
            onClick={onSearch}
            aria-label={area === 'financeiro' ? 'Buscar no financeiro ou executar ação (⌘K)' : 'Buscar na gestão de tarefas ou executar ação (⌘K)'}
            className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-fg transition-opacity hover:opacity-90"
          >
            <Search className="size-[18px]" />
          </button>
        </Tooltip>
        <span className="mx-0.5 h-6 w-px bg-border" aria-hidden />
        {area === 'financeiro' ? <FinanceActions /> : <TaskActions />}
        <span className="mx-0.5 h-6 w-px bg-border" aria-hidden />
        <Notifications area={area} />
      </div>
    </div>
  );
}

function TaskActions() {
  const { newTask } = useTaskSheetLinks();
  const { openTemplatePicker } = useTaskActions();
  return (
    <>
      <WriteGate scope="tasks">
        <QuickAction label="Nova tarefa" className="text-fg" onClick={() => newTask()}>
          <ListPlus />
        </QuickAction>
      </WriteGate>
      <WriteGate scope="tasks">
        <QuickAction label="Novo compromisso" className="text-muted hover:text-fg" onClick={() => newTask({ appointment: true })}>
          <CalendarClock />
        </QuickAction>
      </WriteGate>
      <WriteGate scope="tasks">
        <QuickAction label="Iniciar processo" className="text-muted hover:text-fg" onClick={openTemplatePicker}>
          <Workflow />
        </QuickAction>
      </WriteGate>
    </>
  );
}

function FinanceActions() {
  const actions = useTransactionActions();
  const navigate = useNavigate();
  return (
    <>
      <WriteGate>
        <QuickAction label="Nova despesa" className="text-danger" onClick={() => actions.openTransaction({ type: 'expense' })}>
          <CircleMinus />
        </QuickAction>
      </WriteGate>
      <WriteGate>
        <QuickAction label="Nova receita" className="text-success" onClick={() => actions.openTransaction({ type: 'income' })}>
          <CirclePlus />
        </QuickAction>
      </WriteGate>
      <WriteGate>
        <QuickAction label="Transferir entre contas" className="text-muted hover:text-fg" onClick={() => actions.openTransfer('transfer')}>
          <ArrowLeftRight />
        </QuickAction>
      </WriteGate>
      <QuickAction label="Faturas dos cartões" className="text-muted hover:text-fg" onClick={() => navigate('/cartoes')}>
        <CreditCard />
      </QuickAction>
    </>
  );
}
