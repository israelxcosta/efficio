// QA (qa-logica-gestao): the start page (Início) and the dashboard of a past competence (`asOf` = its
// last day): open × overdue × concluded on time × late as they stood on 30/09/2026, conclusions at
// 23:30 × 00:30 in São Paulo, and the obligations (registry occurrences) of that competence.
// Today is pinned to 2026-10-20; conclusions are pinned with EFFINANCE_NOW.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { createTestApp, resetDb, type Client } from './helpers';
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
  process.env.EFFINANCE_NOW = '2026-09-01T12:00:00Z';
});

async function task(c: Client, title: string, dueDate: string) {
  const res = await c.post('/tasks', { title, assigneeId: c.userId, dueDate });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}

async function concludeAt(c: Client, id: string, instant: string) {
  process.env.EFFINANCE_NOW = instant;
  const res = await c.patch(`/tasks/${id}/status`, { status: 'done' });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

/** September 2026 of Ana (Fiscal): six tasks created on 01/09 (see each comment). */
async function september(ana: Client) {
  const a = await task(ana, 'A — concluída antes do prazo', '2026-09-10');
  const b = await task(ana, 'B — concluída só em outubro', '2026-09-15');
  await task(ana, 'C — em aberto, venceu em setembro', '2026-09-25');
  await task(ana, 'D — vence no último dia', '2026-09-30');
  const e = await task(ana, 'E — concluída 30/09 às 23h30 de SP', '2026-09-20');
  const f = await task(ana, 'F — concluída 01/10 às 00h30 de SP', '2026-09-28');
  await concludeAt(ana, a, '2026-09-09T15:00:00Z');
  await concludeAt(ana, b, '2026-10-05T15:00:00Z');
  await concludeAt(ana, e, '2026-10-01T02:30:00Z');
  await concludeAt(ana, f, '2026-10-01T03:30:00Z');
  process.env.EFFINANCE_NOW = '2026-10-20T15:00:00Z';
}

describe('qa-gestao: Início numa competência passada (asOf)', () => {
  it('conta cada tarefa como estava em 30/09, com o dia da conclusão no fuso de São Paulo', async () => {
    const { ana, fiscal } = await office(app);
    await september(ana);
    const home = (await ana.get(`/tasks/home?month=2026-09&departmentId=${fiscal}`)).body;
    expect(home.asOf).toBe('2026-09-30');
    // On 30/09: B, C and F open and overdue; D open, due that day; A on time; E late (concluded on the
    // 30th at 23:30 in São Paulo, after its due date on the 20th).
    expect(home.totals).toMatchObject({ total: 6, overdue: 3, open: 4, dueToday: 1, doneOnTime: 1, doneLate: 1, canceled: 0 });
    expect(home.oldestOverdue).toMatchObject({ title: 'B — concluída só em outubro', daysOverdue: 15 });
    const dash = (await ana.get(`/tasks/dashboard?month=2026-09&departmentId=${fiscal}`)).body;
    expect(dash.asOf).toBe('2026-09-30');
    expect(dash.taskStatus).toEqual({ total: 6, pending: 1, concluded: 2, overdue: 3 });
    // The current month counts today: B (concluded on 05/10) and F (01/10 00:30 in São Paulo) are late
    // conclusions of October; E (01/10 02:30 UTC = 30/09 23:30 in São Paulo) belongs to September, not
    // October. C and D are overdue now.
    const now = (await ana.get(`/tasks/home?departmentId=${fiscal}`)).body;
    expect(now.asOf).toBe('2026-10-20');
    expect(now.totals).toMatchObject({ overdue: 2, doneLate: 2 });
  });

  it('a contagem por estado (byStatus) de setembro também é a de 30/09', async () => {
    const { ana, fiscal } = await office(app);
    await september(ana);
    const home = (await ana.get(`/tasks/home?month=2026-09&departmentId=${fiscal}`)).body;
    // docs/api.md: "Numa competência passada tudo é contado como estava nesse dia". On 30/09 only A and E
    // were concluded; B and F were concluded in October. byStatus reports today's status instead
    // (done: 4), contradicting totals.doneOnTime + totals.doneLate = 2 in the same response.
    expect(home.totals.doneOnTime + home.totals.doneLate).toBe(2);
    expect(home.totals.byStatus, 'byStatus de setembro usa o estado de hoje').toMatchObject({ done: 2, todo: 4 });
  });

  it('tarefa criada depois do fim do mês e com vencimento posterior não conta como "em aberto" em setembro', async () => {
    const { ana, fiscal } = await office(app);
    await september(ana);
    const before = (await ana.get(`/tasks/home?month=2026-09&departmentId=${fiscal}`)).body.totals;
    // Created on 20/10, due in December: it did not exist on 30/09 and is not due in September.
    process.env.EFFINANCE_NOW = '2026-10-20T15:00:00Z';
    await task(ana, 'G — criada em outubro, vence em dezembro', '2026-12-10');
    const after = (await ana.get(`/tasks/home?month=2026-09&departmentId=${fiscal}`)).body.totals;
    expect({ total: after.total, open: after.open }, 'Início de setembro passou a contar uma tarefa de dezembro criada em outubro').toEqual({
      total: before.total,
      open: before.open,
    });
  });

  it('obrigações de setembro: concluída às 23h30 de SP no dia do prazo é no prazo; concluída em outubro estava atrasada em 30/09', async () => {
    process.env.EFFINANCE_NOW = '2026-10-20T15:00:00Z';
    const { ana, fiscal } = await office(app);
    const x = await createClient(ana, { tradeName: 'X Comércio' });
    const y = await createClient(ana, { tradeName: 'Y Serviços' });
    // DAS on the 20th: 20/09/2026 is a Sunday → anticipated to Friday 18/09.
    const created = await ana.post('/tasks/recurring', { name: 'DAS', departmentId: fiscal, assigneeId: ana.userId, dueDay: 20, regimes: ['simples_nacional'], startCompetence: '2026-09' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.id as string;
    const cells = (await ana.get(`/tasks/recurring/${id}/occurrences/2026-09`)).body.cells;
    expect(cells.map((c: any) => c.legalDueDate)).toEqual(['2026-09-18', '2026-09-18']);
    const cellOf = (client: string) => cells.find((c: any) => c.clientId === client).taskId as string;
    await concludeAt(ana, cellOf(x), '2026-09-19T02:30:00Z'); // 18/09 23:30 in São Paulo
    await concludeAt(ana, cellOf(y), '2026-10-02T15:00:00Z');
    process.env.EFFINANCE_NOW = '2026-10-20T15:00:00Z';

    const audit = (await ana.get('/tasks/audit?competence=2026-09')).body;
    const cell = (client: string) => audit.cells.find((c: any) => c.clientId === client);
    expect(cell(x)).toMatchObject({ situation: 'done_on_time', concludedOnTime: true });
    expect(cell(y)).toMatchObject({ situation: 'done_late', concludedOnTime: false });

    const home = (await ana.get(`/tasks/home?month=2026-09&departmentId=${fiscal}`)).body;
    expect(home.obligations).toMatchObject({ competence: '2026-09', total: 2, done: 1, pending: 1, overdue: 1 });
    expect(home.obligations.items[0]).toMatchObject({ recurringTaskId: id, done: 1, doneLate: 0, pending: 1, overdue: true, daysOverdue: 12 });
    expect(home.totals).toMatchObject({ doneOnTime: 1, doneLate: 0, overdue: 1 });
    const dash = (await ana.get(`/tasks/dashboard?month=2026-09&departmentId=${fiscal}`)).body;
    expect(dash.fiscal.totals).toEqual({ total: 2, done: 1, pending: 0, overdue: 1 });
    expect(dash.clientsOverview.counts).toEqual({ attention: 1, pending: 0, upToDate: 1 });
  });
});
