// Security review before going live on the VPS (14/11/2026): regressions of the findings fixed then.

import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hstsPolicy, type App } from '../src/app';
import { sanitizeUrl } from '../src/lib/log';
import { executeRows } from '../src/lib/sql';
import { admin, createTestApp, registerUser, resetDb, TEST_PASSWORD } from './helpers';

describe('HSTS of the API matches the one of the site (Caddy)', () => {
  it('sends exactly the Caddyfile header in production — no preload — and none outside it', async () => {
    const caddyfile = readFileSync(new URL('../../../deploy/Caddyfile', import.meta.url), 'utf8');
    const caddy = /Strict-Transport-Security\s+"([^"]+)"/.exec(caddyfile)?.[1];
    expect(caddy).toBeDefined();

    const api = Fastify();
    await api.register(helmet, { contentSecurityPolicy: false, hsts: hstsPolicy(true) });
    api.get('/x', async () => ({ ok: true }));
    const res = await api.inject({ method: 'GET', url: '/x' });
    await api.close();
    expect(res.headers['strict-transport-security']).toBe(caddy);
    expect(String(res.headers['strict-transport-security'])).not.toMatch(/preload/i);
    expect(hstsPolicy(false)).toBe(false);
  });
});

describe('request logs', () => {
  it('mask the CNPJ looked up (it tells who the clients of the office are) (CWE-532)', () => {
    expect(sanitizeUrl('/api/cnpj/11222333000181')).toBe('/api/cnpj/[cnpj]');
    expect(sanitizeUrl('/api/cnpj/11.222.333%2F0001-81?x=1')).toBe('/api/cnpj/[cnpj]?x=[redacted]');
  });
});

describe('sign-up by invite does not enumerate accounts (CWE-204)', () => {
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
  });

  const signUp = (email: string, inviteToken: string) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'Curioso', email, password: TEST_PASSWORD, acceptTerms: true, inviteToken },
    });

  it('with sign-up off, a made-up invite answers the same for an existing and an unknown e-mail', async () => {
    const existing = await registerUser(app, 'Dona do Escritório', 'dona@escritorio.com');
    app.platform.signupEnabled = false;
    const users = async () => (await executeRows<{ n: number }>(admin(), sql`select count(*)::int as n from users`))[0]!.n;
    const before = await users();

    const known = await signUp(existing.email, 'x'.repeat(43));
    const unknown = await signUp('ninguem@exemplo.com', 'x'.repeat(43));
    expect(known.statusCode).toBe(404);
    expect(known.json()).toEqual(unknown.json());
    expect(unknown.statusCode).toBe(404);
    expect(known.cookies).toHaveLength(0);
    expect(await users()).toBe(before);
  });
});
