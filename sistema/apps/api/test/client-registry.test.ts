// Registry of a client outside the financial boundary (UX 2.3): the permission `clients` (by default
// every member) edits the registration and fiscal data — never the financial fields (contract start,
// fee due day, notes, the responsible's CPF), the accesses nor the fees — and the documents; without it,
// 403. Other workspaces' ids are "not found", and every change is audited (names, never values).
// Today is pinned to 2026-10-20 (vitest.config.ts).

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { auditLogs } from '../src/db/schema';
import { admin, createTestApp, registerUser, resetDb, type Client } from './helpers';
import { cnpj, office } from './task-helpers';

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

const padaria = {
  name: 'Padaria Pão Dourado Ltda',
  tradeName: 'Pão Dourado',
  document: cnpj(31_000_001),
  taxRegime: 'simples_nacional',
  simplesAnnex: 'I',
  contractStartDate: '2026-01-10',
  feeDueDay: 15,
  notes: 'Cliente desde a fundação',
  responsibleName: 'Joaquim',
  responsibleDocument: '529.982.247-25',
  stateRegistration: '110.042.490.114',
  documents: [{ kind: 'cnd_federal', expiresAt: '2026-11-01' }],
};

async function seed(owner: Client) {
  const created = await owner.post('/clients', padaria);
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  expect((await owner.post(`/clients/${created.body.id}/fees`, { amount: 150_000 })).status).toBe(201);
  return created.body.id as string;
}

const setOverrides = async (owner: Client, who: Client, overrides: Record<string, boolean>) =>
  expect((await owner.put(`/workspaces/current/members/${who.userId}/permissions`, { overrides })).status).toBe(200);

const audits = (entityId: string) => admin().select().from(auditLogs).where(and(eq(auditLogs.entityId, entityId)));

describe('client registry (permission `clients`)', () => {
  it('a collaborator edits the registration and fiscal data, never the financial fields; audited', async () => {
    const { ana, carla } = await office(app);
    const id = await seed(ana);

    const res = await carla.patch(`/clients/${id}/registration`, {
      tradeName: 'Pão Dourado Matriz',
      phone: '(11) 98765-4321',
      street: 'Rua das Flores',
      city: 'São Paulo',
      state: 'sp',
      taxRegime: 'presumed_profit',
      municipalRegistration: '45.123',
      stateRegistrationExempt: true,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // As the collaborator sees it: no fees, fee due day, notes or the responsible's CPF.
    expect(res.body).toMatchObject({
      tradeName: 'Pão Dourado Matriz',
      phone: '11987654321',
      state: 'SP',
      taxRegime: 'presumed_profit',
      simplesAnnex: null,
      municipalRegistration: '45.123',
      stateRegistrationExempt: true,
      stateRegistration: null,
      name: padaria.name,
      responsibleName: 'Joaquim',
      currentFee: null,
      feeDueDay: null,
      notes: null,
      responsibleDocument: null,
    });
    expect(res.body.documents).toHaveLength(1);
    // The registry reaches the CNPJ lookup too (Receita Federal data for the form).
    expect((await carla.get(`/cnpj/${padaria.document}`)).status).not.toBe(403);

    // The financial fields are untouched (the owner sees them).
    const full = (await ana.get(`/clients/${id}`)).body;
    expect(full).toMatchObject({
      contractStartDate: '2026-01-10',
      feeDueDay: 15,
      notes: 'Cliente desde a fundação',
      responsibleDocument: '52998224725',
      currentFee: { amount: 150_000 },
      street: 'Rua das Flores',
    });

    const [record] = (await audits(id)).filter((a) => a.action === 'client.registration_updated');
    expect(record).toMatchObject({ userId: carla.userId, entity: 'client' });
    expect((record!.metadata as { fields: string[] }).fields.sort()).toEqual(
      ['city', 'municipalRegistration', 'phone', 'state', 'stateRegistration', 'stateRegistrationExempt', 'street', 'taxRegime', 'tradeName'].sort(),
    );
    expect(JSON.stringify(record!.metadata)).not.toContain('98765');
  });

  it('refuses the financial fields and the accesses through the registry path (nothing changes)', async () => {
    const { ana, carla } = await office(app);
    const id = await seed(ana);
    for (const body of [
      { contractStartDate: '2025-01-10' },
      { feeDueDay: 5 },
      { notes: 'outra' },
      { responsibleDocument: null },
      { accountantPassword: { action: 'set', value: 'x' } },
      { documents: [] },
      { tradeName: 'Novo', currentFee: null },
    ]) {
      const res = await carla.patch(`/clients/${id}/registration`, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.message).toContain('ficam no Financeiro');
    }
    const full = (await ana.get(`/clients/${id}`)).body;
    expect(full).toMatchObject({ tradeName: 'Pão Dourado', contractStartDate: '2026-01-10', feeDueDay: 15, notes: 'Cliente desde a fundação' });
    expect(full.credentials.accountantPassword).toBe(false);
    expect((await audits(id)).filter((a) => a.action === 'client.registration_updated')).toHaveLength(0);
  });

  it('checks the rules that depend on what is stored and the unique CNPJ', async () => {
    const { ana, carla } = await office(app);
    const id = await seed(ana);
    const other = await ana.post('/clients', { ...padaria, document: cnpj(31_000_002), documents: undefined });
    expect(other.status).toBe(201);

    expect((await carla.patch(`/clients/${id}/registration`, { simplesAnnex: null })).status).toBe(422);
    expect((await carla.patch(`/clients/${id}/registration`, { taxRegime: 'real_profit' })).body.simplesAnnex).toBeNull();
    const back = await carla.patch(`/clients/${id}/registration`, { taxRegime: 'simples_nacional' });
    expect(back.status).toBe(422);
    expect(back.body.message).toBe('Selecione o anexo do Simples Nacional');
    expect((await carla.patch(`/clients/${id}/registration`, { taxRegime: 'simples_nacional', simplesAnnex: 'III' })).body.simplesAnnex).toBe('III');

    expect((await carla.patch(`/clients/${id}/registration`, { stateRegistrationExempt: true })).status).toBe(200);
    expect((await carla.patch(`/clients/${id}/registration`, { stateRegistration: '123' })).status).toBe(422);
    const registered = await carla.patch(`/clients/${id}/registration`, { stateRegistrationExempt: false, stateRegistration: '123' });
    expect(registered.body).toMatchObject({ stateRegistrationExempt: false, stateRegistration: '123' });

    expect((await carla.patch(`/clients/${id}/registration`, { document: cnpj(31_000_002) })).status).toBe(409);
    expect((await carla.patch(`/clients/${id}/registration`, { name: '' })).status).toBe(400);
    // Nothing sent: nothing changes and nothing is recorded.
    const before = (await audits(id)).length;
    expect((await carla.patch(`/clients/${id}/registration`, {})).status).toBe(200);
    expect((await audits(id)).length).toBe(before);
  });

  it('documents: add, renew, remove and replace the list; who changed it stays recorded', async () => {
    const { ana, carla } = await office(app);
    const id = await seed(ana);

    const added = await carla.post(`/clients/${id}/documents`, { kind: 'digital_certificate', expiresAt: '2026-10-25', note: 'A1' });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    expect(added.body).toMatchObject({ kind: 'digital_certificate', note: 'A1', deadline: { bucket: 'within30', days: 5 }, updatedBy: { id: carla.userId } });

    const renewed = await carla.put(`/clients/${id}/documents/${added.body.id}`, { kind: 'digital_certificate', expiresAt: '2027-10-25', note: 'A1 renovado' });
    expect(renewed.status).toBe(200);
    expect(renewed.body).toMatchObject({ id: added.body.id, expiresAt: '2027-10-25', note: 'A1 renovado', deadline: { bucket: 'later' } });

    expect((await carla.post(`/clients/${id}/documents`, { kind: 'other' })).status).toBe(400);

    const listed = (await carla.get(`/clients/${id}`)).body.documents as { id: string; kind: string }[];
    expect(listed.map((d) => d.kind)).toEqual(['cnd_federal', 'digital_certificate']);
    const cnd = listed.find((d) => d.kind === 'cnd_federal')!;

    expect((await carla.del(`/clients/${id}/documents/${cnd.id}`)).status).toBe(204);
    expect((await carla.del(`/clients/${id}/documents/${cnd.id}`)).status).toBe(404);

    const replaced = await carla.put(`/clients/${id}/documents`, {
      documents: [{ id: added.body.id, kind: 'digital_certificate', expiresAt: '2027-10-25', note: 'A1 renovado' }, { kind: 'cndt', expiresAt: '2026-12-01' }],
    });
    expect(replaced.status, JSON.stringify(replaced.body)).toBe(200);
    expect(replaced.body.map((d: { kind: string }) => d.kind)).toEqual(['cndt', 'digital_certificate']);
    expect((await carla.put(`/clients/${id}/documents`, { documents: [] })).body).toEqual([]);

    const actions = (await audits(id)).map((a) => a.action);
    for (const action of ['client.document_added', 'client.document_updated', 'client.document_deleted', 'client.documents_replaced']) {
      expect(actions, action).toContain(action);
    }
    expect(JSON.stringify((await audits(id)).map((a) => a.metadata))).not.toContain('renovado');
  });

  it('without `clients`: 403 on every registry route; an administrator without finances but with `clients` edits', async () => {
    const { ana, bruno, carla } = await office(app);
    const id = await seed(ana);
    const docId = (await ana.get(`/clients/${id}`)).body.documents[0].id as string;
    await setOverrides(ana, carla, { clients: false });
    await setOverrides(ana, bruno, { finance: false });

    const calls = (c: Client) => [
      c.patch(`/clients/${id}/registration`, { tradeName: 'X' }),
      c.put(`/clients/${id}/documents`, { documents: [] }),
      c.post(`/clients/${id}/documents`, { kind: 'cndt' }),
      c.put(`/clients/${id}/documents/${docId}`, { kind: 'cndt' }),
      c.del(`/clients/${id}/documents/${docId}`),
    ];
    for (const res of await Promise.all(calls(carla))) {
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Você não tem permissão para editar o cadastro dos clientes.');
    }
    // The detail stays readable; the CNPJ lookup needs some registry permission.
    expect((await carla.get(`/clients/${id}`)).status).toBe(200);
    expect((await carla.get(`/cnpj/${padaria.document}`)).status).toBe(403);
    expect((await bruno.get(`/cnpj/${padaria.document}`)).status).not.toBe(403);

    const edited = await bruno.patch(`/clients/${id}/registration`, { tradeName: 'Pão Dourado Filial' });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ tradeName: 'Pão Dourado Filial', currentFee: null, notes: null });
    expect((await bruno.put(`/clients/${id}/documents/${docId}`, { kind: 'cnd_federal', expiresAt: '2027-05-01' })).status).toBe(200);
    // The financial routes stay closed to him.
    expect((await bruno.put(`/clients/${id}`, padaria)).status).toBe(403);
    expect((await bruno.post(`/clients/${id}/reactivate`)).status).toBe(403);
  });

  it("another workspace's client or document is not found", async () => {
    const { ana, carla } = await office(app);
    const id = await seed(ana);
    const sibling = await ana.post('/clients', { ...padaria, document: cnpj(31_000_003), documents: [{ kind: 'pgr' }] });
    const siblingDoc = sibling.body.documents[0].id as string;
    const docId = (await ana.get(`/clients/${id}`)).body.documents[0].id as string;

    const stranger = await registerUser(app, 'Outro Escritório');
    for (const res of [
      await stranger.patch(`/clients/${id}/registration`, { tradeName: 'Invadido' }),
      await stranger.put(`/clients/${id}/documents`, { documents: [] }),
      await stranger.post(`/clients/${id}/documents`, { kind: 'cndt' }),
      await stranger.put(`/clients/${id}/documents/${docId}`, { kind: 'cndt' }),
      await stranger.del(`/clients/${id}/documents/${docId}`),
    ]) {
      expect(res.status).toBe(404);
    }
    // A document of another client of the same office, through this client's path.
    expect((await carla.put(`/clients/${id}/documents/${siblingDoc}`, { kind: 'cndt' })).status).toBe(404);
    expect((await carla.del(`/clients/${id}/documents/${siblingDoc}`)).status).toBe(404);
    expect((await carla.put(`/clients/${id}/documents`, { documents: [{ id: siblingDoc, kind: 'pgr' }] })).status).toBe(404);

    const full = (await ana.get(`/clients/${id}`)).body;
    expect(full.tradeName).toBe('Pão Dourado');
    expect(full.documents).toHaveLength(1);
    expect((await ana.get(`/clients/${sibling.body.id}`)).body.documents).toHaveLength(1);
  });
});
