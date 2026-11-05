import { describe, expect, it } from 'vitest';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_TASK_ATTACHMENT_BYTES,
  type AuditClientRow,
  type AuditMatrixResponse,
  type TaskBreakdownRow,
  type TaskClientOption,
  type TaskHistoryItem,
} from '@effinance/shared';
import { detailActions, flowActions, primaryAction, recurringActions, templateActions } from './actions';
import { ATTACHMENT_ERRORS, attachmentIconKind, attachmentTypeOf, checkAttachments, formatBytes, middleTruncate } from './attachments';
import {
  accordionByClient,
  accordionByTask,
  auditHeadline,
  cellTip,
  columnDeadline,
  monthClosesWith,
  nextCellStatus,
  parseAuditFilters,
  statusForKey,
  toAuditQuery,
  visibleClients,
  visibleColumns,
  writeAuditFilters,
} from './audit-logic';
import { agendaDayTitle, calendarWeeks, itemsByDay } from './calendar-logic';
import { filterNotes } from './components/notes-sheet';
import { occurrenceSheetCells } from './components/occurrence-sheet';
import { REOPEN_REASON_REQUIRED, reopenReasonError } from './components/reopen';
import { assigneeSourceHint, taskSheetDescription } from './components/task-sheet';
import { applyPreview, flowInputOf, moveStep, newStep, templateInputOf, templatePreview, validateFlow, validateTemplate } from './flow-logic';
import {
  groupDeadlineInfo,
  groupListItems,
  itemCount,
  occurrenceCards,
  occurrenceTaskDueInfo,
  openDeadlineInfo,
  pendingText,
  periodLabel,
  referenceLabel,
} from './occurrence';
import { mineItems } from './pages/home';
import { parseProcessParams } from './pages/processes';
import {
  activeInCompetence,
  appliesTo,
  appliesToText,
  dueRuleHint,
  dueRuleText,
  holidaysText,
  parseRecurringFilters,
  previewLines,
  targetRuleText,
  toRecurringQuery,
  writeRecurringFilters,
} from './recurring-rules';
import { capRows, parseReportFilters, rangeLabel, reportApiFilters, reportHeadline, reportRange, sortPunctuality, writeReportFilters } from './reports-logic';
import { CONTABIL, FISCAL, makeCell, makeDetail, makeOccurrence, makeOptions, makeTask } from './test-fixtures';
import { auditEvents, fieldList, timelinePhrase } from './timeline';
import { calendarRange, parseTaskFilters, toCalendarQuery } from './url-state';
import { cellDoneMessage, optimisticCell } from './use-cell-status';
import { nextStepMessage } from './use-task-status';

const TODAY = '2026-10-28';
const ID = '3f1c2b7a-9d4e-4c1a-8b2f-5e6d7c8b9a01';
const p = (s: string) => new URLSearchParams(s);

// ---------------------------------------------------------------------------
// Situations and groupings (§3.5, §5.6, §7.4, §8.2)
// ---------------------------------------------------------------------------

describe('deadlines of a recurring occurrence (target and legal deadline)', () => {
  const d = (targetDate: string, legalDueDate: string, beside = false) => openDeadlineInfo({ targetDate, legalDueDate }, TODAY, beside);

  it('follows the most serious deadline', () => {
    expect(d('2026-10-15', '2026-10-20')).toEqual({ text: 'Prazo legal venceu há 8 dias', tone: 'danger' });
    expect(d('2026-10-20', '2026-10-28')).toEqual({ text: 'Prazo legal hoje', tone: 'warning-strong' });
    expect(d('2026-10-26', '2026-10-30')).toEqual({ text: 'Meta venceu há 2 dias · legal em 2 dias', tone: 'warning-strong' });
    expect(d('2026-10-28', '2026-11-03')).toEqual({ text: 'Meta hoje · legal 03/11', tone: 'warning-strong' });
  });

  it('carries the dates inline and the distance beside the date', () => {
    expect(d('2026-11-02', '2026-11-05', true)).toEqual({ text: 'Meta em 5 dias · legal 05/11', tone: 'warning' });
    expect(d('2026-11-02', '2026-11-05')).toEqual({ text: 'Meta 02/11 · legal 05/11', tone: 'warning' });
    expect(d('2026-11-20', '2026-11-25')).toEqual({ text: 'Meta 20/11 · legal 25/11', tone: 'muted' });
  });

  it('speaks like a standalone task when the target is the legal deadline', () => {
    expect(d('2026-10-29', '2026-10-29')).toEqual({ text: 'Prazo legal amanhã', tone: 'warning' });
    expect(d('2026-11-15', '2026-11-15', true)).toEqual({ text: 'Prazo legal em 18 dias', tone: 'muted' });
    expect(d('2026-11-15', '2026-11-15')).toEqual({ text: 'Prazo legal 15/11', tone: 'muted' });
  });

  it('says when a concluded occurrence was late, and a complete group is just its dates', () => {
    const occurrence = { recurringTaskId: 'r', origin: 'registry', period: 'monthly', periodKey: '2026-10', competence: '2026-10', referenceMonth: '2026-09', targetDate: '2026-10-15', targetMissed: false, assigneeSource: 'default', situation: 'done_late' } as const;
    const t = makeTask({ status: 'done', dueDate: '2026-10-20', completedAt: '2026-10-22T15:00:00Z', occurrence });
    expect(occurrenceTaskDueInfo(t, TODAY)).toEqual({ text: 'Concluída em 22/10, com atraso', tone: 'muted' });
    expect(occurrenceTaskDueInfo({ ...t, status: 'canceled' }, TODAY).text).toBe('Cancelada');
    expect(groupDeadlineInfo(makeOccurrence({ pending: 0 }), TODAY)).toEqual({ text: 'Meta 28/10 · legal 30/10', tone: 'muted' });
  });

  it('labels the period and the reference month', () => {
    expect(referenceLabel('2026-09')).toBe('ref. 09/2026');
    expect(periodLabel(makeOccurrence(), TODAY)).toBe('outubro de 2026');
    expect(periodLabel(makeOccurrence({ period: 'weekly', periodKey: '2026-10-26' }), TODAY)).toBe('semana de 26/10');
  });
});

describe('grouped recurring rows', () => {
  it('counts the clients in view ("dos seus clientes" in Minhas)', () => {
    expect(pendingText(makeOccurrence(), false)).toBe('4 de 5 clientes pendentes');
    expect(pendingText(makeOccurrence(), true)).toBe('4 de 5 dos seus clientes pendentes');
    expect(pendingText(makeOccurrence({ pending: 5, done: 0 }), false)).toBe('5 clientes pendentes');
    expect(pendingText(makeOccurrence({ total: 1, pending: 1, done: 0 }), false)).toBe('1 cliente pendente');
    expect(pendingText(makeOccurrence({ pending: 0, done: 5 }), false)).toBe('5 clientes concluídos');
  });

  it('merges tasks and occurrences in the due-date groups, with "Fora da meta" after "Atrasadas"', () => {
    const tasks = [
      makeTask({ id: 'late', dueDate: '2026-10-20', overdue: true }),
      makeTask({ id: 'today', dueDate: TODAY }),
      makeTask({ id: 'none', dueDate: null }),
    ];
    const occurrences = [
      makeOccurrence({ recurringTaskId: 'missed', targetDate: '2026-10-26', legalDueDate: '2026-10-30', pending: 2 }),
      makeOccurrence({ recurringTaskId: 'complete', pending: 0 }),
      makeOccurrence({ recurringTaskId: 'soon', targetDate: '2026-10-29', legalDueDate: '2026-10-30', pending: 3 }),
    ];
    const groups = groupListItems(tasks, occurrences, TODAY);
    expect(groups.map((g) => g.bucket)).toEqual(['overdue', 'targetMissed', 'today', 'next7Days', 'noDueDate']);
    expect(groups[1]!.items.map((i) => i.key)).toEqual(['missed:2026-10']);
    expect(groups.flatMap((g) => g.items).some((i) => i.key.startsWith('complete'))).toBe(false);
    // An aggregated row counts its clients.
    expect(itemCount(groups[3]!.items)).toBe(3);
  });

  it('splits a recurring task into board cards per status ("Em andamento" includes waiting)', () => {
    const cards = occurrenceCards([makeOccurrence({ canceled: 1, total: 6 })]);
    expect(cards.map((c) => [c.status, c.count])).toEqual([
      ['todo', 3],
      ['in_progress', 1],
      ['done', 1],
      ['canceled', 1],
    ]);
  });

  it('orders "Minhas tarefas": overdue, past the target, today, then by work date', () => {
    const items = mineItems(
      [makeTask({ id: 'later', dueDate: '2026-11-20' }), makeTask({ id: 'today', dueDate: TODAY }), makeTask({ id: 'late', dueDate: '2026-10-01', overdue: true })],
      [makeOccurrence({ targetDate: '2026-10-26', legalDueDate: '2026-10-30' }), makeOccurrence({ recurringTaskId: 'done', pending: 0 })],
      TODAY,
      'open',
    );
    expect(items.map((i) => i.key)).toEqual(['late', 'r1:2026-10', 'today', 'later']);
    expect(mineItems([makeTask({ id: 'late', dueDate: '2026-10-01', overdue: true })], [], TODAY, 'today')).toEqual([]);
  });
});

describe('the occurrence in the task sheet', () => {
  const occurrence = { recurringTaskId: 'r', origin: 'registry', period: 'monthly', periodKey: '2026-10', competence: '2026-10', referenceMonth: '2026-09', targetDate: '2026-10-15', targetMissed: false, assigneeSource: 'default', situation: 'not_started' } as const;

  it('describes it with the competence and the reference', () => {
    const t = makeDetail({ title: 'DCTFWeb', client: { id: 'c1', name: 'Padaria' }, department: FISCAL, occurrence });
    expect(taskSheetDescription(t)).toBe('Padaria · Fiscal · DCTFWeb de outubro de 2026 (ref. 09/2026)');
    expect(taskSheetDescription(makeDetail({ department: CONTABIL }))).toBe('Interna · Contábil');
    expect(assigneeSourceHint(t)).toBe('Responsável padrão da recorrente.');
    expect(assigneeSourceHint({ ...t, occurrence: { ...occurrence, assigneeSource: 'manual' } })).toBe('Atribuída só nesta competência.');
  });

  it('asks the reason to reopen a conclusion', () => {
    expect(reopenReasonError('   ')).toBe(REOPEN_REASON_REQUIRED);
    expect(reopenReasonError('Guia com valor errado')).toBeNull();
  });

  it('announces the next process step instead of an undo', () => {
    expect(nextStepMessage({ title: 'Contrato social', assignee: { id: 'r', name: 'Rafael Lima' }, dueDate: '2026-11-04' }, TODAY)).toBe(
      'Tarefa concluída. Próxima etapa criada para Rafael: Contrato social (vence 04/11).',
    );
  });
});

// ---------------------------------------------------------------------------
// Recurring tasks: rules and the preview of the next competences (§10)
// ---------------------------------------------------------------------------

describe('legal deadline wording', () => {
  it('describes every periodicity', () => {
    expect(dueRuleText({ period: 'weekly', dueDay: 5, dueMonth: null })).toBe('Toda sexta');
    expect(dueRuleText({ period: 'weekly', dueDay: 6, dueMonth: null })).toBe('Todo sábado');
    expect(dueRuleText({ period: 'monthly', dueDay: 20, dueMonth: null })).toBe('Dia 20');
    expect(dueRuleText({ period: 'monthly', dueDay: 31, dueMonth: null })).toBe('Dia 31 ou o último');
    expect(dueRuleText({ period: 'bimonthly', dueDay: 20, dueMonth: 1 })).toBe('Dia 20 · jan, mar, mai, jul, set, nov');
    expect(dueRuleText({ period: 'quarterly', dueDay: 30, dueMonth: 1 })).toBe('Dia 30 · jan, abr, jul, out');
    expect(dueRuleText({ period: 'semiannual', dueDay: 31, dueMonth: 1 })).toBe('Dia 31 · jan e jul');
    expect(dueRuleText({ period: 'annual', dueDay: 31, dueMonth: 5 })).toBe('31/05');
  });

  it('hints the rule and warns about short months', () => {
    expect(dueRuleHint({ period: 'weekly', dueDay: 5, dueMonth: null })).toBe('Toda sexta-feira.');
    expect(dueRuleHint({ period: 'monthly', dueDay: 20, dueMonth: null })).toBe('Todo dia 20.');
    expect(dueRuleHint({ period: 'monthly', dueDay: 30, dueMonth: null })).toBe('Todo dia 30. Em fevereiro, dia 28.');
    expect(dueRuleHint({ period: 'monthly', dueDay: 31, dueMonth: null })).toBe('Todo dia 31. Em abril, junho, setembro e novembro, dia 30; em fevereiro, dia 28.');
    expect(dueRuleHint({ period: 'bimonthly', dueDay: 20, dueMonth: 1 })).toBe('Dia 20 de jan, mar, mai, jul, set e nov.');
    expect(dueRuleHint({ period: 'quarterly', dueDay: 31, dueMonth: 1 })).toBe('Dia 31 de jan, abr, jul e out. Em abril, dia 30.');
    expect(dueRuleHint({ period: 'annual', dueDay: 31, dueMonth: 5 })).toBe('Todo ano em 31/05.');
  });

  it('summarizes the target, the non-business-day rule and the reference', () => {
    expect(targetRuleText({ targetDaysBefore: 5, nonBusinessDayRule: 'anticipate', referenceOffset: 1, period: 'monthly' })).toBe('meta 5 dias antes · antecipa · ref. mês anterior');
    expect(targetRuleText({ targetDaysBefore: 0, nonBusinessDayRule: 'postpone', referenceOffset: 0, period: 'monthly' })).toBe('meta no prazo · posterga · ref. mesmo mês');
    expect(targetRuleText({ targetDaysBefore: 1, nonBusinessDayRule: 'keep', referenceOffset: 0, period: 'weekly' })).toBe('meta 1 dia antes · mantém');
  });
});

describe('preview of the next 3 competences', () => {
  const monthly = { period: 'monthly', dueDay: 20, dueMonth: null, targetDaysBefore: 5, nonBusinessDayRule: 'anticipate', referenceOffset: 1 } as const;

  it('shows the holiday and the weekend that moved the legal deadline', () => {
    expect(previewLines(monthly, '2026-11', null)).toEqual([
      'Novembro (ref. 10/2026): meta 13/11 (sex) · prazo legal 19/11 (qui; 20/11 é feriado: Dia Nacional de Zumbi e da Consciência Negra).',
      'Dezembro (ref. 11/2026): meta 11/12 (sex) · prazo legal 18/12 (sex; 20/12 é domingo).',
      'Janeiro (ref. 12/2026): meta 15/01 (sex) · prazo legal 20/01 (qua).',
    ]);
  });

  it('starts at the later of the current competence and the start, and keeps the date when told to', () => {
    expect(previewLines(monthly, '2026-11', '2027-02')[0]).toMatch(/^Fevereiro \(ref\. 01\/2027\)/);
    const keep = previewLines({ ...monthly, nonBusinessDayRule: 'keep', targetDaysBefore: 0 }, '2026-12', null)[0];
    expect(keep).toBe('Dezembro (ref. 11/2026): prazo legal 20/12 (dom; 20/12 é domingo, fica na data).');
  });

  it('lists weeks for a weekly task', () => {
    const weekly = { period: 'weekly', dueDay: 5, dueMonth: null, targetDaysBefore: 1, nonBusinessDayRule: 'anticipate', referenceOffset: 0 } as const;
    const lines = previewLines(weekly, '2026-11', null);
    expect(lines[0]).toBe('Semana de 02/11: meta 05/11 (qui) · prazo legal 06/11 (sex).');
    expect(previewLines(weekly, '2026-11', '2026-11')).toHaveLength(3);
    expect(previewLines({ ...weekly }, '2026-11', null)[2]).toBe('Semana de 16/11: meta 18/11 (qua) · prazo legal 19/11 (qui; 20/11 é feriado: Dia Nacional de Zumbi e da Consciência Negra).');
  });

  it('names the national holidays of the year (Carnaval and Corpus Christi included)', () => {
    const text = holidaysText(2026);
    expect(text.startsWith('Confraternização Universal 01/01, Carnaval 16 e 17/02, Sexta-feira Santa 03/04')).toBe(true);
    expect(text).toContain('Corpus Christi 04/06');
    expect(text).toContain('Finados 02/11');
    expect(text.endsWith('e Natal 25/12.')).toBe(true);
  });
});

describe('who a recurring task applies to', () => {
  const client = (id: string, taxRegime: TaskClientOption['taxRegime'], patch: Partial<TaskClientOption> = {}): TaskClientOption => ({
    id,
    name: id,
    legalName: id,
    taxRegime,
    status: 'active',
    contractStartDate: '2025-01-01',
    inactivatedAt: null,
    ...patch,
  });
  const clients = [
    client('a', 'simples_nacional'),
    client('b', 'simples_nacional'),
    client('c', 'mei'),
    client('d', 'real_profit'),
    client('e', 'simples_nacional', { status: 'inactive', inactivatedAt: '2026-01-10' }),
    client('f', 'simples_nacional', { contractStartDate: '2026-12-01' }),
  ];

  it('counts regimes, specific clients and exceptions among the active clients of the competence', () => {
    expect(appliesTo(clients, '2026-10', { regimes: ['simples_nacional'], clientIds: ['d'], excludedClientIds: ['b'] })).toEqual({ total: 2, byRegime: 2, specific: 1, exceptions: 1 });
    expect(activeInCompetence(clients, '2026-10').map((c) => c.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('words the column "Aplica-se a"', () => {
    expect(appliesToText({ regimes: ['simples_nacional', 'mei'], clientIds: [], excludedClientIds: ['x', 'y'], clientCount: 23 })).toBe('Simples Nacional e MEI · 23 clientes · 2 exceções');
    expect(appliesToText({ regimes: [], clientIds: ['1', '2', '3', '4'], excludedClientIds: [], clientCount: 4 })).toBe('4 clientes específicos');
    expect(appliesToText({ regimes: ['simples_nacional'], clientIds: ['1', '2'], excludedClientIds: [], clientCount: 25 })).toBe('Simples Nacional e mais 2 · 25 clientes');
  });
});

// ---------------------------------------------------------------------------
// Monthly audit: matrix, accordions, month concluded (§11)
// ---------------------------------------------------------------------------

describe('monthly audit', () => {
  const row = (id: string, name: string, patch: Partial<AuditClientRow> = {}): AuditClientRow => ({
    id,
    name,
    legalName: `${name} Ltda`,
    document: '12345678000190',
    taxRegime: 'simples_nacional',
    total: 2,
    done: 0,
    canceled: 0,
    inProgress: 0,
    overduePending: 0,
    targetMissedPending: 0,
    monthConcludedAt: null,
    ...patch,
  });
  const colA = makeOccurrence({ recurringTaskId: 'das', name: 'DAS', pending: 2, done: 2, total: 4 });
  const colB = makeOccurrence({ recurringTaskId: 'dctf', name: 'DCTFWeb', pending: 0, done: 2, total: 2 });
  const data = {
    today: TODAY,
    competence: '2026-10',
    columns: [colA, colB],
    clients: [
      row('caju', 'Caju', { done: 1 }),
      row('alfa', 'Alfa', { done: 2, monthConcludedAt: '2026-10-27T19:40:00Z' }),
      row('beta', 'Beta', { overduePending: 1 }),
    ],
    cells: [
      makeCell({ taskId: 'a1', clientId: 'alfa', recurringTaskId: 'das', status: 'done' }),
      makeCell({ taskId: 'a2', clientId: 'alfa', recurringTaskId: 'dctf', status: 'done' }),
      makeCell({ taskId: 'b1', clientId: 'beta', recurringTaskId: 'das', status: 'todo', overdue: true }),
      makeCell({ taskId: 'c1', clientId: 'caju', recurringTaskId: 'das', status: 'in_progress' }),
      makeCell({ taskId: 'c2', clientId: 'caju', recurringTaskId: 'dctf', status: 'done' }),
    ],
    summary: {} as AuditMatrixResponse['summary'],
  } as AuditMatrixResponse;
  const f = { search: '', clients: '' as const, view: 'client' as const };

  it('cycles a cell A fazer → Em andamento → Concluída, and keys 1–3 set it', () => {
    expect(nextCellStatus('todo')).toBe('in_progress');
    expect(nextCellStatus('waiting_client')).toBe('in_progress');
    expect(nextCellStatus('in_progress')).toBe('done');
    expect(nextCellStatus('done')).toBeNull();
    expect(nextCellStatus('canceled')).toBeNull();
    expect([statusForKey('1'), statusForKey('2'), statusForKey('3'), statusForKey('4')]).toEqual(['todo', 'in_progress', 'done', null]);
  });

  it('orders the clients by name, and the overdue first with "Com pendências"', () => {
    expect(visibleClients(data, f).map((c) => c.id)).toEqual(['alfa', 'beta', 'caju']);
    expect(visibleClients(data, { ...f, clients: 'pending' }).map((c) => c.id)).toEqual(['beta', 'caju']);
    expect(visibleClients(data, { ...f, clients: 'concluded' }).map((c) => c.id)).toEqual(['alfa']);
    expect(visibleClients(data, { ...f, search: '12.345.678' }).length).toBe(3);
    expect(visibleClients(data, { ...f, search: 'caj' }).map((c) => c.id)).toEqual(['caju']);
  });

  it('closes the month of a client with its last pending cell', () => {
    expect(monthClosesWith(data.cells, { taskId: 'c1', clientId: 'caju' })).toBe(true);
    expect(monthClosesWith(data.cells, { taskId: 'b1', clientId: 'beta' })).toBe(true);
    expect(monthClosesWith([...data.cells, makeCell({ taskId: 'b2', clientId: 'beta', recurringTaskId: 'dctf' })], { taskId: 'b1', clientId: 'beta' })).toBe(false);
    // Canceled cells do not hold the month open.
    expect(monthClosesWith([...data.cells, makeCell({ taskId: 'b2', clientId: 'beta', recurringTaskId: 'dctf', status: 'canceled' })], { taskId: 'b1', clientId: 'beta' })).toBe(true);
  });

  it('opens "Por tarefa" with its clients (only the pending ones, and no complete task, with "Com pendências")', () => {
    const all = accordionByTask(data, { ...f, view: 'task' });
    expect(all.map((t) => [t.column.name, t.cells.map((c) => c.client.id)])).toEqual([
      ['DAS', ['alfa', 'beta', 'caju']],
      ['DCTFWeb', ['alfa', 'caju']],
    ]);
    const pending = accordionByTask(data, { ...f, view: 'task', clients: 'pending' });
    expect(pending.map((t) => [t.column.name, t.cells.map((c) => c.client.id)])).toEqual([['DAS', ['beta', 'caju']]]);
    expect(visibleColumns(data, { ...f, view: 'task', search: 'dctf' }).map((c) => c.name)).toEqual(['DCTFWeb']);
  });

  it('opens "Por cliente" with the recurring tasks that apply', () => {
    const items = accordionByClient(data, f);
    expect(items.map((c) => [c.client.id, c.items.map((i) => i.column.name)])).toEqual([
      ['alfa', ['DAS', 'DCTFWeb']],
      ['beta', ['DAS']],
      ['caju', ['DAS', 'DCTFWeb']],
    ]);
  });

  it('puts the delay on the column, once', () => {
    expect(columnDeadline(makeOccurrence({ overdue: true, legalDueDate: '2026-10-20' }), TODAY)).toEqual({ text: 'Prazo legal venceu há 8 dias', tone: 'danger' });
    expect(columnDeadline(makeOccurrence({ targetMissed: true, targetDate: '2026-10-26' }), TODAY)).toEqual({ text: 'Meta venceu há 2 dias', tone: 'warning-strong' });
    expect(columnDeadline(makeOccurrence({ pending: 0 }), TODAY)).toEqual({ text: 'Meta 28/10 · legal 30/10', tone: 'muted' });
  });

  it('states the finding of the page', () => {
    const summary = { total: 240, canceled: 0, done: 182, overduePending: 12 } as AuditMatrixResponse['summary'];
    expect(auditHeadline(summary, 'Outubro de 2026')).toBe('Outubro de 2026: 182 de 240 concluídas (76%). 12 pendências já passaram do prazo legal.');
    expect(auditHeadline({ ...summary, overduePending: 0 }, 'Outubro de 2026')).toBe('Outubro de 2026: 182 de 240 concluídas (76%). Nenhuma pendência passou do prazo legal.');
  });

  it('marks a cell optimistically and words the toast with the month closed', () => {
    const done = optimisticCell(makeCell({ status: 'in_progress' }), 'done', { id: 'me', name: 'Marina' }, '2026-10-28T15:00:00Z');
    expect(done).toMatchObject({ status: 'done', concludedBy: { id: 'me', name: 'Marina' }, concludedAt: '2026-10-28T15:00:00Z', concludedOnTime: true, canReopen: true });
    expect(optimisticCell(done, 'todo', null, 'x')).toMatchObject({ status: 'todo', concludedBy: null, concludedAt: null, concludedOnTime: null });
    expect(cellDoneMessage('DCTFWeb', 'Padaria Pão Dourado', null)).toBe('DCTFWeb concluída para Padaria Pão Dourado.');
    expect(cellDoneMessage('DCTFWeb', 'Padaria Pão Dourado', 'Outubro')).toBe('DCTFWeb concluída. Outubro concluído para Padaria Pão Dourado.');
  });

  it('filters the clients of the occurrence sheet', () => {
    const detail = {
      cells: [
        { ...makeCell({ taskId: '1', assignee: { id: 'me', name: 'Marina' } }), client: { id: 'a', name: 'Pão Quente', legalName: 'Pão', document: '', taxRegime: 'mei' as const } },
        { ...makeCell({ taskId: '2', status: 'done' }), client: { id: 'b', name: 'Alicerce', legalName: 'Alicerce', document: '', taxRegime: 'mei' as const } },
        { ...makeCell({ taskId: '3', assignee: null }), client: { id: 'c', name: 'Tecnova', legalName: 'Tecnova', document: '', taxRegime: 'mei' as const } },
      ],
    };
    expect(occurrenceSheetCells(detail, 'mine', 'me', '', '').map((c) => c.taskId)).toEqual(['1']);
    expect(occurrenceSheetCells(detail, 'pending', 'me', '', '').map((c) => c.taskId)).toEqual(['1', '3']);
    expect(occurrenceSheetCells(detail, 'all', 'me', '', '').map((c) => c.taskId)).toEqual(['2', '1', '3']);
    expect(occurrenceSheetCells(detail, 'all', 'me', 'pao', '').map((c) => c.taskId)).toEqual(['1']);
    expect(occurrenceSheetCells(detail, 'all', 'me', '', 'none').map((c) => c.taskId)).toEqual(['3']);
  });
});

// ---------------------------------------------------------------------------
// Filters in the URL of the new screens
// ---------------------------------------------------------------------------

describe('URL of the new screens', () => {
  it('reads and writes the audit filters (bad values ignored)', () => {
    const f = parseAuditFilters(p(`competencia=2026-09&visao=tarefa&regime=mei&departamento=${ID}&responsavel=x&clientes=pendentes&busca=pao&recorrente=${ID}`), TODAY);
    expect(f).toEqual({ competence: '2026-09', view: 'task', regime: 'mei', department: ID, assignee: '', clients: 'pending', search: 'pao', recurring: ID });
    expect(parseAuditFilters(p('competencia=2026-13&regime=xx'), TODAY)).toMatchObject({ competence: '2026-10', view: 'client', regime: '', clients: '' });
    expect(writeAuditFilters(p('competencia=2026-09&busca=x'), { competence: '2026-10', clients: 'concluded', search: '' }, TODAY).toString()).toBe('clientes=concluidos');
    expect(toAuditQuery(f)).toEqual({ competence: '2026-09', taxRegime: 'mei', departmentId: ID, assigneeId: undefined });
  });

  it('reads and writes the recurring list filters; `recorrente` with `periodo` belongs to the occurrence sheet', () => {
    const f = parseRecurringFilters(p(`busca=das&periodicidade=trimestral&departamento=${ID}&situacao=encerradas&recorrente=nova`));
    expect(f).toEqual({ search: 'das', period: 'quarterly', department: ID, assignee: '', regime: '', status: 'ended', open: 'nova' });
    expect(parseRecurringFilters(p(`recorrente=${ID}&periodo=2026-10`)).open).toBe('');
    expect(parseRecurringFilters(p('recorrente=../x')).open).toBe('');
    expect(writeRecurringFilters(p(''), { period: 'annual', status: 'active', open: ID }).toString()).toBe(`periodicidade=anual&recorrente=${ID}`);
    expect(toRecurringQuery(f, '2026-10')).toMatchObject({ month: '2026-10', search: 'das', period: 'quarterly', status: 'ended' });
  });

  it('reads the processes page parameters', () => {
    expect(parseProcessParams(p(`modelo=novo&aplicar=${ID}&processos=concluidos`))).toEqual({ template: 'novo', apply: ID, status: 'done' });
    expect(parseProcessParams(p('modelo=x&aplicar=y'))).toEqual({ template: '', apply: '', status: 'active' });
  });

  it('reads the report filters, with the grouped situation or an exact status', () => {
    const f = parseReportFilters(p('periodo=3-meses&mes=2026-09&responsavel=nenhum&cliente=interna&situacao=com-atraso&tipo=recorrentes&pagina=2'), TODAY);
    expect(f).toMatchObject({ preset: 'last-3', month: '2026-09', assignee: 'none', client: 'internal', situation: 'doneLate', kind: 'recurring', page: 2 });
    expect(reportRange(f)).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(reportApiFilters(f)).toMatchObject({ situation: 'doneLate', assigneeId: 'none', clientId: 'internal', kind: 'recurring', status: undefined });
    expect(reportApiFilters(parseReportFilters(p('situacao=cancelada'), TODAY))).toMatchObject({ status: 'canceled', situation: undefined });
    expect(writeReportFilters(p('pagina=3'), { preset: 'month', month: '2026-10' }, TODAY).toString()).toBe('');
    expect(reportRange(parseReportFilters(p('periodo=ano&ano=2025'), TODAY))).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  it('builds the calendar query from the list filters', () => {
    expect(calendarRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-12-05' });
    expect(calendarRange('2026-10')).toEqual({ from: '2026-09-27', to: '2026-10-31' });
    const f = parseTaskFilters(p(`escopo=minhas&responsavel=${ID}&visao=calendario&mes=2026-11&tipo=recorrentes`));
    expect(toCalendarQuery(f, TODAY)).toMatchObject({ from: '2026-11-01', to: '2026-12-05', scope: 'mine', assigneeId: undefined, kind: 'recurring' });
  });
});

// ---------------------------------------------------------------------------
// Calendar (§7.6)
// ---------------------------------------------------------------------------

describe('calendar', () => {
  it('draws the weeks from Sunday with the national holidays', () => {
    const weeks = calendarWeeks('2026-11');
    expect(weeks).toHaveLength(5);
    expect(weeks[0]![0]).toMatchObject({ date: '2026-11-01', inMonth: true, weekend: true });
    const finados = weeks.flat().find((d) => d.date === '2026-11-02')!;
    expect(finados.holiday).toBe('Finados');
    expect(agendaDayTitle(finados)).toBe('Seg, 02/11 · Finados');
    expect(weeks[4]!.at(-1)).toMatchObject({ date: '2026-12-05', inMonth: false });
  });

  it('puts appointments first, then overdue, then by priority; occurrences on their target', () => {
    const day = '2026-11-05';
    const byDay = itemsByDay(
      [
        makeTask({ id: 'low', dueDate: day, priority: 'low' }),
        makeTask({ id: 'meeting', dueDate: day, startTime: '09:00' }),
        makeTask({ id: 'late', dueDate: day, overdue: true }),
        makeTask({ id: 'urgent', dueDate: day, priority: 'urgent' }),
        makeTask({ id: 'closed', dueDate: day, status: 'done' }),
      ],
      [makeOccurrence({ targetDate: day })],
      { situation: 'open' },
    );
    expect(byDay.get(day)!.map((i) => i.key)).toEqual(['meeting', 'late', 'urgent', 'r1:2026-10', 'low']);
    const done = itemsByDay([makeTask({ id: 'closed', dueDate: day, status: 'done' })], [makeOccurrence({ targetDate: day, done: 0 })], { situation: 'done' });
    expect(done.get(day)!.map((i) => i.key)).toEqual(['closed']);
    expect(itemsByDay([makeTask({ id: 'x', title: 'Balancete', dueDate: day })], [], { situation: 'all', search: 'dctf' }).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Attachments: limits and types (§9.1, item 5)
// ---------------------------------------------------------------------------

describe('attachments', () => {
  it('takes the type from the extension of the contract', () => {
    expect(attachmentTypeOf('Planilha.XLSX')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(attachmentTypeOf('notas.csv')).toBe('text/csv');
    expect(attachmentTypeOf('foto.jpeg')).toBe('image/jpeg');
    expect(attachmentTypeOf('desenho.svg')).toBeNull();
    expect(attachmentTypeOf('pagina.html')).toBeNull();
    expect(attachmentTypeOf('sem-extensao')).toBeNull();
    expect(attachmentIconKind('text/csv')).toBe('sheet');
    expect(attachmentIconKind('application/zip')).toBe('archive');
    expect(attachmentIconKind('image/png')).toBe('image');
  });

  it('refuses the type, the empty file and more than 10 MB before sending', () => {
    const r = checkAttachments(
      [
        { name: 'contrato.pdf', size: 100 },
        { name: 'instalador.EXE', size: 10 },
        { name: 'vazio.png', size: 0 },
        { name: 'grande.zip', size: MAX_ATTACHMENT_BYTES + 1 },
      ],
      { count: 0, bytes: 0 },
    );
    expect(r.accepted.map((a) => [a.file.name, a.contentType])).toEqual([['contrato.pdf', 'application/pdf']]);
    expect(r.rejected.map((x) => x.message)).toEqual([ATTACHMENT_ERRORS.type, ATTACHMENT_ERRORS.empty, ATTACHMENT_ERRORS.tooBig]);
  });

  it('keeps the task within 50 files and 50 MB, and 5 files at a time', () => {
    expect(checkAttachments([{ name: 'a.pdf', size: 1 }, { name: 'b.pdf', size: 1 }], { count: 49, bytes: 0 }).rejected.map((x) => x.message)).toEqual([ATTACHMENT_ERRORS.count]);
    expect(checkAttachments([{ name: 'a.pdf', size: 20 }], { count: 3, bytes: MAX_TASK_ATTACHMENT_BYTES - 10 }).rejected[0]!.message).toBe(ATTACHMENT_ERRORS.total);
    const six = Array.from({ length: 6 }, (_, i) => ({ name: `${i}.pdf`, size: 1 }));
    const r = checkAttachments(six, { count: 0, bytes: 0 });
    expect(r.accepted).toHaveLength(5);
    expect(r.rejected.map((x) => x.message)).toEqual([ATTACHMENT_ERRORS.atOnce]);
  });

  it('cuts long names in the middle and writes sizes in pt-BR', () => {
    const cut = middleTruncate('contrato-social-alteracao-2026-final.pdf', 24);
    expect(cut).toHaveLength(24);
    expect(cut.endsWith('.pdf')).toBe(true);
    expect(cut).toContain('…');
    expect(middleTruncate('curto.pdf')).toBe('curto.pdf');
    expect(formatBytes(820)).toBe('820 bytes');
    expect(formatBytes(48 * 1024)).toBe('48 KB');
    expect(formatBytes(1.2 * 1024 * 1024)).toBe('1,2 MB');
  });
});

// ---------------------------------------------------------------------------
// Timeline (§9.1, item 7)
// ---------------------------------------------------------------------------

describe('timeline', () => {
  const ev = (patch: Partial<TaskHistoryItem>): TaskHistoryItem => ({
    id: 'e',
    kind: 'updated',
    actor: { id: 'ana', name: 'Ana Paula Ribeiro' },
    createdAt: '2026-10-28T12:00:00Z',
    fields: [],
    changes: [],
    fromStatus: null,
    toStatus: null,
    fromAssignee: null,
    toAssignee: null,
    note: null,
    origin: null,
    originName: null,
    flow: null,
    ...patch,
  });

  it('words each event like the spec', () => {
    expect(timelinePhrase(ev({ kind: 'created', origin: 'recurring', originName: 'DCTFWeb', actor: null }))).toMatchObject({ actor: null, text: 'Criada pela tarefa recorrente DCTFWeb' });
    expect(timelinePhrase(ev({ kind: 'created', origin: 'manual' }))).toMatchObject({ actor: 'Ana R.', text: 'criou a tarefa' });
    expect(timelinePhrase(ev({ fields: ['dueDate', 'priority'] })).text).toBe('alterou o vencimento e a prioridade');
    expect(timelinePhrase(ev({ fields: ['dueDate'], changes: [{ field: 'dueDate', from: '2026-10-25', to: '2026-10-30' }] })).text).toBe('alterou o vencimento de 25/10/2026 para 30/10/2026');
    expect(timelinePhrase(ev({ fields: ['description'] })).text).toBe('alterou a descrição');
    expect(timelinePhrase(ev({ kind: 'status', fromStatus: 'todo', toStatus: 'in_progress' })).text).toBe('mudou a situação de A fazer para Em andamento');
    expect(timelinePhrase(ev({ kind: 'status', toStatus: 'done' }))).toMatchObject({ text: 'concluiu a tarefa', success: true });
    expect(timelinePhrase(ev({ kind: 'reopened', toStatus: 'in_progress', note: 'Guia emitida com valor errado' })).text).toBe('reabriu a tarefa (voltou para Em andamento): “Guia emitida com valor errado”');
    expect(timelinePhrase(ev({ kind: 'assigned', toAssignee: { id: 'ana', name: 'Ana Paula Ribeiro' } })).text).toBe('assumiu a tarefa');
    expect(timelinePhrase(ev({ kind: 'assigned', toAssignee: { id: 'b', name: 'Bruno Carvalho' } })).text).toBe('atribuiu a Bruno C.');
    expect(timelinePhrase(ev({ kind: 'assigned', fromAssignee: { id: 'b', name: 'Bruno Carvalho' } })).text).toBe('tirou o responsável (estava com Bruno C.)');
    expect(timelinePhrase(ev({ kind: 'assigned', actor: null, toAssignee: { id: 'm', name: 'Marina Souza' }, note: 'novo responsável do cliente no Fiscal' })).text).toBe(
      'Responsável trocado para Marina S.: novo responsável do cliente no Fiscal',
    );
    expect(timelinePhrase(ev({ kind: 'attachment_added', note: 'contrato-social.pdf' })).text).toBe('anexou contrato-social.pdf');
    expect(timelinePhrase(ev({ kind: 'comment_removed' })).text).toBe('excluiu um comentário');
    expect(timelinePhrase(ev({ kind: 'flow_step', actor: null, flow: { id: 'f', title: 'Abertura de empresa', position: 2, event: 'activated' } })).text).toBe('Etapa 2 de Abertura de empresa começou');
    expect(fieldList(['title', 'clientId', 'categoryId'])).toBe('o nome, o cliente e a categoria');
  });

  it('keeps only conclusions and reopenings for the audit history', () => {
    const items = [ev({ kind: 'reopened', note: 'Valor errado', toStatus: 'todo' }), ev({ kind: 'commented' }), ev({ kind: 'status', toStatus: 'done', id: 'd' })];
    expect(auditEvents(items).map((e) => [e.kind, e.reason])).toEqual([
      ['reopened', 'Valor errado'],
      ['done', null],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Processes, reports, notes, responsibles
// ---------------------------------------------------------------------------

describe('processes', () => {
  const o = makeOptions();

  it('takes the department of a step from its assignee, else the queue chosen', () => {
    const steps = [
      { ...newStep(), title: 'Viabilidade', assigneeId: 'ana', departmentId: CONTABIL.id, relativeDays: '2' },
      { ...newStep(), title: 'Contrato', departmentId: CONTABIL.id, relativeDays: '3' },
    ];
    const input = templateInputOf('Abertura', '', steps, o.members);
    expect(input.steps.map((s) => [s.departmentId, s.relativeDays])).toEqual([
      [FISCAL.id, 2],
      [CONTABIL.id, 3],
    ]);
    expect(moveStep(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveStep(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });

  it('validates with the messages of the screen', () => {
    const step = { ...newStep(), title: '', relativeDays: '400' };
    const e = validateTemplate('', '', [step], o.members);
    expect(e.title).toBe('Informe o nome do modelo.');
    expect(e.step[step.key]).toEqual({ title: 'Informe o nome da tarefa desta etapa.', deadline: 'O prazo deve ficar entre 0 e 365 dias.' });
    const dated = { ...newStep(), title: 'Registro', mode: 'date' as const, dueDate: '2026-11-10' };
    expect(validateFlow('Alteração', null, [dated], o.members, true).saveAsTemplate).toBe('Para salvar como modelo, use prazos em dias.');
    expect(flowInputOf('Alteração', null, [dated], o.members, false).steps[0]).toMatchObject({ dueDate: '2026-11-10', relativeDays: null });
  });

  it('previews the deadlines of a template and what applying it creates', () => {
    expect(templatePreview([1, 2, 3, 5, 6], '2026-10-29')).toBe('Se aplicado hoje (29/10): a etapa 1 vence em 30/10; as outras contam da conclusão da anterior (+2, +3, +5 e +6 dias).');
    const t = {
      steps: [
        { id: '1', position: 1, title: 'Solicitar documentos', description: null, department: null, category: null, assignee: { id: 'm', name: 'Marina Souza' }, priority: 'medium' as const, relativeDays: 1 },
        { id: '2', position: 2, title: 'Consulta de viabilidade', description: null, department: null, category: null, assignee: { id: 'r', name: 'Rafael Lima' }, priority: 'medium' as const, relativeDays: 2 },
      ],
    };
    expect(applyPreview(t, '2026-10-29')).toEqual(['1. Solicitar documentos · Marina S. · vence 30/10 (criada agora)', '2. Consulta de viabilidade · Rafael L. · 2 dias após a etapa 1']);
  });
});

describe('reports', () => {
  const r = (label: string, patch: Partial<TaskBreakdownRow>): TaskBreakdownRow => ({ key: label, label, total: 0, done: 0, doneOnTime: 0, doneLate: 0, canceled: 0, open: 0, overdue: 0, ...patch });

  it('labels the period', () => {
    expect(rangeLabel({ from: '2026-10-01', to: '2026-10-31' })).toBe('Outubro de 2026');
    expect(rangeLabel({ from: '2026-01-01', to: '2026-10-31' })).toBe('De janeiro a outubro de 2026');
    expect(rangeLabel({ from: '2026-10-05', to: '2026-10-20' })).toBe('De 05/10/2026 a 20/10/2026');
  });

  it('orders by delays or deliveries and sums the rest in "Outros"', () => {
    const rows = [r('A', { doneLate: 1, done: 10 }), r('B', { doneLate: 3, done: 2 }), r('C', { doneLate: 1, overdue: 2, done: 1 })];
    expect(sortPunctuality(rows, 'late').map((x) => x.label)).toEqual(['B', 'C', 'A']);
    expect(sortPunctuality(rows, 'delivered').map((x) => x.label)).toEqual(['A', 'B', 'C']);
    const ten = Array.from({ length: 10 }, (_, i) => r(`R${i}`, { done: 1 }));
    const capped = capRows(ten, 8);
    expect(capped).toHaveLength(9);
    expect(capped.at(-1)).toMatchObject({ label: 'Outros (2)', done: 2 });
    expect(capRows(ten.slice(0, 9), 8)).toHaveLength(9);
  });

  it('states where the delay concentrates', () => {
    const summary = { total: 83, done: 61, doneOnTime: 54, doneLate: 7, canceled: 3, open: 10, overdue: 12, targetMissed: 0 };
    const byDepartment = [r('Fiscal', { doneLate: 5 }), r('Contábil', { doneLate: 2 })];
    expect(reportHeadline({ summary, byDepartment }, 'Outubro de 2026')).toBe('Outubro de 2026: 61 concluídas, 54 no prazo (89%). Fiscal concentra 5 das 7 entregas com atraso.');
    expect(reportHeadline({ summary: { ...summary, done: 0 }, byDepartment }, 'Outubro de 2026')).toBe('Outubro de 2026: nenhuma tarefa concluída ainda.');
  });
});

describe('notes and responsibles', () => {
  it('sorts the notes by the last edit and searches title and text without accents', () => {
    const notes = [
      { id: '1', title: 'Portal da prefeitura', content: 'NFS-e', createdAt: 'x', updatedAt: '2026-10-01T00:00:00Z' },
      { id: '2', title: 'Pendências', content: 'Cobrar extratos da Tecnova', createdAt: 'x', updatedAt: '2026-10-20T00:00:00Z' },
    ];
    expect(filterNotes(notes, '').map((n) => n.id)).toEqual(['2', '1']);
    expect(filterNotes(notes, 'pendencias').map((n) => n.id)).toEqual(['2']);
    expect(filterNotes(notes, 'nfs').map((n) => n.id)).toEqual(['1']);
  });

  it('says where the responsible of a cell comes from: the default of the recurring task, or by hand', () => {
    expect(cellTip(makeCell({ assigneeSource: 'default' }), 'Fiscal')).toBe('A fazer · Ana Paula Ribeiro (responsável padrão da recorrente)');
    expect(cellTip(makeCell({ assigneeSource: 'manual' }), 'Fiscal')).toBe('A fazer · Ana Paula Ribeiro (atribuída só nesta competência)');
    expect(cellTip(makeCell({ assignee: null, assigneeSource: null }), 'Fiscal')).toBe('A fazer · Sem responsável');
  });
});

// ---------------------------------------------------------------------------
// Administrator buttons (§2.6): registries and deletions are for administrators
// ---------------------------------------------------------------------------

describe('administrator actions', () => {
  it('lets collaborators only see a recurring task; administrators edit, end and delete before any task', () => {
    expect(recurringActions({ active: true, occurrenceCount: 0 }, { canEdit: false, canDelete: false })).toEqual(['view', 'audit', 'calendar']);
    expect(recurringActions({ active: true, occurrenceCount: 0 }, { canEdit: true, canDelete: true })).toEqual(['edit', 'audit', 'calendar', 'duplicate', 'end', 'delete']);
    expect(recurringActions({ active: true, occurrenceCount: 12 }, { canEdit: true, canDelete: true })).not.toContain('delete');
    expect(recurringActions({ active: false, occurrenceCount: 12 }, { canEdit: true, canDelete: true })).toContain('reactivate');
  });

  it('keeps templates and process deletion with administrators (applying is for everyone, outside the menu)', () => {
    expect(templateActions({ canEdit: false, canDelete: false })).toEqual(['view']);
    expect(templateActions({ canEdit: true, canDelete: true })).toEqual(['edit', 'duplicate', 'delete']);
    const step = { currentStep: { task: { id: 't' } } } as never;
    expect(flowActions(step, { canDelete: false })).toEqual(['open-step', 'steps']);
    expect(flowActions({ currentStep: null }, { canDelete: true })).toEqual(['steps', 'delete']);
  });

  it('never duplicates or deletes an occurrence, and reopens a conclusion only for who may', () => {
    const occurrence = { recurringTaskId: 'r' } as never;
    expect(detailActions({ occurrence: null, status: 'todo' }, { isAdmin: true })).toEqual(['duplicate', 'copy-link', 'cancel', 'delete']);
    expect(detailActions({ occurrence: null, status: 'todo' }, { isAdmin: false })).toEqual(['duplicate', 'copy-link', 'cancel']);
    expect(detailActions({ occurrence, status: 'todo' }, { isAdmin: true })).toEqual(['copy-link', 'cancel']);
    expect(primaryAction({ occurrence, status: 'done', canReopen: true })).toBe('reopen-with-reason');
    expect(primaryAction({ occurrence, status: 'done', canReopen: false })).toBe('none');
    expect(primaryAction({ occurrence, status: 'canceled', canReopen: false })).toBe('reopen');
    expect(primaryAction({ occurrence: null, status: 'done', canReopen: false })).toBe('reopen');
    expect(primaryAction({ occurrence: null, status: 'in_progress', canReopen: false })).toBe('conclude');
  });
});
