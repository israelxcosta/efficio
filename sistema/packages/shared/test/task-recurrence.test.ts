// Recurrence of any task (`recurrence` on POST/PATCH /tasks): the shared schedule (daily, weekly on
// several weekdays, "every N", start/end dates, skipping non-business days, "after N times") and the
// input schema. October 2026: the 1st is a Thursday, the 12th (Monday) is a national holiday.

import { describe, expect, it } from 'vitest';
import {
  competenceOfPeriod,
  firstScheduledOccurrence,
  nextOccurrences,
  occurrencesInCompetence,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_FREQUENCY_LABELS,
  RECURRENCE_NON_BUSINESS_DAY_RULE_LABELS,
  seriesEndDate,
  taskInputSchema,
  taskMyOverviewQuerySchema,
  taskRecurrenceInputSchema,
  taskUpdateSchema,
  type RecurringSchedule,
} from '../src';

const base = { dueMonth: null, targetDaysBefore: 0, referenceOffset: 0 } as const;
const daily = (extra: Partial<RecurringSchedule> = {}): RecurringSchedule => ({
  ...base,
  period: 'daily',
  dueDay: 1,
  nonBusinessDayRule: 'skip',
  interval: 1,
  startDate: '2026-10-01',
  ...extra,
});
const days = (list: { nominalDate: string }[]) => list.map((o) => o.nominalDate.slice(8));

describe('task recurrence: the schedule', () => {
  it('daily: every business day from the start (skip), or every N days', () => {
    const all = occurrencesInCompetence(daily(), '2026-10');
    expect(days(all)).toEqual(['01', '02', '05', '06', '07', '08', '09', '13', '14', '15', '16', '19', '20', '21', '22', '23', '26', '27', '28', '29', '30']);
    // Day-based occurrences are identified by their date; the competence is its month.
    expect(all[0]).toMatchObject({ periodKey: '2026-10-01', competence: '2026-10', referenceMonth: '2026-10', legalDueDate: '2026-10-01', targetDate: '2026-10-01' });
    expect(days(occurrencesInCompetence(daily({ interval: 2, nonBusinessDayRule: 'keep' }), '2026-10'))).toHaveLength(16);
    expect(days(occurrencesInCompetence(daily({ interval: 2 }), '2026-10'))).toEqual(['01', '05', '07', '09', '13', '15', '19', '21', '23', '27', '29']);
    // End date (inclusive) and nothing before the start.
    expect(days(occurrencesInCompetence(daily({ interval: 2, endDate: '2026-10-09' }), '2026-10'))).toEqual(['01', '05', '07', '09']);
    expect(occurrencesInCompetence(daily(), '2026-09')).toEqual([]);
    expect(competenceOfPeriod(daily(), '2026-10-31')).toBe('2026-10');
  });

  it('weekly on several weekdays, every N weeks from the week of the start; holidays skip or move', () => {
    const schedule: RecurringSchedule = { ...base, period: 'weekly', dueDay: 1, weekdays: [1, 3, 5], interval: 2, nonBusinessDayRule: 'skip', startDate: '2026-10-07' };
    const oct = occurrencesInCompetence(schedule, '2026-10');
    expect(days(oct)).toEqual(['07', '09', '19', '21', '23']);
    expect(oct.map((o) => o.periodKey)).toEqual(['2026-10-07', '2026-10-09', '2026-10-19', '2026-10-21', '2026-10-23']);
    expect(competenceOfPeriod(schedule, '2026-11-02')).toBe('2026-11');
    const mondays: RecurringSchedule = { ...base, period: 'weekly', dueDay: 1, weekdays: [1], nonBusinessDayRule: 'skip', startDate: '2026-10-01' };
    expect(days(occurrencesInCompetence(mondays, '2026-10'))).toEqual(['05', '19', '26']);
    const postponed = occurrencesInCompetence({ ...mondays, nonBusinessDayRule: 'postpone' }, '2026-10').find((o) => o.periodKey === '2026-10-12');
    expect(postponed).toMatchObject({ legalDueDate: '2026-10-13', holiday: 'Nossa Senhora Aparecida' });
    // The registry's weekly (no weekdays) keeps the Monday as its key.
    expect(competenceOfPeriod({ ...base, period: 'weekly', dueDay: 5, nonBusinessDayRule: 'keep' }, '2026-09-28')).toBe('2026-10');
  });

  it('monthly every N months from the month of the start; bounds by date', () => {
    const quarterly: RecurringSchedule = { ...base, period: 'monthly', dueDay: 15, interval: 3, nonBusinessDayRule: 'keep', startDate: '2026-11-15' };
    expect(occurrencesInCompetence(quarterly, '2026-10')).toEqual([]);
    expect(occurrencesInCompetence(quarterly, '2026-11').map((o) => o.nominalDate)).toEqual(['2026-11-15']);
    expect(occurrencesInCompetence(quarterly, '2026-12')).toEqual([]);
    expect(occurrencesInCompetence(quarterly, '2027-02').map((o) => o.nominalDate)).toEqual(['2027-02-15']);
    const monthly: RecurringSchedule = { ...base, period: 'monthly', dueDay: 20, nonBusinessDayRule: 'keep', startDate: '2026-10-21', endDate: '2026-12-19' };
    expect(occurrencesInCompetence(monthly, '2026-10')).toEqual([]);
    expect(occurrencesInCompetence(monthly, '2026-11')).toHaveLength(1);
    expect(occurrencesInCompetence(monthly, '2026-12')).toEqual([]);
    expect(nextOccurrences(monthly, '2026-10', 3).map((o) => o.nominalDate)).toEqual(['2026-11-20']);
  });

  it('first occurrence and the end date of "after N times"', () => {
    expect(firstScheduledOccurrence({ ...base, period: 'monthly', dueDay: 10, nonBusinessDayRule: 'anticipate', startDate: '2026-10-15' })).toMatchObject({
      periodKey: '2026-11',
      nominalDate: '2026-11-10',
      legalDueDate: '2026-11-10',
    });
    expect(firstScheduledOccurrence({ ...base, period: 'monthly', dueDay: 10, nonBusinessDayRule: 'keep', startDate: '2026-10-15', endDate: '2026-11-01' })).toBeNull();
    expect(seriesEndDate(daily(), 3)).toBe('2026-10-05');
    expect(seriesEndDate({ ...base, period: 'weekly', dueDay: 1, weekdays: [1, 3, 5], nonBusinessDayRule: 'keep', startDate: '2026-10-05' }, 3)).toBe('2026-10-09');
    expect(seriesEndDate({ ...base, period: 'annual', dueDay: 15, dueMonth: 11, nonBusinessDayRule: 'keep', startDate: '2026-11-15' }, 2)).toBe('2027-11-15');
    // Never beyond the series' own end; null when it has fewer occurrences.
    expect(seriesEndDate(daily({ endDate: '2026-10-02' }), 5)).toBeNull();
  });

  it('labels cover every frequency and rule', () => {
    expect(RECURRENCE_FREQUENCIES).toEqual(['daily', 'weekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual']);
    expect(RECURRENCE_FREQUENCY_LABELS.daily).toBe('Diária');
    expect(Object.keys(RECURRENCE_NON_BUSINESS_DAY_RULE_LABELS).sort()).toEqual(['anticipate', 'keep', 'postpone', 'skip']);
  });
});

describe('task recurrence: the input', () => {
  const issues = (input: unknown) => {
    const r = taskRecurrenceInputSchema.safeParse(input);
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  };

  it('normalizes and defaults', () => {
    const weekly = taskRecurrenceInputSchema.parse({ frequency: 'weekly', weekdays: [5, 1, 1, 3] });
    expect(weekly).toMatchObject({ frequency: 'weekly', interval: 1, weekdays: [1, 3, 5], ends: 'never', endDate: null, count: null, startDate: null, nonBusinessDayRule: 'skip' });
    expect(taskRecurrenceInputSchema.parse({ frequency: 'monthly', dueDay: 10 })).toMatchObject({ nonBusinessDayRule: 'anticipate', referenceOffset: 0, weekdays: [] });
    expect(taskRecurrenceInputSchema.parse({ frequency: 'daily', ends: 'count', count: 10 })).toMatchObject({ count: 10, endDate: null });
  });

  it('refuses rules that cannot be generated', () => {
    expect(issues({ frequency: 'weekly' })).toEqual(['weekdays: Escolha ao menos um dia da semana']);
    expect(issues({ frequency: 'monthly', nonBusinessDayRule: 'skip' })).toEqual(['nonBusinessDayRule: Pular o dia não útil vale só para a diária e a semanal']);
    expect(issues({ frequency: 'annual', interval: 2 })).toEqual(['interval: "A cada N" vale só para a diária, a semanal e a mensal']);
    expect(issues({ frequency: 'daily', ends: 'date' })).toEqual(['endDate: Informe a data de término']);
    expect(issues({ frequency: 'daily', ends: 'count' })).toEqual(['count: Informe quantas vezes']);
    expect(issues({ frequency: 'daily', targetDaysBefore: 2 })).toEqual(['targetDaysBefore: Na diária a meta é o próprio dia']);
    expect(issues({ frequency: 'weekly', weekdays: [1], referenceOffset: 1 })).toEqual(['referenceOffset: Na diária e na semanal a referência é o próprio período']);
    expect(issues({ frequency: 'daily', startDate: '2026-10-10', ends: 'date', endDate: '2026-10-01' })).toEqual(['endDate: O término deve ser depois do início']);
    expect(issues({ frequency: 'monthly', count: 3, ends: 'count', interval: 100 })).toHaveLength(1);
  });

  it('rides on the task input and the PATCH', () => {
    const created = taskInputSchema.parse({ title: 'Conferir caixa', recurrence: { frequency: 'daily' } });
    expect(created.recurrence).toMatchObject({ frequency: 'daily', interval: 1 });
    expect(taskInputSchema.parse({ title: 'Sem recorrência' }).recurrence).toBeNull();
    expect(taskUpdateSchema.parse({ recurrence: null, applyTo: 'series' })).toEqual({ recurrence: null, applyTo: 'series' });
    expect(taskUpdateSchema.safeParse({ applyTo: 'all' }).success).toBe(false);
    expect(taskMyOverviewQuerySchema.parse({})).toEqual({});
    expect(taskMyOverviewQuerySchema.safeParse({ month: '2026-13' }).success).toBe(false);
  });
});
