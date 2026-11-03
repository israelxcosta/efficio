// Unions (sindicatos) and collective agreements under /api/unions (spec §13.7). Every member reads;
// `registry` creates, edits and marks agreements; `deleteRegistry` deletes (by default the
// administrators, as the other registries of the task area). Writes need a subscription (402). Static
// paths come before `/:id` (the browser demo's router takes the first match).

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  unionConventionParamsSchema,
  unionConventionPublishSchema,
  unionConventionsInputSchema,
  unionInputSchema,
  unionQuerySchema,
} from '@effinance/shared';
import { audit } from '../../lib/audit';
import { requirePermission } from '../../lib/permissions';
import { requestContext } from '../../lib/request-context';
import { memberGuards, runScoped } from '../../lib/scoped-context';
import { idParams } from '../common/params';
import {
  createUnion,
  deleteUnion,
  getUnion,
  listUnions,
  saveConventions,
  setConventionPublished,
  updateUnion,
} from './service';

const registry = { onRequest: requirePermission('registry') };

export const unionRoutes: FastifyPluginAsyncZod = async (app) => {
  memberGuards(app);
  const run = runScoped.bind(null, app.db);

  app.get('/', { schema: { querystring: unionQuerySchema } }, async (req) => run(req, (ctx) => listUnions(ctx, req.query)));

  app.post('/', { ...registry, schema: { body: unionInputSchema } }, async (req, reply) =>
    reply.code(201).send(await run(req, (ctx) => createUnion(ctx, req.body))),
  );

  app.get('/:id', { schema: { params: idParams } }, async (req) => run(req, (ctx) => getUnion(ctx, req.params.id)));

  app.put('/:id', { ...registry, schema: { params: idParams, body: unionInputSchema } }, async (req) =>
    run(req, (ctx) => updateUnion(ctx, req.params.id, req.body)),
  );

  app.put('/:id/conventions', { ...registry, schema: { params: idParams, body: unionConventionsInputSchema } }, async (req) =>
    run(req, (ctx) => saveConventions(ctx, req.params.id, req.body)),
  );

  app.patch(
    '/:id/conventions/:year',
    { ...registry, schema: { params: unionConventionParamsSchema, body: unionConventionPublishSchema } },
    async (req) => run(req, (ctx) => setConventionPublished(ctx, req.params.id, req.params.year, req.body.published)),
  );

  app.delete('/:id', { onRequest: requirePermission('deleteRegistry'), schema: { params: idParams } }, async (req, reply) => {
    await run(req, (ctx) => deleteUnion(ctx, req.params.id));
    await audit(app.db, {
      ...requestContext(req),
      action: 'union.deleted',
      workspaceId: req.workspaceId,
      userId: req.userId,
      entity: 'union',
      entityId: req.params.id,
    });
    return reply.code(204).send();
  });
};
