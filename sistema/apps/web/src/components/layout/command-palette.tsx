import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { Dialog } from 'radix-ui';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  FileClock,
  FileUp,
  Landmark,
  ListChecks,
  Minus,
  NotebookPen,
  Plus,
  Repeat,
  Scale,
  Search,
  SquarePen,
  TrendingUp,
  Truck,
  Wallet,
  Workflow,
} from 'lucide-react';
import { formatBRL, formatDateBR, RECURRENCE_PERIOD_LABELS, todayISO, type PermissionKey, type SearchResponse } from '@effinance/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { BankLogo } from '@/components/ui/bank-logo';
import { CategoryIcon } from '@/components/ui/category-icon';
import { useTransactionActions } from '@/features/transactions/transaction-actions';
import { useImportActions } from '@/features/imports/import-actions';
import { useOpenFinanceStatus } from '@/features/open-finance/api';
import { usePermissions } from '@/features/auth/permissions';
import { useTaskSheetLinks } from '@/features/tasks/task-links';
import { useTaskActions } from '@/features/tasks/task-actions';
import { shortDate } from '@/features/tasks/due';
import { lastPathOf, type AreaMemory } from './area-memory';
import { FINANCE_NAV_ITEMS, MY_AREA_ITEM, navItemsFor, REGIME_GROUPS_ITEM, SETTINGS_ITEM, type Area, type NavItem } from './nav';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * What the search may show: transactions, accounts and categories only with access to the finances
 * (the API omits them for collaborators, but the web does not rely on it alone: an answer cached
 * before a role change, or an API regression, must not put amounts on a collaborator's screen), and
 * suppliers only in the finance area's audience.
 */
export function visibleSearchHits(r: SearchResponse | undefined, canAccessFinance: boolean, can?: (key: PermissionKey) => boolean) {
  // A hit that opens a page hidden for the person (`page.*`, spec §13.10) is left out too.
  const page = (key: PermissionKey) => !can || can(key);
  return {
    transactions: canAccessFinance ? (r?.transactions ?? []) : [],
    accounts: canAccessFinance ? (r?.accounts ?? []) : [],
    categories: canAccessFinance ? (r?.categories ?? []) : [],
    // Clients open the Gestão sheet (or, for administrators, the finance registry).
    contacts: (r?.contacts ?? []).filter((c) => (c.kind === 'client' ? canAccessFinance || page('page.clients') : canAccessFinance)),
    // Tasks and recurring tasks are for every member (titles only; never a client's access data).
    tasks: r?.tasks ?? [],
    recurringTasks: page('page.recurring') ? (r?.recurringTasks ?? []) : [],
    // Unions (phase 3): public data of the entity, for every member; they open Cadastros › Sindicatos.
    unions: page('page.registry') ? (r?.unions ?? []) : [],
  };
}

const groupClass = '[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-subtle';

const itemClass =
  'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm text-fg data-[selected=true]:bg-bg-subtle [&_svg]:size-4 [&_svg]:text-muted';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  area: Area;
  memory: AreaMemory;
}

/**
 * ⌘K: search and actions of the current area first. Financial actions, pages and results only for
 * administrators (the API omits them for collaborators too).
 */
export function CommandPalette({ open, onOpenChange, area, memory }: CommandPaletteProps) {
  const navigate = useNavigate();
  const actions = useTransactionActions();
  const { openImport } = useImportActions();
  const { canAccessFinance, canWriteTasks, canManage, can } = usePermissions();
  const { newTask, openTask } = useTaskSheetLinks();
  const taskActionsCtx = useTaskActions();
  const openFinance = useOpenFinanceStatus(open && canAccessFinance);
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 200);
  const search = useQuery({
    queryKey: qk.search(q),
    queryFn: () => api<SearchResponse>('/search', { query: { q } }),
    enabled: open && q.length >= 2,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  function run(fn: () => void) {
    onOpenChange(false);
    fn();
  }

  const r = search.data;
  const { transactions, accounts, categories, contacts, tasks, recurringTasks, unions } = visibleSearchHits(r, canAccessFinance, can);
  // Every Gestão page, the hub's included, plus Grupos por regime (a view of Recorrentes).
  const gestaoItems = [...navItemsFor('gestao', can), ...(can('page.recurring') ? [REGIME_GROUPS_ITEM] : [])];
  const today = todayISO();

  // Phase 3: the deadlines sheet (everyone) and a new union (`registry`, Cadastros visible).
  const deadlineActions = (
    <>
      <Command.Item value="ver vencimentos documentos certidoes certificado alvara convencoes coletivas" className={itemClass} onSelect={() => run(() => taskActionsCtx.openDeadlines())}>
        <FileClock /> Ver vencimentos
      </Command.Item>
      {canManage && can('page.registry') ? (
        <Command.Item value="novo sindicato convencao coletiva data-base" className={itemClass} onSelect={() => run(() => navigate('/tarefas/cadastros?aba=sindicatos&sindicato=novo'))}>
          <Scale /> Novo sindicato
        </Command.Item>
      ) : null}
    </>
  );

  const taskActions = canWriteTasks ? (
    <Command.Group heading="Ações da gestão" className={groupClass}>
      <Command.Item value="nova tarefa criar solicitacao" className={itemClass} onSelect={() => run(() => newTask())}>
        <ListChecks /> Nova tarefa
      </Command.Item>
      <Command.Item value="novo compromisso horario agenda reuniao" className={itemClass} onSelect={() => run(() => newTask({ appointment: true }))}>
        <CalendarClock /> Novo compromisso
      </Command.Item>
      <Command.Item value="aplicar modelo de processo fluxo etapas roteiro" className={itemClass} onSelect={() => run(taskActionsCtx.openTemplatePicker)}>
        <Workflow /> Aplicar modelo de processo
      </Command.Item>
      <Command.Item value="minhas anotacoes notas lembretes" className={itemClass} onSelect={() => run(taskActionsCtx.openNotes)}>
        <NotebookPen /> Minhas anotações
      </Command.Item>
      <Command.Item value="nova anotacao nota lembrete" className={itemClass} onSelect={() => run(taskActionsCtx.newNote)}>
        <SquarePen /> Nova anotação
      </Command.Item>
      {canManage && can('page.recurring') ? (
        <Command.Item value="nova tarefa recorrente obrigacao das dctfweb" className={itemClass} onSelect={() => run(() => navigate('/tarefas/recorrentes?recorrente=nova'))}>
          <Repeat /> Nova tarefa recorrente
        </Command.Item>
      ) : null}
      {deadlineActions}
    </Command.Group>
  ) : (
    <Command.Group heading="Ações da gestão" className={groupClass}>
      <Command.Item value="minhas anotacoes notas lembretes" className={itemClass} onSelect={() => run(taskActionsCtx.openNotes)}>
        <NotebookPen /> Minhas anotações
      </Command.Item>
      {deadlineActions}
    </Command.Group>
  );

  const financeActions = canAccessFinance ? (
    <Command.Group heading="Ações do financeiro" className={groupClass}>
      <Command.Item value="nova despesa" className={itemClass} onSelect={() => run(() => actions.openTransaction({ type: 'expense' }))}>
        <Minus className="!text-danger" /> Nova despesa
      </Command.Item>
      <Command.Item value="nova receita" className={itemClass} onSelect={() => run(() => actions.openTransaction({ type: 'income' }))}>
        <Plus className="!text-success" /> Nova receita
      </Command.Item>
      <Command.Item value="transferir entre contas" className={itemClass} onSelect={() => run(() => actions.openTransfer('transfer'))}>
        <ArrowLeftRight /> Transferir entre contas
      </Command.Item>
      <Command.Item value="investir aplicar" className={itemClass} onSelect={() => run(() => actions.openTransfer('investment'))}>
        <TrendingUp /> Investir
      </Command.Item>
      <Command.Item value="importar extrato fatura arquivo ofx csv banco" className={itemClass} onSelect={() => run(() => openImport())}>
        <FileUp /> Importar extrato ou fatura (OFX/CSV)
      </Command.Item>
      {openFinance.enabled ? (
        <Command.Item
          value="conectar banco open finance integracoes sincronizar"
          className={itemClass}
          onSelect={() => run(() => navigate('/configuracoes?aba=integracoes'))}
        >
          <Landmark /> Conectar banco (Open Finance)
        </Command.Item>
      ) : null}
    </Command.Group>
  ) : null;

  const goTo = (heading: string, items: NavItem[]) => (
    <Command.Group heading={`Ir para · ${heading}`} className={groupClass}>
      {items.map((item) => (
        <Command.Item
          key={item.to}
          value={`${heading} ${item.label} ${item.keywords ?? ''}`}
          className={itemClass}
          onSelect={() => run(() => navigate(item.to))}
        >
          <item.icon /> {item.label}
        </Command.Item>
      ))}
    </Command.Group>
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <Dialog.Content className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-lg outline-none data-[state=open]:animate-fade-in">
          <Dialog.Title className="sr-only">Buscar</Dialog.Title>
          <Dialog.Description className="sr-only">
            {canAccessFinance
              ? 'Busque tarefas, transações, contas, categorias, clientes, fornecedores ou navegue'
              : 'Busque tarefas, tarefas recorrentes e clientes ou navegue pela gestão de tarefas'}
          </Dialog.Description>
          <Command shouldFilter={!q || q.length < 2} label="Busca global">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-4 text-muted" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={canAccessFinance ? 'Buscar tarefas, transações, clientes, páginas ou ações…' : 'Buscar tarefas, clientes, páginas ou ações…'}
                className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle"
              />
              <kbd className="rounded-md border border-border bg-bg-subtle px-1.5 py-0.5 text-[11px] font-semibold text-muted">ESC</kbd>
            </div>
            <Command.List className="scrollbar-thin max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-muted">
                {search.isFetching ? 'Buscando…' : 'Nada encontrado.'}
              </Command.Empty>

              {r && q.length >= 2 ? (
                <>
                  {tasks.length ? (
                    <Command.Group heading="Tarefas" className={groupClass}>
                      {tasks.map((t) => (
                        <Command.Item key={t.id} value={`task-${t.id}`} className={itemClass} onSelect={() => run(() => openTask(t.id))}>
                          <ListChecks />
                          <span className="min-w-0 flex-1 truncate">
                            {t.title}
                            <span className="ml-2 text-xs text-muted">{t.client?.name ?? 'Interna'}</span>
                          </span>
                          <span className={t.overdue ? 'text-xs font-semibold text-danger' : 'text-xs text-muted'}>
                            {t.status === 'done' ? 'Concluída' : t.status === 'canceled' ? 'Cancelada' : t.dueDate ? `${t.overdue ? 'Venceu' : 'Vence'} ${shortDate(t.dueDate, today)}` : 'Sem vencimento'}
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ) : null}
                  {recurringTasks.length ? (
                    <Command.Group heading="Tarefas recorrentes" className={groupClass}>
                      {recurringTasks.map((t) => (
                        <Command.Item key={t.id} value={`rec-${t.id}`} className={itemClass} onSelect={() => run(() => navigate(`/tarefas/recorrentes?recorrente=${t.id}`))}>
                          <Repeat />
                          <span className="min-w-0 flex-1 truncate">{t.name}</span>
                          <span className="text-xs text-muted">{RECURRENCE_PERIOD_LABELS[t.period]}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ) : null}
                  {unions.length ? (
                    <Command.Group heading="Sindicatos" className={groupClass}>
                      {unions.map((u) => (
                        <Command.Item key={u.id} value={`union-${u.id}`} className={itemClass} onSelect={() => run(() => navigate(`/tarefas/cadastros?aba=sindicatos&sindicato=${u.id}`))}>
                          <Scale />
                          <span className="min-w-0 flex-1 truncate">
                            {u.acronym ?? u.name}
                            {u.acronym ? <span className="ml-2 text-xs text-muted">{u.name}</span> : null}
                          </span>
                          <span className="text-xs text-muted">{u.active ? (u.category ?? 'Sindicato') : 'Inativo'}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ) : null}
                  {transactions.length ? (
                    <Command.Group heading="Lançamentos" className={groupClass}>
                      {transactions.map((t) => (
                        <Command.Item key={t.id} value={`tx-${t.id}`} className={itemClass} onSelect={() => run(() => actions.edit(t))}>
                          <CategoryIcon icon={t.category?.icon ?? (t.type === 'transfer' ? 'landmark' : 'tag')} color={t.category?.color ?? '#6B6F76'} size="sm" />
                          <span className="flex-1 truncate">
                            {t.description}
                            <span className="ml-2 text-xs text-muted">{formatDateBR(t.date)}</span>
                          </span>
                          <span className={t.type === 'income' ? 'tabular font-semibold text-success' : t.type === 'expense' ? 'tabular font-semibold text-danger' : 'tabular font-semibold'}>
                            {formatBRL(t.amount)}
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ) : null}
                  {accounts.length ? (
                    <Command.Group heading="Contas" className={groupClass}>
                      {accounts.map((a) => (
                        <Command.Item key={a.id} value={`acc-${a.id}`} className={itemClass} onSelect={() => run(() => navigate(`/extrato?conta=${a.id}`))}>
                          <BankLogo bank={a.bank} color={a.color} size="sm" />
                          <span className="flex-1 truncate">{a.name}</span>
                          <span className="tabular text-sm font-semibold">{formatBRL(a.balance)}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ) : null}
                  {categories.length ? (
                    <Command.Group heading="Categorias" className={groupClass}>
                      {categories.map((c) => (
                        <Command.Item key={c.id} value={`cat-${c.id}`} className={itemClass} onSelect={() => run(() => navigate(`/categorias?tipo=${c.type}`))}>
                          <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                          <span className="flex-1 truncate">{c.name}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ) : null}
                  {contacts.length ? (
                    <Command.Group heading={canAccessFinance ? 'Clientes e fornecedores' : 'Clientes'} className={groupClass}>
                      {contacts.map((c) => (
                        <Command.Item
                          key={c.id}
                          value={`ct-${c.id}`}
                          className={itemClass}
                          onSelect={() =>
                            run(() =>
                              navigate(
                                c.kind !== 'client'
                                  ? `/fornecedores?editar=${c.id}`
                                  : (area === 'financeiro' || !can('page.clients')) && canAccessFinance
                                    ? `/clientes?consultar=${c.id}`
                                    : `/tarefas/clientes?cliente=${c.id}`,
                              ),
                            )
                          }
                        >
                          {c.kind === 'client' ? <Building2 /> : <Truck />}
                          <span className="flex-1 truncate">{c.name}</span>
                          <span className="text-xs text-muted">{c.kind === 'client' ? 'Cliente' : 'Fornecedor'}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ) : null}
                </>
              ) : null}

              {area === 'financeiro' && canAccessFinance ? (
                <>
                  {financeActions}
                  {taskActions}
                </>
              ) : (
                <>
                  {taskActions}
                  {financeActions}
                </>
              )}
              {area === 'financeiro' && canAccessFinance ? (
                <>
                  {goTo('Financeiro', FINANCE_NAV_ITEMS)}
                  {goTo('Gestão de tarefas', gestaoItems)}
                </>
              ) : (
                <>
                  {goTo('Gestão de tarefas', gestaoItems)}
                  {canAccessFinance ? goTo('Financeiro', FINANCE_NAV_ITEMS) : null}
                </>
              )}
              <Command.Group heading="Outros" className={groupClass}>
                {canAccessFinance ? (
                  <Command.Item
                    value={area === 'financeiro' ? 'ir para a gestao de tarefas area' : 'ir para o financeiro area'}
                    className={itemClass}
                    onSelect={() => run(() => navigate(lastPathOf(memory, area === 'financeiro' ? 'gestao' : 'financeiro')))}
                  >
                    {area === 'financeiro' ? <BriefcaseBusiness /> : <Wallet />}
                    {area === 'financeiro' ? 'Ir para a gestão de tarefas' : 'Ir para o financeiro'}
                  </Command.Item>
                ) : null}
                <Command.Item value={`${MY_AREA_ITEM.label} ${MY_AREA_ITEM.keywords ?? ''}`} className={itemClass} onSelect={() => run(() => navigate(MY_AREA_ITEM.to))}>
                  <MY_AREA_ITEM.icon /> {MY_AREA_ITEM.label}
                </Command.Item>
                <Command.Item value={`${SETTINGS_ITEM.label} ${SETTINGS_ITEM.keywords ?? ''}`} className={itemClass} onSelect={() => run(() => navigate(SETTINGS_ITEM.to))}>
                  <SETTINGS_ITEM.icon /> {SETTINGS_ITEM.label}
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
