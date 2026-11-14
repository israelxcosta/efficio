import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ArrowLeftRight, Bell, BriefcaseBusiness, FileClock, ListChecks, ListTree, LogOut, Menu, Minus, NotebookPen, Plus, Search, TrendingUp, Wallet, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-context';
import { usePermissions, WriteGate } from '@/features/auth/permissions';
import { WorkspaceList, WorkspaceSheet } from '@/features/workspaces/workspace-switcher';
import { useTransactionActions } from '@/features/transactions/transaction-actions';
import { useTaskSheetLinks } from '@/features/tasks/task-links';
import { useTaskActions } from '@/features/tasks/task-actions';
import { tasksHref } from '@/features/tasks/url-state';
import { createActions } from '@/features/tasks/task-hub';
import { CREATE_ICONS } from '@/features/tasks/components/tasks-hub';
import { Sheet } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { lastPathOf, type AreaMemory } from './area-memory';
import { AREA_LABELS, currentItemOf, isActivePath, moreMenuItemsFor, MY_AREA_ITEM, railItemsFor, SETTINGS_ITEM, type Area, type NavItem } from './nav';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { useMyOverdueTasks, useOverdueBills } from './notifications';
import { useDeadlinesSummary } from '@/features/deadlines/api';

const menuRow = 'flex items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold';

/**
 * Bottom bar on phones and tablets: two items, "+", one item and "Mais", per area
 * (Gestão: Início · Tarefas · + · Clientes · Mais).
 */
export function MobileNav({ area, memory, onSearch }: { area: Area; memory: AreaMemory; onSearch: () => void }) {
  const { logout, user } = useAuth();
  const { canAccessFinance, can } = usePermissions();
  const { openNotes, openDeadlines } = useTaskActions();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  // Counts what each link opens: overdue payables (administrators) and your overdue tasks.
  const overdueBills = useOverdueBills().data?.filter((t) => t.type === 'expense').length ?? 0;
  const overdueTasks = useMyOverdueTasks().data?.total ?? 0;
  const overdueDeadlines = useDeadlinesSummary().data?.overdueTotal ?? 0;
  const items = railItemsFor(area, can).filter((i) => i.mobile);
  // The "Mais" lists the hub pages too (Auditoria, Recorrentes, Processos): on the phone the hub's
  // icons have no tooltip to name them. Only the most specific item is the current page.
  const menuItems = [...moreMenuItemsFor(area, can), SETTINGS_ITEM];
  const currentMenuItem = currentItemOf(pathname, menuItems);
  // Tarefas is active on the hub pages too (`activeOn`), which `NavLink end` cannot express.
  const barLink = (i: NavItem) => {
    const isActive = isActivePath(pathname, i);
    return (
      <Link
        key={i.to}
        to={i.to}
        aria-current={isActive ? 'page' : undefined}
        className={cn('flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-semibold', isActive ? 'text-fg' : 'text-muted')}
      >
        <i.icon className="size-5" />
        {i.short ?? i.label.split(' ')[0]}
      </Link>
    );
  };
  const close = () => setMenuOpen(false);

  return (
    <>
      <nav
        aria-label={area === 'financeiro' ? 'Navegação do financeiro' : 'Navegação da gestão de tarefas'}
        data-bottom-bar
        className="fixed inset-x-0 bottom-0 z-30 flex items-center border-t border-border bg-surface/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden"
      >
        {items.slice(0, 2).map(barLink)}
        {area === 'financeiro' ? <FinanceCreate /> : <TaskCreate />}
        {items.slice(2, 3).map(barLink)}
        <button type="button" className="flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-semibold text-muted" onClick={() => setMenuOpen(true)}>
          <Menu className="size-5" />
          Mais
        </button>
      </nav>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Menu" description={AREA_LABELS[area]}>
        <div className="flex flex-col gap-1">
          {/* The phone's door to the page the rail's avatar opens on the computer (spec §2.4). */}
          <Link
            to={MY_AREA_ITEM.to}
            onClick={close}
            aria-current={isActivePath(pathname, MY_AREA_ITEM) ? 'page' : undefined}
            className={cn('flex h-14 items-center gap-3 rounded-md px-3', isActivePath(pathname, MY_AREA_ITEM) ? 'bg-primary-soft text-primary-soft-fg' : 'text-fg hover:bg-bg-subtle')}
          >
            <MemberAvatar size="md" name={user?.name} userId={user?.id} photoVersion={user?.photoUpdatedAt ?? null} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{user?.name}</span>
              <span className="block text-caption text-muted">Minha área</span>
            </span>
          </Link>
          <span className="my-1 h-px bg-border" aria-hidden />
          <p className="eyebrow px-3 pb-1 text-subtle">Espaço</p>
          <WorkspaceList
            onSwitched={close}
            onCreate={() => {
              close();
              setCreating(true);
            }}
          />
          {canAccessFinance ? (
            <>
              <span className="my-1 h-px bg-border" aria-hidden />
              <p className="eyebrow px-3 pb-1 text-subtle">Área</p>
              <ul className="flex flex-col gap-1">
                {(['gestao', 'financeiro'] as const).map((a) => {
                  const current = a === area;
                  const Icon = a === 'gestao' ? BriefcaseBusiness : Wallet;
                  return (
                    <li key={a}>
                      <Link
                        to={lastPathOf(memory, a)}
                        aria-current={current ? 'true' : undefined}
                        onClick={(e) => {
                          if (current) e.preventDefault();
                          close();
                        }}
                        className={cn(menuRow, 'h-12 py-0', current ? 'bg-primary-soft text-primary-soft-fg' : 'text-fg hover:bg-bg-subtle')}
                      >
                        <Icon className="size-5" /> {AREA_LABELS[a]}
                        {current ? <span className="sr-only"> (atual)</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
          <span className="my-1 h-px bg-border" aria-hidden />
          {/* Search and alerts: on desktop they live in the floating quick-action bar. */}
          <button
            type="button"
            className={cn(menuRow, 'text-fg hover:bg-bg-subtle')}
            onClick={() => {
              close();
              onSearch();
            }}
          >
            <Search className="size-5" /> Buscar
          </button>
          <button
            type="button"
            className={cn(menuRow, 'text-fg hover:bg-bg-subtle')}
            onClick={() => {
              close();
              navigate(tasksHref({ scope: 'mine', situation: 'overdue' }));
            }}
          >
            <ListChecks className="size-5" /> Tarefas atrasadas
            {overdueTasks ? <span className="ml-auto rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white">{overdueTasks}</span> : null}
          </button>
          <button
            type="button"
            className={cn(menuRow, 'text-fg hover:bg-bg-subtle')}
            onClick={() => {
              close();
              openDeadlines();
            }}
          >
            <FileClock className="size-5" /> Vencimentos
            {overdueDeadlines ? <span className="ml-auto rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white">{overdueDeadlines}</span> : null}
          </button>
          {canAccessFinance ? (
            <button
              type="button"
              className={cn(menuRow, 'text-fg hover:bg-bg-subtle')}
              onClick={() => {
                close();
                navigate('/contas-a-pagar?status=overdue');
              }}
            >
              <Bell className="size-5" /> Contas vencidas
              {overdueBills ? <span className="ml-auto rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white">{overdueBills}</span> : null}
            </button>
          ) : null}
          <span className="my-1 h-px bg-border" aria-hidden />
          {menuItems.map((i) => {
            const isActive = i === currentMenuItem;
            return (
              <Link
                key={i.to}
                to={i.to}
                onClick={close}
                aria-current={isActive ? 'page' : undefined}
                className={cn(menuRow, isActive ? 'bg-primary-soft text-primary-soft-fg' : 'text-fg hover:bg-bg-subtle')}
              >
                <i.icon className="size-5" /> {i.label}
              </Link>
            );
          })}
          <button
            type="button"
            className={cn(menuRow, 'text-fg hover:bg-bg-subtle')}
            onClick={() => {
              close();
              openNotes();
            }}
          >
            <NotebookPen className="size-5" /> Minhas anotações
          </button>
          <button
            type="button"
            className={cn(menuRow, 'mt-2 text-danger hover:bg-danger-soft')}
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          >
            <LogOut className="size-5" /> Sair
          </button>
        </div>
      </Sheet>
      <WorkspaceSheet open={creating} onOpenChange={setCreating} />
    </>
  );
}

const plusClass =
  'mx-2 -mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-primary-fg shadow-lg ring-4 ring-bg disabled:opacity-50';

/** The phone's "+" in the Gestão: the same options and icons as Criar in the hub (`createActions`, by permission). */
function TaskCreate() {
  const { newTask } = useTaskSheetLinks();
  const { openTemplatePicker, openFlowBuilder } = useTaskActions();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const ids = new Set(createActions(can).map((a) => a.id));
  return (
    <DropdownMenu>
      <WriteGate scope="tasks">
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Criar" className={plusClass}>
            <Plus className="size-6" />
          </button>
        </DropdownMenuTrigger>
      </WriteGate>
      <DropdownMenuContent align="center" side="top" sideOffset={10}>
        <DropdownMenuItem icon={<CREATE_ICONS.task />} onSelect={() => newTask()}>
          Tarefa
        </DropdownMenuItem>
        <DropdownMenuItem icon={<CREATE_ICONS.appointment />} onSelect={() => newTask({ appointment: true })}>
          Compromisso
        </DropdownMenuItem>
        {ids.has('recurring') ? (
          <DropdownMenuItem icon={<CREATE_ICONS.recurring />} onSelect={() => navigate('/tarefas/recorrentes?recorrente=nova')}>
            Tarefa recorrente
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<Workflow />} onSelect={openTemplatePicker}>
          Aplicar modelo de processo
        </DropdownMenuItem>
        <DropdownMenuItem icon={<ListTree />} onSelect={openFlowBuilder}>
          Processo avulso
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FinanceCreate() {
  const actions = useTransactionActions();
  return (
    <DropdownMenu>
      <WriteGate>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Nova transação" className={plusClass}>
            <Plus className="size-6" />
          </button>
        </DropdownMenuTrigger>
      </WriteGate>
      <DropdownMenuContent align="center" side="top" sideOffset={10}>
        <DropdownMenuItem icon={<Plus className="text-success" />} onSelect={() => actions.openTransaction({ type: 'income' })}>
          Receita
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Minus className="text-danger" />} onSelect={() => actions.openTransaction({ type: 'expense' })}>
          Despesa
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<ArrowLeftRight />} onSelect={() => actions.openTransfer('transfer')}>
          Transferência
        </DropdownMenuItem>
        <DropdownMenuItem icon={<TrendingUp />} onSelect={() => actions.openTransfer('investment')}>
          Investimento
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
