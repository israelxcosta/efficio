// Client onboarding routes (docs/api.md → "Onboarding do cliente"):
// - /onboarding/template: every member reads; saving needs `office` (the template carries the office's
//   identity — WhatsApp, e-mails, CRC — and goes to every client, like the contract template);
// - /clients/:id/onboarding…: the preview and the history for every member; the client's adjustment with
//   `office` (same as the template); sending and revoking links with `clients` (the team that works on
//   the client's registry, by default everyone);
// - /public/onboarding/:token: no session, rate limited per IP, `no-store` and `noindex`.
// Audit records are written after the tenant transaction commits; never texts, names or CPFs.

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  idSchema,
  ONBOARDING_AUDIT_ACTIONS,
  onboardingConfirmInputSchema,
  onboardingLinkInputSchema,
  onboardingOverridesInputSchema,
  onboardingTemplateInputSchema,
} from '@effinance/shared';
import type { FastifyReply } from 'fastify';
import { audit } from '../../lib/audit';
import { requirePermission } from '../../lib/permissions';
import { rateLimited } from '../../lib/platform';
import { requestContext } from '../../lib/request-context';
import { memberGuards, runScoped } from '../../lib/scoped-context';
import { confirmPublicOnboarding, openPublicOnboarding } from './public';
import { createLink, getHistory, getOverrides, getTemplate, loadDocument, revokeLink, saveOverrides, saveTemplate } from './service';

const office = { onRequest: requirePermission('office') };
const clients = { onRequest: requirePermission('clients') };
const params = z.object({ id: idSchema });
const linkParams = z.object({ id: idSchema, linkId: idSchema });
/** Validated in the service (same 404 for a malformed token). */
const tokenParams = z.object({ token: z.string().max(200) });
/** Texts of the whole template: up to ~250 keys of 1 000 characters. */
const TEMPLATE_BODY_LIMIT = 1024 * 1024;

type AuditReq = Parameters<typeof requestContext>[0] & { workspaceId: string; userId: string };

export const onboardingTemplateRoutes: FastifyPluginAsyncZod = async (app) => {
  memberGuards(app);
  const run = <T>(req: Parameters<typeof runScoped>[1], fn: Parameters<typeof runScoped<T>>[2]) => runScoped<T>(app.db, req, fn);

  app.get('/template', async (req) => run(req, (ctx) => getTemplate(ctx)));

  app.put('/template', { ...office, bodyLimit: TEMPLATE_BODY_LIMIT, schema: { body: onboardingTemplateInputSchema } }, async (req) => {
    const result = await run(req, (ctx) => saveTemplate(ctx, req.body));
    await audit(app.db, {
      ...requestContext(req),
      action: ONBOARDING_AUDIT_ACTIONS.templateUpdated,
      workspaceId: req.workspaceId,
      userId: req.userId,
      entity: 'onboarding_template',
      entityId: req.workspaceId,
      metadata: { texts: Object.keys(result.texts).length, hidden: result.hidden.length },
    });
    return result;
  });
};

export const clientOnboardingRoutes: FastifyPluginAsyncZod = async (app) => {
  memberGuards(app);
  const run = <T>(req: Parameters<typeof runScoped>[1], fn: Parameters<typeof runScoped<T>>[2]) => runScoped<T>(app.db, req, fn);
  const record = (req: AuditReq, action: string, clientId: string, metadata?: Record<string, unknown>) =>
    audit(app.db, { ...requestContext(req), action, workspaceId: req.workspaceId, userId: req.userId, entity: 'client', entityId: clientId, metadata });

  app.get('/:id/onboarding', { schema: { params } }, async (req) => run(req, (ctx) => getHistory(ctx, req.params.id)));

  /** "Ver onboarding": the same document the client sees (no access recorded). */
  app.get('/:id/onboarding/document', { schema: { params } }, async (req) => run(req, (ctx) => loadDocument(ctx, req.params.id)));

  app.get('/:id/onboarding/overrides', { ...office, schema: { params } }, async (req) => run(req, (ctx) => getOverrides(ctx, req.params.id)));

  app.put(
    '/:id/onboarding/overrides',
    { ...office, bodyLimit: TEMPLATE_BODY_LIMIT, schema: { params, body: onboardingOverridesInputSchema } },
    async (req) => {
      const result = await run(req, (ctx) => saveOverrides(ctx, req.params.id, req.body));
      await record(req, ONBOARDING_AUDIT_ACTIONS.overridesUpdated, req.params.id, {
        texts: Object.keys(result.texts).length,
        hidden: result.hidden.length,
        employees: result.employees !== null,
      });
      return result;
    },
  );

  app.post(
    '/:id/onboarding/links',
    { ...clients, schema: { params, body: onboardingLinkInputSchema }, config: rateLimited(app.platform, 30, '1 minute') },
    async (req, reply) => {
      const created = await run(req, (ctx) => createLink(ctx, req.params.id, req.body, app.platform.appUrl));
      await record(req, ONBOARDING_AUDIT_ACTIONS.linkCreated, req.params.id, {
        linkId: created.id,
        channel: created.channel,
        contact: req.body.contact ?? 'typed',
      });
      return reply.code(201).send(created);
    },
  );

  app.delete('/:id/onboarding/links/:linkId', { ...clients, schema: { params: linkParams } }, async (req, reply) => {
    const changed = await run(req, (ctx) => revokeLink(ctx, req.params.id, req.params.linkId));
    if (changed) await record(req, ONBOARDING_AUDIT_ACTIONS.linkRevoked, req.params.id, { linkId: req.params.linkId });
    return reply.code(204).send();
  });
};

function publicHeaders(reply: Pick<FastifyReply, 'header'>) {
  reply.header('cache-control', 'no-store');
  reply.header('x-robots-tag', 'noindex, nofollow');
  reply.header('referrer-policy', 'no-referrer');
}

/** No session: the token in the path is the only credential. */
export const publicOnboardingRoutes: FastifyPluginAsyncZod = async (app) => {
  // Every answer, errors and 429 included.
  app.addHook('onRequest', async (_req, reply) => publicHeaders(reply));

  app.get('/:token', { schema: { params: tokenParams }, config: rateLimited(app.platform, 30, '1 minute') }, async (req) =>
    openPublicOnboarding(app.db, req.params.token, requestVisitor(req)),
  );

  app.post(
    '/:token/confirm',
    { schema: { params: tokenParams, body: onboardingConfirmInputSchema }, config: rateLimited(app.platform, 10, '1 minute') },
    async (req) => {
      const result = await confirmPublicOnboarding(app.db, req.params.token, req.body, requestVisitor(req));
      await audit(app.db, {
        ...requestContext(req),
        action: ONBOARDING_AUDIT_ACTIONS.confirmed,
        workspaceId: result.workspaceId,
        userId: null,
        entity: 'client',
        entityId: result.clientId,
        metadata: { linkId: result.linkId },
      });
      return { confirmedAt: result.confirmedAt };
    },
  );
};

function requestVisitor(req: Parameters<typeof requestContext>[0]) {
  const ctx = requestContext(req);
  return { ip: ctx.ip, userAgent: ctx.userAgent };
}
