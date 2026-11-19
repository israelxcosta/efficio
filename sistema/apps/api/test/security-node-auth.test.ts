// Security review of the Node API (auth, sessions, logs, rate limits; 19/11/2026): regressions of the
// findings fixed then. Each block names the CWE it guards against.

import { Writable } from 'node:stream';
import { and, eq, sql } from 'drizzle-orm';
import { forgotPasswordSchema, loginSchema, mfaVerifySchema, resetPasswordSchema, deleteAccountSchema, changePasswordSchema } from '@effinance/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../src/app';
import { auditLogs } from '../src/db/schema';
import { rateLimitKey } from '../src/lib/ip';
import { sanitizeUrl } from '../src/lib/log';
import type { MemoryMailer } from '../src/lib/mailer';
import { FORGOT_PASSWORD_MIN_MS } from '../src/modules/auth/routes';
import { LOGIN_MAX_FAILURES } from '../src/modules/auth/service';
import { admin, createTestApp, registerUser, resetDb, TEST_PASSWORD } from './helpers';

const ONBOARDING_TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';

describe('request logs never carry the public onboarding token (CWE-532)', () => {
  it('masks it in the sanitized URL', () => {
    expect(ONBOARDING_TOKEN).toHaveLength(43);
    expect(sanitizeUrl(`/api/public/onboarding/${ONBOARDING_TOKEN}`)).toBe('/api/public/onboarding/[token]');
    expect(sanitizeUrl(`/api/public/onboarding/${ONBOARDING_TOKEN}/confirm`)).toBe('/api/public/onboarding/[token]/confirm');
  });

  it('masks every credential that travels in a URL (invites, webhook secret, query tokens)', () => {
    const secret = 'S3cr3t_webhook-path-segment-0123456789abcdefgh';
    expect(sanitizeUrl(`/api/invites/${ONBOARDING_TOKEN}`)).toBe('/api/invites/[token]');
    expect(sanitizeUrl(`/api/invites/${ONBOARDING_TOKEN}/accept`)).toBe('/api/invites/[token]/accept');
    expect(sanitizeUrl(`/api/open-finance/webhooks/pluggy/${secret}`)).toBe('/api/open-finance/webhooks/pluggy/[secret]');
    // Query strings: only allow-listed, non-personal keys keep their values.
    expect(sanitizeUrl(`/api/auth/password/reset?token=${ONBOARDING_TOKEN}`)).toBe('/api/auth/password/reset?token=[redacted]');
    expect(sanitizeUrl(`/api/x?access_token=${ONBOARDING_TOKEN}&page=2`)).toBe('/api/x?access_token=[redacted]&page=2');
    // The reset token never reaches a URL the API sees: the e-mailed link carries it in the fragment.
    for (const url of [`/api/invites/${ONBOARDING_TOKEN}`, `/api/open-finance/webhooks/pluggy/${secret}`]) {
      expect(sanitizeUrl(url)).not.toContain(ONBOARDING_TOKEN);
      expect(sanitizeUrl(url)).not.toContain(secret);
    }
  });

  it('keeps it out of the request lines the API writes', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const app = await buildApp({ logger: { level: 'info', stream } });
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: `/api/public/onboarding/${ONBOARDING_TOKEN}` });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
    const log = lines.join('');
    expect(log).toContain('/api/public/onboarding/[token]');
    expect(log).not.toContain(ONBOARDING_TOKEN);
  });
});

describe('per-IP rate limits key an IPv6 client by its /64 (CWE-770)', () => {
  it('groups the addresses of one /64 and keeps IPv4 as is', () => {
    expect(rateLimitKey('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(rateLimitKey('2001:0db8:0001:0002:ffff:ffff:ffff:ffff')).toBe('2001:db8:1:2::/64');
    expect(rateLimitKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(rateLimitKey('2001:db8:1:3::1')).not.toBe(rateLimitKey('2001:db8:1:2::1'));
    expect(rateLimitKey('203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitKey('::1')).toBe('0:0:0:0::/64');
    expect(rateLimitKey(undefined)).toBe('unknown');
  });

  it('a client rotating addresses inside its /64 shares one budget', async () => {
    const app = await createTestApp({ relaxedRateLimits: false });
    try {
      const hit = (i: number) =>
        app.inject({
          method: 'GET',
          url: `/api/public/onboarding/${ONBOARDING_TOKEN}`,
          headers: { 'x-forwarded-for': `2001:db8:1:2:${(i + 1).toString(16)}::1` },
        });
      // The public onboarding page allows 30 requests per minute per client.
      for (let i = 0; i < 30; i++) expect((await hit(i)).statusCode).toBe(404);
      expect((await hit(30)).statusCode).toBe(429);
      // Another /64 still has its own budget.
      const other = await app.inject({
        method: 'GET',
        url: `/api/public/onboarding/${ONBOARDING_TOKEN}`,
        headers: { 'x-forwarded-for': '2001:db8:9:9::1' },
      });
      expect(other.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('login: per-account failure budget (CWE-307) without enumeration (CWE-204)', () => {
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

  const login = (email: string, password: string, ip = '198.51.100.1') =>
    app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password }, headers: { 'x-forwarded-for': ip } });

  it('after the budget is spent from many IPs, even the right password gets the generic answer', async () => {
    const user = await registerUser(app, 'Alvo', 'alvo@teste.com');
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      const res = await login(user.email, `senha-errada-${i}`, `198.51.100.${i + 2}`);
      expect(res.statusCode).toBe(401);
    }
    const locked = await login(user.email, TEST_PASSWORD, '203.0.113.50');
    const unknown = await login('ninguem@teste.com', TEST_PASSWORD, '203.0.113.51');
    expect(locked.statusCode).toBe(401);
    expect(locked.json()).toEqual(unknown.json());
    expect(locked.cookies.find((c) => c.name === 'effinance_token')).toBeUndefined();

    // Failures are recorded against the account (ids only), the lock among them.
    const rows = await admin()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, user.userId), eq(auditLogs.action, 'auth.login_failed')));
    expect(rows).toHaveLength(LOGIN_MAX_FAILURES + 1);
    expect(rows.some((r) => (r.metadata as { locked?: boolean } | null)?.locked === true)).toBe(true);
  });

  it('frees the account once the window passes or the password is reset', async () => {
    const user = await registerUser(app, 'Alvo', 'alvo2@teste.com');
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) await login(user.email, `senha-errada-${i}`);
    expect((await login(user.email, TEST_PASSWORD)).statusCode).toBe(401);

    // Older than the window: no longer counted.
    await admin().execute(sql`update audit_logs set created_at = now() - interval '16 minutes' where user_id = ${user.userId}`);
    expect((await login(user.email, TEST_PASSWORD)).statusCode).toBe(200);

    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) await login(user.email, `senha-errada-${i}`);
    expect((await login(user.email, TEST_PASSWORD)).statusCode).toBe(401);
    // A reset (the owner proving the mailbox) frees it at once.
    const outbox = (app.platform.mailer as MemoryMailer).outbox;
    outbox.length = 0;
    await app.inject({ method: 'POST', url: '/api/auth/password/forgot', payload: { email: user.email } });
    const token = /#token=([A-Za-z0-9_-]+)/.exec(outbox.at(-1)?.text ?? '')?.[1];
    expect(token).toBeDefined();
    const reset = await app.inject({
      method: 'POST',
      url: '/api/auth/password/reset',
      payload: { token, password: 'nova-senha-forte-1' },
    });
    expect(reset.statusCode).toBe(204);
    expect((await login(user.email, 'nova-senha-forte-1')).statusCode).toBe(200);
  });
});

describe('forgot password does not enumerate accounts by timing (CWE-208) nor by Host header (CWE-640)', () => {
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

  it('takes at least the same minimum time for an unknown and an existing e-mail', async () => {
    const user = await registerUser(app, 'Alvo', 'alvo3@teste.com');
    const timed = async (email: string) => {
      const started = performance.now();
      const res = await app.inject({ method: 'POST', url: '/api/auth/password/forgot', payload: { email } });
      expect(res.statusCode).toBe(204);
      return performance.now() - started;
    };
    // Timer granularity: allow a few ms below the floor.
    expect(await timed('ninguem@teste.com')).toBeGreaterThanOrEqual(FORGOT_PASSWORD_MIN_MS - 5);
    expect(await timed(user.email)).toBeGreaterThanOrEqual(FORGOT_PASSWORD_MIN_MS - 5);
  });

  it('builds the link from APP_URL, never from Host / X-Forwarded-Host', async () => {
    const user = await registerUser(app, 'Alvo', 'alvo4@teste.com');
    const outbox = (app.platform.mailer as MemoryMailer).outbox;
    outbox.length = 0;
    await app.inject({
      method: 'POST',
      url: '/api/auth/password/forgot',
      payload: { email: user.email },
      headers: { host: 'evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'http' },
    });
    const text = outbox.at(-1)?.text ?? '';
    expect(text).toContain(`${app.platform.appUrl}/redefinir-senha#token=`);
    expect(text).not.toContain('evil.example');
  });
});

describe('credentials and tokens in auth bodies are bounded (CWE-400)', () => {
  const huge = 'a1'.repeat(600_000);
  it('the schemas refuse megabyte passwords and tokens', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: huge }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: huge, newPassword: 'senha-nova-123' }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ password: huge }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: huge, password: 'senha-nova-123' }).success).toBe(false);
    expect(mfaVerifySchema.safeParse({ mfaToken: huge, code: '123456' }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: `${huge}@b.com` }).success).toBe(false);
    // Still accepted: ordinary values.
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
    expect(deleteAccountSchema.safeParse({ password: TEST_PASSWORD }).success).toBe(true);
  });

  it('a megabyte password on login is a 400, before any hash runs', async () => {
    const app = await createTestApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'a@b.com', password: 'a1'.repeat(400_000) },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
