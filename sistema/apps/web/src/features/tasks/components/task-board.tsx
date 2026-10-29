import { useMemo, useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import { Building2, ChevronLeft, CircleX, ListChecks, MessageSquare, Plus } from 'lucide-react';
import { TASK_PRIORITY_RANK, TASK_STATUS_LABELS, TASK_STATUSES, type ISODate, type Task, type TaskStatus, type TaskStatusCount } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/misc';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { usePermissions } from '@/features/auth/permissions';
import { cn } from '@/lib/utils';
import { useTaskSheetLinks } from '../task-links';
import { useTaskStatusChange } from '../use-task-status';
import { PriorityBadge, TaskDueLabel, TaskStatusGlyph } from './task-status';
import { TaskRowMenu } from './task-row';

const OPEN_COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'waiting_client'];

/** Cards of a column: by due date (none last), then priority; concluded ones by conclusion, newest first. */
export function boardColumns(tasks: Task[]): Record<TaskStatus, Task[]> {
  const out = Object.fromEntries(TASK_STATUSES.map((s) => [s, [] as Task[]])) as Record<TaskStatus, Task[]>;
  for (const t of tasks) out[t.status].push(t);
  for (const s of TASK_STATUSES) {
    out[s].sort((a, b) =>
      s === 'done' || s === 'canceled'
        ? (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt)
        : (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') || TASK_PRIORITY_RANK[a.priority] - TASK_PRIORITY_RANK[b.priority],
    );
  }
  return out;
}

interface TaskBoardProps {
  tasks: Task[] | undefined;
  byStatus: Record<TaskStatus, TaskStatusCount> | undefined;
  today: ISODate;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /** Link to the list of every concluded task with the same filters. */
  doneHref: string;
}

/**
 * Board (spec §8): one column per status. Cards move by dragging (mouse) or by "Mover para ›" in the
 * card menu (keyboard and touch). Concluded shows the last 14 days; Cancelled starts collapsed. Wide
 * screens show every column; tablets scroll sideways inside the board; phones show one column at a
 * time with tabs.
 */
export function TaskBoard({ tasks, byStatus, today, loading, error, onRetry, doneHref }: TaskBoardProps) {
  const columns = useMemo(() => boardColumns(tasks ?? []), [tasks]);
  const [showCanceled, setShowCanceled] = useState(false);
  const [mobileColumn, setMobileColumn] = useState<TaskStatus>('todo');
  const [dragging, setDragging] = useState<Task | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const status = useTaskStatusChange();
  const { canWriteTasks } = usePermissions();

  if (error && !tasks) return <ErrorState error={error} onRetry={onRetry} />;

  const count = (s: TaskStatus) => (tasks ? columns[s].length : 0);
  const overdue = (s: TaskStatus) => (tasks ? columns[s].filter((t) => t.overdue).length : (byStatus?.[s].overdue ?? 0));

  function drop(target: TaskStatus) {
    const task = dragging;
    setDragging(null);
    setOver(null);
    if (task && task.status !== target) void status.change(task, target, 'move');
  }

  const column = (s: TaskStatus, mobile = false) => {
    const isOver = over === s && dragging && dragging.status !== s;
    const headingId = `board-col-${s}${mobile ? '-m' : ''}`;
    if (s === 'canceled' && !showCanceled && !mobile) {
      return (
        <section key={s} aria-labelledby={headingId} className="flex w-14 shrink-0 flex-col items-center gap-2 rounded-xl bg-bg-subtle py-3">
          <h3 id={headingId} className="sr-only">
            Cancelada, {count(s)} tarefas
          </h3>
          <CircleX className="size-4 text-subtle" aria-hidden />
          <span className="tabular text-body-sm font-semibold text-muted">{count(s)}</span>
          <Tooltip content={`Mostrar canceladas (${count(s)})`} side="left">
            <button
              type="button"
              aria-expanded={false}
              aria-label={`Mostrar canceladas (${count(s)})`}
              onClick={() => setShowCanceled(true)}
              className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-fg"
            >
              <ChevronLeft className="size-4" />
            </button>
          </Tooltip>
        </section>
      );
    }
    return (
      <section
        key={s}
        aria-labelledby={headingId}
        onDragOver={(e: DragEvent) => {
          if (!dragging) return;
          e.preventDefault();
          if (over !== s) setOver(s);
        }}
        onDragLeave={(e: DragEvent) => {
          if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver((o) => (o === s ? null : o));
        }}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          drop(s);
        }}
        className={cn(
          'flex min-w-0 flex-col rounded-xl bg-bg-subtle p-2 transition-colors',
          mobile ? 'w-full' : 'w-[280px] shrink-0 snap-start xl:w-auto xl:flex-1 xl:shrink',
          isOver && 'bg-primary-soft/50',
        )}
      >
        <div className="flex h-9 items-center gap-2 px-1.5">
          <TaskStatusGlyph status={s} className="text-muted" />
          <h3 id={headingId} className="text-body-sm font-semibold text-fg">
            {TASK_STATUS_LABELS[s]}
            <span className="sr-only">
              , {count(s)} tarefas{overdue(s) ? `, ${overdue(s)} atrasadas` : ''}
            </span>
          </h3>
          {s === 'done' ? (
            <Tooltip content="Concluídas nos últimos 14 dias">
              <span tabIndex={0} className="tabular text-body-sm text-muted">
                {count(s)}
              </span>
            </Tooltip>
          ) : (
            <span className="tabular text-body-sm text-muted" aria-hidden>
              {count(s)}
            </span>
          )}
          {overdue(s) ? (
            <span className="text-mini font-semibold text-danger" aria-hidden>
              · {overdue(s)} {overdue(s) === 1 ? 'atrasada' : 'atrasadas'}
            </span>
          ) : null}
          <span className="flex-1" />
          {OPEN_COLUMNS.includes(s) && canWriteTasks ? <NewInColumn status={s} /> : null}
          {s === 'canceled' && !mobile ? (
            <Button variant="ghost" size="icon-sm" aria-expanded aria-label="Recolher canceladas" onClick={() => setShowCanceled(false)}>
              <ChevronLeft className="rotate-180" />
            </Button>
          ) : null}
        </div>
        <ul className="mt-1 flex flex-col gap-2">
          {loading && !tasks
            ? [0, 1, 2].map((i) => (
                <li key={i}>
                  <Skeleton className="h-[72px] rounded-lg bg-surface" />
                </li>
              ))
            : null}
          {tasks && columns[s].length === 0 ? (
            <li className="flex h-16 items-center justify-center rounded-lg border border-dashed border-border-strong/80 text-caption text-subtle">
              Nenhuma tarefa
            </li>
          ) : null}
          {columns[s].map((t) => (
            <li key={t.id}>
              <TaskCard
                task={t}
                today={today}
                draggable={canWriteTasks}
                dragging={dragging?.id === t.id}
                onDragStart={() => setDragging(t)}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
              />
            </li>
          ))}
        </ul>
        {s === 'done' && tasks ? (
          <Link to={doneHref} className="mt-2 px-1.5 py-1 text-caption font-medium text-brand-text hover:underline">
            Ver todas as concluídas
          </Link>
        ) : null}
      </section>
    );
  };

  return (
    <>
      {/* Phones: one column at a time. */}
      <div className="flex flex-col gap-3 md:hidden">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <SegmentedControl<TaskStatus>
            size="sm"
            ariaLabel="Coluna do quadro"
            value={mobileColumn}
            onChange={setMobileColumn}
            options={TASK_STATUSES.map((s) => ({ value: s, label: `${TASK_STATUS_LABELS[s]} ${count(s)}` }))}
          />
        </div>
        {column(mobileColumn, true)}
      </div>
      {/* Tablets and desktop: every column; the board scrolls sideways inside itself when needed. */}
      <div className="hidden snap-x snap-proximity items-start gap-4 overflow-x-auto pb-2 md:flex" aria-label="Quadro de tarefas">
        {TASK_STATUSES.map((s) => column(s))}
      </div>
    </>
  );
}

function NewInColumn({ status }: { status: TaskStatus }) {
  const { newTask } = useTaskSheetLinks();
  return (
    <Tooltip content={`Nova tarefa em ${TASK_STATUS_LABELS[status]}`}>
      <Button variant="ghost" size="icon-sm" aria-label={`Nova tarefa em ${TASK_STATUS_LABELS[status]}`} onClick={() => newTask({ status })}>
        <Plus />
      </Button>
    </Tooltip>
  );
}

interface TaskCardProps {
  task: Task;
  today: ISODate;
  draggable: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}

/** Board card (spec §8.2): title, badges, client, due text, counts and the assignee. */
export function TaskCard({ task, today, draggable, dragging, onDragStart, onDragEnd }: TaskCardProps) {
  const { openTask } = useTaskSheetLinks();
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'group relative rounded-lg border border-border bg-surface p-3 transition-colors hover:border-border-strong',
        draggable && 'cursor-grab active:cursor-grabbing',
        dragging && 'border-dashed opacity-50',
      )}
    >
      <button type="button" onClick={() => openTask(task.id)} className="absolute inset-0 rounded-lg" aria-label={`Abrir ${task.title}`} />
      <div className="pointer-events-none relative flex flex-col gap-1.5">
        <p className={cn('line-clamp-2 pr-7 text-body-sm font-semibold', task.status === 'done' || task.status === 'canceled' ? 'text-muted' : 'text-fg')}>
          {task.title}
        </p>
        {task.priority === 'urgent' || task.priority === 'high' ? (
          <div className="flex flex-wrap gap-1">
            <PriorityBadge priority={task.priority} />
          </div>
        ) : null}
        <p className="flex min-w-0 items-center gap-1.5 text-caption text-muted">
          <Building2 className="size-3.5 shrink-0" aria-hidden />
          <span className={cn('truncate', !task.client && 'text-subtle')}>{task.client?.name ?? 'Interna'}</span>
        </p>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate">
            <TaskDueLabel task={task} today={today} />
          </span>
          {task.subtaskCount.total > 0 ? (
            <span className="tabular inline-flex items-center gap-0.5 text-mini text-muted" title="Subtarefas concluídas">
              <ListChecks className="size-3.5" aria-hidden />
              {task.subtaskCount.done}/{task.subtaskCount.total}
            </span>
          ) : null}
          {task.commentCount > 0 ? (
            <span className="tabular inline-flex items-center gap-0.5 text-mini text-muted" title="Comentários">
              <MessageSquare className="size-3.5" aria-hidden />
              {task.commentCount}
            </span>
          ) : null}
          <span title={task.assignee?.name ?? 'Sem responsável'}>
            <MemberAvatar name={task.assignee?.name} unassigned={!task.assignee} />
          </span>
        </div>
      </div>
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
        <TaskRowMenu task={task} moveLabel="Mover para" className="size-7 opacity-100" />
      </div>
    </div>
  );
}
