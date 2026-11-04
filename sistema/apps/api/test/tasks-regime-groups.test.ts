// Default groups of recurring tasks per tax regime: listing (catalog items with what the office already
// has, the regime's recurring tasks and clients) and applying (creates what is missing, idempotent by the
// catalog key; a common obligation gains the regime instead of a twin), only for `registry`. The recurring
// tasks of the regime then generate for every active client of it, new clients included.
// Today is pinned to 2026-10-20.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { regimeGroupItems } from '@effinance/shared';
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
});
