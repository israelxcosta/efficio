// Minha área › the mini calendar (spec §15.4): the mark of each day, its accessible name and the keys
// of a date picker.
import { describe, expect, it } from 'vitest';
import type { CalendarItem } from './calendar-logic';
import { dayLabel, dayMarker, miniCalendarDays, miniCalendarMove } from './mini-calendar-logic';
import { makeOccurrence, makeTask } from './test-fixtures';

const TODAY = '2026-11-05';
const task = (patch: Parameters<typeof makeTask>[0]): CalendarItem => {
  const t = makeTask(patch);
  return { type: 'task', key: t.id, task: t };
};

describe('mark of a day', () => {
  it('is none, overdue, open or done', () => {
    expect(dayMarker([], TODAY)).toBe('none');
    expect(dayMarker([task({ id: 'a', dueDate: '2026-11-03', status: 'todo', overdue: true })], TODAY)).toBe('overdue');
    expect(dayMarker([task({ id: 'a', dueDate: '2026-11-09', status: 'in_progress' })], TODAY)).toBe('open');
    expect(dayMarker([task({ id: 'a', dueDate: '2026-11-03', status: 'done' }), task({ id: 'b', dueDate: '2026-11-03', status: 'canceled' })], TODAY)).toBe('done');
    const occ = makeOccurrence({ pending: 2, overdue: true });
    expect(dayMarker([{ type: 'occurrence', key: 'o', occurrence: occ }], TODAY)).toBe('overdue');
  });
});

describe('name of a day', () => {
  it('says the day, the count and the holiday', () => {
    expect(dayLabel('2026-11-02', [], TODAY)).toBe('2 de novembro, segunda-feira: nenhuma tarefa, feriado: Finados');
    const items = [task({ id: 'a', status: 'todo', overdue: true }), task({ id: 'b', status: 'todo' }), task({ id: 'c', status: 'done' })];
    expect(dayLabel('2026-11-06', items, TODAY)).toBe('6 de novembro, sexta-feira: 3 tarefas, 1 atrasada');
  });
});

describe('grid and keys', () => {
  it('starts on the Monday on or before the 1st and has 42 days', () => {
    const days = miniCalendarDays('2026-11');
    expect(days).toHaveLength(42);
    expect(days[0]!.date).toBe('2026-10-26');
    expect(days.find((d) => d.date === '2026-11-01')!.inMonth).toBe(true);
  });

  it('moves like a date picker', () => {
    expect(miniCalendarMove('ArrowDown', 3, 42)).toEqual({ index: 10 });
    expect(miniCalendarMove('ArrowUp', 10, 42)).toEqual({ index: 3 });
    expect(miniCalendarMove('ArrowRight', 41, 42)).toEqual({ index: 41 });
    expect(miniCalendarMove('Home', 10, 42)).toEqual({ index: 7 });
    expect(miniCalendarMove('End', 10, 42)).toEqual({ index: 13 });
    expect(miniCalendarMove('PageUp', 10, 42)).toEqual({ month: -1 });
    expect(miniCalendarMove('PageDown', 10, 42)).toEqual({ month: 1 });
    expect(miniCalendarMove('ArrowLeft', 0, 42)).toEqual({ index: 0 });
    expect(miniCalendarMove('a', 0, 42)).toBeNull();
  });
});
