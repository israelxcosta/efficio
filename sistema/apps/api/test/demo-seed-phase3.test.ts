// The demo seed (CLI `db:seed` and the browser demo) carries the phase 3 scenario: unions with their
// agreements (overdue and due soon), clients' fiscal data, accesses and documents, the office with its
// logo and the factory contract, and permission adjustments in the team — all through the real API.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from '../src/db/demo-seed';
import { clientFor, createTestApp, resetDb } from './helpers';

let app: App;
// The seed is relative to the real date (its Open Finance part checks the sync window against it): run
// it unpinned, like the CLI and the browser demo.
const pinned = process.env.EFFINANCE_TODAY;
beforeAll(async () => {
  delete process.env.EFFINANCE_TODAY;
  app = await createTestApp();
});
afterAll(async () => {
  process.env.EFFINANCE_TODAY = pinned;
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
});

describe('demo seed, phase 3', () => {
  it('has unions, documents, accesses, the office and permission adjustments', async () => {
    await seedDemo(app.db);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
    expect(login.statusCode).toBe(200);
    const marina = clientFor(app, login.json().token);

    const unions = await marina.get('/unions');
    expect(unions.body.items.map((u: { acronym: string }) => u.acronym).sort()).toEqual(['SINDCOM', 'SINDMETAL', 'SINDTRANS', 'SINSAÚDE']);
    expect(unions.body.summary.overdue).toBeGreaterThanOrEqual(1);
    const summary = await marina.get('/deadlines/summary');
    expect(summary.body.documents.overdue).toBeGreaterThanOrEqual(2);
    expect(summary.body.overdueTotal).toBeGreaterThanOrEqual(3);
    const deadlines = await marina.get('/deadlines');
    expect(deadlines.body.documents.items.length).toBeGreaterThanOrEqual(8);
    expect(deadlines.body.conventions.items.length).toBeGreaterThanOrEqual(2);

    const branding = await marina.get('/office/branding');
    expect(branding.body).toMatchObject({ name: 'Efficio Contabilidade', logo: expect.stringMatching(/^data:image\/png;base64,/) });
    const office = await marina.get('/office');
    expect(office.body).toMatchObject({ registered: true, missingForContract: [], contract: { source: 'factory' } });

    const clients = await marina.get('/clients?search=P%C3%A3o%20Quente');
    const padaria = clients.body.items[0];
    expect(padaria).toMatchObject({ stateRegistration: '110.042.490.114', credentials: { simplesAccessCode: true, accountantPassword: true } });
    expect(padaria.documents.map((d: { deadline: { bucket: string } }) => d.deadline.bucket)).toEqual(['overdue', 'within30', 'within60']);
    expect(padaria.unions.map((u: { name: string }) => u.name)).toEqual(['SINDCOM']);
    const revealed = await marina.post(`/clients/${padaria.id}/credentials/reveal`, { field: 'simplesAccessCode' });
    expect(revealed.body.value).toBe('1234.5678.9012');

    const contract = await marina.get(`/clients/${padaria.id}/contract`);
    expect(contract.status).toBe(200);
    expect(contract.body.missing.office).toEqual([]);

    const members = await marina.get('/workspaces/current/members');
    const adjustments = Object.fromEntries(members.body.map((m: { name: string; permissionOverrides: object }) => [m.name, m.permissionOverrides]));
    expect(adjustments).toMatchObject({ 'Ana Paula Ribeiro': { office: false }, 'Rafael Lima': { 'page.reports': false }, Israel: {} });
  });
});
