import { forwardRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Popover } from 'radix-ui';
import { CirclePause, CircleX, Contrast } from 'lucide-react';
import { type OccurrenceCell, type OpenTaskStatus, type TaskStatus } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useTaskHistory } from '../api';
import { cellTip, nextCellStatus, statusForKey } from '../audit-logic';
import { dateTimeBR } from '../format';
import { auditEvents } from '../timeline';
import { ReopenReasonForm } from './reopen';
import { TaskStatusGlyph } from './task-status';

interface CellButtonProps {
  cell: OccurrenceCell;
  label: string;
  tip: string;
  busy?: boolean;
  dimmed?: boolean;
  /** 40px (touch, accordions on phones) instead of 32px. */
  large?: boolean;
  tabIndex?: number;
  onClick?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  onFocus?: () => void;
}

/** Look of each status (spec §3.2): the same circle for all, 32px (40px with `large`). */
function cellLook(status: TaskStatus, large?: boolean): { tone: string; content: ReactNode } {
  switch (status) {
    case 'done':
      return { tone: 'bg-success-soft text-success', content: <TaskStatusGlyph status="done" className="size-4" /> };
    case 'in_progress':
      return { tone: 'bg-primary-soft text-primary-soft-fg', content: <Contrast className="size-4" strokeWidth={1.75} aria-hidden /> };
    case 'waiting_client':
      return { tone: 'bg-bg-subtle text-muted', content: <CirclePause className="size-4" strokeWidth={1.75} aria-hidden /> };
    case 'canceled':
      return { tone: 'text-subtle', content: <CircleX className="size-4" strokeWidth={1.75} aria-hidden /> };
    default:
      return { tone: '', content: <span className={cn('rounded-full border border-border-strong', large ? 'size-6' : 'size-5')} aria-hidden /> };
  }
}

/** The status control: ring, "Em andamento", "Aguardando", the green check (no initials), canceled. */
const CellButton = forwardRef<HTMLButtonElement, CellButtonProps>(function CellButton(
  { cell, label, tip, busy, dimmed, large, tabIndex, onClick, onKeyDown, onFocus, ...rest },
  ref,
) {
  const { tone, content } = cellLook(cell.status, large);
  return (
    <Tooltip content={tip}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-busy={busy || undefined}
        tabIndex={tabIndex}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full transition-[background-color,opacity] duration-150 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          large ? 'h-10 w-10' : 'h-8 w-8 pointer-coarse:h-10 pointer-coarse:w-10',
          tone,
          busy && 'opacity-70',
          dimmed && 'opacity-50',
        )}
        {...rest}
      >
        {content}
      </button>
    </Tooltip>
  );
});

/**
 * The same look as the control for who cannot write tasks (spec §3.2): a `span role="img"` with the
 * control's accessible text (who concluded and when, with the delay) and its tooltip.
 */
export function OccurrenceStatusGlyph({ cell, large, label }: { cell: OccurrenceCell; large?: boolean; label: string }) {
  const { tone, content } = cellLook(cell.status, large);
  return (
    <Tooltip content={cellTip(cell, null)}>
      <span role="img" aria-label={label} tabIndex={-1} className={cn('inline-flex shrink-0 items-center justify-center rounded-full', large ? 'size-10' : 'size-8', tone)}>
        {content}
      </span>
    </Tooltip>
  );
}

export interface OccurrenceCellControlProps {
  cell: OccurrenceCell;
  taskName: string;
  clientName: string;
  /** "outubro de 2026" (the popover header). */
  periodName: string;
  department: string | null;
  busy?: boolean;
  dimmed?: boolean;
  large?: boolean;
  tabIndex?: number;
  onFocus?: () => void;
  /** Moves the status (the matrix cycle, keys 1–3). */
  onChange: (status: TaskStatus) => void;
  /** Reopens a concluded cell with the reason. */
  onReopen: (reason: string, status: OpenTaskStatus) => Promise<boolean>;
  /** The occurrence in the task sheet (canceled cells, Shift+Enter, "Abrir tarefa"). */
  onOpenTask: () => void;
  /** Arrow keys of the grid (handled by the matrix). */
  onNavKey?: (e: KeyboardEvent<HTMLButtonElement>) => void;
}

/**
 * A cell of the audit (spec §11.2): a click (Enter, Space) advances A fazer → Em andamento →
 * Concluída; 1, 2 and 3 set it; Shift+Enter opens the task. A concluded cell opens the conclusion
 * popover (who, when, history, "Reabrir" with the reason); a canceled one opens the task.
 */
export function OccurrenceCellControl(p: OccurrenceCellControlProps) {
  const { cell } = p;
  const [open, setOpen] = useState(false);
  const label = `${p.taskName}, ${p.clientName}: ${cellTip(cell, p.department)}`;

  function activate() {
    if (cell.status === 'canceled') return p.onOpenTask();
    if (cell.status === 'done') return setOpen(true);
    const next = nextCellStatus(cell.status);
    if (next) p.onChange(next);
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      return p.onOpenTask();
    }
    const direct = statusForKey(e.key);
    if (direct) {
      e.preventDefault();
      if (cell.status === 'done') {
        if (direct !== 'done') setOpen(true);
        return;
      }
      if (cell.status !== 'canceled') p.onChange(direct);
      return;
    }
    p.onNavKey?.(e);
  }

  const button = (
    <CellButton
      cell={cell}
      label={label}
      tip={cellTip(cell, p.department)}
      busy={p.busy}
      dimmed={p.dimmed}
      large={p.large}
      tabIndex={p.tabIndex}
      onFocus={p.onFocus}
      onClick={cell.status === 'done' ? undefined : activate}
      onKeyDown={onKeyDown}
    />
  );
  if (cell.status !== 'done') return button;
  return (
    <ConclusionPopover
      open={open}
      onOpenChange={setOpen}
      cell={cell}
      header={`${p.taskName} · ${p.clientName} · ${p.periodName}`}
      onReopen={async (reason, status) => {
        const ok = await p.onReopen(reason, status);
        if (ok) setOpen(false);
        return ok;
      }}
      onOpenTask={() => {
        setOpen(false);
        p.onOpenTask();
      }}
    >
      {button}
    </ConclusionPopover>
  );
}

interface ConclusionPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cell: OccurrenceCell;
  header: string;
  children: ReactNode;
  onReopen: (reason: string, status: OpenTaskStatus) => Promise<boolean>;
  onOpenTask: () => void;
}

/**
 * Who concluded an occurrence and when, its history of conclusions and reopenings, and "Reabrir"
 * for who concluded it or an administrator (spec §11.6). Reopening never happens in one click.
 */
export function ConclusionPopover({ open, onOpenChange, cell, header, children, onReopen, onOpenTask }: ConclusionPopoverProps) {
  const [reopening, setReopening] = useState(false);
  const [saving, setSaving] = useState(false);
  const history = useTaskHistory(cell.taskId, { enabled: open });
  const events = auditEvents(history.data?.items ?? []);
  const hasReopenings = events.some((e) => e.kind === 'reopened');
  const titleId = `conclusion-${cell.taskId}`;

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setReopening(false);
      }}
    >
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          role="dialog"
          aria-labelledby={titleId}
          side="bottom"
          align="center"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-surface p-4 shadow-lg data-[state=open]:animate-fade-in"
        >
          <p id={titleId} className="text-caption text-muted">
            {header}
          </p>
          {reopening ? (
            <div className="mt-3">
              <ReopenReasonForm
                busy={saving}
                onCancel={() => setReopening(false)}
                onConfirm={async (reason, status) => {
                  setSaving(true);
                  await onReopen(reason, status);
                  setSaving(false);
                }}
              />
            </div>
          ) : (
            <>
              <p className="mt-1.5 text-body-sm text-fg">
                Concluída{cell.concludedBy ? (
                  <>
                    {' '}
                    por <span className="font-semibold">{cell.concludedBy.name}</span>
                  </>
                ) : null}
                {cell.concludedAt ? ` em ${dateTimeBR(cell.concludedAt)}` : ''}
                {cell.concludedOnTime === false ? <span className="text-muted"> (depois do prazo legal)</span> : null}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {cell.canReopen ? (
                  <Button variant="outline" size="sm" onClick={() => setReopening(true)}>
                    Reabrir
                  </Button>
                ) : null}
                <Button variant="link" size="sm" onClick={onOpenTask}>
                  Abrir tarefa
                </Button>
              </div>
              {!cell.canReopen ? <p className="mt-2 text-caption text-muted">Só quem concluiu ou um administrador pode reabrir.</p> : null}
              {hasReopenings ? (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="text-caption font-semibold text-muted">Histórico</p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {events.slice(0, 5).map((e) => (
                      <li key={e.id} className="text-caption text-muted">
                        {e.kind === 'done' ? 'Concluída' : 'Reaberta'}
                        {e.who ? ` por ${e.who}` : ''} em {dateTimeBR(e.at).replace(/\/\d{4} às/, ' às')}
                        {e.reason ? (
                          <>
                            : <span className="text-fg">“{e.reason}”</span>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {events.length > 5 ? (
                    <Button variant="link" size="sm" className="mt-1 text-caption" onClick={onOpenTask}>
                      Ver tudo ({events.length})
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Placeholder of a client × recurring task that does not apply (no cell). */
export function NotApplicableCell() {
  return (
    <span className="inline-flex size-8 items-center justify-center text-subtle" aria-label="Não se aplica" role="img">
      —
    </span>
  );
}
