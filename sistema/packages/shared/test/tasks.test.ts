import { describe, expect, it } from 'vitest';
import {
  adjustToBusinessDay,
  competenceOfPeriod,
  dateInTimeZone,
  deadlinesFrom,
  dueBucketOf,
  easterSunday,
  fileExtension,
  isBusinessDay,
  isTargetMissed,
  isTaskOverdue,
  nationalHolidayName,
  nationalHolidays,
  nextOccurrences,
  NO_HOLIDAYS,
  occurrencesInCompetence,
  occurrenceSituationOf,
  occurrenceStatusOf,
  occursInCompetence,
  recurringMonths,
  recurringTaskInputSchema,
  sanitizeFileName,
  taskAttachmentInputSchema,
  taskCalendarQuerySchema,
  taskInputSchema,
  taskStatusInputSchema,
  taskUpdateSchema,
  type RecurringSchedule,
} from '../src';

const monthly: RecurringSchedule = {
  period: 'monthly',
  dueDay: 20,
  dueMonth: null,
  targetDaysBefore: 0,
  nonBusinessDayRule: 'keep',
  referenceOffset: 1,
};

describe('task rules', () => {
  it('derives overdue, "fora da meta" and the due-date groups from today', () => {
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
    // Occurrences group by the target (work date); past the target, legal ahead → "Fora da meta".
    expect(dueBucketOf('2026-10-23', today, '2026-10-16')).toBe('targetMissed');
    expect(dueBucketOf('2026-10-23', today, '2026-10-20')).toBe('today');
    expect(dueBucketOf('2026-10-19', today, '2026-10-14')).toBe('overdue');
    expect(isTargetMissed({ status: 'todo', dueDate: '2026-10-20', targetDate: '2026-10-15' }, today)).toBe(true);
    expect(isTargetMissed({ status: 'todo', dueDate: '2026-10-19', targetDate: '2026-10-15' }, today)).toBe(false);
    expect(isTargetMissed({ status: 'done', dueDate: '2026-10-25', targetDate: '2026-10-15' }, today)).toBe(false);
  });

  it('derives the situation of an occurrence (canceled apart, on time by the legal deadline in São Paulo)', () => {
    const today = '2026-10-20';
    const base = { dueDate: '2026-10-20', targetDate: '2026-10-15', completedAt: null };
    expect(occurrenceSituationOf({ ...base, status: 'todo', dueDate: '2026-10-25', targetDate: '2026-10-22' }, today)).toBe('not_started');
    expect(occurrenceSituationOf({ ...base, status: 'waiting_client', dueDate: '2026-10-25', targetDate: '2026-10-22' }, today)).toBe('in_progress');
    expect(occurrenceSituationOf({ ...base, status: 'todo' }, today)).toBe('target_missed');
    expect(occurrenceSituationOf({ ...base, status: 'in_progress', dueDate: '2026-10-19' }, today)).toBe('overdue');
    expect(occurrenceSituationOf({ ...base, status: 'canceled' }, today)).toBe('canceled');
    // 02:30 UTC on Oct 21 is still Oct 20 in São Paulo: on time.
    expect(occurrenceSituationOf({ ...base, status: 'done', completedAt: '2026-10-21T02:30:00Z' }, today)).toBe('done_on_time');
    expect(occurrenceSituationOf({ ...base, status: 'done', completedAt: '2026-10-21T03:30:00Z' }, today)).toBe('done_late');
  });

  it('takes the calendar day in the office time zone', () => {
    // 02:30 UTC on Oct 31 is still Oct 30 in São Paulo (UTC−3).
    expect(dateInTimeZone(new Date('2026-10-31T02:30:00Z'))).toBe('2026-10-30');
    expect(dateInTimeZone(new Date('2026-10-31T03:30:00Z'))).toBe('2026-10-31');
    expect(dateInTimeZone(new Date('2026-10-31T02:30:00Z'), 'UTC')).toBe('2026-10-31');
  });

  it('knows Easter and the national holidays (fixed and moving)', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(nationalHolidayName('2026-04-03')).toBe('Sexta-feira Santa');
    expect(nationalHolidayName('2026-02-16')).toBe('Carnaval');
    expect(nationalHolidayName('2026-02-17')).toBe('Carnaval');
    expect(nationalHolidayName('2026-06-04')).toBe('Corpus Christi');
    expect(nationalHolidayName('2026-10-12')).toBe('Nossa Senhora Aparecida');
    expect(nationalHolidayName('2026-11-20')).toBe('Dia Nacional de Zumbi e da Consciência Negra');
    // National only from 2024 (Lei 14.759/2023).
    expect(nationalHolidayName('2023-11-20')).toBeNull();
    expect(nationalHolidayName('2026-10-13')).toBeNull();
    expect(nationalHolidays(2026).size).toBe(13);
    expect(isBusinessDay('2026-11-02')).toBe(false); // Finados (Monday)
    expect(isBusinessDay('2026-11-02', NO_HOLIDAYS)).toBe(true);
    expect(isBusinessDay('2026-10-24')).toBe(false); // Saturday
  });

  it('moves deadlines off weekends and holidays', () => {
    // 2026-11-21 is a Saturday.
    expect(adjustToBusinessDay('2026-11-21', 'anticipate')).toBe('2026-11-19'); // 20/11 is a holiday
    expect(adjustToBusinessDay('2026-11-21', 'anticipate', NO_HOLIDAYS)).toBe('2026-11-20');
    expect(adjustToBusinessDay('2026-11-21', 'postpone')).toBe('2026-11-23');
    expect(adjustToBusinessDay('2026-11-21', 'keep')).toBe('2026-11-21');
    expect(adjustToBusinessDay('2026-11-19', 'postpone')).toBe('2026-11-19');
    // Saturday Oct 31 → postpone skips Sunday and Finados (Monday Nov 2).
    expect(adjustToBusinessDay('2026-10-31', 'postpone')).toBe('2026-11-03');
    expect(adjustToBusinessDay('2026-11-21', 'postpone', (d) => d === '2026-11-23')).toBe('2026-11-24');
  });

  it('knows the competences of each periodicity', () => {
    expect(recurringMonths(monthly)).toHaveLength(12);
    expect(recurringMonths({ period: 'weekly', dueMonth: null })).toHaveLength(12);
    expect(recurringMonths({ period: 'bimonthly', dueMonth: 2 })).toEqual([2, 4, 6, 8, 10, 12]);
    expect(recurringMonths({ period: 'quarterly', dueMonth: 1 })).toEqual([1, 4, 7, 10]);
    expect(recurringMonths({ period: 'quarterly', dueMonth: 5 })).toEqual([2, 5, 8, 11]);
    expect(recurringMonths({ period: 'semiannual', dueMonth: 3 })).toEqual([3, 9]);
    expect(recurringMonths({ period: 'annual', dueMonth: 5 })).toEqual([5]);
    expect(occursInCompetence({ period: 'quarterly', dueMonth: 1 }, '2026-10')).toBe(true);
    expect(occursInCompetence({ period: 'quarterly', dueMonth: 1 }, '2026-11')).toBe(false);
  });

  it('computes the occurrence of a competence: day 31, holidays, target and reference month', () => {
    // Day 31 in a 30-day month.
    expect(occurrencesInCompetence({ ...monthly, dueDay: 31 }, '2026-11', NO_HOLIDAYS)).toEqual([
      {
        periodKey: '2026-11',
        competence: '2026-11',
        referenceMonth: '2026-10',
        nominalDate: '2026-11-30',
        holiday: null,
        legalDueDate: '2026-11-30',
        targetDate: '2026-11-30',
      },
    ]);
    // Day 20 of November is a national holiday: anticipated to Thursday 19; target 5 days before → 13/11.
    const [nov] = occurrencesInCompetence(
      { ...monthly, nonBusinessDayRule: 'anticipate', targetDaysBefore: 5, referenceOffset: 0 },
      '2026-11',
    );
    expect(nov).toMatchObject({
      holiday: 'Dia Nacional de Zumbi e da Consciência Negra',
      legalDueDate: '2026-11-19',
      targetDate: '2026-11-13',
      referenceMonth: '2026-11',
    });
    // Target on a Sunday → back to Friday 20, a holiday → Thursday 19.
    expect(deadlinesFrom('2026-11-24', { targetDaysBefore: 2, nonBusinessDayRule: 'keep' }).targetDate).toBe('2026-11-19');
    expect(deadlinesFrom('2026-11-24', { targetDaysBefore: 2, nonBusinessDayRule: 'keep' }, NO_HOLIDAYS).targetDate).toBe('2026-11-20');
    // Quarterly outside its months: nothing.
    expect(occurrencesInCompetence({ ...monthly, period: 'quarterly', dueMonth: 1 }, '2026-11')).toEqual([]);
    // Reference 3 months before.
    expect(occurrencesInCompetence({ ...monthly, referenceOffset: 3 }, '2026-01')[0]!.referenceMonth).toBe('2025-10');
  });

  it('has one weekly occurrence per week whose deadline weekday falls in the month', () => {
    const weekly: RecurringSchedule = { ...monthly, period: 'weekly', dueDay: 5, referenceOffset: 0 };
    const october = occurrencesInCompetence(weekly, '2026-10');
    // Fridays of October 2026: 2, 9, 16, 23, 30.
    expect(october.map((o) => o.nominalDate)).toEqual(['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30']);
    expect(october.map((o) => o.periodKey)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    expect(october.every((o) => o.competence === '2026-10' && o.referenceMonth === '2026-10')).toBe(true);
    expect(competenceOfPeriod(weekly, '2026-09-28')).toBe('2026-10');
    expect(competenceOfPeriod(monthly, '2026-09')).toBe('2026-09');
    // Monday deadlines on holidays move like any other.
    const monday = occurrencesInCompetence({ ...weekly, dueDay: 1, nonBusinessDayRule: 'postpone' }, '2026-10');
    expect(monday.find((o) => o.nominalDate === '2026-10-12')!.legalDueDate).toBe('2026-10-13');
  });

  it('previews the next occurrences', () => {
    const next = nextOccurrences({ ...monthly, nonBusinessDayRule: 'anticipate' }, '2026-10', 3);
    expect(next.map((o) => o.legalDueDate)).toEqual(['2026-10-20', '2026-11-19', '2026-12-18']);
  });

  it('derives the state of an aggregated occurrence (canceled do not count)', () => {
    expect(occurrenceStatusOf({ total: 3, done: 0, inProgress: 0 })).toBe('todo');
    expect(occurrenceStatusOf({ total: 3, done: 1, inProgress: 0 })).toBe('in_progress');
    expect(occurrenceStatusOf({ total: 3, done: 0, inProgress: 1 })).toBe('in_progress');
    expect(occurrenceStatusOf({ total: 3, done: 3, inProgress: 0 })).toBe('done');
    expect(occurrenceStatusOf({ total: 3, done: 2, inProgress: 0, canceled: 1 })).toBe('done');
  });

  it('sanitizes attachment names', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Users\\ana\\Guia DAS.pdf')).toBe('Guia DAS.pdf');
    expect(sanitizeFileName('nota"fiscal<1>.xml')).toBe('notafiscal1.xml');
    expect(sanitizeFileName('a\u0000b\u202ecod.exe.pdf')).toBe('abcod.exe.pdf');
    expect(sanitizeFileName('...')).toBe('arquivo');
    expect(sanitizeFileName('.htaccess')).toBe('htaccess');
    const long = sanitizeFileName(`${'x'.repeat(400)}.pdf`);
    expect(long).toHaveLength(255);
    expect(long.endsWith('.pdf')).toBe(true);
    expect(fileExtension('Guia.PDF')).toBe('pdf');
    expect(fileExtension('sem-extensao')).toBe('');
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
    expect(taskStatusInputSchema.parse({ status: 'todo', reason: '  ' })).toEqual({ status: 'todo', reason: null });
  });

  it('requires the legal deadline, a regime or client, and the anchor month of longer periods', () => {
    const base = { name: 'DCTFWeb', dueDay: 15 };
    expect(recurringTaskInputSchema.safeParse(base).success).toBe(false);
    // Without a legal deadline nothing could be generated.
    const noDeadline = recurringTaskInputSchema.safeParse({ name: 'DCTFWeb', regimes: ['mei'] });
    expect(noDeadline.success).toBe(false);
    expect(noDeadline.error!.issues[0]!.message).toBe('Informe o prazo legal');
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
      referenceOffset: 1,
      excludedClientIds: [],
      startCompetence: null,
    });
    expect(recurringTaskInputSchema.safeParse({ ...base, regimes: ['mei'], period: 'annual' }).success).toBe(false);
    expect(recurringTaskInputSchema.safeParse({ ...base, regimes: ['mei'], period: 'semiannual', dueMonth: 3 }).success).toBe(true);
    expect(
      recurringTaskInputSchema.parse({ ...base, regimes: ['mei'], period: 'monthly', dueMonth: 3 }).dueMonth,
    ).toBeNull();
    // Weekly: a weekday, target up to 6 days, reference forced to the same week.
    const weekly = { ...base, period: 'weekly', regimes: ['mei'] };
    expect(recurringTaskInputSchema.safeParse({ ...weekly, dueDay: 8 }).success).toBe(false);
    expect(recurringTaskInputSchema.safeParse({ ...weekly, dueDay: 5, targetDaysBefore: 7 }).success).toBe(false);
    expect(recurringTaskInputSchema.parse({ ...weekly, dueDay: 5, referenceOffset: 2 }).referenceOffset).toBe(0);
    // Window and exceptions.
    expect(
      recurringTaskInputSchema.safeParse({ ...base, regimes: ['mei'], startCompetence: '2026-10', endCompetence: '2026-09' }).success,
    ).toBe(false);
    const id = '11111111-1111-4111-8111-111111111111';
    expect(recurringTaskInputSchema.safeParse({ ...base, clientIds: [id], excludedClientIds: [id] }).success).toBe(false);
  });

  it('bounds the calendar range and validates attachments', () => {
    expect(taskCalendarQuerySchema.safeParse({ from: '2026-09-27', to: '2026-11-07' }).success).toBe(true);
    expect(taskCalendarQuerySchema.safeParse({ from: '2026-09-01', to: '2026-12-01' }).success).toBe(false);
    const ok = taskAttachmentInputSchema.parse({ fileName: '../guia.pdf', contentType: 'application/pdf', content: 'JVBERi0x' });
    expect(ok.fileName).toBe('guia.pdf');
    expect(taskAttachmentInputSchema.safeParse({ fileName: 'x.svg', contentType: 'image/svg+xml', content: 'PHN2Zz4=' }).success).toBe(false);
    expect(taskAttachmentInputSchema.safeParse({ fileName: 'x.html', contentType: 'text/html', content: 'PGh0bWw+' }).success).toBe(false);
    expect(taskAttachmentInputSchema.safeParse({ fileName: 'x.pdf', contentType: 'application/pdf', content: 'não é base64' }).success).toBe(false);
  });
});
