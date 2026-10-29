import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import {
  formatBRL,
  formatDateBR,
  todayISO,
  type TaskListResponse,
  type TransactionListResponse,
} from '@effinance/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { cn, pluralize } from '@/lib/utils';
import { usePermissions } from '@/features/auth/permissions';
import { useTaskActivity } from '@/features/tasks/api';
import { commentTime } from '@/features/tasks/format';
import { taskHref } from '@/features/tasks/task-links';
import { tasksHref } from '@/features/tasks/url-state';
import { useTransactionActions } from '@/features/transactions/transaction-actions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Area } from './nav';

/**
 * Overdue bills (payables and receivables). Card purchases are settled through the invoice. Financial
 * data: only administrators ask for it (a collaborator would get 403).
 */
export function useOverdueBills() {
  const { canAccessFinance } = usePermissions();
  return useQuery({
    queryKey: qk.transactions({ status: 'overdue', bell: true }),
    queryFn: () =>
      api<TransactionListResponse>('/transactions', {
        query: { status: 'overdue', to: todayISO(), pageSize: 100, sort: 'date_asc' },
      }),
    staleTime: 60_000,
    enabled: canAccessFinance,
    select: (data) => data.items.filter((t) => !(t.creditCardId && t.type !== 'transfer')),
  });
}

/** Open tasks assigned to you that are past their due date (every member). */
export function useMyOverdueTasks() {
  return useQuery({
    queryKey: qk.tasks({ scope: 'mine', situation: 'overdue', bell: true }),
    queryFn: () =>
      api<TaskListResponse>('/tasks', { query: { scope: 'mine', situation: 'overdue', pageSize: 5, occurrences: 'false' } }),
    staleTime: 60_000,
    select: (data) => ({ total: data.total, items: data.items }),
  });
}

/** Text of the bell's accessible name: "Notificações (2 tarefas atrasadas, 3 contas vencidas)". */
export function notificationsLabel(tasks: number, bills: number | null): string {
  const parts = [
    tasks ? pluralize(tasks, 'tarefa atrasada', 'tarefas atrasadas') : null,
    bills ? pluralize(bills, 'conta vencida', 'contas vencidas') : null,
  ].filter(Boolean);
  return parts.length ? `Notificações (${parts.join(', ')})` : 'Notificações';
}

/** Bell of the floating bar: tasks for everyone, overdue bills for administrators (current area first). */
export function Notifications({ area, className }: { area: Area; className?: string }) {
  const navigate = useNavigate();
  const actions = useTransactionActions();
  const { canAccessFinance } = usePermissions();
  const bills = useOverdueBills().data ?? [];
  const tasks = useMyOverdueTasks().data;
  const activity = useTaskActivity().data ?? [];
  const taskCount = tasks?.total ?? 0;
  const billCount = canAccessFinance ? bills.length : 0;
  const count = taskCount + billCount;

  const taskGroup = (
    <>
      <DropdownMenuLabel>Tarefas</DropdownMenuLabel>
      {taskCount > 0 ? (
        <DropdownMenuItem onSelect={() => navigate(tasksHref({ scope: 'mine', situation: 'overdue' }))}>
          <span className="flex-1">Atrasadas atribuídas a você</span>
          <span className="tabular rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white">{taskCount}</span>
        </DropdownMenuItem>
      ) : (
        <p className="px-2.5 py-2 text-sm text-muted">Nenhuma tarefa sua atrasada.</p>
      )}
      {activity.slice(0, 4).map((a) => (
        <DropdownMenuItem key={a.id} onSelect={() => navigate(taskHref(a.taskId))}>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">
              <span className="font-semibold">{a.author?.name ?? 'Alguém'}</span> comentou em {a.taskTitle}
            </span>
            <span className="truncate text-xs text-muted">
              {commentTime(a.createdAt)} · {a.text}
            </span>
          </span>
        </DropdownMenuItem>
      ))}
    </>
  );

  const billGroup = canAccessFinance ? (
    <>
      <DropdownMenuLabel>Contas vencidas</DropdownMenuLabel>
      {billCount === 0 ? (
        <p className="px-2.5 py-2 text-sm text-muted">Tudo em dia por aqui.</p>
      ) : (
        <>
          {bills.slice(0, area === 'financeiro' ? 5 : 3).map((t) => (
            <DropdownMenuItem key={t.id} onSelect={() => actions.edit(t)}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{t.description}</span>
                <span className="text-xs text-danger">Venceu em {formatDateBR(t.date)}</span>
              </span>
              <span className={t.type === 'income' ? 'tabular font-semibold text-success' : 'tabular font-semibold text-danger'}>
                {formatBRL(t.amount)}
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => navigate('/contas-a-pagar?status=overdue')}>Ver todas as vencidas</DropdownMenuItem>
        </>
      )}
    </>
  ) : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-bg-subtle hover:text-fg [&_svg]:size-4',
            className,
          )}
          aria-label={notificationsLabel(taskCount, billCount)}
        >
          <Bell />
          {count ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-surface">
              {count > 9 ? '9+' : count}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" side="top" align="end" sideOffset={12}>
        {area === 'financeiro' && billGroup ? (
          <>
            {billGroup}
            <DropdownMenuSeparator />
            {taskGroup}
          </>
        ) : (
          <>
            {taskGroup}
            {billGroup ? (
              <>
                <DropdownMenuSeparator />
                {billGroup}
              </>
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
