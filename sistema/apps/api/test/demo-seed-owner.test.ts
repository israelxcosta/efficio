// The demo's office belongs to Israel (israel@efficio.com.br, the demo password), and a reseed over data
// of an earlier demo version leaves none of the former demo accounts behind.

import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from '../src/db/demo-seed';
import { users, workspaces } from '../src/db/schema';
import { register } from '../src/modules/auth/service';
import { admin, clientFor, createTestApp, resetDb } from './helpers';

let app: App;
// Like demo-seed-phase3.test.ts: the seed runs against the real date.
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

describe('demo seed owner', () => {
  it('Israel owns the office and signs in with the demo password', async () => {
    expect(DEMO_EMAIL).toBe('israel@efficio.com.br');
    await seedDemo(app.db);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
    expect(login.statusCode).toBe(200);
    const me = (await clientFor(app, login.json().token).get('/auth/me')).body;
    expect(me.user).toMatchObject({ name: 'Israel', email: 'israel@efficio.com.br' });
    expect(me.workspace).toMatchObject({ name: 'Efficio Contabilidade', kind: 'business', role: 'owner' });
  }, 120_000);

  it('a reseed removes the former demo account (demo@efficio.app) and its office', async () => {
    const former = await register(app.db, {
      name: 'Marina Costa',
      email: 'demo@efficio.app',
      password: DEMO_PASSWORD,
      companyName: 'Efficio Contabilidade',
      acceptTerms: true,
    });
    await seedDemo(app.db);
    expect(await admin().select({ id: users.id }).from(users).where(inArray(users.email, ['demo@efficio.app']))).toEqual([]);
    expect(await admin().select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, former.workspaceId))).toEqual([]);
    expect(await admin().select({ name: workspaces.name }).from(workspaces)).toEqual([{ name: 'Efficio Contabilidade' }]);
  }, 120_000);
});
