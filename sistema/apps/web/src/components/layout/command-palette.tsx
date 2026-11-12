import { useEffect, useState, type ReactNode } from 'react';
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
import { formatBRL, formatDateBR, RECURRENCE_PERIOD_LABELS, todayISO, type Contact, type PermissionKey, type SearchResponse } from '@effinance/shared';
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
import { AREA_LABELS, FINANCE_NAV_ITEMS, MY_AREA_ITEM, navItemsFor, REGIME_GROUPS_ITEM, SETTINGS_ITEM, settingsSearchKeywords, type Area, type NavItem } from './nav';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * The area the palette searches: the Financeiro only with access to the finances (a collaborator, or
 * a stale rail after a role change, gets the Gestão).
 */
export function paletteAreaFor(area: Area, canAccessFinance: boolean): Area {
  return area === 'financeiro' && canAccessFinance ? 'financeiro' : 'gestao';
}

/** Placeholder of the search field: what the palette finds in each area. */
export const SEARCH_PLACEHOLDERS: Record<Area, string> = {
  gestao: 'Buscar tarefas, clientes, páginas ou ações…',
  financeiro: 'Buscar lançamentos, contas, clientes, páginas ou ações…',
};

const SEARCH_DESCRIPTIONS: Record<Area, string> = {
  gestao: 'Busque tarefas, tarefas recorrentes, clientes e sindicatos ou navegue pela gestão de tarefas',
  financeiro: 'Busque lançamentos, contas, categorias, clientes e fornecedores ou navegue pelo financeiro',
};

/**
 * What the search shows: only the results of the area where the person is. Gestão: tasks, recurring
 * tasks, unions and clients (its sheet). Financeiro: transactions, accounts, categories, clients and
 * suppliers, and only with access to the finances (the API omits them for collaborators, but the web
 * does not rely on it alone: an answer cached before a role change, or an API regression, must not
 * put amounts on a collaborator's screen).
 */
export function visibleSearchHits(r: SearchResponse | undefined, area: Area, canAccessFinance: boolean, can?: (key: PermissionKey) => boolean) {
  // A hit that opens a page hidden for the person (`page.*`, spec §13.10) is left out too.
  const page = (key: PermissionKey) => !can || can(key);
  if (area === 'financeiro') {
    return {
      transactions: canAccessFinance ? (r?.transactions ?? []) : [],
      accounts: canAccessFinance ? (r?.accounts ?? []) : [],
      categories: canAccessFinance ? (r?.categories ?? []) : [],
      contacts: canAccessFinance ? (r?.contacts ?? []) : [],
      tasks: [],
      recurringTasks: [],
      unions: [],
    };
  }
  return {
    transactions: [],
    accounts: [],
    categories: [],
    // Clients open the Gestão sheet; suppliers belong to the finances.
    contacts: page('page.clients') ? (r?.contacts ?? []).filter((c) => c.kind === 'client') : [],
    // Tasks and recurring tasks are for every member (titles only; never a client's access data).
    tasks: r?.tasks ?? [],
    recurringTasks: page('page.recurring') ? (r?.recurringTasks ?? []) : [],
    // Unions (phase 3): public data of the entity, for every member; they open Cadastros › Sindicatos.
    unions: page('page.registry') ? (r?.unions ?? []) : [],
  };
}

/** Where a client or supplier hit leads: the client in the module of the search; a supplier in the finances. */
export function contactPathFor(area: Area, contact: Pick<Contact, 'id' | 'kind'>): string {
  if (contact.kind !== 'client') return `/fornecedores?editar=${contact.id}`;
  return area === 'financeiro' ? `/clientes?consultar=${contact.id}` : `/tarefas/clientes?cliente=${contact.id}`;
}

/** Pages of the area ("Ir para"): every Gestão page, the hub's included, plus Grupos por regime; or the finance rail. */
export function paletteNavFor(area: Area, can?: (key: PermissionKey) => boolean): { heading: string; items: NavItem[] } {
  if (area === 'financeiro') return { heading: AREA_LABELS.financeiro, items: FINANCE_NAV_ITEMS };
  const regimeGroups = !can || can('page.recurring') ? [REGIME_GROUPS_ITEM] : [];
  return { heading: AREA_LABELS.gestao, items: [...navItemsFor('gestao', can), ...regimeGroups] };
}

/** An action or page of the palette: what it says and the words that also find it. */
export interface PaletteEntry {
  id: string;
  label: string;
  keywords?: string;
  icon?: ReactNode;
  onSelect?: () => void;
}

/** Lower case, without accents (ç → c, ã → a): "Configurações" is found by "configuracoes". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Whether every word typed is in the entry's label or keywords (accents and case ignored). */
export function matchesPaletteQuery(entry: Pick<PaletteEntry, 'label' | 'keywords'>, query: string): boolean {
  const haystack = fold(`${entry.label} ${entry.keywords ?? ''}`);
  return fold(query).split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

/**
 * The actions and pages while searching. From two letters on cmdk stops filtering (the server answers
 * the search), so the palette filters them itself by label and keywords; groups left empty go away
 * (with nothing at all, cmdk shows the empty state). Before that, cmdk filters them as usual.
 */
export function filterPaletteGroups<T extends Pick<PaletteEntry, 'label' | 'keywords'>>(groups: { heading: string; entries: T[] }[], query: string) {
  if (query.trim().length < 2) return groups;
  return groups.map((g) => ({ ...g, entries: g.entries.filter((e) => matchesPaletteQuery(e, query)) })).filter((g) => g.entries.length > 0);
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
 * ⌘K: search, actions and pages of the area where the person is, and only of it (Gestão or
 * Financeiro); Minha área, Configurações and the switch to the other area in both. The Financeiro
 * only with access to the finances (the API omits its results for collaborators too).
 */
export function CommandPalette({ open, onOpenChange, area, memory }: CommandPaletteProps) {
  const navigate = useNavigate();
  const actions = useTransactionActions();
  const { openImport } = useImportActions();
  const { canAccessFinance, canWriteTasks, canManage, can } = usePermissions();
  const { newTask, openTask } = useTaskSheetLinks();
  const taskActionsCtx = useTaskActions();
  const scope = paletteAreaFor(area, canAccessFinance);
  const openFinance = useOpenFinanceStatus(open && scope === 'financeiro');
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
  const { transactions, accounts, categories, contacts, tasks, recurringTasks, unions } = visibleSearchHits(r, scope, canAccessFinance, can);
  const nav = paletteNavFor(scope, can);
  const today = todayISO();

  // The area's actions, pages and the common items, as data: filtered by the typed text while the
  // server search runs (cmdk filters only the first letter, see `filterPaletteGroups`).
  const go = (to: string) => () => run(() => navigate(to));
  const taskEntries: PaletteEntry[] = [
    ...(canWriteTasks
      ? [
          { id: 'task', label: 'Nova tarefa', keywords: 'criar solicitacao', icon: <ListChecks />, onSelect: () => run(() => newTask()) },
          { id: 'appointment', label: 'Novo compromisso', keywords: 'horario agenda reuniao', icon: <CalendarClock />, onSelect: () => run(() => newTask({ appointment: true })) },
          { id: 'template', label: 'Aplicar modelo de processo', keywords: 'fluxo etapas roteiro', icon: <Workflow />, onSelect: () => run(taskActionsCtx.openTemplatePicker) },
        ]
      : []),
    { id: 'notes', label: 'Minhas anotações', keywords: 'notas lembretes', icon: <NotebookPen />, onSelect: () => run(taskActionsCtx.openNotes) },
    ...(canWriteTasks ? [{ id: 'note', label: 'Nova anotação', keywords: 'nota lembrete', icon: <SquarePen />, onSelect: () => run(taskActionsCtx.newNote) }] : []),
    ...(canWriteTasks && canManage && can('page.recurring')
      ? [{ id: 'recurring', label: 'Nova tarefa recorrente', keywords: 'obrigacao das dctfweb', icon: <Repeat />, onSelect: go('/tarefas/recorrentes?recorrente=nova') }]
      : []),
    // Phase 3: the deadlines sheet (everyone) and a new union (`registry`, Cadastros visible).
    { id: 'deadlines', label: 'Ver vencimentos', keywords: 'documentos certidoes certificado alvara convencoes coletivas', icon: <FileClock />, onSelect: () => run(() => taskActionsCtx.openDeadlines()) },
    ...(canManage && can('page.registry')
      ? [{ id: 'union', label: 'Novo sindicato', keywords: 'convencao coletiva data-base', icon: <Scale />, onSelect: go('/tarefas/cadastros?aba=sindicatos&sindicato=novo') }]
      : []),
  ];
  const financeEntries: PaletteEntry[] = [
    { id: 'expense', label: 'Nova despesa', icon: <Minus className="!text-danger" />, onSelect: () => run(() => actions.openTransaction({ type: 'expense' })) },
    { id: 'income', label: 'Nova receita', icon: <Plus className="!text-success" />, onSelect: () => run(() => actions.openTransaction({ type: 'income' })) },
    { id: 'transfer', label: 'Transferir entre contas', icon: <ArrowLeftRight />, onSelect: () => run(() => actions.openTransfer('transfer')) },
    { id: 'invest', label: 'Investir', keywords: 'aplicar', icon: <TrendingUp />, onSelect: () => run(() => actions.openTransfer('investment')) },
    { id: 'import', label: 'Importar extrato ou fatura (OFX/CSV)', keywords: 'arquivo ofx csv banco', icon: <FileUp />, onSelect: () => run(() => openImport()) },
    ...(openFinance.enabled
      ? [{ id: 'open-finance', label: 'Conectar banco (Open Finance)', keywords: 'integracoes sincronizar', icon: <Landmark />, onSelect: go('/configuracoes?aba=integracoes') }]
      : []),
  ];
  const otherArea: Area = scope === 'financeiro' ? 'gestao' : 'financeiro';
  const groups = filterPaletteGroups(
    [
      scope === 'financeiro' ? { heading: 'Ações do financeiro', entries: financeEntries } : { heading: 'Ações da gestão', entries: taskEntries },
      {
        heading: `Ir para · ${nav.heading}`,
        entries: nav.items.map((item) => ({ id: item.to, label: item.label, keywords: item.keywords, icon: <item.icon />, onSelect: go(item.to) })),
      },
      {
        heading: 'Outros',
        entries: [
          ...(canAccessFinance
            ? [
                {
                  id: 'switch-area',
                  label: otherArea === 'gestao' ? 'Ir para a gestão de tarefas' : 'Ir para o financeiro',
                  keywords: 'area',
                  icon: otherArea === 'gestao' ? <BriefcaseBusiness /> : <Wallet />,
                  onSelect: go(lastPathOf(memory, otherArea)),
                },
              ]
            : []),
          { id: 'my-area', label: MY_AREA_ITEM.label, keywords: MY_AREA_ITEM.keywords, icon: <MY_AREA_ITEM.icon />, onSelect: go(MY_AREA_ITEM.to) },
          { id: 'settings', label: SETTINGS_ITEM.label, keywords: settingsSearchKeywords(), icon: <SETTINGS_ITEM.icon />, onSelect: go(SETTINGS_ITEM.to) },
        ],
      },
    ],
    q,
  );
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <Dialog.Content className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-lg outline-none data-[state=open]:animate-fade-in">
          <Dialog.Title className="sr-only">Buscar</Dialog.Title>
          <Dialog.Description className="sr-only">{SEARCH_DESCRIPTIONS[scope]}</Dialog.Description>
          <Command shouldFilter={!q || q.length < 2} label="Busca global">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-4 text-muted" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={SEARCH_PLACEHOLDERS[scope]}
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
                    <Command.Group heading={scope === 'financeiro' ? 'Clientes e fornecedores' : 'Clientes'} className={groupClass}>
                      {contacts.map((c) => (
                        <Command.Item
                          key={c.id}
                          value={`ct-${c.id}`}
                          className={itemClass}
                          onSelect={() => run(() => navigate(contactPathFor(scope, c)))}
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

              {groups.map((group) => (
                <Command.Group key={group.heading} heading={group.heading} className={groupClass}>
                  {group.entries.map((entry) => (
                    <Command.Item key={entry.id} value={`${entry.label} ${entry.keywords ?? ''}`} className={itemClass} onSelect={entry.onSelect}>
                      {entry.icon} {entry.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
