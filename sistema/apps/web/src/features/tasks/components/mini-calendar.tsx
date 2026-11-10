import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { Popover } from 'radix-ui';
import { ChevronLeft, ChevronRight, Repeat } from 'lucide-react';
import { addMonthKey, formatDateBR, monthKey, type ISODate, type MonthKey } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/misc';
import { SUBSCRIPTION_REASON, usePermissions } from '@/features/auth/permissions';
import { cn } from '@/lib/utils';
import { useTaskCalendar } from '../api';
import { itemsByDay, type CalendarItem } from '../calendar-logic';
import { competenceName } from '../occurrence';
import { useTaskSheetLinks } from '../task-links';
import { useOccurrenceSheetLinks } from './occurrence-row';
import { dayLabel, dayMarker, miniCalendarDays, miniCalendarMove } from '../mini-calendar-logic';
import { TaskStatusGlyph } from './task-status';

const COLUMN_HEADS = [
  ['S', 'segunda-feira'],
  ['T', 'terça-feira'],
  ['Q', 'quarta-feira'],
  ['Q', 'quinta-feira'],
  ['S', 'sexta-feira'],
  ['S', 'sábado'],
  ['D', 'domingo'],
] as const;

const MARK_CLASS = { none: '', open: 'bg-data', overdue: 'bg-danger', done: 'bg-border-strong' } as const;
const WEEKDAY_TITLE = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "Sexta, 6 de novembro" (head of the day's popover). */
function dayTitle(date: ISODate): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return `${WEEKDAY_TITLE[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d} de ${MONTHS[m - 1]}`;
}

/** Count of a month's items for the card's finding: "6 dias com tarefas". */
export function daysWithItems(byDay: Map<ISODate, CalendarItem[]>, month: MonthKey): number {
  let n = 0;
  for (const [date, items] of byDay) if (date.slice(0, 7) === month && items.length) n++;
  return n;
}

/**
 * The month of Minha área (spec §15.4): 6 weeks from Monday, a dot under each day (late, open, only
 * closed), the day's popover with up to 5 items and "Novo compromisso", and the keys of a date picker.
 */
export function MiniCalendar({
  month,
  scope,
  today,
  onMonth,
  onFinding,
}: {
  month: MonthKey;
  scope: 'mine' | 'department';
  today: ISODate;
  onMonth: (m: MonthKey) => void;
  /** "novembro · 6 dias com tarefas" for the card's subtitle. */
  onFinding?: (text: string) => void;
}) {
  const days = useMemo(() => miniCalendarDays(month), [month]);
  const calendar = useTaskCalendar({ from: days[0]!.date, to: days[41]!.date, scope });
  const byDay = useMemo(
    () => (calendar.data ? itemsByDay(calendar.data.tasks, calendar.data.occurrences, { situation: 'all' }) : new Map<ISODate, CalendarItem[]>()),
    [calendar.data],
  );
  const todayIndex = days.findIndex((d) => d.date === today);
  const firstOfMonth = days.findIndex((d) => d.inMonth);
  const [focus, setFocus] = useState(todayIndex >= 0 && today.slice(0, 7) === month ? todayIndex : firstOfMonth);
  const [openDay, setOpenDay] = useState<ISODate | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const { openTask, newTask } = useTaskSheetLinks();
  const { openOccurrence } = useOccurrenceSheetLinks();
  const { canWriteTasks } = usePermissions();
  const current = focus >= 0 && focus < 42 ? focus : firstOfMonth;
  const finding = `${competenceName(month).split(' ')[0]} · ${daysWithItems(byDay, month)} ${daysWithItems(byDay, month) === 1 ? 'dia' : 'dias'} com tarefas`;
  const ready = Boolean(calendar.data);
  useEffect(() => {
    if (ready) onFinding?.(finding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finding, ready]);

  function changeMonth(delta: -1 | 1) {
    setOpenDay(null);
    onMonth(addMonthKey(month, delta));
    setFocus(-1);
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const move = miniCalendarMove(e.key, current, 42);
    if (!move) return;
    e.preventDefault();
    if ('month' in move) return changeMonth(move.month);
    setFocus(move.index);
    refs.current[move.index]?.focus();
  }

  const open = openDay ? (byDay.get(openDay) ?? []) : [];
  const monthLabel = competenceName(month);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Mês anterior" onClick={() => changeMonth(-1)}>
          <ChevronLeft />
        </Button>
        <span className="min-w-0 flex-1 truncate text-center text-body-sm font-semibold text-fg" aria-live="polite">
          {monthLabel}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Próximo mês" onClick={() => changeMonth(1)}>
          <ChevronRight />
        </Button>
        {month !== monthKey(today) ? (
          <Button variant="ghost" size="sm" onClick={() => onMonth(monthKey(today))}>
            Hoje
          </Button>
        ) : null}
      </div>
      {calendar.isError && !calendar.data ? (
        <ErrorState error={calendar.error} onRetry={() => calendar.refetch()} className="p-3" />
      ) : (
        <Popover.Root open={openDay !== null} onOpenChange={(o) => !o && setOpenDay(null)}>
          <div role="grid" aria-label={`Calendário de ${monthLabel}`} onKeyDown={onKey} className="mt-2 grid grid-cols-7 gap-y-0.5">
            <div role="row" className="contents">
              {COLUMN_HEADS.map(([letter, name], i) => (
                <span key={i} role="columnheader" aria-label={name} className="pb-1 text-center text-micro text-muted">
                  {letter}
                </span>
              ))}
            </div>
            {Array.from({ length: 6 }, (_, w) => (
              <div key={w} role="row" className="contents">
                {days.slice(w * 7, w * 7 + 7).map((d, k) => {
                  const i = w * 7 + k;
                  const items = byDay.get(d.date) ?? [];
                  const mark = calendar.data ? dayMarker(items, today) : 'none';
                  const isToday = d.date === today;
                  const label = dayLabel(d.date, items, today);
                  const button = (
                    <button
                      ref={(el) => void (refs.current[i] = el)}
                      type="button"
                      role="gridcell"
                      tabIndex={i === current ? 0 : -1}
                      aria-label={label}
                      aria-selected={openDay === d.date}
                      title={items.length || d.holiday ? label.slice(label.indexOf(':') + 2) : undefined}
                      onFocus={() => setFocus(i)}
                      onClick={() => {
                        setFocus(i);
                        setOpenDay(d.date);
                      }}
                      className={cn(
                        'relative mx-auto flex aspect-square w-full max-w-12 min-w-10 flex-col items-center justify-center rounded-lg text-body-sm transition-colors duration-150 hover:bg-surface-muted',
                        !d.inMonth ? 'text-subtle' : d.weekend || d.holiday ? 'text-muted' : 'text-fg',
                      )}
                    >
                      <span className={cn('tabular flex size-7 items-center justify-center rounded-full', isToday && 'bg-primary font-semibold text-primary-fg')}>
                        {Number(d.date.slice(8, 10))}
                      </span>
                      <span aria-hidden className={cn('absolute bottom-1 size-[5px] rounded-full', MARK_CLASS[mark])} />
                    </button>
                  );
                  return openDay === d.date ? (
                    <Popover.Anchor key={d.date} asChild>
                      {button}
                    </Popover.Anchor>
                  ) : (
                    <span key={d.date} className="contents">
                      {button}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          <Popover.Portal>
            <Popover.Content
              side="bottom"
              align="center"
              sideOffset={6}
              collisionPadding={12}
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                refs.current[current]?.focus();
              }}
              className="z-50 flex w-72 flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-lg data-[state=open]:animate-fade-in"
            >
              {openDay ? (
                <>
                  <p className="text-body-sm font-semibold text-fg">{dayTitle(openDay)}</p>
                  {days.find((d) => d.date === openDay)?.holiday ? <p className="-mt-1.5 text-caption text-muted">Feriado: {days.find((d) => d.date === openDay)!.holiday}</p> : null}
                  {open.length === 0 ? (
                    <p className="text-caption text-muted">Nada neste dia.</p>
                  ) : (
                    <ul className="flex flex-col">
                      {open.slice(0, 5).map((item) => (
                        <li key={item.key}>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenDay(null);
                              if (item.type === 'task') openTask(item.task.id);
                              else openOccurrence(item.occurrence);
                            }}
                            className="flex h-9 w-full items-center gap-2 rounded-md px-1.5 text-left text-body-sm hover:bg-surface-muted"
                          >
                            {item.type === 'task' ? <TaskStatusGlyph status={item.task.status} className="shrink-0 text-muted" /> : <Repeat className="size-4 shrink-0 text-muted" aria-hidden />}
                            <span className="min-w-0 flex-1 truncate text-fg">{item.type === 'task' ? item.task.title : `${item.occurrence.name} · ${item.occurrence.done}/${item.occurrence.total - item.occurrence.canceled}`}</span>
                            <span className="tabular shrink-0 text-caption text-muted">
                              {item.type === 'task' ? (item.task.startTime ?? '') : `meta ${formatDateBR(item.occurrence.targetDate).slice(0, 5)}`}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {open.length > 5 ? (
                    <Link to={`/tarefas?visao=calendario&escopo=${scope === 'mine' ? 'minhas' : 'departamento'}&mes=${month}`} className="text-caption font-semibold text-brand-text hover:underline">
                      + {open.length - 5} no calendário
                    </Link>
                  ) : null}
                  <span className="self-start" title={canWriteTasks ? undefined : SUBSCRIPTION_REASON}>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canWriteTasks}
                      onClick={() => {
                        const day = openDay;
                        setOpenDay(null);
                        newTask({ appointment: true, dueDate: day });
                      }}
                    >
                      Novo compromisso
                    </Button>
                  </span>
                </>
              ) : null}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </div>
  );
}
