// LGPD portability: the owner's export carries the client onboarding too — the office's template, each
// client's adjustment, the links sent (never the token or its hash), their accesses (truncated IP,
// device) and the reading confirmation (name and CPF decrypted, like the other personal data of the
// export). Another workspace's onboarding never shows up.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ONBOARDING_DEFAULT_PARAMS } from '@effinance/shared';
import type { App } from '../src/app';
import { createTestApp, registerUser, resetDb } from './helpers';
import { createClient } from './task-helpers';

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

const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

describe('LGPD export: client onboarding', () => {
  it('exports template, adjustments, links without token, accesses and the confirmation', async () => {
    const owner = await registerUser(app, 'Dona');
    const other = await registerUser(app, 'Outro Dono');
    const clientId = await createClient(owner, { name: 'Pão Quente Ltda' });
    const otherClient = await createClient(other, { name: 'Cliente Alheio Ltda' });

    const saved = await owner.put('/onboarding/template', {
      params: { ...ONBOARDING_DEFAULT_PARAMS, contact: { whatsapp: '(19) 99999-0000', hours: 'Seg. a sex.', crc: 'SP-1/O' } },
      texts: { 'summary.title': 'Sumário do escritório' },
      hidden: [],
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const overrides = await owner.put(`/clients/${clientId}/onboarding/overrides`, { texts: {}, hidden: [], employees: 7 });
    expect(overrides.status, JSON.stringify(overrides.body)).toBe(200);

    const link = await owner.post(`/clients/${clientId}/onboarding/links`, { channel: 'email', to: 'dono@paoquente.com.br' });
    expect(link.status, JSON.stringify(link.body)).toBe(201);
    const token = (link.body.path as string).split('/o/')[1]!;
    const opened = await app.inject({ method: 'GET', url: `/api/public/onboarding/${token}`, headers: { 'user-agent': UA_PHONE }, remoteAddress: '189.6.12.34' });
    expect(opened.statusCode).toBe(200);
    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/public/onboarding/${token}/confirm`,
      payload: { name: 'João da Silva', cpf: '529.982.247-25' },
      headers: { 'user-agent': UA_PHONE },
      remoteAddress: '189.6.12.34',
    });
    expect(confirmed.statusCode).toBe(200);
    // The other workspace has a link of its own.
    expect((await other.post(`/clients/${otherClient}/onboarding/links`, { channel: 'email', to: 'alheio@x.com' })).status).toBe(201);

    const exported = await owner.get('/workspaces/current/export');
    expect(exported.status).toBe(200);
    const body = exported.body;
    expect(body.onboardingClientOverrides).toEqual([expect.objectContaining({ clientId, content: expect.objectContaining({ employees: 7 }) })]);
    expect(body.onboardingTemplate).toMatchObject({ content: expect.objectContaining({ texts: { 'summary.title': 'Sumário do escritório' } }) });
    expect(body.onboardingLinks).toHaveLength(1);
    const [row] = body.onboardingLinks;
    expect(row).toMatchObject({
      id: link.body.id,
      clientId,
      channel: 'email',
      recipientTo: 'dono@paoquente.com.br',
      confirmedName: 'João da Silva',
      confirmedCpf: '52998224725',
    });
    expect(row.tokenHash).toBeUndefined();
    expect(body.onboardingAccesses).toEqual([expect.objectContaining({ linkId: link.body.id, device: 'mobile' })]);
    expect(body.onboardingAccesses[0].ip).not.toBe('189.6.12.34');
    const text = JSON.stringify(body);
    expect(text).not.toContain(token);
    expect(text).not.toMatch(/token_?hash/i);
    expect(text).not.toContain('alheio@x.com');
  });
});
