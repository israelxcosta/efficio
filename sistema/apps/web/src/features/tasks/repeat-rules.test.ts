// Tarefas › "Não se repete / Repete" (spec §9.4): the form of a task's recurrence, its preview with the
// shared schedule (holidays included), the summary sentence, the validation and the mode of the control
// by kind of task.
import { describe, expect, it } from 'vitest';
import { taskRecurrenceInputSchema, type TaskRecurrence } from '@effinance/shared';
import {
  defaultRepeatForm,
  firstDateNotice,
  patchFor,
  seriesLockedFields,
  nextDates,
  repeatErrors,
  repeatModeOf,
  repeatShortText,
  repeatSummary,
  repeatSummaryOf,
  toRecurrenceInput,
  withStartDate,
  type RepeatForm,
} from './repeat-rules';

const TODAY = '2026-11-05';

const form = (start: string, patch: Partial<RepeatForm> = {}): RepeatForm => ({ ...defaultRepeatForm(start), ...patch });

describe('defaults and the start date', () => {
  it('starts monthly, every 1, on the weekday, day and month of the start', () => {
    expect(defaultRepeatForm('2026-11-10')).toMatchObject({
      frequency: 'monthly',
      interval: '1',
      weekdays: [2],
      dueDay: '10',
      dueMonth: '11',
      skipNonBusiness: true,
      nonBusinessDayRule: 'anticipate',
      ends: 'never',
      targetDaysBefore: '0',
      referenceOffset: '0',
    });
  });

  it('follows a new start only in what the person did not choose', () => {
    const chosen = form('2026-11-10', { weekdays: [1, 3], touched: { weekdays: true, dueDay: false, dueMonth: false } });
    const next = withStartDate(chosen, '2026-11-12');
    expect(next.weekdays).toEqual([1, 3]);
    expect(next.dueDay).toBe('12');
    expect(withStartDate(form('2026-11-10'), '2026-12-03')).toMatchObject({ weekdays: [4], dueDay: '3', dueMonth: '12' });
  });
});

describe('preview with the shared schedule', () => {
  const weekly = form('2026-11-10', { frequency: 'weekly', weekdays: [1, 3] });

  it('weekly on Monday and Wednesday from a Tuesday: the first date moves and the notice says it', () => {
    expect(nextDates(weekly, '2026-11-10')).toEqual(['2026-11-11', '2026-11-16', '2026-11-18']);
    expect(firstDateNotice(weekly, '2026-11-10')).toBe('Esta tarefa passa a vencer em 11/11 (qua), o primeiro dia da regra.');
    expect(repeatSummary(weekly, '2026-11-10', TODAY).startsWith('Toda semana na segunda e na quarta · próximas: 11/11, 16/11 e 18/11')).toBe(true);
    expect(firstDateNotice(form('2026-11-10'), '2026-11-10')).toBeNull();
  });

  it('day 31 becomes the last business day of February, and the summary warns', () => {
    const monthly = form('2027-01-31', { dueDay: '31' });
    expect(nextDates(monthly, '2027-01-31', 2)).toContain('2027-02-26');
    expect(repeatSummary(monthly, '2027-01-31', TODAY)).toContain('em fevereiro, dia 28');
  });

  it('daily on business days skips the weekend', () => {
    expect(nextDates(form('2026-11-13', { frequency: 'daily' }), '2026-11-13')).toEqual(['2026-11-13', '2026-11-16', '2026-11-17']);
  });

  it('"Após 2 vezes" cuts the preview and closes the summary', () => {
    const twice = form('2026-11-10', { ends: 'count', count: '2' });
    expect(nextDates(twice, '2026-11-10', 3)).toHaveLength(2);
    expect(repeatSummary(twice, '2026-11-10', TODAY).endsWith('· 2 vezes.')).toBe(true);
  });

  it('a saved series says the same sentence from its upcoming dates', () => {
    const rule = {
      recurringTaskId: 's',
      frequency: 'weekly',
      interval: 1,
      weekdays: [1, 3],
      dueDay: null,
      dueMonth: null,
      startDate: '2026-11-10',
      ends: 'count',
      endDate: '2027-01-20',
      count: 12,
      targetDaysBefore: 0,
      nonBusinessDayRule: 'skip',
      referenceOffset: 0,
      active: true,
      upcoming: [
        { periodKey: '2026-11-11', legalDueDate: '2026-11-11', targetDate: '2026-11-11' },
        { periodKey: '2026-11-16', legalDueDate: '2026-11-16', targetDate: '2026-11-16' },
        { periodKey: '2026-11-18', legalDueDate: '2026-11-18', targetDate: '2026-11-18' },
        { periodKey: '2026-11-23', legalDueDate: '2026-11-23', targetDate: '2026-11-23' },
      ],
      occurrenceCount: 1,
      canEdit: true,
    } satisfies TaskRecurrence;
    expect(repeatSummaryOf(rule, TODAY)).toBe('Toda semana na segunda e na quarta · próximas: 11/11, 16/11 e 18/11 · 12 vezes.');
  });
});

describe('validation and the request', () => {
  it('uses the messages of the contract, with a period', () => {
    expect(repeatErrors(form('2026-11-10', { frequency: 'weekly', weekdays: [] }), '2026-11-10')).toEqual({ weekdays: 'Escolha ao menos um dia da semana.' });
    expect(repeatErrors(form('2026-11-10', { interval: '0' }), '2026-11-10').interval).toBe('Use de 1 a 99.');
    expect(repeatErrors(form('2026-11-10', { ends: 'date', endDate: '2026-11-01' }), '2026-11-10')).toEqual({ endDate: 'O término deve ser depois do início.' });
    expect(repeatErrors(form('2026-11-10', { ends: 'count', count: '501' }), '2026-11-10').count).toBe('Use de 1 a 500 vezes.');
    expect(repeatErrors(form('2026-11-10'), '')).toEqual({ startDate: 'Informe quando começa.' });
    expect(repeatErrors(form('2026-11-10'), '2026-11-10')).toEqual({});
  });

  it('sends `skip`/`keep` on the daily and the weekly, and a request the contract accepts', () => {
    expect(toRecurrenceInput(form('2026-11-10', { frequency: 'daily', skipNonBusiness: false }), '2026-11-10').nonBusinessDayRule).toBe('keep');
    expect(toRecurrenceInput(form('2026-11-10', { frequency: 'weekly' }), '2026-11-10').nonBusinessDayRule).toBe('skip');
    expect(toRecurrenceInput(form('2026-11-10', { nonBusinessDayRule: 'postpone' }), '2026-11-10').nonBusinessDayRule).toBe('postpone');
    expect(taskRecurrenceInputSchema.safeParse(toRecurrenceInput(form('2026-11-10', { interval: '1' }), '2026-11-10')).success).toBe(true);
  });
});

describe('short text of a rule', () => {
  const rule = (patch: Partial<Pick<TaskRecurrence, 'frequency' | 'interval' | 'weekdays' | 'dueDay' | 'nonBusinessDayRule'>>) => ({
    frequency: 'monthly' as const,
    interval: 1,
    weekdays: [] as number[],
    dueDay: 10 as number | null,
    nonBusinessDayRule: 'anticipate' as const,
    ...patch,
  });

  it('says the rule in a few words', () => {
    expect(repeatShortText(rule({ frequency: 'weekly', weekdays: [1], dueDay: null, nonBusinessDayRule: 'skip' }))).toBe('toda segunda');
    expect(repeatShortText(rule({ frequency: 'weekly', weekdays: [1, 3], interval: 2, dueDay: null }))).toBe('a cada 2 semanas');
    expect(repeatShortText(rule({ frequency: 'daily', dueDay: null, nonBusinessDayRule: 'skip' }))).toBe('todo dia útil');
    expect(repeatShortText(rule({}))).toBe('todo dia 10');
    expect(repeatShortText(rule({ frequency: 'quarterly' }))).toBe('trimestral');
  });
});

describe('mode of the control by kind of task', () => {
  const recurrence = { active: true } as TaskRecurrence;
  const occurrence = (origin: 'registry' | 'task') => ({ origin }) as NonNullable<Parameters<typeof repeatModeOf>[0]['occurrence']>;

  it('hides it on process steps and follows the origin of the occurrence', () => {
    expect(repeatModeOf({ kind: 'flow', occurrence: null, recurrence: null })).toBe('hidden');
    expect(repeatModeOf({ kind: 'recurring', occurrence: occurrence('registry'), recurrence: null })).toBe('registry');
    expect(repeatModeOf({ kind: 'recurring', occurrence: occurrence('task'), recurrence })).toBe('series');
    expect(repeatModeOf({ kind: 'recurring', occurrence: occurrence('task'), recurrence: null })).toBe('ended');
    expect(repeatModeOf({ kind: 'recurring', occurrence: occurrence('task'), recurrence: { active: false } as TaskRecurrence })).toBe('ended');
    expect(repeatModeOf({ kind: 'standalone', occurrence: null, recurrence: null })).toBe('convert');
  });
});

describe('"Só esta" or "Esta e as próximas" (spec §9.4)', () => {
  it('never sends series fields on "Só esta", and always `applyTo: series` on "Esta e as próximas"', () => {
    expect(patchFor('occurrence', 'series', { priority: 'high' })).toEqual({ priority: 'high' });
    expect(patchFor('occurrence', 'series', { title: 'X' })).toBeNull();
    for (const patch of [{ clientId: null }, { categoryId: null }, { startTime: '09:00' }, { endTime: null }]) expect(patchFor('occurrence', 'series', patch)).toBeNull();
    expect(patchFor('series', 'series', { title: 'X' })).toEqual({ title: 'X', applyTo: 'series' });
    expect(patchFor('series', 'series', { priority: 'low' })).toEqual({ priority: 'low', applyTo: 'series' });
    expect(patchFor('series', 'convert', { title: 'X' })).toEqual({ title: 'X' });
    expect(patchFor('occurrence', 'ended', { title: 'X' })).toEqual({ title: 'X' });
  });

  it('locks the series fields on "Só esta" and the dates always', () => {
    const only = seriesLockedFields('occurrence');
    for (const f of ['title', 'clientId', 'categoryId', 'startTime', 'endTime', 'startDate', 'dueDate'] as const) expect(only.has(f)).toBe(true);
    const series = seriesLockedFields('series');
    expect(series.has('title')).toBe(false);
    expect(series.has('dueDate')).toBe(true);
    expect(series.has('startDate')).toBe(true);
  });
});
