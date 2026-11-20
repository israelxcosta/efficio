// Security review of the Node API, second batch (threat model docs/security/threat-model.md and pentest
// docs/security/pentest-2026-11-20.md): step-up re-authentication (T2), the default rate limit (T9),
// macros and executables in attachments (T10), onboarding accesses purged by the daily job, Mercado Pago
// replays, the single-use MFA challenge, generic framework errors and X-Frame-Options.

import { sql } from 'drizzle-orm';
import { REAUTH_REQUIRED_ERROR } from '@effinance/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GLOBAL_RATE_LIMIT_PER_MINUTE, type App } from '../src/app';
import { runDailyJobs } from '../src/jobs/daily';
import { executeRows } from '../src/lib/sql';
import { totpCode, totpStep } from '../src/lib/totp';
import { hmacSha256Hex, signatureManifest } from '../src/modules/billing/providers/signature';
import { MercadoPagoProvider } from '../src/modules/billing/providers/mercadopago';
import { handleWebhook } from '../src/modules/billing/service';
import { REAUTH_MAX_FAILURES } from '../src/modules/auth/step-up';
import { attachmentProblem, MACRO_REFUSED } from '../src/modules/tasks/file-check';
import { admin, createTestApp, registerUser, resetDb, saveOnboardingParams, TEST_PASSWORD, type Client } from './helpers';
import { cnpj } from './task-helpers';

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

/** The session logged in long ago (outside the step-up window) and never re-authenticated. */
async function ageSession(c: Client) {
  await admin().execute(sql`update sessions set session_started_at = now() - interval '10 minutes' where user_id = ${c.userId}`);
  await admin().execute(sql`delete from audit_logs where user_id = ${c.userId} and action = 'auth.reauthenticated'`);
}

async function enableMfa(c: Client): Promise<{ secret: string; recoveryCodes: string[] }> {
  const setup = await c.post('/auth/mfa/setup');
  const secret = setup.body.secret as string;
  const enabled = await c.post('/auth/mfa/enable', { code: await totpCode(secret, totpStep()) });
  expect(enabled.status, JSON.stringify(enabled.body)).toBe(200);
  return { secret, recoveryCodes: enabled.body.recoveryCodes };
}

/** A fresh TOTP code (the anti-replay step is reset so each check gets one). */
async function freshCode(c: Client, secret: string): Promise<string> {
  await admin().execute(sql`update users set mfa_last_step = null where id = ${c.userId}`);
  return totpCode(secret, totpStep());
}

describe('step-up re-authentication of sensitive actions (T2, CWE-306)', () => {
  it('the export needs a recent re-authentication of the session; it lasts 5 minutes', async () => {
    const owner = await registerUser(app, 'Dona');
    // Right after the login: allowed (the login is the re-authentication).
    expect((await owner.get('/workspaces/current/export')).status).toBe(200);

    await ageSession(owner);
    const refused = await owner.get('/workspaces/current/export');
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({ error: REAUTH_REQUIRED_ERROR, details: { reauthRequired: true, mfa: false } });

    expect((await owner.post('/auth/reauthenticate', { password: 'senha-errada-1' })).status).toBe(422);
    expect((await owner.post('/auth/reauthenticate', { password: TEST_PASSWORD })).status).toBe(204);
    expect((await owner.get('/workspaces/current/export')).status).toBe(200);

    // The stamp is per session and expires.
    await admin().execute(sql`update audit_logs set created_at = now() - interval '6 minutes' where user_id = ${owner.userId} and action = 'auth.reauthenticated'`);
    expect((await owner.get('/workspaces/current/export')).status).toBe(422);
  });

  it('deleting the workspace asks for the password (and checks it)', async () => {
    const owner = await registerUser(app, 'Dona');
    const second = await owner.post('/workspaces', { name: 'Filial', kind: 'business' });
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    await ageSession(owner);
    const name = (await owner.get('/auth/me')).body.workspace.name as string;
    expect((await owner.del('/workspaces/current', { confirmName: name })).body).toMatchObject({ error: REAUTH_REQUIRED_ERROR });
    expect((await owner.del('/workspaces/current', { confirmName: name, password: 'senha-errada-1' })).status).toBe(422);
    expect((await owner.del('/workspaces/current', { confirmName: name, password: TEST_PASSWORD })).status).toBe(204);
  });

  it('with 2FA on, password change, account deletion and turning 2FA off need the code too', async () => {
    const user = await registerUser(app, 'Dona');
    const { secret } = await enableMfa(user);
    await ageSession(user);

    const noCode = await user.post('/auth/password', { currentPassword: TEST_PASSWORD, newPassword: 'nova-senha-forte-1' });
    expect(noCode.status).toBe(422);
    expect(noCode.body).toMatchObject({ error: REAUTH_REQUIRED_ERROR, details: { mfa: true } });
    const changed = await user.post('/auth/password', {
      currentPassword: TEST_PASSWORD,
      newPassword: 'nova-senha-forte-1',
      code: await freshCode(user, secret),
    });
    expect(changed.status, JSON.stringify(changed.body)).toBe(204);

    await ageSession(user);
    // Turning 2FA off: the code alone (a stolen session that saw one) is not enough.
    expect((await user.post('/auth/mfa/disable', { code: await freshCode(user, secret) })).body).toMatchObject({ error: REAUTH_REQUIRED_ERROR });
    const disabled = await user.post('/auth/mfa/disable', { code: await freshCode(user, secret), password: 'nova-senha-forte-1' });
    expect(disabled.status, JSON.stringify(disabled.body)).toBe(204);

    const again = await enableMfa(user);
    await ageSession(user);
    expect((await user.del('/auth/me', { password: 'nova-senha-forte-1' })).body).toMatchObject({ error: REAUTH_REQUIRED_ERROR });
    expect((await user.del('/auth/me', { password: 'nova-senha-forte-1', code: await freshCode(user, again.secret) })).status).toBe(204);
  });

  it('new recovery codes need the step-up; the old ones stop working', async () => {
    const user = await registerUser(app, 'Dona');
    const { secret, recoveryCodes } = await enableMfa(user);
    await ageSession(user);
    expect((await user.post('/auth/mfa/recovery-codes', {})).body).toMatchObject({ error: REAUTH_REQUIRED_ERROR });
    const fresh = await user.post('/auth/mfa/recovery-codes', { password: TEST_PASSWORD, code: await freshCode(user, secret) });
    expect(fresh.status, JSON.stringify(fresh.body)).toBe(200);
    expect(fresh.body.recoveryCodes).toHaveLength(8);

    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: user.email, password: TEST_PASSWORD } });
    const mfaToken = login.json().mfaToken as string;
    const verify = (code: string) => app.inject({ method: 'POST', url: '/api/auth/mfa/verify', payload: { mfaToken, code } });
    expect((await verify(recoveryCodes[0]!)).statusCode).toBe(401);
    expect((await verify(fresh.body.recoveryCodes[0])).statusCode).toBe(200);
  });

  it('wrong passwords in step-ups spend a per-account budget (any IP)', async () => {
    const user = await registerUser(app, 'Dona');
    await ageSession(user);
    for (let i = 0; i < REAUTH_MAX_FAILURES; i++) {
      expect((await user.post('/auth/reauthenticate', { password: `errada-${i}` })).status).toBe(422);
    }
    expect((await user.post('/auth/reauthenticate', { password: TEST_PASSWORD })).status).toBe(429);
  });

  it("another user's session id is a 404 (never 401)", async () => {
    const a = await registerUser(app, 'Ana');
    const b = await registerUser(app, 'Bia');
    const foreign = ((await b.get('/auth/sessions')).body as { id: string }[])[0]!.id;
    const res = await a.del(`/auth/sessions/${foreign}`);
    expect(res.status).toBe(404);
    expect((await b.get('/auth/me')).status).toBe(200);
  });
});

describe('the MFA challenge works once (pentest 1, CWE-294)', () => {
  it('a second success with the same challenge token is refused', async () => {
    const user = await registerUser(app, 'Dona');
    const { secret, recoveryCodes } = await enableMfa(user);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: user.email, password: TEST_PASSWORD } });
    const mfaToken = login.json().mfaToken as string;
    const verify = (code: string) => app.inject({ method: 'POST', url: '/api/auth/mfa/verify', payload: { mfaToken, code } });
    expect((await verify(await freshCode(user, secret))).statusCode).toBe(200);
    const replay = await verify(recoveryCodes[0]!);
    expect(replay.statusCode).toBe(401);
    expect(replay.json().message).toBe('A verificação expirou. Entre novamente.');
    // The recovery code was not spent by the refused attempt.
    const next = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: user.email, password: TEST_PASSWORD } });
    const ok = await app.inject({ method: 'POST', url: '/api/auth/mfa/verify', payload: { mfaToken: next.json().mfaToken, code: recoveryCodes[0] } });
    expect(ok.statusCode).toBe(200);
  });
});

describe('default rate limit on every route (T9, CWE-770)', () => {
  it('a route without its own limit is still limited; health checks are not', async () => {
    const strict = await createTestApp({ relaxedRateLimits: false });
    try {
      const hit = (url: string) => strict.inject({ method: 'GET', url, headers: { 'x-forwarded-for': '198.51.100.9' } });
      for (let i = 0; i < GLOBAL_RATE_LIMIT_PER_MINUTE; i++) expect((await hit('/api/billing/plans')).statusCode).toBe(200);
      const limited = await hit('/api/billing/plans');
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toEqual({ error: 'too_many_requests', message: 'Muitas tentativas. Aguarde um pouco.' });
      for (let i = 0; i < 5; i++) expect((await hit('/api/health')).statusCode).toBe(200);
    } finally {
      await strict.close();
    }
  });
});

describe('attachments never carry macros or programs (T10, CWE-434)', () => {
  /** A ZIP with stored entries. */
  function zip(names: string[]): Uint8Array {
    const enc = new TextEncoder();
    const parts: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;
    for (const n of names) {
      const name = enc.encode(n);
      const data = enc.encode('x');
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      local.set(name, 30);
      const cd = new Uint8Array(46 + name.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      cd.set(name, 46);
      parts.push(local, data);
      central.push(cd);
      offset += local.length + data.length;
    }
    const size = central.reduce((n, c) => n + c.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, names.length, true);
    ev.setUint16(10, names.length, true);
    ev.setUint32(12, size, true);
    ev.setUint32(16, offset, true);
    const all = [...parts, ...central, eocd];
    const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
    let p = 0;
    for (const part of all) {
      out.set(part, p);
      p += part.length;
    }
    return out;
  }
  const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  it('refuses VBA projects in DOCX/XLSX and DOC/XLS', () => {
    expect(attachmentProblem('a.docx', DOCX, zip(['[Content_Types].xml', 'word/document.xml']))).toBeNull();
    expect(attachmentProblem('a.docx', DOCX, zip(['[Content_Types].xml', 'word/document.xml', 'word/vbaProject.bin']))).toBe(MACRO_REFUSED);
    expect(attachmentProblem('a.xlsx', XLSX, zip(['[Content_Types].xml', 'xl/workbook.xml', 'xl/activeX/activeX1.xml']))).toBe(MACRO_REFUSED);
    const ole = new Uint8Array(1024);
    ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(attachmentProblem('a.xls', 'application/vnd.ms-excel', ole)).toBeNull();
    ole.set(Array.from('_VBA_PROJECT_CUR').flatMap((c) => [c.charCodeAt(0), 0]), 512);
    expect(attachmentProblem('a.xls', 'application/vnd.ms-excel', ole)).toBe(MACRO_REFUSED);
  });

  it('refuses executables, scripts and macro-enabled files inside a ZIP — every entry, not only the first 200', () => {
    expect(attachmentProblem('a.zip', 'application/zip', zip(['nota.pdf', 'planilha.xlsx']))).toBeNull();
    for (const bad of ['setup.exe', 'run.BAT', 'x/script.ps1', 'relatorio.xlsm', 'modelo.dotm', 'a.xlsb', 'deck.pptm', 'atalho.lnk']) {
      expect(attachmentProblem('a.zip', 'application/zip', zip(['nota.pdf', bad])), bad).toBe(MACRO_REFUSED);
    }
    const many = Array.from({ length: 250 }, (_, i) => `doc-${i}.pdf`);
    expect(attachmentProblem('a.zip', 'application/zip', zip([...many, 'virus.exe']))).toBe(MACRO_REFUSED);
  });

  it('refuses native executables and shebang scripts by their bytes, whatever they claim', () => {
    const pe = new Uint8Array(256);
    pe.set([0x4d, 0x5a]);
    new DataView(pe.buffer).setUint32(0x3c, 0x80, true);
    pe.set([0x50, 0x45, 0, 0], 0x80);
    expect(attachmentProblem('a.pdf', 'application/pdf', pe)).toBe(MACRO_REFUSED);
    expect(attachmentProblem('a.txt', 'text/plain', new TextEncoder().encode('#!/bin/sh\nrm -rf ~'))).toBe(MACRO_REFUSED);
    expect(attachmentProblem('a.pdf', 'application/pdf', Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]))).toBe(MACRO_REFUSED);
    // A text that merely starts with "MZ" is not an executable.
    expect(attachmentProblem('a.csv', 'text/csv', new TextEncoder().encode('MZ Contabilidade;10,00\n'))).toBeNull();
  });
});

describe('the daily job purges old onboarding accesses in every workspace (LGPD)', () => {
  it('deletes the accesses of links expired more than 12 months ago', async () => {
    const owner = await registerUser(app, 'Dona');
    await saveOnboardingParams(owner);
    const client = await owner.post('/clients', {
      name: 'Mercado Antigo Ltda',
      document: cnpj(63_000_011),
      taxRegime: 'simples_nacional',
      simplesAnnex: 'I',
      contractStartDate: '2025-01-10',
      email: 'contato@antigo.com.br',
    });
    expect(client.status, JSON.stringify(client.body)).toBe(201);
    const link = await owner.post(`/clients/${client.body.id}/onboarding/links`, { channel: 'email', contact: 'company' });
    expect(link.status).toBe(201);
    const token = (link.body.path as string).replace('/o/', '');
    expect((await app.inject({ method: 'GET', url: `/api/public/onboarding/${token}` })).statusCode).toBe(200);
    await admin().execute(
      sql`update onboarding_links set created_at = now() - interval '14 months', expires_at = now() - interval '13 months' where id = ${link.body.id}`,
    );
    const log = { info: () => {}, warn: () => {}, error: () => {} };
    const result = await runDailyJobs({ db: app.db, maintenanceDb: admin(), billingEnabled: false, log });
    expect(result.onboardingAccesses).toBe(1);
    const [left] = await executeRows<{ n: number }>(admin(), sql`select count(*)::int as n from onboarding_accesses`);
    expect(left!.n).toBe(0);
  });
});

describe('Mercado Pago: a replayed signed delivery is a duplicate, even with another body id (CWE-294)', () => {
  it('is never processed twice', async () => {
    const secret = 'mp-webhook-secret-replay';
    let fetched = 0;
    const provider = new MercadoPagoProvider({
      accessToken: 'TEST',
      webhookSecret: secret,
      fetch: (async () => {
        fetched++;
        return new Response(JSON.stringify({ id: 'pre_x', status: 'pending', external_reference: null }), { status: 200 });
      }) as typeof fetch,
    });
    const ts = String(Math.floor(Date.now() / 1000));
    const v1 = await hmacSha256Hex(secret, signatureManifest('pre_x', 'req-1', ts));
    const delivery = (id: string) => ({
      headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'req-1' },
      query: { 'data.id': 'pre_x', type: 'subscription_preapproval' },
      body: { id, type: 'subscription_preapproval', data: { id: 'pre_x' } },
    });
    const platform = { billing: provider, billingEnabled: true } as never;
    expect(await handleWebhook(app.db, platform, delivery('evt-1'))).toMatchObject({ duplicate: false });
    const calls = fetched;
    // Same signature, the unsigned body id changed to dodge the idempotency key.
    expect(await handleWebhook(app.db, platform, delivery('evt-2'))).toMatchObject({ duplicate: true });
    expect(fetched).toBe(calls);
    const [events] = await executeRows<{ n: number }>(admin(), sql`select count(*)::int as n from billing_events`);
    expect(events!.n).toBe(1);
  });
});

describe('framework errors and framing (pentest 4, CWE-209 / CWE-1021)', () => {
  it('a broken JSON body gets a generic 400, no Fastify internals', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'bad_request', message: 'Requisição inválida.' });
    expect(res.body).not.toMatch(/FST_|JSON/);
  });

  it('sends X-Frame-Options: DENY with frame-ancestors none', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(String(res.headers['content-security-policy'])).toContain("frame-ancestors 'none'");
  });
});
