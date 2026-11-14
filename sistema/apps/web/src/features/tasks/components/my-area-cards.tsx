import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Plus } from 'lucide-react';
import {
  TASK_DUE_BUCKET_LABELS,
  type ISODate,
  type TaskActivityItem,
  type TaskHomeResponse,
  type TaskInsight,
  type TaskMyOverviewResponse,
  type TaskNote,
} from '@effinance/shared';
import { StackBar } from '@/components/charts/stack-bar';
import { Button } from '@/components/ui/button';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { ErrorState } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { FitList, WidgetCard } from '@/features/dashboard/layout/widget-card';
import { BodyEmpty, ListSkeleton } from '@/features/dashboard/widgets/shared';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { shortName } from '../due';
import { commentTime } from '../format';
import { groupMineByClient, INSIGHT_ICONS, insightHref, insightsFinding, rhythmFinding } from '../my-area-logic';
import { groupListItems, type ListItem } from '../occurrence';
import { clientPendingRanking } from '../task-hub';
import { tasksHref } from '../url-state';
import { RecurringOccurrenceRow } from './occurrence-row';
import { TaskRow } from './task-row';

const footerLink = 'text-caption font-semibold text-brand-text hover:underline';

/** A create button, disabled with the reason in a focusable wrapper's tooltip (like `WriteGate`). */
function Gated({ reason, children }: { reason: string | null | undefined; children: ReactNode }) {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip content={reason}>
      <span tabIndex={0} className="inline-flex cursor-not-allowed rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/25">
        {children}
      </span>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Minhas tarefas
// ---------------------------------------------------------------------------

type MineRow = { kind: 'head'; key: string; label: string; count: number; tone?: 'danger' | 'warning' } | { kind: 'item'; key: string; item: ListItem };

/** Rows of "Minhas tarefas": a quiet heading per group and its items. */
export function mineRows(groups: { key: string; label: string; items: ListItem[]; tone?: 'danger' | 'warning' }[]): MineRow[] {
  return groups.flatMap((g) => [
    { kind: 'head' as const, key: `h:${g.key}`, label: g.label, count: g.items.length, tone: g.tone },
    ...g.items.map((item) => ({ kind: 'item' as const, key: item.key, item })),
  ]);
}

export interface MyTasksCardViewProps {
  data: { items: Parameters<typeof groupListItems>[0]; occurrences: Parameters<typeof groupListItems>[1]; total: number } | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  today: ISODate;
  onNewTask: () => void;
  /** Why creating is disabled (inactive subscription). */
  blockedReason?: string | null;
}

/** "Minhas tarefas" (spec §15.4): by deadline (the groups of the list) or by client. */
export function MyTasksCardView({ data, loading, error, onRetry, today, onNewTask, blockedReason }: MyTasksCardViewProps) {
  const [by, setBy] = useState<'due' | 'client'>('due');
  const open = data ? data.items.length + data.occurrences.reduce((n, o) => n + o.pending, 0) : 0;
  const overdue = data ? data.items.filter((t) => t.overdue).length : 0;
  const dueToday = data ? data.items.filter((t) => !t.overdue && t.dueDate === today).length : 0;
  const finding = !data ? undefined : open === 0 ? 'Nada em aberto' : [overdue ? `${overdue} ${overdue === 1 ? 'atrasada' : 'atrasadas'}` : null, dueToday ? `${dueToday} para hoje` : null].filter(Boolean).join(' · ') || `${open} em aberto`;
  const groups = !data
    ? []
    : by === 'due'
      ? groupListItems(data.items, data.occurrences, today).map((g) => ({
          key: g.bucket,
          label: TASK_DUE_BUCKET_LABELS[g.bucket],
          items: g.items,
          tone: g.bucket === 'overdue' ? ('danger' as const) : g.bucket === 'targetMissed' ? ('warning' as const) : undefined,
        }))
      : groupMineByClient(data.items, data.occurrences.filter((o) => o.pending > 0));
  const rows = mineRows(groups);
  return (
    <WidgetCard
      title="Minhas tarefas"
      subtitle={finding}
      action={
        <SegmentedControl<'due' | 'client'>
          size="sm"
          ariaLabel="Agrupar por"
          value={by}
          onChange={setBy}
          options={[
            { value: 'due', label: 'Prazo' },
            { value: 'client', label: 'Cliente' },
          ]}
        />
      }
      footer={
        data && data.total > 0 ? (
          <Link to={tasksHref({ scope: 'mine' })} className={footerLink}>
            Ver todas ({data.total})
          </Link>
        ) : undefined
      }
    >
      {loading && !data ? (
        <ListSkeleton rowClassName="h-12" />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={onRetry} className="p-4" />
      ) : rows.length === 0 ? (
        <BodyEmpty
          title="Nada atribuído a você"
          action={
            <Gated reason={blockedReason}>
              <Button variant="outline" size="sm" disabled={Boolean(blockedReason)} onClick={onNewTask}>
                Nova tarefa
              </Button>
            </Gated>
          }
        />
      ) : (
        <FitList
          items={rows}
          getKey={(r) => r.key}
          moreLabel={['tarefa', 'tarefas']}
          showMore={false}
          contentKey={by}
          renderItem={(r) =>
            r.kind === 'head' ? (
              <p className={cn('flex items-center gap-2 px-2 pt-2 pb-1 text-caption font-semibold', r.tone === 'danger' ? 'text-danger' : r.tone === 'warning' ? 'text-warning' : 'text-muted')}>
                {r.label}
                <span className="tabular font-medium text-subtle">{r.count}</span>
              </p>
            ) : r.item.type === 'task' ? (
              <TaskRow task={r.item.task} today={today} density="compact" hideAssignee more={r.item.more} />
            ) : (
              <RecurringOccurrenceRow occurrence={r.item.occurrence} today={today} density="compact" mine showDepartment={false} />
            )
          }
        />
      )}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Para você
// ---------------------------------------------------------------------------

const INSIGHT_TONE_CLASS: Record<TaskInsight['tone'], string> = { danger: 'text-danger', warning: 'text-warning', success: 'text-success', info: 'text-muted' };

/** The API's insights (up to 6, in its order), each one a link to "Minhas" with its filter when it has one. */
export function ForYouCardView({ insights, hidden = 0 }: { insights: TaskInsight[]; hidden?: number }) {
  return (
    <WidgetCard title="Para você" subtitle={insightsFinding(insights, hidden)}>
      {insights.length === 0 ? (
        hidden > 0 ? (
          <BodyEmpty title="Sem outros avisos" description="As atrasadas e as de hoje estão na faixa acima." />
        ) : (
          <BodyEmpty title="Tudo em dia" />
        )
      ) : (
        <ul className="flex flex-col gap-0.5">
          {insights.slice(0, 6).map((i, n) => {
            const Icon = INSIGHT_ICONS[i.key];
            const href = insightHref(i.link);
            const body = (
              <>
                <Icon className={cn('size-4 shrink-0', INSIGHT_TONE_CLASS[i.tone])} aria-hidden />
                <span className="min-w-0 flex-1 text-body-sm text-fg">{i.text}</span>
                {href ? <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden /> : null}
              </>
            );
            return (
              <li key={`${i.key}-${n}`}>
                {href ? (
                  <Link to={href} className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-surface-muted">
                    {body}
                  </Link>
                ) : (
                  <div className="flex min-h-11 items-center gap-3 px-2 py-1.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Seu ritmo
// ---------------------------------------------------------------------------

const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** The last 6 months (on time over late, stacked) and you × your department's average. */
export function RhythmCardView({ overview, monthName, prevMonthName, footer }: { overview: TaskMyOverviewResponse; monthName: string; prevMonthName: string; footer?: ReactNode }) {
  const trend = overview.productivity.trend;
  const max = Math.max(1, ...trend.map((p) => p.concluded));
  const c = overview.comparison;
  const me = overview.productivity.onTimeRate;
  return (
    <WidgetCard title="Seu ritmo" subtitle={rhythmFinding(overview, monthName, prevMonthName)} footer={footer}>
      {trend.every((p) => p.concluded === 0) ? (
        <BodyEmpty title="Nenhuma conclusão nos últimos 6 meses." />
      ) : (
      <div className="flex min-h-0 flex-1 items-end gap-2" aria-hidden>
        {trend.map((p) => (
          <div key={p.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="tabular text-micro text-muted">{p.concluded || ''}</span>
            <div className="flex w-full max-w-11 flex-col-reverse overflow-hidden rounded-[4px]" style={{ height: `${Math.max(2, (p.concluded / max) * 72)}px` }}>
              <span className="block w-full bg-data" style={{ height: `${p.concluded ? (p.onTime / p.concluded) * 100 : 0}%` }} />
              <span className="block w-full bg-danger" style={{ height: `${p.concluded ? (p.late / p.concluded) * 100 : 0}%` }} />
            </div>
            <span className={cn('text-micro', p.month === overview.month ? 'font-semibold text-fg' : 'text-muted')}>{MONTH_ABBR[Number(p.month.slice(5, 7)) - 1]}</span>
          </div>
        ))}
      </div>
      )}
      <p className="mt-3 truncate text-caption text-muted">
        {me !== null ? `Você: ${me}% no prazo` : 'Você: nenhuma concluída no mês'}
        {c?.average && c.average.onTimeRate !== null ? ` · média do ${c.department.name}: ${c.average.onTimeRate}%` : ''}
      </p>
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Meu departamento
// ---------------------------------------------------------------------------

/** The department's month: concluded share, the progress bar and the bands that ask action. */
export function MyDepartmentCardView({
  home,
  canRegistry,
  today,
  footer,
}: {
  home: TaskHomeResponse | undefined;
  canRegistry: boolean;
  today: ISODate;
  /** The department's obligation with the nearest legal deadline ("DCTFWeb · 12/30 · prazo 07/11"). */
  footer?: ReactNode;
}) {
  if (home && (home.view === 'mine' || !home.department)) {
    return (
      <WidgetCard title="Meu departamento">
        <BodyEmpty
          title="Você ainda não está em um departamento."
          action={
            canRegistry ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/tarefas/cadastros?aba=equipe">Definir em Cadastros</Link>
              </Button>
            ) : undefined
          }
        />
      </WidgetCard>
    );
  }
  if (!home) {
    return (
      <WidgetCard title="Meu departamento">
        <ListSkeleton rowClassName="h-8" />
      </WidgetCard>
    );
  }
  const t = home.totals;
  const done = t.byStatus.done;
  const live = Math.max(0, t.total - t.canceled);
  const pct = live ? Math.round((done / live) * 100) : 0;
  const pending = Math.max(0, live - done - t.overdue);
  const day = Number(today.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  const bands = [
    { key: 'overdue', label: 'Atrasadas', count: t.overdue, tone: 'text-danger', href: tasksHref({ scope: 'department', situation: 'overdue' }) },
    { key: 'target', label: 'Fora da meta', count: t.targetMissed, tone: 'text-warning', href: tasksHref({ scope: 'department' }) },
    { key: 'open', label: 'Em aberto', count: t.open, tone: 'text-fg', href: tasksHref({ scope: 'department' }) },
  ];
  return (
    <WidgetCard title="Meu departamento" subtitle={`${home.department!.name} · ${done} de ${live} concluídas (${pct}%)`} footer={footer}>
      <div className="flex items-baseline gap-2">
        <span className="tabular text-kpi font-semibold tracking-tight text-fg">{pct}%</span>
        <span className="text-caption text-muted">
          {done} de {live}
        </span>
      </div>
      <StackBar
        className="mt-2"
        segments={[
          { value: done, className: 'bg-data' },
          { value: t.overdue, className: 'bg-danger' },
          { value: pending, className: 'bg-border-strong' },
        ]}
        marker={{ at: day / daysInMonth, label: `hoje (dia ${day})` }}
      />
      <ul className="mt-2 flex flex-col">
        {bands.map((b) => (
          <li key={b.key}>
            <Link to={b.href} className="flex h-8 items-center justify-between gap-2 rounded-md px-1 text-body-sm transition-colors duration-150 hover:bg-surface-muted">
              <span className="text-muted">{b.label}</span>
              <span className={cn('tabular font-semibold', b.count > 0 ? b.tone : 'text-subtle')}>{b.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Anotações
// ---------------------------------------------------------------------------

export function NotesCardView({
  notes,
  onOpen,
  onNew,
  onAll,
  now,
  blockedReason,
}: {
  notes: TaskNote[] | undefined;
  onOpen: (n: TaskNote) => void;
  onNew: () => void;
  onAll: () => void;
  now?: Date;
  blockedReason?: string | null;
}) {
  const sorted = [...(notes ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const latest = sorted[0];
  return (
    <WidgetCard
      title="Anotações"
      subtitle={notes && notes.length ? `${notes.length} ${notes.length === 1 ? 'anotação' : 'anotações'} · a última editada ${editedWhen(latest!.updatedAt, now)}` : undefined}
      action={
        notes && notes.length ? (
          <Gated reason={blockedReason}>
            <Button variant="ghost" size="sm" disabled={Boolean(blockedReason)} onClick={onNew}>
              <Plus /> Nova
            </Button>
          </Gated>
        ) : undefined
      }
      footer={
        notes && notes.length ? (
          <button type="button" onClick={onAll} className={footerLink}>
            Ver todas ({notes.length})
          </button>
        ) : undefined
      }
    >
      {!notes ? (
        <ListSkeleton rowClassName="h-9" />
      ) : notes.length === 0 ? (
        <BodyEmpty
          title="Nenhuma anotação"
          action={
            <Gated reason={blockedReason}>
              <Button variant="outline" size="sm" disabled={Boolean(blockedReason)} onClick={onNew}>
                Nova anotação
              </Button>
            </Gated>
          }
        />
      ) : (
        <FitList
          items={sorted}
          getKey={(n) => n.id}
          moreLabel={['anotação', 'anotações']}
          showMore={false}
          renderItem={(n) => (
            <button type="button" onClick={() => onOpen(n)} className="flex h-11 w-full items-center gap-3 rounded-lg px-2 text-left transition-colors duration-150 hover:bg-surface-muted">
              <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-fg">{n.title}</span>
              <span className="shrink-0 text-caption text-subtle">{commentTime(n.updatedAt, now)}</span>
            </button>
          )}
        />
      )}
    </WidgetCard>
  );
}

/** "hoje", "ontem" or "em 12/10" (from `commentTime`). */
function editedWhen(iso: string, now?: Date): string {
  const t = commentTime(iso, now);
  if (t === 'agora' || t.startsWith('há ')) return 'hoje';
  return t === 'ontem' ? 'ontem' : `em ${t}`;
}

// ---------------------------------------------------------------------------
// Clientes com mais pendências
// ---------------------------------------------------------------------------

export function ClientsPendingCardView({ rows, department, loading }: { rows: Parameters<typeof clientPendingRanking>[0] | undefined; department: string | null; loading: boolean }) {
  const ranking = clientPendingRanking(rows ?? [], 8);
  const top = ranking.rows[0];
  const scope = department ? 'department' : 'mine';
  return (
    <WidgetCard
      title={department ? 'Clientes com mais pendências' : 'Seus clientes com mais pendências'}
      subtitle={top ? `${department ? `no ${department} · ` : ''}${top.name} lidera com ${top.open}` : undefined}
    >
      {loading && !rows ? (
        <ListSkeleton rowClassName="h-8" />
      ) : ranking.rows.length === 0 ? (
        <BodyEmpty title="Nenhum cliente com pendências." />
      ) : (
        <FitList
          items={ranking.rows}
          getKey={(r) => r.id}
          moreLabel={['cliente', 'clientes']}
          total={ranking.totals.clients}
          renderItem={(r) => (
            <Link
              to={tasksHref({ scope, client: r.id })}
              className="grid h-9 grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto] items-center gap-3 rounded-lg px-2 transition-colors duration-150 hover:bg-surface-muted"
            >
              <span className="truncate text-body-sm text-fg">{r.name}</span>
              <span className="relative block h-1.5 overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
                <span className="absolute inset-y-0 left-0 rounded-full bg-data" style={{ width: `${r.share * 100}%` }} />
                <span className="absolute inset-y-0 left-0 rounded-full bg-danger" style={{ width: `${r.share * r.overdueShare * 100}%` }} />
              </span>
              <span className="tabular text-right text-body-sm whitespace-nowrap text-fg">
                {r.open}
                {r.overdue ? <span className="ml-1.5 text-caption text-danger">{r.overdue} atr.</span> : null}
              </span>
            </Link>
          )}
        />
      )}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Comentários recentes
// ---------------------------------------------------------------------------

export function RecentCommentsCardView({ items, onOpen, now }: { items: TaskActivityItem[] | undefined; onOpen: (taskId: string) => void; now?: Date }) {
  return (
    <WidgetCard title="Comentários recentes" subtitle={items && items.length ? `${items.length} nos últimos 5 dias` : undefined}>
      {!items ? (
        <ListSkeleton rowClassName="h-11" />
      ) : items.length === 0 ? (
        <BodyEmpty title="Nenhum comentário nos últimos 5 dias." />
      ) : (
        <FitList
          items={items}
          getKey={(i) => i.id}
          moreLabel={['comentário', 'comentários']}
          renderItem={(i) => (
            <button type="button" onClick={() => onOpen(i.taskId)} className="flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-surface-muted">
              <MemberAvatar size="sm" name={i.author?.name} userId={i.author?.id} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm text-fg">
                  <span className="font-semibold">{i.author ? shortName(i.author.name) : 'Alguém'}</span> comentou em {i.taskTitle}
                </span>
                <span className="block truncate text-caption text-muted">{i.text}</span>
              </span>
              <span className="shrink-0 text-caption text-subtle">{commentTime(i.createdAt, now)}</span>
            </button>
          )}
        />
      )}
    </WidgetCard>
  );
}
