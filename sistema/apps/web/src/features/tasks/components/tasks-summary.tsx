import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { formatMonthKey, type TaskListSummary, type TaskScope, type TaskSituation } from '@effinance/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { cn, pluralize } from '@/lib/utils';
import { daysText } from '../due';

/** Label over a figure (the ClientsSummary one). */
export function SummaryLabel({ children, info }: { children: ReactNode; info?: string }) {
  return (
    <span className="flex h-5 items-center gap-1.5 text-body-sm font-medium text-muted">
      {children}
      {info ? (
        <Tooltip content={info}>
          <span tabIndex={0} role="img" aria-label={info} className="rounded-sm text-subtle transition-colors hover:text-muted">
            <Info className="size-3.5" aria-hidden />
          </span>
        </Tooltip>
      ) : null}
    </span>
  );
}

/** Quiet toggle of a list filter: hover tint, the active fill while the list is filtered by it. */
export const toggleClass =
  'rounded-md transition-colors duration-150 hover:bg-surface-muted aria-pressed:bg-bg-subtle aria-pressed:hover:bg-bg-subtle';

export const monthName = (month: string) => formatMonthKey(month, 'long').split(' ')[0]!.toLowerCase();

interface TasksSummaryProps {
  summary: TaskListSummary | undefined;
  scope: TaskScope;
  situation: TaskSituation;
  department: string;
  onSituation: (s: TaskSituation) => void;
  onDepartment: (id: string) => void;
  onOpenTask: (id: string) => void;
}

/**
 * Head of Tarefas (spec §7.2): the overdue tasks with the oldest one, what is open, what concluded
 * in the month and the open work per department (not in "Minhas": it would be only you; the pending work
 * per client has its own card below the list). Same filters as the list except the situation; every
 * cell toggles a filter.
 */
export function TasksSummary({ summary, scope, situation, department, onSituation, onDepartment, onOpenTask }: TasksSummaryProps) {
  const toggle = (s: TaskSituation) => onSituation(situation === s ? 'open' : s);
  // By department, not by person: it stays readable however many people the office has.
  const byAssignee = scope !== 'mine';
  const rows = summary && byAssignee
    ? (summary.openByDepartment ?? []).slice(0, 6).map((r) => ({
        key: r.department?.id ?? '',
        label: r.department?.name ?? 'Sem departamento',
        muted: !r.department,
        open: r.open,
        overdue: r.overdue,
      }))
    : [];
  const max = Math.max(1, ...rows.map((r) => r.open));
  const month = summary ? monthName(summary.month) : '';

  return (
    <section aria-label="Resumo das tarefas" aria-busy={summary ? undefined : true} className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className={cn('grid grid-cols-2 md:grid-cols-3', byAssignee ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
        {/* 1. Overdue (principal) */}
        <div className="col-span-2 min-w-0 p-4 sm:p-5 md:col-span-1">
          <button
            type="button"
            aria-pressed={situation === 'overdue'}
            aria-label={summary ? `Atrasadas: ${summary.overdue}. Filtrar a lista.` : 'Atrasadas'}
            onClick={() => toggle('overdue')}
            className={cn('-m-2 block w-[calc(100%+1rem)] p-2 text-left', toggleClass)}
          >
            <SummaryLabel>Atrasadas</SummaryLabel>
            {summary ? (
              <span
                className={cn(
                  'tabular mt-1 block text-[32px] leading-10 font-semibold tracking-tight lg:text-[28px] xl:text-[32px]',
                  summary.overdue > 0 ? 'text-danger' : 'text-fg',
                )}
              >
                {summary.overdue}
              </span>
            ) : (
              <span className="mt-1 flex h-10 items-center">
                <Skeleton className="h-8 w-16" />
              </span>
            )}
          </button>
          {summary ? (
            <p className="mt-1 text-body-sm text-muted">
              {summary.oldestOverdue ? (
                <>
                  A mais antiga venceu há {daysText(summary.oldestOverdue.daysOverdue)}:{' '}
                  <button
                    type="button"
                    onClick={() => onOpenTask(summary.oldestOverdue!.id)}
                    className="inline text-left font-semibold text-brand-text underline decoration-border-strong underline-offset-4 hover:decoration-current"
                  >
                    {summary.oldestOverdue.title}
                  </button>
                  {summary.oldestOverdue.client ? ` · ${summary.oldestOverdue.client.name}` : null}
                </>
              ) : (
                'Nada atrasado.'
              )}
            </p>
          ) : (
            <span className="mt-1 flex h-5 items-center">
              <Skeleton className="h-3.5 w-56 max-w-full" />
            </span>
          )}
        </div>

        {/* 2. Open */}
        <div className="min-w-0 border-t border-border p-4 sm:p-5 md:border-t-0 md:border-l">
          <button
            type="button"
            aria-label={summary ? `Em aberto: ${summary.open}. Mostrar as abertas.` : 'Em aberto'}
            onClick={() => onSituation('open')}
            className={cn('-m-2 block w-[calc(100%+1rem)] p-2 text-left', toggleClass)}
          >
            <SummaryLabel>Em aberto</SummaryLabel>
            {summary ? (
              <span className="tabular mt-1 block text-kpi leading-10 font-semibold tracking-tight text-fg">{summary.open}</span>
            ) : (
              <span className="mt-1 flex h-10 items-center">
                <Skeleton className="h-6 w-10" />
              </span>
            )}
          </button>
          {summary ? (
            <p className="mt-1 text-body-sm text-muted">
              {summary.dueToday > 0 ? `${pluralize(summary.dueToday, 'vence', 'vencem')} hoje` : 'nada vence hoje'}
              {summary.waitingClient > 0 ? (
                <>
                  {' · '}
                  <button
                    type="button"
                    aria-pressed={situation === 'waiting'}
                    onClick={() => toggle('waiting')}
                    className={cn(
                      '-mx-1 inline px-1 text-left font-medium text-brand-text underline decoration-border-strong underline-offset-4 hover:decoration-current',
                      toggleClass,
                    )}
                  >
                    {summary.waitingClient} aguardando cliente
                  </button>
                </>
              ) : null}
              {summary.targetMissed > 0 ? <span className="text-warning"> · {summary.targetMissed} fora da meta</span> : null}
            </p>
          ) : (
            <span className="mt-1 flex h-5 items-center">
              <Skeleton className="h-3.5 w-24" />
            </span>
          )}
        </div>

        {/* 3. Concluded in the month */}
        <div className="min-w-0 border-t border-l border-border p-4 sm:p-5 md:border-t-0">
          <button
            type="button"
            aria-pressed={situation === 'done'}
            aria-label={summary ? `Concluídas de ${month} (inclui canceladas): ${summary.monthDone}. Filtrar a lista.` : 'Concluídas'}
            onClick={() => toggle('done')}
            className={cn('-m-2 block w-[calc(100%+1rem)] p-2 text-left', toggleClass)}
          >
            <SummaryLabel info={summary ? `Tarefas com vencimento em ${month} já concluídas ou canceladas.` : undefined}>
              {summary ? `Concluídas de ${month}` : 'Concluídas'}
            </SummaryLabel>
            {summary ? (
              <span className="tabular mt-1 block text-kpi leading-10 font-semibold tracking-tight text-fg">{summary.monthDone}</span>
            ) : (
              <span className="mt-1 flex h-10 items-center">
                <Skeleton className="h-6 w-10" />
              </span>
            )}
          </button>
          {summary ? (
            <p className="mt-1 text-body-sm text-muted">
              de {pluralize(summary.monthDue, 'que vence', 'que vencem')} no mês
            </p>
          ) : (
            <span className="mt-1 flex h-5 items-center">
              <Skeleton className="h-3.5 w-24" />
            </span>
          )}
        </div>

        {/* 4. Open by assignee (not in "Minhas"): hidden on phones (the filter stays in the sheet). */}
        {byAssignee ? (
        <div className="hidden min-w-0 border-border px-4 pt-4 pb-4 sm:px-5 md:col-span-3 md:block md:border-t lg:col-span-1 lg:border-t-0 lg:border-l lg:pt-5">
          <SummaryLabel>Em aberto por departamento</SummaryLabel>
          {!summary ? (
            <div className="mt-1.5 flex flex-col gap-2" aria-hidden>
              {['w-full', 'w-4/5', 'w-3/5'].map((w) => (
                <Skeleton key={w} className={cn('h-3.5', w)} />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="mt-1.5 text-body-sm text-muted">Nada em aberto.</p>
          ) : (
            <ul className="-mx-2 mt-1 grid grid-cols-[minmax(0,max-content)_minmax(1.5rem,1fr)_2rem_2.75rem] gap-x-2.5" aria-label="Em aberto por departamento (filtra a lista)">
              {rows.map((r) => {
                const pressed = Boolean(r.key) && department === r.key;
                return (
                  <li key={r.key || 'none'} className="col-span-full grid grid-cols-subgrid">
                    <button
                      type="button"
                      aria-pressed={pressed}
                      // "Sem departamento" has no filter of its own: the row only shows the count.
                      disabled={!r.key}
                      aria-label={`${r.label}: ${r.open} em aberto${r.overdue ? `, ${r.overdue} atrasadas` : ''}`}
                      onClick={() => onDepartment(pressed ? '' : r.key)}
                      className={cn('col-span-full grid grid-cols-subgrid items-center px-2 py-1.5 text-left disabled:cursor-default disabled:hover:bg-transparent pointer-coarse:py-2', toggleClass)}
                    >
                      <span title={r.label} className={cn('truncate text-body-sm', r.muted ? 'text-subtle' : 'text-fg', pressed && 'font-semibold')}>{r.label}</span>
                      <span className="block h-1.5" aria-hidden>
                        <span className="block h-full min-w-1 rounded-full bg-data" style={{ width: `${(r.open / max) * 100}%` }} />
                      </span>
                      <span className="tabular text-right text-body-sm font-semibold text-fg">{r.open}</span>
                      <span className="tabular truncate text-mini text-danger">{r.overdue ? `${r.overdue} atr.` : ''}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        ) : null}
      </div>
    </section>
  );
}
