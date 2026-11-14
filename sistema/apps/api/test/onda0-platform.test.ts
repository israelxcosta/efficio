// Production readiness (13/11/2026): sign-up by invite only (`SIGNUP_ENABLED`), production without
// Mercado Pago while billing is off, and the readiness check that tests the database.
// Today is pinned to 2026-10-20 (vitest.config.ts).

import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIGNUP_DISABLED_ERROR, SIGNUP_DISABLED_MESSAGE } from '@effinance/shared';
import { databaseReady, type App } from '../src/app';
import { parseEnv, signupEnabledOf } from '../src/env';
import { executeRows } from '../src/lib/sql';
import { admin, clientFor, createTestApp, registerUser, resetDb, TEST_PASSWORD } from './helpers';

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
afterEach(() => {
  app.platform.signupEnabled = true;
  vi.restoreAllMocks();
});

const count = async (table: 'users' | 'workspaces' | 'workspace_members') =>
  (await executeRows<{ n: number }>(admin(), sql`select count(*)::int as n from ${sql.identifier(table)}`))[0]!.n;

const signUp = (payload: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { name: 'Bruna Lima', password: TEST_PASSWORD, acceptTerms: true, ...payload },
  });

/** The office owner (signed up while sign-up was open) invites `email`; returns the raw token. */
async function invite(email: string, role: 'editor' | 'viewer' = 'editor') {
  const owner = await registerUser(app, 'Dona do Escritório');
  const created = await owner.post('/workspaces/current/invites', { email, role });
  expect(created.status).toBe(201);
  const workspaceId = (await owner.get('/auth/me')).body.workspace.id as string;
  return { owner, workspaceId, token: created.body.inviteUrl.split('/convite/')[1] as string };
}

describe('B1: sign-up by invite only', () => {
  it('with sign-up off, refuses without an invite (403, pt-BR) and creates nothing', async () => {
    app.platform.signupEnabled = false;
    const before = await Promise.all([count('users'), count('workspaces')]);
    const res = await signUp({ email: 'curioso@exemplo.com', companyName: 'Empresa Curiosa' });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: SIGNUP_DISABLED_ERROR, message: 'O cadastro é feito por convite do escritório.' });
    expect(SIGNUP_DISABLED_MESSAGE).toBe('O cadastro é feito por convite do escritório.');
    expect(res.cookies).toHaveLength(0);
    expect(await Promise.all([count('users'), count('workspaces')])).toEqual(before);
  });

  it('an invite link still creates the account, straight into the inviting workspace (no company of its own)', async () => {
    const { workspaceId, token } = await invite('bruna@escritorio.com');
    app.platform.signupEnabled = false;
    const workspaces = await count('workspaces');

    const res = await signUp({ email: 'Bruna@Escritorio.com', companyName: 'Ignorada', inviteToken: token });
    expect(res.statusCode, res.body).toBe(201);
    const { token: access, user } = res.json();
    const bruna = clientFor(app, access, user.id, user.email);
    const me = (await bruna.get('/auth/me')).body;
    expect(me.workspace).toMatchObject({ id: workspaceId, role: 'editor' });
    expect(me.workspaces).toHaveLength(1);
    expect(await count('workspaces')).toBe(workspaces);
    // The invite is used up; signing in works as usual.
    expect((await app.inject({ method: 'GET', url: `/api/invites/${token}` })).statusCode).toBe(404);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'bruna@escritorio.com', password: TEST_PASSWORD } });
    expect(login.statusCode).toBe(200);
    const audits = await executeRows<{ action: string; metadata: unknown }>(
      admin(),
      sql`select action, metadata from audit_logs where user_id = ${user.id} and action in ('auth.register', 'member.joined') order by action`,
    );
    expect(audits).toEqual([
      { action: 'auth.register', metadata: { invite: true } },
      { action: 'member.joined', metadata: null },
    ]);
  });

  it('refuses another e-mail, an unknown, used or expired invite and an existing account — creating nothing', async () => {
    const { token } = await invite('carla@escritorio.com', 'viewer');
    app.platform.signupEnabled = false;
    const users = await count('users');

    const other = await signUp({ email: 'outra@exemplo.com', inviteToken: token });
    expect(other.statusCode).toBe(403);
    expect(other.json().message).toBe('Este convite foi enviado para carla@escritorio.com. Crie a conta com esse e-mail.');
    expect((await signUp({ email: 'carla@escritorio.com', inviteToken: 'x'.repeat(43) })).statusCode).toBe(404);
    expect((await signUp({ email: 'carla@escritorio.com', inviteToken: 'curto' })).statusCode).toBe(400);

    await admin().execute(sql`update workspace_invites set expires_at = now() - interval '1 day'`);
    const expired = await signUp({ email: 'carla@escritorio.com', inviteToken: token });
    expect(expired.statusCode).toBe(422);
    expect(expired.json().message).toBe('Este convite expirou. Peça um novo convite.');
    expect(await count('users')).toBe(users);

    await admin().execute(sql`update workspace_invites set expires_at = now() + interval '1 day'`);
    expect((await signUp({ email: 'carla@escritorio.com', inviteToken: token })).statusCode).toBe(201);
    // Used up: the same link cannot open a second account.
    expect((await signUp({ email: 'carla@escritorio.com', inviteToken: token })).statusCode).toBe(409);
    expect((await signUp({ email: 'carla2@escritorio.com', inviteToken: token })).statusCode).toBe(404);
  });

  it('with sign-up on (development, tests) the public sign-up keeps creating the company', async () => {
    const res = await signUp({ email: 'aberto@exemplo.com', companyName: 'Aberta Ltda' });
    expect(res.statusCode).toBe(201);
    expect(await count('workspaces')).toBe(1);
  });

  it('SIGNUP_ENABLED: on outside production, off in it unless explicitly turned on', () => {
    const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db', JWT_SECRET: 'x'.repeat(40) };
    expect(signupEnabledOf(parseEnv({ ...base, NODE_ENV: 'development' }))).toBe(true);
    expect(signupEnabledOf(parseEnv({ ...base, NODE_ENV: 'test' }))).toBe(true);
    expect(signupEnabledOf(parseEnv({ ...base, NODE_ENV: 'test', SIGNUP_ENABLED: 'false' }))).toBe(false);
    expect(signupEnabledOf(parseEnv({ ...PRODUCTION }))).toBe(false);
    expect(signupEnabledOf(parseEnv({ ...PRODUCTION, SIGNUP_ENABLED: 'true' }))).toBe(true);
    expect(() => parseEnv({ ...base, SIGNUP_ENABLED: 'sim' })).toThrow(/SIGNUP_ENABLED/);
  });
});

/** The documented production setup (docs/deploy-aws.md), without Mercado Pago. */
const PRODUCTION: Record<string, string> = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://api:secret@db.internal:5432/effinance',
  DATABASE_SSL: 'verify-full',
  DATABASE_CA_FILE: '/etc/ssl/rds-global-bundle.pem',
  JWT_SECRET: 'Zx9-'.repeat(12),
  KEY_PROVIDER: 'aws',
  KMS_KEY_ID: 'arn:aws:kms:sa-east-1:111122223333:key/abcd',
  AWS_REGION: 'sa-east-1',
  MAILER: 'ses',
  APP_URL: 'https://app.efficio.com.br',
  CORS_ORIGIN: 'https://app.efficio.com.br',
};

describe('B2: production without Mercado Pago while billing is off', () => {
  it('starts without a charging provider when billing is off; requires one when it is on', () => {
    expect(() => parseEnv(PRODUCTION, { billingEnabled: false })).not.toThrow();
    expect(parseEnv(PRODUCTION, { billingEnabled: false }).BILLING_PROVIDER).toBe('fake');
    expect(() => parseEnv(PRODUCTION, { billingEnabled: true })).toThrow(/BILLING_PROVIDER/);
    const mercadoPago = { ...PRODUCTION, BILLING_PROVIDER: 'mercadopago', MP_ACCESS_TOKEN: 'APP_USR-token', MP_WEBHOOK_SECRET: 'whsec' };
    expect(() => parseEnv(mercadoPago, { billingEnabled: true })).not.toThrow();
    // Choosing Mercado Pago still needs its credentials, billing on or off.
    expect(() => parseEnv({ ...PRODUCTION, BILLING_PROVIDER: 'mercadopago' }, { billingEnabled: false })).toThrow(/MP_ACCESS_TOKEN/);
  });

  it('follows BILLING_ENABLED by default (off today)', () => {
    expect(() => parseEnv(PRODUCTION)).not.toThrow();
  });
});

describe('B3: readiness checks the database', () => {
  it('answers 200 when the database answers; /api/health stays as it was', async () => {
    const ready = await app.inject({ method: 'GET', url: '/api/health/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ok' });
    expect(ready.headers['cache-control']).toBe('no-store');
    expect((await app.inject({ method: 'GET', url: '/api/health' })).json()).toEqual({ status: 'ok' });
  });

  it('answers 503 without details when the database fails', async () => {
    vi.spyOn(app.db, 'execute').mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.12:5432 password authentication failed'));
    const res = await app.inject({ method: 'GET', url: '/api/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'unavailable' });
    expect(res.body).not.toMatch(/ECONNREFUSED|5432|password/);
    // Liveness does not depend on the database.
    vi.spyOn(app.db, 'execute').mockRejectedValueOnce(new Error('down'));
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
  });

  it('gives up on a database that hangs', async () => {
    vi.spyOn(app.db, 'execute').mockReturnValueOnce(new Promise(() => {}) as never);
    const started = Date.now();
    expect(await databaseReady(app.db, 50)).toBe(false);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(await databaseReady(app.db)).toBe(true);
  });
});
