// Auditoria mensal › "Por cliente" as a list in every width (each client with its progress, opened to
// show the month's obligations).
import { describe, expect, it } from 'vitest';
import type { AuditClientRow } from '@effinance/shared';
import {
  auditListKey,
  autoExpandedClients,
  cellConclusionLine,
  cellDeadlines,
  cellSituationText,
  cellTip,
  clientDeadlineNote,
  clientNextTarget,
  clientProgress,
  concludedAtText,
  conclusionDelayDays,
  conclusionDelayText,
  obligationDeadlineDetail,
  sameDeadlines,
  situationException,
  stackedMeta,
  taskRowLabel,
} from './audit-logic';
import { makeCell, makeOccurrence } from './test-fixtures';

const TODAY = '2026-10-28';

const row = (id: string, patch: Partial<AuditClientRow> = {}): AuditClientRow => ({
  id,
  name: id,
  legalName: `${id} Ltda`,
  document: '12345678000190',
  taxRegime: 'simples_nacional',
  total: 5,
  done: 2,
  canceled: 0,
  inProgress: 0,
  overduePending: 0,
  targetMissedPending: 0,
  monthConcludedAt: null,
  ...patch,
});

describe('client progress in the competence', () => {
  it('says "N de M" without the canceled ones and gives the proportion for the bar', () => {
    expect(clientProgress(row('a', { total: 5, done: 2, canceled: 1 }))).toEqual({ done: 2, live: 4, ratio: 0.5, text: '2 de 4' });
    expect(clientProgress(row('b', { total: 3, done: 3 }))).toEqual({ done: 3, live: 3, ratio: 1, text: '3 de 3' });
  });

  it('never divides by zero (everything canceled)', () => {
    expect(clientProgress(row('c', { total: 2, done: 0, canceled: 2 }))).toEqual({ done: 0, live: 0, ratio: 0, text: '0 de 0' });
  });
});

describe('keyboard of the list (one client row focused at a time)', () => {
  it('moves between the clients with the arrows, Home and End, stopping at the edges', () => {
    expect(auditListKey('ArrowDown', 0, 3, false)).toEqual({ type: 'focus', index: 1 });
    expect(auditListKey('ArrowDown', 2, 3, false)).toEqual({ type: 'focus', index: 2 });
    expect(auditListKey('ArrowUp', 0, 3, false)).toEqual({ type: 'focus', index: 0 });
    expect(auditListKey('ArrowUp', 2, 3, true)).toEqual({ type: 'focus', index: 1 });
    expect(auditListKey('Home', 2, 3, false)).toEqual({ type: 'focus', index: 0 });
    expect(auditListKey('End', 0, 3, false)).toEqual({ type: 'focus', index: 2 });
  });

  it('opens with → and closes with ← (like a tree), and ignores the rest', () => {
    expect(auditListKey('ArrowRight', 1, 3, false)).toEqual({ type: 'expand' });
    expect(auditListKey('ArrowRight', 1, 3, true)).toBeNull();
    expect(auditListKey('ArrowLeft', 1, 3, true)).toEqual({ type: 'collapse' });
    expect(auditListKey('ArrowLeft', 1, 3, false)).toBeNull();
    expect(auditListKey('a', 1, 3, false)).toBeNull();
    expect(auditListKey('ArrowDown', 0, 0, false)).toBeNull();
  });
});

describe('clients opened on arrival', () => {
  it('opens the only client of a search ("Ver na auditoria" from Clientes), never a long list', () => {
    expect(autoExpandedClients([row('a')])).toEqual(['a']);
    expect(autoExpandedClients([row('a'), row('b')])).toEqual([]);
    expect(autoExpandedClients([])).toEqual([]);
  });
});

describe('an obligation of the client in the month', () => {
  it('shows the target and the legal deadline, and the delay while pending', () => {
    expect(cellDeadlines(makeCell({ targetDate: '2026-10-29', legalDueDate: '2026-10-30' }), TODAY)).toEqual({
      dates: 'Meta 29/10 · legal 30/10',
      status: { text: 'Meta amanhã · legal 30/10', tone: 'warning' },
    });
    expect(cellDeadlines(makeCell({ targetDate: '2026-10-20', legalDueDate: '2026-10-20', overdue: true }), TODAY)).toEqual({
      dates: 'Legal 20/10',
      status: { text: 'Prazo legal venceu há 8 dias', tone: 'danger' },
    });
    // Concluded: just the dates.
    expect(cellDeadlines(makeCell({ status: 'done', targetDate: '2026-10-15', legalDueDate: '2026-10-20' }), TODAY)).toEqual({ dates: 'Meta 15/10 · legal 20/10', status: null });
  });

  it('names the situation (who concluded and when go to their own columns)', () => {
    expect(cellSituationText(makeCell({ status: 'todo' }), TODAY)).toBe('A fazer');
    expect(cellSituationText(makeCell({ status: 'in_progress' }), TODAY)).toBe('Em andamento');
    expect(cellSituationText(makeCell({ status: 'waiting_client' }), TODAY)).toBe('Aguardando cliente');
    expect(cellSituationText(makeCell({ status: 'done', concludedBy: { id: 'm', name: 'Marina Souza' }, concludedAt: '2026-10-27T13:00:00Z' }), TODAY)).toBe('Concluída');
    expect(cellSituationText(makeCell({ status: 'done', concludedBy: null, concludedAt: null }), TODAY)).toBe('Concluída');
    expect(cellSituationText(makeCell({ status: 'canceled' }), TODAY)).toBe('Cancelada');
  });
});

describe('the conclusion of an occurrence (columns "Data de conclusão" and "Concluída por")', () => {
  const done = (patch: Parameters<typeof makeCell>[0] = {}) =>
    makeCell({ status: 'done', legalDueDate: '2026-10-20', targetDate: '2026-10-15', concludedBy: { id: 'm', name: 'Marina Souza' }, concludedAt: '2026-10-27T10:45:00Z', ...patch });

  it('counts the days of delay after the legal deadline, by the day in the office time zone', () => {
    expect(conclusionDelayDays({ status: 'done', legalDueDate: '2026-10-20', concludedAt: '2026-10-22T13:00:00Z' })).toBe(2);
    expect(conclusionDelayDays({ status: 'done', legalDueDate: '2026-10-20', concludedAt: '2026-10-20T13:00:00Z' })).toBeNull();
    // 23:30 of 20/10 in São Paulo (already 21/10 in UTC): on time.
    expect(conclusionDelayDays({ status: 'done', legalDueDate: '2026-10-20', concludedAt: '2026-10-21T02:30:00Z' })).toBeNull();
    expect(conclusionDelayDays({ status: 'done', legalDueDate: '2026-10-20', concludedAt: null })).toBeNull();
    expect(conclusionDelayDays({ status: 'in_progress', legalDueDate: '2026-10-20', concludedAt: '2026-10-22T13:00:00Z' })).toBeNull();
  });

  it('writes the delay in days', () => {
    expect(conclusionDelayText(1)).toBe('1 dia de atraso');
    expect(conclusionDelayText(2)).toBe('2 dias de atraso');
  });

  it('writes the moment of the conclusion: day and time in the office time zone, the year only when it is another one', () => {
    expect(concludedAtText('2026-10-27T10:45:00Z', TODAY)).toBe('27/10, 07:45');
    expect(concludedAtText('2026-10-27T10:45:00Z', TODAY, false)).toBe('27/10');
    expect(concludedAtText('2025-10-27T10:45:00Z', TODAY)).toBe('27/10/25, 07:45');
  });

  it('sums the conclusion in one line for the stacked rows', () => {
    expect(cellConclusionLine(done(), TODAY)).toBe('Concluída em 27/10, 07:45 · Marina S.');
    expect(cellConclusionLine(done(), TODAY, false)).toBe('Concluída em 27/10 · Marina S.');
    expect(cellConclusionLine(done({ concludedBy: null }), TODAY)).toBe('Concluída em 27/10, 07:45');
    expect(cellConclusionLine(done({ concludedBy: null, concludedAt: null }), TODAY)).toBe('Concluída');
    expect(cellConclusionLine(makeCell({ status: 'todo' }), TODAY)).toBeNull();
  });

  it('keeps who concluded and when in the accessible text, with the delay', () => {
    expect(cellTip(done({ concludedAt: '2026-10-22T13:00:00Z' }), 'Fiscal')).toBe('Concluída por Marina Souza em 22/10/2026 às 10:00, 2 dias após o prazo legal');
    expect(cellTip(done({ concludedAt: '2026-10-21T13:00:00Z' }), 'Fiscal')).toBe('Concluída por Marina Souza em 21/10/2026 às 10:00, 1 dia após o prazo legal');
    expect(cellTip(done({ concludedAt: '2026-10-20T13:00:00Z' }), 'Fiscal')).toBe('Concluída por Marina Souza em 20/10/2026 às 10:00');
    expect(cellTip(done({ concludedBy: null, concludedAt: null }), 'Fiscal')).toBe('Concluída');
  });

  it('says whether an occurrence keeps the deadlines of its task', () => {
    const column = { targetDate: '2026-10-15', legalDueDate: '2026-10-20' };
    expect(sameDeadlines({ targetDate: '2026-10-15', legalDueDate: '2026-10-20' }, column)).toBe(true);
    expect(sameDeadlines({ targetDate: '2026-10-17', legalDueDate: '2026-10-20' }, column)).toBe(false);
    expect(sameDeadlines({ targetDate: '2026-10-15', legalDueDate: '2026-10-21' }, column)).toBe(false);
  });
});

describe('the task row of "Por tarefa"', () => {
  it('reads the count and how the deadline stands, and what the click does', () => {
    const col = makeOccurrence({ name: 'Folha de pagamento', total: 3, done: 1, canceled: 0, pending: 2, legalDueDate: TODAY, targetDate: TODAY });
    expect(taskRowLabel(col, TODAY, false)).toBe('Folha de pagamento: 1 de 3 concluídas, prazo legal hoje. Mostrar clientes.');
    expect(taskRowLabel(col, TODAY, true)).toBe('Folha de pagamento: 1 de 3 concluídas, prazo legal hoje. Recolher clientes.');
    expect(taskRowLabel({ ...col, total: 4, canceled: 1, done: 3, pending: 0, targetDate: '2026-10-26' }, TODAY, false)).toBe('Folha de pagamento: 3 de 3 concluídas, meta 26/10 · legal 28/10. Mostrar clientes.');
  });
});

describe('lean audit texts (spec §11.8)', () => {
  it('gives the nearest target among the pending occurrences of a client', () => {
    const cells = [
      makeCell({ status: 'todo', targetDate: '2026-11-07' }),
      makeCell({ status: 'in_progress', targetDate: '2026-11-03' }),
      makeCell({ status: 'done', targetDate: '2026-10-20' }),
    ];
    expect(clientNextTarget(cells)).toBe('2026-11-03');
    expect(clientNextTarget([makeCell({ status: 'done' }), makeCell({ status: 'canceled' })])).toBeNull();
  });

  it('says the alert of a client: overdue first, then out of the target', () => {
    expect(clientDeadlineNote({ overduePending: 2, targetMissedPending: 1 })).toEqual({ text: '2 atrasadas', tone: 'danger' });
    expect(clientDeadlineNote({ overduePending: 1, targetMissedPending: 0 })).toEqual({ text: '1 atrasada', tone: 'danger' });
    expect(clientDeadlineNote({ overduePending: 0, targetMissedPending: 1 })).toEqual({ text: '1 fora da meta', tone: 'warning' });
    expect(clientDeadlineNote({ overduePending: 0, targetMissedPending: 0 })).toBeNull();
  });

  it('keeps on the second line of the deadline only the alert or the legal date (Por cliente)', () => {
    const pending = (targetDate: string, legalDueDate: string) => makeCell({ status: 'todo', targetDate, legalDueDate });
    expect(obligationDeadlineDetail(pending('2026-10-24', '2026-10-26'), TODAY)).toEqual({ text: 'Prazo legal venceu há 2 dias', tone: 'danger' });
    expect(obligationDeadlineDetail(pending('2026-10-28', '2026-10-28'), TODAY)).toEqual({ text: 'Prazo legal hoje', tone: 'warning-strong' });
    expect(obligationDeadlineDetail(pending('2026-10-25', '2026-11-05'), TODAY)).toEqual({ text: 'Fora da meta · legal 05/11', tone: 'warning' });
    expect(obligationDeadlineDetail(pending('2026-11-03', '2026-11-05'), TODAY)).toEqual({ text: 'legal 05/11', tone: 'muted' });
    expect(obligationDeadlineDetail(pending('2026-11-05', '2026-11-05'), TODAY)).toBeNull();
    expect(obligationDeadlineDetail(makeCell({ status: 'done', targetDate: '2026-11-03', legalDueDate: '2026-11-05' }), TODAY)).toEqual({ text: 'legal 05/11', tone: 'muted' });
    expect(obligationDeadlineDetail(makeCell({ status: 'done', targetDate: '2026-11-05', legalDueDate: '2026-11-05' }), TODAY)).toBeNull();
  });

  it('labels the situation only in the exceptions', () => {
    expect(situationException({ status: 'waiting_client' })).toEqual({ text: 'Aguardando', className: 'text-muted' });
    expect(situationException({ status: 'canceled' })).toEqual({ text: 'Cancelada', className: 'text-subtle' });
    for (const status of ['todo', 'in_progress', 'done'] as const) expect(situationException({ status })).toBeNull();
  });

  it('writes the second stacked line: who, the target and the alert', () => {
    const juliana = { id: 'j', name: 'Juliana Martins' };
    const cell = makeCell({ status: 'todo', assignee: juliana, targetDate: '2026-11-03', legalDueDate: '2026-11-05' });
    expect(stackedMeta(cell, 'obligation', true, TODAY)).toEqual({ text: 'Juliana M. · meta 03/11', alert: null });
    expect(stackedMeta({ ...cell, assignee: null }, 'obligation', true, TODAY).text.startsWith('Sem responsável')).toBe(true);
    expect(stackedMeta(cell, 'client', true, TODAY)).toEqual({ text: 'Juliana M.', alert: null });
    const late = makeCell({ status: 'todo', assignee: juliana, targetDate: '2026-10-24', legalDueDate: '2026-10-26' });
    expect(stackedMeta(late, 'client', false, TODAY).alert?.tone).toBe('danger');
    expect(stackedMeta(late, 'obligation', true, TODAY)).toEqual({ text: 'Juliana M. · meta 24/10', alert: { text: 'Prazo legal venceu há 2 dias', tone: 'danger' } });
  });
});
