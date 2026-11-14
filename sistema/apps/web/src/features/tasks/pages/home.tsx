import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Info, Plus } from 'lucide-react';
import {
  addDays,
  diffInDays,
  monthKey,
  todayISO,
  type RecurringOccurrence,
  type Task,
  type TaskHomeResponse,
  type TaskOptionsResponse,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { StackBar } from '@/components/charts/stack-bar';
import { Card } from '@/components/ui/card';
import { MetricStrip, type MetricCell } from '@/components/ui/metric-strip';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { ErrorState, PageHeader } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress-bar';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/features/auth/auth-context';
import { usePermissions, WriteGate } from '@/features/auth/permissions';
import { BodyEmpty, ListSkeleton } from '@/features/dashboard/widgets/shared';
import { FitList, WidgetCard } from '@/features/dashboard/layout/widget-card';
import { columnsForWidth } from '@/features/dashboard/layout/layout';
import { useElementSize } from '@/lib/use-element-size';
import { useUpdatedLabel } from '@/lib/updated-label';
import { cn, pluralize } from '@/lib/utils';
import { useRecurringTasks, useTaskDashboard, useTaskHome, useTaskOptions, useTasks } from '../api';
import { AgendaCard, ClientsOverviewCard, DocumentsCard, FeesCard, FiscalCard, FlowCard, IncompleteCard, ProcessesCard, TaskStatusCard, ConventionsCard } from '../components/dashboard-cards';
import { DashboardListSheet, type DashboardList } from '../components/dashboard-list-sheet';
import { BreakdownItem, type BreakdownRow } from '../components/breakdown-list';
import { TaskRow } from '../components/task-row';
import { TaskStatusGlyph } from '../components/task-status';
import { RecurringOccurrenceRow } from '../components/occurrence-row';
import { occurrenceBucket, taskBucket } from '../occurrence';
import { monthName } from '../components/tasks-summary';
import { DashColsContext, DashSlot, dashGridClass, useDashCols } from '../components/dash-slot';
import { daysText, shortDate, shortName } from '../due';
import { longDay } from '../format';
import { useTaskSheetLinks } from '../task-links';
import { canPickDepartment, resolveHomeDepartment } from '../home-view';
import { assigneeInsight } from '../dashboard-logic';
import { homeDepartmentKey, readHomeDepartment, tasksHref, writeHomeDepartment, type TaskFilterPatch } from '../url-state';
import { useOfficeBranding } from '@/features/office/api';

/** Filters of the task list that match what the home page shows. */
function listBase(home: TaskHomeResponse): TaskFilterPatch {
  if (home.view === 'mine') return { scope: 'mine' };
  if (home.view === 'department' && home.department) return { scope: 'all', department: home.department.id };
  return { scope: 'all' };
}

export default function TaskHomePage() {
  const [params, setParams] = useSearchParams();
  const { user, workspace } = useAuth();
  const options = useTaskOptions();
  const storeKey = homeDepartmentKey(workspace?.id ?? '', user?.id ?? '');
  const o = options.data;
  const urlDept = params.get('departamento');
  const departmentId = o ? resolveHomeDepartment(o, urlDept, readHomeDepartment(storeKey)) : undefined;
  const home = useTaskHome(departmentId, { enabled: Boolean(o) });
  // Effy's dashboard cards: same department rule as the start page.
  const dash = useTaskDashboard(departmentId, { enabled: Boolean(o) });
  const cards = { data: dash.data, loading: dash.isPending, error: dash.isError ? dash.error : null, onRetry: () => void dash.refetch() };
  const [list, setList] = useState<DashboardList | null>(null);
  const { can } = usePermissions();
  const showFees = can('finance') && Boolean(dash.data?.fees);
  const showIncomplete = Boolean(dash.data?.incomplete);
  const { newTask } = useTaskSheetLinks();
  const today = o?.today ?? todayISO();
  const h = home.data;
  // The page width picks the columns of the card grid (same bands as the financial board).
  const page = useElementSize();
  const updated = useUpdatedLabel(home.dataUpdatedAt);
  const cols = columnsForWidth(page.width || 1280);

  function chooseDepartment(value: string) {
    writeHomeDepartment(storeKey, value);
    const next = new URLSearchParams(params);
    next.set('departamento', value === 'all' ? 'todos' : value);
    setParams(next, { replace: true });
  }

  // People of the department in view (the description and the zero rows of "Por responsável").
  const people = useMemo(() => {
    if (!o || !h) return [];
    if (h.view === 'department' && h.department) return o.members.filter((m) => m.department?.id === h.department!.id);
    if (h.view === 'all') return o.members;
    return o.members.filter((m) => m.isYou);
  }, [o, h]);

  const where =
    !h ? '' : h.view === 'department' && h.department ? `no ${h.department.name}` : h.view === 'all' ? (o?.departments.length ? 'em todos os departamentos' : 'no escritório') : 'com você';
  const description = !o || !h ? longDay(today) : h.view === 'department' && h.department
    ? `${longDay(today)} · ${h.department.name}, ${pluralize(people.length, 'pessoa', 'pessoas')}`
    : h.view === 'all'
      ? `${longDay(today)} · ${o.departments.length ? `Todos os departamentos, ${pluralize(people.length, 'pessoa', 'pessoas')}` : 'todo o escritório'}`
      : `${longDay(today)} · suas tarefas`;

  return (
    <div ref={page.ref} className="flex flex-col gap-6">
      <PageHeader
        title="Início"
        description={updated ? `${description} · ${updated}` : description}
        actionsClassName="max-sm:w-full"
        actions={
          <>
            {o && canPickDepartment(o) && o.departments.length > 0 ? (
              <DepartmentSwitcher value={departmentId ?? 'all'} options={o} onChange={chooseDepartment} />
            ) : null}
            <WriteGate scope="tasks">
              <Button onClick={() => newTask()} className="max-sm:hidden">
                <Plus /> Nova tarefa
              </Button>
            </WriteGate>
          </>
        }
      />

      {home.isError && !h ? (
        <ErrorState error={home.error} onRetry={() => home.refetch()} />
      ) : (
        <HomeSummary home={h} today={today} />
      )}

      {o && h?.view === 'mine' && o.departments.length > 0 ? (
        <p className="-mt-2 flex items-start gap-2 text-body-sm text-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Você ainda não está em um departamento. Peça a um administrador para incluir você em Cadastros › Equipe.
        </p>
      ) : null}

      {o && canPickDepartment(o) ? <SetupChecklist options={o} storeKey={`effinance.tasks.setup.v1:${workspace?.id ?? ''}`} /> : null}

      <DashColsContext.Provider value={cols}>
        <Section title="Tarefas">
          <DashSlot rows={4} span={{ wide: 8, medium: 2 }}>
            <MyTasks home={h} loading={home.isPending} error={home.isError ? home.error : null} today={today} onRetry={() => home.refetch()} />
          </DashSlot>
          <DashSlot rows={4} mediumRows={3} span={{ wide: 4, medium: 2 }}>
            <TaskStatusCard {...cards} base={h ? listBase(h) : {}} />
          </DashSlot>
          <DashSlot rows={3} span={{ wide: 6, medium: 1 }}>
            <FlowCard {...cards} base={h ? listBase(h) : {}} />
          </DashSlot>
          <DashSlot rows={3} phoneRows={4} span={{ wide: 6, medium: 1 }}>
            <AgendaCard {...cards} />
          </DashSlot>
          <DashSlot rows={3} phoneRows={4} span={{ wide: 6, medium: 1 }}>
            <ByAssignee home={h} people={people} where={where} loading={home.isPending} />
          </DashSlot>
          <DashSlot rows={3} span={{ wide: 6, medium: 1 }}>
            <ProcessesCard {...cards} />
          </DashSlot>
        </Section>

        <Section title="Vencimentos">
          <DashSlot rows={3} span={{ wide: showFees ? 3 : 4, medium: 1 }}>
            <DocumentsCard {...cards} kind="certificates" onList={setList} />
          </DashSlot>
          <DashSlot rows={3} span={{ wide: showFees ? 3 : 4, medium: 1 }}>
            <DocumentsCard {...cards} kind="documents" onList={setList} />
          </DashSlot>
          {/* Five bands in 32px rows at 320px, 28px rows at 296px (below 4 columns): always M. */}
          <DashSlot rows={3} span={{ wide: showFees ? 3 : 4, medium: showFees ? 1 : 2 }}>
            <ConventionsCard {...cards} />
          </DashSlot>
          {showFees ? (
            <DashSlot rows={3} span={{ wide: 3, medium: 1 }}>
              <FeesCard {...cards} onList={setList} />
            </DashSlot>
          ) : null}
        </Section>

        <Section title="Obrigações e clientes">
          <DashSlot rows={4} span={{ wide: 8, medium: 2 }}>
            <FiscalCard {...cards} />
          </DashSlot>
          <DashSlot rows={4} mediumRows={3} span={{ wide: 4, medium: 2 }}>
            <ClientsOverviewCard {...cards} onList={setList} />
          </DashSlot>
          {showIncomplete ? (
            <DashSlot rows={3} phoneRows={4} span={{ wide: 12, medium: 2 }}>
              <IncompleteCard {...cards} onList={setList} canFinance={can('finance')} />
            </DashSlot>
          ) : null}
        </Section>
      </DashColsContext.Provider>

      <DashboardListSheet list={list} data={dash.data} onChange={setList} />
    </div>
  );
}

/** A block of the start page: a quiet heading over the card grid (12, 2 or 1 columns by width). */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const cols = useDashCols();
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-title-sm font-semibold tracking-tight text-fg">{title}</h2>
      <div className={dashGridClass(cols)}>{children}</div>
    </section>
  );
}

function DepartmentSwitcher({ value, options, onChange }: { value: string; options: TaskOptionsResponse; onChange: (v: string) => void }) {
  const choices = [{ value: 'all', label: 'Todos' }, ...options.departments.map((d) => ({ value: d.id, label: d.name }))];
  if (choices.length <= 4) {
    return (
      <div className="max-sm:w-full max-sm:overflow-x-auto">
        <SegmentedControl size="sm" ariaLabel="Departamento" value={value} onChange={onChange} options={choices} />
      </div>
    );
  }
  return (
    <Select size_="sm" wrapperClassName="w-full sm:w-56" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Departamento">
      <option value="all">Todos os departamentos</option>
      {options.departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Summary (spec §6.3, phase 1: "Fora da meta" waits for the recurring tasks, so "Aguardando cliente"
// takes its cell)
// ---------------------------------------------------------------------------

const linkInText = 'font-medium text-brand-text underline decoration-border-strong underline-offset-4 hover:decoration-current';

/**
 * Number strip of the Início (docs/dashboards-redesign.md §8.1): the shared `MetricStrip`, six cells
 * ("Atrasadas" wider, with the 32px number), footers on one line with the full text as tooltip.
 */
function HomeSummary({ home, today }: { home: TaskHomeResponse | undefined; today: string }) {
  const { openTask } = useTaskSheetLinks();
  const base = home ? listBase(home) : {};
  const where = home?.view === 'department' && home.department ? ` no ${home.department.name}` : '';
  const oldest = home?.oldestOverdue ?? null;
  const t = home?.totals;
  const done = t ? t.doneOnTime + t.doneLate : 0;
  const month = monthName(home?.month ?? monthKey(today));
  const loading = !home;
  const noRecurring = home ? home.obligations.total === 0 && t!.recurring === 0 : false;
  const legalIn = t?.targetMissedNextLegalDate ? diffInDays(t.targetMissedNextLegalDate, today) : null;

  const oldestText =
    t && t.overdue > 0 && oldest
      ? `A mais antiga venceu há ${daysText(oldest.daysOverdue)}: ${oldest.title}${oldest.kind === 'recurring' && oldest.client ? ` · ${oldest.client.name}` : ''}${oldest.assignee ? ` · com ${shortName(oldest.assignee.name)}` : ' · sem responsável'}`
      : t && t.overdue === 0
        ? `Nada atrasado${where}.`
        : '';
  const targetText = t
    ? noRecurring
      ? `nenhuma recorrente${where}`
      : t.targetMissed > 0
        ? legalIn !== null
          ? legalIn <= 0
            ? 'prazo legal hoje'
            : `prazo legal em até ${daysText(legalIn)}`
          : 'dentro do prazo legal'
        : 'nada fora da meta'
    : '';
  const todayText = t ? (t.appointmentsToday ? `${t.appointmentsToday} ${t.appointmentsToday === 1 ? 'compromisso' : 'compromissos'}` : t.dueToday ? 'até o fim do dia' : 'nada para hoje') : '';
  const openText = t ? `${t.byStatus.in_progress} em andamento${t.waitingClient > 0 ? ` · ${t.waitingClient} aguardando cliente` : ''}` : '';
  const onTime = done > 0 && t ? Math.round((t.doneOnTime / done) * 100) : null;
  const doneText = t ? (onTime === null ? 'nenhuma concluída ainda' : `${onTime}% no prazo · ${t.doneLate} com atraso`) : '';

  const cells: MetricCell[] = [
    {
      key: 'overdue',
      hero: true,
      label: 'Atrasadas',
      info: 'Abertas depois do prazo: o vencimento, nas avulsas, ou o prazo legal, nas recorrentes. Conta todas as abertas; a Situação das tarefas conta só as da competência.',
      value: t?.overdue ?? 0,
      tone: t && t.overdue > 0 ? 'danger' : undefined,
      href: tasksHref({ ...base, situation: 'overdue' }),
      aria: `Atrasadas${where}: ${t?.overdue ?? 0}. Ver na lista de tarefas.`,
      footerTitle: oldestText,
      footer:
        t && t.overdue > 0 && oldest ? (
          <>
            A mais antiga venceu há {daysText(oldest.daysOverdue)}:{' '}
            <button type="button" onClick={() => openTask(oldest.id)} className={cn('inline text-left', linkInText)}>
              {oldest.title}
            </button>
            {oldest.kind === 'recurring' && oldest.client ? ` · ${oldest.client.name}` : ''}
            {oldest.assignee ? ` · com ${shortName(oldest.assignee.name)}` : ' · sem responsável'}
          </>
        ) : (
          oldestText
        ),
      loading,
    },
    {
      key: 'target',
      label: 'Fora da meta',
      info: 'Recorrentes abertas depois da meta interna, ainda dentro do prazo legal.',
      value: t?.targetMissed ?? 0,
      tone: t && t.targetMissed > 0 ? 'warning' : undefined,
      href: tasksHref({ ...base, kind: 'recurring' }),
      aria: `Fora da meta${where}: ${t?.targetMissed ?? 0}. Ver na lista de tarefas.`,
      footer: targetText,
      footerTitle: targetText,
      loading,
    },
    {
      key: 'today',
      label: 'Vencem hoje',
      info: 'Avulsas com vencimento hoje e recorrentes com meta hoje.',
      value: t?.dueToday ?? 0,
      href: tasksHref({ ...base, dueDate: today as never }),
      aria: `Vencem hoje${where}: ${t?.dueToday ?? 0}. Ver na lista de tarefas.`,
      footer: todayText,
      footerTitle: todayText,
      loading,
    },
    {
      key: 'next7',
      label: 'Próximos 7 dias',
      value: t?.dueNext7Days ?? 0,
      href: tasksHref({ ...base }),
      aria: `Vencem nos próximos 7 dias${where}: ${t?.dueNext7Days ?? 0}. Ver na lista de tarefas.`,
      footer: `até ${shortDate(addDays(today, 7), today)}`,
      loading,
    },
    {
      key: 'open',
      label: 'Em aberto',
      value: t?.open ?? 0,
      href: tasksHref({ ...base }),
      aria: `Em aberto${where}: ${t?.open ?? 0}. Ver na lista de tarefas.`,
      footerTitle: openText,
      footer: t ? (
        <>
          {t.byStatus.in_progress} em andamento
          {t.waitingClient > 0 ? (
            <>
              {' · '}
              <Link to={tasksHref({ ...base, situation: 'waiting' })} className={linkInText}>
                {t.waitingClient} aguardando cliente
              </Link>
            </>
          ) : null}
        </>
      ) : null,
      loading,
    },
    {
      key: 'done',
      label: `Concluídas em ${month}`,
      info: 'No prazo: concluídas até o prazo legal (ou o vencimento, nas avulsas; sem vencimento contam no prazo). Canceladas não entram. A meta é 100% no prazo.',
      value: done,
      href: tasksHref({ ...base, situation: 'done', month: (home?.month ?? '') as never }),
      aria: `Concluídas em ${month}${where}: ${done}${onTime !== null ? `, ${onTime}% no prazo` : ''}. Ver na lista de tarefas.`,
      footerTitle: doneText,
      footer: t ? (
        <span className="flex min-w-0 items-center gap-2">
          {done > 0 ? (
            <StackBar
              size="sm"
              className="w-12 shrink-0"
              segments={[
                { value: t.doneOnTime, className: 'bg-data' },
                { value: t.doneLate, className: 'bg-danger' },
              ]}
            />
          ) : null}
          <span className="tabular truncate">{doneText}</span>
        </span>
      ) : null,
      loading,
    },
  ];
  return (
    <section aria-label="Resumo do departamento" aria-busy={loading || undefined}>
      <MetricStrip cells={cells} medium={3} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

type MineTab = 'open' | 'today' | 'overdue';

type MineItem = { key: string; task: Task; occurrence?: undefined; work: string } | { key: string; occurrence: RecurringOccurrence; task?: undefined; work: string };

const BUCKET_ORDER = ['overdue', 'targetMissed', 'today', 'next7Days', 'later', 'noDueDate'] as const;

/**
 * "Minhas tarefas" (§6.4): your open tasks and your recurring tasks grouped by your clients, overdue
 * first, then past the target, then by work date; no due date last. The tab narrows to today or overdue.
 */
export function mineItems(tasks: Task[], occurrences: RecurringOccurrence[], today: string, tab: MineTab): MineItem[] {
  const items: (MineItem & { bucket: number })[] = [
    ...tasks.map((t) => ({ key: t.id, task: t, work: t.occurrence?.targetDate ?? t.dueDate ?? '9999-12-31', bucket: BUCKET_ORDER.indexOf(taskBucket(t, today)) })),
    ...occurrences
      .filter((o) => o.pending > 0)
      .map((o) => ({ key: `${o.recurringTaskId}:${o.periodKey}`, occurrence: o, work: o.targetDate, bucket: BUCKET_ORDER.indexOf(occurrenceBucket(o, today)) })),
  ];
  return items
    .filter((i) => (tab === 'today' ? i.work === today && i.bucket === BUCKET_ORDER.indexOf('today') : tab === 'overdue' ? i.bucket === 0 : true))
    .sort((a, b) => a.bucket - b.bucket || a.work.localeCompare(b.work))
    .map(({ bucket: _b, ...rest }) => rest as MineItem);
}

function MyTasks({ home, loading, error, today, onRetry }: { home: TaskHomeResponse | undefined; loading: boolean; error: unknown; today: string; onRetry: () => void }) {
  const [tab, setTab] = useState<MineTab>('open');
  const { newTask } = useTaskSheetLinks();
  const mine = home?.mine;
  const items = mineItems(mine?.tasks ?? [], mine?.occurrences ?? [], today, tab);
  const total = Math.max(items.length, tab === 'today' ? (mine?.dueToday ?? 0) : tab === 'overdue' ? (mine?.overdue ?? 0) : (mine?.open ?? 0));
  const hasOpen = Boolean(mine && (mine.open > 0 || mine.occurrences.some((o) => o.pending > 0)));
  // Nothing open: the ones concluded in the last 7 days, faded.
  const recent = useTasks(
    { scope: 'mine', situation: 'done', closedFrom: addDays(today, -7), page: 1, pageSize: 5, occurrences: 'false' },
    { enabled: Boolean(mine && mine.open === 0) },
  ).data?.items.filter((t) => t.status === 'done');

  const subtitle = mine ? (
    <>
      {mine.overdue ? <span className="text-danger">{pluralize(mine.overdue, 'atrasada', 'atrasadas')}</span> : 'Nada atrasado'}
      {mine.dueToday ? ` · ${mine.dueToday} para hoje` : ''}
    </>
  ) : null;

  return (
    <WidgetCard
      title="Minhas tarefas"
      subtitle={subtitle}
      action={
        <SegmentedControl<MineTab>
          size="sm"
          ariaLabel="Mostrar"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'open', label: 'Abertas' },
            { value: 'today', label: 'Hoje' },
            { value: 'overdue', label: 'Atrasadas' },
          ]}
        />
      }
    >
      {loading ? (
        <ListSkeleton rowClassName="h-12" />
      ) : error && !home ? (
        <ErrorState error={error} onRetry={onRetry} className="p-4" />
      ) : mine && !hasOpen ? (
        recent && recent.length ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <p className="px-2 text-body-sm font-medium text-fg">Nada em aberto com você.</p>
            <p className="mt-3 px-2 text-caption text-muted">Suas tarefas concluídas nesta semana</p>
            <FitList
              items={recent}
              getKey={(t) => t.id}
              moreLabel={['concluída', 'concluídas']}
              renderItem={(t) => <TaskRow task={t} today={today} density="compact" hideAssignee muted />}
            />
          </div>
        ) : (
          <BodyEmpty
            title="Nada atribuído a você"
            description="Quando alguém atribuir uma tarefa a você, ela aparece aqui."
            action={
              <WriteGate scope="tasks">
                <Button variant="outline" size="sm" onClick={() => newTask()}>
                  Nova tarefa
                </Button>
              </WriteGate>
            }
          />
        )
      ) : items.length === 0 ? (
        <BodyEmpty title={tab === 'today' ? 'Nada vence hoje.' : 'Nada atrasado.'} />
      ) : (
        <FitList
          items={items}
          total={total}
          getKey={(i) => i.key}
          moreLabel={['tarefa', 'tarefas']}
          moreHref={tasksHref({ scope: 'mine', ...(tab === 'overdue' ? { situation: 'overdue' } : {}), ...(tab === 'today' ? { dueDate: today as never } : {}) })}
          contentKey={tab}
          renderItem={(i) =>
            i.task ? (
              <TaskRow task={i.task} today={today} density="compact" hideAssignee muted={i.task.status === 'done' || i.task.status === 'canceled'} />
            ) : (
              <RecurringOccurrenceRow occurrence={i.occurrence!} today={today} density="compact" mine showDepartment={false} />
            )
          }
        />
      )}
    </WidgetCard>
  );
}

function ByAssignee({ home, people, where, loading }: { home: TaskHomeResponse | undefined; people: TaskOptionsResponse['members']; where: string; loading: boolean }) {
  const rows = useMemo<BreakdownRow[]>(() => {
    if (!home) return [];
    const base = listBase(home);
    const withWork = home.byAssignee.filter((r) => r.open + r.overdue > 0);
    const unassigned = withWork.filter((r) => !r.assignee);
    const assigned = withWork.filter((r) => r.assignee).sort((a, b) => b.open + b.overdue - (a.open + a.overdue));
    const idle = people.filter((p) => !withWork.some((r) => r.assignee?.id === p.id)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return [
      ...unassigned.map((r) => ({
        key: 'none',
        label: 'Sem responsável',
        muted: true,
        leading: <MemberAvatar unassigned />,
        open: r.open,
        overdue: r.overdue,
        href: tasksHref({ ...base, scope: 'all', assignee: 'none' }),
      })),
      ...assigned.map((r) => ({
        key: r.assignee!.id,
        label: r.assignee!.name,
        leading: <MemberAvatar name={r.assignee!.name} userId={r.assignee!.id} />,
        open: r.open,
        overdue: r.overdue,
        href: tasksHref({ ...base, scope: 'all', assignee: r.assignee!.id }),
      })),
      ...idle.map((p) => ({ key: p.id, label: p.name, leading: <MemberAvatar name={p.name} userId={p.id} />, open: 0, overdue: 0, href: tasksHref({ ...base, scope: 'all', assignee: p.id }) })),
    ];
  }, [home, people]);
  const max = Math.max(1, ...rows.map((r) => r.open + r.overdue));

  return (
    <WidgetCard
      title="Por responsável"
      subtitle={assigneeInsight(rows.map((r) => ({ label: r.label, open: r.open, overdue: r.overdue, unassigned: r.key === 'none' }))) ?? `Em aberto ${where}`}
      info={`Tarefas em aberto ${where} por responsável (atrasadas em vermelho). A porcentagem é a parte de cada pessoa no total em aberto.`}
      action={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/tarefas/cadastros?aba=equipe">Ver equipe</Link>
        </Button>
      }
    >
      {loading ? (
        <ListSkeleton rowClassName="h-9" />
      ) : rows.length === 0 ? (
        <BodyEmpty title="Ninguém com tarefas em aberto" />
      ) : (
        <FitList items={rows} getKey={(r) => r.key} moreLabel={['pessoa', 'pessoas']} renderItem={(r) => <BreakdownItem row={r} max={max} />} />
      )}
    </WidgetCard>
  );
}

/** First steps of the Gestão for administrators, while any is pending (spec §6.8, phase 1). */
function SetupChecklist({ options, storeKey }: { options: TaskOptionsResponse; storeKey: string }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(storeKey) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(storeKey) === '1');
    } catch {
      // ignore
    }
  }, [storeKey]);
  const recurring = useRecurringTasks({ status: 'active' }, { enabled: !hidden });
  // The office (phase 3): only for whoever keeps it (`office`); the contract and the PDFs read it.
  // `registered` comes with the branding (every member reads it), not from `GET /office`.
  const canOffice = usePermissions().can('office');
  const office = useOfficeBranding({ enabled: canOffice && !hidden });
  const steps = [
    { label: 'Departamentos', done: options.departments.length > 0, href: '/tarefas/cadastros?aba=departamentos' },
    { label: 'Equipe nos departamentos', done: options.members.length > 0 && options.members.every((m) => m.department), href: '/tarefas/cadastros?aba=equipe' },
    { label: 'Tarefas recorrentes', done: (recurring.data?.summary.active ?? 0) > 0, href: '/tarefas/recorrentes' },
    ...(canOffice ? [{ label: 'Dados do escritório', done: Boolean(office.data?.registered), href: '/configuracoes?aba=escritorio' }] : []),
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (hidden || doneCount === steps.length || !recurring.data || (canOffice && !office.data)) return null;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-body-sm font-semibold text-fg">Primeiros passos da gestão</h2>
        <span className="tabular text-body-sm text-muted">
          {doneCount} de {steps.length}
        </span>
        <ProgressBar size="sm" value={doneCount / steps.length} className="max-w-40" label="Primeiros passos concluídos" />
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => {
            try {
              localStorage.setItem(storeKey, '1');
            } catch {
              // ignore
            }
            setHidden(true);
          }}
        >
          Ocultar
        </Button>
      </div>
      <ul className={cn('mt-3 grid gap-2 md:grid-cols-2', steps.length >= 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3')}>
        {steps.map((s) => (
          <li key={s.label}>
            <Link to={s.href} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-body-sm transition-colors hover:bg-surface-muted">
              <span className={s.done ? 'text-success' : 'text-muted'}>
                <TaskStatusGlyph status={s.done ? 'done' : 'todo'} />
              </span>
              <span className={s.done ? 'text-muted' : 'font-medium text-fg'}>{s.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

