// QA (qa-logica-gestao): processes (flows) with 4 steps — only the active step is a task; concluding it
// creates the next one once (also when two people conclude at the same time), with the relative deadline
// counted from the office day of the conclusion (23:30 in São Paulo is still the same day) and the
// responsible/department resolved when the process was created; reopening a step (also the last one)
// never duplicates tasks. Today is pinned to 2026-10-20.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { executeRows } from '../src/lib/sql';
import { admin, createTestApp, resetDb } from './helpers';
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

const rows = <T>(query: ReturnType<typeof sql>) => executeRows<T>(admin(), query);

describe('qa-gestao: processo com 4 etapas', () => {
  it('a próxima só nasce ao concluir a anterior, uma vez, com prazo e responsável certos; reabrir não duplica', async () => {
    const { ana, bruno, carla, fiscal, pessoal } = await office(app);
    const client = await createClient(ana, { tradeName: 'Admissão Ltda' });
    const made = await carla.post('/tasks/flows', {
      title: 'Admissão de empregado',
      clientId: client,
      steps: [
        { title: 'Coletar documentos', assigneeId: carla.userId, relativeDays: 1 },
        { title: 'Conferir dados', assigneeId: bruno.userId, relativeDays: 2 },
        { title: 'Cadastrar no eSocial', relativeDays: 3 },
        { title: 'Enviar contrato', assigneeId: ana.userId, departmentId: pessoal, relativeDays: 0 },
      ],
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const flowId = made.body.flow.id as string;
    const flowTasks = async () =>
      rows<{ position: number; task_id: string; title: string; due_date: string; assignee_id: string; department_id: string; status: string }>(sql`
        select s.position, t.id as task_id, t.title, t.due_date::text, t.assignee_id, t.department_id, t.status
          from task_flow_steps s join tasks t on t.id = s.task_id where s.flow_id = ${flowId} order by s.position`);
    const allStepTasks = async () =>
      rows<{ n: number }>(sql`select count(*)::int as n from tasks where title in ('Coletar documentos', 'Conferir dados', 'Cadastrar no eSocial', 'Enviar contrato')`);

    // Only step 1 is a task: due today + 1, Carla, Fiscal.
    expect(await flowTasks()).toEqual([expect.objectContaining({ position: 1, due_date: '2026-10-21', assignee_id: carla.userId, department_id: fiscal })]);
    expect((await carla.get('/tasks?kind=flow')).body.items).toHaveLength(1);
    const step1 = made.body.task.id as string;

    // Two people conclude step 1 at the same time, at 23:30 in São Paulo (02:30 UTC on the 21st).
    process.env.EFFINANCE_NOW = '2026-10-21T02:30:00Z';
    const both = await Promise.all([carla.patch(`/tasks/${step1}/status`, { status: 'done' }), ana.patch(`/tasks/${step1}/status`, { status: 'done' })]);
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    let list = await flowTasks();
    expect(list).toHaveLength(2);
    // Step 2: base = 20/10 (office day of the conclusion) + 2 = 22/10; Bruno, in his department (Pessoal).
    expect(list[1]).toMatchObject({ position: 2, title: 'Conferir dados', due_date: '2026-10-22', assignee_id: bruno.userId, department_id: pessoal, status: 'todo' });
    expect(await allStepTasks()).toEqual([{ n: 2 }]);

    // Step 2 concluded on 23/10: step 3 has no responsible → who created the process (Carla), her department.
    process.env.EFFINANCE_NOW = '2026-10-23T13:00:00Z';
    const second = await bruno.patch(`/tasks/${list[1]!.task_id}/status`, { status: 'done' });
    expect(second.body.activated).toMatchObject({ title: 'Cadastrar no eSocial', dueDate: '2026-10-26', assignee: { id: carla.userId }, department: { id: fiscal } });

    // Reopening step 2 (step 3 not started): step 3 goes back to waiting; concluding again recreates it once.
    process.env.EFFINANCE_NOW = '2026-10-26T13:00:00Z';
    expect((await bruno.patch(`/tasks/${list[1]!.task_id}/status`, { status: 'in_progress' })).status).toBe(200);
    expect(await flowTasks()).toHaveLength(2);
    const again = await bruno.patch(`/tasks/${list[1]!.task_id}/status`, { status: 'done' });
    expect(again.body.activated).toMatchObject({ title: 'Cadastrar no eSocial', dueDate: '2026-10-29' });
    expect(await allStepTasks()).toEqual([{ n: 3 }]);

    // Steps 3 and 4: the last one has its responsible (Ana) and the department chosen by her (Ana's own: Fiscal).
    list = await flowTasks();
    const third = await carla.patch(`/tasks/${list[2]!.task_id}/status`, { status: 'done' });
    expect(third.body.activated).toMatchObject({ title: 'Enviar contrato', dueDate: '2026-10-26', assignee: { id: ana.userId }, department: { id: fiscal } });
    expect((await ana.patch(`/tasks/${third.body.activated.id}/status`, { status: 'done' })).status).toBe(200);
    let flow = (await ana.get(`/tasks/flows/${flowId}`)).body;
    expect(flow).toMatchObject({ doneCount: 4, currentStep: null });
    expect(flow.completedAt).not.toBeNull();

    // Reopening the last step: the process is active again; concluding it completes it again, no new task.
    expect((await ana.patch(`/tasks/${third.body.activated.id}/status`, { status: 'todo' })).status).toBe(200);
    flow = (await ana.get(`/tasks/flows/${flowId}`)).body;
    expect(flow).toMatchObject({ doneCount: 3, completedAt: null, currentStep: { position: 4 } });
    expect((await ana.get('/tasks/flows')).body.map((f: any) => f.id)).toEqual([flowId]);
    expect((await ana.patch(`/tasks/${third.body.activated.id}/status`, { status: 'done' })).status).toBe(200);
    expect((await ana.get('/tasks/flows?status=done')).body.map((f: any) => f.id)).toEqual([flowId]);
    expect(await allStepTasks()).toEqual([{ n: 4 }]);
  });

  it('conclusão simultânea da mesma etapa não grava a conclusão nem o histórico duas vezes', async () => {
    const { ana, carla } = await office(app);
    const made = await carla.post('/tasks/flows', {
      title: 'Dois cliques',
      steps: [
        { title: 'Etapa A', relativeDays: 0 },
        { title: 'Etapa B', relativeDays: 1 },
      ],
    });
    const step1 = made.body.task.id as string;
    const both = await Promise.all([carla.patch(`/tasks/${step1}/status`, { status: 'done' }), ana.patch(`/tasks/${step1}/status`, { status: 'done' })]);
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    // The next step exists once (checked above too).
    expect(both.filter((r) => r.body.activated !== null)).toHaveLength(1);
    const events = await rows<{ kind: string; n: number }>(sql`
      select kind, count(*)::int as n from task_events where task_id = ${step1} and kind in ('status', 'flow_step') group by kind order by kind`);
    // One status change todo → done and one "step completed": the second click repeats `done`, which
    // must change nothing ("repetir done não muda o registro").
    expect(events, 'eventos da etapa concluída por dois cliques simultâneos').toEqual([
      { kind: 'flow_step', n: 2 }, // activated (created) + completed
      { kind: 'status', n: 1 },
    ]);
    const [task] = await rows<{ completed_by: string }>(sql`select completed_by from tasks where id = ${step1}`);
    expect([carla.userId, ana.userId]).toContain(task!.completed_by);
  });

  it('membro removido com substituto: a etapa que aguardava passa ao substituto e, ao ser ativada, nasce no departamento dele', async () => {
    const { ana, bruno, carla, fiscal, pessoal } = await office(app);
    const made = await ana.post('/tasks/flows', {
      title: 'Rescisão',
      steps: [
        { title: 'Calcular rescisão', relativeDays: 0 },
        { title: 'Homologar', assigneeId: bruno.userId, relativeDays: 2 },
      ],
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const waiting = (await ana.get(`/tasks/flows/${made.body.flow.id}`)).body.steps[1];
    expect(waiting).toMatchObject({ assignee: { id: bruno.userId }, department: { id: pessoal } });
    // Bruno (Pessoal) leaves; Carla (Fiscal) takes over everything of his.
    expect((await ana.del(`/workspaces/current/members/${bruno.userId}?replacementId=${carla.userId}`)).status).toBe(204);
    const done = await ana.patch(`/tasks/${made.body.task.id}/status`, { status: 'done' });
    expect(done.body.activated).toMatchObject({ title: 'Homologar', assignee: { id: carla.userId } });
    // docs/api.md (membro removido): "avulsas e etapas seguem o departamento do substituto (se ele tiver
    // um)"; and a task's department is its responsible's. The step was born in Pessoal, where Carla is not.
    expect(done.body.activated.department, 'etapa ativada depois da substituição ficou no departamento do membro que saiu').toEqual({ id: fiscal, name: 'Fiscal' });
  });

  it('ponto de atenção: cancelar a etapa ativa não ativa a seguinte (o processo fica parado nela)', async () => {
    const { carla } = await office(app);
    const made = await carla.post('/tasks/flows', { title: 'Cancelado', steps: [{ title: 'Primeira', relativeDays: 0 }, { title: 'Segunda', relativeDays: 1 }] });
    const res = await carla.patch(`/tasks/${made.body.task.id}/status`, { status: 'canceled' });
    expect(res.body.activated).toBeNull();
    const flow = (await carla.get(`/tasks/flows/${made.body.flow.id}`)).body;
    expect(flow.steps.map((s: any) => s.state)).toEqual(['current', 'waiting']);
    expect(flow.completedAt).toBeNull();
  });
});
