import { describe, expect, it } from 'vitest';
import {
  adjustToBusinessDay,
  dateInTimeZone,
  dueBucketOf,
  isTaskOverdue,
  occurrenceDates,
  occurrenceStatusOf,
  occursInCompetence,
  recurringMonths,
  recurringTaskInputSchema,
  taskInputSchema,
  taskUpdateSchema,
  type RecurringSchedule,
} from '../src';

const monthly: RecurringSchedule = {
  period: 'monthly',
  dueDay: 20,
  dueMonth: null,
  targetDaysBefore: 0,
  nonBusinessDayRule: 'keep',
};

describe('task rules', () => {
  it('derives overdue and the due-date groups from today', () => {
    const today = '2026-10-20';
    expect(isTaskOverdue({ status: 'todo', dueDate: '2026-10-19' }, today)).toBe(true);
    expect(isTaskOverdue({ status: 'waiting_client', dueDate: '2026-10-19' }, today)).toBe(true);
    expect(isTaskOverdue({ status: 'done', dueDate: '2026-10-19' }, today)).toBe(false);
    expect(isTaskOverdue({ status: 'todo', dueDate: '2026-10-20' }, today)).toBe(false);
    expect(isTaskOverdue({ status: 'todo', dueDate: null }, today)).toBe(false);
    expect(dueBucketOf('2026-10-19', today)).toBe('overdue');
    expect(dueBucketOf('2026-10-20', today)).toBe('today');
    expect(dueBucketOf('2026-10-27', today)).toBe('next7Days');
    expect(dueBucketOf('2026-10-28', today)).toBe('later');
    expect(dueBucketOf(null, today)).toBe('noDueDate');
  });

  it('takes the calendar day in the office time zone', () => {
    // 02:30 UTC on Oct 31 is still Oct 30 in São Paulo (UTC−3).
    expect(dateInTimeZone(new Date('2026-10-31T02:30:00Z'))).toBe('2026-10-30');
    expect(dateInTimeZone(new Date('2026-10-31T03:30:00Z'))).toBe('2026-10-31');
    expect(dateInTimeZone(new Date('2026-10-31T02:30:00Z'), 'UTC')).toBe('2026-10-31');
  });

  it('moves deadlines off weekends (holidays plug in)', () => {
    // 2026-11-21 is a Saturday.
    expect(adjustToBusinessDay('2026-11-21', 'anticipate')).toBe('2026-11-20');
    expect(adjustToBusinessDay('2026-11-21', 'postpone')).toBe('2026-11-23');
    expect(adjustToBusinessDay('2026-11-21', 'keep')).toBe('2026-11-21');
    expect(adjustToBusinessDay('2026-11-20', 'postpone')).toBe('2026-11-20');
    // A holiday on Monday pushes a postponed deadline to Tuesday.
    expect(adjustToBusinessDay('2026-11-21', 'postpone', (d) => d === '2026-11-23')).toBe(
      '2026-11-24',
    );
  });

  it('knows the competences and deadlines of a recurring task', () => {
    expect(recurringMonths(monthly)).toHaveLength(12);
    const quarterly = { ...monthly, period: 'quarterly' as const, dueMonth: 1 };
    expect(recurringMonths(quarterly)).toEqual([1, 4, 7, 10]);
    expect(recurringMonths({ ...quarterly, dueMonth: 5 })).toEqual([2, 5, 8, 11]);
    expect(recurringMonths({ ...monthly, period: 'annual', dueMonth: 5 })).toEqual([5]);
    // Without a due day it shows in the audit every month.
    expect(
      recurringMonths({ ...monthly, period: 'annual', dueDay: null, dueMonth: null }),
    ).toHaveLength(12);
    expect(occursInCompetence(quarterly, '2026-10')).toBe(true);
    expect(occursInCompetence(quarterly, '2026-11')).toBe(false);

    // Day 31 in a 30-day month, then the weekend rule; the target goes N days back to a business day.
    expect(occurrenceDates({ ...monthly, dueDay: 31 }, '2026-11')).toEqual({
      legalDueDate: '2026-11-30',
      targetDate: '2026-11-30',
    });
    expect(
      occurrenceDates({ ...monthly, dueDay: 21, nonBusinessDayRule: 'postpone' }, '2026-11')
        .legalDueDate,
    ).toBe('2026-11-23');
    expect(
      occurrenceDates(
        { ...monthly, dueDay: 21, nonBusinessDayRule: 'anticipate', targetDaysBefore: 5 },
        '2026-11',
      ),
    ).toEqual({
      legalDueDate: '2026-11-20',
      targetDate: '2026-11-13',
    });
    // Target on a Sunday → Friday.
    expect(
      occurrenceDates({ ...monthly, dueDay: 24, targetDaysBefore: 2 }, '2026-11').targetDate,
    ).toBe('2026-11-20');
    expect(occurrenceDates({ ...monthly, dueDay: null }, '2026-11')).toEqual({
      legalDueDate: null,
      targetDate: null,
    });
  });

  it('derives the state of an aggregated occurrence', () => {
    expect(occurrenceStatusOf({ total: 3, done: 0, inProgress: 0 })).toBe('todo');
    expect(occurrenceStatusOf({ total: 3, done: 1, inProgress: 0 })).toBe('in_progress');
    expect(occurrenceStatusOf({ total: 3, done: 0, inProgress: 1 })).toBe('in_progress');
    expect(occurrenceStatusOf({ total: 3, done: 3, inProgress: 0 })).toBe('done');
  });
});

describe('task schemas', () => {
  it('validates the appointment and the dates', () => {
    const base = { title: 'Reunião', dueDate: '2026-10-30' };
    expect(taskInputSchema.parse(base)).toMatchObject({
      priority: 'medium',
      status: 'todo',
      clientId: null,
      startTime: null,
    });
    expect(
      taskInputSchema.safeParse({ ...base, startTime: '14:00', endTime: '13:00' }).success,
    ).toBe(false);
    expect(taskInputSchema.safeParse({ ...base, startTime: '25:00' }).success).toBe(false);
    expect(taskInputSchema.safeParse({ title: 'x', startTime: '09:00' }).success).toBe(false);
    expect(taskInputSchema.safeParse({ ...base, startDate: '2026-10-31' }).success).toBe(false);
    expect(taskInputSchema.safeParse({ title: '  ' }).success).toBe(false);
    // Autosave sends one field and gets no defaults back.
    expect(taskUpdateSchema.parse({ priority: 'high' })).toEqual({ priority: 'high' });
  });

  it('requires a regime or client and the month of quarterly/annual deadlines', () => {
    const base = { name: 'DCTFWeb', dueDay: 15 };
    expect(recurringTaskInputSchema.safeParse(base).success).toBe(false);
    expect(
      recurringTaskInputSchema.parse({
        ...base,
        regimes: ['simples_nacional', 'simples_nacional'],
      }),
    ).toMatchObject({
      period: 'monthly',
      dueMonth: null,
      regimes: ['simples_nacional'],
      nonBusinessDayRule: 'anticipate',
    });
    expect(
      recurringTaskInputSchema.safeParse({ ...base, regimes: ['mei'], period: 'annual' }).success,
    ).toBe(false);
    expect(
      recurringTaskInputSchema.parse({ ...base, regimes: ['mei'], period: 'monthly', dueMonth: 3 })
        .dueMonth,
    ).toBeNull();
  });
});
