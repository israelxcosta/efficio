// Billing switched off (`BILLING_ENABLED = false`, paid plans left for a future rollout): every
// workspace works as with an active subscription and the charging routes are gone. The switch is
// injected (`platform.billingEnabled`), so this file keeps covering the switched-off path whatever the
// constant says; billing.test.ts and the 402 tests inject `true` for the switched-on path.

import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BILLING_ENABLED } from '@effinance/shared';
import type { App } from '../src/app';
import { env } from '../src/env';
import { billingEnabled } from '../src/lib/platform';
import { executeRows } from '../src/lib/sql';
import { summarizeSubscription } from '../src/modules/billing/entitlements';
import { hmacSha256Hex, signatureManifest } from '../src/modules/billing/providers/signature';
import { FakeOpenFinanceProvider } from '../src/modules/open-finance/providers/fake';
import type { OpenFinanceSetup } from '../src/modules/open-finance/providers/types';
import { settleOpenFinanceJobs } from '../src/modules/open-finance/webhooks';
import { createPlatform } from '../src/setup';
import { admin, createTestApp, registerUser, resetDb, type Client } from './helpers';

const OF_SECRET = 'whsec_cobranca_desligada_0123456789_abcdefghijklmnop';

let app: App;
let originalOpenFinance: OpenFinanceSetup | null | undefined;
beforeAll(async () => {
  app = await createTestApp({ billingEnabled: false });
  originalOpenFinance = app.platform.openFinance;
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
});
afterEach(async () => {
  await settleOpenFinanceJobs();
  app.platform.openFinance = originalOpenFinance;
});

/** What the web reads with billing off: an active subscription, nothing to warn about. */
const ACTIVE = { status: 'active', canWrite: true, trialEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };

const workspaceOf = async (c: Client) => (await c.get('/auth/me')).body.workspace.id as string;
const expireTrial = (workspaceId: string) =>
  admin().execute(sql`update subscriptions set trial_ends_at = now() - interval '30 days' where workspace_id = ${workspaceId}`);
const billingEvents = async () =>
  (await executeRows<{ n: number }>(admin(), sql`select count(*)::int as n from billing_events`))[0]!.n;

describe('billing switched off', () => {
  it('reports an active subscription everywhere, also after the trial date has passed', async () => {
    const owner = await registerUser(app, 'Sem Cobrança');
    const me = (await owner.get('/auth/me')).body;
    expect(me.workspace.subscription).toEqual({ planCode: null, ...ACTIVE });

    await expireTrial(me.workspace.id);
    const after = (await owner.get('/auth/me')).body;
    expect(after.workspace.subscription).toEqual({ planCode: null, ...ACTIVE });
    expect(after.workspaces[0].subscription).toEqual({ planCode: null, ...ACTIVE });
    expect((await owner.get('/workspaces')).body[0].subscription).toEqual({ planCode: null, ...ACTIVE });
    // The members screen still reads the member count and limit from here.
    expect((await owner.get('/billing/subscription')).body).toMatchObject({ ...ACTIVE, memberCount: 1, maxMembers: 15 });
    expect((await owner.get('/workspaces/current/export')).body.subscription).toEqual({ planCode: null, ...ACTIVE });
  });

  it('never answers 402: every write guard lets an expired trial or a plan canceled long ago through', async () => {
    const owner = await registerUser(app, 'Escrita Livre');
    const workspaceId = await workspaceOf(owner);
    app.platform.openFinance = { provider: new FakeOpenFinanceProvider(), webhookUrl: null, webhookSecret: OF_SECRET };

    const writes = (n: number): [string, string, unknown][] => [
      ['POST', '/accounts', { name: `Caixa ${n}`, type: 'checking' }], // lib/tenant-routes.ts
      ['POST', '/open-finance/dev/connect', { institutionId: 'nubank' }], // lib/tenant-scope.ts
      ['POST', '/tasks', { title: `Fechar o mês ${n}` }], // modules/tasks/access.ts
      ['POST', '/office/contract-template/reset', {}], // lib/scoped-context.ts
      ['POST', '/workspaces/current/invites', { email: `convite${n}@teste.com`, role: 'viewer' }], // workspace routes
    ];
    const statusOf = async (method: string, url: string, body: unknown) =>
      (await app.inject({ method: method as 'POST', url: `/api${url}`, headers: { authorization: `Bearer ${owner.token}` }, payload: body as object }))
        .statusCode;

    await expireTrial(workspaceId);
    for (const [method, url, body] of writes(1)) expect(await statusOf(method, url, body), `${method} ${url}`).toBeLessThan(300);

    await admin().execute(
      sql`update subscriptions set status = 'canceled', plan_code = 'business_monthly', current_period_end = now() - interval '1 day' where workspace_id = ${workspaceId}`,
    );
    for (const [method, url, body] of writes(2)) expect(await statusOf(method, url, body), `${method} ${url}`).toBeLessThan(300);
    expect((await owner.get('/auth/me')).body.workspace.subscription).toEqual({ planCode: 'business_monthly', ...ACTIVE });
  });

  it('open finance webhooks keep syncing a workspace whose trial has ended', async () => {
    const user = await registerUser(app, 'Sincroniza Sempre');
    const workspaceId = await workspaceOf(user);
    app.platform.openFinance = { provider: new FakeOpenFinanceProvider(), webhookUrl: null, webhookSecret: OF_SECRET };
    const { itemId } = (await user.post('/open-finance/dev/connect', { institutionId: 'nubank' })).body;
    const created = await user.post('/open-finance/connections', { itemId });
    const bank = created.body.accounts.find((a: { kind: string }) => a.kind === 'bank');
    await user.put(`/open-finance/connections/${created.body.id}/accounts`, { links: [{ connectionAccountId: bank.id, target: { kind: 'new' } }] });
    await expireTrial(workspaceId);

    const hook = await app.inject({
      method: 'POST',
      url: `/api/open-finance/webhooks/fake/${OF_SECRET}`,
      payload: { event: 'item/updated', eventId: 'evt-sem-cobranca', itemId },
    });
    expect(hook.statusCode).toBe(200);
    await settleOpenFinanceJobs();
    const [synced] = await executeRows<{ n: number }>(
      admin(),
      sql`select count(*)::int as n from transactions where workspace_id = ${workspaceId} and origin = 'open_finance'`,
    );
    expect(synced!.n).toBeGreaterThan(0);
  });

  it('answers 404 on checkout, cancel, simulated activation and the Mercado Pago webhook', async () => {
    const owner = await registerUser(app, 'Dona Sem Plano');
    for (const [url, body] of [
      ['/billing/checkout', { planCode: 'business_monthly' }],
      ['/billing/cancel', undefined],
      ['/billing/dev/activate', { planCode: 'business_monthly' }],
    ] as const) {
      const res = await owner.post(url, body);
      expect(res.status, url).toBe(404);
      expect(res.body, url).toEqual({ error: 'not_found', message: 'Rota não encontrada' });
    }

    // Even a correctly signed notification is not processed (nor stored).
    const ts = String(Math.floor(Date.now() / 1000));
    const v1 = await hmacSha256Hex('qualquer-segredo', signatureManifest('pre_1', 'req-1', ts));
    const webhook = await app.inject({
      method: 'POST',
      url: '/api/billing/webhooks/mercadopago?data.id=pre_1&type=subscription_preapproval',
      headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'req-1' },
      payload: { id: 'evt-1', type: 'subscription_preapproval', action: 'updated', data: { id: 'pre_1' } },
    });
    expect(webhook.statusCode).toBe(404);
    expect(await billingEvents()).toBe(0);

    // Untouched by checkout: the subscription row still says trial, the summary says active.
    expect((await owner.get('/auth/me')).body.workspace.subscription).toMatchObject(ACTIVE);
    expect((await owner.get('/billing/plans')).status).toBe(200);
  });
});

describe('billing switch', () => {
  it('only rewrites the summary while off; the billing rules stay as they are for when it is on', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    const expired = {
      workspaceId: 'w',
      planCode: null,
      status: 'trialing',
      provider: null,
      providerSubscriptionId: null,
      trialEndsAt: new Date(now.getTime() - 1),
      currentPeriodEnd: null,
      pastDueSince: null,
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    } as never;
    expect(summarizeSubscription(expired, false, now)).toEqual({ planCode: null, ...ACTIVE });
    expect(summarizeSubscription(null, false, now)).toEqual({ planCode: null, ...ACTIVE });
    expect(summarizeSubscription(expired, true, now)).toMatchObject({ status: 'expired', canWrite: false });
  });

  it('follows BILLING_ENABLED unless the platform says otherwise', async () => {
    expect(billingEnabled({})).toBe(BILLING_ENABLED);
    expect(billingEnabled(undefined)).toBe(BILLING_ENABLED);
    expect(billingEnabled({ billingEnabled: true })).toBe(true);
    expect(billingEnabled({ billingEnabled: false })).toBe(false);
    expect((await createPlatform(env)).billingEnabled).toBe(BILLING_ENABLED);
    expect(app.platform.billingEnabled).toBe(false);
  });
});
