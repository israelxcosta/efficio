// Security review of the Node API (19/11/2026), findings raised by the LGPD review
// (docs/security/privacidade-lgpd-2026-11-19.md): full IPs in request logs, IPv6 masking that kept the
// host part, the full user agent in the onboarding confirmation audit, and onboarding accesses kept forever.

import { Writable } from 'node:stream';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ONBOARDING_AUDIT_ACTIONS } from '@effinance/shared';
import { buildApp, type App } from '../src/app';
import { maskIp } from '../src/lib/ip';
import { serializeRequest } from '../src/lib/log';
import { executeRows } from '../src/lib/sql';
import { ACCESS_RETENTION_MONTHS } from '../src/modules/onboarding/service';
import { admin, createTestApp, registerUser, resetDb, saveOnboardingParams, type Client } from './helpers';
import { cnpj } from './task-helpers';

const UA_PHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

describe('IP truncation (CWE-359)', () => {
  it('masks IPv6 on the expanded address (/48), IPv4 on /24', () => {
    expect(maskIp('2804::5')).toBe('2804:0:0:x');
    expect(maskIp('2804:14c:5b:1::1')).toBe('2804:14c:5b:x');
    expect(maskIp('2804:14c::1:2:3')).toBe('2804:14c:0:x');
    expect(maskIp('::1')).toBe('0:0:0:x');
    expect(maskIp('189.6.12.34')).toBe('189.6.12.x');
    expect(maskIp('::ffff:189.6.12.34')).toBe('189.6.12.x');
    expect(maskIp('not-an-ip')).toBeNull();
    expect(maskIp('2804::5::1')).toBeNull();
  });

  it('request log lines carry the truncated IP only', async () => {
    expect(serializeRequest({ method: 'GET', url: '/api/health', ip: '203.0.113.77' }).remoteAddress).toBe('203.0.113.x');
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
      await app.inject({ method: 'GET', url: '/api/health', headers: { 'x-forwarded-for': '203.0.113.77' } });
      await app.inject({ method: 'GET', url: '/api/health', headers: { 'x-forwarded-for': '2804:14c:5b:1::abcd' } });
    } finally {
      await app.close();
    }
    const log = lines.join('');
    expect(log).toContain('203.0.113.x');
    expect(log).toContain('2804:14c:5b:x');
    expect(log).not.toContain('203.0.113.77');
    expect(log).not.toContain('abcd');
  });
});

describe('public onboarding: minimization (LGPD)', () => {
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

  let seq = 52_000_000;
  async function clientOf(owner: Client): Promise<string> {
    await saveOnboardingParams(owner);
    seq += 7;
    const res = await owner.post('/clients', {
      name: `Mercado Privado ${seq} Ltda`,
      document: cnpj(seq),
      taxRegime: 'simples_nacional',
      simplesAnnex: 'I',
      contractStartDate: '2025-01-10',
      email: 'contato@privado.com.br',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.id;
  }
  async function newLink(owner: Client, clientId: string): Promise<{ id: string; token: string }> {
    const res = await owner.post(`/clients/${clientId}/onboarding/links`, { channel: 'email', contact: 'company' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return { id: res.body.id, token: res.body.path.replace('/o/', '') };
  }
  const open = (token: string) =>
    app.inject({ method: 'GET', url: `/api/public/onboarding/${token}`, headers: { 'user-agent': UA_PHONE } });

  it('the confirmation audit keeps the user agent summary, never the full string', async () => {
    const owner = await registerUser(app, 'Dona do Escritório');
    const { token } = await newLink(owner, await clientOf(owner));
    const res = await app.inject({
      method: 'POST',
      url: `/api/public/onboarding/${token}/confirm`,
      payload: { name: 'João da Silva', cpf: '529.982.247-25' },
      headers: { 'user-agent': UA_PHONE },
    });
    expect(res.statusCode, res.body).toBe(200);
    const rows = await executeRows<{ user_agent: string | null }>(
      admin(),
      sql`select user_agent from audit_logs where action = ${ONBOARDING_AUDIT_ACTIONS.confirmed}`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_agent).toBe('Safari · iOS · mobile');
  });

  it(`deletes the accesses of links expired more than ${ACCESS_RETENTION_MONTHS} months ago`, async () => {
    const owner = await registerUser(app, 'Dona do Escritório');
    const clientId = await clientOf(owner);
    const old = await newLink(owner, clientId);
    const recent = await newLink(owner, clientId);
    expect((await open(old.token)).statusCode).toBe(200);
    expect((await open(recent.token)).statusCode).toBe(200);
    const accessesOf = async (linkId: string) =>
      (await executeRows<{ n: number }>(admin(), sql`select count(*)::int as n from onboarding_accesses where link_id = ${linkId}`))[0]!.n;
    expect(await accessesOf(old.id)).toBe(1);

    // One expired 13 months ago (gone at the next clean-up), one 11 months ago (kept).
    await admin().execute(sql`update onboarding_links set created_at = now() - interval '14 months', expires_at = now() - interval '13 months' where id = ${old.id}`);
    await admin().execute(sql`update onboarding_links set created_at = now() - interval '12 months', expires_at = now() - interval '11 months' where id = ${recent.id}`);
    await newLink(owner, clientId);
    expect(await accessesOf(old.id)).toBe(0);
    expect(await accessesOf(recent.id)).toBe(1);
  });
});
