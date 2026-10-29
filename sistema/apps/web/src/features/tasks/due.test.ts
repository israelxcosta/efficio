import { describe, expect, it } from 'vitest';
import { firstName, groupByDue, shortDate, shortName, taskDueInfo } from './due';
import { commentTime, longDay, namesSummary } from './format';
import { makeTask as task } from './test-fixtures';

const TODAY = '2026-10-28';

describe('taskDueInfo', () => {
  it('flags overdue tasks in danger', () => {
    expect(taskDueInfo(task({ dueDate: '2026-10-25' }), TODAY)).toEqual({ text: 'Venceu há 3 dias', tone: 'danger' });
    expect(taskDueInfo(task({ dueDate: '2026-10-27' }), TODAY)).toEqual({ text: 'Venceu há 1 dia', tone: 'danger' });
  });

  it('warns about today, tomorrow and the next five days', () => {
    expect(taskDueInfo(task({ dueDate: TODAY }), TODAY)).toEqual({ text: 'Vence hoje', tone: 'warning-strong' });
    expect(taskDueInfo(task({ dueDate: TODAY, startTime: '14:00', endTime: '15:00' }), TODAY).text).toBe('Hoje, 14:00–15:00');
    expect(taskDueInfo(task({ dueDate: '2026-10-29' }), TODAY)).toEqual({ text: 'Vence amanhã', tone: 'warning' });
    expect(taskDueInfo(task({ dueDate: '2026-11-02' }), TODAY)).toEqual({ text: 'Vence em 5 dias', tone: 'warning' });
  });

  it('carries the date inline and not beside the date column', () => {
    expect(taskDueInfo(task({ dueDate: '2026-11-12' }), TODAY)).toEqual({ text: 'Vence 12/11', tone: 'muted' });
    expect(taskDueInfo(task({ dueDate: '2026-11-12' }), TODAY, true)).toEqual({ text: 'Vence em 15 dias', tone: 'muted' });
    expect(taskDueInfo(task({ dueDate: '2027-01-12' }), TODAY).text).toBe('Vence 12/01/27');
  });

  it('describes tasks without due date, concluded and canceled', () => {
    expect(taskDueInfo(task({}), TODAY)).toEqual({ text: 'Sem vencimento', tone: 'subtle' });
    expect(taskDueInfo(task({ status: 'canceled', dueDate: '2026-10-01' }), TODAY)).toEqual({ text: 'Cancelada', tone: 'subtle' });
    // 14/10 17:00 in São Paulo.
    const done = task({ status: 'done', dueDate: '2026-10-14', completedAt: '2026-10-14T20:00:00Z' });
    expect(taskDueInfo(done, TODAY, true).text).toBe('Concluída no vencimento');
    expect(taskDueInfo(done, TODAY).text).toBe('Concluída em 14/10');
    // 23:30 in São Paulo is already the next day in UTC: the office day counts.
    const late = task({ status: 'done', dueDate: '2026-10-14', completedAt: '2026-10-15T02:30:00Z' });
    expect(taskDueInfo(late, TODAY, true).text).toBe('Concluída no vencimento');
  });
});

describe('names and dates', () => {
  it('shortens names for narrow columns', () => {
    expect(shortName('Ana Paula Ribeiro')).toBe('Ana R.');
    expect(shortName('Bruno')).toBe('Bruno');
    expect(firstName('Juliana Martins')).toBe('Juliana');
    expect(shortDate('2026-10-05', TODAY)).toBe('05/10');
    expect(shortDate('2025-10-05', TODAY)).toBe('05/10/25');
  });

  it('writes the day of the page header', () => {
    expect(longDay('2026-10-28')).toBe('Quarta-feira, 28 de outubro');
    expect(longDay('2026-10-30')).toBe('Sexta-feira, 30 de outubro');
  });

  it('summarizes the members of a department', () => {
    expect(namesSummary([])).toBe('Sem membros');
    expect(namesSummary(['Bruno Carvalho'])).toBe('Bruno Carvalho');
    expect(namesSummary(['Ana Paula Ribeiro', 'Marina Costa'])).toBe('Ana Paula e Marina Costa');
    expect(namesSummary(['Ana Paula Ribeiro', 'Bruno Carvalho', 'Juliana Martins', 'Rafael Lima'])).toBe('Ana Paula, Bruno Carvalho e mais 2');
  });

  it('dates comments like a chat', () => {
    const now = new Date('2026-10-28T15:00:00Z'); // 12:00 in São Paulo
    expect(commentTime('2026-10-28T14:59:40Z', now)).toBe('agora');
    expect(commentTime('2026-10-28T14:55:00Z', now)).toBe('há 5 min');
    expect(commentTime('2026-10-28T12:00:00Z', now)).toBe('há 3 h');
    expect(commentTime('2026-10-27T15:00:00Z', now)).toBe('ontem');
    expect(commentTime('2026-10-12T15:00:00Z', now)).toBe('12/10');
    expect(commentTime('2025-10-12T15:00:00Z', now)).toBe('12/10/25');
  });
});

describe('groupByDue', () => {
  it('splits a page into the list groups, in order', () => {
    const groups = groupByDue(
      [
        task({ id: 'a', dueDate: '2026-10-20' }),
        task({ id: 'b', dueDate: TODAY }),
        task({ id: 'c', dueDate: '2026-10-30' }),
        task({ id: 'd', dueDate: '2026-12-01' }),
        task({ id: 'e' }),
        task({ id: 'f', dueDate: '2026-10-21' }),
      ],
      TODAY,
    );
    expect(groups.map((g) => [g.bucket, g.tasks.map((t) => t.id)])).toEqual([
      ['overdue', ['a', 'f']],
      ['today', ['b']],
      ['next7Days', ['c']],
      ['later', ['d']],
      ['noDueDate', ['e']],
    ]);
  });
});

