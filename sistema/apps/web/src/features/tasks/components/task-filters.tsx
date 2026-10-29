import { useEffect, useState } from 'react';
import { Popover } from 'radix-ui';
import { List, ListFilter, Search, SlidersHorizontal, SquareKanban, X } from 'lucide-react';
import {
  formatMonthKey,
  TASK_PRIORITY_LABELS,
  TASK_SITUATION_LABELS,
  TASK_SITUATIONS,
  type MonthKey,
  type TaskOptionsResponse,
  type TaskPriority,
  type TaskScope,
  type TaskSituation,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { activeFilterCount, CLEARED_FILTERS, PRIORITY_OPTIONS, type TaskFilterPatch, type TaskFilters, type TaskView } from '../url-state';
import { ClientPicker, MemberPicker } from './pickers';

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

interface TaskFiltersProps {
  filters: TaskFilters;
  onChange: (patch: TaskFilterPatch) => void;
  options: TaskOptionsResponse | undefined;
  /** Months with tasks in the scope (+ the current one), for "Mês de vencimento". */
  months: MonthKey[];
  /** Live count for the mobile sheet button ("Ver 23 tarefas"). */
  resultCount: number | null;
}

const SITUATION_OPTIONS = TASK_SITUATIONS.map((s) => ({ value: s, label: s === 'waiting' ? 'Aguardando cliente' : TASK_SITUATION_LABELS[s] }));

/** Filters of Tarefas (spec §7.3): two lines on desktop; on phones, search + "Filtros (N)" in a sheet. */
export function TaskFiltersBar({ filters, onChange, options, months, resultCount }: TaskFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const search = useDebounced(searchInput.trim());
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (search !== filters.search) onChange({ search });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  // Cleared from outside (summary, "Limpar filtros").
  useEffect(() => {
    if (filters.search === '' && searchInput.trim() !== '' && search !== '') setSearchInput('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search]);

  const me = options?.me;
  const hasDepartment = Boolean(me?.department);
  const members = options?.members ?? [];
  const clients = options?.clients ?? [];
  const categories = options?.categories ?? [];
  const departments = options?.departments ?? [];
  const board = filters.view === 'board';
  const extraCount = [filters.department, filters.month].filter(Boolean).length;
  const count = activeFilterCount(filters);
  const mobileCount = count - (filters.search ? 1 : 0) + (!board && filters.situation !== 'open' ? 1 : 0);

  const scopeOptions: { value: TaskScope; label: string }[] = [
    { value: 'mine', label: 'Minhas' },
    ...(hasDepartment ? [{ value: 'department' as const, label: 'Meu departamento' }] : []),
    { value: 'all', label: 'Todas' },
  ];
  const viewControl = (size: 'sm' | 'md' = 'md') => (
    <SegmentedControl<TaskView>
      size={size}
      ariaLabel="Visualização"
      value={filters.view}
      onChange={(view) => onChange({ view })}
      options={[
        { value: 'list', label: <span className="sr-only">Lista</span>, icon: <List aria-hidden />, title: 'Lista' },
        { value: 'board', label: <span className="sr-only">Quadro</span>, icon: <SquareKanban aria-hidden />, title: 'Quadro' },
      ]}
    />
  );
  const clear = () => {
    setSearchInput('');
    onChange(CLEARED_FILTERS);
  };

  const monthOptions = [...new Set(months)].sort().reverse();
  const departmentSelect = (sm: boolean) => (
    <Select size_={sm ? 'sm' : 'md'} value={filters.department} onChange={(e) => onChange({ department: e.target.value })} aria-label="Departamento">
      <option value="">Todos os departamentos</option>
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </Select>
  );
  const monthSelect = (sm: boolean) => (
    <Select size_={sm ? 'sm' : 'md'} value={filters.month} onChange={(e) => onChange({ month: e.target.value as MonthKey | '' })} aria-label="Mês de vencimento">
      <option value="">Qualquer mês</option>
      {monthOptions.map((m) => (
        <option key={m} value={m}>
          {formatMonthKey(m)}
        </option>
      ))}
    </Select>
  );
  const categorySelect = (sm: boolean) => (
    <Select size_={sm ? 'sm' : 'md'} value={filters.category} onChange={(e) => onChange({ category: e.target.value })} aria-label="Categoria">
      <option value="">Todas as categorias</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
  const prioritySelect = (sm: boolean) => (
    <Select size_={sm ? 'sm' : 'md'} value={filters.priority} onChange={(e) => onChange({ priority: e.target.value as TaskPriority | '' })} aria-label="Prioridade">
      <option value="">Todas as prioridades</option>
      {PRIORITY_OPTIONS.map((p) => (
        <option key={p} value={p}>
          {TASK_PRIORITY_LABELS[p]}
        </option>
      ))}
    </Select>
  );
  const clientPicker = (sm: boolean) => (
    <ClientPicker
      size_={sm ? 'sm' : 'md'}
      value={filters.client}
      onChange={(client) => onChange({ client })}
      clients={clients}
      allowAll
      allowInternal
      internalLabel="Internas"
      aria-label="Cliente"
    />
  );
  const assigneePicker = (sm: boolean) => (
    <MemberPicker
      size_={sm ? 'sm' : 'md'}
      value={filters.assignee}
      onChange={(assignee) => onChange({ assignee })}
      members={members}
      allowAll
      allowNone
      meFirst
      aria-label="Responsável"
    />
  );

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<TaskScope>
          ariaLabel="Escopo"
          value={filters.scope}
          onChange={(scope) => onChange({ scope, ...(scope === 'mine' ? { assignee: '' } : {}) })}
          options={scopeOptions}
          className="max-sm:w-full"
          fullWidth={false}
        />
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          {board ? (
            <label className="flex items-center gap-2 text-[13px] font-medium text-fg">
              <Switch checked={filters.onlyOverdue} onCheckedChange={(onlyOverdue) => onChange({ onlyOverdue })} aria-label="Só atrasadas" />
              Só atrasadas
            </label>
          ) : (
            <SegmentedControl<TaskSituation>
              size="sm"
              ariaLabel="Situação"
              value={filters.situation}
              onChange={(situation) => onChange({ situation })}
              options={SITUATION_OPTIONS}
            />
          )}
          {viewControl()}
        </div>
      </div>

      {/* Desktop and tablet: search, client, assignee, category, priority, more filters, clear. */}
      <div className="mt-3 hidden gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto_auto]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar pelo nome da tarefa"
            className="h-9 rounded-[10px] pl-9 text-[13px]"
            aria-label="Buscar tarefas"
          />
        </div>
        {clientPicker(true)}
        {filters.scope !== 'mine' ? assigneePicker(true) : <span className="hidden lg:block" />}
        {categorySelect(true)}
        {prioritySelect(true)}
        <Popover.Root>
          <Popover.Trigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              <ListFilter /> Mais filtros{extraCount ? ` (${extraCount})` : ''}
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="end"
              sideOffset={6}
              collisionPadding={12}
              className="z-50 flex w-72 flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-lg data-[state=open]:animate-fade-in"
            >
              {filters.scope !== 'department' ? <Field label="Departamento">{departmentSelect(true)}</Field> : null}
              <Field label="Mês de vencimento">{monthSelect(true)}</Field>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        {count > 0 ? (
          <Button variant="ghost" size="sm" className="h-9" onClick={clear}>
            <X /> Limpar
          </Button>
        ) : (
          <span className="hidden lg:block" />
        )}
      </div>

      {/* Phones: search, "Filtros (N)" and the view. */}
      <div className="mt-3 flex items-center gap-2 sm:hidden">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar"
            className="h-9 rounded-[10px] pl-9 text-[13px]"
            aria-label="Buscar tarefas"
          />
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={() => setSheetOpen(true)}>
          <SlidersHorizontal /> Filtros{mobileCount > 0 ? ` (${mobileCount})` : ''}
        </Button>
        {viewControl('sm')}
      </div>

      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Filtros"
        description="Refine a lista de tarefas."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                clear();
                onChange({ situation: 'open', onlyOverdue: false });
              }}
            >
              Limpar
            </Button>
            <Button onClick={() => setSheetOpen(false)}>
              {resultCount === null ? 'Ver tarefas' : `Ver ${resultCount} ${resultCount === 1 ? 'tarefa' : 'tarefas'}`}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {board ? (
            <label className="flex items-center justify-between gap-2 text-sm font-medium text-fg">
              Só atrasadas
              <Switch checked={filters.onlyOverdue} onCheckedChange={(onlyOverdue) => onChange({ onlyOverdue })} aria-label="Só atrasadas" />
            </label>
          ) : (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-[13px] font-medium text-fg">Situação</legend>
              {SITUATION_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className={cn('flex h-10 items-center gap-3 rounded-md px-3 text-sm', filters.situation === o.value ? 'bg-bg-subtle font-semibold' : 'hover:bg-surface-muted')}
                >
                  <input
                    type="radio"
                    name="task-situation"
                    className="accent-[var(--app-primary)]"
                    checked={filters.situation === o.value}
                    onChange={() => onChange({ situation: o.value })}
                  />
                  {o.label}
                </label>
              ))}
            </fieldset>
          )}
          <Field label="Cliente">{clientPicker(false)}</Field>
          {filters.scope !== 'mine' ? <Field label="Responsável">{assigneePicker(false)}</Field> : null}
          {filters.scope !== 'department' ? <Field label="Departamento">{departmentSelect(false)}</Field> : null}
          <Field label="Categoria">{categorySelect(false)}</Field>
          <Field label="Prioridade">{prioritySelect(false)}</Field>
          <Field label="Mês de vencimento">{monthSelect(false)}</Field>
        </div>
      </Sheet>
    </Card>
  );
}
