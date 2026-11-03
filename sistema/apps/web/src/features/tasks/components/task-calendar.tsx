import { useMemo, useState } from 'react';
import { Popover } from 'radix-ui';
import { Plus, Repeat } from 'lucide-react';
import { formatMonthKey, type ISODate, type MonthKey, type TaskCalendarResponse, type TaskPriority, type TaskSituation } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/misc';
import { PeriodNavigator } from '@/components/ui/period-navigator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { usePermissions } from '@/features/auth/permissions';
import { cn } from '@/lib/utils';
import { agendaDayTitle, CALENDAR_WEEKDAYS, calendarWeeks, itemsByDay, monthItemCount, type CalendarDay, type CalendarItem } from '../calendar-logic';
import { longDay } from '../format';
import { competenceName, deadlineTip, groupDeadlineInfo } from '../occurrence';
import { useTaskSheetLinks } from '../task-links';
import { RecurringOccurrenceRow, useOccurrenceSheetLinks } from './occurrence-row';
import { TaskRow } from './task-row';

interface TaskCalendarProps {
  month: MonthKey;
  data: TaskCalendarResponse | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  today: ISODate;
  situation: TaskSituation;
  search: string;
  priority: TaskPriority | '';
  mine: boolean;
  onMonth: (month: MonthKey) => void;
  /** Back to the list, grouped, with the tasks without a due date. */
  onNoDueDate: () => void;
  /** The list of the month (when the calendar was cut). */
  onSeeList: () => void;
}

/**
 * Calendar of Tarefas (spec §7.6): from 1024px a month grid (Sunday first, national holidays, up to
 * 3 items a day in 1440 and 2 in 1024, "+ N mais"), below it an agenda by day. Tasks sit on their due
 * date, recurring tasks on their target ("DCTFWeb · 12/30").
 */
export function TaskCalendar(p: TaskCalendarProps) {
  const weeks = useMemo(() => calendarWeeks(p.month), [p.month]);
  const byDay = useMemo(() => itemsByDay(p.data?.tasks ?? [], p.data?.occurrences ?? [], { situation: p.situation, search: p.search, priority: p.priority }), [p.data, p.situation, p.search, p.priority]);
  const monthName = competenceName(p.month).split(' ')[0]!;
  const count = monthItemCount(byDay, p.month);
  const { newTask } = useTaskSheetLinks();
  const { canWriteTasks } = usePermissions();
  const createAt = (date: ISODate) => newTask({ appointment: true, dueDate: date });

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <PeriodNavigator modes={['month']} value={{ mode: 'month', anchor: `${p.month}-01` }} onChange={(v) => p.onMonth(v.anchor.slice(0, 7))} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {p.data && p.data.noDueDate > 0 ? (
          <button type="button" onClick={p.onNoDueDate} className="text-body-sm font-medium text-brand-text hover:underline">
            {p.data.noDueDate} sem vencimento
          </button>
        ) : null}
        <span className="hidden items-center gap-1 text-caption text-muted lg:flex">
          <span className="size-1.5 rounded-full bg-muted" aria-hidden /> compromisso ·
          <Repeat className="size-3" aria-hidden /> recorrente, no dia da meta
        </span>
      </div>
    </div>
  );

  if (p.error && !p.data) {
    return (
      <Card className="overflow-hidden">
        {header}
        <ErrorState error={p.error} onRetry={p.onRetry} className="m-4 mt-0" />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {header}
      {p.data?.truncated ? (
        <p className="mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface-muted px-3 py-2 text-body-sm text-muted">
          Há mais tarefas neste mês do que cabem no calendário. Use os filtros para ver todas.
          <Button variant="link" size="sm" onClick={p.onSeeList}>
            Ver na lista
          </Button>
        </p>
      ) : null}
      {/* Grid from 1024px. */}
      <div className="hidden lg:block">
        {p.data && count === 0 ? <p className="mx-4 mb-3 rounded-lg bg-surface-muted px-3 py-2 text-body-sm text-muted">Nenhuma tarefa com vencimento em {monthName}.</p> : null}
        <table className="w-full table-fixed border-collapse" aria-label={`Calendário de ${formatMonthKey(p.month)}`}>
          <thead>
            <tr>
              {CALENDAR_WEEKDAYS.map((d) => (
                <th key={d} scope="col" className="border-t border-border px-2 py-1.5 text-left text-caption font-medium text-muted">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0]!.date}>
                {week.map((day) => (
                  <DayCell key={day.date} day={day} items={byDay.get(day.date) ?? []} today={p.today} loading={p.loading && !p.data} mine={p.mine} canCreate={canWriteTasks} onCreate={() => createAt(day.date)} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Agenda below 1024px. */}
      <div className="border-t border-border p-1.5 lg:hidden">
        {p.loading && !p.data ? (
          <div className="flex flex-col gap-2 p-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : count === 0 ? (
          <EmptyState
            className="m-2"
            title={`Nenhuma tarefa com vencimento em ${monthName}.`}
            action={
              canWriteTasks ? (
                <Button variant="outline" onClick={() => createAt(p.month === p.today.slice(0, 7) ? p.today : `${p.month}-01`)}>
                  Novo compromisso
                </Button>
              ) : undefined
            }
          />
        ) : (
          weeks
            .flat()
            .filter((d) => d.inMonth && (byDay.get(d.date)?.length ?? 0) > 0)
            .map((day) => (
              <section key={day.date} aria-labelledby={`agenda-${day.date}`} className="[&+&]:mt-1">
                <div className="flex h-9 items-center gap-2 px-3">
                  <h2 id={`agenda-${day.date}`} className={cn('flex-1 text-body-sm font-semibold', day.date === p.today ? 'text-brand-text' : 'text-fg')}>
                    {agendaDayTitle(day)}
                  </h2>
                  {canWriteTasks ? (
                    <Button variant="ghost" size="icon-sm" aria-label={`Novo compromisso em ${day.date.slice(8, 10)}/${day.date.slice(5, 7)}`} onClick={() => createAt(day.date)}>
                      <Plus />
                    </Button>
                  ) : null}
                </div>
                {(byDay.get(day.date) ?? []).map((item) =>
                  item.type === 'task' ? (
                    <TaskRow key={item.key} task={item.task} today={p.today} density="compact" hideAssignee={p.mine} />
                  ) : (
                    <RecurringOccurrenceRow key={item.key} occurrence={item.occurrence} today={p.today} density="compact" mine={p.mine} />
                  ),
                )}
              </section>
            ))
        )}
      </div>
    </Card>
  );
}

function DayCell({
  day,
  items,
  today,
  loading,
  mine,
  canCreate,
  onCreate,
}: {
  day: CalendarDay;
  items: CalendarItem[];
  today: ISODate;
  loading: boolean;
  mine: boolean;
  canCreate: boolean;
  onCreate: () => void;
}) {
  const isToday = day.date === today;
  const dd = `${day.date.slice(8, 10)}/${day.date.slice(5, 7)}`;
  const shown = day.inMonth ? items : [];
  return (
    <td
      className={cn(
        'group/day relative h-[88px] border border-border p-1.5 align-top xl:h-28',
        (day.weekend || day.holiday) && 'bg-surface-muted',
        isToday && 'shadow-[inset_0_2px_0_var(--app-data)]',
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={cn('tabular text-caption', isToday ? 'font-semibold text-fg' : day.inMonth ? 'text-muted' : 'text-subtle')}>
          <span className="sr-only">{longDay(day.date)}</span>
          <span aria-hidden>{Number(day.date.slice(8, 10))}</span>
        </span>
        {day.holiday && day.inMonth ? <span className="truncate text-micro text-subtle">{day.holiday}</span> : null}
        {canCreate && day.inMonth ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Novo compromisso em ${dd}`}
            onClick={onCreate}
            className="absolute top-1 right-1 size-6 opacity-0 group-hover/day:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
          >
            <Plus />
          </Button>
        ) : null}
      </div>
      {loading && day.inMonth && !day.weekend ? <Skeleton className="mt-1 h-6 w-full" /> : null}
      <ul className="mt-1 flex flex-col gap-0.5">
        {shown.slice(0, 3).map((item, i) => (
          <li key={item.key} className={cn(i === 2 && 'hidden xl:block')}>
            <CalendarItemButton item={item} today={today} />
          </li>
        ))}
      </ul>
      {shown.length > 2 ? <MoreItems day={day} items={shown} today={today} mine={mine} /> : null}
    </td>
  );
}

function CalendarItemButton({ item, today }: { item: CalendarItem; today: ISODate }) {
  const { openTask } = useTaskSheetLinks();
  const { openOccurrence } = useOccurrenceSheetLinks();
  const base = 'flex h-6 w-full min-w-0 items-center gap-1 rounded-sm bg-bg-subtle px-1.5 text-left text-caption hover:bg-border';
  if (item.type === 'task') {
    const t = item.task;
    const tone = t.status === 'done' || t.status === 'canceled' ? 'text-muted' : t.overdue ? 'text-danger' : 'text-fg';
    const label = `${t.startTime ? `${t.startTime} ` : ''}${t.title}`;
    return (
      <button type="button" onClick={() => openTask(t.id)} className={cn(base, tone)} aria-label={`${label}${t.client ? `, ${t.client.name}` : ''}${t.overdue ? ', atrasada' : ''}`} title={label}>
        {t.startTime ? <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden /> : null}
        <span className="truncate">{label}</span>
      </button>
    );
  }
  const o = item.occurrence;
  const live = o.total - o.canceled;
  const dl = groupDeadlineInfo(o, today);
  const tone = o.pending === 0 ? 'text-muted' : o.overdue ? 'text-danger' : o.targetMissed ? 'text-warning' : 'text-fg';
  return (
    <Tooltip content={`${deadlineTip(o, today)} · ${o.done} de ${live} clientes concluídos`}>
      <button type="button" onClick={() => openOccurrence(o, o.pending > 0 ? 'pending' : 'all')} className={cn(base, tone)} aria-label={`${o.name}, ${dl.text}, ${o.done} de ${live} concluídos`}>
        <Repeat className="size-3 shrink-0" aria-hidden />
        <span className="truncate">
          {o.name} · {o.done}/{live}
        </span>
      </button>
    </Tooltip>
  );
}

/** "+ 2 mais": a popover with the whole day in compact rows. */
function MoreItems({ day, items, today, mine }: { day: CalendarDay; items: CalendarItem[]; today: ISODate; mine: boolean }) {
  const [open, setOpen] = useState(false);
  const trigger = (rest: number, cls: string) => (
    <Popover.Trigger asChild>
      <button type="button" className={cn('mt-0.5 px-1 text-caption font-medium text-brand-text hover:underline', cls)}>
        + {rest} mais
      </button>
    </Popover.Trigger>
  );
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      {trigger(items.length - 2, 'xl:hidden')}
      {items.length > 3 ? trigger(items.length - 3, 'hidden xl:inline') : null}
      <Popover.Portal>
        <Popover.Content side="bottom" align="start" sideOffset={4} collisionPadding={12} className="z-50 w-80 rounded-xl border border-border bg-surface p-2 shadow-lg data-[state=open]:animate-fade-in">
          <p className="px-2 py-1.5 text-body-sm font-semibold text-fg">{longDay(day.date)}</p>
          <div className="scrollbar-thin max-h-80 overflow-y-auto">
            {items.map((item) =>
              item.type === 'task' ? (
                <TaskRow key={item.key} task={item.task} today={today} density="compact" hideAssignee={mine} />
              ) : (
                <RecurringOccurrenceRow key={item.key} occurrence={item.occurrence} today={today} density="compact" mine={mine} />
              ),
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
