// Auditoria mensal › "Por cliente" as a list in every width (each client with its progress, opened to
// show the month's obligations).
import { describe, expect, it } from 'vitest';
import type { AuditClientRow } from '@effinance/shared';
import { auditListKey, autoExpandedClients, cellDeadlines, cellSituationText, clientProgress } from './audit-logic';
import { makeCell } from './test-fixtures';

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

  it('names the situation, with who concluded and when', () => {
    expect(cellSituationText(makeCell({ status: 'todo' }), TODAY)).toBe('A fazer');
    expect(cellSituationText(makeCell({ status: 'in_progress' }), TODAY)).toBe('Em andamento');
    expect(cellSituationText(makeCell({ status: 'done', concludedBy: { id: 'm', name: 'Marina Souza' }, concludedAt: '2026-10-27T13:00:00Z' }), TODAY)).toBe('Concluída por Marina S. em 27/10');
    expect(cellSituationText(makeCell({ status: 'done', concludedBy: null, concludedAt: null }), TODAY)).toBe('Concluída');
    expect(cellSituationText(makeCell({ status: 'canceled' }), TODAY)).toBe('Cancelada');
  });
});
