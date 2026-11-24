import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { UserRoundCog } from 'lucide-react';
import { addMonthKey, formatDateBR, monthKey, monthKeySchema, todayISO, type MonthKey, type TaskMyOverviewResponse } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { MetricStrip, type MetricCell } from '@/components/ui/metric-strip';
import { ErrorState, PageHeader } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { AccountMenu } from '@/components/layout/account-menu';
import { useAuth } from '@/features/auth/auth-context';
import { gateFor, usePermissions } from '@/features/auth/permissions';
import { ROLE_LABELS } from '@/features/auth/roles';
import { columnsForWidth } from '@/features/dashboard/layout/layout';
import { WidgetCard } from '@/features/dashboard/layout/widget-card';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { PageWithAside } from '@/components/layout/page-with-aside';
import { useElementSize } from '@/lib/use-element-size';
import { useUpdatedLabel } from '@/lib/updated-label';
import { useMyOverview, useTaskActivity, useTaskHome, useTaskNotes, useTaskOptions, useTasks } from '../api';
import { DashColsContext, DashSlot, dashGridClass } from '../components/dash-slot';
import { MiniCalendar } from '../components/mini-calendar';
import {
  ClientsPendingCardView,
  ForYouCardView,
  MyDepartmentCardView,
  MyTasksCardView,
  NotesCardView,
  RecentCommentsCardView,
  RhythmCardView,
} from '../components/my-area-cards';
import { useOccurrenceSheetLinks } from '../components/occurrence-row';
import { appointmentsToday, forYouInsights, greeting, myAreaDescription, myMetricCells, officeHour } from '../my-area-logic';
import { competenceName } from '../occurrence';
import { useTaskActions } from '../task-actions';
import { useTaskSheetLinks } from '../task-links';

const footerLink = 'text-caption font-semibold text-brand-text hover:underline';

/**
 * Minha área (spec §15.4): your work today and this week, how you are doing and what you noted. A
 * common route (the rail stays the current area's), mounted in the Gestão layout so `?tarefa=` opens
 * over it. The numbers are always yours and your department's, administrators included.
 */
export default function MyAreaPage() {
  const { user, workspace } = useAuth();
  const permissions = usePermissions();
  const options = useTaskOptions();
  const overview = useMyOverview();
  const mine = useTasks({ scope: 'mine', situation: 'open', page: 1, pageSize: 50 });
  const home = useTaskHome(undefined);
  const notes = useTaskNotes();
  const activity = useTaskActivity();
  const { openTask, newTask } = useTaskSheetLinks();
  const { openOccurrence } = useOccurrenceSheetLinks();
  const { newNote, editNote, openNotes } = useTaskActions();
  const [params, setParams] = useSearchParams();
  const page = useElementSize<HTMLDivElement>();
  const cols = page.width >= 900 ? 4 : columnsForWidth(page.width || 1280);
  const updated = useUpdatedLabel(overview.dataUpdatedAt);
  const o = overview.data;
  const today = o?.today ?? options.data?.today ?? todayISO();
  const department = options.data?.me.department ?? null;
  const blocked = gateFor(permissions, 'tasks').reason;

  useEffect(() => {
    const before = document.title;
    document.title = 'Minha área · Efficio';
    return () => {
      document.title = before;
    };
  }, []);

  // Calendar month and scope in the URL (`calendario`, `calendario-escopo`).
  const rawMonth = params.get('calendario');
  const calendarMonth: MonthKey = rawMonth && monthKeySchema.safeParse(rawMonth).success ? rawMonth : monthKey(today);
  const calendarScope = department && params.get('calendario-escopo') === 'departamento' ? 'department' : 'mine';
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const [calendarFinding, setCalendarFinding] = useState<string | undefined>(undefined);

  const monthName = competenceName(o?.month ?? monthKey(today)).split(' ')[0]!;
  const prevMonthName = competenceName(addMonthKey(o?.month ?? monthKey(today), -1)).split(' ')[0]!;
  const role = workspace ? ROLE_LABELS[workspace.role] : '';
  const forYou = forYouInsights(o?.insights ?? []);
  const cells: MetricCell[] = o
    ? myMetricCells(o, appointmentsToday(o))
    : ['Atrasadas', 'Hoje', 'Próximos 7 dias', `Minhas concluídas em ${monthName}`].map((label, i) => ({ key: String(i), label, value: '', loading: true, hero: i === 0 }));
  const obligation = home.data?.obligations.items.find((x) => x.pending > 0) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={user ? greeting(officeHour(new Date()), user.name) : 'Minha área'}
        description={myAreaDescription(today, role, department?.name ?? null, overview.dataUpdatedAt ? updated : '')}
        actionsClassName="max-sm:w-full max-sm:flex-nowrap"
        actions={
          <>
            <Button asChild variant="ghost" className="max-sm:hidden">
              <Link to="/configuracoes?aba=perfil">
                <UserRoundCog /> Editar perfil
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" className="sm:hidden" aria-label="Editar perfil">
              <Link to="/configuracoes?aba=perfil">
                <UserRoundCog />
              </Link>
            </Button>
            <AccountMenu className="max-sm:flex-1" />
          </>
        }
      />

      <PageWithAside
        spotlight={<MySpotlight overview={o} loading={!o && !overview.isError} onOpen={openTask} />}
        aside={
          <>
            <div className="h-[300px]">
            {o ? <ForYouCardView insights={forYou.shown} hidden={forYou.hidden} /> : <CardLoading title="Para você" />}
            </div>
            <div className="min-h-[392px]">
            <WidgetCard
              title="Calendário"
              subtitle={calendarFinding}
              action={
                department ? (
                  <SegmentedControl<'mine' | 'department'>
                    size="sm"
                    ariaLabel="Escopo do calendário"
                    value={calendarScope}
                    onChange={(v) => setParam('calendario-escopo', v === 'department' ? 'departamento' : null)}
                    options={[
                      { value: 'mine', label: 'Minhas' },
                      { value: 'department', label: 'Departamento' },
                    ]}
                  />
                ) : undefined
              }
              footer={
                <Link to={`/tarefas?visao=calendario&escopo=${calendarScope === 'mine' ? 'minhas' : 'departamento'}&mes=${calendarMonth}`} className={footerLink}>
                  Abrir calendário
                </Link>
              }
            >
              <MiniCalendar
                month={calendarMonth}
                scope={calendarScope}
                today={today}
                onMonth={(m) => setParam('calendario', m === monthKey(today) ? null : m)}
                onFinding={setCalendarFinding}
              />
            </WidgetCard>
            </div>
          </>
        }
      >
        <div ref={page.ref} className="flex min-w-0 flex-col gap-6">
          {overview.isError && !o ? <ErrorState error={overview.error} onRetry={() => overview.refetch()} /> : <MetricStrip cells={cells} />}
          <DashColsContext.Provider value={cols}>
            <div className={dashGridClass(cols)}>
              <DashSlot rows={4} span={{ wide: 12, medium: 2 }}>
            <MyTasksCardView
              data={mine.data ? { items: mine.data.items, occurrences: mine.data.occurrences, total: mine.data.total } : undefined}
              loading={mine.isPending}
              error={mine.isError ? mine.error : null}
              onRetry={() => mine.refetch()}
              today={today}
              onNewTask={() => newTask()}
              blockedReason={blocked}
            />
              </DashSlot>
              <DashSlot rows={4} span={{ wide: 6, medium: 1 }}>
            {o ? (
              <RhythmCardView
                overview={o}
                monthName={monthName}
                prevMonthName={prevMonthName}
                footer={
                  <Link to={`/tarefas/relatorios?responsavel=${user?.id ?? ''}`} className={footerLink}>
                    Ver relatório
                  </Link>
                }
              />
            ) : (
              <CardLoading title="Seu ritmo" />
            )}
              </DashSlot>
              <DashSlot rows={4} span={{ wide: 6, medium: 1 }}>
            <MyDepartmentCardView
              home={home.data && !department ? { ...home.data, view: 'mine' } : home.data}
              canRegistry={permissions.can('registry')}
              today={today}
              footer={
                obligation ? (
                  <button type="button" onClick={() => openOccurrence(obligation)} className={footerLink}>
                    {obligation.name} · {obligation.done}/{obligation.total - obligation.canceled} · prazo {formatDateBR(obligation.legalDueDate).slice(0, 5)}
                  </button>
                ) : undefined
              }
            />
              </DashSlot>
          <DashSlot rows={3} span={{ wide: 4, medium: 1 }}>
            <NotesCardView notes={notes.data} onOpen={editNote} onNew={newNote} onAll={openNotes} blockedReason={blocked} />
          </DashSlot>
          <DashSlot rows={3} span={{ wide: 4, medium: 1 }}>
            <ClientsPendingCardView
              rows={department ? home.data?.byClient : mine.data?.summary.openByClient}
              department={department?.name ?? null}
              loading={department ? home.isPending : mine.isPending}
            />
          </DashSlot>
          <DashSlot rows={3} span={{ wide: 4, medium: 2 }}>
            <RecentCommentsCardView items={activity.data} onOpen={openTask} />
          </DashSlot>
            </div>
          </DashColsContext.Provider>
        </div>
      </PageWithAside>
    </div>
  );
}

function CardLoading({ title }: { title: ReactNode }) {
  return (
    <WidgetCard title={title}>
      <div className="flex flex-1 flex-col gap-2" aria-busy="true" aria-label="Carregando">
        {Array.from({ length: 4 }, (_, i) => (
          <span key={i} className="h-8 animate-pulse rounded-md bg-bg-subtle" />
        ))}
      </div>
    </WidgetCard>
  );
}

/** The solid card of Minha área: your oldest overdue task, or the calm message in the same place. */
function MySpotlight({ overview, loading, onOpen }: { overview: TaskMyOverviewResponse | undefined; loading: boolean; onOpen: (id: string) => void }) {
  if (loading || !overview) return <SpotlightCard label="Atrasada" loading={loading} title={loading ? undefined : 'Sem dados'} />;
  const open = overview.open;
  const oldest = open.oldestOverdue;
  if (!oldest) {
    return (
      <SpotlightCard
        label="Seu dia"
        title={open.dueToday ? `${open.dueToday} ${open.dueToday === 1 ? 'tarefa vence' : 'tarefas vencem'} hoje` : 'Nada atrasado'}
        caption={open.next7Days ? `${open.next7Days} nos próximos 7 dias` : 'Nenhuma tarefa sua passou do prazo.'}
        action={{ label: 'Ver minhas tarefas', to: '/tarefas?escopo=minhas' }}
      />
    );
  }
  return (
    <SpotlightCard
      label={open.overdue > 1 ? `Atrasada · a mais antiga de ${open.overdue}` : 'Atrasada'}
      badge={`há ${oldest.daysOverdue} ${oldest.daysOverdue === 1 ? 'dia' : 'dias'}`}
      badgeDanger
      title={oldest.title}
      caption={`${oldest.client ? `${oldest.client.name} · ` : ''}venceu em ${formatDateBR(oldest.dueDate)}`}
      rows={[
        { label: 'Vencem hoje', value: open.dueToday },
        { label: 'Próximos 7 dias', value: open.next7Days },
        ...(open.waitingClient ? [{ label: 'Aguardando cliente', value: open.waitingClient }] : []),
      ]}
      action={{ label: 'Abrir tarefa', onClick: () => onOpen(oldest.id) }}
    />
  );
}
