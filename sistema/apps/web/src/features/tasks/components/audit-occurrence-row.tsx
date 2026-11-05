import type { ReactNode } from 'react';
import { LockKeyhole } from 'lucide-react';
import { RECURRENCE_PERIOD_LABELS, TAX_REGIME_LABELS, type AuditClientRow, type AuditColumn, type AuditMatrixResponse, type ISODate, type OccurrenceCell } from '@effinance/shared';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { Tooltip } from '@/components/ui/tooltip';
import { usePermissions } from '@/features/auth/permissions';
import { cn } from '@/lib/utils';
import {
  cellConclusionLine,
  cellDeadlines,
  cellSituationText,
  cellTip,
  concludedAtText,
  conclusionDelayDays,
  conclusionDelayText,
  isPendingCell,
  monthClosesWith,
  sameDeadlines,
} from '../audit-logic';
import { DUE_TONE_CLASS, shortDate, shortName } from '../due';
import { dateTimeBR } from '../format';
import { assigneeSourceText, deadlineTip, openDeadlineInfo, periodLabel } from '../occurrence';
import { useTaskSheetLinks } from '../task-links';
import { useCellStatus, type CellChangeContext } from '../use-cell-status';
import { OccurrenceCellControl, OccurrenceStatusGlyph } from './matrix-cell';
import { STATUS_TEXT_CLASS } from './task-status';

export type AuditRowLead = 'client' | 'obligation';

/**
 * Columns of the audit rows (spec §11.2), shared by the task row of "Por tarefa", the columns header
 * and the occurrence rows, so the tracks line up. Literal, for Tailwind to generate the classes.
 * Wide (@6xl): lead, Departamento, Responsável, Prazo, Situação, Data de conclusão, Concluída por.
 * Medium (@4xl): lead, Responsável, Prazo, Situação, Conclusão. Below, each row is a `flex`.
 * Prazo is 10.5rem (spec: 9rem): "Prazo legal venceu há 20 dias" needs 167px; the conclusion tracks give it back.
 */
export const AUDIT_ROW_GRID =
  '@4xl:grid @4xl:grid-cols-[minmax(0,1fr)_8.5rem_10.5rem_11rem_6.5rem] @6xl:grid-cols-[minmax(0,1fr)_7rem_8.5rem_10.5rem_11rem_7rem_8rem]';

/** First line of an opened region: the names of the columns (from @4xl), with the rows' grid and padding. */
export function AuditColumnsHeader({ lead }: { lead: AuditRowLead }) {
  return (
    <div aria-hidden className={cn('hidden items-center gap-3 px-2 pt-1 pb-1.5 text-xs font-medium text-muted @lg:px-3', AUDIT_ROW_GRID)}>
      <span className="truncate @lg:pl-10">{lead === 'client' ? 'Cliente' : 'Obrigação'}</span>
      <span className="hidden truncate @6xl:block">Departamento</span>
      <span className="truncate">Responsável</span>
      <span className="truncate">Prazo</span>
      <span className="truncate">Situação</span>
      <span className="hidden truncate @6xl:block">Data de conclusão</span>
      <span className="hidden truncate @6xl:block">Concluída por</span>
      <span className="truncate @6xl:hidden">Conclusão</span>
    </div>
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
  const period = column.period === 'weekly' ? periodLabel(column, today) : column.period !== 'monthly' ? RECURRENCE_PERIOD_LABELS[column.period] : null;
  const name = lead === 'client' ? client.name : column.name;
  const showDeadlineDetail = lead === 'obligation' || !sameDeadlines(cell, column);
  const deadlineDetail = !showDeadlineDetail
    ? null
    : isPendingCell(cell)
      ? openDeadlineInfo(cell, today, true)
      : cell.targetDate < cell.legalDueDate
        ? { text: `legal ${shortDate(cell.legalDueDate, today)}`, tone: 'muted' as const }
        : null;
  const stackedDeadline = cellDeadlines(cell, today);

  return (
    <li className={cn('flex min-h-13 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface @lg:px-3', AUDIT_ROW_GRID, dimmed && 'opacity-70')}>
      {/* Cliente / Obrigação (and, below @4xl, the stacked lines) */}
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
          <p className="truncate text-xs text-muted">
            {TAX_REGIME_LABELS[client.taxRegime]}
            <span className="@4xl:hidden"> · {who}</span>
          </p>
        ) : (
          <p className="truncate text-xs text-muted @6xl:hidden">
            {department ?? 'Sem departamento'}
            <span className="@4xl:hidden"> · {who}</span>
          </p>
        )}
        {showDeadlineDetail ? (
          <p className="truncate text-xs @4xl:hidden">
            <span className="text-muted">{stackedDeadline.dates}</span>
            {stackedDeadline.status && stackedDeadline.status.tone !== 'muted' ? <span className={DUE_TONE_CLASS[stackedDeadline.status.tone]}> · {stackedDeadline.status.text}</span> : null}
          </p>
        ) : null}
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

      {/* Prazo: the target and, below, how the deadline stands */}
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

      {/* Situação: the control and its label (the label from @4xl; below, the stacked line says it) */}
      <div data-col="situation" className="flex shrink-0 items-center gap-2 @4xl:min-w-0">
        {control}
        <span className="hidden min-w-0 @4xl:block">
          <span className={cn('block truncate text-[13px]', STATUS_TEXT_CLASS[cell.status])}>{cellSituationText(cell)}</span>
          {delay ? <span className="block truncate text-xs font-medium text-warning">{conclusionDelayText(delay)}</span> : null}
        </span>
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
 * Situation line of the stacked level (below @4xl): the label in its colour while pending; concluded,
 * "Concluída em 05/11, 07:45 · Marina C." (the time from @sm) and " · 2 dias de atraso", the only text
 * that wraps instead of truncating.
 */
function StackedSituation({ cell, today, delay }: { cell: OccurrenceCell; today: ISODate; delay: number | null }) {
  const label = cellSituationText(cell);
  const rest = (withTime: boolean) => (cellConclusionLine(cell, today, withTime) ?? label).slice(label.length);
  return (
    <p data-col="stacked-situation" className="flex flex-wrap items-baseline gap-x-1 text-xs @4xl:hidden">
      <span className="min-w-0 truncate">
        <span className={STATUS_TEXT_CLASS[cell.status]}>{label}</span>
        {cell.status === 'done' ? (
          <>
            <span className="text-muted @sm:hidden">{rest(false)}</span>
            <span className="hidden text-muted @sm:inline">{rest(true)}</span>
          </>
        ) : null}
      </span>
      {delay ? <span className="shrink-0 font-medium text-warning">· {conclusionDelayText(delay)}</span> : null}
    </p>
  );
}
