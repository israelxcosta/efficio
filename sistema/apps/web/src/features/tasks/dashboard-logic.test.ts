// Início da Gestão: the cards of Effy's dashboard (GET /tasks/dashboard), each one with its bands
// (vencidos, a vencer em 30 dias, em dia, sem data…) that open the list behind them.
import { describe, expect, it } from 'vitest';
import type { DashboardDocuments, DashboardFeeItem, TaskDashboardResponse } from '@effinance/shared';
import {
  conventionBands,
  documentBands,
  documentsOf,
  feeBands,
  feesOf,
  flowDays,
  incompleteText,
  toDocumentDeadline,
  overviewBands,
  processRows,
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
      ['ok', 'Em dia', 5, 'success'],
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
      ['upToDate', 'Em dia', 5, 'success'],
    ]);
  });

  it('says what an incomplete registry lacks', () => {
    expect(incompleteText({ missing: ['municipalRegistration', 'digitalCertificate'] })).toBe('Falta: Inscrição municipal e Certificado digital');
    expect(incompleteText({ missing: ['stateRegistration', 'municipalRegistration', 'accountantPassword'] })).toBe('Falta: Inscrição estadual, Inscrição municipal e Senha do contador');
  });
});
