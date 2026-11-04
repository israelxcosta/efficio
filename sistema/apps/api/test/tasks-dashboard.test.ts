// GET /tasks/dashboard: the data of Effy's dashboard cards for the Gestão start page — task status of
// the month, flow per day, processes per department, agenda, fiscal pending items per recurring task,
// clients overview, digital certificates and other documents (by situation, with the list), collective
// agreements (from /deadlines), fees about to expire (only with `finance`) and incomplete registrations
// (only with `registry`). Departments follow the start page's rule (another one or all: `registry`).
// Today is pinned to 2026-10-20 (a Tuesday).

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { admin, createTestApp, registerUser, resetDb } from './helpers';
import { cnpj, createClient, office, workspaceOf } from './task-helpers';

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

async function seed() {
  const o = await office(app);
  const { ana, carla, fiscal, pessoal } = o;
  const ws = await workspaceOf(ana);
  const padaria = await createClient(ana, { tradeName: 'Padaria' });
  const clinica = await createClient(ana, { tradeName: 'Clínica', contractStartDate: '2024-11-15' });
  const construtora = await createClient(ana, { tradeName: 'Construtora', taxRegime: 'presumed_profit', contractStartDate: '2024-12-10' });
  const das = await ana.post('/tasks/recurring', { name: 'DAS', departmentId: fiscal, dueDay: 20, targetDaysBefore: 3, regimes: ['simples_nacional'] });
  const dctf = await ana.post('/tasks/recurring', { name: 'DCTFWeb', departmentId: fiscal, dueDay: 15, regimes: ['simples_nacional', 'presumed_profit'] });
  const folha = await ana.post('/tasks/recurring', { name: 'Folha', departmentId: pessoal, dueDay: 30, targetDaysBefore: 8, regimes: ['presumed_profit'] });
  expect([das.status, dctf.status, folha.status]).toEqual([201, 201, 201]);
  // Padaria's DCTFWeb is done; the other two are overdue (legal deadline on the 15th).
  const cells = (await ana.get(`/tasks/recurring/${dctf.body.id}/occurrences/2026-10`)).body.cells;
  await ana.patch(`/tasks/${cells.find((c: any) => c.clientId === padaria).taskId}/status`, { status: 'done' });
  // Standalone tasks: due on the 22nd, overdue since the 10th, and one done this month.
  await ana.post('/tasks', { title: 'Reunião com cliente', assigneeId: ana.userId, dueDate: '2026-10-22' });
  await ana.post('/tasks', { title: 'Parcelamento', assigneeId: carla.userId, dueDate: '2026-10-10', clientId: clinica });
  await ana.post('/tasks', { title: 'Certidão', assigneeId: carla.userId, dueDate: '2026-10-05', status: 'done' });
  // Documents: an overdue certificate, a certificate within 30 days, a license without date, one far ahead.
  await admin().execute(sql`
    insert into client_documents (workspace_id, client_id, kind, expires_at, updated_by_name) values
      (${ws}, ${padaria}, 'digital_certificate', '2026-10-01', 'Ana'),
      (${ws}, ${clinica}, 'digital_certificate', '2026-11-05', 'Ana'),
      (${ws}, ${clinica}, 'operating_license', null, 'Ana'),
      (${ws}, ${construtora}, 'pcmso', '2027-06-30', 'Ana')`);
  // Fees: Clínica's period 1 ends 2026-11-14 (25 days), Construtora's 2026-12-09 (50 days).
  await admin().execute(sql`
    insert into client_fees (workspace_id, client_id, period_index, amount) values
      (${ws}, ${clinica}, 1, 150000), (${ws}, ${construtora}, 1, 320000)`);
  // A union whose agreement (base month November) is due within 30 days, with an active client.
  const union = await ana.post('/unions', {
    name: 'Sindicato dos Comerciários',
    document: cnpj(30_200_001),
    acronym: 'SINDCOM',
    category: 'Comerciários',
    baseMonth: 11,
    clientIds: [padaria],
  });
  expect(union.status, JSON.stringify(union.body)).toBe(201);
  return { ...o, ws, padaria, clinica, construtora, das: das.body.id, dctf: dctf.body.id, folha: folha.body.id };
}

describe('task dashboard', () => {
  it('computes every card for the whole office', async () => {
    const s = await seed();
    const res = await s.ana.get('/tasks/dashboard?departmentId=all');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const d = res.body;
    expect(d).toMatchObject({ today: '2026-10-20', month: '2026-10', view: 'all', department: null });

    // Situação das tarefas: 6 occurrences of October + 3 standalone tasks due in October.
    expect(d.taskStatus).toEqual({ total: 9, pending: 4, concluded: 2, overdue: 3 });

    // Fluxo: the next 7 days by work date (occurrences by target, tasks by due date).
    expect(d.flow).toHaveLength(7);
    expect(d.flow[0]).toEqual({ date: '2026-10-20', recurring: 0, standalone: 0 });
    expect(d.flow.find((f: any) => f.date === '2026-10-22')).toEqual({ date: '2026-10-22', recurring: 1, standalone: 1 });

    // Processos por departamento (occurrences of the competence).
    expect(d.processes).toEqual([
      { department: { id: s.fiscal, name: 'Fiscal' }, recurringCount: 2, total: 5, done: 1, pending: 2, overdue: 2 },
      { department: { id: s.pessoal, name: 'Pessoal' }, recurringCount: 1, total: 1, done: 0, pending: 1, overdue: 0 },
    ]);

    // Pendências fiscais: per recurring task, overdue first.
    expect(d.fiscal.totals).toEqual({ total: 6, done: 1, pending: 3, overdue: 2 });
    expect(d.fiscal.items.map((i: any) => [i.name, i.total, i.done, i.pending, i.overdue])).toEqual([
      ['DCTFWeb', 3, 1, 2, true],
      ['DAS', 2, 0, 2, false],
      ['Folha', 1, 0, 1, false],
    ]);

    // Agenda: legal deadlines in the next 7 days, and those already past this month with pending work.
    expect(d.agenda.upcoming.map((i: any) => [i.name, i.legalDueDate])).toEqual([['DAS', '2026-10-20']]);
    expect(d.agenda.overdue.map((i: any) => [i.name, i.legalDueDate, i.pending])).toEqual([['DCTFWeb', '2026-10-15', 2]]);

    // Visão geral dos clientes.
    expect(d.clientsOverview.counts).toEqual({ attention: 2, pending: 1, upToDate: 0 });
    expect(d.clientsOverview.items.find((i: any) => i.client.id === s.padaria)).toMatchObject({ status: 'pending', client: { name: 'Padaria', taxRegime: 'simples_nacional' } });

    // Certificados digitais e demais documentos (laudos), with the list by situation.
    expect(d.certificates.counts).toEqual({ overdue: 1, within30: 1, ok: 0, noDate: 0 });
    expect(d.certificates.items.map((i: any) => [i.client.name, i.situation, i.days])).toEqual([
      ['Padaria', 'overdue', -19],
      ['Clínica', 'within30', 16],
    ]);
    expect(d.documents.counts).toEqual({ overdue: 0, within30: 0, ok: 1, noDate: 1 });
    expect(d.documents.items.map((i: any) => [i.name, i.situation])).toEqual([
      ['PCMSO', 'ok'],
      ['Alvará de funcionamento', 'noDate'],
    ]);

    // Convenções coletivas (the same rule as /deadlines).
    expect(d.conventions).toMatchObject({ counts: { overdue: 0, within30: 1, within60: 0 }, total: 1, noBaseMonth: 0 });
    expect(d.conventions.items[0]).toMatchObject({ name: 'SINDCOM', cycle: { dueDate: '2026-11-01', bucket: 'within30' } });

    // Honorários próximos de vencer (finance).
    expect(d.fees.within30.map((f: any) => [f.client.name, f.periodEnd, f.days, f.monthlyAmount])).toEqual([['Clínica', '2026-11-14', 25, 150000]]);
    expect(d.fees.within60.map((f: any) => [f.client.name, f.periodEnd])).toEqual([['Construtora', '2026-12-09']]);

    // Cadastro incompleto (registry): nothing filled but the Simples annex.
    expect(d.incomplete.count).toBe(3);
    const padaria = d.incomplete.items.find((i: any) => i.client.id === s.padaria);
    expect(padaria).toMatchObject({ total: 6, filled: 2 });
    expect(padaria.missing).toEqual(['stateRegistration', 'municipalRegistration', 'accountantPassword', 'simplesAccessCode']);
    const construtora = d.incomplete.items.find((i: any) => i.client.id === s.construtora);
    expect(construtora).toMatchObject({ total: 4, filled: 0 });
  });

  it('respects permissions and departments: a collaborator sees her department, no fees, no registrations', async () => {
    const s = await seed();
    const res = await s.carla.get('/tasks/dashboard');
    expect(res.status).toBe(200);
    const d = res.body;
    expect(d).toMatchObject({ view: 'department', department: { id: s.fiscal, name: 'Fiscal' } });
    expect(d.fees).toBeNull();
    expect(d.incomplete).toBeNull();
    expect(d.processes.map((p: any) => p.department?.name)).toEqual(['Fiscal']);
    expect(d.fiscal.items.map((i: any) => i.name)).toEqual(['DCTFWeb', 'DAS']);
    // Documents and agreements are the office's, whatever the department.
    expect(d.certificates.counts.overdue).toBe(1);
    expect((await s.carla.get('/tasks/dashboard?departmentId=all')).status).toBe(403);
    expect((await s.carla.get(`/tasks/dashboard?departmentId=${s.pessoal}`)).status).toBe(403);
    // Another office sees none of it.
    const other = await registerUser(app, 'Outro Escritório');
    const empty = (await other.get('/tasks/dashboard')).body;
    expect(empty).toMatchObject({ taskStatus: { total: 0 }, certificates: { counts: { overdue: 0 } }, conventions: { total: 0 } });
    expect(empty.clientsOverview.items).toEqual([]);
  });
});
