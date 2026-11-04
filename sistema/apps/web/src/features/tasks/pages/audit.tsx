import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Building2, ChevronDown, ChevronRight, ChevronsUpDown, CircleCheck, ClipboardCheck, LockKeyhole, Repeat, Search, SearchX, SlidersHorizontal, X } from 'lucide-react';
import {
  formatCNPJ,
  formatMonthKey,
  RECURRENCE_PERIOD_LABELS,
  TAX_REGIME_LABELS,
  TAX_REGIMES,
  todayISO,
  type AuditClientRow,
  type AuditColumn,
  type AuditMatrixResponse,
  type OccurrenceCell,
  type TaskOptionsResponse,
  type TaxRegime,
} from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/input';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { ErrorState, PageHeader } from '@/components/ui/misc';
import { PeriodNavigator } from '@/components/ui/period-navigator';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { usePermissions, WriteGate } from '@/features/auth/permissions';
import { cn, initials, pluralize } from '@/lib/utils';
import { useTaskAudit, useTaskOptions } from '../api';
import {
  accordionByClient,
  accordionByTask,
  auditFilterCount,
  auditHeadline,
  auditListKey,
  autoExpandedClients,
  cellDeadlines,
  cellSituationText,
  clientPending,
  clientProgress,
  monthClosesWith,
  parseAuditFilters,
  toAuditQuery,
  visibleClients,
  visibleColumns,
  writeAuditFilters,
  type AuditFilters,
  type AuditView,
} from '../audit-logic';
import { DUE_TONE_CLASS, shortDate, shortName } from '../due';
import { dateTimeBR } from '../format';
import { competenceName, deadlineTip, groupDeadlineInfo, periodLabel } from '../occurrence';
import { toggleClass, SummaryLabel } from '../components/tasks-summary';
import { OccurrenceCellControl } from '../components/matrix-cell';
import { NeutralIcon } from '../components/neutral-icon';
import { MemberPicker } from '../components/pickers';
import { useTaskSheetLinks } from '../task-links';
import { useCellStatus, type CellChangeContext } from '../use-cell-status';

/** Auditoria mensal (spec §11): the recurring tasks of a competence, by client (a list) or by task. */
export default function TaskAuditPage() {
  const [params, setParams] = useSearchParams();
  const options = useTaskOptions();
  const today = options.data?.today ?? todayISO();
  const filters = parseAuditFilters(params, today);
  const audit = useTaskAudit(toAuditQuery(filters));
  const data = audit.data;
  const monthLabel = formatMonthKey(filters.competence);
  const [announcement, setAnnouncement] = useState('');

  function update(patch: Partial<AuditFilters>) {
    setParams(writeAuditFilters(params, patch, today), { replace: true });
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Auditoria mensal"
        description={data ? auditHeadline(data.summary, monthLabel) : monthLabel}
        actions={
          <Tooltip content="Competência: mês em que o prazo legal cai">
            <div>
              <PeriodNavigator
                modes={['month']}
                value={{ mode: 'month', anchor: `${filters.competence}-01` }}
                onChange={(v) => update({ competence: v.anchor.slice(0, 7) })}
              />
            </div>
          </Tooltip>
        }
      />
      <AuditSummaryPanel summary={data?.summary} filters={filters} onChange={update} />
      <AuditToolbar filters={filters} options={options.data} onChange={update} />
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      <AuditContent data={data} loading={audit.isPending} error={audit.isError && !data ? audit.error : null} onRetry={() => audit.refetch()} filters={filters} options={options.data} today={today} onChange={update} announce={setAnnouncement} stale={audit.isPlaceholderData} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary (§11.1, item 2)
// ---------------------------------------------------------------------------

function AuditSummaryPanel({ summary: s, filters, onChange }: { summary: AuditMatrixResponse['summary'] | undefined; filters: AuditFilters; onChange: (p: Partial<AuditFilters>) => void }) {
  const live = s ? s.total - s.canceled : 0;
  const pct = s && live ? Math.round((s.done / live) * 100) : 0;
  const maxDept = Math.max(1, ...(s?.byDepartment.map((d) => d.total) ?? [1]));
  const skeleton = (w: string) => (
    <span className="mt-1 flex h-10 items-center">
      <Skeleton className={cn('h-7', w)} />
    </span>
  );
  return (
    <section aria-label="Resumo da competência" className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="min-w-0 p-4 sm:p-5">
          <SummaryLabel>Concluídas</SummaryLabel>
          {s ? (
            <span className="tabular mt-1 block text-[32px] leading-10 font-semibold tracking-tight text-fg lg:text-[28px] xl:text-[32px]">
              {s.done} <span className="text-kpi font-medium text-muted">de {live}</span>
            </span>
          ) : (
            skeleton('w-28')
          )}
          {s ? (
            <p className="mt-1 text-body-sm text-muted">
              {pct}% da competência{s.canceled ? ` · ${s.canceled} ${s.canceled === 1 ? 'cancelada' : 'canceladas'}` : ''}
            </p>
          ) : null}
        </div>
        <div className="min-w-0 border-l border-border p-4 sm:p-5">
          <button
            type="button"
            aria-pressed={filters.clients === 'pending'}
            aria-label={s ? `Pendências atrasadas: ${s.overduePending}. Mostrar os clientes com pendências.` : 'Pendências atrasadas'}
            onClick={() => onChange({ clients: filters.clients === 'pending' ? '' : 'pending' })}
            className={cn('-m-2 block w-[calc(100%+1rem)] p-2 text-left', toggleClass)}
          >
            <SummaryLabel>Pendências atrasadas</SummaryLabel>
            {s ? (
              <span className={cn('tabular mt-1 block text-kpi leading-10 font-semibold tracking-tight', s.overduePending > 0 ? 'text-danger' : 'text-fg')}>{s.overduePending}</span>
            ) : (
              skeleton('w-12')
            )}
          </button>
          {s ? (
            <p className="mt-1 text-body-sm text-muted">
              {s.overduePending > 0 ? `em ${s.overdueClients} ${s.overdueClients === 1 ? 'cliente' : 'clientes'}` : 'nada atrasado'}
              {s.targetMissedPending > 0 ? <span className="text-warning"> · {s.targetMissedPending} fora da meta</span> : null}
            </p>
          ) : null}
        </div>
        <div className="min-w-0 border-t border-border p-4 sm:p-5 md:border-t-0 md:border-l">
          <button
            type="button"
            aria-pressed={filters.clients === 'concluded'}
            aria-label={s ? `${s.clientsConcluded} de ${s.clientCount} clientes com o mês concluído. Filtrar.` : 'Clientes'}
            onClick={() => onChange({ clients: filters.clients === 'concluded' ? '' : 'concluded' })}
            className={cn('-m-2 block w-[calc(100%+1rem)] p-2 text-left', toggleClass)}
          >
            <SummaryLabel>Clientes</SummaryLabel>
            {s ? (
              <span className="mt-1 block leading-10 text-body-sm text-muted">
                <span className="tabular text-kpi font-semibold tracking-tight text-fg">{s.clientsConcluded}</span> de {s.clientCount} com o mês concluído
              </span>
            ) : (
              skeleton('w-32')
            )}
          </button>
          {s ? (
            <p className="mt-1 text-body-sm text-muted">
              {s.clientsWithPending > 0 ? (
                <button
                  type="button"
                  aria-pressed={filters.clients === 'pending'}
                  onClick={() => onChange({ clients: filters.clients === 'pending' ? '' : 'pending' })}
                  className={cn('-mx-1 px-1 font-medium text-brand-text underline decoration-border-strong underline-offset-4 hover:decoration-current', toggleClass)}
                >
                  {s.clientsWithPending} com pendências
                </button>
              ) : (
                'nenhum com pendências'
              )}
            </p>
          ) : null}
        </div>
        <div className="col-span-2 hidden min-w-0 border-t border-border p-4 sm:p-5 md:col-span-3 md:block lg:col-span-1 lg:border-t-0 lg:border-l">
          <SummaryLabel>Por departamento</SummaryLabel>
          {!s ? (
            <div className="mt-2 flex flex-col gap-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-4/5" />
            </div>
          ) : s.byDepartment.length === 0 ? (
            <p className="mt-1.5 text-body-sm text-muted">Nenhuma tarefa recorrente.</p>
          ) : (
            <ul className="-mx-2 mt-1 grid gap-x-4 md:grid-cols-2 lg:grid-cols-1">
              {s.byDepartment.map((d) => {
                const id = d.department?.id ?? '';
                const pressed = Boolean(id) && filters.department === id;
                return (
                  <li key={id || 'none'}>
                    <button
                      type="button"
                      disabled={!id}
                      aria-pressed={pressed}
                      aria-label={`${d.department?.name ?? 'Sem departamento'}: ${d.done} de ${d.total} concluídas`}
                      onClick={() => onChange({ department: pressed ? '' : id })}
                      className={cn('grid w-full grid-cols-[7.5rem_minmax(0,1fr)_3.5rem] items-center gap-x-2.5 px-2 py-1 text-left pointer-coarse:py-2', toggleClass)}
                    >
                      <span className={cn('truncate text-body-sm', d.department ? 'text-fg' : 'text-subtle', pressed && 'font-semibold')}>{d.department?.name ?? 'Sem departamento'}</span>
                      <span className="block h-1.5 overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
                        <span className="block h-full rounded-full bg-data" style={{ width: `${(d.done / Math.max(1, d.total)) * 100}%`, maxWidth: `${(d.total / maxDept) * 100}%` }} />
                      </span>
                      <span className="tabular text-right text-body-sm text-fg">
                        {d.done}/{d.total}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Toolbar (§11.1, item 3)
// ---------------------------------------------------------------------------

function AuditToolbar({ filters, options, onChange }: { filters: AuditFilters; options: TaskOptionsResponse | undefined; onChange: (p: Partial<AuditFilters>) => void }) {
  const [search, setSearch] = useState(filters.search);
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== filters.search) onChange({ search });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  useEffect(() => {
    if (!filters.search) setSearch('');
  }, [filters.search]);
  const count = auditFilterCount(filters);
  const clear = () => {
    setSearch('');
    onChange({ regime: '', department: '', assignee: '', clients: '', search: '' });
  };
  const view = (
    <SegmentedControl<AuditView>
      ariaLabel="Visão"
      value={filters.view}
      onChange={(v) => onChange({ view: v, search: '' })}
      options={[
        { value: 'client', label: 'Por cliente' },
        { value: 'task', label: 'Por tarefa' },
      ]}
      className="max-sm:flex max-sm:w-full"
      fullWidth={false}
    />
  );
  const placeholder = filters.view === 'client' ? 'Buscar cliente' : 'Buscar tarefa recorrente';
  const regime = (sm: boolean) => (
    <Select size_={sm ? 'sm' : 'md'} aria-label="Regime" value={filters.regime} onChange={(e) => onChange({ regime: e.target.value as TaxRegime | '' })}>
      <option value="">Todos os regimes</option>
      {TAX_REGIMES.map((r) => (
        <option key={r} value={r}>
          {TAX_REGIME_LABELS[r]}
        </option>
      ))}
    </Select>
  );
  const department = (sm: boolean) => (
    <Select size_={sm ? 'sm' : 'md'} aria-label="Departamento" value={filters.department} onChange={(e) => onChange({ department: e.target.value })}>
      <option value="">Todos os departamentos</option>
      {(options?.departments ?? []).map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </Select>
  );
  const assignee = (sm: boolean) => (
    <MemberPicker
      size_={sm ? 'sm' : 'md'}
      value={filters.assignee}
      onChange={(v) => onChange({ assignee: v })}
      members={options?.members ?? []}
      allowAll
      meFirst
      aria-label="Responsável"
    />
  );
  const clients = (sm: boolean) => (
    <Select size_={sm ? 'sm' : 'md'} aria-label="Clientes" value={filters.clients} onChange={(e) => onChange({ clients: e.target.value as AuditFilters['clients'] })}>
      <option value="">Todos os clientes</option>
      <option value="pending">Com pendências</option>
      <option value="concluded">Mês concluído</option>
    </Select>
  );
  return (
    <Card className="p-4">
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        {view}
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))_auto]">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-9 rounded-[10px] pl-9 text-[13px]" />
          </div>
          {regime(true)}
          {department(true)}
          {assignee(true)}
          {clients(true)}
          {count > 0 ? (
            <Button variant="ghost" size="sm" className="h-9" onClick={clear}>
              <X /> Limpar
            </Button>
          ) : (
            <span className="hidden lg:block" />
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:hidden">
        {view}
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar" aria-label={placeholder} className="h-9 rounded-[10px] pl-9 text-[13px]" />
          </div>
          <Button variant="outline" size="sm" className="h-9" onClick={() => setSheet(true)}>
            <SlidersHorizontal /> Filtros{count - (filters.search ? 1 : 0) > 0 ? ` (${count - (filters.search ? 1 : 0)})` : ''}
          </Button>
        </div>
      </div>
      <Sheet
        open={sheet}
        onOpenChange={setSheet}
        title="Filtros"
        description="Refine a auditoria da competência."
        footer={
          <>
            <Button variant="ghost" onClick={clear}>
              Limpar
            </Button>
            <Button onClick={() => setSheet(false)}>Ver auditoria</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Regime">{regime(false)}</Field>
          <Field label="Departamento">{department(false)}</Field>
          <Field label="Responsável">{assignee(false)}</Field>
          <Field label="Clientes">{clients(false)}</Field>
        </div>
      </Sheet>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Content: the client list ("Por cliente") and the task accordion ("Por tarefa")
// ---------------------------------------------------------------------------

interface ContentProps {
  data: AuditMatrixResponse | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  filters: AuditFilters;
  options: TaskOptionsResponse | undefined;
  today: string;
  onChange: (p: Partial<AuditFilters>) => void;
  announce: (text: string) => void;
  stale: boolean;
}

function AuditContent({ data, loading, error, onRetry, filters, options, today, onChange, announce, stale }: ContentProps) {
  const navigate = useNavigate();
  const isAdmin = usePermissions().can('registry');
  const monthName = competenceName(filters.competence).split(' ')[0]!;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading || !data) {
    return (
      <Card className="p-3">
        <SkeletonRows rows={6} />
      </Card>
    );
  }
  if (data.columns.length === 0 && data.clients.length === 0 && auditFilterCount(filters) === 0) {
    return (
      <EmptyState
        icon={<ClipboardCheck />}
        title="A auditoria começa pelas tarefas recorrentes"
        description={
          isAdmin
            ? 'Cadastre as obrigações do escritório e a quais clientes se aplicam; elas viram as colunas desta tela.'
            : 'Os administradores cadastram as obrigações do escritório e a quais clientes se aplicam; elas viram as colunas desta tela.'
        }
        action={
          <WriteGate scope="admin">
            <Button variant="outline" onClick={() => navigate('/tarefas/recorrentes?recorrente=nova')}>
              Cadastrar tarefas recorrentes
            </Button>
          </WriteGate>
        }
      />
    );
  }
  if (data.clients.length === 0 && auditFilterCount(filters) === 0) {
    return (
      <EmptyState
        icon={<Building2 />}
        title="Nenhum cliente ativo nesta competência"
        action={
          <Button variant="outline" onClick={() => navigate('/tarefas/clientes')}>
            Ir para Clientes
          </Button>
        }
      />
    );
  }
  const clients = visibleClients(data, filters);
  const columns = visibleColumns(data, filters);
  const empty = filters.view === 'client' ? clients.length === 0 : columns.length === 0;
  if (empty) {
    if (filters.clients === 'pending' && !filters.search)
      return <EmptyState icon={<CircleCheck />} title={`Nenhuma pendência em ${monthName}`} description="Todas as tarefas recorrentes da competência foram concluídas." />;
    if (filters.clients === 'concluded' && !filters.search)
      return (
        <EmptyState
          icon={<LockKeyhole />}
          title={`Nenhum cliente com o mês concluído em ${monthName}.`}
          description="O mês de um cliente fica concluído quando todas as tarefas recorrentes dele estão concluídas."
        />
      );
    return (
      <EmptyState
        icon={<SearchX />}
        title="Nenhum cliente encontrado para os filtros selecionados."
        action={
          <Button variant="outline" onClick={() => onChange({ regime: '', department: '', assignee: '', clients: '', search: '' })}>
            Limpar filtros
          </Button>
        }
      />
    );
  }
  const shared = { data, filters, options, today, announce, monthName };
  return (
    <div className={cn(stale && 'opacity-60 transition-opacity')}>
      {filters.view === 'client' ? (
        <AuditClientList {...shared} />
      ) : (
        <TaskAccordion {...shared} onExpand={(id) => onChange({ recurring: id })} />
      )}
    </div>
  );
}

interface SharedProps {
  data: AuditMatrixResponse;
  filters: AuditFilters;
  options: TaskOptionsResponse | undefined;
  today: string;
  announce: (text: string) => void;
  monthName: string;
}

/** Context of a status change: names for the toast and whether it closes the client's month. */
function changeContext(data: AuditMatrixResponse, column: AuditColumn, cell: OccurrenceCell, client: { name: string }, monthName: string, announce: (t: string) => void, status: string): CellChangeContext {
  const closes = status === 'done' && monthClosesWith(data.cells, cell);
  return { taskName: column.name, clientName: client.name, monthCloses: closes ? monthName.charAt(0).toUpperCase() + monthName.slice(1) : null, announce };
}

/** Lock of a concluded month, with the moment of the last conclusion. */
function MonthLock({ client, today }: { client: AuditClientRow; today: string }) {
  if (!client.monthConcludedAt) return null;
  return (
    <Tooltip content={`Mês concluído. Última conclusão em ${dateTimeBR(client.monthConcludedAt)}`}>
      <span role="img" tabIndex={-1} aria-label={`Mês concluído em ${shortDate(client.monthConcludedAt.slice(0, 10), today)}`} className="inline-flex shrink-0 text-muted">
        <LockKeyhole className="size-3.5" aria-hidden />
      </span>
    </Tooltip>
  );
}

/** Wide lists: what is left of the client's month, beside the bar ("2 atrasadas", "Mês concluído em 27/10"). */
function ClientMonthNote({ client, today }: { client: AuditClientRow; today: string }) {
  const pending = clientPending(client);
  const [text, tone] = client.monthConcludedAt
    ? [`Mês concluído em ${shortDate(client.monthConcludedAt.slice(0, 10), today)}`, 'text-muted']
    : client.overduePending > 0
      ? [`${client.overduePending} ${client.overduePending === 1 ? 'atrasada' : 'atrasadas'}`, 'font-medium text-danger']
      : client.targetMissedPending > 0
        ? [`${client.targetMissedPending} fora da meta`, 'font-medium text-warning']
        : pending > 0
          ? [`${pending} ${pending === 1 ? 'pendente' : 'pendentes'}`, 'text-muted']
          : ['', ''];
  return <span className={cn('hidden min-w-0 flex-1 truncate pl-4 text-right text-xs @3xl:block', tone)}>{text}</span>;
}

/**
 * "Por cliente" (§11.2, as a list in every width): each client in a row — the arrow that opens it,
 * the name, the bar of what is concluded in the competence with "N de M" — and, opened, the month's
 * obligations with their department, responsible, deadlines and the status control (the same cycle,
 * reopening and conclusion popover as before). Roving focus on the client rows: ↑/↓, Home/End move,
 * → opens, ← closes; inside, 1–3 set a status and Shift+Enter opens the task.
 */
function AuditClientList({ data, filters, today, announce, monthName }: SharedProps) {
  const items = accordionByClient(data, filters);
  const status = useCellStatus();
  const [open, setOpen] = useState<Set<string>>(() => new Set(autoExpandedClients(items.map((i) => i.client))));
  const [focus, setFocus] = useState(0);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const ids = items.map((i) => i.client.id).join('|');
  useEffect(() => {
    const auto = autoExpandedClients(items.map((i) => i.client));
    if (auto.length) setOpen((o) => new Set([...o, ...auto]));
    setFocus((f) => Math.min(f, Math.max(0, items.length - 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  const allOpen = items.length > 0 && items.every((i) => open.has(i.client.id));

  function toggle(id: string, value?: boolean) {
    setOpen((o) => {
      const next = new Set(o);
      if (value ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function onRowKey(e: KeyboardEvent<HTMLButtonElement>, index: number, id: string) {
    const action = auditListKey(e.key, index, items.length, open.has(id));
    if (!action) return;
    e.preventDefault();
    if (action.type === 'focus') {
      setFocus(action.index);
      rowRefs.current[action.index]?.focus();
    } else toggle(id, action.type === 'expand');
  }

  return (
    <Card className="@container overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <span className="text-xs font-medium text-muted">{pluralize(items.length, 'cliente', 'clientes')}</span>
        <span className="ml-auto hidden text-xs text-subtle @2xl:inline">↑ ↓ navegam · → abre · ← fecha</span>
        <Button variant="ghost" size="sm" className="-mr-2 h-8" onClick={() => setOpen(allOpen ? new Set() : new Set(items.map((i) => i.client.id)))}>
          <ChevronsUpDown /> {allOpen ? 'Recolher todos' : 'Expandir todos'}
        </Button>
      </div>
      <ul className="p-1.5" aria-label={`Clientes de ${monthName}`}>
        {items.map(({ client, items: cells }, index) => {
          const expanded = open.has(client.id);
          const progress = clientProgress(client);
          const regionId = `audit-client-${client.id}`;
          return (
            <li key={client.id} className={cn('rounded-lg', expanded && 'bg-surface-muted/50')}>
              <button
                ref={(el) => void (rowRefs.current[index] = el)}
                type="button"
                aria-expanded={expanded}
                aria-controls={regionId}
                aria-label={`${client.name}: ${progress.text} concluídas${client.overduePending ? `, ${client.overduePending} atrasadas` : ''}${client.monthConcludedAt ? ', mês concluído' : ''}. ${expanded ? 'Recolher' : 'Mostrar'} obrigações.`}
                tabIndex={index === focus ? 0 : -1}
                onFocus={() => setFocus(index)}
                onKeyDown={(e) => onRowKey(e, index, client.id)}
                onClick={() => toggle(client.id)}
                className="group/client flex min-h-14 w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @lg:gap-3 @lg:px-3"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors group-hover/client:bg-bg-subtle group-hover/client:text-fg" aria-hidden>
                  <ChevronRight className={cn('size-4 transition-transform duration-150', expanded && 'rotate-90')} />
                </span>
                <span className="min-w-0 flex-1 @3xl:w-80 @3xl:flex-none">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-fg">{client.name}</span>
                    <MonthLock client={client} today={today} />
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {TAX_REGIME_LABELS[client.taxRegime]}
                    <span className="hidden @md:inline">{client.document ? ` · ${formatCNPJ(client.document)}` : ''}</span>
                    <span className="@3xl:hidden">
                      {client.overduePending > 0 ? (
                        <span className="text-danger">
                          {' '}
                          · {client.overduePending} {client.overduePending === 1 ? 'atrasada' : 'atrasadas'}
                        </span>
                      ) : null}
                      {client.monthConcludedAt ? ` · concluído em ${shortDate(client.monthConcludedAt.slice(0, 10), today)}` : null}
                    </span>
                  </span>
                </span>
                <span className="flex w-28 shrink-0 items-center gap-2 @md:w-44 @3xl:w-60">
                  <span className="block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
                    <span className={cn('block h-full rounded-full', progress.ratio === 1 ? 'bg-success' : 'bg-data')} style={{ width: `${progress.ratio * 100}%` }} />
                  </span>
                  <span className="tabular w-14 shrink-0 text-right text-[13px] font-medium whitespace-nowrap text-fg">{progress.text}</span>
                </span>
                <ClientMonthNote client={client} today={today} />
              </button>
              {expanded ? (
                <div id={regionId} role="region" aria-label={`Obrigações de ${client.name} em ${monthName}`} className="pb-2 @lg:pl-10">
                  {cells.length === 0 ? (
                    <p className="px-3 py-2 text-body-sm text-muted">{filters.clients === 'pending' ? 'Nenhuma pendência deste cliente.' : 'Nenhuma obrigação nesta competência.'}</p>
                  ) : (
                    <>
                      <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_16.5rem] items-center gap-3 px-3 pt-1 pb-1.5 text-xs font-medium text-muted @4xl:grid">
                        <span>Obrigação</span>
                        <span>Departamento</span>
                        <span>Responsável</span>
                        <span>Prazo</span>
                        <span>Situação</span>
                      </div>
                      <ul>
                        {cells.map(({ column, cell }) => (
                          <ClientObligationRow
                            key={cell.taskId}
                            cell={cell}
                            column={column}
                            client={client}
                            data={data}
                            today={today}
                            monthName={monthName}
                            announce={announce}
                            status={status}
                            dimmed={Boolean(filters.assignee) && cell.assignee?.id !== filters.assignee}
                          />
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

interface ClientObligationRowProps {
  cell: OccurrenceCell;
  column: AuditColumn;
  client: AuditClientRow;
  data: AuditMatrixResponse;
  today: string;
  monthName: string;
  announce: (t: string) => void;
  status: ReturnType<typeof useCellStatus>;
  dimmed: boolean;
}

/** An obligation of the opened client: name (opens the task), department, responsible, deadlines, status. */
function ClientObligationRow({ cell, column, client, data, today, monthName, announce, status, dimmed }: ClientObligationRowProps) {
  const { openTask } = useTaskSheetLinks();
  const { canWriteTasks } = usePermissions();
  const dl = cellDeadlines(cell, today);
  const period = column.period === 'weekly' ? periodLabel(column, today) : column.period !== 'monthly' ? RECURRENCE_PERIOD_LABELS[column.period] : null;
  const who = cell.assignee ? shortName(cell.assignee.name) : 'Sem responsável';
  const control = canWriteTasks ? (
    <OccurrenceCellControl
      cell={cell}
      taskName={column.name}
      clientName={client.name}
      periodName={periodLabel(column, today)}
      department={column.department?.name ?? null}
      busy={status.isBusy(cell.taskId)}
      dimmed={dimmed}
      large
      onChange={(s) => void status.change(cell, s, changeContext(data, column, cell, client, monthName, announce, s))}
      onReopen={(reason, s) => status.change(cell, s, changeContext(data, column, cell, client, monthName, announce, s), { reason })}
      onOpenTask={() => openTask(cell.taskId)}
    />
  ) : (
    <span className="inline-flex size-10 shrink-0 items-center justify-center">
      <ReadOnlyCell cell={cell} />
    </span>
  );
  return (
    <li className={cn('flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface @4xl:grid @4xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_16.5rem]', dimmed && 'opacity-70')}>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => openTask(cell.taskId)} className="flex max-w-full items-center gap-1.5 text-left text-sm font-semibold text-fg hover:underline">
          <span className="truncate">{column.name}</span>
          {period ? <span className="shrink-0 text-xs font-normal text-muted">{period}</span> : null}
        </button>
        <p className="truncate text-xs text-muted @4xl:hidden">
          {column.department?.name ?? 'Sem departamento'} · {who}
        </p>
        <p className="truncate text-xs @4xl:hidden">
          <span className="text-muted">{dl.dates}</span>
          {dl.status && dl.status.tone !== 'muted' ? <span className={DUE_TONE_CLASS[dl.status.tone]}> · {dl.status.text}</span> : null}
        </p>
        <p className="truncate text-xs text-muted @4xl:hidden">{cellSituationText(cell, today)}</p>
      </div>
      <span className="hidden truncate text-body-sm text-fg @4xl:block">{column.department?.name ?? <span className="text-subtle">Sem departamento</span>}</span>
      <span className="hidden min-w-0 items-center gap-2 @4xl:flex">
        <MemberAvatar name={cell.assignee?.name} unassigned={!cell.assignee} userId={cell.assignee?.id} />
        <span className={cn('truncate text-body-sm', cell.assignee ? 'text-fg' : 'text-subtle')}>{who}</span>
      </span>
      <span className="hidden min-w-0 @4xl:block">
        <Tooltip content={deadlineTip(cell, today)}>
          <span tabIndex={-1} className="tabular block truncate text-body-sm text-fg">
            {dl.dates}
          </span>
        </Tooltip>
        {dl.status && dl.status.tone !== 'muted' ? <span className={cn('block truncate text-xs', DUE_TONE_CLASS[dl.status.tone])}>{dl.status.text}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-2.5 @4xl:min-w-0">
        {control}
        <span className="hidden min-w-0 truncate text-[13px] text-muted @4xl:block">{cellSituationText(cell, today)}</span>
      </span>
    </li>
  );
}

function ReadOnlyCell({ cell }: { cell: OccurrenceCell }) {
  return <span className="text-caption text-muted">{cell.status === 'done' ? `✓ ${initials(cell.concludedBy?.name)}` : '·'}</span>;
}

/** "Por tarefa" (§11.3): each recurring task, opened to show its clients. */
function TaskAccordion({ data, filters, options, today, announce, monthName, onExpand }: SharedProps & { onExpand: (id: string) => void }) {
  const items = accordionByTask(data, filters);
  const [open, setOpen] = useState<Set<string>>(() => new Set(filters.recurring ? items.filter((i) => i.column.recurringTaskId === filters.recurring).map((i) => `${i.column.recurringTaskId}:${i.column.periodKey}`) : []));
  const refs = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    if (!filters.recurring) return;
    const key = items.find((i) => i.column.recurringTaskId === filters.recurring);
    if (!key) return;
    const k = `${key.column.recurringTaskId}:${key.column.periodKey}`;
    setOpen((o) => new Set(o).add(k));
    requestAnimationFrame(() => refs.current.get(k)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.recurring, data.competence]);

  return (
    <Card className="@container overflow-hidden p-1.5">
      <ul>
        {items.map(({ column: col, cells }) => {
          const k = `${col.recurringTaskId}:${col.periodKey}`;
          const expanded = open.has(k);
          const live = col.total - col.canceled;
          const dl = groupDeadlineInfo(col, today, true);
          const regionId = `audit-task-${k}`;
          return (
            <li key={k} ref={(el) => void (el ? refs.current.set(k, el) : refs.current.delete(k))} className="scroll-mt-24">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={regionId}
                onClick={() => {
                  setOpen((o) => {
                    const next = new Set(o);
                    if (next.has(k)) next.delete(k);
                    else next.add(k);
                    return next;
                  });
                  if (!expanded) onExpand(col.recurringTaskId);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-surface-muted @lg:px-4"
              >
                <span className="hidden @sm:contents">
                  <NeutralIcon icon={Repeat} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-fg">{col.name}</span>
                    {col.period !== 'monthly' ? <Badge tone="neutral">{RECURRENCE_PERIOD_LABELS[col.period]}</Badge> : null}
                    {col.period === 'weekly' ? <span className="shrink-0 text-xs text-muted">{periodLabel(col, today)}</span> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {[col.department?.name, col.defaultAssignee ? `padrão: ${shortName(col.defaultAssignee.name)}` : null].filter(Boolean).join(' · ') || 'Sem departamento'}
                  </span>
                  <span className={cn('mt-0.5 block truncate text-xs @xl:hidden', DUE_TONE_CLASS[groupDeadlineInfo(col, today).tone])}>{groupDeadlineInfo(col, today).text}</span>
                </span>
                <span className="flex w-24 shrink-0 flex-col items-end gap-1 @sm:w-28">
                  <span className="tabular text-[13px] font-medium text-fg">
                    {col.done}/{live}
                  </span>
                  <span className="block h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
                    <span className="block h-full rounded-full bg-data" style={{ width: `${(col.done / Math.max(1, live)) * 100}%` }} />
                  </span>
                </span>
                <span className="hidden w-40 text-right @xl:block">
                  <span className="tabular block text-[13px] font-medium text-fg">{shortDate(col.targetDate, today)}</span>
                  <span className={cn('block truncate text-xs', DUE_TONE_CLASS[dl.tone])}>{dl.text}</span>
                </span>
                <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform duration-150', expanded && 'rotate-180')} aria-hidden />
              </button>
              {expanded ? (
                <div id={regionId} role="region" aria-label={`Clientes de ${col.name}`} className="mb-2 ml-0 border-l-0 @sm:ml-8">
                  {cells.length === 0 ? (
                    <p className="px-3 py-3 text-body-sm text-muted">Nenhum cliente {filters.clients === 'pending' ? 'pendente' : 'nesta tarefa'}.</p>
                  ) : (
                    <ul>
                      {cells.map((cell) => (
                        <AccordionCellRow
                          key={cell.taskId}
                          cell={cell}
                          column={col}
                          client={cell.client}
                          title={cell.client.name}
                          subtitle={TAX_REGIME_LABELS[cell.client.taxRegime]}
                          locked={Boolean(cell.client.monthConcludedAt)}
                          data={data}
                          today={today}
                          monthName={monthName}
                          announce={announce}
                          dimmed={Boolean(filters.assignee) && cell.assignee?.id !== filters.assignee}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

interface AccordionCellRowProps {
  cell: OccurrenceCell;
  column: AuditColumn;
  client: AuditClientRow;
  title: string;
  subtitle: ReactNode;
  locked?: boolean;
  showDeadline?: boolean;
  data: AuditMatrixResponse;
  today: string;
  monthName: string;
  announce: (t: string) => void;
  dimmed: boolean;
}

/** One line of an accordion: the 40px cell, the name (opens the occurrence), the responsible, the conclusion. */
function AccordionCellRow({ cell, column, client, title, subtitle, locked, showDeadline, data, today, monthName, announce, dimmed }: AccordionCellRowProps) {
  const status = useCellStatus();
  const { openTask } = useTaskSheetLinks();
  const { canWriteTasks } = usePermissions();
  const dl = groupDeadlineInfo({ legalDueDate: cell.legalDueDate, targetDate: cell.targetDate, pending: cell.status === 'done' || cell.status === 'canceled' ? 0 : 1 }, today);
  return (
    <li className="flex min-h-[52px] items-center gap-3 rounded-lg px-3 py-1.5 hover:bg-surface-muted">
      {canWriteTasks ? (
        <OccurrenceCellControl
          cell={cell}
          taskName={column.name}
          clientName={client.name}
          periodName={periodLabel(column, today)}
          department={column.department?.name ?? null}
          busy={status.isBusy(cell.taskId)}
          dimmed={dimmed}
          large
          onChange={(s) => void status.change(cell, s, changeContext(data, column, cell, client, monthName, announce, s))}
          onReopen={(reason, s) => status.change(cell, s, changeContext(data, column, cell, client, monthName, announce, s), { reason })}
          onOpenTask={() => openTask(cell.taskId)}
        />
      ) : (
        <span className="inline-flex size-10 items-center justify-center">
          <ReadOnlyCell cell={cell} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => openTask(cell.taskId)} className="flex max-w-full items-center gap-1 truncate text-left text-sm font-semibold text-fg hover:underline">
          {locked ? <LockKeyhole className="size-3 shrink-0 text-muted" aria-label="Mês concluído" /> : null}
          <span className="truncate">{title}</span>
        </button>
        <p className="truncate text-xs text-muted">
          {subtitle}
          {subtitle ? ' · ' : ''}
          {cell.assignee ? shortName(cell.assignee.name) : 'Sem responsável'}
        </p>
        {showDeadline ? <p className={cn('truncate text-xs sm:hidden', DUE_TONE_CLASS[dl.tone])}>{dl.text}</p> : null}
        {cell.status === 'done' && cell.concludedAt ? (
          <p className="truncate text-mini text-muted">
            Concluída{cell.concludedBy ? ` por ${shortName(cell.concludedBy.name)}` : ''} em {dateTimeBR(cell.concludedAt).replace(/\/\d{4} às /, ', ')}
          </p>
        ) : null}
      </div>
      <span className="hidden w-32 min-w-0 items-center gap-2 sm:flex">
        <MemberAvatar name={cell.assignee?.name} unassigned={!cell.assignee} userId={cell.assignee?.id} />
        <span className={cn('truncate text-[13px]', cell.assignee ? 'text-fg' : 'text-subtle')}>{cell.assignee ? shortName(cell.assignee.name) : 'Sem responsável'}</span>
      </span>
      {showDeadline ? <span className={cn('hidden w-40 shrink-0 truncate text-right text-xs sm:block', DUE_TONE_CLASS[dl.tone])}>{dl.text}</span> : null}
    </li>
  );
}
