import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { CalendarDays, ClipboardCheck, Copy, Ellipsis, Eye, Pencil, Plus, Power, Repeat, Search, SearchX, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  RECURRENCE_PERIOD_LABELS,
  TAX_REGIME_LABELS,
  TAX_REGIMES,
  todayISO,
  type RecurrencePeriod,
  type RecurringTask,
  type TaskOptionsResponse,
  type TaxRegime,
} from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CategoryIcon } from '@/components/ui/category-icon';
import { ConfirmDialog } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/input';
import { AvatarStack, MemberAvatar } from '@/components/ui/member-avatar';
import { ErrorState, PageHeader } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { ADMIN_ONLY_REASON, SUBSCRIPTION_REASON, usePermissions, WriteGate } from '@/features/auth/permissions';
import { ApiRequestError } from '@/lib/api';
import { toastError } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { recurringInputOf, useDeleteRecurring, useRecurringTask, useRecurringTasks, useSaveRecurring, useTaskOptions } from '../api';
import { shortName } from '../due';
import { competenceName } from '../occurrence';
import {
  appliesToText,
  distributionTip,
  dueRuleText,
  endedLabel,
  parseRecurringFilters,
  recurringFilterCount,
  targetRuleText,
  toRecurringQuery,
  writeRecurringFilters,
  type RecurringFilters,
} from '../recurring-rules';
import { NeutralIcon } from '../components/neutral-icon';
import { MemberPicker } from '../components/pickers';
import { EndRecurringDialog, RecurringTaskSheet } from '../components/recurring-sheet';

const CALENDAR_HREF = '/tarefas?escopo=todas&tipo=recorrentes&visao=calendario';

/** Tarefas recorrentes (spec §10): the office's obligations, who does them and how the month is going. */
export default function RecurringTasksPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const options = useTaskOptions();
  const today = options.data?.today ?? todayISO();
  const month = today.slice(0, 7);
  const filters = parseRecurringFilters(params);
  const list = useRecurringTasks(toRecurringQuery(filters, month));
  const { isAdmin, canManage } = usePermissions();
  const [ending, setEnding] = useState<RecurringTask | null>(null);
  const [reactivating, setReactivating] = useState<RecurringTask | null>(null);
  const [deleting, setDeleting] = useState<RecurringTask | null>(null);
  const [duplicating, setDuplicating] = useState<RecurringTask | null>(null);
  const save = useSaveRecurring();
  const remove = useDeleteRecurring();
  const data = list.data;
  const count = recurringFilterCount(filters);
  // The registry open from the URL: from the list when there, else fetched (a link from elsewhere).
  const openId = filters.open && filters.open !== 'nova' ? filters.open : null;
  const fromList = data?.items.find((r) => r.id === openId);
  const fetched = useRecurringTask(openId && !fromList ? openId : null, month);
  const openRecurring = fromList ?? fetched.data ?? null;

  function update(patch: Partial<RecurringFilters>) {
    setParams(writeRecurringFilters(params, patch), { replace: true });
  }

  const monthName = competenceName(month).split(' ')[0];
  const description = data
    ? `${data.summary.active} ${data.summary.active === 1 ? 'ativa' : 'ativas'} · ${monthName}: ${data.summary.occurrences.done} de ${data.summary.occurrences.total - data.summary.occurrences.canceled} concluídas${isAdmin ? '' : ` · ${ADMIN_ONLY_REASON}`}`
    : isAdmin
      ? 'Obrigações que se repetem, por departamento e cliente.'
      : ADMIN_ONLY_REASON;

  const emptyAll = data && data.items.length === 0 && count === 0 && data.summary.active + data.summary.ended === 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Tarefas recorrentes"
        description={description}
        actions={
          <>
            <Button variant="outline" className="max-sm:hidden" onClick={() => navigate(CALENDAR_HREF)}>
              <CalendarDays /> Ver no calendário
            </Button>
            <WriteGate scope="admin">
              <Button onClick={() => update({ open: 'nova' })}>
                <Plus /> Nova tarefa recorrente
              </Button>
            </WriteGate>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="sm:hidden" aria-label="Mais ações">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem icon={<CalendarDays />} onSelect={() => navigate(CALENDAR_HREF)}>
                  Ver no calendário
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {emptyAll ? null : (
        <RecurringFiltersBar filters={filters} options={options.data} counts={data?.summary} onChange={update} />
      )}

      <Card className="@container overflow-hidden">
        {emptyAll ? null : (
          <div className="hidden items-center gap-3 border-b border-border px-5.5 py-2.5 text-xs font-medium text-muted @xl:flex">
            <span className="w-10" aria-hidden />
            <span className="flex-1">Tarefa recorrente</span>
            <span className="hidden w-32 @3xl:block">Departamento</span>
            <span className="hidden w-44 @4xl:block">Aplica-se a</span>
            <span className="hidden w-36 @2xl:block">Responsáveis</span>
            <span className="w-36">{monthName!.charAt(0).toUpperCase() + monthName!.slice(1)}</span>
            <span className="w-52 text-right">Prazo legal e meta</span>
            <span className="w-8" aria-hidden />
          </div>
        )}
        <div className="p-1.5">
          {list.isPending ? (
            <SkeletonRows rows={6} className="p-3" />
          ) : list.isError && !data ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} className="m-3" />
          ) : data!.items.length === 0 ? (
            emptyAll ? (
              <EmptyState
                className="m-3"
                icon={<Repeat />}
                title="Nenhuma tarefa recorrente"
                description={`${isAdmin ? 'Cadastre' : 'Os administradores cadastram'} as obrigações que se repetem (DAS, DCTFWeb, folha), o departamento que cuida delas e a quais clientes se aplicam. Elas aparecem na auditoria mensal e nas tarefas de cada responsável.`}
                action={
                  <WriteGate scope="admin">
                    <Button variant="outline" onClick={() => update({ open: 'nova' })}>
                      Nova tarefa recorrente
                    </Button>
                  </WriteGate>
                }
              />
            ) : count > 0 ? (
              <EmptyState
                className="m-3"
                icon={<SearchX />}
                title="Nenhuma tarefa recorrente com esses filtros"
                action={
                  <Button variant="outline" onClick={() => update({ search: '', period: '', department: '', assignee: '', regime: '' })}>
                    Limpar filtros
                  </Button>
                }
              />
            ) : (
              <EmptyState className="m-3" icon={<Repeat />} title={filters.status === 'ended' ? 'Nenhuma tarefa recorrente encerrada.' : 'Nenhuma tarefa recorrente ativa.'} />
            )
          ) : (
            <ul className={cn(list.isPlaceholderData && 'opacity-60 transition-opacity')}>
              {data!.items.map((r) => (
                <li key={r.id}>
                  <RecurringRow
                    recurring={r}
                    monthName={monthName!}
                    canEdit={canManage}
                    canDelete={isAdmin}
                    onOpen={() => update({ open: r.id })}
                    onDuplicate={() => setDuplicating(r)}
                    onEnd={() => setEnding(r)}
                    onReactivate={() => setReactivating(r)}
                    onDelete={() => setDeleting(r)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <RecurringTaskSheet
        open={Boolean(filters.open) || duplicating !== null}
        onOpenChange={(o) => {
          if (o) return;
          setDuplicating(null);
          if (filters.open) update({ open: '' });
        }}
        recurring={duplicating ?? (filters.open === 'nova' ? null : openRecurring)}
        duplicate={duplicating !== null}
        loading={Boolean(openId) && !openRecurring && !duplicating}
        options={options.data}
        canEdit={canManage}
        readOnlyReason={isAdmin ? SUBSCRIPTION_REASON : ADMIN_ONLY_REASON}
      />
      <EndRecurringDialog recurring={ending} current={month} onOpenChange={(o) => !o && setEnding(null)} />
      <ConfirmDialog
        open={reactivating !== null}
        onOpenChange={(o) => !o && setReactivating(null)}
        tone="primary"
        title={`Reativar “${reactivating?.name ?? ''}”?`}
        description={`Ela volta a gerar tarefas a partir de ${competenceName(month)}.`}
        confirmLabel="Reativar"
        loading={save.isPending}
        onConfirm={async () => {
          if (!reactivating) return;
          try {
            await save.mutateAsync({ id: reactivating.id, input: recurringInputOf(reactivating, { endCompetence: null }) });
            toast.success(`${reactivating.name} reativada.`);
            setReactivating(null);
          } catch (error) {
            toastError(error);
          }
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Excluir “${deleting?.name ?? ''}”?`}
        description="Ela ainda não gerou tarefas. Esta ação não pode ser desfeita."
        confirmLabel="Excluir tarefa recorrente"
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            toast.success('Tarefa recorrente excluída.');
            setDeleting(null);
          } catch (error) {
            if (error instanceof ApiRequestError && error.status === 409) toast.error('Esta tarefa recorrente já gerou tarefas. Encerre em vez de excluir.');
            else toastError(error);
          }
        }}
      />
    </div>
  );
}

function RecurringFiltersBar({
  filters,
  options,
  counts,
  onChange,
}: {
  filters: RecurringFilters;
  options: TaskOptionsResponse | undefined;
  counts: { active: number; ended: number } | undefined;
  onChange: (patch: Partial<RecurringFilters>) => void;
}) {
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
  const count = recurringFilterCount(filters);
  const clear = () => {
    setSearch('');
    onChange({ search: '', period: '', department: '', assignee: '', regime: '' });
  };
  const status = (
    <SegmentedControl<'active' | 'ended'>
      size="sm"
      ariaLabel="Situação"
      value={filters.status}
      onChange={(s) => onChange({ status: s })}
      options={[
        { value: 'active', label: `Ativas${counts ? ` (${counts.active})` : ''}` },
        { value: 'ended', label: `Encerradas${counts ? ` (${counts.ended})` : ''}` },
      ]}
    />
  );
  const periodSelect = (sm: boolean) => (
    <Select size_={sm ? 'sm' : 'md'} aria-label="Periodicidade" value={filters.period} onChange={(e) => onChange({ period: e.target.value as RecurrencePeriod | '' })}>
      <option value="">Todas as periodicidades</option>
      {(Object.keys(RECURRENCE_PERIOD_LABELS) as RecurrencePeriod[]).map((p) => (
        <option key={p} value={p}>
          {RECURRENCE_PERIOD_LABELS[p]}
        </option>
      ))}
    </Select>
  );
  const departmentSelect = (sm: boolean) => (
    <Select size_={sm ? 'sm' : 'md'} aria-label="Departamento" value={filters.department} onChange={(e) => onChange({ department: e.target.value })}>
      <option value="">Todos os departamentos</option>
      {(options?.departments ?? []).map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </Select>
  );
  const assigneePicker = (sm: boolean) => (
    <MemberPicker
      size_={sm ? 'sm' : 'md'}
      value={filters.assignee}
      onChange={(assignee) => onChange({ assignee })}
      members={options?.members ?? []}
      allowAll
      meFirst
      aria-label="Responsável"
    />
  );
  const regimeSelect = (sm: boolean) => (
    <Select size_={sm ? 'sm' : 'md'} aria-label="Regime" value={filters.regime} onChange={(e) => onChange({ regime: e.target.value as TaxRegime | '' })}>
      <option value="">Todos os regimes</option>
      {TAX_REGIMES.map((r) => (
        <option key={r} value={r}>
          {TAX_REGIME_LABELS[r]}
        </option>
      ))}
    </Select>
  );
  return (
    <Card className="p-4">
      <div className="hidden gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto_auto]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar tarefa recorrente" aria-label="Buscar tarefa recorrente" className="h-9 rounded-[10px] pl-9 text-[13px]" />
        </div>
        {periodSelect(true)}
        {departmentSelect(true)}
        {assigneePicker(true)}
        {regimeSelect(true)}
        <div className="flex items-center">{status}</div>
        {count > 0 ? (
          <Button variant="ghost" size="sm" className="h-9" onClick={clear}>
            <X /> Limpar
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 sm:hidden">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar" aria-label="Buscar tarefa recorrente" className="h-9 rounded-[10px] pl-9 text-[13px]" />
          </div>
          <Button variant="outline" size="sm" className="h-9" onClick={() => setSheet(true)}>
            <SlidersHorizontal /> Filtros{count - (filters.search ? 1 : 0) > 0 ? ` (${count - (filters.search ? 1 : 0)})` : ''}
          </Button>
        </div>
        {status}
      </div>
      <Sheet
        open={sheet}
        onOpenChange={setSheet}
        title="Filtros"
        description="Refine a lista de tarefas recorrentes."
        footer={
          <>
            <Button variant="ghost" onClick={clear}>
              Limpar
            </Button>
            <Button onClick={() => setSheet(false)}>Ver tarefas recorrentes</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Periodicidade">{periodSelect(false)}</Field>
          <Field label="Departamento">{departmentSelect(false)}</Field>
          <Field label="Responsável">{assigneePicker(false)}</Field>
          <Field label="Regime">{regimeSelect(false)}</Field>
        </div>
      </Sheet>
    </Card>
  );
}

interface RecurringRowProps {
  recurring: RecurringTask;
  monthName: string;
  canEdit: boolean;
  canDelete: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
  onEnd: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}

/** A recurring task (spec §10.2): rule, department, who it applies to, responsibles, month, deadlines. */
function RecurringRow({ recurring: r, monthName, canEdit, canDelete, onOpen, onDuplicate, onEnd, onReactivate, onDelete }: RecurringRowProps) {
  const navigate = useNavigate();
  const m = r.month;
  const live = m.total - m.canceled;
  const names = r.distribution.filter((d) => d.assignee).map((d) => d.assignee!.name);
  const subtitle = [
    !r.active && r.endCompetence ? null : r.startCompetence > m.competence ? `Começa em ${competenceName(r.startCompetence)}` : null,
    r.active && r.endCompetence ? `Encerra em ${competenceName(r.endCompetence)}` : null,
  ].filter(Boolean);
  const head = [r.department?.name, r.category?.name].filter(Boolean).join(' · ');

  return (
    <div className="@container">
      <div className="group flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-surface-muted @lg:px-4">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left">
          {r.category ? <CategoryIcon icon={r.category.icon} color={r.category.color} /> : <NeutralIcon icon={Repeat} />}
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={cn('min-w-0 truncate text-sm font-semibold', r.active ? 'text-fg' : 'text-muted')}>{r.name}</span>
              {r.period !== 'monthly' ? <Badge tone="neutral">{RECURRENCE_PERIOD_LABELS[r.period]}</Badge> : null}
              {!r.active && r.endCompetence ? <Badge tone="neutral">{endedLabel(r.endCompetence)}</Badge> : null}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted">
              <span className="@3xl:hidden">{head}</span>
              <span className="hidden @3xl:inline">{subtitle.length ? subtitle.join(' · ') : (r.description ?? r.category?.name ?? '')}</span>
              {subtitle.length ? <span className="@3xl:hidden">{head ? ' · ' : ''}{subtitle.join(' · ')}</span> : null}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted @xl:hidden">
              {m.occurs ? `${m.done} de ${live}` : `Não ocorre em ${monthName}`} · {dueRuleText(r)}
              {r.targetDaysBefore ? `, meta ${r.targetDaysBefore} ${r.targetDaysBefore === 1 ? 'dia' : 'dias'} antes` : ''}
            </span>
          </span>
        </button>
        <div className="hidden w-32 min-w-0 @3xl:block">
          <span className={cn('block truncate text-body-sm', r.department ? 'text-fg' : 'text-subtle')}>{r.department?.name ?? 'Sem departamento'}</span>
        </div>
        <div className="hidden w-44 min-w-0 @4xl:block">
          <span className="line-clamp-2 block text-body-sm leading-snug text-fg" title={appliesToText(r)}>
            {appliesToText(r)}
          </span>
        </div>
        <div className="hidden w-36 min-w-0 @2xl:block">
          {names.length || r.assignee ? (
            <>
              <Tooltip content={distributionTip(r) || `Padrão: ${r.assignee?.name ?? 'ninguém'}`}>
                <span className="inline-flex" tabIndex={-1}>
                  {names.length ? <AvatarStack names={names} max={3} /> : <MemberAvatar name={r.assignee?.name} />}
                </span>
              </Tooltip>
              {r.assignee ? <span className="mt-0.5 block truncate text-mini text-muted">Padrão: {shortName(r.assignee.name)}</span> : null}
              {r.withoutResponsible > 0 && r.department ? (
                <span className="block truncate text-mini text-warning">
                  {r.withoutResponsible} sem responsável no {r.department.name}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-body-sm text-subtle">Sem responsável</span>
          )}
        </div>
        <div className="hidden w-36 @xl:block">
          {m.occurs && live > 0 ? (
            <>
              <span className="tabular text-[13px] font-medium text-fg">
                {m.done} de {live}
              </span>
              {m.overdue > 0 ? <span className="text-mini text-danger"> · {m.overdue} {m.overdue === 1 ? 'atrasada' : 'atrasadas'}</span> : null}
              <span className="mt-1 block h-1.5 w-28 overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
                <span className="block h-full rounded-full bg-data" style={{ width: `${(m.done / live) * 100}%` }} />
              </span>
            </>
          ) : (
            <span className="text-xs text-subtle">{m.occurs ? 'Nenhum cliente' : `Não ocorre em ${monthName}`}</span>
          )}
        </div>
        <div className="hidden w-52 text-right @xl:block">
          <p className="tabular text-[13px] font-medium text-fg">{dueRuleText(r)}</p>
          <p className="truncate text-xs text-muted">{targetRuleText(r)}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted opacity-70 transition hover:bg-bg-subtle hover:text-fg group-hover:opacity-100 pointer-coarse:opacity-100"
              aria-label={`Ações de ${r.name}`}
            >
              <Ellipsis className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem icon={canEdit ? <Pencil /> : <Eye />} onSelect={onOpen}>
              {canEdit ? 'Editar' : 'Ver'}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<ClipboardCheck />} onSelect={() => navigate(`/tarefas/auditoria?visao=tarefa&recorrente=${r.id}`)}>
              Ver na auditoria
            </DropdownMenuItem>
            <DropdownMenuItem icon={<CalendarDays />} onSelect={() => navigate(CALENDAR_HREF)}>
              Ver no calendário
            </DropdownMenuItem>
            {canEdit ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={<Copy />} onSelect={onDuplicate}>
                  Duplicar
                </DropdownMenuItem>
                {r.active ? (
                  <DropdownMenuItem icon={<Power />} onSelect={onEnd}>
                    Encerrar…
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem icon={<Repeat />} onSelect={onReactivate}>
                    Reativar
                  </DropdownMenuItem>
                )}
                {canDelete && r.occurrenceCount === 0 ? (
                  <DropdownMenuItem icon={<Trash2 />} tone="danger" onSelect={onDelete}>
                    Excluir
                  </DropdownMenuItem>
                ) : null}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
