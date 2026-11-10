import { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { ClipboardCheck, Ellipsis, ExternalLink, Repeat } from 'lucide-react';
import { formatDateBR, type ISODate, type RecurringOccurrence } from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { CategoryIcon } from '@/components/ui/category-icon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AvatarStack, MemberAvatar } from '@/components/ui/member-avatar';
import { Tooltip } from '@/components/ui/tooltip';
import { hostsTaskSheets } from '@/components/layout/nav';
import { cn, pluralize } from '@/lib/utils';
import { DUE_TONE_CLASS, shortName } from '../due';
import { assigneesTip, auditHref, deadlineTip, doneFraction, groupDeadlineInfo, occurrenceParams, pendingText, periodLabel } from '../occurrence';
import { NeutralIcon } from './neutral-icon';
import { TaskStatusGlyph } from './task-status';

/** Which clients the occurrence sheet starts with (`ocorrencias=` in the URL). */
export type OccurrenceView = 'mine' | 'pending' | 'all';
const VIEW_PARAM: Record<OccurrenceView, string> = { mine: 'seus', pending: 'pendentes', all: 'todos' };

export function occurrenceViewFromParam(value: string | null): OccurrenceView | null {
  return value === 'seus' ? 'mine' : value === 'pendentes' ? 'pending' : value === 'todos' ? 'all' : null;
}

export const OCCURRENCE_SHEET_PARAMS = ['recorrente', 'periodo', 'ocorrencias'] as const;

/** Opens the occurrence sheet (`?recorrente=<id>&periodo=<key>`) over the current Gestão page. */
export function useOccurrenceSheetLinks() {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const here = hostsTaskSheets(pathname);
  const openOccurrence = useCallback(
    (o: Pick<RecurringOccurrence, 'recurringTaskId' | 'periodKey'>, view?: OccurrenceView) => {
      const sheet = { ...occurrenceParams(o), ...(view ? { ocorrencias: VIEW_PARAM[view] } : {}) };
      const base = here ? new URLSearchParams(params) : new URLSearchParams();
      for (const k of [...OCCURRENCE_SHEET_PARAMS, 'tarefa', 'nova']) base.delete(k);
      for (const [k, v] of Object.entries(sheet)) base.set(k, v);
      if (here) setParams(base);
      else navigate(`/tarefas?${base.toString()}`);
    },
    [here, navigate, params, setParams],
  );
  return { openOccurrence };
}

/** 36px ring of the concluded fraction (not a button); a complete one becomes the "Concluída" glyph. */
export function ProgressRing({ value, size = 36, label }: { value: number; size?: number; label: string }) {
  const done = value >= 1;
  if (done) {
    return (
      <Tooltip content={label}>
        <span role="img" aria-label={label} className="inline-flex shrink-0 items-center justify-center rounded-full bg-success-soft text-success" style={{ width: size, height: size }}>
          <TaskStatusGlyph status="done" />
        </span>
      </Tooltip>
    );
  }
  const r = (size - 3) / 2;
  const c = 2 * Math.PI * r;
  return (
    <Tooltip content={label}>
      <span role="img" aria-label={label} className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={3} className="stroke-bg-subtle" />
          {value > 0 ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth={3}
              strokeLinecap="round"
              className="stroke-data"
              strokeDasharray={`${Math.max(0.02, value) * c} ${c}`}
            />
          ) : null}
        </svg>
      </span>
    </Tooltip>
  );
}

interface OccurrenceRowProps {
  occurrence: RecurringOccurrence;
  today: ISODate;
  density?: 'default' | 'compact';
  /** "Minhas": the counts are yours, the responsibles column goes away. */
  mine?: boolean;
  /** Department in the subtitle (views with several departments). */
  showDepartment?: boolean;
}

/**
 * A recurring task in one period, summed over the clients in view (spec §5.6): progress ring,
 * name with the "Recorrente" badge, how many clients are pending, the effective responsibles, the
 * concluded count and the target with the legal deadline. Opens the occurrence sheet.
 */
export function RecurringOccurrenceRow({ occurrence: o, today, density = 'default', mine, showDepartment = true }: OccurrenceRowProps) {
  const compact = density === 'compact';
  const { openOccurrence } = useOccurrenceSheetLinks();
  const live = o.total - o.canceled;
  const fraction = doneFraction(o);
  const ringLabel = `${o.done} de ${pluralize(live, 'cliente concluído', 'clientes concluídos')}`;
  const deadline = groupDeadlineInfo(o, today, true);
  const inline = groupDeadlineInfo(o, today, false);
  const names = o.assignees.filter((a) => a.assignee).map((a) => a.assignee!.name);
  const open = () => openOccurrence(o, mine ? 'mine' : o.pending > 0 ? 'pending' : 'all');

  return (
    <div className="@container">
      <div className={cn('group flex items-center gap-3 rounded-lg transition-colors hover:bg-surface-muted', compact ? 'px-2 py-2' : 'px-3 py-3 @lg:px-4')}>
        <ProgressRing value={fraction} size={compact ? 32 : 36} label={ringLabel} />
        <button type="button" onClick={open} className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left" aria-label={`${o.name}: ${pendingText(o, Boolean(mine))}. Abrir.`}>
          {/* Same column as the category icon of a task row (from 384px). */}
          <span className="hidden @sm:contents">
            {o.category ? <CategoryIcon icon={o.category.icon} color={o.category.color} size={compact ? 'sm' : 'md'} /> : <NeutralIcon icon={Repeat} size={compact ? 'sm' : 'md'} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={cn('min-w-[4.5rem] truncate text-sm font-semibold', o.pending === 0 ? 'text-muted' : 'text-fg')}>{o.name}</span>
              <Badge tone="neutral" className="shrink-0 px-1.5 @md:px-2" title="Recorrente">
                <Repeat aria-hidden />
                <span className="sr-only @md:not-sr-only">Recorrente</span>
              </Badge>
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted">
              {pendingText(o, Boolean(mine))}
              {showDepartment && o.department ? ` · ${o.department.name}` : ''}
              {o.period === 'weekly' ? ` · ${periodLabel(o, today)}` : ''}
            </span>
            <span className={cn('mt-0.5 block truncate text-xs', compact ? '@2xl:hidden' : '@xl:hidden', DUE_TONE_CLASS[inline.tone])}>{inline.text}</span>
          </span>
        </button>
        {!compact ? (
          <div className="hidden w-44 @3xl:block">
            <span className="text-body-sm text-muted">{pluralize(live, 'cliente', 'clientes')}</span>
          </div>
        ) : null}
        {!mine ? (
          <Tooltip content={assigneesTip(o) || 'Sem responsável'}>
            <div className={cn('hidden min-w-0 items-center gap-2', compact ? '@sm:flex' : 'w-36 @2xl:flex')} tabIndex={-1}>
              {names.length === 1 ? (
                <>
                  <MemberAvatar name={names[0]} />
                  {!compact ? <span className="truncate text-[13px] text-fg">{shortName(names[0]!)}</span> : null}
                </>
              ) : names.length ? (
                <AvatarStack names={names} max={3} />
              ) : (
                <MemberAvatar unassigned />
              )}
              <span className="sr-only">{assigneesTip(o)}</span>
            </div>
          </Tooltip>
        ) : null}
        {!compact ? (
          <div className="hidden w-36 @4xl:block">
            <span className="tabular text-[13px] text-muted">
              {/* In "Abertas" the view only has the pending ones: say so instead of a misleading 0/N. */}
              {o.done === 0 && o.pending === live ? `${o.pending} ${o.pending === 1 ? 'pendente' : 'pendentes'}` : `${o.done}/${live} concluídas`}
            </span>
          </div>
        ) : null}
        <div className={cn('hidden min-w-0 text-right', compact ? 'w-44 @2xl:block' : 'w-48 @xl:block')}>
          <Tooltip content={deadlineTip(o, today)}>
            <p className="tabular text-[13px] font-medium text-fg" tabIndex={-1}>
              {formatDateBR(o.targetDate)}
            </p>
          </Tooltip>
          <span className={cn('block truncate text-xs', DUE_TONE_CLASS[deadline.tone])} title={deadline.text}>
            {deadline.text}
          </span>
        </div>
        <OccurrenceRowMenu occurrence={o} />
      </div>
    </div>
  );
}

/** "⋯" of the grouped row: open in the audit, see the recurring task. */
export function OccurrenceRowMenu({ occurrence: o, className }: { occurrence: RecurringOccurrence; className?: string }) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md text-muted opacity-70 transition hover:bg-bg-subtle hover:text-fg group-hover:opacity-100 pointer-coarse:opacity-100',
            className,
          )}
          aria-label={`Ações de ${o.name}`}
        >
          <Ellipsis className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem icon={<ClipboardCheck />} onSelect={() => navigate(auditHref(o))}>
          Abrir na auditoria
        </DropdownMenuItem>
        <DropdownMenuItem icon={<ExternalLink />} onSelect={() => navigate(`/tarefas/recorrentes?recorrente=${o.recurringTaskId}`)}>
          Ver tarefa recorrente
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
