import { useState } from 'react';
import { Copy, Ellipsis, ExternalLink, Hourglass, ListChecks, Trash2, UserRoundCheck } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateBR, TASK_STATUS_LABELS, TASK_STATUSES, todayISO, type ISODate, type Task, type TaskStatus } from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { CategoryIcon } from '@/components/ui/category-icon';
import { ConfirmDialog } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { usePermissions, SUBSCRIPTION_REASON } from '@/features/auth/permissions';
import { toastError } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { useDeleteTask, useTaskOptions, useUpdateTask } from '../api';
import { firstName, shortName } from '../due';
import { useTaskSheetLinks } from '../task-links';
import { useTaskStatusChange } from '../use-task-status';
import { PriorityBadge, STATUS_TEXT_CLASS, TaskDueLabel, TaskStatusButton, TaskStatusGlyph } from './task-status';

interface TaskRowProps {
  task: Task;
  today?: ISODate;
  /** `compact`: Início blocks and the client sheet (less padding, fewer columns). */
  density?: 'default' | 'compact';
  /** "Minhas": the assignee is you, so the column and the avatar go away. */
  hideAssignee?: boolean;
  /** Department at the end of the subtitle (scopes with several departments). */
  showDepartment?: boolean;
  muted?: boolean;
}

/**
 * Task row, the skeleton of Contas a pagar's TransactionRow (spec §5): status button where the 👍/👎
 * is, neutral category icon, title with badges, subtitle, columns that appear with the container
 * width (Cliente, Responsável, Situação, Vencimento) and the "⋯" menu.
 */
export function TaskRow({ task, today: todayProp, density = 'default', hideAssignee, showDepartment, muted }: TaskRowProps) {
  const compact = density === 'compact';
  const options = useTaskOptions();
  const today = todayProp ?? options.data?.today ?? todayISO();
  const { canWriteTasks } = usePermissions();
  const status = useTaskStatusChange();
  const { openTask } = useTaskSheetLinks();
  const closed = task.status === 'done' || task.status === 'canceled';
  const clientName = task.client?.name ?? 'Interna';
  const subtitleHead = task.category?.name ?? null;

  return (
    <div className="@container">
      <div
        className={cn(
          'group flex items-center gap-3 rounded-lg transition-colors hover:bg-surface-muted',
          compact ? 'px-2 py-2' : 'px-3 py-3 @lg:px-4',
          muted && 'opacity-70',
        )}
      >
        <TaskStatusButton
          status={task.status}
          taskTitle={task.title}
          size={compact ? 'sm' : 'md'}
          loading={status.savingId === task.id}
          disabled={!canWriteTasks}
          disabledReason={canWriteTasks ? null : SUBSCRIPTION_REASON}
          onToggle={(action) => void status.toggle(task, action)}
        />
        <button type="button" onClick={() => openTask(task.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left">
          {/* Phones: the status button is enough; the category icon gives its room to the title. */}
          <span className="hidden @sm:contents">
            <CategoryIcon icon={task.category?.icon ?? 'tag'} color={task.category?.color} size={compact ? 'sm' : 'md'} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={cn('min-w-[4.5rem] truncate text-sm font-semibold', closed ? 'text-muted' : 'text-fg')}>{task.title}</span>
              {task.priority === 'urgent' ? <PriorityBadge priority="urgent" /> : null}
              {task.priority === 'high' && !compact ? <PriorityBadge priority="high" className="hidden @md:inline-flex" /> : null}
              {task.status === 'waiting_client' ? (
                <Badge tone="neutral" className={cn('shrink-0 px-1.5 @md:px-2', !compact && '@4xl:hidden')} title="Aguardando cliente">
                  <Hourglass aria-hidden />
                  <span className="sr-only @md:not-sr-only">Aguardando cliente</span>
                </Badge>
              ) : null}
              {task.status === 'canceled' ? (
                <Badge tone="neutral" className={cn('shrink-0', !compact && '@4xl:hidden')}>
                  Cancelada
                </Badge>
              ) : null}
              {task.subtaskCount.total > 0 && !compact ? (
                <span className="hidden shrink-0 items-center gap-1 text-mini text-muted @md:inline-flex" title="Subtarefas concluídas">
                  <ListChecks className="size-3.5" aria-hidden />
                  <span className="tabular">
                    {task.subtaskCount.done}/{task.subtaskCount.total}
                  </span>
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted empty:hidden">
              {subtitleHead ? <span>{subtitleHead}</span> : null}
              <span className={cn(!compact && '@3xl:hidden')}>
                {subtitleHead ? ' · ' : ''}
                <span className={task.client ? undefined : 'text-subtle'}>{clientName}</span>
              </span>
              {showDepartment && task.department ? (
                <span>
                  {/* Without category the separator exists only while the client is in the subtitle. */}
                  {subtitleHead ? ' · ' : <span className={cn(!compact && '@3xl:hidden')}> · </span>}
                  {task.department.name}
                </span>
              ) : null}
            </span>
            <span className={cn('mt-0.5 block truncate', compact ? '@2xl:hidden' : '@xl:hidden')}>
              <TaskDueLabel task={task} today={today} />
              {!hideAssignee && task.assignee ? <span className="text-xs text-muted @sm:hidden"> · {firstName(task.assignee.name)}</span> : null}
            </span>
          </span>
        </button>
        {!compact ? (
          <div className="hidden w-44 min-w-0 @3xl:block">
            <span className={cn('block truncate text-body-sm', task.client ? 'text-fg' : 'text-subtle')}>{clientName}</span>
          </div>
        ) : null}
        {!hideAssignee ? (
          <>
            {!compact ? (
              <div className="hidden w-36 min-w-0 items-center gap-2 @2xl:flex">
                <MemberAvatar name={task.assignee?.name} unassigned={!task.assignee} />
                <span className={cn('truncate text-[13px]', task.assignee ? 'text-fg' : 'text-subtle')}>
                  {task.assignee ? shortName(task.assignee.name) : 'Sem responsável'}
                </span>
              </div>
            ) : null}
            <span
              className={cn('hidden shrink-0', compact ? '@sm:inline-flex' : '@sm:inline-flex @2xl:hidden')}
              title={task.assignee ? task.assignee.name : 'Sem responsável'}
            >
              <MemberAvatar name={task.assignee?.name} unassigned={!task.assignee} />
              <span className="sr-only">{task.assignee ? `Responsável: ${task.assignee.name}` : 'Sem responsável'}</span>
            </span>
          </>
        ) : null}
        {!compact ? (
          <div className="hidden w-36 @4xl:block">
            <span className={cn('inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap', STATUS_TEXT_CLASS[task.status])}>
              <TaskStatusGlyph status={task.status} className="size-3.5" />
              {TASK_STATUS_LABELS[task.status]}
            </span>
          </div>
        ) : null}
        <div className={cn('hidden w-36 text-right', compact ? '@2xl:block' : '@xl:block')}>
          <p className="tabular text-[13px] font-medium text-fg">{task.dueDate ? formatDateBR(task.dueDate) : '—'}</p>
          <TaskDueLabel task={task} today={today} beside />
        </div>
        <TaskRowMenu task={task} />
      </div>
    </div>
  );
}

/** "⋯" of a task row and card (spec §5.4): Abrir, Mudar situação ›, Atribuir a mim, Duplicar, Excluir. */
export function TaskRowMenu({ task, moveLabel = 'Mudar situação', className }: { task: Task; moveLabel?: string; className?: string }) {
  const { canWriteTasks, isAdmin } = usePermissions();
  const options = useTaskOptions();
  const me = options.data?.me;
  const status = useTaskStatusChange();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const { openTask, newTask } = useTaskSheetLinks();
  const [confirming, setConfirming] = useState(false);

  async function assignToMe() {
    if (!me) return;
    try {
      await update.mutateAsync({ id: task.id, patch: { assigneeId: me.id } });
      toast.success('Atribuída a você.');
    } catch (error) {
      toastError(error);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-md text-muted opacity-70 transition hover:bg-bg-subtle hover:text-fg group-hover:opacity-100 pointer-coarse:opacity-100',
              className,
            )}
            aria-label={`Ações de ${task.title}`}
          >
            <Ellipsis className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem icon={<ExternalLink />} onSelect={() => openTask(task.id)}>
            Abrir
          </DropdownMenuItem>
          {canWriteTasks ? (
            <>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger icon={<TaskStatusGlyph status={task.status} />}>{moveLabel}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={task.status}
                    onValueChange={(v) => void status.change(task, v as TaskStatus, moveLabel === 'Mover para' ? 'move' : 'menu')}
                  >
                    {TASK_STATUSES.map((s) => (
                      <DropdownMenuRadioItem key={s} value={s} icon={<TaskStatusGlyph status={s} />}>
                        {TASK_STATUS_LABELS[s]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              {me && task.assignee?.id !== me.id ? (
                <DropdownMenuItem icon={<UserRoundCheck />} onSelect={() => void assignToMe()}>
                  Atribuir a mim
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem icon={<Copy />} onSelect={() => newTask({ duplicateOf: task.id })}>
                Duplicar
              </DropdownMenuItem>
              {isAdmin ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem icon={<Trash2 />} tone="danger" onSelect={() => setConfirming(true)}>
                    Excluir
                  </DropdownMenuItem>
                </>
              ) : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {isAdmin ? (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={`Excluir “${task.title}”?`}
          description="Subtarefas e comentários também serão excluídos. Esta ação não pode ser desfeita."
          confirmLabel="Excluir tarefa"
          loading={remove.isPending}
          onConfirm={async () => {
            try {
              await remove.mutateAsync(task.id);
              setConfirming(false);
              toast.success('Tarefa excluída.');
            } catch (error) {
              toastError(error);
            }
          }}
        />
      ) : null}
    </>
  );
}
