// Início da Gestão: the cards of Effy's dashboard (GET /tasks/dashboard), each one with its bands
// (vencidos, a vencer em 30 dias, em dia, sem data…) that open the list behind them.
import { describe, expect, it } from 'vitest';
import type { DashboardDocuments, DashboardFeeItem, TaskDashboardResponse } from '@effinance/shared';
import {
  agendaInsight,
  assigneeInsight,
  conventionsInsight,
  documentsInsight,
  feesInsight,
  fiscalInsight,
  overviewInsight,
  BAND_DOT,
  conventionBands,
  documentBands,
  documentsOf,
  feeBands,
  feesOf,
  flowDays,
  flowInsight,
  incompleteText,
  monthElapsed,
  toDocumentDeadline,
  overviewBands,
  processInsight,
  processRows,
  progressHeadline,
  progressSegments,
  severityHeadline,
  taskStatusBands,
} from './dashboard-logic';

const TODAY = '2026-11-04';
const client = (id: string) => ({ id, name: id.toUpperCase() });

const docs: DashboardDocuments = {
  counts: { overdue: 2, within30: 1, ok: 5, noDate: 0 },
  total: 8,
  truncated: false,
  items: [
    { id: '1', client: client('a'), kind: 'digital_certificate', name: 'Certificado digital', expiresAt: '2026-10-01', situation: 'overdue', days: -34 },
    { id: '2', client: client('b'), kind: 'digital_certificate', name: 'Certificado digital', expiresAt: '2026-11-20', situation: 'within30', days: 16 },
    { id: '3', client: client('c'), kind: 'digital_certificate', name: 'Certificado digital', expiresAt: '2026-10-20', situation: 'overdue', days: -15 },
  ],
};

describe('certificates and other documents', () => {
  it('has the bands of Effy (vencidos, a vencer em 30 dias, em dia) and "sem data" only when there is one', () => {
    expect(documentBands(docs).map((b) => [b.key, b.label, b.count, b.tone])).toEqual([
      ['overdue', 'Vencidos', 2, 'danger'],
      ['within30', 'A vencer (30 dias)', 1, 'warning'],
      ['ok', 'Em dia', 5, 'data'],
    ]);
    expect(documentBands({ ...docs, counts: { ...docs.counts, noDate: 3 } }).at(-1)).toMatchObject({ key: 'noDate', label: 'Sem data', count: 3, tone: 'muted' });
  });

  it('turns a document of the card into a row of the deadlines sheet (the same row is reused)', () => {
    expect(toDocumentDeadline(docs.items[1]!)).toEqual({ id: '2', client: client('b'), kind: 'digital_certificate', name: 'Certificado digital', note: null, expiresAt: '2026-11-20', deadline: { bucket: 'within30', days: 16 } });
    expect(toDocumentDeadline({ ...docs.items[1]!, situation: 'ok', days: 45 }).deadline).toEqual({ bucket: 'within60', days: 45 });
    expect(toDocumentDeadline({ ...docs.items[1]!, situation: 'ok', days: 200 }).deadline).toEqual({ bucket: 'later', days: 200 });
  });

  it('lists the documents of a band, the most overdue first', () => {
    expect(documentsOf(docs, 'overdue').map((d) => d.id)).toEqual(['1', '3']);
    expect(documentsOf(docs, null).map((d) => d.id)).toEqual(['1', '3', '2']);
  });
});

describe('collective agreements', () => {
  it('counts the base dates passed, in 30 and in 60 days, without base month, and the rest up to date', () => {
    const conv = { counts: { overdue: 1, within30: 2, within60: 1 }, noBaseMonth: 1, total: 9, items: [] } as TaskDashboardResponse['conventions'];
    expect(conventionBands(conv).map((b) => [b.key, b.count])).toEqual([
      ['overdue', 1],
      ['within30', 2],
      ['within60', 1],
      ['ok', 4],
      ['noDate', 1],
    ]);
    expect(conventionBands(conv).map((b) => b.tone)).toEqual(['danger', 'warning', 'dataSoft', 'data', 'muted']);
  });
});

describe('fees about to end (finance only)', () => {
  const fee = (id: string, days: number): DashboardFeeItem => ({ client: client(id), taxRegime: 'simples_nacional', periodEnd: '2026-12-01', days, monthlyAmount: 50000 });
  const fees = { within30: [fee('a', 12), fee('b', -3)], within60: [fee('c', 45)] };

  it('splits the ended periods from the ones ending in 30 and in 60 days', () => {
    expect(feeBands(fees).map((b) => [b.key, b.label, b.count, b.tone])).toEqual([
      ['ended', 'Vigência encerrada', 1, 'danger'],
      ['within30', 'Vencem em 30 dias', 1, 'warning'],
      ['within60', 'Vencem em 31 a 60 dias', 1, 'muted'],
    ]);
    expect(feesOf(fees, 'ended').map((f) => f.client.id)).toEqual(['b']);
    expect(feesOf(fees, null).map((f) => f.client.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('task cards', () => {
  it('splits the situation of the tasks (overdue apart from pending) with the concluded share', () => {
    const r = taskStatusBands({ total: 20, pending: 9, concluded: 8, overdue: 3 });
    expect(r.bands.map((b) => [b.key, b.count])).toEqual([
      ['overdue', 3],
      ['pending', 9],
      ['concluded', 8],
    ]);
    // Concluded in the data blue, pending in grey (a 0/3 obligation no longer looks full).
    expect(r.bands.map((b) => b.tone)).toEqual(['danger', 'muted', 'data']);
    expect(r.percent).toBe(40);
    expect(taskStatusBands({ total: 0, pending: 0, concluded: 0, overdue: 0 }).percent).toBe(0);
  });

  it('fills the seven days of the flow (days without work count zero) and names them', () => {
    const days = flowDays([{ date: '2026-11-06', recurring: 2, standalone: 1 }], TODAY);
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: '2026-11-04', label: 'Hoje', total: 0, recurring: 0, standalone: 0 });
    expect(days[2]).toEqual({ date: '2026-11-06', label: 'sex 06', total: 3, recurring: 2, standalone: 1 });
  });

  it('orders the departments by pending work and keeps "sem departamento" last', () => {
    const rows = processRows([
      { department: null, recurringCount: 1, total: 4, done: 4, pending: 0, overdue: 0 },
      { department: { id: 'f', name: 'Fiscal' }, recurringCount: 5, total: 30, done: 10, pending: 15, overdue: 5 },
      { department: { id: 'c', name: 'Contábil' }, recurringCount: 2, total: 10, done: 2, pending: 8, overdue: 0 },
    ]);
    expect(rows.map((r) => r.department?.name ?? null)).toEqual(['Fiscal', 'Contábil', null]);
  });

  it('gives the clients overview bands with their hints', () => {
    expect(overviewBands({ attention: 2, pending: 3, upToDate: 5 }).map((b) => [b.key, b.label, b.count, b.tone])).toEqual([
      ['attention', 'Atenção', 2, 'danger'],
      ['pending', 'Pendências', 3, 'warning'],
      ['upToDate', 'Em dia', 5, 'data'],
    ]);
  });

  it('says what an incomplete registry lacks', () => {
    expect(incompleteText({ missing: ['municipalRegistration', 'digitalCertificate'] })).toBe('Falta: Inscrição municipal e Certificado digital');
    expect(incompleteText({ missing: ['stateRegistration', 'municipalRegistration', 'accountantPassword'] })).toBe('Falta: Inscrição estadual, Inscrição municipal e Senha do contador');
  });
});

describe('status cards of the Início', () => {
  it('paints 31–60 days in the soft data tone and keeps green out of the bands', () => {
    expect(BAND_DOT.dataSoft).toBe('bg-data/45');
    expect(Object.keys(BAND_DOT)).not.toContain('success');
  });

  it('orders a progress bar as concluded, overdue, pending', () => {
    expect(progressSegments({ done: 5, overdue: 2, pending: 21 })).toEqual([
      { value: 5, tone: 'data' },
      { value: 2, tone: 'danger' },
      { value: 21, tone: 'muted' },
    ]);
  });

  it('heads a progress card with the share concluded', () => {
    expect(progressHeadline(5, 28)).toEqual({ value: '18%', label: '5 de 28 concluídas' });
    expect(progressHeadline(0, 0)).toEqual({ value: '0%', label: 'nada na competência' });
  });

  it('heads a distribution card with its most severe band, or the share up to date', () => {
    expect(severityHeadline(documentBands({ counts: { overdue: 1, within30: 1, ok: 0, noDate: 0 } }))).toEqual({ value: '1', label: 'vencidos', tone: 'danger' });
    expect(severityHeadline(overviewBands({ attention: 0, pending: 8, upToDate: 0 }))).toEqual({ value: '8', label: 'pendências', tone: 'warning' });
    expect(severityHeadline(documentBands({ counts: { overdue: 0, within30: 0, ok: 4, noDate: 0 } }))).toEqual({ value: '100%', label: 'em dia', tone: 'data' });
    expect(severityHeadline(documentBands({ counts: { overdue: 0, within30: 0, ok: 0, noDate: 0 } }))).toEqual({ value: '0', label: 'nenhum cadastrado', tone: 'muted' });
  });

  it('measures how much of the month went by', () => {
    expect(monthElapsed('2026-11-05', '2026-11')).toBeCloseTo(5 / 30, 5);
    expect(monthElapsed('2026-11-05', '2026-10')).toBe(1);
    expect(monthElapsed('2026-11-05', '2026-12')).toBe(0);
  });

  it('sums the next 7 days of work and names the peak', () => {
    const days = flowDays(
      [
        { date: '2026-11-04', recurring: 1, standalone: 0 },
        { date: '2026-11-10', recurring: 3, standalone: 1 },
      ],
      TODAY,
    );
    expect(flowInsight(days)).toBe('5 em aberto em 7 dias · pico ter 10 (4)');
    expect(flowInsight(flowDays([{ date: TODAY, recurring: 2, standalone: 0 }], TODAY))).toBe('2 em aberto em 7 dias · pico hoje (2)');
    expect(flowInsight(flowDays([], TODAY))).toBe('Nada em aberto nos próximos 7 dias');
  });

  it('says how many legal deadlines fall in the next days and the first one', () => {
    expect(agendaInsight([], TODAY)).toBe('Nenhum prazo legal até 10/11');
    expect(
      agendaInsight(
        [
          { name: 'EFD-Reinf', legalDueDate: '2026-11-09' },
          { name: 'DCTFWeb', legalDueDate: '2026-11-07' },
        ],
        TODAY,
      ),
    ).toBe('2 prazos legais até 10/11 · próximo: DCTFWeb em 07/11');
    expect(agendaInsight([{ name: 'DAS', legalDueDate: '2026-11-20' }], TODAY)).toBe('Nenhum prazo legal até 10/11');
  });

  it('says who holds most of the open work and how much is late', () => {
    const rows = [
      { label: 'Ana Paula Ribeiro', open: 18, overdue: 2 },
      { label: 'Marina Costa', open: 4, overdue: 1 },
    ];
    expect(assigneeInsight(rows)).toBe('Ana R. concentra 80% · 3 atrasadas');
    expect(assigneeInsight(rows.map((r) => ({ ...r, overdue: 0 })))).toBe('Ana R. concentra 82%');
    expect(assigneeInsight([{ label: 'Ana Paula Ribeiro', open: 1, overdue: 0 }, { label: 'Bia', open: 0, overdue: 0 }])).toBe('Ana R. concentra 100%');
    expect(assigneeInsight([])).toBeNull();
    expect(assigneeInsight([{ label: 'Ana', open: 0, overdue: 0 }])).toBeNull();
  });

  it('sums the departments and names the one with most pending work', () => {
    const fiscal = { department: { id: 'f', name: 'Fiscal' }, recurringCount: 3, total: 18, done: 2, pending: 16, overdue: 0 };
    const pessoal = { department: { id: 'p', name: 'Pessoal' }, recurringCount: 1, total: 4, done: 1, pending: 3, overdue: 0 };
    expect(processInsight([fiscal])).toBe('2 de 18 concluídas');
    expect(processInsight([pessoal, fiscal])).toBe('3 de 22 concluídas · mais pendências: Fiscal (16)');
    expect(processInsight([])).toBeNull();
  });
});

describe('finding lines of the status cards', () => {
  it('documents: overdue and due in 30 days, or all up to date', () => {
    expect(documentsInsight(documentBands({ counts: { overdue: 1, within30: 1, ok: 3, noDate: 0 } }))).toBe('1 vencido · 1 vence em 30 dias');
    expect(documentsInsight(documentBands({ counts: { overdue: 2, within30: 0, ok: 3, noDate: 0 } }))).toBe('2 vencidos');
    expect(documentsInsight(documentBands({ counts: { overdue: 0, within30: 3, ok: 3, noDate: 0 } }))).toBe('3 vencem em 30 dias');
    expect(documentsInsight(documentBands({ counts: { overdue: 0, within30: 0, ok: 4, noDate: 1 } }))).toBe('Nenhum vencido nem vencendo em 30 dias');
  });

  it('conventions: base dates passed, then the ones in 30 days', () => {
    const conv = (overdue: number, within30: number) => ({ counts: { overdue, within30, within60: 1 }, noBaseMonth: 0, total: 6 });
    expect(conventionsInsight(conventionBands(conv(1, 2)))).toBe('1 data-base passou · 2 em até 30 dias');
    expect(conventionsInsight(conventionBands(conv(2, 0)))).toBe('2 datas-base passaram');
    expect(conventionsInsight(conventionBands(conv(0, 0)))).toBe('Nenhuma data-base nos próximos 30 dias');
  });

  it('fees: ended periods, then the ones ending in 30 days', () => {
    const fee = (days: number): DashboardFeeItem => ({ client: client('x'), taxRegime: 'simples_nacional', periodEnd: '2026-12-01', days, monthlyAmount: 1 });
    expect(feesInsight(feeBands({ within30: [fee(-2), fee(10)], within60: [] }))).toBe('1 vigência encerrada · 1 vence em 30 dias');
    expect(feesInsight(feeBands({ within30: [], within60: [fee(40), fee(50)] }))).toBe('2 vencem em 31 a 60 dias');
  });

  it('fiscal: pending and overdue of the competence', () => {
    expect(fiscalInsight({ total: 18, done: 2, pending: 16, overdue: 0 })).toBe('16 pendentes · nenhuma atrasada');
    expect(fiscalInsight({ total: 18, done: 2, pending: 15, overdue: 1 })).toBe('15 pendentes · 1 atrasada');
    expect(fiscalInsight({ total: 4, done: 4, pending: 0, overdue: 0 })).toBe('Tudo concluído na competência');
  });

  it('clients overview: how many have issues', () => {
    expect(overviewInsight({ attention: 0, pending: 8, upToDate: 0 })).toBe('8 de 8 clientes com pendências');
    expect(overviewInsight({ attention: 1, pending: 2, upToDate: 5 })).toBe('3 de 8 clientes com pendências');
    expect(overviewInsight({ attention: 0, pending: 0, upToDate: 5 })).toBe('5 clientes em dia');
  });

  it('assignees: the unassigned row keeps its name', () => {
    expect(assigneeInsight([{ label: 'Sem responsável', open: 3, overdue: 0, unassigned: true }, { label: 'Ana Paula Ribeiro', open: 1, overdue: 0 }])).toBe(
      'Sem responsável concentra 75%',
    );
  });
});
