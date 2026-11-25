// QA (qa-logica-gestao): repetition of a standalone task (series of origin `task`) — end by count across
// holidays and short months, "a cada N semanas", "só esta" × "esta e as próximas" (the label the screen
// shows: TASK_RECURRENCE_APPLY_TO_LABELS.series = 'Esta e as próximas') and idempotency of the reads.
// Today is pinned to 2026-10-20 (Tuesday); 02/11/2026 (Monday) is Finados.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TASK_RECURRENCE_APPLY_TO_LABELS } from '@effinance/shared';
import type { App } from '../src/app';
import { executeRows } from '../src/lib/sql';
import { admin, createTestApp, resetDb, type Client } from './helpers';
import { createClient, office, workspaceOf } from './task-helpers';

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

const rows = <T>(query: ReturnType<typeof sql>) => executeRows<T>(admin(), query);

type Row = { id: string; due_date: string; period_key: string; title: string; status: string; priority: string; assignee_id: string };
const seriesRows = (seriesId: string) =>
  rows<Row>(sql`select id, due_date::text, period_key, title, status, priority, assignee_id from tasks
                 where recurring_task_id = ${seriesId} order by due_date, id`);

async function create(c: Client, body: Record<string, unknown>) {
  const res = await c.post('/tasks', body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

describe('qa-gestao: série com fim por contagem', () => {
  it('semanal às segundas por 4 vezes a partir de 26/10: pula Finados (02/11) e termina em 23/11, com exatamente 4 tarefas', async () => {
    const { ana } = await office(app);
    const task = await create(ana, {
      title: 'Relatório semanal',
      assigneeId: ana.userId,
      dueDate: '2026-10-26',
      recurrence: { frequency: 'weekly', weekdays: [1], ends: 'count', count: 4 },
    });
    expect(task).toMatchObject({ dueDate: '2026-10-26', recurrence: { ends: 'count', count: 4, endDate: '2026-11-23' } });
    expect((await seriesRows(task.occurrence.recurringTaskId)).map((r) => r.due_date)).toEqual(['2026-10-26', '2026-11-09', '2026-11-16', '2026-11-23']);
  });

  it('mensal no dia 31 por 3 vezes a partir de 31/10 (sábado): 30/10, 30/11 e 31/12', async () => {
    const { ana } = await office(app);
    const client = await createClient(ana, { tradeName: 'Fechamento' });
    const task = await create(ana, {
      title: 'Fechamento do mês',
      clientId: client,
      assigneeId: ana.userId,
      dueDate: '2026-10-31',
      recurrence: { frequency: 'monthly', ends: 'count', count: 3 },
    });
    expect(task).toMatchObject({ dueDate: '2026-10-30', recurrence: { dueDay: 31, endDate: '2026-12-31' } });
    expect((await seriesRows(task.occurrence.recurringTaskId)).map((r) => [r.period_key, r.due_date])).toEqual([
      ['2026-10', '2026-10-30'],
      ['2026-11', '2026-11-30'],
      ['2026-12', '2026-12-31'],
    ]);
  });

  it('"a cada 2 semanas" às quartas por 3 vezes: 21/10, 04/11 e 18/11', async () => {
    const { ana } = await office(app);
    const task = await create(ana, {
      title: 'Reunião quinzenal',
      assigneeId: ana.userId,
      dueDate: '2026-10-21',
      recurrence: { frequency: 'weekly', weekdays: [3], interval: 2, ends: 'count', count: 3 },
    });
    expect(task.recurrence).toMatchObject({ endDate: '2026-11-18' });
    expect((await seriesRows(task.occurrence.recurringTaskId)).map((r) => r.due_date)).toEqual(['2026-10-21', '2026-11-04', '2026-11-18']);
  });
});

describe('qa-gestao: só esta × esta e as próximas', () => {
  it('"Só esta ocorrência" muda só a ocorrência editada', async () => {
    const { ana } = await office(app);
    const task = await create(ana, { title: 'Conferir caixa', assigneeId: ana.userId, dueDate: '2026-10-20', recurrence: { frequency: 'daily', ends: 'count', count: 5 } });
    const list = await seriesRows(task.occurrence.recurringTaskId);
    expect(list.map((r) => r.due_date)).toEqual(['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26']);
    expect((await ana.patch(`/tasks/${list[2]!.id}`, { priority: 'urgent' })).status).toBe(200);
    expect((await seriesRows(task.occurrence.recurringTaskId)).map((r) => r.priority)).toEqual(['medium', 'medium', 'urgent', 'medium', 'medium']);
  });

  it(`"${TASK_RECURRENCE_APPLY_TO_LABELS.series}" a partir da 4ª não altera as anteriores ainda não iniciadas`, async () => {
    const { ana, carla } = await office(app);
    const task = await create(ana, {
      title: 'Conferir caixa',
      assigneeId: ana.userId,
      dueDate: '2026-10-20',
      recurrence: { frequency: 'daily', ends: 'count', count: 10 },
    });
    const seriesId = task.occurrence.recurringTaskId;
    let list = await seriesRows(seriesId);
    // Business days from 20/10, Finados skipped.
    expect(list.map((r) => r.due_date)).toEqual([
      '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26',
      '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-11-03',
    ]);
    // The first one was done; the 23rd onwards go to Carla with a new title ("esta e as próximas").
    expect((await ana.patch(`/tasks/${list[0]!.id}/status`, { status: 'done' })).status).toBe(200);
    const fourth = list[3]!;
    const edited = await ana.patch(`/tasks/${fourth.id}`, { title: 'Conferir caixa e cofre', assigneeId: carla.userId, applyTo: 'series' });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    list = await seriesRows(seriesId);
    // OK: the concluded one never changes; this one and the next ones follow.
    expect(list[0]).toMatchObject({ status: 'done', title: 'Conferir caixa', assignee_id: ana.userId });
    expect(list.slice(3).every((r) => r.title === 'Conferir caixa e cofre' && r.assignee_id === carla.userId)).toBe(true);
    // DEFECT: the 21st and 22nd (before the edited one, not started) were renamed and handed to Carla too.
    expect(
      list.slice(1, 3).map((r) => [r.due_date, r.title, r.assignee_id === ana.userId ? 'Ana' : 'Carla']),
      'ocorrências anteriores à editada mudaram com "esta e as próximas"',
    ).toEqual([
      ['2026-10-21', 'Conferir caixa', 'Ana'],
      ['2026-10-22', 'Conferir caixa', 'Ana'],
    ]);
  });
});

describe('qa-gestao: idempotência da série', () => {
  it('lista, início, calendário e relatórios repetidos (e em paralelo) não duplicam ocorrências', async () => {
    const { ana, carla } = await office(app);
    const ws = await workspaceOf(ana);
    const client = await createClient(ana, { tradeName: 'Diário' });
    const daily = await create(carla, { title: 'Baixar notas', clientId: client, assigneeId: carla.userId, dueDate: '2026-10-20', recurrence: { frequency: 'daily' } });
    const internal = await create(ana, { title: 'Backup', assigneeId: ana.userId, dueDate: '2026-10-23', recurrence: { frequency: 'weekly', weekdays: [5] } });
    const before = (await seriesRows(daily.occurrence.recurringTaskId)).length;
    await Promise.all([
      carla.get('/tasks'),
      carla.get('/tasks/home'),
      ana.get('/tasks/calendar?from=2026-10-01&to=2026-11-30'),
      ana.get('/tasks/reports?from=2026-10-01&to=2026-12-31'),
      ana.post('/tasks/recurring/generate', { competence: '2026-11' }),
      ana.post('/tasks/recurring/generate', { competence: '2026-12' }),
      carla.get('/tasks?month=2026-12'),
    ]);
    const dup = await rows<{ n: number }>(sql`
      select count(*)::int as n from (select recurring_task_id, client_id, period_key from tasks
        where workspace_id = ${ws} and recurring_task_id is not null group by 1, 2, 3 having count(*) > 1) d`);
    expect(dup).toEqual([{ n: 0 }]);
    expect((await seriesRows(daily.occurrence.recurringTaskId)).length).toBe(before);
    // Daily from today: business days of Oct (from 20th), Nov and Dec 2026 (Dec 25 is Christmas).
    expect(before).toBe(9 + 19 + 22);
    // Weekly internal on Fridays from 23/10: Oct 23, 30; Nov 6, 13, (20 holiday skipped), 27; Dec 4, 11, 18, (25 skipped).
    expect((await seriesRows(internal.occurrence.recurringTaskId)).map((r) => r.due_date)).toEqual([
      '2026-10-23', '2026-10-30', '2026-11-06', '2026-11-13', '2026-11-27', '2026-12-04', '2026-12-11', '2026-12-18',
    ]);
  });
});
