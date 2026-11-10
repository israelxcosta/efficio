// Minha área › the mini calendar (spec §15.4): the 6 weeks of a month from Monday, the mark of each day,
// its accessible name and the keys of a date picker. Pure functions, tested in
// mini-calendar-logic.test.ts.

import { addDays, dayOfWeek, isOpenTaskStatus, nationalHolidayName, type ISODate, type MonthKey } from '@effinance/shared';
import type { CalendarDay, CalendarItem } from './calendar-logic';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** 42 days (6 weeks), Monday first, from the Monday on or before the 1st (the spec's grid). */
export function miniCalendarDays(month: MonthKey): CalendarDay[] {
  const first = `${month}-01` as ISODate;
  const start = addDays(first, -((dayOfWeek(first) + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => {
    const date = addDays(start, i);
    const dow = dayOfWeek(date);
    return { date, inMonth: date.slice(0, 7) === month, weekend: dow === 0 || dow === 6, holiday: nationalHolidayName(date) };
  });
}

export type DayMarker = 'none' | 'open' | 'overdue' | 'done';

const isOpen = (i: CalendarItem) => (i.type === 'task' ? isOpenTaskStatus(i.task.status) : i.occurrence.pending > 0);
const isLate = (i: CalendarItem, today: ISODate) =>
  i.type === 'task' ? isOpenTaskStatus(i.task.status) && (i.task.overdue || (i.task.dueDate !== null && i.task.dueDate < today)) : i.occurrence.pending > 0 && i.occurrence.overdue;

/** The dot under a day: red with something open and late; the data colour with something open; grey with only closed ones. */
export function dayMarker(items: CalendarItem[], today: ISODate): DayMarker {
  if (items.length === 0) return 'none';
  if (items.some((i) => isLate(i, today))) return 'overdue';
  if (items.some(isOpen)) return 'open';
  return 'done';
}

/** "6 de novembro, sexta-feira: 3 tarefas, 1 atrasada" and ", feriado: Finados". */
export function dayLabel(date: ISODate, items: CalendarItem[], today: ISODate): string {
  const [, m, d] = date.split('-').map(Number) as [number, number, number];
  const count = items.reduce((n, i) => n + (i.type === 'task' ? 1 : i.occurrence.total - i.occurrence.canceled), 0);
  const late = items.filter((i) => isLate(i, today)).length;
  const what = count === 0 ? 'nenhuma tarefa' : `${count} ${count === 1 ? 'tarefa' : 'tarefas'}${late ? `, ${late} ${late === 1 ? 'atrasada' : 'atrasadas'}` : ''}`;
  const holiday = nationalHolidayName(date);
  return `${d} de ${MONTHS[m - 1]}, ${WEEKDAYS[dayOfWeek(date)]}: ${what}${holiday ? `, feriado: ${holiday}` : ''}`;
}

/** Keys on the grid: ← → a day, ↑ ↓ a week, Home/End the week's ends, PageUp/PageDown the month. */
export function miniCalendarMove(key: string, index: number, total: number): { index: number } | { month: -1 | 1 } | null {
  const clamp = (i: number) => ({ index: Math.min(total - 1, Math.max(0, i)) });
  switch (key) {
    case 'ArrowLeft':
      return clamp(index - 1);
    case 'ArrowRight':
      return clamp(index + 1);
    case 'ArrowUp':
      return clamp(index - 7);
    case 'ArrowDown':
      return clamp(index + 7);
    case 'Home':
      return clamp(index - (index % 7));
    case 'End':
      return clamp(index - (index % 7) + 6);
    case 'PageUp':
      return { month: -1 };
    case 'PageDown':
      return { month: 1 };
    default:
      return null;
  }
}
