import { Circle } from 'lucide-react';
import { dateInTimeZone, type ISODate, type TaskFlow } from '@effinance/shared';
import { cn } from '@/lib/utils';
import { daysText, shortDate, shortName } from '../due';
import { TaskStatusGlyph } from './task-status';

interface FlowStepperProps {
  flow: TaskFlow;
  today: ISODate;
  /** The task open in the sheet ("esta tarefa"). */
  currentTaskId?: string;
  /** Opens the task of a step (done or current). */
  onOpenTask?: (taskId: string) => void;
  /** Without the outer box (the read-only "Ver etapas" sheet). */
  bare?: boolean;
}

/**
 * Steps of a process (spec §9.1, item 2): done steps with the date they were concluded, the current
 * one, and the ones waiting with their deadline in days after the previous one.
 */
export function FlowStepper({ flow, today, currentTaskId, onOpenTask, bare }: FlowStepperProps) {
  const current = flow.steps.find((s) => s.state === 'current');
  return (
    <div className={cn(!bare && 'rounded-lg bg-surface-muted p-3')}>
      <p className="text-body-sm text-muted">
        Processo: <span className="font-semibold text-fg">{flow.title}</span>
        {current ? ` · etapa ${current.position} de ${flow.stepCount}` : flow.completedAt ? ' · concluído' : ''}
      </p>
      <ol className="mt-2 flex flex-col gap-1" aria-label={`Etapas de ${flow.title}`}>
        {flow.steps.map((s) => {
          const isThis = s.task?.id && s.task.id === currentTaskId;
          const clickable = Boolean(onOpenTask && s.task && !isThis && s.state !== 'waiting');
          const detail =
            s.state === 'done'
              ? s.completedAt
                ? `concluída em ${shortDate(dateInTimeZone(new Date(s.completedAt)), today)}`
                : 'concluída'
              : s.state === 'current'
                ? isThis
                  ? 'esta tarefa'
                  : `em andamento${s.assignee ? ` · ${shortName(s.assignee.name)}` : ''}${s.task?.dueDate ? ` · vence ${shortDate(s.task.dueDate, today)}` : ''}`
                : `começa quando a anterior for concluída${s.relativeDays !== null ? ` · prazo de ${daysText(s.relativeDays)}` : s.dueDate ? ` · vence ${shortDate(s.dueDate, today)}` : ''}`;
          const content = (
            <>
              <span className={cn('mt-0.5 shrink-0', s.state === 'done' ? 'text-success' : s.state === 'current' ? 'text-brand-text' : 'text-subtle')}>
                {s.state === 'waiting' ? <Circle className="size-4" strokeWidth={1.75} aria-hidden /> : <TaskStatusGlyph status={s.state === 'done' ? 'done' : (s.task?.status ?? 'todo')} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block text-body-sm', s.state === 'waiting' ? 'text-muted' : 'text-fg', isThis && 'font-semibold')}>
                  {s.position}. {s.title}
                </span>
                <span className={cn('block text-caption', s.state === 'current' && s.task?.overdue ? 'text-danger' : 'text-muted')}>{detail}</span>
              </span>
            </>
          );
          return (
            <li key={s.id}>
              {clickable ? (
                <button type="button" onClick={() => onOpenTask!(s.task!.id)} className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left hover:bg-bg-subtle">
                  {content}
                </button>
              ) : (
                <div className="flex items-start gap-2 px-1.5 py-1" aria-current={isThis ? 'step' : undefined}>
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Dots of a process in a row (spec §12.1): done in data, the current with a ring, waiting in grey. */
export function FlowDots({ flow, max = 8 }: { flow: Pick<TaskFlow, 'steps' | 'stepCount' | 'doneCount'>; max?: number }) {
  const shown = flow.steps.slice(0, max);
  const rest = flow.steps.length - shown.length;
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {shown.map((s) => (
        <span
          key={s.id}
          className={cn(
            'size-2 rounded-full',
            s.state === 'done' ? 'bg-data' : s.state === 'current' ? 'bg-surface ring-2 ring-data' : 'bg-border-strong',
          )}
        />
      ))}
      {rest > 0 ? <span className="text-mini text-muted">+{rest}</span> : null}
    </span>
  );
}
