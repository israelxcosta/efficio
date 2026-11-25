// QA (qa-logica-gestao): the default groups per tax regime generate, for each client, only the
// obligations of its regime (Simples, MEI, Lucro Presumido, Lucro Real, Imune/Isenta), with the catalog's
// deadlines moved off weekends and national holidays; applying twice changes nothing.
// Today is pinned to 2026-10-20 (Tuesday); 20/11/2026 (Friday) is a national holiday.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { executeRows } from '../src/lib/sql';
import { admin, createTestApp, resetDb } from './helpers';
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

type Occ = { key: string; competence: string; due_date: string; target_date: string; reference_month: string; status: string };
const byClient = (ws: string, clientId: string) =>
  rows<Occ>(sql`
    select r.catalog_key as key, t.competence, t.due_date::text, t.target_date::text, t.reference_month, t.status
      from tasks t join recurring_tasks r on r.id = t.recurring_task_id
     where t.workspace_id = ${ws} and t.client_id = ${clientId} order by t.competence, r.catalog_key`);

const COMMON = ['dctfweb', 'efd_reinf', 'esocial_periodic', 'fgts_digital', 'payroll'];

describe('qa-gestao: grupos padrão por regime', () => {
  it('cada cliente recebe só as obrigações do seu regime, com os prazos do catálogo; aplicar de novo não duplica', async () => {
    const { ana, carla } = await office(app);
    const ws = await workspaceOf(ana);
    const simples = await createClient(ana, { tradeName: 'Simples', taxRegime: 'simples_nacional' });
    const mei = await createClient(ana, { tradeName: 'MEI', taxRegime: 'mei' });
    const presumido = await createClient(ana, { tradeName: 'Presumido', taxRegime: 'presumed_profit' });
    const real = await createClient(ana, { tradeName: 'Real', taxRegime: 'real_profit' });
    const isenta = await createClient(ana, { tradeName: 'Associação', taxRegime: 'exempt' });

    const s = await ana.post('/tasks/regime-groups/simples_nacional/apply', {});
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    expect(s.body).toMatchObject({ created: 7, regimeAdded: 0 });
    const p = await ana.post('/tasks/regime-groups/presumed_profit/apply', {});
    expect(p.body).toMatchObject({ created: 6, regimeAdded: 5 });
    const m = await ana.post('/tasks/regime-groups/mei/apply', {});
    expect(m.body).toMatchObject({ created: 2, regimeAdded: 0 });
    await carla.get('/tasks/home');

    const keysIn = (list: Occ[], competence: string) => list.filter((o) => o.competence === competence).map((o) => o.key);
    const sOcc = await byClient(ws, simples);
    const pOcc = await byClient(ws, presumido);
    const mOcc = await byClient(ws, mei);
    expect(keysIn(sOcc, '2026-10')).toEqual([...COMMON, 'pgdas_das'].sort());
    expect(keysIn(pOcc, '2026-10')).toEqual([...COMMON, 'efd_contribuicoes', 'efd_icms_ipi', 'irpj_csll_quarterly', 'pis_cofins'].sort());
    // Quarterly IRPJ/CSLL only in Jan/Apr/Jul/Oct.
    expect(keysIn(pOcc, '2026-11')).not.toContain('irpj_csll_quarterly');
    expect(keysIn(mOcc, '2026-10')).toEqual(['das_mei']);
    // Lucro Real's group was not applied; Imune/Isenta has no group.
    expect(await byClient(ws, real)).toEqual([]);
    expect(await byClient(ws, isenta)).toEqual([]);
    // Annual ones (DEFIS in March, DASN-SIMEI in May, ECD/ECF in June/July) are not in Oct–Dec.
    expect([...sOcc, ...pOcc, ...mOcc].some((o) => ['defis', 'dasn_simei', 'ecd', 'ecf'].includes(o.key))).toBe(false);

    const one = (list: Occ[], key: string, competence: string) => list.find((o) => o.key === key && o.competence === competence)!;
    // PGDAS-D/DAS (postpones): 20/11 holiday → Monday 23; target 3 days before = 20 (holiday) → 19.
    expect(one(sOcc, 'pgdas_das', '2026-11')).toMatchObject({ due_date: '2026-11-23', target_date: '2026-11-19', reference_month: '2026-10' });
    expect(one(mOcc, 'das_mei', '2026-11')).toMatchObject({ due_date: '2026-11-23' });
    // FGTS Digital (anticipates): 20/11 → 19; target 16 (Monday).
    expect(one(sOcc, 'fgts_digital', '2026-11')).toMatchObject({ due_date: '2026-11-19', target_date: '2026-11-16' });
    // DCTFWeb: last business day (31/10 Saturday → 30), target 16 days before → 14.
    expect(one(sOcc, 'dctfweb', '2026-10')).toMatchObject({ due_date: '2026-10-30', target_date: '2026-10-14' });
    // Payroll on the 5th, postponed: 05/12 Saturday → Monday 07; target 2 days before (Saturday) → Friday 04.
    expect(one(pOcc, 'payroll', '2026-12')).toMatchObject({ due_date: '2026-12-07', target_date: '2026-12-04' });
    // eSocial on the 15th, anticipated: 15/11 Sunday (Proclamação) → Friday 13; target → Tuesday 10.
    expect(one(pOcc, 'esocial_periodic', '2026-11')).toMatchObject({ due_date: '2026-11-13', target_date: '2026-11-10' });
    // PIS/COFINS on the 25th; target 22 (Sunday) → 20 (holiday) → Thursday 19.
    expect(one(pOcc, 'pis_cofins', '2026-11')).toMatchObject({ due_date: '2026-11-25', target_date: '2026-11-19' });
    // EFD-Contribuições: reference two months back; IRPJ quarterly: 30/10, target 25 (Sunday) → 23, ref. 09.
    expect(one(pOcc, 'efd_contribuicoes', '2026-10')).toMatchObject({ due_date: '2026-10-14', reference_month: '2026-08' });
    expect(one(pOcc, 'irpj_csll_quarterly', '2026-10')).toMatchObject({ due_date: '2026-10-30', target_date: '2026-10-23', reference_month: '2026-09' });

    // Applying again: nothing created, nothing duplicated.
    const total = async () => (await rows<{ n: number }>(sql`select count(*)::int as n from tasks where workspace_id = ${ws}`))[0]!.n;
    const before = await total();
    const again = await ana.post('/tasks/regime-groups/simples_nacional/apply', {});
    expect(again.body).toMatchObject({ created: 0, regimeAdded: 0, unchanged: 7 });
    expect((await ana.post('/tasks/regime-groups/presumed_profit/apply', {})).body).toMatchObject({ created: 0, regimeAdded: 0 });
    await carla.get('/tasks/home');
    expect(await total()).toBe(before);
    const recurringCount = await rows<{ n: number }>(sql`select count(*)::int as n from recurring_tasks where workspace_id = ${ws}`);
    expect(recurringCount).toEqual([{ n: 15 }]);
  });
});
