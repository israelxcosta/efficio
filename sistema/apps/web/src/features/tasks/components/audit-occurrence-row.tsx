import type { ReactNode } from 'react';
import { ChevronRight, LockKeyhole } from 'lucide-react';
import { RECURRENCE_PERIOD_LABELS, TAX_REGIME_LABELS, type AuditClientRow, type AuditColumn, type AuditMatrixResponse, type ISODate, type OccurrenceCell } from '@effinance/shared';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { Tooltip } from '@/components/ui/tooltip';
import { usePermissions } from '@/features/auth/permissions';
import { cn } from '@/lib/utils';
import {
  cellConclusionLine,
  cellTip,
  clientDeadlineNote,
  clientNextTarget,
  clientProgress,
  concludedAtText,
  conclusionDelayDays,
  conclusionDelayText,
  monthClosesWith,
  obligationDeadlineDetail,
  sameDeadlines,
  situationException,
  stackedMeta,
  type AuditView,
} from '../audit-logic';
import { DUE_TONE_CLASS, shortDate, shortName } from '../due';
import { dateTimeBR } from '../format';
import { assigneeSourceText, deadlineTip, periodLabel } from '../occurrence';
import { useTaskSheetLinks } from '../task-links';
import { useCellStatus, type CellChangeContext } from '../use-cell-status';
import { OccurrenceCellControl, OccurrenceStatusGlyph } from './matrix-cell';

export type { AuditRowLead } from '../audit-logic';
import type { AuditRowLead } from '../audit-logic';

/**
 * Columns of the audit rows (spec §11.2, revision 4), shared by the parent rows of both views (client
 * and recurring task), the single columns header and the occurrence rows, so the tracks line up.
 * Literal, for Tailwind to generate the classes.
 * Wide (@6xl): lead, Departamento, Responsável, Prazo, Situação, Data de conclusão, Concluída por.
 * Medium (@4xl): lead, Responsável, Prazo, Situação, Conclusão. Below, each row is a `flex`.
 */
export const AUDIT_ROW_GRID =
  '@4xl:grid @4xl:grid-cols-[minmax(0,1fr)_8.5rem_10.5rem_9rem_6.5rem] @6xl:grid-cols-[minmax(0,1fr)_7rem_8.5rem_10.5rem_9rem_7rem_8rem]';

/**
 * The one columns header of a card (from @4xl), right under its bar, with the rows' grid and padding
 * (`px-1.5` outside, as the `ul p-1.5`). The first label follows the parent rows of the view.
 */
export function AuditColumnsHeader({ view }: { view: AuditView }) {
  return (
    <div aria-hidden className="hidden px-1.5 @4xl:block">
      <div className={cn('items-center gap-3 px-2 pt-2 pb-1.5 text-xs font-medium text-muted @lg:px-3', AUDIT_ROW_GRID)}>
        <span className="truncate pl-10">{view === 'client' ? 'Cliente' : 'Tarefa recorrente'}</span>
        <span className="hidden truncate @6xl:block">Departamento</span>
        <span className="truncate">Responsável</span>
        <span className="truncate">Prazo</span>
        <span className="truncate">Situação</span>
        <span className="hidden truncate @6xl:block">Data de conclusão</span>
        <span className="hidden truncate @6xl:block">Concluída por</span>
        <span className="truncate @6xl:hidden">Conclusão</span>
      </div>
    </div>
  );
}

/** Lock of a concluded month, with the moment of the last conclusion. */
export function MonthLock({ client, today, size = 'md' }: { client: Pick<AuditClientRow, 'monthConcludedAt'>; today: ISODate; size?: 'sm' | 'md' }) {
  if (!client.monthConcludedAt) return null;
  return (
    <Tooltip content={`Mês concluído. Última conclusão em ${dateTimeBR(client.monthConcludedAt)}`}>
      <span role="img" tabIndex={-1} aria-label={`Mês concluído em ${shortDate(client.monthConcludedAt.slice(0, 10), today)}`} className="inline-flex shrink-0 text-muted">
        <LockKeyhole className={size === 'sm' ? 'size-3' : 'size-3.5'} aria-hidden />
      </span>
    </Tooltip>
  );
}

/** "7/9" over the bar of what is concluded (`bg-success` at 100%), in the Situação track. */
export function ProgressTrack({ done, live }: { done: number; live: number }) {
  const ratio = live ? done / live : 0;
  return (
    <span data-col="progress" className="flex w-24 shrink-0 flex-col items-end gap-1 @sm:w-28 @4xl:w-auto @4xl:min-w-0 @4xl:items-start">
      <span className="tabular text-[13px] font-medium text-fg">
        {done}/{live}
      </span>
      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
        <span className={cn('block h-full rounded-full', ratio === 1 ? 'bg-success' : 'bg-data')} style={{ width: `${ratio * 100}%` }} />
      </span>
    </span>
  );
}

export interface AuditClientRowViewProps {
  client: AuditClientRow;
  cells: OccurrenceCell[];
  today: ISODate;
  expanded: boolean;
  /** Id of the region the row opens (the button's `aria-controls`). */
  regionId: string;
}

/**
 * Content of the client row of "Por cliente" (§11.4, revision 4), in the grid of the task row of "Por
 * tarefa": the arrow, the name with the lock and the regime (over Cliente, Departamento and
 * Responsável); the nearest pending target and the alert (Prazo); "7/9" and the bar (Situação); the
 * moment of a concluded month (Data de conclusão / Conclusão). Below @4xl, a `flex` with the alert in
 * the subtitle.
 */
export function AuditClientRowView({ client, cells, today, expanded, regionId }: AuditClientRowViewProps) {
  const progress = clientProgress(client);
  const next = clientNextTarget(cells);
  const note = clientDeadlineNote(client);
  return (
    <>
      <span data-region={regionId} className="flex min-w-0 flex-1 items-center gap-2.5 @lg:gap-3 @4xl:col-span-2 @6xl:col-span-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors group-hover/client:bg-bg-subtle group-hover/client:text-fg" aria-hidden>
          <ChevronRight className={cn('size-4 transition-transform duration-150', expanded && 'rotate-90')} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-fg">{client.name}</span>
            <MonthLock client={client} today={today} />
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {TAX_REGIME_LABELS[client.taxRegime]}
            {note ? <span className={cn('@4xl:hidden', DUE_TONE_CLASS[note.tone])}> · {note.text}</span> : null}
          </span>
        </span>
      </span>
      <span data-col="deadline" className="hidden min-w-0 @4xl:block">
        {next ? <span className="tabular block truncate text-[13px] font-medium text-fg">{shortDate(next, today)}</span> : null}
        {note ? <span className={cn('block truncate text-xs', DUE_TONE_CLASS[note.tone])}>{note.text}</span> : null}
      </span>
      <ProgressTrack done={progress.done} live={progress.live} />
      <span data-col="concluded-at" aria-hidden className="hidden min-w-0 @4xl:block">
        {client.monthConcludedAt ? <span className="tabular block truncate text-[13px] text-fg">{concludedAtText(client.monthConcludedAt, today)}</span> : null}
      </span>
    </>
  );
}

/** Context of a status change: names for the toast and whether it closes the client's month. */
export function changeContext(data: AuditMatrixResponse, column: AuditColumn, cell: OccurrenceCell, client: { name: string }, monthName: string, announce: (t: string) => void, status: string): CellChangeContext {
  const closes = status === 'done' && monthClosesWith(data.cells, cell);
  return { taskName: column.name, clientName: client.name, monthCloses: closes ? monthName.charAt(0).toUpperCase() + monthName.slice(1) : null, announce };
}

export interface AuditOccurrenceRowProps {
  lead: AuditRowLead;
  cell: OccurrenceCell;
  column: AuditColumn;
  client: AuditClientRow;
  data: AuditMatrixResponse;
  today: ISODate;
  monthName: string;
  announce: (t: string) => void;
  /** The responsible filter is someone else: the row stays clickable, at 70%. */
  dimmed: boolean;
}

/**
 * An occurrence (recurring task × client) inside the audit accordions, in both views (spec §11.2):
 * the status control (or its read-only look) and the row's columns.
 */
export function AuditOccurrenceRow({ lead, cell, column, client, data, today, monthName, announce, dimmed }: AuditOccurrenceRowProps) {
  const status = useCellStatus();
  const { openTask } = useTaskSheetLinks();
  const { canWriteTasks } = usePermissions();
  const department = column.department?.name ?? null;
  const control = canWriteTasks ? (
    <OccurrenceCellControl
      cell={cell}
      taskName={column.name}
      clientName={client.name}
      periodName={periodLabel(column, today)}
      department={department}
      busy={status.isBusy(cell.taskId)}
      large
      onChange={(s) => void status.change(cell, s, changeContext(data, column, cell, client, monthName, announce, s))}
      onReopen={(reason, s) => status.change(cell, s, changeContext(data, column, cell, client, monthName, announce, s), { reason })}
      onOpenTask={() => openTask(cell.taskId)}
    />
  ) : (
    <OccurrenceStatusGlyph cell={cell} large label={`${column.name}, ${client.name}: ${cellTip(cell, department)}`} />
  );
  return <AuditOccurrenceRowView lead={lead} cell={cell} column={column} client={client} today={today} control={control} dimmed={dimmed} onOpenTask={() => openTask(cell.taskId)} />;
}

export interface AuditOccurrenceRowViewProps {
  lead: AuditRowLead;
  cell: OccurrenceCell;
  column: AuditColumn;
  client: Pick<AuditClientRow, 'name' | 'taxRegime' | 'monthConcludedAt'>;
  today: ISODate;
  /** The status control, or its read-only look. */
  control: ReactNode;
  dimmed: boolean;
  onOpenTask: () => void;
}

/** The row itself (no data hooks): lead column, Departamento, Responsável, Prazo, Situação and the conclusion. */
export function AuditOccurrenceRowView({ lead, cell, column, client, today, control, dimmed, onOpenTask }: AuditOccurrenceRowViewProps) {
  const done = cell.status === 'done';
  const canceled = cell.status === 'canceled';
  const department = column.department?.name ?? null;
  const who = cell.assignee ? shortName(cell.assignee.name) : 'Sem responsável';
  const delay = conclusionDelayDays(cell);
  const exception = situationException(cell);
  const period = column.period === 'weekly' ? periodLabel(column, today) : column.period !== 'monthly' ? RECURRENCE_PERIOD_LABELS[column.period] : null;
  const name = lead === 'client' ? client.name : column.name;
  const same = sameDeadlines(cell, column);
  // Por cliente: only the alert or the legal date (the first line is the target). Por tarefa: nothing,
  // the task row says it once, unless this client has other dates.
  const deadlineDetail = lead === 'obligation' || !same ? obligationDeadlineDetail(cell, today) : null;
  const meta = stackedMeta(cell, lead, same, today);

  return (
    <li className={cn('flex min-h-13 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface @lg:px-3', AUDIT_ROW_GRID, dimmed && 'opacity-70')}>
      {/* Cliente / Obrigação (and, below @4xl, at most two more stacked lines) */}
      <div data-col="lead" className="min-w-0 flex-1 @lg:pl-10">
        <button
          type="button"
          onClick={onOpenTask}
          title={name}
          className={cn('flex max-w-full items-center gap-1.5 rounded-sm text-left text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', canceled ? 'text-muted' : 'text-fg')}
        >
          {lead === 'client' && client.monthConcludedAt ? (
            <span role="img" aria-label="Mês concluído" className="inline-flex shrink-0 text-muted">
              <LockKeyhole className="size-3" aria-hidden />
            </span>
          ) : null}
          <span className="truncate">{name}</span>
          {lead === 'obligation' && period ? <span className="shrink-0 text-xs font-normal text-muted">{period}</span> : null}
        </button>
        {lead === 'client' ? (
          <p className="hidden truncate text-xs text-muted @4xl:block">{TAX_REGIME_LABELS[client.taxRegime]}</p>
        ) : (
          <p className="hidden truncate text-xs text-muted @4xl:block @6xl:hidden">{department ?? 'Sem departamento'}</p>
        )}
        <p data-col="stacked-meta" className="truncate text-xs @4xl:hidden">
          <span className="text-muted">{meta.text}</span>
          {meta.alert ? <span className={DUE_TONE_CLASS[meta.alert.tone]}> · {meta.alert.text}</span> : null}
        </p>
        <StackedSituation cell={cell} today={today} delay={delay} />
      </div>

      {/* Departamento (wide level) */}
      <div data-col="department" className="hidden min-w-0 @6xl:block">
        <span className="sr-only">Departamento: </span>
        <span title={department ?? undefined} className={cn('block truncate text-body-sm', department ? 'text-fg' : 'text-subtle')}>
          {department ?? 'Sem departamento'}
        </span>
      </div>

      {/* Responsável */}
      <Tooltip content={(cell.assignee ? assigneeSourceText(cell.assigneeSource) : null) ?? 'Sem responsável'}>
        <div data-col="assignee" tabIndex={-1} className="hidden min-w-0 items-center gap-2 @4xl:flex">
          <span className="sr-only">Responsável: </span>
          <MemberAvatar name={cell.assignee?.name} unassigned={!cell.assignee} userId={cell.assignee?.id} />
          <span className={cn('truncate text-body-sm', cell.assignee ? 'text-fg' : 'text-subtle')}>{who}</span>
        </div>
      </Tooltip>

      {/* Prazo: the target and, below, only the alert or the legal date */}
      <div data-col="deadline" className="hidden min-w-0 @4xl:block">
        <span className="sr-only">Prazo: </span>
        <Tooltip content={deadlineTip(cell, today)}>
          <span tabIndex={-1} className="tabular block truncate text-[13px] font-medium text-fg">
            {shortDate(cell.targetDate, today)}
          </span>
        </Tooltip>
        {deadlineDetail ? (
          <span title={deadlineDetail.text} className={cn('block truncate text-xs', DUE_TONE_CLASS[deadlineDetail.tone])}>
            {deadlineDetail.text}
          </span>
        ) : null}
      </div>

      {/* Situação: the control and, only in the exceptions, a label (from @4xl; below, the stacked line) */}
      <div data-col="situation" className="flex shrink-0 items-center gap-2 @4xl:min-w-0">
        {control}
        {exception || delay ? (
          <span className="hidden min-w-0 @4xl:block">
            {exception ? <span className={cn('block truncate text-[13px]', exception.className)}>{exception.text}</span> : null}
            {delay ? <span className="block truncate text-xs font-medium text-orange-strong">{conclusionDelayText(delay)}</span> : null}
          </span>
        ) : null}
      </div>

      {/* Data de conclusão and Concluída por (wide); Conclusão (medium). The control already says it. */}
      <div data-col="concluded-at" aria-hidden className="hidden min-w-0 @6xl:block">
        {done && cell.concludedAt ? (
          <Tooltip content={dateTimeBR(cell.concludedAt)}>
            <span tabIndex={-1} className="tabular block truncate text-[13px] text-fg">
              {concludedAtText(cell.concludedAt, today)}
            </span>
          </Tooltip>
        ) : null}
      </div>
      <div data-col="concluded-by" aria-hidden className="hidden min-w-0 items-center gap-2 @6xl:flex">
        {done ? (
          cell.concludedBy ? (
            <>
              <MemberAvatar name={cell.concludedBy.name} userId={cell.concludedBy.id} />
              <span className="truncate text-body-sm text-fg">{shortName(cell.concludedBy.name)}</span>
            </>
          ) : (
            <span className="text-body-sm text-subtle">—</span>
          )
        ) : null}
      </div>
      <div data-col="conclusion" aria-hidden className="hidden min-w-0 @4xl:block @6xl:hidden">
        {done ? (
          <>
            {cell.concludedAt ? <span className="tabular block truncate text-[13px] text-fg">{concludedAtText(cell.concludedAt, today)}</span> : null}
            {cell.concludedBy ? <span className="block truncate text-xs text-muted">{shortName(cell.concludedBy.name)}</span> : <span className="block text-xs text-subtle">—</span>}
          </>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Third stacked line (below @4xl), only when concluded or in an exception: "Concluída em 05/11, 07:45 ·
 * Marina C." (the time from @sm), "Aguardando" or "Cancelada", and " · 2 dias de atraso", the only
 * text that wraps instead of truncating. Pending without an exception has no line: the glyph says it.
 */
function StackedSituation({ cell, today, delay }: { cell: OccurrenceCell; today: ISODate; delay: number | null }) {
  const exception = situationException(cell);
  if (cell.status !== 'done' && !exception) return null;
  const label = 'Concluída';
  const rest = (withTime: boolean) => (cellConclusionLine(cell, today, withTime) ?? label).slice(label.length);
  return (
    <p data-col="stacked-situation" className="flex flex-wrap items-baseline gap-x-1 text-xs @4xl:hidden">
      <span className="min-w-0 truncate">
        {cell.status === 'done' ? (
          <>
            <span className="text-success">{label}</span>
            <span className="text-muted @sm:hidden">{rest(false)}</span>
            <span className="hidden text-muted @sm:inline">{rest(true)}</span>
          </>
        ) : exception ? (
          <span className={exception.className}>{exception.text}</span>
        ) : null}
      </span>
      {delay ? <span className="shrink-0 font-medium text-orange-strong">· {conclusionDelayText(delay)}</span> : null}
    </p>
  );
}
