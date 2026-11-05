// The personal area (`GET /tasks/me/overview`): what is open with you now, your productivity in the month
// (on time × late) and its 6-month trend, the next 14 days, the load per weekday, you × the average per
// member of your department (only with 3+ members) and insights computed by the server. Never anyone
// else's own numbers. Today is pinned to 2026-10-20, a Tuesday (vitest.config.ts); conclusions take
// `EFFINANCE_NOW`.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { buildMyInsights, type InsightInput } from '../src/modules/tasks/overview-insights';
import { createTestApp, resetDb, type Client } from './helpers';
import { member, office } from './task-helpers';

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

async function task(c: Client, body: Record<string, unknown>) {
  const res = await c.post('/tasks', { assigneeId: c.userId, ...body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

describe('GET /tasks/me/overview', () => {
  it('your open work, productivity and trend, the next days, the load per weekday and the department average', async () => {
    const { ana, bruno, carla, fiscal } = await office(app);
    // September: one on time, one late (Carla); the conclusion instant comes from EFFINANCE_NOW.
    process.env.EFFINANCE_NOW = '2026-09-10T15:00:00Z';
    await task(carla, { title: 'Set no prazo', dueDate: '2026-09-15', status: 'done' });
    await task(carla, { title: 'Set atrasada', dueDate: '2026-09-05', status: 'done' });
    // October: three on time (one without due date), one late; Ana concludes two (the department's).
    process.env.EFFINANCE_NOW = '2026-10-20T15:00:00Z';
    await task(carla, { title: 'Out 1', dueDate: '2026-10-20', status: 'done' });
    await task(carla, { title: 'Out 2', dueDate: '2026-10-25', status: 'done' });
    await task(carla, { title: 'Out 3', status: 'done' });
    await task(carla, { title: 'Out atrasada', dueDate: '2026-10-01', status: 'done' });
    await task(ana, { title: 'Da Ana 1', dueDate: '2026-10-22', status: 'done' });
    await task(ana, { title: 'Da Ana 2', dueDate: '2026-10-22', status: 'done' });
    await task(ana, { title: 'Aberta da Ana', dueDate: '2026-10-22' });
    // Carla's open work: 2 overdue (oldest 10 days), 1 today, 3 tomorrow, 1 waiting, 1 without date, 2 later.
    await task(carla, { title: 'Atrasada antiga', dueDate: '2026-10-10' });
    await task(carla, { title: 'Atrasada', dueDate: '2026-10-15' });
    await task(carla, { title: 'Hoje', dueDate: '2026-10-20', startTime: '10:00' });
    for (const n of [1, 2, 3]) await task(carla, { title: `Amanhã ${n}`, dueDate: '2026-10-21' });
    await task(carla, { title: 'Aguardando', dueDate: '2026-10-23', status: 'waiting_client' });
    await task(carla, { title: 'Sem data' });
    await task(carla, { title: 'Quinta', dueDate: '2026-10-29' });
    await task(carla, { title: 'Quinta seguinte', dueDate: '2026-11-05' });
    // Someone else's department and work never enter.
    await task(bruno, { title: 'Do Bruno', dueDate: '2026-10-21', status: 'done' });

    // Two members in Fiscal: no average (it would be Ana's own numbers).
    const small = await carla.get('/tasks/me/overview');
    expect(small.status, JSON.stringify(small.body)).toBe(200);
    expect(small.body.comparison).toMatchObject({ department: { id: fiscal, name: 'Fiscal' }, members: 2, average: null });

    const dani = await member(app, ana, 'viewer', 'Daniela Lima');
    expect((await ana.put(`/tasks/members/${dani.userId}/department`, { departmentId: fiscal })).status).toBe(200);
    const res = await carla.get('/tasks/me/overview');
    expect(res.status).toBe(200);
    const o = res.body;
    expect(o).toMatchObject({
      today: '2026-10-20',
      month: '2026-10',
      department: { id: fiscal, name: 'Fiscal' },
      open: {
        total: 10,
        overdue: 2,
        dueToday: 1,
        dueTomorrow: 3,
        next7Days: 4,
        targetMissed: 0,
        targetMissedNextLegalDate: null,
        waitingClient: 1,
        noDueDate: 1,
        oldestOverdue: { title: 'Atrasada antiga', daysOverdue: 10 },
      },
      productivity: { month: '2026-10', concluded: 4, onTime: 3, late: 1, onTimeRate: 75, rateChange: 25 },
      comparison: {
        members: 3,
        me: { concluded: 4, onTimeRate: 75, open: 10, overdue: 2 },
        average: { concluded: 2, onTimeRate: 83, open: 3.7, overdue: 0.7 },
      },
    });
    expect(o.productivity.trend.map((p: any) => [p.month, p.concluded, p.onTimeRate])).toEqual([
      ['2026-05', 0, null],
      ['2026-06', 0, null],
      ['2026-07', 0, null],
      ['2026-08', 0, null],
      ['2026-09', 2, 50],
      ['2026-10', 4, 75],
    ]);
    expect(o.upcoming).toMatchObject({ from: '2026-10-20', to: '2026-11-03', total: 6, occurrences: [] });
    expect(o.upcoming.tasks.map((t: any) => t.title)).toEqual(['Hoje', 'Amanhã 1', 'Amanhã 2', 'Amanhã 3', 'Aguardando', 'Quinta']);
    const day = (n: number) => o.workload.days.find((d: any) => d.weekday === n);
    expect(o.workload).toMatchObject({ dueFrom: '2026-10-20', dueTo: '2026-11-16', concludedFrom: '2026-08-26' });
    expect(o.workload.days).toHaveLength(7);
    expect([day(2).due, day(3).due, day(4).due, day(5).due]).toEqual([1, 3, 2, 1]);
    expect([day(2).concluded, day(4).concluded]).toEqual([4, 2]);
    expect(o.insights.map((i: any) => [i.key, i.tone, i.text, i.link])).toEqual([
      ['overdue', 'danger', 'Você tem 2 tarefas atrasadas; a mais antiga venceu há 10 dias.', { situation: 'overdue' }],
      ['dueToday', 'warning', '1 tarefa vence hoje.', { dueBucket: 'today' }],
      ['dueTomorrow', 'info', '3 tarefas vencem amanhã.', { dueDate: '2026-10-21' }],
      ['onTimeRate', 'info', 'Você concluiu 75% no prazo este mês (3 de 4).', null],
      ['rateTrend', 'success', 'Seu índice no prazo subiu 25 pontos em relação a setembro.', null],
      ['department', 'success', 'Você concluiu mais que a média do departamento este mês (4 contra 2 por pessoa).', null],
    ]);
    // Nothing that identifies a colleague: only the aggregate.
    const text = JSON.stringify(o);
    for (const other of [ana.userId, dani.userId, bruno.userId, 'Ana Paula', 'Daniela', 'Bruno', 'Aberta da Ana']) expect(text).not.toContain(other);

    // Another month: productivity and the comparison follow it; the rest is about now.
    const september = (await carla.get('/tasks/me/overview?month=2026-09')).body;
    expect(september.productivity).toMatchObject({ month: '2026-09', concluded: 2, onTime: 1, onTimeRate: 50, rateChange: null });
    expect(september.open.total).toBe(10);
    expect(september.insights.find((i: any) => i.key === 'onTimeRate').text).toBe('Só 50% das suas conclusões de setembro foram no prazo (1 de 2).');
    expect((await carla.get('/tasks/me/overview?month=2026-13')).status).toBe(400);
  });

  it('without department: no comparison; with nothing pending: all clear', async () => {
    const { ana } = await office(app);
    const eva = await member(app, ana, 'viewer', 'Eva Nunes');
    const res = await eva.get('/tasks/me/overview');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ department: null, comparison: null, open: { total: 0 }, productivity: { concluded: 0, onTimeRate: null } });
    expect(res.body.insights).toEqual([{ key: 'allClear', tone: 'success', text: 'Você não tem tarefas em aberto.', link: null }]);
  });
});

describe('insights of the personal area (pure)', () => {
  const base: InsightInput = {
    today: '2026-10-20',
    month: '2026-10',
    current: true,
    open: { total: 4, overdue: 0, dueToday: 0, dueTomorrow: 0, next7Days: 1, targetMissed: 0, targetMissedNextLegalDate: null, waitingClient: 0, noDueDate: 0, oldestOverdue: null },
    productivity: { concluded: 0, onTime: 0, late: 0, onTimeRate: null, rateChange: null },
    comparison: null,
    workload: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, due: 0, concluded: 0 })),
  };
  const texts = (input: Partial<InsightInput>) => buildMyInsights({ ...base, ...input }).map((i) => `${i.key}: ${i.text}`);

  it('singular and plural, targets, waiting, the busiest weekday and falls', () => {
    expect(texts({ open: { ...base.open, overdue: 1, oldestOverdue: { daysOverdue: 1 } as never } })[0]).toBe('overdue: Você tem 1 tarefa atrasada, vencida há 1 dia.');
    expect(texts({ open: { ...base.open, targetMissed: 1, targetMissedNextLegalDate: '2026-10-23' } })[0]).toBe(
      'targetMissed: 1 obrigação passou da meta interna; o prazo legal é 23/10.',
    );
    expect(texts({ open: { ...base.open, targetMissed: 2, targetMissedNextLegalDate: '2026-10-23' } })[0]).toBe(
      'targetMissed: 2 obrigações passaram da meta interna; o prazo legal mais próximo é 23/10.',
    );
    expect(texts({ open: { ...base.open, waitingClient: 2 } })).toContain('waitingClient: 2 tarefas aguardam o cliente.');
    const workload = base.workload.map((d) => (d.weekday === 4 ? { ...d, due: 6 } : d.weekday === 1 ? { ...d, due: 1 } : d));
    expect(texts({ workload })).toContain('busiestWeekday: Quinta-feira é seu dia mais cheio: 6 vencimentos nas próximas 4 semanas.');
    expect(texts({ productivity: { concluded: 10, onTime: 10, late: 0, onTimeRate: 100, rateChange: -12 } })).toEqual([
      'onTimeRate: Você concluiu 100% no prazo este mês (10 de 10).',
      'rateTrend: Seu índice no prazo caiu 12 pontos em relação a setembro.',
      'allClear: Nada atrasado nem vencendo hoje.',
    ]);
    expect(
      texts({
        open: { ...base.open, overdue: 4, oldestOverdue: { daysOverdue: 3 } as never },
        comparison: { department: { id: 'd', name: 'Fiscal' }, members: 4, me: { concluded: 1, onTimeRate: 100, open: 4, overdue: 4 }, average: { concluded: 2, onTimeRate: 90, open: 3, overdue: 1.5 } },
      }),
    ).toContain('department: Você tem mais tarefas atrasadas que a média do departamento (4 contra 1,5 por pessoa).');
  });
});
