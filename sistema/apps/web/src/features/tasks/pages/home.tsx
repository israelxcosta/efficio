import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Info, Plus } from 'lucide-react';
import {
  addDays,
  monthKey,
  todayISO,
  type TaskHomeResponse,
  type TaskOptionsResponse,
  type TaskQuery,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { ErrorState, PageHeader } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress-bar';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { WriteGate } from '@/features/auth/permissions';
import { BodyEmpty, ListSkeleton } from '@/features/dashboard/widgets/shared';
import { FitList, WidgetCard } from '@/features/dashboard/layout/widget-card';
import { cn, pluralize } from '@/lib/utils';
import { useTaskHome, useTaskOptions, useTasks } from '../api';
import { BreakdownItem, type BreakdownRow } from '../components/breakdown-list';
import { TaskRow } from '../components/task-row';
import { TaskStatusGlyph } from '../components/task-status';
import { monthName, SummaryLabel } from '../components/tasks-summary';
import { daysText, shortDate, shortName } from '../due';
import { longDay } from '../format';
import { useTaskSheetLinks } from '../task-links';
import { resolveHomeDepartment } from '../home-view';
import { homeDepartmentKey, readHomeDepartment, tasksHref, writeHomeDepartment, type TaskFilterPatch } from '../url-state';

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
  const { newTask } = useTaskSheetLinks();
  const today = o?.today ?? todayISO();
  const h = home.data;

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
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Início"
        description={description}
        actionsClassName="max-sm:w-full"
        actions={
          <>
            {o?.me.isAdmin && o.departments.length > 0 ? (
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

      {o?.me.isAdmin ? <SetupChecklist options={o} storeKey={`effinance.tasks.setup.v1:${workspace?.id ?? ''}`} /> : null}

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="min-h-[18rem] lg:col-span-7 lg:row-span-2 lg:h-[calc(42rem+1.25rem)]">
          <MyTasks home={h} loading={home.isPending} error={home.isError ? home.error : null} today={today} onRetry={() => home.refetch()} />
        </div>
        <div className="lg:col-span-5 lg:h-[21rem]">
          <ByAssignee home={h} people={people} where={where} loading={home.isPending} />
        </div>
        <div className="lg:col-span-5 lg:h-[21rem]">
          <ByClient home={h} options={o} where={where} loading={home.isPending} />
        </div>
      </div>
    </div>
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

function Cell({
  className,
  label,
  info,
  value,
  big,
  tone,
  href,
  aria,
  footer,
  loading,
}: {
  className?: string;
  label: string;
  info?: string;
  value: number;
  big?: boolean;
  tone?: 'danger';
  href: string;
  aria: string;
  footer?: ReactNode;
  loading: boolean;
}) {
  return (
    <div className={cn('min-w-0 border-border p-4 sm:p-5', className)}>
      <Link
        to={href}
        aria-label={aria}
        className="-m-2 block rounded-md p-2 transition-colors duration-150 hover:bg-surface-muted"
      >
        <SummaryLabel info={info}>{label}</SummaryLabel>
        {loading ? (
          <span className="mt-1 flex h-10 items-center">
            <Skeleton className={big ? 'h-8 w-16' : 'h-6 w-10'} />
          </span>
        ) : (
          <span
            className={cn(
              'tabular mt-1 block leading-10 font-semibold tracking-tight',
              big ? 'text-[32px] lg:text-[28px] xl:text-[32px]' : 'text-kpi',
              tone === 'danger' && value > 0 ? 'text-danger' : 'text-fg',
            )}
          >
            {value}
          </span>
        )}
      </Link>
      {loading ? (
        <span className="mt-1 flex h-5 items-center">
          <Skeleton className="h-3.5 w-28 max-w-full" />
        </span>
      ) : footer ? (
        <div className="mt-1 text-body-sm text-muted">{footer}</div>
      ) : null}
    </div>
  );
}

function HomeSummary({ home, today }: { home: TaskHomeResponse | undefined; today: string }) {
  const { openTask } = useTaskSheetLinks();
  const base = home ? listBase(home) : {};
  const where = home?.view === 'department' && home.department ? ` no ${home.department.name}` : '';
  // The oldest overdue task of the same view (the list sorts by due date).
  const oldestQuery: TaskQuery = {
    scope: home?.view === 'mine' ? 'mine' : 'all',
    departmentId: home?.view === 'department' ? home.department?.id : undefined,
    situation: 'overdue',
    page: 1,
    pageSize: 1,
    occurrences: 'false',
  };
  const oldest = useTasks(oldestQuery, { enabled: Boolean(home && home.totals.overdue > 0) }).data?.items[0];
  const t = home?.totals;
  const done = t ? t.doneOnTime + t.doneLate : 0;
  const month = monthName(home?.month ?? monthKey(today));
  const loading = !home;

  return (
    <section aria-label="Resumo do departamento" aria-busy={loading || undefined} className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,0.75fr))_minmax(0,1.3fr)]">
        <Cell
          className="col-span-2 md:col-span-1"
          big
          tone="danger"
          label="Atrasadas"
          info="Abertas depois do vencimento."
          value={t?.overdue ?? 0}
          loading={loading}
          href={tasksHref({ ...base, situation: 'overdue' })}
          aria={`Atrasadas${where}: ${t?.overdue ?? 0}. Ver na lista de tarefas.`}
          footer={
            t && t.overdue > 0 && oldest ? (
              <>
                A mais antiga venceu há {daysText(oldest.daysOverdue)}:{' '}
                <button
                  type="button"
                  onClick={() => openTask(oldest.id)}
                  className="inline text-left font-semibold text-brand-text underline decoration-border-strong underline-offset-4 hover:decoration-current"
                >
                  {oldest.title}
                </button>
                {oldest.assignee ? ` · com ${shortName(oldest.assignee.name)}` : ' · sem responsável'}
              </>
            ) : t && t.overdue === 0 ? (
              `Nada atrasado${where}.`
            ) : null
          }
        />
        <Cell
          className="border-t md:border-t-0 md:border-l"
          label="Vencem hoje"
          info="Tarefas abertas com vencimento hoje."
          value={t?.dueToday ?? 0}
          loading={loading}
          href={tasksHref({ ...base, dueDate: today as never })}
          aria={`Vencem hoje${where}: ${t?.dueToday ?? 0}. Ver na lista de tarefas.`}
          footer={t ? (t.dueToday ? 'até o fim do dia' : 'nada para hoje') : null}
        />
        <Cell
          className="border-t border-l md:border-t-0"
          label="Próximos 7 dias"
          value={t?.dueNext7Days ?? 0}
          loading={loading}
          href={tasksHref({ ...base })}
          aria={`Vencem nos próximos 7 dias${where}: ${t?.dueNext7Days ?? 0}. Ver na lista de tarefas.`}
          footer={`até ${shortDate(addDays(today, 7), today)}`}
        />
        <Cell
          className="border-t md:border-l-0 lg:border-t-0 lg:border-l"
          label="Em aberto"
          value={t?.open ?? 0}
          loading={loading}
          href={tasksHref({ ...base })}
          aria={`Em aberto${where}: ${t?.open ?? 0}. Ver na lista de tarefas.`}
          footer={t ? `${t.byStatus.in_progress} em andamento` : null}
        />
        <Cell
          className="border-t border-l lg:border-t-0"
          label="Aguardando cliente"
          value={t?.byStatus.waiting_client ?? 0}
          loading={loading}
          href={tasksHref({ ...base, situation: 'waiting' })}
          aria={`Aguardando cliente${where}: ${t?.byStatus.waiting_client ?? 0}. Ver na lista de tarefas.`}
          footer={t ? (t.byStatus.waiting_client ? 'à espera de retorno' : 'nada parado') : null}
        />
        <Cell
          className="col-span-2 border-t md:col-span-1 md:border-l lg:border-t-0"
          label={`Concluídas em ${month}`}
          info="No prazo: concluídas até o vencimento (sem vencimento contam no prazo). Canceladas não entram."
          value={done}
          loading={loading}
          href={tasksHref({ ...base, situation: 'done', month: (home?.month ?? '') as never })}
          aria={`Concluídas em ${month}${where}: ${done}. Ver na lista de tarefas.`}
          footer={
            t ? (
              <div className="flex flex-col gap-1.5">
                {done > 0 ? (
                  <span className="flex h-1.5 w-full gap-0.5 overflow-hidden" aria-hidden>
                    {t.doneOnTime ? <span className="h-full rounded-full bg-data" style={{ width: `${(t.doneOnTime / done) * 100}%` }} /> : null}
                    {t.doneLate ? <span className="h-full rounded-full bg-danger" style={{ width: `${(t.doneLate / done) * 100}%` }} /> : null}
                  </span>
                ) : null}
                <span className="tabular">
                  {t.doneOnTime} no prazo · {t.doneLate} com atraso
                </span>
              </div>
            ) : null
          }
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

type MineTab = 'open' | 'today' | 'overdue';

function MyTasks({ home, loading, error, today, onRetry }: { home: TaskHomeResponse | undefined; loading: boolean; error: unknown; today: string; onRetry: () => void }) {
  const [tab, setTab] = useState<MineTab>('open');
  const { newTask } = useTaskSheetLinks();
  const mine = home?.mine;
  const tasks = (mine?.tasks ?? []).filter((t) => (tab === 'today' ? t.dueDate === today : tab === 'overdue' ? t.overdue : true));
  const total = tab === 'today' ? (mine?.dueToday ?? 0) : tab === 'overdue' ? (mine?.overdue ?? 0) : (mine?.open ?? 0);
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
      ) : mine && mine.open === 0 ? (
        recent && recent.length ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <p className="px-2 text-body-sm font-medium text-fg">Nada em aberto com você.</p>
            <p className="mt-3 px-2 text-caption text-muted">Suas tarefas concluídas nesta semana</p>
            <FitList
              items={recent}
              getKey={(t) => t.id}
              moreLabel="concluídas"
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
      ) : tasks.length === 0 ? (
        <BodyEmpty title={tab === 'today' ? 'Nada vence hoje.' : 'Nada atrasado.'} />
      ) : (
        <FitList
          items={tasks}
          total={total}
          getKey={(t) => t.id}
          moreLabel={total - tasks.length === 1 ? 'tarefa' : 'tarefas'}
          moreHref={tasksHref({ scope: 'mine', ...(tab === 'overdue' ? { situation: 'overdue' } : {}), ...(tab === 'today' ? { dueDate: today as never } : {}) })}
          contentKey={tab}
          renderItem={(t) => <TaskRow task={t} today={today} density="compact" hideAssignee muted={t.status === 'done' || t.status === 'canceled'} />}
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
        leading: <MemberAvatar name={r.assignee!.name} />,
        open: r.open,
        overdue: r.overdue,
        href: tasksHref({ ...base, scope: 'all', assignee: r.assignee!.id }),
      })),
      ...idle.map((p) => ({ key: p.id, label: p.name, leading: <MemberAvatar name={p.name} />, open: 0, overdue: 0, href: tasksHref({ ...base, scope: 'all', assignee: p.id }) })),
    ];
  }, [home, people]);
  const max = Math.max(1, ...rows.map((r) => r.open + r.overdue));

  return (
    <WidgetCard
      title="Por responsável"
      subtitle={`Em aberto ${where}`}
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
        <FitList items={rows} getKey={(r) => r.key} moreLabel="pessoas" renderItem={(r) => <BreakdownItem row={r} max={max} />} />
      )}
    </WidgetCard>
  );
}

function ByClient({ home, options, where, loading }: { home: TaskHomeResponse | undefined; options: TaskOptionsResponse | undefined; where: string; loading: boolean }) {
  const rows = useMemo<BreakdownRow[]>(() => {
    if (!home) return [];
    const base = listBase(home);
    const dept = home.view === 'department' ? home.department : null;
    const all = home.byClient.map((r) => {
      const responsible = dept && r.client ? options?.clientResponsibles.find((x) => x.clientId === r.client!.id && x.departmentId === dept.id) : undefined;
      return {
        key: r.client?.id ?? 'internal',
        label: r.client?.name ?? 'Interna',
        muted: !r.client,
        open: r.open - r.overdue,
        overdue: r.overdue,
        href: tasksHref({ ...base, scope: 'all', client: r.client?.id ?? 'internal' }),
        hint: dept && r.client ? `Responsável no ${dept.name}: ${responsible?.user.name ?? 'ninguém'}` : undefined,
      };
    });
    if (all.length <= 7) return all;
    const rest = all.slice(6);
    return [
      ...all.slice(0, 6),
      {
        key: 'others',
        label: `Outros (${rest.length} clientes)`,
        muted: true,
        open: rest.reduce((s, r) => s + r.open, 0),
        overdue: rest.reduce((s, r) => s + r.overdue, 0),
      },
    ];
  }, [home, options]);
  const max = Math.max(1, ...rows.filter((r) => r.key !== 'others').map((r) => r.open + r.overdue));

  return (
    <WidgetCard title="Por cliente" subtitle={`Clientes com mais pendências ${where}`}>
      {loading ? (
        <ListSkeleton rowClassName="h-9" />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong/80 px-4 py-3 text-center text-body-sm text-muted">
          Nenhum cliente com pendências {where}.
        </p>
      ) : (
        <FitList items={rows} getKey={(r) => r.key} moreLabel="clientes" renderItem={(r) => <BreakdownItem row={r} max={Math.max(max, r.open + r.overdue)} />} />
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
  const activeClients = options.clients.filter((c) => c.status === 'active');
  const steps = [
    { label: 'Departamentos', done: options.departments.length > 0, href: '/tarefas/cadastros?aba=departamentos' },
    { label: 'Equipe nos departamentos', done: options.members.length > 0 && options.members.every((m) => m.department), href: '/tarefas/cadastros?aba=equipe' },
    {
      label: 'Responsáveis dos clientes',
      done:
        options.departments.length > 0 &&
        activeClients.every((c) => options.departments.every((d) => options.clientResponsibles.some((r) => r.clientId === c.id && r.departmentId === d.id))),
      href: '/tarefas/clientes?sem-responsavel=1',
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (hidden || doneCount === steps.length) return null;
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
      <ul className="mt-3 grid gap-2 md:grid-cols-3">
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

