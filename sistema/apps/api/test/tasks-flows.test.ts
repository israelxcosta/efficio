// Processes and templates (phase 2, Effy's task flows): templates are a registry (administrators),
// applying one is for every member; only the active step is a task; concluding it activates the next
// one once (idempotent), with the relative deadline counted from the day of the conclusion in the
// office time zone; deleting a process keeps its tasks; editing or deleting a template never changes
// processes already applied. Today is pinned to 2026-10-20.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { TASK_ADMIN_MESSAGE } from '../src/modules/tasks/access';
import { createTestApp, registerUser, resetDb } from './helpers';
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

describe('process templates and processes', () => {
  it('administrators keep the templates; any member applies them; steps activate one after the other', async () => {
    const { ana, bruno, carla, fiscal, pessoal } = await office(app);
    const client = await createClient(ana, { tradeName: 'Vale Verde' });
    const category = (await ana.post('/tasks/categories', { name: 'Abertura' })).body.id;
    const body = {
      title: 'Abertura de empresa',
      description: 'Roteiro de abertura',
      steps: [
        { title: 'Solicitar documentos', description: 'RG, CPF e comprovante', assigneeId: carla.userId, relativeDays: 1, categoryId: category },
        { title: 'Contrato social', departmentId: pessoal, relativeDays: 2, priority: 'high' },
        { title: 'Protocolar na junta', assigneeId: bruno.userId, departmentId: fiscal, relativeDays: 3 },
      ],
    };
    expect((await carla.post('/tasks/flow-templates', body)).status).toBe(403);
    const created = await ana.post('/tasks/flow-templates', body);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const template = created.body;
    expect(template).toMatchObject({
      title: 'Abertura de empresa',
      description: 'Roteiro de abertura',
      stepCount: 3,
      totalDays: 6,
      usageCount: 0,
      createdBy: { id: ana.userId },
      departments: [
        { id: fiscal, name: 'Fiscal' },
        { id: pessoal, name: 'Pessoal' },
      ],
    });
    expect(template.steps[0]).toMatchObject({ position: 1, title: 'Solicitar documentos', description: 'RG, CPF e comprovante', assignee: { id: carla.userId }, category: { id: category } });

    // A collaborator applies it to a client: step 1 is a task now, counting from today.
    const applied = await carla.post(`/tasks/flow-templates/${template.id}/apply`, { clientId: client });
    expect(applied.status, JSON.stringify(applied.body)).toBe(201);
    const flow = applied.body.flow;
    expect(flow).toMatchObject({ title: 'Abertura de empresa · Vale Verde', client: { id: client }, template: { id: template.id }, stepCount: 3, doneCount: 0, createdBy: { id: carla.userId } });
    expect(flow.steps.map((s: any) => s.state)).toEqual(['current', 'waiting', 'waiting']);
    expect(applied.body.task).toMatchObject({
      kind: 'flow',
      title: 'Solicitar documentos',
      dueDate: '2026-10-21',
      client: { id: client },
      assignee: { id: carla.userId },
      department: { id: fiscal },
      flow: { id: flow.id, title: flow.title, position: 1, stepCount: 3 },
    });
    const step1 = (await carla.get(`/tasks/${applied.body.task.id}`)).body;
    expect(step1.description).toBe('RG, CPF e comprovante');
    expect(step1.flowProgress).toMatchObject({ id: flow.id, currentStep: { position: 1 } });
    expect((await carla.get('/tasks/flow-templates')).body[0].usageCount).toBe(1);

    // Concluding step 1 at 23:30 in São Paulo (02:30 UTC the next day): the base is still Oct 20.
    process.env.EFFINANCE_NOW = '2026-10-21T02:30:00Z';
    const done = await carla.patch(`/tasks/${applied.body.task.id}/status`, { status: 'done' });
    expect(done.status).toBe(200);
    expect(done.body.activated).toMatchObject({
      title: 'Contrato social',
      dueDate: '2026-10-22',
      priority: 'high',
      assignee: null,
      department: { id: pessoal },
      flow: { position: 2, stepCount: 3 },
      createdBy: { id: carla.userId },
    });
    // Reopening step 1 while step 2 has not started: step 2 goes back to waiting (its task removed).
    process.env.EFFINANCE_NOW = '2026-10-25T15:00:00Z';
    const reopened = await carla.patch(`/tasks/${applied.body.task.id}/status`, { status: 'todo' });
    expect(reopened.status).toBe(200);
    expect((await carla.get(`/tasks/${done.body.activated.id}`)).status).toBe(404);
    const waiting = (await carla.get(`/tasks/flows/${flow.id}`)).body;
    expect(waiting.steps.map((s: any) => [s.state, s.dueDate, s.task])).toEqual([
      ['current', '2026-10-21', expect.objectContaining({ status: 'todo' })],
      ['waiting', null, null],
      ['waiting', null, null],
    ]);
    // Concluding it again activates step 2 anew, counting from the new day (25 + 2).
    const again = await carla.patch(`/tasks/${applied.body.task.id}/status`, { status: 'done' });
    expect(again.body.activated).toMatchObject({ title: 'Contrato social', dueDate: '2026-10-27' });
    const progress = (await carla.get(`/tasks/flows/${flow.id}`)).body;
    expect(progress.steps.map((s: any) => [s.state, s.dueDate])).toEqual([
      ['done', '2026-10-21'],
      ['current', '2026-10-27'],
      ['waiting', null],
    ]);
    expect(progress.steps[0].completedAt).toBe('2026-10-25T15:00:00.000Z');
    const flowTasks = (await carla.get('/tasks?kind=flow&pageSize=50')).body;
    expect(flowTasks.items.map((t: any) => t.title).sort()).toEqual(['Contrato social', 'Solicitar documentos']);
    // The history of the step says what happened.
    const history = (await carla.get(`/tasks/${applied.body.task.id}/history`)).body;
    expect(history.items.map((h: any) => h.kind)).toEqual([
      'flow_step',
      'status',
      'flow_step',
      'reopened',
      'flow_step',
      'status',
      'flow_step',
      'created',
    ]);
    expect(history.items[3]).toMatchObject({ kind: 'reopened', fromStatus: 'done', toStatus: 'todo' });
    expect(history.items[2]).toMatchObject({
      flow: { id: flow.id, title: flow.title, position: 2, event: 'deactivated' },
      note: 'A etapa 2 (Contrato social) voltou a aguardar esta etapa',
    });
    expect(history.items[0]).toMatchObject({ flow: { position: 1, event: 'completed' } });
    expect(history.items.at(-1)).toMatchObject({ origin: 'flow', originName: flow.title });
    // Once step 2 started, step 1 can no longer be reopened (the process never runs two steps at once).
    await bruno.patch(`/tasks/${again.body.activated.id}/status`, { status: 'in_progress' });
    const refused = await carla.patch(`/tasks/${applied.body.task.id}/status`, { status: 'todo' });
    expect(refused.status).toBe(409);
    expect(refused.body.message).toBe('Não é possível reabrir esta etapa: a etapa seguinte, “Contrato social”, já foi iniciada. Corrija pela etapa seguinte.');
    expect((await carla.get(`/tasks/${applied.body.task.id}`)).body.status).toBe('done');
    done.body.activated = again.body.activated;

    // Last steps: the process completes.
    await bruno.patch(`/tasks/${done.body.activated.id}/status`, { status: 'done' });
    const third = (await carla.get(`/tasks/flows/${flow.id}`)).body.currentStep;
    expect(third).toMatchObject({ position: 3, dueDate: '2026-10-28', assignee: { id: bruno.userId } });
    await bruno.patch(`/tasks/${third.task.id}/status`, { status: 'done' });
    const complete = (await carla.get(`/tasks/flows/${flow.id}`)).body;
    expect(complete).toMatchObject({ doneCount: 3, currentStep: null });
    expect(complete.completedAt).not.toBeNull();
    expect((await carla.get('/tasks/flows')).body).toEqual([]);
    expect((await carla.get('/tasks/flows?status=done')).body.map((f: any) => f.id)).toEqual([flow.id]);

    // Editing the template never changes the process applied; deleting it only drops the reference.
    const edited = await ana.put(`/tasks/flow-templates/${template.id}`, { title: 'Abertura (nova)', steps: [{ title: 'Única', relativeDays: 0 }] });
    expect(edited.body).toMatchObject({ title: 'Abertura (nova)', stepCount: 1, usageCount: 1 });
    expect((await carla.get(`/tasks/flows/${flow.id}`)).body.stepCount).toBe(3);
    expect((await carla.del(`/tasks/flow-templates/${template.id}`)).status).toBe(403);
    expect((await ana.del(`/tasks/flow-templates/${template.id}`)).status).toBe(204);
    expect((await carla.get(`/tasks/flows/${flow.id}?`)).body.template).toBeNull();
    // Deleting a process (administrators) keeps its tasks.
    expect((await carla.del(`/tasks/flows/${flow.id}`)).body.message).toBe(TASK_ADMIN_MESSAGE);
    expect((await ana.del(`/tasks/flows/${flow.id}`)).status).toBe(204);
    const kept = (await carla.get(`/tasks/${applied.body.task.id}`)).body;
    expect(kept).toMatchObject({ kind: 'standalone', flow: null, flowProgress: null });
  });

  it('a process built by hand: absolute or relative deadlines, a client per step, saving as a template for administrators', async () => {
    const { ana, carla } = await office(app);
    const a = await createClient(ana, { tradeName: 'A' });
    const b = await createClient(ana, { tradeName: 'B' });
    const body = {
      title: 'Alteração contratual',
      clientId: a,
      steps: [
        { title: 'Minuta', dueDate: '2026-10-23' },
        { title: 'Assinatura do outro sócio', clientId: b, relativeDays: 5 },
      ],
    };
    const made = await carla.post('/tasks/flows', body);
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.body.task).toMatchObject({ title: 'Minuta', dueDate: '2026-10-23', client: { id: a } });
    expect(made.body.template).toBeNull();
    const next = await carla.patch(`/tasks/${made.body.task.id}/status`, { status: 'done' });
    expect(next.body.activated).toMatchObject({ client: { id: b }, dueDate: '2026-10-25' });

    // Saving as a template is a registry: administrators only, deadlines in days.
    expect((await carla.post('/tasks/flows', { ...body, saveAsTemplate: true, steps: [{ title: 'Minuta', relativeDays: 1 }] })).body.message).toBe(TASK_ADMIN_MESSAGE);
    expect((await ana.post('/tasks/flows', { ...body, saveAsTemplate: true })).status).toBe(400);
    const saved = await ana.post('/tasks/flows', { ...body, saveAsTemplate: true, steps: [{ title: 'Minuta', relativeDays: 1 }, { title: 'Registro', relativeDays: 3 }] });
    expect(saved.status).toBe(201);
    expect(saved.body.template).toMatchObject({ title: 'Alteração contratual', stepCount: 2, totalDays: 4 });
    // Limits and validation.
    expect((await carla.post('/tasks/flows', { title: 'Vazio', steps: [] })).status).toBe(400);
    expect((await carla.post('/tasks/flows', { title: 'X', steps: Array.from({ length: 31 }, (_, i) => ({ title: `E${i}` })) })).status).toBe(400);
    expect((await carla.post('/tasks/flows', { title: 'X', steps: [{ title: 'E', relativeDays: 366 }] })).status).toBe(400);
    expect((await carla.post(`/tasks/flow-templates/${saved.body.template.id}/apply`, {})).status).toBe(400);
  });

  it('ids of another workspace are "not found" (templates, processes, clients)', async () => {
    const { ana } = await office(app);
    const client = await createClient(ana);
    const template = (await ana.post('/tasks/flow-templates', { title: 'Modelo', steps: [{ title: 'E1' }] })).body;
    const flow = (await ana.post(`/tasks/flow-templates/${template.id}/apply`, { clientId: client })).body.flow;
    const other = await registerUser(app, 'Outro Escritório');
    const foreignClient = await createClient(other);
    expect((await other.get(`/tasks/flow-templates/${template.id}`)).status).toBe(404);
    expect((await other.post(`/tasks/flow-templates/${template.id}/apply`, { clientId: foreignClient })).status).toBe(404);
    expect((await other.get(`/tasks/flows/${flow.id}`)).status).toBe(404);
    expect((await other.del(`/tasks/flows/${flow.id}`)).status).toBe(404);
    expect((await ana.post(`/tasks/flow-templates/${template.id}/apply`, { clientId: foreignClient })).status).toBe(404);
    expect((await ana.post('/tasks/flows', { title: 'X', steps: [{ title: 'E', clientId: foreignClient }] })).status).toBe(404);
    expect((await other.get('/tasks/flows?status=all')).body).toEqual([]);
    expect((await other.get('/tasks/flow-templates')).body).toEqual([]);
  });
});
