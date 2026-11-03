// Start page, reports, CSV export, calendar and global search with tasks (phase 2). One unit per task
// and per client of an occurrence; on time = concluded on or before the due date (the legal deadline
// of an occurrence) in the office time zone; canceled apart. Today is pinned to 2026-10-20 (Tuesday);
// conclusions to 2026-10-20 12:00 in São Paulo.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { createTestApp, registerUser, resetDb, type Client } from './helpers';
import { createClient, office } from './task-helpers';

let app: App;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  delete process.env.EFFINANCE_NOW;
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
  process.env.EFFINANCE_NOW = '2026-10-20T15:00:00Z';
});

/**
 * Fiscal: DAS (target 16/10, legal 20/10) and DCTFWeb (legal 15/10, overdue) for clients A and B;
 * tasks: overdue (10/10), open (25/10), appointment today, concluded on time (22/10), canceled (28/10),
 * a formula-looking title (30/10) and one without due date. DAS of A concluded on time by Carla.
 */
async function scenario() {
  const o = await office(app);
  const { ana, carla, fiscal } = o;
  const a = await createClient(ana, { tradeName: 'Padaria' });
  const b = await createClient(ana, { tradeName: 'Clínica' });
  const das = (await ana.post('/tasks/recurring', { name: 'DAS', departmentId: fiscal, assigneeId: carla.userId, dueDay: 20, targetDaysBefore: 3, regimes: ['simples_nacional'] })).body;
  const dctf = (await ana.post('/tasks/recurring', { name: 'DCTFWeb', departmentId: fiscal, assigneeId: ana.userId, dueDay: 15, regimes: ['simples_nacional'] })).body;
  const task = async (c: Client, body: Record<string, unknown>) => {
    const res = await c.post('/tasks', { assigneeId: carla.userId, ...body });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body;
  };
  const overdue = await task(ana, { title: 'Balancete de setembro', clientId: a, dueDate: '2026-10-10' });
  await task(ana, { title: 'Conferir notas', clientId: b, dueDate: '2026-10-25' });
  await task(ana, { title: 'Reunião com a Padaria', clientId: a, dueDate: '2026-10-20', startTime: '14:00', endTime: '15:00' });
  const onTime = await task(ana, { title: 'Certidão negativa', dueDate: '2026-10-22' });
  await carla.patch(`/tasks/${onTime.id}/status`, { status: 'done' });
  const canceled = await task(ana, { title: 'Baixa antiga', dueDate: '2026-10-28', priority: 'low' });
  await carla.patch(`/tasks/${canceled.id}/status`, { status: 'canceled' });
  await task(ana, { title: '=SOMA(A1)', dueDate: '2026-10-30', priority: 'urgent' });
  await task(ana, { title: 'Organizar arquivo' });
  const dasA = (await carla.get(`/tasks/recurring/${das.id}/occurrences/2026-10`)).body.cells.find((c: any) => c.clientId === a);
  await carla.patch(`/tasks/${dasA.taskId}/status`, { status: 'done' });
  return { ...o, a, b, das, dctf, overdue };
}

describe('tasks insights', () => {
  it('the start page counts tasks and occurrences, "fora da meta", the oldest overdue and the obligations', async () => {
    const { ana, carla, fiscal, das, dctf, overdue } = await scenario();
    const home = (await carla.get('/tasks/home')).body;
    expect(home).toMatchObject({ view: 'department', department: { id: fiscal } });
    // 7 tasks (open, concluded or canceled in October) + 4 occurrences of October.
    expect(home.totals).toMatchObject({
      total: 11,
      standalone: 7,
      recurring: 4,
      overdue: 3,
      targetMissed: 1,
      targetMissedNextLegalDate: '2026-10-20',
      dueToday: 1,
      appointmentsToday: 1,
      doneOnTime: 2,
      doneLate: 0,
      canceled: 1,
    });
    expect(home.oldestOverdue).toMatchObject({ kind: 'standalone', id: overdue.id, daysOverdue: 10, assignee: { id: carla.userId } });
    expect(home.obligations).toMatchObject({ competence: '2026-10', total: 4, done: 1, canceled: 0, pending: 3, overdue: 2 });
    // Overdue pending first, then past the target.
    expect(home.obligations.items.map((o: any) => [o.recurringTaskId, o.done, o.total])).toEqual([
      [dctf.id, 0, 2],
      [das.id, 1, 2],
    ]);
    // Mine: Carla's open tasks and her DAS occurrences (October's pending one and November's).
    expect(home.mine.tasks.map((t: any) => t.title)).toEqual(['Balancete de setembro', 'Reunião com a Padaria', 'Conferir notas', '=SOMA(A1)', 'Organizar arquivo']);
    expect(home.mine.occurrences.map((o: any) => [o.competence, o.pending])).toEqual([
      ['2026-10', 1],
      ['2026-11', 2],
    ]);
    expect(home.mine).toMatchObject({ open: 8, overdue: 1 });
    // Administrators see all departments; the obligations follow the view.
    const all = (await ana.get('/tasks/home?departmentId=all')).body;
    expect(all.obligations.total).toBe(4);
    // The list: occurrences aggregated, counted per client, "Fora da meta" between overdue and today.
    const list = (await carla.get('/tasks?scope=department&situation=open')).body;
    expect(list.groups).toMatchObject({ overdue: 3, targetMissed: 1, today: 1 });
    expect(list.summary.oldestOverdue).toMatchObject({ id: overdue.id });
  });

  it('reports aggregate in SQL by every dimension, filter the late ones and export CSV', async () => {
    const { ana, carla, fiscal } = await scenario();
    const period = 'from=2026-10-01&to=2026-10-31';
    const report = (await carla.get(`/tasks/reports?${period}&pageSize=4`)).body;
    // 6 tasks due in October + 4 occurrences (without due date: created in the period → +1).
    expect(report.summary).toEqual({ total: 11, done: 2, doneOnTime: 2, doneLate: 0, canceled: 1, open: 5, overdue: 3, targetMissed: 1 });
    expect(report.byStatus).toMatchObject({ todo: 8, done: 2, canceled: 1, in_progress: 0 });
    expect(report.byKind.map((r: any) => [r.key, r.total])).toEqual([
      ['standalone', 7],
      ['recurring', 4],
    ]);
    expect(report.byDepartment[0]).toMatchObject({ key: fiscal, label: 'Fiscal' });
    expect(report.byAssignee.find((r: any) => r.key === carla.userId)).toMatchObject({ label: 'Carla Souza', done: 2 });
    expect(report.byClient.map((r: any) => r.label)).toContain('Interna');
    expect(report.byPriority.map((r: any) => r.key)).toEqual(['urgent', 'high', 'medium', 'low']);
    expect(report.byMonth.map((r: any) => [r.key, r.total])).toEqual([
      ['2026-10', 10],
      [null, 1],
    ]);
    expect(report.productivity).toEqual([{ member: { id: carla.userId, name: 'Carla Souza' }, concluded: 2, onTime: 2, late: 0, averageDays: 0 }]);
    expect(report.items).toMatchObject({ total: 11, page: 1, pageSize: 4 });
    expect(report.items.items).toHaveLength(4);
    expect(report.items.items[0]).toMatchObject({ title: 'Balancete de setembro', overdue: true });
    const occurrenceRow = (await carla.get(`/tasks/reports?${period}&kind=recurring&pageSize=50`)).body.items.items.find((r: any) => r.targetDate);
    expect(occurrenceRow).toMatchObject({ kind: 'recurring', competence: '2026-10', referenceMonth: '2026-09' });

    // Filters: situation (late / on time / overdue), kind, status.
    expect((await carla.get(`/tasks/reports?${period}&situation=overdue`)).body.summary.total).toBe(3);
    expect((await carla.get(`/tasks/reports?${period}&situation=doneOnTime`)).body.summary.total).toBe(2);
    expect((await carla.get(`/tasks/reports?${period}&situation=doneLate`)).body.summary.total).toBe(0);
    // A late conclusion shows up there.
    const dctfOpen = (await carla.get(`/tasks/reports?${period}&kind=recurring&situation=overdue&pageSize=50`)).body.items.items[0];
    await ana.patch(`/tasks/${dctfOpen.id}/status`, { status: 'done' });
    const late = (await carla.get(`/tasks/reports?${period}&situation=doneLate`)).body;
    expect(late.summary).toMatchObject({ total: 1, doneLate: 1 });
    expect(late.items.items[0]).toMatchObject({ id: dctfOpen.id, completedOnTime: false });
    expect((await carla.get(`/tasks/reports?${period}&status=canceled`)).body.summary.total).toBe(1);
    expect((await carla.get('/tasks/reports?from=2026-01-01&to=2027-06-30')).status).toBe(422);
    expect((await carla.get('/tasks/reports?from=2026-10-31&to=2026-10-01')).status).toBe(400);

    // CSV: BOM, `;`, CRLF, the columns of the screen, no formula injection, a download.
    const csv = await app.inject({ method: 'GET', url: `/api/tasks/reports/export.csv?${period}`, headers: { authorization: `Bearer ${carla.token}` } });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(csv.headers['content-disposition']).toContain('attachment; filename="relatorio-tarefas-2026-10-20.csv"');
    expect(csv.headers['x-content-type-options']).toBe('nosniff');
    expect(csv.body.startsWith('﻿Tarefa;Tipo;Competência;Referência;Cliente;Departamento;Categoria;Responsável;Prioridade;Vencimento;Meta;Situação;Concluída em;No prazo;Concluída por\r\n')).toBe(true);
    const lines = csv.body.trim().split('\r\n');
    expect(lines).toHaveLength(12);
    expect(lines.find((l) => l.includes('SOMA'))!.startsWith("'=SOMA(A1);")).toBe(true);
    expect(lines.find((l) => l.startsWith('Certidão negativa'))).toBe('Certidão negativa;Avulsas;;;Interna;Fiscal;;Carla Souza;Média;22/10/2026;;Concluída;20/10/2026 12:00;Sim;Carla Souza');
    expect(lines.find((l) => l.startsWith('DAS;') && l.includes('Padaria'))).toContain(';Recorrentes;10/2026;09/2026;Padaria;Fiscal;');
  });

  it('the calendar puts tasks on their due date and occurrences on their target', async () => {
    const { carla, das, dctf } = await scenario();
    const res = await carla.get('/tasks/calendar?from=2026-09-27&to=2026-11-07');
    expect(res.status).toBe(200);
    const cal = res.body;
    expect(cal).toMatchObject({ from: '2026-09-27', to: '2026-11-07', today: '2026-10-20', noDueDate: 1, truncated: false });
    expect(cal.tasks.map((t: any) => [t.dueDate, t.title])).toEqual([
      ['2026-10-10', 'Balancete de setembro'],
      ['2026-10-20', 'Reunião com a Padaria'],
      ['2026-10-22', 'Certidão negativa'],
      ['2026-10-25', 'Conferir notas'],
      ['2026-10-28', 'Baixa antiga'],
      ['2026-10-30', '=SOMA(A1)'],
    ]);
    expect(cal.occurrences.map((o: any) => [o.recurringTaskId, o.targetDate, `${o.done}/${o.total}`])).toEqual([
      [dctf.id, '2026-10-15', '0/2'],
      [das.id, '2026-10-16', '1/2'],
    ]);
    const mine = (await carla.get('/tasks/calendar?from=2026-10-01&to=2026-10-31&scope=mine&kind=recurring')).body;
    expect(mine.tasks).toEqual([]);
    expect(mine.occurrences.map((o: any) => o.recurringTaskId)).toEqual([das.id]);
    expect((await carla.get('/tasks/calendar?from=2026-09-01&to=2026-12-01')).status).toBe(400);
  });

  it('the global search finds tasks and recurring tasks for every member, never another office’s', async () => {
    const { carla } = await scenario();
    const found = (await carla.get('/search?q=balancete')).body;
    expect(found.tasks).toEqual([
      expect.objectContaining({ title: 'Balancete de setembro', kind: 'standalone', status: 'todo', overdue: true, dueDate: '2026-10-10', client: expect.objectContaining({ name: 'Padaria' }) }),
    ]);
    // The collaborator still gets nothing financial.
    expect(found).toMatchObject({ transactions: [], accounts: [], categories: [] });
    expect((await carla.get('/search?q=dctf')).body.recurringTasks).toEqual([expect.objectContaining({ name: 'DCTFWeb', period: 'monthly' })]);
    // Occurrences are not listed one by one (the recurring task stands for them).
    expect((await carla.get('/search?q=DAS')).body.tasks).toEqual([]);
    const other = await registerUser(app, 'Outro Escritório');
    expect((await other.get('/search?q=balancete')).body.tasks).toEqual([]);
  });
});
