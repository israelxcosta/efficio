// QA (qa-logica-gestao): pure rules of the task schedule — day 31 in short months and February (leap
// year included), deadlines on Saturday, Sunday and national holidays (anticipate × postpone × keep),
// the internal target, quarterly/annual reference months, the registry's weekly periods, tasks' series
// ("a cada N", weekdays, "após N vezes", skip), conclusions on time × late in the America/Sao_Paulo time
// zone and the deadline bands of documents. Expected dates were computed independently (calendar /
// `date -d`), never with the functions under test.

import { describe, expect, it } from 'vitest';
import { addMonths, occurrenceDate } from './dates';
import { buildOccurrenceDates } from './recurrence';
import { deadlineStatus, trackedConvention } from './deadlines';
import {
  adjustToBusinessDay,
  competenceOfPeriod,
  dateInTimeZone,
  deadlinesFrom,
  dueBucketOf,
  easterSunday,
  firstScheduledOccurrence,
  isBusinessDay,
  isTargetMissed,
  nationalHolidayName,
  occurrenceSituationOf,
  occurrencesInCompetence,
  occursInCompetence,
  recurringMonths,
  seriesEndDate,
  type RecurringSchedule,
} from './tasks';

const monthly = (extra: Partial<RecurringSchedule> = {}): RecurringSchedule => ({
  period: 'monthly',
  dueDay: 31,
  dueMonth: null,
  targetDaysBefore: 0,
  nonBusinessDayRule: 'anticipate',
  referenceOffset: 1,
  ...extra,
});

const one = (schedule: RecurringSchedule, competence: string) => {
  const list = occurrencesInCompetence(schedule, competence);
  expect(list, `${competence}: ${JSON.stringify(list)}`).toHaveLength(1);
  return list[0]!;
};

describe('qa-gestao: dia 31 em meses curtos e fevereiro', () => {
  it('31 vira o último dia do mês; fevereiro de 2026 (sábado) antecipa para sexta 27 e posterga para segunda 02/03', () => {
    expect(one(monthly({ nonBusinessDayRule: 'keep' }), '2026-02')).toMatchObject({ nominalDate: '2026-02-28', legalDueDate: '2026-02-28' });
    expect(one(monthly(), '2026-02')).toMatchObject({ nominalDate: '2026-02-28', legalDueDate: '2026-02-27', competence: '2026-02' });
    // Postponing crosses into March, but the competence (audit column) stays February.
    expect(one(monthly({ nonBusinessDayRule: 'postpone' }), '2026-02')).toMatchObject({
      legalDueDate: '2026-03-02',
      competence: '2026-02',
      periodKey: '2026-02',
      referenceMonth: '2026-01',
    });
    // April has 30 days (Thursday 30).
    expect(one(monthly(), '2026-04')).toMatchObject({ nominalDate: '2026-04-30', legalDueDate: '2026-04-30' });
  });

  it('ano bissexto: 29/02/2028 para os dias 29, 30 e 31 (é terça de Carnaval: antecipa a 25, posterga a 01/03); 2027 não é bissexto', () => {
    // Easter 2028 = 16/04 → Carnaval on Monday 28/02 and Tuesday 29/02.
    expect(nationalHolidayName('2028-02-29')).toBe('Carnaval');
    for (const dueDay of [29, 30, 31]) {
      expect(one(monthly({ dueDay, nonBusinessDayRule: 'keep' }), '2028-02')).toMatchObject({ nominalDate: '2028-02-29', legalDueDate: '2028-02-29' });
      expect(one(monthly({ dueDay }), '2028-02')).toMatchObject({ nominalDate: '2028-02-29', legalDueDate: '2028-02-25' });
      expect(one(monthly({ dueDay, nonBusinessDayRule: 'postpone' }), '2028-02')).toMatchObject({ legalDueDate: '2028-03-01', competence: '2028-02' });
    }
    expect(one(monthly({ dueDay: 29 }), '2027-02')).toMatchObject({ nominalDate: '2027-02-28', legalDueDate: '2027-02-26' });
    expect(one(monthly({ dueDay: 29, nonBusinessDayRule: 'postpone' }), '2027-02')).toMatchObject({ legalDueDate: '2027-03-01' });
  });

  it('dia 31 de outubro de 2026 (sábado) postergado pula Finados (segunda 02/11) e cai na terça 03/11', () => {
    expect(one(monthly({ nonBusinessDayRule: 'postpone' }), '2026-10')).toMatchObject({
      nominalDate: '2026-10-31',
      legalDueDate: '2026-11-03',
      competence: '2026-10',
    });
  });

  it('séries de lançamentos mantêm o dia 31 ancorado (31/01 → 28/02 → 31/03 → 30/04) e 29/02 no bissexto', () => {
    expect(buildOccurrenceDates('2026-01-31', 'monthly', 4)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(buildOccurrenceDates('2028-01-31', 'monthly', 2)).toEqual(['2028-01-31', '2028-02-29']);
    expect(occurrenceDate('2028-02-29', 'annual', 1)).toBe('2029-02-28');
    expect(occurrenceDate('2028-02-29', 'annual', 4)).toBe('2032-02-29');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
  });
});

describe('qa-gestao: sábado, domingo e feriados nacionais', () => {
  it('Páscoa e feriados móveis (Carnaval, Sexta-feira Santa, Corpus Christi) em anos conhecidos', () => {
    expect(easterSunday(2024)).toBe('2024-03-31');
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(easterSunday(2028)).toBe('2028-04-16');
    expect(nationalHolidayName('2026-02-16')).toBe('Carnaval');
    expect(nationalHolidayName('2026-02-17')).toBe('Carnaval');
    expect(nationalHolidayName('2026-04-03')).toBe('Sexta-feira Santa');
    expect(nationalHolidayName('2026-06-04')).toBe('Corpus Christi');
    expect(nationalHolidayName('2026-02-18')).toBeNull(); // Quarta-feira de cinzas: expediente
    // Consciência Negra só a partir de 2024 (Lei 14.759/2023).
    expect(nationalHolidayName('2023-11-20')).toBeNull();
    expect(nationalHolidayName('2024-11-20')).not.toBeNull();
    expect(isBusinessDay('2023-11-20')).toBe(true);
  });

  const cases: { name: string; dueDay: number; competence: string; anticipate: string; postpone: string }[] = [
    { name: 'Tiradentes (terça 21/04/2026)', dueDay: 21, competence: '2026-04', anticipate: '2026-04-20', postpone: '2026-04-22' },
    { name: 'Sexta-feira Santa (03/04/2026)', dueDay: 3, competence: '2026-04', anticipate: '2026-04-02', postpone: '2026-04-06' },
    { name: 'Carnaval (segunda 16/02/2026, terça 17)', dueDay: 16, competence: '2026-02', anticipate: '2026-02-13', postpone: '2026-02-18' },
    { name: 'Corpus Christi (quinta 04/06/2026)', dueDay: 4, competence: '2026-06', anticipate: '2026-06-03', postpone: '2026-06-05' },
    { name: 'Consciência Negra (sexta 20/11/2026)', dueDay: 20, competence: '2026-11', anticipate: '2026-11-19', postpone: '2026-11-23' },
    { name: 'Proclamação da República (domingo 15/11/2026)', dueDay: 15, competence: '2026-11', anticipate: '2026-11-13', postpone: '2026-11-16' },
    { name: 'Natal (sexta 25/12/2026)', dueDay: 25, competence: '2026-12', anticipate: '2026-12-24', postpone: '2026-12-28' },
    { name: 'Confraternização (sexta 01/01/2027)', dueDay: 1, competence: '2027-01', anticipate: '2026-12-31', postpone: '2027-01-04' },
    { name: 'Aparecida (segunda 12/10/2026)', dueDay: 12, competence: '2026-10', anticipate: '2026-10-09', postpone: '2026-10-13' },
    { name: 'domingo comum (20/09/2026)', dueDay: 20, competence: '2026-09', anticipate: '2026-09-18', postpone: '2026-09-21' },
  ];
  for (const c of cases) {
    it(`${c.name}: antecipa para ${c.anticipate}, posterga para ${c.postpone}, mantém com "keep"`, () => {
      expect(one(monthly({ dueDay: c.dueDay }), c.competence)).toMatchObject({ legalDueDate: c.anticipate, competence: c.competence });
      expect(one(monthly({ dueDay: c.dueDay, nonBusinessDayRule: 'postpone' }), c.competence)).toMatchObject({ legalDueDate: c.postpone, competence: c.competence });
      expect(one(monthly({ dueDay: c.dueDay, nonBusinessDayRule: 'keep' }), c.competence).legalDueDate).toBe(`${c.competence}-${String(c.dueDay).padStart(2, '0')}`);
    });
  }

  it('o motivo da mudança: o nome do feriado no dia nominal', () => {
    expect(one(monthly({ dueDay: 20 }), '2026-11').holiday).toBe('Dia Nacional de Zumbi e da Consciência Negra');
    expect(one(monthly({ dueDay: 19 }), '2026-11').holiday).toBeNull();
  });
});

describe('qa-gestao: meta interna', () => {
  it('meta = prazo legal − N dias corridos, antecipada para dia útil, nunca depois do prazo legal', () => {
    // Legal 23/11/2026 (postponed from Friday 20); 5 days before → Wednesday 18.
    expect(deadlinesFrom('2026-11-20', { targetDaysBefore: 5, nonBusinessDayRule: 'postpone' })).toEqual({ legalDueDate: '2026-11-23', targetDate: '2026-11-18' });
    // Legal Monday 26/10/2026; 2 days before = Saturday 24 → Friday 23.
    expect(deadlinesFrom('2026-10-26', { targetDaysBefore: 2, nonBusinessDayRule: 'anticipate' })).toEqual({ legalDueDate: '2026-10-26', targetDate: '2026-10-23' });
    // Target on a holiday (Monday 12/10 Aparecida): legal Wednesday 14, 2 days before → Friday 09.
    expect(deadlinesFrom('2026-10-14', { targetDaysBefore: 2, nonBusinessDayRule: 'anticipate' }).targetDate).toBe('2026-10-09');
    // N = 0: the target is the legal deadline itself.
    expect(deadlinesFrom('2026-10-20', { targetDaysBefore: 0, nonBusinessDayRule: 'anticipate' })).toEqual({ legalDueDate: '2026-10-20', targetDate: '2026-10-20' });
  });

  it('com a regra "manter" e meta 0, a meta cai no sábado (doc: "meta sempre antecipada para dia útil")', () => {
    // docs/api.md → Prazos: "A meta = prazo legal − N dias corridos, sempre antecipada para dia útil,
    // nunca depois do prazo legal". With `keep` and N = 1 the target goes to Friday (business day), but
    // with N = 0 it stays on Saturday 31/10/2026 — the internal goal lands on a weekend.
    expect(deadlinesFrom('2026-10-31', { targetDaysBefore: 1, nonBusinessDayRule: 'keep' }).targetDate).toBe('2026-10-30');
    const { legalDueDate, targetDate } = deadlinesFrom('2026-10-31', { targetDaysBefore: 0, nonBusinessDayRule: 'keep' });
    expect(legalDueDate).toBe('2026-10-31');
    expect(isBusinessDay(targetDate), `meta ${targetDate} não é dia útil`).toBe(true);
  });

  it('situações: fora da meta só antes do prazo legal; o grupo de prazo usa a meta', () => {
    const today = '2026-10-20';
    expect(isTargetMissed({ status: 'todo', dueDate: '2026-10-22', targetDate: '2026-10-19' }, today)).toBe(true);
    expect(isTargetMissed({ status: 'todo', dueDate: '2026-10-19', targetDate: '2026-10-16' }, today)).toBe(false); // atrasada
    expect(isTargetMissed({ status: 'done', dueDate: '2026-10-22', targetDate: '2026-10-19' }, today)).toBe(false);
    expect(dueBucketOf('2026-10-22', today, '2026-10-19')).toBe('targetMissed');
    expect(dueBucketOf('2026-10-19', today, '2026-10-16')).toBe('overdue');
    expect(dueBucketOf('2026-10-25', today, '2026-10-20')).toBe('today');
    expect(dueBucketOf('2026-10-27', today)).toBe('next7Days');
    expect(dueBucketOf('2026-10-28', today)).toBe('later');
    expect(dueBucketOf(null, today)).toBe('noDueDate');
  });
});

describe('qa-gestao: trimestral, anual e meses de referência', () => {
  it('meses em que ocorre a partir do mês-âncora', () => {
    expect(recurringMonths({ period: 'quarterly', dueMonth: 1 })).toEqual([1, 4, 7, 10]);
    expect(recurringMonths({ period: 'quarterly', dueMonth: 3 })).toEqual([3, 6, 9, 12]);
    expect(recurringMonths({ period: 'quarterly', dueMonth: 11 })).toEqual([2, 5, 8, 11]);
    expect(recurringMonths({ period: 'bimonthly', dueMonth: 2 })).toEqual([2, 4, 6, 8, 10, 12]);
    expect(recurringMonths({ period: 'semiannual', dueMonth: 7 })).toEqual([1, 7]);
    expect(recurringMonths({ period: 'annual', dueMonth: 3 })).toEqual([3]);
  });

  it('IRPJ/CSLL trimestral (último dia útil do mês seguinte ao trimestre): out/2026 → 30/10, ref. 09/2026; novembro não tem', () => {
    const irpj = monthly({ period: 'quarterly', dueMonth: 1, targetDaysBefore: 5, referenceOffset: 1 });
    expect(one(irpj, '2026-10')).toMatchObject({ nominalDate: '2026-10-31', legalDueDate: '2026-10-30', targetDate: '2026-10-23', referenceMonth: '2026-09', periodKey: '2026-10' });
    expect(occurrencesInCompetence(irpj, '2026-11')).toEqual([]);
    expect(occurrencesInCompetence(irpj, '2026-12')).toEqual([]);
    expect(one(irpj, '2027-01')).toMatchObject({ legalDueDate: '2027-01-29', referenceMonth: '2026-12' });
  });

  it('anuais do catálogo: DEFIS 31/03 ref. 12 do ano anterior; DASN-SIMEI 31/05/2026 (domingo) → 29/05; ECD 30/06', () => {
    const defis = monthly({ period: 'annual', dueMonth: 3, targetDaysBefore: 10, referenceOffset: 3 });
    expect(one(defis, '2026-03')).toMatchObject({ legalDueDate: '2026-03-31', targetDate: '2026-03-20', referenceMonth: '2025-12' });
    for (const m of ['2026-01', '2026-02', '2026-04', '2026-12']) expect(occurrencesInCompetence(defis, m)).toEqual([]);
    const dasn = monthly({ period: 'annual', dueMonth: 5, targetDaysBefore: 10, referenceOffset: 5 });
    expect(one(dasn, '2026-05')).toMatchObject({ nominalDate: '2026-05-31', legalDueDate: '2026-05-29', referenceMonth: '2025-12' });
    const ecd = monthly({ period: 'annual', dueMonth: 6, targetDaysBefore: 15, referenceOffset: 6 });
    expect(one(ecd, '2026-06')).toMatchObject({ legalDueDate: '2026-06-30', referenceMonth: '2025-12' });
  });
});

describe('qa-gestao: semanal do cadastro', () => {
  it('sexta-feira: cinco semanas em outubro/2026, a da sexta 02/10 tem a segunda 28/09 como chave e é de outubro', () => {
    const weekly: RecurringSchedule = { period: 'weekly', dueDay: 5, dueMonth: null, targetDaysBefore: 0, nonBusinessDayRule: 'anticipate', referenceOffset: 0 };
    const list = occurrencesInCompetence(weekly, '2026-10');
    expect(list.map((o) => [o.periodKey, o.legalDueDate])).toEqual([
      ['2026-09-28', '2026-10-02'],
      ['2026-10-05', '2026-10-09'],
      ['2026-10-12', '2026-10-16'],
      ['2026-10-19', '2026-10-23'],
      ['2026-10-26', '2026-10-30'],
    ]);
    expect(competenceOfPeriod(weekly, '2026-09-28')).toBe('2026-10');
    // September's last Friday is the 25th: the week of Monday 28/09 is not September's.
    expect(occurrencesInCompetence(weekly, '2026-09').map((o) => o.periodKey)).not.toContain('2026-09-28');
  });

  it('segunda-feira feriado (Aparecida 12/10/2026) antecipa para a sexta 09/10', () => {
    const monday: RecurringSchedule = { period: 'weekly', dueDay: 1, dueMonth: null, targetDaysBefore: 0, nonBusinessDayRule: 'anticipate', referenceOffset: 0 };
    expect(occurrencesInCompetence(monday, '2026-10').find((o) => o.periodKey === '2026-10-12')).toMatchObject({ legalDueDate: '2026-10-09', holiday: 'Nossa Senhora Aparecida' });
  });
});

describe('qa-gestao: recorrência de tarefa (série)', () => {
  it('diária pulando dias não úteis: outubro/2026 tem 21 dias úteis (22 dias de semana menos Aparecida)', () => {
    const daily: RecurringSchedule = { period: 'daily', dueDay: 1, dueMonth: null, targetDaysBefore: 0, nonBusinessDayRule: 'skip', referenceOffset: 0 };
    const list = occurrencesInCompetence(daily, '2026-10');
    expect(list).toHaveLength(21);
    expect(list.map((o) => o.periodKey)).not.toContain('2026-10-12');
    expect(list.map((o) => o.periodKey)).not.toContain('2026-10-03');
    // November 2026: 21 weekdays minus Finados (02) and Consciência Negra (20) = 19.
    expect(occurrencesInCompetence(daily, '2026-11')).toHaveLength(19);
  });

  it('"após N vezes": semanal seg/qua/sex a partir de 20/10/2026 por 5 vezes termina em 30/10', () => {
    const weekly: RecurringSchedule = {
      period: 'weekly',
      dueDay: 1,
      dueMonth: null,
      weekdays: [1, 3, 5],
      targetDaysBefore: 0,
      nonBusinessDayRule: 'skip',
      referenceOffset: 0,
      startDate: '2026-10-20',
    };
    expect(seriesEndDate(weekly, 5)).toBe('2026-10-30');
    expect(firstScheduledOccurrence(weekly)).toMatchObject({ periodKey: '2026-10-21', legalDueDate: '2026-10-21' });
    // Every 2 weeks from the week of the start (Monday 19/10): 21, 23, then 02/11 (Finados, skipped), 04, 06.
    expect(seriesEndDate({ ...weekly, interval: 2 }, 4)).toBe('2026-11-06');
  });

  it('mensal no dia 31 por 3 vezes a partir de 31/10/2026: 30/10 (sábado → sexta), 30/11 e 31/12', () => {
    const rule = monthly({ startDate: '2026-10-31', referenceOffset: 0 });
    expect(seriesEndDate(rule, 3)).toBe('2026-12-31');
    expect(firstScheduledOccurrence(rule)).toMatchObject({ nominalDate: '2026-10-31', legalDueDate: '2026-10-30' });
    expect(one(rule, '2026-11').legalDueDate).toBe('2026-11-30');
  });

  it('"a cada 2 meses" conta a partir do mês do início; início depois do dia do prazo leva à próxima', () => {
    const every2 = monthly({ dueDay: 20, interval: 2, startDate: '2026-10-20', referenceOffset: 0 });
    expect(occursInCompetence(every2, '2026-10')).toBe(true);
    expect(occursInCompetence(every2, '2026-11')).toBe(false);
    expect(occursInCompetence(every2, '2026-12')).toBe(true);
    expect(occursInCompetence(every2, '2027-02')).toBe(true);
    expect(firstScheduledOccurrence(monthly({ dueDay: 10, startDate: '2026-10-20', referenceOffset: 0 }))).toMatchObject({ nominalDate: '2026-11-10' });
  });

  it('fim por data é inclusivo', () => {
    const rule = monthly({ dueDay: 20, startDate: '2026-10-20', endDate: '2026-12-20', referenceOffset: 0 });
    expect(occurrencesInCompetence(rule, '2026-12')).toHaveLength(1);
    expect(occurrencesInCompetence({ ...rule, endDate: '2026-12-19' }, '2026-12')).toHaveLength(0);
  });
});

describe('qa-gestao: conclusão no prazo × com atraso pelo fuso de São Paulo', () => {
  const occ = (completedAt: string) => ({ status: 'done' as const, dueDate: '2026-10-20', targetDate: '2026-10-20', completedAt });
  it('23h30 de São Paulo (02h30 UTC do dia seguinte) ainda é o dia 20: no prazo; 00h30 do dia 21 é atraso', () => {
    expect(dateInTimeZone(new Date('2026-10-21T02:30:00Z'))).toBe('2026-10-20');
    expect(dateInTimeZone(new Date('2026-10-21T03:30:00Z'))).toBe('2026-10-21');
    expect(occurrenceSituationOf(occ('2026-10-21T02:30:00Z'), '2026-10-21')).toBe('done_on_time');
    expect(occurrenceSituationOf(occ('2026-10-21T03:30:00Z'), '2026-10-21')).toBe('done_late');
    // Without due date, a conclusion is always on time.
    expect(occurrenceSituationOf({ ...occ('2026-12-01T12:00:00Z'), dueDate: null }, '2026-12-01')).toBe('done_on_time');
  });
});

describe('qa-gestao: faixas de vencimento (documentos e convenções)', () => {
  it('limites de 30 e 60 dias inclusivos', () => {
    const today = '2026-10-20';
    expect(deadlineStatus('2026-10-19', today)).toEqual({ bucket: 'overdue', days: -1 });
    expect(deadlineStatus('2026-10-20', today)).toEqual({ bucket: 'within30', days: 0 });
    expect(deadlineStatus('2026-11-19', today)).toEqual({ bucket: 'within30', days: 30 });
    expect(deadlineStatus('2026-11-20', today)).toEqual({ bucket: 'within60', days: 31 });
    expect(deadlineStatus('2026-12-19', today)).toEqual({ bucket: 'within60', days: 60 });
    expect(deadlineStatus('2026-12-20', today)).toEqual({ bucket: 'later', days: 61 });
    expect(deadlineStatus(null, today)).toEqual({ bucket: 'noDate', days: null });
  });

  it('convenção acompanhada avança enquanto o ciclo do ano estiver publicado', () => {
    expect(trackedConvention(3, [], '2026-10-20')).toMatchObject({ year: 2026, dueDate: '2026-03-01', bucket: 'overdue' });
    expect(trackedConvention(3, [{ year: 2026, published: true }], '2026-10-20')).toMatchObject({ year: 2027, dueDate: '2027-03-01', bucket: 'later' });
    expect(trackedConvention(null, [], '2026-10-20')).toBeNull();
  });
});

describe('qa-gestao: adjustToBusinessDay', () => {
  it('sequência de dias não úteis (Carnaval sábado→terça) é atravessada inteira', () => {
    expect(adjustToBusinessDay('2026-02-14', 'postpone')).toBe('2026-02-18');
    expect(adjustToBusinessDay('2026-02-17', 'anticipate')).toBe('2026-02-13');
    expect(adjustToBusinessDay('2026-04-04', 'anticipate')).toBe('2026-04-02'); // Sábado de Aleluia → quinta
  });
});
