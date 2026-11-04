// TEMPORARY probe (security audit): measures the cost of generation/sync with many clients. Deleted after.
import { sql } from 'drizzle-orm';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { admin, createTestApp, resetDb } from './helpers';
import { createClient, office, workspaceOf } from './task-helpers';

let app: App;
beforeAll(async () => {
  app = await createTestApp();
  await resetDb(app);
});
afterAll(async () => {
  await app.close();
});

const N = Number(process.env.PROBE_CLIENTS ?? 2000);

describe('probe', () => {
  it('measures', async () => {
    const { ana, carla, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    const first = await createClient(ana, { tradeName: 'Base' });
    await admin().execute(sql`
      insert into contacts (workspace_id, kind, status, name, trade_name, document, document_hash, tax_regime, simples_annex, contract_start_date, fee_due_day)
      select workspace_id, kind, status, name || ' ' || g, trade_name || ' ' || g, document, md5(random()::text || g), tax_regime, simples_annex, contract_start_date, fee_due_day
        from contacts, generate_series(1, ${N - 1}) g where id = ${first}`);
    let t = Date.now();
    const created = await ana.post('/tasks/recurring', {
      name: 'Semanal', departmentId: fiscal, dueDay: 3, period: 'weekly', regimes: ['simples_nacional'], assigneeId: ana.userId,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    console.log('create weekly recurring', Date.now() - t, 'ms');
    const [{ n }] = (await admin().execute(sql`select count(*)::int n from tasks where workspace_id = ${ws}`)) as unknown as [{ n: number }];
    console.log('occurrence rows', n);
    for (let i = 0; i < 3; i++) {
      t = Date.now();
      const list = await carla.get('/tasks');
      expect(list.status).toBe(200);
      console.log('GET /tasks (viewer)', Date.now() - t, 'ms');
    }
    t = Date.now();
    const home = await carla.get('/tasks/home');
    expect(home.status).toBe(200);
    console.log('GET /tasks/home (viewer)', Date.now() - t, 'ms');
    t = Date.now();
    const audit = await carla.get('/tasks/audit?competence=2026-10');
    expect(audit.status).toBe(200);
    console.log('GET /tasks/audit (viewer)', Date.now() - t, 'ms', 'bytes', audit.raw.body.length);
    const h = monitorEventLoopDelay({ resolution: 10 }); h.enable();
    t = Date.now();
    const upd = await ana.put(`/tasks/recurring/${created.body.id}`, {
      name: 'Semanal', departmentId: fiscal, dueDay: 3, period: 'weekly', regimes: ['simples_nacional'], assigneeId: carla.userId,
    });
    expect(upd.status, JSON.stringify(upd.body)).toBe(200);
    h.disable();
    console.log('PUT recurring (sync, assignee change)', Date.now() - t, 'ms', 'max loop block', Math.round(h.max / 1e6), 'ms');
    const h2 = monitorEventLoopDelay({ resolution: 10 }); h2.enable();
    t = Date.now();
    const back = await ana.put(`/tasks/recurring/${created.body.id}`, {
      name: 'Semanal', departmentId: fiscal, dueDay: 3, period: 'weekly', regimes: ['simples_nacional'], assigneeId: ana.userId,
    });
    expect(back.status).toBe(200);
    h2.disable();
    console.log('PUT recurring again', Date.now() - t, 'ms', 'max loop block', Math.round(h2.max / 1e6), 'ms');
  }, 600_000);
});
