import { forwardRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Popover } from 'radix-ui';
import { Check, CirclePause, CircleX, Contrast } from 'lucide-react';
import { ASSIGNEE_SOURCE_LABELS, TASK_STATUS_LABELS, type OccurrenceCell, type OpenTaskStatus, type TaskStatus } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useTaskHistory } from '../api';
import { concludedInitials, nextCellStatus, statusForKey } from '../audit-logic';
import { dateTimeBR } from '../format';
import { auditEvents } from '../timeline';
import { ReopenReasonForm } from './reopen';

/** "A fazer · Ana Paula Ribeiro (responsável do cliente no Fiscal)". */
export function cellTip(cell: OccurrenceCell, department: string | null): string {
  if (cell.status === 'done') return `Concluída${cell.concludedBy ? ` por ${cell.concludedBy.name}` : ''}${cell.concludedAt ? ` em ${dateTimeBR(cell.concludedAt)}` : ''}`;
  const who = cell.assignee ? cell.assignee.name : 'Sem responsável';
  const source =
    cell.assigneeSource === 'client'
      ? department
        ? `responsável do cliente no ${department}`
        : 'responsável do cliente'
      : cell.assigneeSource
        ? ASSIGNEE_SOURCE_LABELS[cell.assigneeSource].toLowerCase()
        : null;
  return `${TASK_STATUS_LABELS[cell.status]} · ${who}${source ? ` (${source})` : ''}`;
}

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

/** The visual of a cell (spec §3.2): ring, "Em andamento", "Aguardando", the concluded pill, canceled. */
const CellButton = forwardRef<HTMLButtonElement, CellButtonProps>(function CellButton(
  { cell, label, tip, busy, dimmed, large, tabIndex, onClick, onKeyDown, onFocus, ...rest },
  ref,
) {
  const s = cell.status;
  const box = large ? 'h-10 min-w-10' : 'h-8 min-w-8 pointer-coarse:h-10 pointer-coarse:min-w-10';
  let content: ReactNode;
  let tone: string;
  if (s === 'done') {
    tone = cn('w-[52px] rounded-full bg-success-soft text-success gap-0.5', large && 'w-[60px]');
    content = (
      <>
        <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
        <span className="text-mini font-semibold">{concludedInitials(cell.concludedBy?.name)}</span>
      </>
    );
  } else if (s === 'in_progress') {
    tone = 'rounded-full bg-primary-soft text-primary-soft-fg';
    content = <Contrast className="size-4" strokeWidth={1.75} aria-hidden />;
  } else if (s === 'waiting_client') {
    tone = 'rounded-full bg-bg-subtle text-muted';
    content = <CirclePause className="size-4" strokeWidth={1.75} aria-hidden />;
  } else if (s === 'canceled') {
    tone = 'rounded-full text-subtle';
    content = <CircleX className="size-4" strokeWidth={1.75} aria-hidden />;
  } else {
    tone = 'rounded-full';
    content = <span className={cn('rounded-full border border-border-strong', large ? 'size-6' : 'size-5')} aria-hidden />;
  }
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
          'inline-flex shrink-0 items-center justify-center transition-[background-color,opacity] duration-150 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          box,
          tone,
          s !== 'done' && (large ? 'w-10' : 'w-8 pointer-coarse:w-10'),
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
