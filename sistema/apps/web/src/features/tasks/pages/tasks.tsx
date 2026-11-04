import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, CircleCheck, Ellipsis, ListChecks, Plus, SearchX, Workflow } from 'lucide-react';
import { TASK_DUE_BUCKET_LABELS, todayISO } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState, PageHeader } from '@/components/ui/misc';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { usePermissions, WriteGate } from '@/features/auth/permissions';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useTaskCalendar, useTaskOptions, useTasks } from '../api';
import { TaskBoard } from '../components/task-board';
import { TaskCalendar } from '../components/task-calendar';
import { RecurringOccurrenceRow } from '../components/occurrence-row';
import { groupListItems, itemCount } from '../occurrence';
import { useTaskActions } from '../task-actions';
import { TaskFiltersBar } from '../components/task-filters';
import { TaskGroup } from '../components/task-group';
import { TaskRow } from '../components/task-row';
import { TasksSummary } from '../components/tasks-summary';
import { longDay } from '../format';
import { useTaskSheetLinks } from '../task-links';
import {
  activeFilterCount,
  calendarMonth,
  CLEARED_FILTERS,
  isGroupedSituation,
  parseTaskFilters,
  readTaskView,
  TASK_PAGE_SIZE,
  taskViewKey,
  toCalendarQuery,
  toTaskQuery,
  writeTaskFilters,
  writeTaskView,
  type TaskFilterPatch,
} from '../url-state';

export default function TasksPage() {
  const [params, setParams] = useSearchParams();
  const { user, workspace } = useAuth();
  const viewKey = taskViewKey(workspace?.id ?? '', user?.id ?? '');
  const preference = useMemo(() => readTaskView(viewKey), [viewKey]);
  const options = useTaskOptions();
  const today = options.data?.today ?? todayISO();
  const parsed = parseTaskFilters(params, preference);
  // "Meu departamento" does not exist for a member without department.
  const filters = options.data && !options.data.me.department && parsed.scope === 'department' ? { ...parsed, scope: 'mine' as const } : parsed;
  const query = toTaskQuery(filters, today);
  const list = useTasks(query);
  const calendar = useTaskCalendar(toCalendarQuery(filters, today), { enabled: filters.view === 'calendar' });
  const { openTask, newTask } = useTaskSheetLinks();
  const actions = useTaskActions();
  const navigate = useNavigate();
  const isAdmin = usePermissions().can('registry');
  const data = list.data;
  const filterCount = activeFilterCount(filters);
  // Occurrences are listed aggregated (not paginated): they come on the first page of a flat list.
  const flatOccurrences = data && filters.page === 1 ? data.occurrences.filter((o) => o.total > 0) : [];
  const empty = data !== undefined && data.items.length === 0 && (isGroupedSituation(filters.situation) ? data.occurrences.every((o) => o.pending === 0) : flatOccurrences.length === 0);
  // Only when the list is empty: does the workspace have any task (or recurring task) at all?
  const anyTask = useTasks({ scope: 'all', situation: 'all', page: 1, pageSize: 1 }, { enabled: empty });
  const workspaceEmpty = empty && anyTask.data?.total === 0 && anyTask.data.occurrences.length === 0;

  function update(patch: TaskFilterPatch) {
    setParams(writeTaskFilters(params, patch), { replace: true });
    if (patch.scope !== undefined || patch.view !== undefined) {
      writeTaskView(viewKey, { scope: patch.scope ?? filters.scope, view: patch.view ?? filters.view });
    }
  }

  const me = options.data?.me;
  const scopeText =
    filters.scope === 'mine' ? 'atribuídas a você' : filters.scope === 'department' && me?.department ? `departamento ${me.department.name}` : 'todo o escritório';
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const grouped = filters.view === 'list' && isGroupedSituation(filters.situation);

  const emptyState = () => {
    if (workspaceEmpty)
      return (
        <EmptyState
          className="m-3"
          icon={<ListChecks />}
          title="Nenhuma tarefa ainda"
          description="Crie tarefas para o escritório, atribua responsáveis e acompanhe os prazos de cada cliente. As tarefas recorrentes do mês também aparecem aqui."
          action={
            <div className="flex flex-col items-center gap-2">
              <WriteGate scope="tasks">
                <Button variant="outline" onClick={() => newTask()}>
                  Nova tarefa
                </Button>
              </WriteGate>
              {isAdmin ? (
                <Button variant="link" size="sm" onClick={() => navigate('/tarefas/recorrentes?recorrente=nova')}>
                  Cadastrar tarefas recorrentes
                </Button>
              ) : null}
            </div>
          }
        />
      );
    if (filterCount > 0)
      return (
        <EmptyState
          className="m-3"
          icon={<SearchX />}
          title="Nenhuma tarefa com esses filtros"
          action={
            <Button variant="outline" onClick={() => update(CLEARED_FILTERS)}>
              Limpar filtros
            </Button>
          }
        />
      );
    if (filters.situation === 'overdue')
      return <EmptyState className="m-3" icon={<CircleCheck />} title="Nenhuma tarefa atrasada" description="Tudo dentro do prazo." />;
    if (filters.scope === 'mine' && isGroupedSituation(filters.situation))
      return (
        <EmptyState
          className="m-3"
          icon={<CircleCheck />}
          title="Nada atribuído a você"
          description="Quando alguém atribuir uma tarefa a você, ela aparece aqui com o prazo."
          action={
            <WriteGate scope="tasks">
              <Button variant="outline" onClick={() => newTask()}>
                Nova tarefa
              </Button>
            </WriteGate>
          }
        />
      );
    return <EmptyState className="m-3" icon={<ListChecks />} title="Nenhuma tarefa nesta situação" description="Troque a situação ou o escopo para ver outras tarefas." />;
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Tarefas"
        description={`${longDay(today)} · ${scopeText}`}
        actions={
          <>
            <WriteGate scope="tasks">
              <Button variant="outline" className="max-sm:hidden" onClick={actions.openTemplatePicker}>
                <Workflow /> Aplicar modelo de processo
              </Button>
            </WriteGate>
            <WriteGate scope="tasks">
              <Button onClick={() => newTask()}>
                <Plus /> Nova tarefa
              </Button>
            </WriteGate>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="sm:hidden" aria-label="Mais ações">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem icon={<Workflow />} onSelect={actions.openTemplatePicker}>
                  Aplicar modelo de processo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {list.isError && !data ? null : workspaceEmpty ? null : (
        <TasksSummary
          summary={data?.summary}
          scope={filters.scope}
          situation={filters.view === 'list' ? filters.situation : 'all'}
          assignee={filters.assignee}
          client={filters.client}
          onSituation={(situation) => update({ situation, view: 'list' })}
          onAssignee={(assignee) => update({ assignee })}
          onClient={(client) => update({ client })}
          onOpenTask={openTask}
        />
      )}

      <TaskFiltersBar
        filters={filters}
        onChange={update}
        options={options.data}
        months={data?.months ?? []}
        resultCount={data ? data.total : null}
      />

      {filters.view === 'calendar' ? (
        <TaskCalendar
          month={calendarMonth(filters, today)}
          data={calendar.data}
          loading={calendar.isPending}
          error={calendar.error}
          onRetry={() => calendar.refetch()}
          today={today}
          situation={filters.situation}
          search={filters.search}
          priority={filters.priority}
          mine={filters.scope === 'mine'}
          onMonth={(month) => update({ month: month === today.slice(0, 7) ? '' : month })}
          onNoDueDate={() => update({ view: 'list', situation: 'open', month: '' })}
          onSeeList={() => update({ view: 'list', situation: 'all', month: calendarMonth(filters, today) })}
        />
      ) : filters.view === 'board' ? (
        <TaskBoard
          tasks={data?.items}
          occurrences={data?.occurrences}
          mine={filters.scope === 'mine'}
          byStatus={data?.byStatus}
          today={today}
          loading={list.isPending}
          error={list.error}
          onRetry={() => list.refetch()}
          doneHref={`/tarefas?${writeTaskFilters(params, { view: 'list', situation: 'done' }).toString()}`}
        />
      ) : (
        <Card className="@container overflow-hidden">
          <div className="hidden items-center gap-3 border-b border-border px-5.5 py-2.5 text-xs font-medium text-muted @xl:flex">
            <span className="w-9" aria-hidden />
            <span className="flex-1">Tarefa</span>
            <span className="hidden w-44 @3xl:block">Cliente</span>
            {filters.scope !== 'mine' ? <span className="hidden w-36 @2xl:block">Responsável</span> : null}
            <span className="hidden w-36 @4xl:block">Situação</span>
            <span className="w-48 text-right">Vencimento</span>
            <span className="w-8" aria-hidden />
          </div>
          <div className="p-1.5">
            {list.isPending ? (
              <SkeletonRows rows={6} className="p-3" />
            ) : list.isError && !data ? (
              <ErrorState error={list.error} onRetry={() => list.refetch()} className="m-3" />
            ) : empty ? (
              anyTask.isPending ? (
                <SkeletonRows rows={3} className="p-3" />
              ) : (
                emptyState()
              )
            ) : (
              <div className={cn(list.isPlaceholderData && 'opacity-60 transition-opacity')}>
                {grouped
                  ? groupListItems(data!.items, data!.occurrences, today).map((g) => (
                      <TaskGroup
                        key={g.bucket}
                        id={g.bucket}
                        title={TASK_DUE_BUCKET_LABELS[g.bucket]}
                        count={Math.max(data!.groups[g.bucket] ?? 0, itemCount(g.items))}
                        tone={g.bucket === 'overdue' ? 'danger' : g.bucket === 'targetMissed' ? 'warning' : undefined}
                      >
                        {g.items.map((item) =>
                          item.type === 'task' ? (
                            <TaskRow
                              key={item.key}
                              task={item.task}
                              today={today}
                              hideAssignee={filters.scope === 'mine'}
                              showDepartment={filters.scope === 'all'}
                              muted={item.task.status === 'done' || item.task.status === 'canceled'}
                            />
                          ) : (
                            <RecurringOccurrenceRow
                              key={item.key}
                              occurrence={item.occurrence}
                              today={today}
                              mine={filters.scope === 'mine'}
                              showDepartment={filters.scope !== 'department'}
                            />
                          ),
                        )}
                      </TaskGroup>
                    ))
                  : (
                      <>
                        {flatOccurrences.map((o) => (
                          <RecurringOccurrenceRow key={`${o.recurringTaskId}:${o.periodKey}`} occurrence={o} today={today} mine={filters.scope === 'mine'} showDepartment={filters.scope !== 'department'} />
                        ))}
                        {data!.items.map((t) => (
                          <TaskRow key={t.id} task={t} today={today} hideAssignee={filters.scope === 'mine'} showDepartment={filters.scope === 'all'} />
                        ))}
                      </>
                    )}
              </div>
            )}
          </div>
          {data && data.total > TASK_PAGE_SIZE ? (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
              <span>
                Página {filters.page} de {totalPages} · {data.total} tarefas
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="icon-sm" disabled={filters.page <= 1} onClick={() => update({ page: filters.page - 1 })} aria-label="Página anterior">
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={filters.page >= totalPages}
                  onClick={() => update({ page: filters.page + 1 })}
                  aria-label="Próxima página"
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
