// Default groups of recurring tasks per tax regime: listing (catalog items with what the office already
// has, the regime's recurring tasks and clients) and applying (creates what is missing, idempotent by the
// catalog key; a common obligation gains the regime instead of a twin), only for `registry`. The recurring
// tasks of the regime then generate for every active client of it, new clients included.
// Today is pinned to 2026-10-20.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { occurrencesInCompetence, regimeGroupItems, type RegimeGroupRegime } from '@effinance/shared';
import type { App } from '../src/app';
import { executeRows } from '../src/lib/sql';
import { admin, createTestApp, registerUser, resetDb } from './helpers';
import { createClient, office, workspaceOf } from './task-helpers';

let app: App;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
});

const rows = <T>(query: ReturnType<typeof sql>) => executeRows<T>(admin(), query);

describe('regime groups', () => {
  it('lists the groups with the regime clients, applies the missing items once and reuses common obligations', async () => {
    const { ana, carla, fiscal, pessoal } = await office(app);
    const ws = await workspaceOf(ana);
    const padaria = await createClient(ana, { tradeName: 'Padaria' });
    await createClient(ana, { tradeName: 'Clínica' });
    const construtora = await createClient(ana, { tradeName: 'Construtora', taxRegime: 'presumed_profit' });
    // A recurring task made by hand for the regime shows up among the regime's recurring tasks.
    const handmade = await ana.post('/tasks/recurring', { name: 'Conferência de notas', departmentId: fiscal, dueDay: 10, regimes: ['simples_nacional'] });
    expect(handmade.status).toBe(201);

    const listed = await carla.get('/tasks/regime-groups');
    expect(listed.status).toBe(200);
    expect(listed.body.usesDepartments).toBe(true);
    expect(listed.body.groups.map((g: any) => g.regime)).toEqual(['simples_nacional', 'mei', 'presumed_profit', 'real_profit']);
    const simples = listed.body.groups[0];
    expect(simples).toMatchObject({ label: 'Simples Nacional', clientCount: 2, missing: regimeGroupItems('simples_nacional').length });
    expect(simples.recurring).toEqual([expect.objectContaining({ id: handmade.body.id, name: 'Conferência de notas', catalogKey: null, active: true })]);
    const das = simples.items.find((i: any) => i.key === 'pgdas_das');
    expect(das).toMatchObject({
      name: 'PGDAS-D e DAS',
      period: 'monthly',
      dueDay: 20,
      nonBusinessDayRule: 'postpone',
      department: { key: 'fiscal', name: 'Fiscal', match: { id: fiscal, name: 'Fiscal' } },
      recurringTask: null,
      applied: false,
    });
    // "Pessoal" matches the personnel suggestion; there is no accounting department yet.
    expect(simples.items.find((i: any) => i.key === 'payroll').department.match).toEqual({ id: pessoal, name: 'Pessoal' });
    expect(listed.body.groups[2].items.find((i: any) => i.key === 'ecd').department).toEqual({ key: 'accounting', name: 'Contábil', match: null });

    // Only administrators (registry) apply; another workspace's department is not found.
    expect((await carla.post('/tasks/regime-groups/simples_nacional/apply', {})).status).toBe(403);
    expect((await ana.post('/tasks/regime-groups/exempt/apply', {})).status).toBe(400);
    const other = await registerUser(app, 'Outro Escritório');
    const foreignDept = (await other.post('/tasks/departments', { name: 'Fiscal' })).body.id;
    expect((await ana.post('/tasks/regime-groups/simples_nacional/apply', { departments: { fiscal: foreignDept } })).status).toBe(404);

    const applied = await ana.post('/tasks/regime-groups/simples_nacional/apply', {});
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    expect(applied.body).toMatchObject({ regime: 'simples_nacional', created: regimeGroupItems('simples_nacional').length, regimeAdded: 0, unchanged: 0, departmentsCreated: [] });
    const created = await rows<{ id: string; catalog_key: string; regimes: string[]; department_id: string; default_assignee_id: string | null }>(sql`
      select id, catalog_key, regimes, department_id, default_assignee_id from recurring_tasks where workspace_id = ${ws} and catalog_key is not null order by catalog_key`);
    expect(created.map((r) => r.catalog_key).sort()).toEqual(regimeGroupItems('simples_nacional').map((i) => i.key).sort());
    expect(created.find((r) => r.catalog_key === 'pgdas_das')).toMatchObject({ regimes: ['simples_nacional'], department_id: fiscal, default_assignee_id: null });
    expect(created.find((r) => r.catalog_key === 'fgts_digital')!.department_id).toBe(pessoal);
    // The occurrences were generated for each Simples client (department queue: no default responsible).
    const dasId = created.find((r) => r.catalog_key === 'pgdas_das')!.id;
    const dasOccurrences = await rows<{ client_id: string; assignee_id: string | null }>(sql`
      select client_id, assignee_id from tasks where workspace_id = ${ws} and recurring_task_id = ${dasId} and competence = '2026-10'`);
    expect(dasOccurrences).toHaveLength(2);
    expect(dasOccurrences.every((o) => o.assignee_id === null)).toBe(true);
    expect(dasOccurrences.map((o) => o.client_id)).toContain(padaria);

    // Applying again changes nothing.
    const again = await ana.post('/tasks/regime-groups/simples_nacional/apply', {});
    expect(again.body).toMatchObject({ created: 0, regimeAdded: 0, unchanged: regimeGroupItems('simples_nacional').length });
    expect((await rows(sql`select id from recurring_tasks where workspace_id = ${ws} and catalog_key is not null`)).length).toBe(created.length);

    // Lucro Presumido: the common obligations gain the regime; the accounting department is created.
    const presumed = await ana.post('/tasks/regime-groups/presumed_profit/apply', {});
    expect(presumed.status, JSON.stringify(presumed.body)).toBe(200);
    expect(presumed.body.regimeAdded).toBe(5);
    expect(presumed.body.created).toBe(regimeGroupItems('presumed_profit').length - 5);
    expect(presumed.body.departmentsCreated).toEqual([{ id: expect.any(String), name: 'Contábil' }]);
    const fgts = (await rows<{ regimes: string[] }>(sql`select regimes from recurring_tasks where workspace_id = ${ws} and catalog_key = 'fgts_digital'`))[0]!;
    expect(fgts.regimes).toEqual(['simples_nacional', 'presumed_profit']);
    const fgtsOccurrences = await rows<{ client_id: string }>(sql`
      select t.client_id from tasks t join recurring_tasks r on r.workspace_id = t.workspace_id and r.id = t.recurring_task_id
       where t.workspace_id = ${ws} and r.catalog_key = 'fgts_digital' and t.competence = '2026-10'`);
    expect(fgtsOccurrences.map((o) => o.client_id)).toContain(construtora);

    const after = (await carla.get('/tasks/regime-groups')).body;
    expect(after.groups[0].missing).toBe(0);
    expect(after.groups[2].missing).toBe(0);
    expect(after.groups[2].items.every((i: any) => i.applied)).toBe(true);
    expect(after.groups[0].recurring.length).toBe(regimeGroupItems('simples_nacional').length + 1);
  });

  it('applies chosen items to the chosen departments; an ended recurring task is reported, not reopened', async () => {
    const { ana, fiscal, pessoal } = await office(app);
    const ws = await workspaceOf(ana);
    await createClient(ana, { tradeName: 'MEI do João', taxRegime: 'mei' });
    const res = await ana.post('/tasks/regime-groups/mei/apply', { keys: ['das_mei'], departments: { fiscal: pessoal } });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items).toEqual([{ key: 'das_mei', recurringTaskId: expect.any(String), name: 'DAS-MEI', result: 'created' }]);
    const [row] = await rows<{ department_id: string }>(sql`select department_id from recurring_tasks where workspace_id = ${ws} and catalog_key = 'das_mei'`);
    expect(row!.department_id).toBe(pessoal);
    void fiscal;

    // Ended before the current competence: applying reports it and leaves it ended.
    const id = res.body.items[0].recurringTaskId;
    await admin().execute(sql`update recurring_tasks set start_competence = '2026-01', end_competence = '2026-09' where id = ${id}`);
    const again = await ana.post('/tasks/regime-groups/mei/apply', {});
    expect(again.body.items.find((i: any) => i.key === 'das_mei')).toMatchObject({ result: 'ended' });
    expect(again.body).toMatchObject({ created: 1, ended: 1 });
  });

  it('a recurring task made by hand with the same name (active, same regime) is not duplicated unless forced', async () => {
    const { ana, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    await createClient(ana, { tradeName: 'MEI do João', taxRegime: 'mei' });
    // Made by hand before the catalog: "das mei" (case, accents and punctuation do not matter).
    const handmade = await ana.post('/tasks/recurring', { name: 'das mei', departmentId: fiscal, dueDay: 20, regimes: ['mei'] });
    expect(handmade.status).toBe(201);
    // Same name but ended, or of another regime: does not count.
    await ana.post('/tasks/recurring', { name: 'DASN-SIMEI', departmentId: fiscal, dueDay: 31, dueMonth: 5, period: 'annual', regimes: ['simples_nacional'] });

    const listed = (await ana.get('/tasks/regime-groups')).body.groups.find((g: any) => g.regime === 'mei');
    const dasMei = listed.items.find((i: any) => i.key === 'das_mei');
    expect(dasMei).toMatchObject({ state: 'handmade', applied: false, recurringTask: null, handmade: { id: handmade.body.id, name: 'das mei', catalogKey: null } });
    expect(listed.items.find((i: any) => i.key === 'dasn_simei')).toMatchObject({ state: 'missing', handmade: null });
    expect(listed.missing).toBe(1);

    const applied = await ana.post('/tasks/regime-groups/mei/apply', {});
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    expect(applied.body).toMatchObject({ created: 1, skipped: [{ key: 'das_mei', name: 'DAS-MEI', reason: 'handmade', existing: { id: handmade.body.id, name: 'das mei' } }] });
    expect(applied.body.items.map((i: any) => i.key)).toEqual(['dasn_simei']);
    const names = async () =>
      (await rows<{ name: string }>(sql`select name from recurring_tasks where workspace_id = ${ws} and 'mei' = any(regimes) order by lower(name)`)).map((r) => r.name);
    expect(await names()).toEqual(['das mei', 'DASN-SIMEI']);
    // Applying again: still skipped, nothing new.
    expect((await ana.post('/tasks/regime-groups/mei/apply', {})).body).toMatchObject({ created: 0, unchanged: 1, skipped: [{ key: 'das_mei' }] });

    // Forced: created even so.
    const forced = await ana.post('/tasks/regime-groups/mei/apply', { force: ['das_mei'] });
    expect(forced.body).toMatchObject({ created: 1, skipped: [] });
    expect(await names()).toEqual(['das mei', 'DAS-MEI', 'DASN-SIMEI']);
    const after = (await ana.get('/tasks/regime-groups')).body.groups.find((g: any) => g.regime === 'mei');
    expect(after.items.find((i: any) => i.key === 'das_mei')).toMatchObject({ state: 'applied', applied: true });
  });

  it('an office without departments gets recurring tasks without one', async () => {
    const ana = await registerUser(app, 'Ana Sem Departamentos');
    const ws = await workspaceOf(ana);
    await createClient(ana, { tradeName: 'Padaria' });
    expect((await ana.get('/tasks/regime-groups')).body.usesDepartments).toBe(false);
    const res = await ana.post('/tasks/regime-groups/simples_nacional/apply', {});
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.departmentsCreated).toEqual([]);
    const created = await rows<{ department_id: string | null }>(sql`select department_id from recurring_tasks where workspace_id = ${ws}`);
    expect(created.every((r) => r.department_id === null)).toBe(true);
  });

  it('warns how many occurrences of the current month are born overdue and can start next month (QA #4)', async () => {
    const ana = await registerUser(app, 'Ana Meio do Mês');
    const ws = await workspaceOf(ana);
    await createClient(ana, { tradeName: 'Construtora', taxRegime: 'presumed_profit' });
    await createClient(ana, { tradeName: 'Padaria' });
    await createClient(ana, { tradeName: 'Clínica' });
    // Per client: occurrences of October whose legal deadline is before today (20/10).
    const overdue = (key: string) => {
      const item = regimeGroupItems('presumed_profit').concat(regimeGroupItems('simples_nacional')).find((i) => i.key === key)!;
      return occurrencesInCompetence(item, '2026-10').filter((o) => o.legalDueDate < '2026-10-20').length;
    };
    const group = async (regime: RegimeGroupRegime) =>
      (await ana.get('/tasks/regime-groups')).body.groups.find((g: any) => g.regime === regime);

    const presumed = await group('presumed_profit');
    expect(presumed.items.map((i: any) => i.currentOverdue)).toEqual(presumed.items.map((i: any) => overdue(i.key)));
    expect(presumed.currentMonthOverdue).toBe(presumed.items.reduce((a: number, i: any) => a + i.currentOverdue, 0));
    expect(presumed.currentMonthOverdue).toBeGreaterThan(0);

    // From the current month (default): the overdue occurrences are created and counted.
    const now = await ana.post('/tasks/regime-groups/presumed_profit/apply', {});
    expect(now.status, JSON.stringify(now.body)).toBe(200);
    expect(now.body).toMatchObject({ fromMonth: 'current', startCompetence: '2026-10', overdueCreated: presumed.currentMonthOverdue });
    const [born] = await rows<{ n: number }>(sql`
      select count(*)::int as n from tasks where workspace_id = ${ws} and competence = '2026-10' and due_date < '2026-10-20' and status = 'todo'`);
    expect(born!.n).toBe(presumed.currentMonthOverdue);
    expect((await group('presumed_profit')).currentMonthOverdue).toBe(0); // nothing missing anymore

    // From next month: the new recurring tasks start in November; the common ones (regimeAdded) already
    // run in October, so their overdue occurrences for the 2 Simples clients are still reported.
    const simples = await group('simples_nacional');
    expect(simples.currentMonthOverdue).toBe(simples.items.filter((i: any) => i.state === 'missing').reduce((a: number, i: any) => a + i.currentOverdue * 2, 0));
    const next = await ana.post('/tasks/regime-groups/simples_nacional/apply', { fromMonth: 'next' });
    expect(next.status, JSON.stringify(next.body)).toBe(200);
    const created = next.body.items.filter((i: any) => i.result === 'created');
    const added = next.body.items.filter((i: any) => i.result === 'regimeAdded');
    expect(created.length).toBeGreaterThan(0);
    expect(next.body).toMatchObject({
      fromMonth: 'next',
      startCompetence: '2026-11',
      overdueCreated: added.reduce((a: number, i: any) => a + overdue(i.key) * 2, 0),
    });
    const ids = created.map((i: any) => i.recurringTaskId);
    const byCompetence = await rows<{ competence: string; start: string }>(sql`
      select t.competence, r.start_competence as start from recurring_tasks r left join tasks t on t.recurring_task_id = r.id
      where r.workspace_id = ${ws} and r.id in ${sql.raw(`('${ids.join("','")}')`)}`);
    expect(new Set(byCompetence.map((r) => r.start))).toEqual(new Set(['2026-11']));
    expect(byCompetence.some((r) => r.competence === '2026-10')).toBe(false);

    expect((await ana.post('/tasks/regime-groups/mei/apply', { fromMonth: 'later' })).status).toBe(400);
  });
});

// The office edits its groups: catalog items removed (recorded, never recreated by applying, restorable)
// and own tasks included/excluded through the recurring task's regimes; the open occurrences follow the
// edit rule (from the current competence on, "A fazer" ones canceled/generated). Only `registry`.
describe('editing regime groups (include / exclude / restore)', () => {
  const groupOf = async (c: { get: (url: string) => Promise<any> }, regime: RegimeGroupRegime) =>
    (await c.get('/tasks/regime-groups')).body.groups.find((g: any) => g.regime === regime);
  const occurrences = (id: string) =>
    rows<{ client_id: string; status: string }>(sql`select client_id, status from tasks where recurring_task_id = ${id} and competence = '2026-10' order by client_id`);
  const recurringRow = async (id: string) =>
    (await rows<{ regimes: string[]; end_competence: string | null }>(sql`select regimes, end_competence from recurring_tasks where id = ${id}`))[0]!;
  const actions = async (ws: string) =>
    (await rows<{ action: string; entity_id: string | null; metadata: any }>(sql`
      select action, entity_id, metadata from audit_logs where workspace_id = ${ws} and action like 'regime_group.%' order by created_at, id`));

  it('removes a catalog item not applied: listed apart, not missing, not recreated by applying; restoring brings it back', async () => {
    const { ana, carla } = await office(app);
    const ws = await workspaceOf(ana);
    await createClient(ana, { tradeName: 'Padaria' });
    const total = regimeGroupItems('simples_nacional').length;

    const res = await ana.post('/tasks/regime-groups/simples_nacional/exclude', { key: 'pgdas_das' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ regime: 'simples_nacional', key: 'pgdas_das', excluded: true, change: 'none', recurringTask: null });
    // Excluding again changes nothing.
    expect((await ana.post('/tasks/regime-groups/simples_nacional/exclude', { key: 'pgdas_das' })).body).toMatchObject({ excluded: true, change: 'none' });

    const listed = await groupOf(carla, 'simples_nacional');
    expect(listed.items.map((i: any) => i.key)).not.toContain('pgdas_das');
    expect(listed.missing).toBe(total - 1);
    expect(listed.excluded).toEqual([
      expect.objectContaining({ key: 'pgdas_das', name: 'PGDAS-D e DAS', dueDay: 20, department: { key: 'fiscal', name: 'Fiscal' }, recurringTask: null, excludedAt: expect.any(String) }),
    ]);
    // Other regimes' groups are not affected.
    expect((await groupOf(carla, 'mei')).excluded).toEqual([]);

    // Applying the group (all of it, or the removed key alone) does not recreate it.
    const applied = await ana.post('/tasks/regime-groups/simples_nacional/apply', {});
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    expect(applied.body.created).toBe(total - 1);
    expect(applied.body.items.map((i: any) => i.key)).not.toContain('pgdas_das');
    expect((await ana.post('/tasks/regime-groups/simples_nacional/apply', { keys: ['pgdas_das'] })).status).toBe(422);
    expect(await rows(sql`select id from recurring_tasks where workspace_id = ${ws} and catalog_key = 'pgdas_das'`)).toEqual([]);
    expect((await groupOf(carla, 'simples_nacional')).missing).toBe(0);

    // Restoring: back as missing; applying now creates it.
    const restored = await ana.post('/tasks/regime-groups/simples_nacional/restore', { key: 'pgdas_das' });
    expect(restored.body).toEqual({ regime: 'simples_nacional', key: 'pgdas_das', excluded: false, change: 'none', recurringTask: null });
    const back = await groupOf(carla, 'simples_nacional');
    expect(back.excluded).toEqual([]);
    expect(back.missing).toBe(1);
    expect(back.items.find((i: any) => i.key === 'pgdas_das')).toMatchObject({ state: 'missing' });
    expect((await ana.post('/tasks/regime-groups/simples_nacional/apply', {})).body.created).toBe(1);

    expect((await actions(ws)).map((a) => a.action)).toEqual(['regime_group.excluded', 'regime_group.excluded', 'regime_group.restored']);
    expect((await actions(ws))[0]!.metadata).toEqual({ regime: 'simples_nacional', key: 'pgdas_das', change: 'none', excluded: true });

    // Validation: a key of another group (422), both or none of key/recurringTaskId, an unknown key (400).
    expect((await ana.post('/tasks/regime-groups/simples_nacional/exclude', { key: 'das_mei' })).status).toBe(422);
    expect((await ana.post('/tasks/regime-groups/simples_nacional/restore', { key: 'das_mei' })).status).toBe(422);
    expect((await ana.post('/tasks/regime-groups/simples_nacional/restore', { key: 'nope' })).status).toBe(400);
    expect((await ana.post('/tasks/regime-groups/simples_nacional/exclude', {})).status).toBe(400);
    const anyId = applied.body.items[0].recurringTaskId;
    expect((await ana.post('/tasks/regime-groups/simples_nacional/exclude', { key: 'payroll', recurringTaskId: anyId })).status).toBe(400);
  });

  it('removes an applied catalog item: the regime leaves its recurring task (ended when none is left), open occurrences canceled', async () => {
    const { ana } = await office(app);
    const ws = await workspaceOf(ana);
    const padaria = await createClient(ana, { tradeName: 'Padaria' });
    const construtora = await createClient(ana, { tradeName: 'Construtora', taxRegime: 'presumed_profit' });
    expect((await ana.post('/tasks/regime-groups/simples_nacional/apply', {})).status).toBe(200);
    expect((await ana.post('/tasks/regime-groups/presumed_profit/apply', {})).status).toBe(200);
    const idOf = async (key: string) => (await rows<{ id: string }>(sql`select id from recurring_tasks where workspace_id = ${ws} and catalog_key = ${key}`))[0]!.id;
    const payroll = await idOf('payroll');
    const das = await idOf('pgdas_das');
    expect((await occurrences(payroll)).map((o) => o.status)).toEqual(['todo', 'todo']);

    // A common obligation keeps the other regime: only the Simples client's open occurrence is canceled.
    const res = await ana.post('/tasks/regime-groups/simples_nacional/exclude', { key: 'payroll' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ key: 'payroll', excluded: true, change: 'regimeRemoved', recurringTask: { id: payroll, regimes: ['presumed_profit'], active: true } });
    expect(await recurringRow(payroll)).toEqual({ regimes: ['presumed_profit'], end_competence: null });
    const byClient = new Map((await occurrences(payroll)).map((o) => [o.client_id, o.status]));
    expect(byClient.get(padaria)).toBe('canceled');
    expect(byClient.get(construtora)).toBe('todo');

    // Only regime of the item (by its recurring task's id): ended from the current competence on.
    const ended = await ana.post('/tasks/regime-groups/simples_nacional/exclude', { recurringTaskId: das });
    expect(ended.body).toMatchObject({ key: 'pgdas_das', excluded: true, change: 'ended' });
    expect(await recurringRow(das)).toEqual({ regimes: [], end_competence: '2026-10' });
    expect((await occurrences(das)).map((o) => o.status)).toEqual(['canceled']);

    const simples = await groupOf(ana, 'simples_nacional');
    expect(simples.excluded.map((i: any) => i.key).sort()).toEqual(['payroll', 'pgdas_das']);
    expect(simples.missing).toBe(0);
    // Applying again neither recreates nor gives the regime back.
    const again = await ana.post('/tasks/regime-groups/simples_nacional/apply', {});
    expect(again.body).toMatchObject({ created: 0, regimeAdded: 0 });
    expect(again.body.items.map((i: any) => i.key)).not.toContain('payroll');
    expect((await recurringRow(payroll)).regimes).toEqual(['presumed_profit']);

    // Including the recurring task back undoes the removal and the Simples client gets its occurrence again.
    const included = await ana.post('/tasks/regime-groups/simples_nacional/include', { recurringTaskId: payroll });
    expect(included.body).toMatchObject({ key: 'payroll', excluded: false, change: 'regimeAdded' });
    expect(new Map((await occurrences(payroll)).map((o) => [o.client_id, o.status])).get(padaria)).toBe('todo');
    expect((await groupOf(ana, 'simples_nacional')).excluded.map((i: any) => i.key)).toEqual(['pgdas_das']);
  });

  it('includes an existing own task in another regime and excludes own tasks (2 regimes → regime removed, 1 → ended)', async () => {
    const { ana, pessoal, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    const mei = await createClient(ana, { tradeName: 'MEI do João', taxRegime: 'mei' });
    const padaria = await createClient(ana, { tradeName: 'Padaria' });
    // A new task of the regime is a plain recurring task of the registry (POST /tasks/recurring).
    const folha = await ana.post('/tasks/recurring', { name: 'Folha própria', departmentId: pessoal, dueDay: 25, regimes: ['simples_nacional'] });
    expect(folha.status).toBe(201);
    expect((await groupOf(ana, 'simples_nacional')).own).toEqual([
      expect.objectContaining({ id: folha.body.id, name: 'Folha própria', dueDay: 25, period: 'monthly', department: { id: pessoal, name: 'Pessoal' }, catalogKey: null }),
    ]);
    expect((await groupOf(ana, 'mei')).own).toEqual([]);

    const res = await ana.post('/tasks/regime-groups/mei/include', { recurringTaskId: folha.body.id });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ regime: 'mei', key: null, excluded: false, change: 'regimeAdded', recurringTask: { id: folha.body.id, regimes: ['simples_nacional', 'mei'] } });
    expect((await occurrences(folha.body.id)).map((o) => o.client_id).sort()).toEqual([mei, padaria].sort());
    expect((await groupOf(ana, 'mei')).own.map((t: any) => t.id)).toEqual([folha.body.id]);
    expect((await ana.post('/tasks/regime-groups/mei/include', { recurringTaskId: folha.body.id })).body.change).toBe('none');

    // Two regimes: only this one leaves; the MEI client's open occurrence is canceled.
    const out = await ana.post('/tasks/regime-groups/mei/exclude', { recurringTaskId: folha.body.id });
    expect(out.body).toMatchObject({ key: null, excluded: false, change: 'regimeRemoved' });
    expect(await recurringRow(folha.body.id)).toEqual({ regimes: ['simples_nacional'], end_competence: null });
    expect(new Map((await occurrences(folha.body.id)).map((o) => [o.client_id, o.status]))).toEqual(new Map([[mei, 'canceled'], [padaria, 'todo']]));
    expect(await rows(sql`select 1 from regime_group_exclusions where workspace_id = ${ws}`)).toEqual([]);

    // One regime: the recurring task ends ("Encerra em" = current competence) and leaves the group.
    const last = await ana.post('/tasks/regime-groups/simples_nacional/exclude', { recurringTaskId: folha.body.id });
    expect(last.body).toMatchObject({ change: 'ended', recurringTask: { regimes: [] } });
    expect(await recurringRow(folha.body.id)).toEqual({ regimes: [], end_competence: '2026-10' });
    expect((await groupOf(ana, 'simples_nacional')).own).toEqual([]);
    expect((await occurrences(folha.body.id)).every((o) => o.status === 'canceled')).toBe(true);

    // An ended recurring task is not included (reopen it first); a task's recurrence or unknown id: 404.
    await admin().execute(sql`update recurring_tasks set start_competence = '2026-01', end_competence = '2026-09' where id = ${folha.body.id}`);
    expect((await ana.post('/tasks/regime-groups/mei/include', { recurringTaskId: folha.body.id })).status).toBe(409);
    expect((await ana.post('/tasks/regime-groups/mei/include', { recurringTaskId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
    void fiscal;

    expect((await actions(ws)).map((a) => [a.action, a.entity_id, a.metadata.change])).toEqual([
      ['regime_group.included', folha.body.id, 'regimeAdded'],
      ['regime_group.included', folha.body.id, 'none'],
      ['regime_group.excluded', folha.body.id, 'regimeRemoved'],
      ['regime_group.excluded', folha.body.id, 'ended'],
    ]);
  });

  it('needs `registry` to edit (listing is for every member) and stays inside the office (RLS)', async () => {
    const { ana, carla, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    const own = await ana.post('/tasks/recurring', { name: 'Conferência', departmentId: fiscal, dueDay: 10, regimes: ['simples_nacional'] });
    expect((await carla.post('/tasks/regime-groups/simples_nacional/exclude', { key: 'pgdas_das' })).status).toBe(403);
    expect((await carla.post('/tasks/regime-groups/simples_nacional/restore', { key: 'pgdas_das' })).status).toBe(403);
    expect((await carla.post('/tasks/regime-groups/mei/include', { recurringTaskId: own.body.id })).status).toBe(403);
    expect((await carla.get('/tasks/regime-groups')).status).toBe(200);

    // Another office: its removals do not show here, and it cannot touch this office's recurring task.
    const other = await registerUser(app, 'Outro Escritório');
    const otherWs = await workspaceOf(other);
    expect((await other.post('/tasks/regime-groups/simples_nacional/exclude', { key: 'payroll' })).status).toBe(200);
    expect((await other.post('/tasks/regime-groups/mei/include', { recurringTaskId: own.body.id })).status).toBe(404);
    expect((await other.post('/tasks/regime-groups/simples_nacional/exclude', { recurringTaskId: own.body.id })).status).toBe(404);
    expect((await recurringRow(own.body.id)).regimes).toEqual(['simples_nacional']);
    expect((await groupOf(ana, 'simples_nacional')).excluded).toEqual([]);
    expect((await groupOf(other, 'simples_nacional')).excluded.map((i: any) => i.key)).toEqual(['payroll']);
    expect(await rows(sql`select workspace_id from regime_group_exclusions`)).toEqual([{ workspace_id: otherWs }]);

    // The RLS-bound role sees only the office in `app.workspace_id`; writing another office's row fails.
    const asApp = <T>(fn: (tx: Parameters<Parameters<ReturnType<typeof admin>['transaction']>[0]>[0]) => Promise<T>) =>
      admin().transaction(async (tx) => {
        await tx.execute(sql`select set_config('role', 'effinance_app', true), set_config('app.workspace_id', ${ws}, true)`);
        return fn(tx);
      });
    expect(await asApp((tx) => executeRows(tx, sql`select catalog_key from regime_group_exclusions`))).toEqual([]);
    const denied = await asApp((tx) =>
      tx.execute(sql`insert into regime_group_exclusions (workspace_id, regime, catalog_key) values (${otherWs}, 'mei', 'das_mei')`),
    ).then(
      () => null,
      (e: { cause?: { code?: string } }) => e.cause?.code,
    );
    expect(denied).toBe('42501'); // new row violates row-level security policy
  });
});
