import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronsUp, ChevronUp, Circle, CircleCheck, CirclePause, CircleX, Contrast } from 'lucide-react';
import { TASK_STATUS_LABELS, type ISODate, type Task, type TaskPriority, type TaskStatus } from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import { formatDateTime } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { completedByText, DUE_TONE_CLASS, taskDueInfo } from '../due';

/** One shape per status (spec §3.1); only "Em andamento" and "Concluída" get a colour. */
export function TaskStatusGlyph({ status, className }: { status: TaskStatus; className?: string }) {
  const props = { className: cn('size-4', className), strokeWidth: 1.75, 'aria-hidden': true } as const;
  switch (status) {
    case 'in_progress':
      return <Contrast {...props} />;
    case 'waiting_client':
      return <CirclePause {...props} />;
    case 'done':
      return <CircleCheck {...props} fill="currentColor" fillOpacity={0.15} />;
    case 'canceled':
      return <CircleX {...props} />;
    default:
      return <Circle {...props} />;
  }
}

/** Text colour of the status in the "Situação" column. */
export const STATUS_TEXT_CLASS: Record<TaskStatus, string> = {
  todo: 'text-muted',
  in_progress: 'text-brand-text',
  waiting_client: 'text-muted',
  done: 'text-success',
  canceled: 'text-subtle',
};

const BUTTON_TONE: Record<TaskStatus, string> = {
  todo: 'bg-bg-subtle text-muted',
  in_progress: 'bg-primary-soft text-primary-soft-fg',
  waiting_client: 'bg-bg-subtle text-muted',
  done: 'bg-success-soft text-success',
  canceled: 'bg-bg-subtle text-subtle',
};

interface TaskStatusButtonProps {
  status: TaskStatus;
  taskTitle: string;
  /** Called with `done` (open task) or `reopen` (concluded task). */
  onToggle: (action: 'done' | 'reopen') => void;
  size?: 'sm' | 'md';
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string | null;
}

/**
 * Round button at the left of a task row (in place of Contas a pagar's 👍/👎): concludes an open task
 * (hover previews the check) or reopens a concluded one. Pops when the status changes.
 */
export function TaskStatusButton({ status, taskTitle, onToggle, size = 'md', loading, disabled, disabledReason }: TaskStatusButtonProps) {
  const [animate, setAnimate] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setAnimate(true);
    const t = setTimeout(() => setAnimate(false), 300);
    return () => clearTimeout(t);
  }, [status]);

  const done = status === 'done';
  const canceled = status === 'canceled';
  const open = !done && !canceled;
  const label = TASK_STATUS_LABELS[status];
  const blocked = disabled || canceled;
  const tip = disabled ? disabledReason : canceled ? 'Cancelada. Reabra pelo menu' : done ? 'Reabrir' : 'Concluir';
  const aria = disabled
    ? `${label}: ${taskTitle}. ${disabledReason ?? ''}`
    : canceled
      ? `${label}: ${taskTitle}. Reabra pelo menu.`
      : `${label}: ${taskTitle}. Ativar para ${done ? 'reabrir' : 'concluir'}.`;

  return (
    <Tooltip content={tip}>
      <button
        type="button"
        aria-pressed={done}
        aria-label={aria}
        aria-disabled={blocked || undefined}
        onClick={(e) => {
          e.stopPropagation();
          if (blocked || loading) return;
          onToggle(done ? 'reopen' : 'done');
        }}
        className={cn(
          'group/status relative inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-150 pointer-coarse:size-10',
          size === 'sm' ? 'size-8' : 'size-9',
          BUTTON_TONE[status],
          open && !blocked && 'hover:bg-success-soft/60 hover:text-success focus-visible:bg-success-soft/60 focus-visible:text-success',
          done && !blocked && 'hover:brightness-95',
          blocked && 'cursor-not-allowed',
          disabled && 'opacity-60',
          animate && 'animate-pop',
          loading && 'opacity-70',
        )}
      >
        <span className={cn('inline-flex', open && !blocked && 'group-hover/status:hidden group-focus-visible/status:hidden')}>
          <TaskStatusGlyph status={status} />
        </span>
        {open && !blocked ? (
          <Check className="hidden size-4 group-hover/status:block group-focus-visible/status:block" strokeWidth={2.25} aria-hidden />
        ) : null}
      </button>
    </Tooltip>
  );
}

/** Urgente and Alta on rows and cards; Média is the default and shows nothing (spec §3.3). */
export function PriorityBadge({ priority, show = 'row', className }: { priority: TaskPriority; show?: 'row' | 'detail'; className?: string }) {
  if (priority === 'urgent')
    return (
      <Badge tone="warning" className={cn('shrink-0', className)}>
        <ChevronsUp aria-hidden /> Urgente
      </Badge>
    );
  if (priority === 'high')
    return (
      <Badge tone="neutral" className={cn('shrink-0', className)}>
        <ChevronUp aria-hidden /> Alta
      </Badge>
    );
  if (show === 'detail' && priority === 'low')
    return (
      <Badge tone="neutral" className={cn('shrink-0', className)}>
        <ChevronDown aria-hidden /> Baixa
      </Badge>
    );
  if (show === 'detail') return <span className={cn('text-sm text-muted', className)}>Média</span>;
  return null;
}

/** Due status text (§3.5): "Venceu há 3 dias", "Vence hoje", "Concluída em 14/10"… */
export function TaskDueLabel({ task, today, beside = false, className }: { task: Task; today: ISODate; beside?: boolean; className?: string }) {
  const info = taskDueInfo(task, today, beside);
  const tip = completedByText(task, formatDateTime);
  const label = <span className={cn('text-xs', DUE_TONE_CLASS[info.tone], className)}>{info.text}</span>;
  return tip ? (
    <Tooltip content={tip}>
      <span tabIndex={-1}>{label}</span>
    </Tooltip>
  ) : (
    label
  );
}
