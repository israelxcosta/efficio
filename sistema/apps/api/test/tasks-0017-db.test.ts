// Database side of migrations 0017 and 0018:
// - 0017 removes the responsible per client and department: the table is gone, and the occurrences that
//   came from it (`assignee_source = 'client'`) follow the default responsible when not started and from
//   the current competence on, or keep the person as assigned by hand; re-runnable.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
});

const rows = <T>(query: ReturnType<typeof sql>) => executeRows<T>(admin(), query);

async function runMigration(name: string) {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), `../drizzle/${name}`);
  const source = await readFile(file, 'utf8');
  await admin().transaction(async (tx) => {
    for (const statement of source.split('--> statement-breakpoint')) if (statement.trim()) await tx.execute(sql.raw(statement));
  });
}

describe('migration 0017: no responsible per client and department', () => {
  it('the table is gone and the occurrence CHECK no longer accepts the client source', async () => {
    const [table] = await rows<{ ok: boolean }>(sql`select to_regclass('public.task_client_responsibles') is null as ok`);
    expect(table!.ok).toBe(true);
    const [check] = await rows<{ def: string }>(sql`
      select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'tasks_occurrence_chk'`);
    expect(check!.def).toContain("'manual'");
    expect(check!.def).not.toContain("'client'");
  });

  it('legacy occurrences: not started ahead follow the default responsible; the rest stay with the person, by hand', async () => {
    const { ana, carla, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    const client = await createClient(ana, { tradeName: 'Padaria' });
    const created = await ana.post('/tasks/recurring', { name: 'DAS', departmentId: fiscal, assigneeId: ana.userId, dueDay: 20, regimes: ['simples_nacional'] });
    expect(created.status).toBe(201);
    const noDefault = await ana.post('/tasks/recurring', { name: 'DCTFWeb', departmentId: fiscal, dueDay: 15, regimes: ['simples_nacional'] });
    expect(noDefault.status).toBe(201);
    const occurrences = await rows<{ id: string; recurring_task_id: string; competence: string }>(sql`
      select id, recurring_task_id, competence from tasks where workspace_id = ${ws} and client_id = ${client} order by recurring_task_id, competence`);
    const das = occurrences.filter((o) => o.recurring_task_id === created.body.id);
    const dctf = occurrences.filter((o) => o.recurring_task_id === noDefault.body.id);
    // Rows as before 0017: Carla came from the "carteira". Competences far from today on purpose (the
    // migration uses the database clock): one ahead and not started, one ahead and done, one in the past.
    const ahead = das[0]!.id;
    const aheadDone = das[1]!.id;
    const past = das[2]!.id;
    const aheadNoDefault = dctf[0]!.id;
    await admin().transaction(async (tx) => {
      await tx.execute(sql`alter table tasks drop constraint tasks_occurrence_chk`);
      await tx.execute(sql`update tasks set assignee_id = ${carla.userId}, assignee_source = 'client', competence = '2999-12' where id in (${ahead}, ${aheadDone}, ${aheadNoDefault})`);
      await tx.execute(sql`update tasks set status = 'done', completed_at = now(), completed_by_name = 'Carla Souza' where id = ${aheadDone}`);
      await tx.execute(sql`update tasks set assignee_id = ${carla.userId}, assignee_source = 'client', competence = '2000-01' where id = ${past}`);
    });

    await runMigration('0017_drop_client_responsibles.sql');
    const state = () =>
      rows<{ id: string; assignee_id: string | null; assignee_source: string | null }>(sql`
        select id, assignee_id, assignee_source from tasks where id in (${ahead}, ${aheadDone}, ${past}, ${aheadNoDefault}) order by id`);
    const after = new Map((await state()).map((r) => [r.id, r]));
    expect(after.get(ahead)).toMatchObject({ assignee_id: ana.userId, assignee_source: 'default' });
    expect(after.get(aheadNoDefault)).toMatchObject({ assignee_id: null, assignee_source: null });
    expect(after.get(aheadDone)).toMatchObject({ assignee_id: carla.userId, assignee_source: 'manual' });
    expect(after.get(past)).toMatchObject({ assignee_id: carla.userId, assignee_source: 'manual' });

    // Re-runs without changes.
    const before = await state();
    await runMigration('0017_drop_client_responsibles.sql');
    expect(await state()).toEqual(before);
  });
});
