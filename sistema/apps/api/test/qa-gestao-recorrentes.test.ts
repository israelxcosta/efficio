// QA (qa-logica-gestao): recurring tasks of the registry seen from the client's side and from the
// calendar — a client that changes regime, is inactivated, or joins in the middle of a competence; day 31
// in February (leap year included) and annual obligations with their reference month; the generation
// bounds; and idempotency under concurrent reads right after a change that invalidates the marks.
// Today is pinned to 2026-10-20 (Tuesday). A test that proves a defect stays failing (see the report).

import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
afterEach(() => {
  process.env.EFFINANCE_TODAY = '2026-10-20';
});

const rows = <T>(query: ReturnType<typeof sql>) => executeRows<T>(admin(), query);
const OPEN = ['todo', 'in_progress', 'waiting_client'];

type OccRow = { id: string; client_id: string | null; competence: string; period_key: string; reference_month: string; due_date: string; target_date: string; status: string };

async function occ(ws: string, recurringId: string, clientId?: string) {
  const list = await rows<OccRow>(sql`
    select id, client_id, competence, period_key, reference_month, due_date::text, target_date::text, status
      from tasks where workspace_id = ${ws} and recurring_task_id = ${recurringId} order by competence, period_key, client_id`);
  return clientId ? list.filter((r) => r.client_id === clientId) : list;
}

async function recurring(ana: Client, body: Record<string, unknown>) {
  const res = await ana.post('/tasks/recurring', body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}

/** PUT /clients/:id with the stored fields plus `changes` (regime, contract start…). */
async function updateClient(ana: Client, id: string, changes: Record<string, unknown>) {
  const c = (await ana.get(`/clients/${id}`)).body;
  const body = {
    name: c.name,
    tradeName: c.tradeName,
    document: c.document,
    taxRegime: c.taxRegime,
    simplesAnnex: c.simplesAnnex ?? undefined,
    contractStartDate: c.contractStartDate,
    ...changes,
  };
  const res = await ana.put(`/clients/${id}`, body);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

async function duplicates(ws: string) {
  return rows<{ n: number }>(sql`
    select count(*)::int as n from (
      select recurring_task_id, client_id, period_key from tasks
       where workspace_id = ${ws} and recurring_task_id is not null
       group by recurring_task_id, client_id, period_key having count(*) > 1) d`);
}

describe('qa-gestao: cliente que muda de regime', () => {
  it('a concluída fica, o novo regime gera; as "A fazer" do regime antigo nas próximas competências deixam de estar em aberto', async () => {
    const { ana, carla, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    const padaria = await createClient(ana, { tradeName: 'Padaria' });
    const das = await recurring(ana, { name: 'DAS', departmentId: fiscal, assigneeId: carla.userId, dueDay: 20, nonBusinessDayRule: 'postpone', regimes: ['simples_nacional'] });
    const pis = await recurring(ana, { name: 'PIS/COFINS', departmentId: fiscal, assigneeId: carla.userId, dueDay: 25, regimes: ['presumed_profit'] });
    await carla.get('/tasks/home');
    const before = await occ(ws, das, padaria);
    expect(before.map((o) => [o.competence, o.status])).toEqual([
      ['2026-10', 'todo'],
      ['2026-11', 'todo'],
      ['2026-12', 'todo'],
    ]);
    expect(await occ(ws, pis, padaria)).toEqual([]);
    expect((await carla.patch(`/tasks/${before[0]!.id}/status`, { status: 'done' })).status).toBe(200);

    // The client becomes Lucro Presumido (from now on it no longer has the DAS of the Simples).
    await updateClient(ana, padaria, { taxRegime: 'presumed_profit', simplesAnnex: undefined });
    await carla.get('/tasks/home');

    // OK: history kept, the new regime generates.
    const after = await occ(ws, das, padaria);
    expect(after[0]).toMatchObject({ competence: '2026-10', status: 'done' });
    expect((await occ(ws, pis, padaria)).map((o) => [o.competence, o.status])).toEqual([
      ['2026-10', 'todo'],
      ['2026-11', 'todo'],
      ['2026-12', 'todo'],
    ]);

    // DEFECT: November and December still have a DAS "A fazer" for a client that is no longer in the
    // Simples (they count as pending obligations and will become overdue).
    expect
      .soft(
        after.filter((o) => o.competence > '2026-10' && OPEN.includes(o.status)).map((o) => [o.competence, o.status]),
        'DAS de nov/dez do cliente que saiu do Simples continuam em aberto',
      )
      .toEqual([]);
    const november = (await carla.get('/tasks/home?month=2026-11')).body;
    expect.soft(november.obligations.items.find((i: any) => i.recurringTaskId === das)?.pending ?? 0, 'Início de novembro conta o DAS como pendente').toBe(0);

    // The system's own rule exists, but only runs when someone edits the recurring task: an edit that
    // changes nothing cancels them with "deixou de se aplicar … (exceção ou regime)".
    expect((await ana.put(`/tasks/recurring/${das}`, { name: 'DAS', departmentId: fiscal, assigneeId: carla.userId, dueDay: 20, nonBusinessDayRule: 'postpone', regimes: ['simples_nacional'] })).status).toBe(200);
    expect((await occ(ws, das, padaria)).filter((o) => o.competence > '2026-10').map((o) => o.status)).toEqual(['canceled', 'canceled']);
  });

  it('início de contrato movido para depois: as ocorrências "A fazer" de antes do novo início deixam de estar em aberto', async () => {
    const { ana, carla, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    const loja = await createClient(ana, { tradeName: 'Loja' });
    const das = await recurring(ana, { name: 'DAS', departmentId: fiscal, assigneeId: carla.userId, dueDay: 20, regimes: ['simples_nacional'] });
    await carla.get('/tasks/home');
    expect(await occ(ws, das, loja)).toHaveLength(3);
    // The contract start was registered wrong: it actually starts in December.
    await updateClient(ana, loja, { contractStartDate: '2026-12-01' });
    await carla.get('/tasks/home');
    const open = (await occ(ws, das, loja)).filter((o) => OPEN.includes(o.status)).map((o) => o.competence);
    // DEFECT: October (due today, overdue tomorrow) and November stay "A fazer" although the client was
    // not a client then. Editing the recurring task would cancel them (same rule as the regime change).
    expect(open, 'out/nov de um cliente cujo contrato começa em dezembro').toEqual(['2026-12']);
  });
});

describe('qa-gestao: edição da recorrente (início adiado)', () => {
  it('adiar o início cancela as "A fazer" anteriores com um motivo que corresponda ao que aconteceu', async () => {
    const { ana, carla, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    const client = await createClient(ana, { tradeName: 'Adiada' });
    const body = { name: 'Balancete', departmentId: fiscal, assigneeId: carla.userId, dueDay: 25, clientIds: [client] };
    const id = await recurring(ana, body);
    expect((await ana.put(`/tasks/recurring/${id}`, { ...body, startCompetence: '2026-12' })).status).toBe(200);
    const list = await occ(ws, id, client);
    expect(list.map((o) => [o.competence, o.status])).toEqual([
      ['2026-10', 'canceled'],
      ['2026-11', 'canceled'],
      ['2026-12', 'todo'],
    ]);
    const history = (await carla.get(`/tasks/${list[0]!.id}/history`)).body.items[0];
    expect(history).toMatchObject({ kind: 'status', toStatus: 'canceled', actor: null });
    // The recurring task was not ended: it now starts later. The note says "foi encerrada antes desta competência".
    expect(history.note, 'motivo do cancelamento ao adiar o início').not.toMatch(/encerrada/);
  });
});

describe('qa-gestao: semanal do cadastro trocando o dia da semana', () => {
  it('sexta → segunda: toda semana de nov/dez continua com uma ocorrência em aberto (inclusive a da segunda 30/11)', async () => {
    const { ana, carla, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    const client = await createClient(ana, { tradeName: 'Semanal' });
    const body = { name: 'Conferência de extratos', departmentId: fiscal, assigneeId: carla.userId, period: 'weekly', dueDay: 5, clientIds: [client] };
    const id = await recurring(ana, body);
    // Fridays: the week of Monday 30/11 has its Friday on 04/12 → competence December.
    const before = await occ(ws, id, client);
    expect(before.find((o) => o.period_key === '2026-11-30')).toMatchObject({ competence: '2026-12', due_date: '2026-12-04' });
    // Now on Mondays: Monday 30/11 is in November.
    expect((await ana.put(`/tasks/recurring/${id}`, { ...body, dueDay: 1 })).status).toBe(200);
    await carla.get('/tasks/home');
    const after = await occ(ws, id, client);
    // The only row of that week is the old Friday one (competence December), canceled by the sync; the
    // unique key (recurring, client, period_key) has no competence, so the Monday one is never inserted.
    expect.soft(after.filter((o) => o.period_key === '2026-11-30').map((o) => [o.competence, o.status]), 'linhas da semana 30/11').toEqual([['2026-11', 'todo']]);
    const openNov = after.filter((o) => o.competence === '2026-11' && OPEN.includes(o.status)).map((o) => [o.period_key, o.due_date]);
    // Mondays of November: 02 (Finados → anticipated to Friday 30/10), 09, 16, 23 and 30.
    expect(openNov, 'segundas de novembro em aberto').toEqual([
      ['2026-11-02', '2026-10-30'],
      ['2026-11-09', '2026-11-09'],
      ['2026-11-16', '2026-11-16'],
      ['2026-11-23', '2026-11-23'],
      ['2026-11-30', '2026-11-30'],
    ]);
    const audit = (await carla.get('/tasks/audit?competence=2026-11')).body;
    expect(audit.columns.filter((c: any) => c.recurringTaskId === id).map((c: any) => c.periodKey)).toContain('2026-11-30');
  });
});

describe('qa-gestao: cliente inativado', () => {
  it('para de gerar (recorrente nova não alcança as competências seguintes) e não apaga o que foi concluído', async () => {
    const { ana, carla, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    const mercado = await createClient(ana, { tradeName: 'Mercado' });
    const das = await recurring(ana, { name: 'DAS', departmentId: fiscal, assigneeId: carla.userId, dueDay: 20, regimes: ['simples_nacional'] });
    await carla.get('/tasks/home');
    const [oct] = await occ(ws, das, mercado);
    expect((await carla.patch(`/tasks/${oct!.id}/status`, { status: 'done' })).status).toBe(200);
    const inactivated = await ana.post(`/clients/${mercado}/inactivate`, { date: '2026-10-20', reason: 'contract_end' });
    expect(inactivated.status, JSON.stringify(inactivated.body)).toBe(200);
    // A recurring task created after the inactivation: October (the client was active in it), nothing after.
    const reinf = await recurring(ana, { name: 'EFD-Reinf', departmentId: fiscal, assigneeId: carla.userId, dueDay: 15, regimes: ['simples_nacional'] });
    await carla.get('/tasks/home');
    expect((await occ(ws, reinf, mercado)).map((o) => o.competence)).toEqual(['2026-10']);
    expect((await occ(ws, das, mercado))[0]).toMatchObject({ competence: '2026-10', status: 'done' });
    // Past competences: a client inactivated on 10/08 has August but not September (a recurring task
    // that starts in August generates the window Aug…Dec when created).
    const antigo = await createClient(ana, { tradeName: 'Antigo' });
    expect((await ana.post(`/clients/${antigo}/inactivate`, { date: '2026-08-10', reason: 'contract_end' })).status).toBe(200);
    const fgts = await recurring(ana, { name: 'FGTS', departmentId: fiscal, assigneeId: carla.userId, dueDay: 20, regimes: ['simples_nacional'], startCompetence: '2026-08' });
    expect((await occ(ws, fgts, antigo)).map((o) => o.competence)).toEqual(['2026-08']);
    expect((await occ(ws, fgts, mercado)).map((o) => o.competence)).toEqual(['2026-08', '2026-09', '2026-10']);
  });

  it('reativado: volta a receber as ocorrências da janela na leitura seguinte, sem duplicar', async () => {
    const { ana, carla, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    const volta = await createClient(ana, { tradeName: 'Voltou' });
    expect((await ana.post(`/clients/${volta}/inactivate`, { date: '2026-09-15', reason: 'contract_end' })).status).toBe(200);
    const das = await recurring(ana, { name: 'DAS', departmentId: fiscal, assigneeId: carla.userId, dueDay: 20, regimes: ['simples_nacional'] });
    await carla.get('/tasks/home');
    expect(await occ(ws, das, volta)).toEqual([]);
    expect((await ana.post(`/clients/${volta}/reactivate`, {})).status).toBe(200);
    await carla.get('/tasks/home');
    await carla.get('/tasks/home');
    expect((await occ(ws, das, volta)).map((o) => [o.competence, o.status])).toEqual([
      ['2026-10', 'todo'],
      ['2026-11', 'todo'],
      ['2026-12', 'todo'],
    ]);
    expect(await duplicates(ws)).toEqual([{ n: 0 }]);
  });

  it('as ocorrências já geradas das competências seguintes à inativação não ficam "A fazer"', async () => {
    const { ana, carla, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    const mercado = await createClient(ana, { tradeName: 'Mercado' });
    const retro = await createClient(ana, { tradeName: 'Retroativo' });
    const das = await recurring(ana, { name: 'DAS', departmentId: fiscal, assigneeId: carla.userId, dueDay: 20, regimes: ['simples_nacional'] });
    await carla.get('/tasks/home');
    expect(await occ(ws, das, mercado)).toHaveLength(3);
    expect((await ana.post(`/clients/${mercado}/inactivate`, { date: '2026-10-20', reason: 'contract_end' })).status).toBe(200);
    // Inactivated retroactively (the office learned late): not a client in October either.
    expect((await ana.post(`/clients/${retro}/inactivate`, { date: '2026-09-30', reason: 'accounting_transfer' })).status).toBe(200);
    await carla.get('/tasks/home');
    const openOf = async (client: string) => (await occ(ws, das, client)).filter((o) => OPEN.includes(o.status)).map((o) => o.competence);
    // Fixed (syncClientOccurrences): November and December (and October of the retroactive one) are canceled.
    expect.soft(await openOf(mercado), 'cliente inativado em 20/10: nov/dez em aberto').toEqual(['2026-10']);
    expect.soft(await openOf(retro), 'cliente inativado em 30/09: out/nov/dez em aberto').toEqual([]);
    const dec = (await carla.get('/tasks/home?month=2026-12')).body;
    // `total` keeps the canceled ones (shown apart); what still counts is total − canceled.
    const decItem = dec.obligations.items.find((i: any) => i.recurringTaskId === das);
    expect.soft(decItem ? decItem.total - decItem.canceled : 0, 'obrigações de dezembro contam clientes inativos').toBe(0);
  });
});

describe('qa-gestao: cliente novo no meio da competência', () => {
  it('contrato em 15/10 entra em outubro (regra: mês do início ≤ competência); contrato em 05/11 só a partir de novembro', async () => {
    const { ana, carla, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    const das = await recurring(ana, { name: 'DAS', departmentId: fiscal, assigneeId: carla.userId, dueDay: 20, regimes: ['simples_nacional'] });
    const iss = await recurring(ana, { name: 'ISS', departmentId: fiscal, assigneeId: carla.userId, dueDay: 10, regimes: ['simples_nacional'] });
    await carla.get('/tasks/home');
    const outubro = await createClient(ana, { tradeName: 'Nova Out', contractStartDate: '2026-10-15' });
    const novembro = await createClient(ana, { tradeName: 'Nova Nov', contractStartDate: '2026-11-05' });
    await carla.get('/tasks/home');
    expect((await occ(ws, das, outubro)).map((o) => [o.competence, o.due_date])).toEqual([
      ['2026-10', '2026-10-20'],
      ['2026-11', '2026-11-19'],
      ['2026-12', '2026-12-18'],
    ]);
    expect((await occ(ws, das, novembro)).map((o) => o.competence)).toEqual(['2026-11', '2026-12']);
    // Point of attention (documented rule, not a defect): the ISS of October (due 09/10, before the
    // contract started on 15/10) is generated too and is born overdue.
    const issOct = (await occ(ws, iss, outubro))[0]!;
    expect(issOct).toMatchObject({ competence: '2026-10', due_date: '2026-10-09', status: 'todo' });
  });
});

describe('qa-gestao: dia 31, fevereiro e anuais pela API', () => {
  it('dia 31 em fevereiro/2026: antecipa para 27/02, posterga para 02/03 sem mudar a competência; a auditoria mostra em fevereiro', async () => {
    const { ana, carla, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    const client = await createClient(ana, { tradeName: 'Fevereiro' });
    const base = { departmentId: fiscal, assigneeId: carla.userId, dueDay: 31, clientIds: [client], startCompetence: '2026-01', referenceOffset: 1 };
    const ant = await recurring(ana, { ...base, name: 'Antecipa' });
    const post = await recurring(ana, { ...base, name: 'Posterga', nonBusinessDayRule: 'postpone' });
    const keep = await recurring(ana, { ...base, name: 'Mantém', nonBusinessDayRule: 'keep' });
    expect((await ana.post('/tasks/recurring/generate', { competence: '2026-02' })).status).toBe(200);
    expect((await ana.post('/tasks/recurring/generate', { competence: '2026-04' })).status).toBe(200);
    const feb = async (id: string) => (await occ(ws, id)).find((o) => o.competence === '2026-02')!;
    expect(await feb(ant)).toMatchObject({ due_date: '2026-02-27', period_key: '2026-02', reference_month: '2026-01' });
    expect(await feb(post)).toMatchObject({ due_date: '2026-03-02', competence: '2026-02' });
    expect(await feb(keep)).toMatchObject({ due_date: '2026-02-28' });
    expect((await occ(ws, ant)).find((o) => o.competence === '2026-04')).toMatchObject({ due_date: '2026-04-30' });
    const audit = (await carla.get('/tasks/audit?competence=2026-02')).body;
    expect(audit.columns.map((c: any) => c.name).sort()).toEqual(['Antecipa', 'Mantém', 'Posterga']);
  });

  it('ano bissexto: fevereiro/2028 tem o dia 29 (terça de Carnaval: antecipa para sexta 25)', async () => {
    process.env.EFFINANCE_TODAY = '2028-01-17';
    const { ana, carla, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    const client = await createClient(ana, { tradeName: 'Bissexto' });
    const id = await recurring(ana, { name: 'Dia 29', departmentId: fiscal, assigneeId: carla.userId, dueDay: 29, nonBusinessDayRule: 'keep', clientIds: [client] });
    const id2 = await recurring(ana, { name: 'Dia 31', departmentId: fiscal, assigneeId: carla.userId, dueDay: 31, clientIds: [client] });
    await carla.get('/tasks/home');
    expect((await occ(ws, id)).find((o) => o.competence === '2028-02')).toMatchObject({ due_date: '2028-02-29' });
    expect((await occ(ws, id2)).find((o) => o.competence === '2028-02')).toMatchObject({ due_date: '2028-02-25' });
  });

  it('anual (DEFIS 31/03, ref. 12 do ano anterior) só existe em março; o detalhe por período responde 404 fora dele', async () => {
    const { ana, carla, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    await createClient(ana, { tradeName: 'Simples' });
    const defis = await recurring(ana, {
      name: 'DEFIS',
      departmentId: fiscal,
      assigneeId: carla.userId,
      period: 'annual',
      dueMonth: 3,
      dueDay: 31,
      targetDaysBefore: 10,
      referenceOffset: 3,
      regimes: ['simples_nacional'],
      startCompetence: '2026-01',
    });
    await carla.get('/tasks/home');
    expect(await occ(ws, defis)).toEqual([]);
    expect((await ana.post('/tasks/recurring/generate', { competence: '2026-03' })).status).toBe(200);
    expect((await occ(ws, defis)).map((o) => [o.competence, o.due_date, o.target_date, o.reference_month])).toEqual([['2026-03', '2026-03-31', '2026-03-20', '2025-12']]);
    expect((await carla.get(`/tasks/recurring/${defis}/occurrences/2026-04`)).status).toBe(404);
  });

  it('limites da geração: de 24 competências atrás a 2 à frente (fora disso 422)', async () => {
    const { ana } = await office(app);
    expect((await ana.post('/tasks/recurring/generate', { competence: '2026-12' })).status).toBe(200);
    expect((await ana.post('/tasks/recurring/generate', { competence: '2027-01' })).status).toBe(422);
    expect((await ana.post('/tasks/recurring/generate', { competence: '2024-10' })).status).toBe(200);
    expect((await ana.post('/tasks/recurring/generate', { competence: '2024-09' })).status).toBe(422);
  });
});

describe('qa-gestao: idempotência', () => {
  it('leituras e gerações em paralelo logo depois de uma mudança que invalida as marcas não duplicam nada', async () => {
    const { ana, bruno, carla, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    const clients = await Promise.all([1, 2, 3].map((n) => createClient(ana, { tradeName: `Paralelo ${n}` })));
    const das = await recurring(ana, { name: 'DAS', departmentId: fiscal, assigneeId: carla.userId, dueDay: 20, regimes: ['simples_nacional'] });
    const weekly = await recurring(ana, { name: 'Extratos', departmentId: fiscal, assigneeId: carla.userId, period: 'weekly', dueDay: 5, regimes: ['simples_nacional'] });
    // A new client of the regime bumps the generation version: every read below wants to generate.
    const late = await createClient(ana, { tradeName: 'Chegou agora' });
    const results = await Promise.all([
      carla.get('/tasks/home'),
      bruno.get('/tasks'),
      ana.get('/tasks/audit?competence=2026-11'),
      ana.post('/tasks/recurring/generate', { competence: '2026-11' }),
      ana.post('/tasks/recurring/generate', { competence: '2026-11' }),
      ana.get('/tasks/dashboard'),
      carla.get('/tasks/home'),
      ana.get('/tasks/recurring'),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200, 200, 200]);
    expect(await duplicates(ws)).toEqual([{ n: 0 }]);
    // 4 clients × (Oct, Nov, Dec) for the monthly; weekly: 5 Fridays in Oct, 4 in Nov, 4 in Dec.
    expect(await occ(ws, das)).toHaveLength(4 * 3);
    expect(await occ(ws, weekly)).toHaveLength(4 * (5 + 4 + 4));
    expect((await occ(ws, das, late)).map((o) => o.competence)).toEqual(['2026-10', '2026-11', '2026-12']);
    // Each occurrence was recorded as "created" once.
    const created = await rows<{ n: number }>(sql`
      select count(*)::int as n from task_events e join tasks t on t.id = e.task_id
       where t.workspace_id = ${ws} and t.recurring_task_id = ${das} and e.kind = 'created'`);
    expect(created).toEqual([{ n: 12 }]);
    // Generating again, editing the same values twice: nothing new.
    expect((await ana.post('/tasks/recurring/generate', { competence: '2026-11' })).body).toMatchObject({ created: 0 });
    const body = { name: 'DAS', departmentId: fiscal, assigneeId: carla.userId, dueDay: 20, regimes: ['simples_nacional'] };
    await Promise.all([ana.put(`/tasks/recurring/${das}`, body), ana.put(`/tasks/recurring/${das}`, body)]);
    expect(await occ(ws, das)).toHaveLength(12);
    expect(await duplicates(ws)).toEqual([{ n: 0 }]);
    expect(clients).toHaveLength(3);
  });
});
