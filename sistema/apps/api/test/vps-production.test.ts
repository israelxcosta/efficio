// Production on a single VPS (Docker Compose: PostgreSQL + API + Caddy): local master key, database on
// the private Docker network, SMTP mail, mandatory two-step verification, structured security log
// lines and the in-process daily jobs.

import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MFA_ENROLLMENT_REQUIRED_ERROR } from '@effinance/shared';
import type { App } from '../src/app';
import { jobsEnabledOf, parseEnv, requireMfaOf } from '../src/env';
import { runDailyJobs, type JobLog } from '../src/jobs/daily';
import { advisoryLock, nextRunAt, startDailyScheduler } from '../src/jobs/scheduler';
import { setSecurityLogSink } from '../src/lib/audit';
import { createSmtpMailer, type SmtpTransportOptions } from '../src/lib/mailer-smtp';
import { executeRows } from '../src/lib/sql';
import { totpCode, totpStep } from '../src/lib/totp';
import { createMailer } from '../src/setup';
import { admin, clientFor, createTestApp, registerUser, resetDb, TEST_PASSWORD } from './helpers';
import { createClient, office, workspaceOf } from './task-helpers';

const VPS: Record<string, string> = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://efficio:senha@db:5432/efficio',
  DATABASE_SSL: 'disable',
  JWT_SECRET: 'Zx9-'.repeat(12),
  KEY_PROVIDER: 'local',
  ENCRYPTION_MASTER_KEY: randomBytes(32).toString('base64'),
  MAILER: 'smtp',
  SMTP_HOST: 'smtp.hostinger.com',
  SMTP_USER: 'nao-responda@efficio.com.br',
  SMTP_PASSWORD: 'senha-da-caixa',
  MAIL_FROM: 'Efficio <nao-responda@efficio.com.br>',
  APP_URL: 'https://efficio.com.br',
  CORS_ORIGIN: 'https://efficio.com.br',
};
const parseVps = (overrides: Record<string, string | undefined> = {}) => parseEnv({ ...VPS, ...overrides }, { billingEnabled: false });
const errorOf = (overrides: Record<string, string | undefined>) => {
  try {
    parseVps(overrides);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};
const silentLog = (): JobLog & { lines: { level: string; msg: string; obj: object }[] } => {
  const lines: { level: string; msg: string; obj: object }[] = [];
  return {
    lines,
    info: (obj, msg) => lines.push({ level: 'info', msg, obj }),
    warn: (obj, msg) => lines.push({ level: 'warn', msg, obj }),
    error: (obj, msg) => lines.push({ level: 'error', msg, obj }),
  };
};

describe('VPS environment (fail closed)', () => {
  it('accepts the VPS setup: local key, database on the Docker network, SMTP on 465', () => {
    const env = parseVps();
    expect(env.KEY_PROVIDER).toBe('local');
    expect(env.SMTP_PORT).toBe(465);
    expect(env.SMTP_SECURE).toBe(true);
    for (const host of ['postgres', 'localhost', '127.0.0.1', '[::1]']) {
      expect(errorOf({ DATABASE_URL: `postgres://efficio:senha@${host}:5432/efficio` })).toBeNull();
    }
  });

  it.each([
    ['database without TLS on another host', { DATABASE_URL: 'postgres://efficio:senha@10.0.0.5:5432/efficio' }, 'DATABASE_SSL'],
    ['database without TLS on a public name', { DATABASE_URL: 'postgres://efficio:senha@db.efficio.com.br:5432/efficio' }, 'DATABASE_SSL'],
    ['TLS without certificate check', { DATABASE_SSL: 'require' }, 'DATABASE_SSL'],
    ['no master key', { ENCRYPTION_MASTER_KEY: undefined }, 'ENCRYPTION_MASTER_KEY'],
    ['a master key of 16 bytes', { ENCRYPTION_MASTER_KEY: randomBytes(16).toString('base64') }, 'ENCRYPTION_MASTER_KEY'],
    ['a master key that is not base64', { ENCRYPTION_MASTER_KEY: '<openssl rand -base64 32>' }, 'ENCRYPTION_MASTER_KEY'],
    ['a repeated-byte master key', { ENCRYPTION_MASTER_KEY: Buffer.alloc(32, 7).toString('base64') }, 'ENCRYPTION_MASTER_KEY'],
    ['the public development key', { ENCRYPTION_MASTER_KEY: '6RyI0WfyJp62Brjgw/Yafu9J1ilEjfF7+58U/TpsdOc=' }, 'ENCRYPTION_MASTER_KEY'],
    ['SMTP without password', { SMTP_PASSWORD: undefined }, 'SMTP_USER'],
    ['SMTP without host', { SMTP_HOST: undefined }, 'SMTP_HOST'],
    ['console mailer', { MAILER: 'console' }, 'MAILER'],
  ])('refuses %s', (_label, overrides, variable) => {
    expect(errorOf(overrides)).toContain(variable);
  });

  it('REQUIRE_MFA and JOBS_ENABLED default to on in production only', () => {
    const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db', JWT_SECRET: 'x'.repeat(40) };
    expect(requireMfaOf(parseVps())).toBe(true);
    expect(jobsEnabledOf(parseVps())).toBe(true);
    expect(requireMfaOf(parseEnv({ ...base, NODE_ENV: 'test' }))).toBe(false);
    expect(jobsEnabledOf(parseEnv({ ...base, NODE_ENV: 'test' }))).toBe(false);
    expect(jobsEnabledOf(parseEnv({ ...base, NODE_ENV: 'development' }))).toBe(false);
    expect(requireMfaOf(parseVps({ REQUIRE_MFA: 'false' }))).toBe(false);
    expect(jobsEnabledOf(parseVps({ JOBS_ENABLED: 'false' }))).toBe(false);
    expect(() => parseVps({ REQUIRE_MFA: 'sim' })).toThrow(/REQUIRE_MFA/);
  });
});

describe('SMTP mailer', () => {
  const options = { from: 'Efficio <nao-responda@efficio.com.br>', host: 'smtp.hostinger.com', port: 465, secure: true, user: 'u@efficio.com.br', password: 'senha-da-caixa' };

  it('verifies TLS, uses short timeouts and sends a header-safe message', async () => {
    let seen: SmtpTransportOptions | null = null;
    const sent: unknown[] = [];
    const mailer = await createSmtpMailer(options, (o) => {
      seen = o;
      return { sendMail: async (m) => void sent.push(m) };
    });
    expect(mailer.name).toBe('smtp');
    expect(mailer.delivers).toBe(true);
    expect(seen).toMatchObject({ secure: true, requireTLS: false, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' }, logger: false });
    expect(seen!.connectionTimeout).toBeLessThanOrEqual(10_000);
    await mailer.send({ to: 'ana@teste.com', subject: 'Convite\r\nBcc: x@y.z', text: 'Olá' });
    expect(sent).toEqual([{ from: options.from, to: 'ana@teste.com', subject: 'Convite Bcc: x@y.z', text: 'Olá' }]);
  });

  it('requires STARTTLS off port 465 and never puts the password or the SMTP dialogue in the error', async () => {
    let seen: SmtpTransportOptions | null = null;
    const mailer = await createSmtpMailer({ ...options, port: 587, secure: false }, (o) => {
      seen = o;
      return {
        sendMail: async () => {
          throw Object.assign(new Error(`535 auth failed for ${options.user} / ${options.password}`), { code: 'EAUTH', responseCode: 535 });
        },
      };
    });
    expect(seen).toMatchObject({ secure: false, requireTLS: true });
    const error = await mailer.send({ to: 'ana@teste.com', subject: 's', text: 't' }).catch((e: Error) => e);
    expect((error as Error).message).toBe('Falha ao enviar e-mail por SMTP (EAUTH 535)');
  });

  it('is built from the environment with nodemailer (no connection until a message is sent)', async () => {
    const mailer = await createMailer(parseVps());
    expect(mailer.name).toBe('smtp');
  });
});

describe('mandatory two-step verification (REQUIRE_MFA)', () => {
  let app: App;
  beforeAll(async () => {
    app = await createTestApp({ requireMfa: true });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(app);
  });

  it('a session without MFA only reaches /me and the enrollment; enabling it frees the same session', async () => {
    const raw = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'Ana', email: 'ana-mfa@teste.com', password: TEST_PASSWORD, acceptTerms: true },
    });
    expect(raw.statusCode).toBe(201);
    expect(raw.json().mfaEnrollmentRequired).toBe(true);
    const ana = clientFor(app, raw.json().token, raw.json().user.id, 'ana-mfa@teste.com');

    const me = await ana.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.mfaRequired).toBe(true);
    expect(me.body.user.mfaEnabled).toBe(false);
    for (const url of ['/categories', '/workspaces', '/auth/sessions', '/tasks/home']) {
      const blocked = await ana.get(url);
      expect(blocked.status, url).toBe(403);
      expect(blocked.body.error).toBe(MFA_ENROLLMENT_REQUIRED_ERROR);
    }
    expect((await ana.post('/accounts', { name: 'Caixa', type: 'checking' })).body.error).toBe(MFA_ENROLLMENT_REQUIRED_ERROR);

    const { secret } = (await ana.post('/auth/mfa/setup')).body;
    const enabled = await ana.post('/auth/mfa/enable', { code: await totpCode(secret, totpStep()) });
    expect(enabled.status).toBe(200);
    expect((await ana.get('/categories')).status).toBe(200);

    // The next login asks for the code as before.
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'ana-mfa@teste.com', password: TEST_PASSWORD } });
    expect(login.json().mfaRequired).toBe(true);
  });

  it('a login of an account without MFA says so; without REQUIRE_MFA nothing changes', async () => {
    await registerUser(app, 'Bia', 'bia-mfa@teste.com');
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'bia-mfa@teste.com', password: TEST_PASSWORD } });
    expect(login.statusCode).toBe(200);
    expect(login.json().mfaEnrollmentRequired).toBe(true);

    const open = await createTestApp();
    try {
      const carla = await registerUser(open, 'Carla');
      expect((await carla.get('/categories')).status).toBe(200);
      const me = await carla.get('/auth/me');
      expect(me.body.mfaRequired).toBe(false);
    } finally {
      await open.close();
    }
  });

  it('security events also leave a structured log line without personal data', async () => {
    const lines: { level: string; line: Record<string, unknown> }[] = [];
    setSecurityLogSink((level, line) => lines.push({ level, line }));
    try {
      await registerUser(app, 'Dani', 'dani-log@teste.com');
      await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'dani-log@teste.com', password: 'senha-errada-123' } });
      const failed = lines.find((l) => l.line.audit === 'auth.login_failed');
      expect(failed?.level).toBe('warn');
      expect(JSON.stringify(lines)).not.toMatch(/dani|teste\.com|senha/i);
      expect(lines.some((l) => l.line.audit === 'auth.register')).toBe(false);
    } finally {
      setSecurityLogSink(null);
    }
  });
});

describe('daily scheduler', () => {
  it('computes the next 03:00 in America/Sao_Paulo', () => {
    expect(nextRunAt(new Date('2026-11-14T05:59:00Z')).toISOString()).toBe('2026-11-14T06:00:00.000Z');
    expect(nextRunAt(new Date('2026-11-14T06:00:00Z')).toISOString()).toBe('2026-11-15T06:00:00.000Z');
    expect(nextRunAt(new Date('2026-12-31T23:30:00Z')).toISOString()).toBe('2027-01-01T06:00:00.000Z');
    // A zone with DST keeps the wall-clock time.
    const ny = { hour: 3, minute: 0, timeZone: 'America/New_York' };
    expect(nextRunAt(new Date('2026-07-01T12:00:00Z'), ny).toISOString()).toBe('2026-07-02T07:00:00.000Z');
    expect(nextRunAt(new Date('2026-12-01T12:00:00Z'), ny).toISOString()).toBe('2026-12-02T08:00:00.000Z');
  });

  it('fires at the scheduled time, re-arms for the next day, survives failures and never overlaps', async () => {
    let clock = new Date('2026-11-14T12:00:00Z');
    const timers: { fn: () => void; ms: number }[] = [];
    const log = silentLog();
    let calls = 0;
    let fail = false;
    let gate: Promise<void> = Promise.resolve();
    const scheduler = startDailyScheduler({
      log,
      now: () => clock,
      setTimer: (fn, ms) => timers.push({ fn, ms }),
      clearTimer: () => {},
      run: async () => {
        calls += 1;
        await gate;
        if (fail) throw new Error('boom');
        return { created: 1 };
      },
    });
    expect(timers[0]?.ms).toBe(18 * 3_600_000); // 12:00Z → 06:00Z next day
    expect(scheduler.nextRun()?.toISOString()).toBe('2026-11-15T06:00:00.000Z');

    clock = new Date('2026-11-15T06:00:00Z');
    fail = true;
    timers[0]!.fn();
    await vi.waitFor(() => expect(timers).toHaveLength(2));
    expect(calls).toBe(1);
    expect(log.lines.some((l) => l.level === 'error' && l.msg === 'job failed')).toBe(true);
    expect(scheduler.nextRun()?.toISOString()).toBe('2026-11-16T06:00:00.000Z');

    fail = false;
    let open!: () => void;
    gate = new Promise((resolve) => (open = resolve));
    const first = scheduler.runNow();
    expect(await scheduler.runNow()).toBe('skipped');
    open();
    expect(await first).toBe('ran');
    scheduler.stop();
    expect(scheduler.nextRun()).toBeNull();
  });

  it('skips a run while another process holds the database lock', async () => {
    const client = admin().$client;
    const holder = await advisoryLock(client, 991_001)();
    expect(holder).not.toBeNull();
    expect(await advisoryLock(client, 991_001)()).toBeNull();
    const log = silentLog();
    let calls = 0;
    const scheduler = startDailyScheduler({
      log,
      setTimer: () => 0,
      clearTimer: () => {},
      tryLock: advisoryLock(client, 991_001),
      run: async () => void (calls += 1),
    });
    expect(await scheduler.runNow()).toBe('skipped');
    await holder!();
    expect(await scheduler.runNow()).toBe('ran');
    expect(calls).toBe(1);
    scheduler.stop();
  });
});

describe('daily jobs', () => {
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

  it('generates the current and the next competence in every workspace (idempotent) and purges expired rows', async () => {
    const { ana, fiscal } = await office(app);
    const ws = await workspaceOf(ana);
    await createClient(ana, { tradeName: 'Padaria' });
    const created = await ana.post('/tasks/recurring', { name: 'DAS', departmentId: fiscal, dueDay: 20, regimes: ['simples_nacional'] });
    expect(created.status).toBe(201);
    // Start from nothing generated (as if nobody had opened a task screen).
    await admin().execute(sql`delete from tasks where workspace_id = ${ws} and recurring_task_id is not null`);
    await admin().execute(sql`delete from task_generation_marks where workspace_id = ${ws}`);
    await admin().execute(sql`update sessions set expires_at = '2026-10-01T00:00:00Z' where user_id = ${ana.userId}`);

    const log = silentLog();
    const now = () => new Date('2026-10-20T06:00:00Z');
    const first = await runDailyJobs({ db: app.db, maintenanceDb: admin(), billingEnabled: false, log, now });
    expect(first.competences).toEqual(['2026-10', '2026-11']);
    expect(first.created).toBeGreaterThan(0);
    expect(first.failed).toBe(0);
    expect(first.retention).toMatchObject({ sessions: expect.any(Number) });
    expect((first.retention as { sessions: number }).sessions).toBeGreaterThan(0);
    const competences = await executeRows<{ competence: string }>(
      admin(),
      sql`select distinct competence from tasks where workspace_id = ${ws} and recurring_task_id is not null order by competence`,
    );
    expect(competences.map((r) => r.competence)).toEqual(['2026-10', '2026-11']);

    const second = await runDailyJobs({ db: app.db, maintenanceDb: admin(), billingEnabled: false, log, now });
    expect(second.created).toBe(0);
  });

  it('a least-privileged API login skips the clean-up with a warning and still generates', async () => {
    const log = silentLog();
    const result = await runDailyJobs({ db: app.db, billingEnabled: false, log, now: () => new Date('2026-10-20T06:00:00Z') });
    expect(result.retention).toBe('skipped_no_privilege');
    expect(log.lines.some((l) => l.level === 'warn')).toBe(true);
    expect(result.failed).toBe(0);
  });
});
