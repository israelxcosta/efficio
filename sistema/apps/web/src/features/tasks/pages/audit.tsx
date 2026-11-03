import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Building2, ChevronDown, CircleCheck, ClipboardCheck, LockKeyhole, Repeat, Search, SearchX, SlidersHorizontal, X } from 'lucide-react';
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
import { cn, initials } from '@/lib/utils';
import { useTaskAudit, useTaskOptions } from '../api';
import {
  accordionByClient,
  accordionByTask,
  auditFilterCount,
  auditHeadline,
  cellKey,
  clientPending,
  columnDeadline,
  indexCells,
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
import { competenceName, groupDeadlineInfo, periodLabel } from '../occurrence';
import { toggleClass, SummaryLabel } from '../components/tasks-summary';
import { NotApplicableCell, OccurrenceCellControl } from '../components/matrix-cell';
import { NeutralIcon } from '../components/neutral-icon';
import { MemberPicker } from '../components/pickers';
import { useTaskSheetLinks } from '../task-links';
import { useCellStatus, type CellChangeContext } from '../use-cell-status';

/** Auditoria mensal (spec §11): the client × recurring task matrix of a competence. */
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
// Content: matrix (≥1024px) and accordions
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
  const { isAdmin } = usePermissions();
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
        <>
          <div className="hidden lg:block">
            <AuditMatrix {...shared} clients={clients} columns={data.columns} />
          </div>
          <div className="lg:hidden">
            <ClientAccordion {...shared} />
          </div>
        </>
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

/** Last column of the matrix (§11.2): the client's month, "7/9" or the lock with the date. */
function ClientMonthCell({ client, today }: { client: AuditClientRow; today: string }) {
  const live = client.total - client.canceled;
  if (client.monthConcludedAt) {
    const day = shortDate(client.monthConcludedAt.slice(0, 10), today);
    return (
      <Tooltip content={`Última conclusão em ${dateTimeBR(client.monthConcludedAt)}`}>
        <span className="flex flex-col items-center gap-0.5 text-caption text-muted" tabIndex={-1}>
          <LockKeyhole className="size-3.5" aria-hidden />
          <span>Concluído em {day}</span>
        </span>
      </Tooltip>
    );
  }
  return (
    <span className="flex flex-col items-center gap-1">
      <span className="tabular text-[13px] font-medium text-fg">
        {client.done}/{live}
      </span>
      <span className="block h-1.5 w-12 overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
        <span className="block h-full rounded-full bg-data" style={{ width: `${(client.done / Math.max(1, live)) * 100}%` }} />
      </span>
    </span>
  );
}

/**
 * The matrix (§11.2): clients in rows (sticky name column), one column per recurring task and period
 * (sticky header with the column's deadline), the client's month at the right. Roving focus: one cell
 * is in the tab order; arrows, Home/End and Ctrl+Home move it.
 */
function AuditMatrix({ data, clients, columns, filters, options, today, announce, monthName }: SharedProps & { clients: AuditClientRow[]; columns: AuditColumn[] }) {
  const index = useMemo(() => indexCells(data.cells), [data.cells]);
  const status = useCellStatus();
  const { openTask } = useTaskSheetLinks();
  const navigate = useNavigate();
  const { canWriteTasks } = usePermissions();
  const [focus, setFocus] = useState<[number, number]>([0, 0]);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const gridRef = useRef<HTMLTableElement>(null);
  const periodName = (c: AuditColumn) => periodLabel(c, today);

  function focusCell(r: number, c: number, dr: number, dc: number) {
    let row = r;
    let col = c;
    for (let i = 0; i < clients.length * columns.length; i++) {
      if (row < 0 || row >= clients.length || col < 0 || col >= columns.length) return;
      const el = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${row}:${col}"] button`);
      if (el) {
        setFocus([row, col]);
        el.focus();
        return;
      }
      row += dr;
      col += dc;
      if (dr === 0 && dc === 0) return;
    }
  }

  function onNavKey(e: KeyboardEvent<HTMLButtonElement>, r: number, c: number) {
    const keys: Record<string, [number, number, number, number]> = {
      ArrowRight: [r, c + 1, 0, 1],
      ArrowLeft: [r, c - 1, 0, -1],
      ArrowDown: [r + 1, c, 1, 0],
      ArrowUp: [r - 1, c, -1, 0],
      Home: e.ctrlKey ? [0, 0, 0, 1] : [r, 0, 0, 1],
      End: [r, columns.length - 1, 0, -1],
    };
    const move = keys[e.key];
    if (!move) return;
    e.preventDefault();
    focusCell(...move);
  }

  return (
    <Card className="overflow-hidden">
      <div className="scrollbar-thin max-h-[calc(100dvh-14rem)] min-h-64 overflow-auto" onScroll={(e) => setScrolled((e.currentTarget as HTMLElement).scrollLeft > 0)}>
        <table
          ref={gridRef}
          role="grid"
          aria-rowcount={clients.length + 1}
          aria-colcount={columns.length + 2}
          aria-label={`Auditoria de ${monthName}`}
          className="min-w-full table-fixed border-separate border-spacing-0 text-left"
          style={{ width: 264 + columns.length * 104 + 104 }}
        >
          <colgroup>
            <col style={{ width: 264 }} />
            {columns.map((col) => (
              <col key={`${col.recurringTaskId}:${col.periodKey}`} style={{ width: 104 }} />
            ))}
            <col style={{ width: 104 }} />
          </colgroup>
          <thead>
            <tr>
              <th
                role="columnheader"
                scope="col"
                className={cn('sticky top-0 left-0 z-30 h-[72px] w-[264px] min-w-[264px] border-b border-border bg-surface px-4 text-xs font-medium text-muted', scrolled && 'border-r border-r-border-strong')}
              >
                Cliente
              </th>
              {columns.map((col, ci) => {
                const dl = columnDeadline(col, today);
                return (
                  <th
                    key={`${col.recurringTaskId}:${col.periodKey}`}
                    role="columnheader"
                    scope="col"
                    className={cn('sticky top-0 z-20 h-[72px] border-b border-border bg-surface px-1.5 py-2 align-top font-normal transition-colors', hoverCol === ci && 'bg-surface-muted')}
                  >
                    <Tooltip
                      content={`${col.name}${col.department ? ` · ${col.department.name}` : ''}${col.defaultAssignee ? ` · padrão: ${col.defaultAssignee.name}` : ''}${col.period !== 'weekly' ? ` · ref. ${col.referenceMonth.slice(5, 7)}/${col.referenceMonth.slice(0, 4)}` : ''}`}
                    >
                      <span className="line-clamp-2 text-caption font-semibold text-fg" tabIndex={-1}>
                        {col.name}
                      </span>
                    </Tooltip>
                    {col.period === 'weekly' ? <span className="block truncate text-mini text-muted">{periodLabel(col, today)}</span> : null}
                    <span className={cn('line-clamp-2 block text-mini leading-tight', DUE_TONE_CLASS[dl.tone])} title={dl.text}>
                      {dl.text}
                    </span>
                    <span className="tabular block text-mini text-muted">
                      {col.done}/{col.total - col.canceled}
                    </span>
                  </th>
                );
              })}
              <th role="columnheader" scope="col" className="sticky top-0 right-0 z-30 h-[72px] w-[104px] min-w-[104px] border-b border-l border-border bg-surface px-2 text-center text-xs font-medium text-muted">
                Mês do cliente
              </th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client, ri) => (
              <tr key={client.id} className="group/row">
                <th
                  role="rowheader"
                  scope="row"
                  className={cn('sticky left-0 z-10 h-[52px] w-[264px] min-w-[264px] border-b border-border bg-surface px-4 py-1.5 text-left font-normal group-hover/row:bg-surface-muted', scrolled && 'border-r border-r-border-strong')}
                >
                  <button type="button" onClick={() => navigate(`/tarefas/clientes?cliente=${client.id}`)} className="block max-w-[232px] truncate text-sm font-semibold text-fg hover:underline">
                    {client.name}
                  </button>
                  <span className="tabular block max-w-[232px] truncate text-xs text-muted">
                    {TAX_REGIME_LABELS[client.taxRegime]}
                    {client.document ? ` · ${formatCNPJ(client.document)}` : ''}
                  </span>
                </th>
                {columns.map((col, ci) => {
                  const cell = index.get(cellKey(client.id, col));
                  return (
                    <td
                      key={`${col.recurringTaskId}:${col.periodKey}`}
                      role="gridcell"
                      data-cell={cell ? `${ri}:${ci}` : undefined}
                      className="h-[52px] border-b border-border text-center group-hover/row:bg-surface-muted"
                      onMouseEnter={() => setHoverCol(ci)}
                      onMouseLeave={() => setHoverCol(null)}
                    >
                      {!cell ? (
                        <NotApplicableCell />
                      ) : canWriteTasks ? (
                        <OccurrenceCellControl
                          cell={cell}
                          taskName={col.name}
                          clientName={client.name}
                          periodName={periodName(col)}
                          department={col.department?.name ?? null}
                          busy={status.isBusy(cell.taskId)}
                          dimmed={Boolean(filters.assignee) && cell.assignee?.id !== filters.assignee}
                          tabIndex={focus[0] === ri && focus[1] === ci ? 0 : -1}
                          onFocus={() => {
                            setFocus([ri, ci]);
                            setHoverCol(ci);
                          }}
                          onNavKey={(e) => onNavKey(e, ri, ci)}
                          onChange={(s) => void status.change(cell, s, changeContext(data, col, cell, client, monthName, announce, s))}
                          onReopen={(reason, s) => status.change(cell, s, changeContext(data, col, cell, client, monthName, announce, s), { reason })}
                          onOpenTask={() => openTask(cell.taskId)}
                        />
                      ) : (
                        <ReadOnlyCell cell={cell} />
                      )}
                    </td>
                  );
                })}
                <td className="sticky right-0 z-10 h-[52px] border-b border-l border-border bg-surface text-center group-hover/row:bg-surface-muted">
                  <ClientMonthCell client={client} today={today} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
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

/** "Por cliente" below 1024px (§11.4): each client with its recurring tasks. */
function ClientAccordion({ data, filters, today, announce, monthName }: SharedProps) {
  const items = accordionByClient(data, filters);
  const [open, setOpen] = useState<Set<string>>(new Set());
  return (
    <Card className="@container overflow-hidden p-1.5">
      <ul>
        {items.map(({ client, items: cells }) => {
          const expanded = open.has(client.id);
          const live = client.total - client.canceled;
          const regionId = `audit-client-${client.id}`;
          return (
            <li key={client.id}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={regionId}
                onClick={() =>
                  setOpen((o) => {
                    const next = new Set(o);
                    if (next.has(client.id)) next.delete(client.id);
                    else next.add(client.id);
                    return next;
                  })
                }
                className="flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-muted"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-soft-fg" aria-hidden>
                  {initials(client.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-fg">{client.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {TAX_REGIME_LABELS[client.taxRegime]} · {client.done} de {live}
                    {clientPending(client) > 0 && client.overduePending > 0 ? <span className="text-danger"> · {client.overduePending} atrasada{client.overduePending === 1 ? '' : 's'}</span> : null}
                  </span>
                </span>
                {client.monthConcludedAt ? (
                  <span className="flex shrink-0 items-center gap-1 text-caption text-muted">
                    <LockKeyhole className="size-3.5" aria-hidden /> Concluído em {shortDate(client.monthConcludedAt.slice(0, 10), today)}
                  </span>
                ) : (
                  <span className="block h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-bg-subtle @sm:w-16" aria-hidden>
                    <span className="block h-full rounded-full bg-data" style={{ width: `${(client.done / Math.max(1, live)) * 100}%` }} />
                  </span>
                )}
                <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform duration-150', expanded && 'rotate-180')} aria-hidden />
              </button>
              {expanded ? (
                <div id={regionId} role="region" aria-label={`Tarefas recorrentes de ${client.name}`} className="mb-2">
                  <ul>
                    {cells.map(({ column, cell }) => (
                      <AccordionCellRow
                        key={cell.taskId}
                        cell={cell}
                        column={column}
                        client={client}
                        title={column.name}
                        subtitle={[column.department?.name, column.period === 'weekly' ? periodLabel(column, today) : null].filter(Boolean).join(' · ')}
                        showDeadline
                        data={data}
                        today={today}
                        monthName={monthName}
                        announce={announce}
                        dimmed={Boolean(filters.assignee) && cell.assignee?.id !== filters.assignee}
                      />
                    ))}
                  </ul>
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
        <MemberAvatar name={cell.assignee?.name} unassigned={!cell.assignee} />
        <span className={cn('truncate text-[13px]', cell.assignee ? 'text-fg' : 'text-subtle')}>{cell.assignee ? shortName(cell.assignee.name) : 'Sem responsável'}</span>
      </span>
      {showDeadline ? <span className={cn('hidden w-40 shrink-0 truncate text-right text-xs sm:block', DUE_TONE_CLASS[dl.tone])}>{dl.text}</span> : null}
    </li>
  );
}
