// Records of a client that need the system connection besides the tenant transaction, under
// /api/clients (next to the financial client routes, outside their boundary):
// - revealing an encrypted access (spec §13.8.3): permission `clientCredentials` (by default the
//   administrators), a POST never cached, a limit per member per minute on top of the per-IP one, and an
//   audit record (who, when, which field — never the value) written BEFORE the value leaves. Reading is
//   not a write: it works without an active subscription, like every read;
// - who saw each access (the audit records of the client);
// - registering that a contract was issued (optional, spec §18.16): permission `finance`.

import { and, count, desc, eq, gt, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  clientCredentialRevealSchema,
  idSchema,
  MAX_CREDENTIAL_REVEALS_PER_MINUTE,
  type ClientCredentialField,
  type ClientCredentialReveal,
  type ClientCredentialView,
} from '@effinance/shared';
import { auditLogs, users } from '../../db/schema';
import { audit } from '../../lib/audit';
import { NotFoundError, TooManyRequestsError } from '../../lib/errors';
import { requirePermission } from '../../lib/permissions';
import { rateLimited } from '../../lib/platform';
import { requestContext } from '../../lib/request-context';
import { runScoped } from '../../lib/scoped-context';
import { assertSubscriptionAllowsWrite } from '../workspaces/access';
import { revealCredential } from '../clients/fiscal';
import { getClientOrThrow } from '../common/ownership';
import { templateVersion } from '../office/service';

export const CREDENTIAL_REVEALED_ACTION = 'client.credential_revealed';
const params = z.object({ id: idSchema });

export const clientRecordRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const run = <T>(req: Parameters<typeof runScoped>[1], fn: Parameters<typeof runScoped<T>>[2]) => runScoped<T>(app.db, req, fn);

  app.post(
    '/:id/credentials/reveal',
    {
      onRequest: requirePermission('clientCredentials'),
      schema: { params, body: clientCredentialRevealSchema },
      config: rateLimited(app.platform, 30, '1 minute'),
    },
    async (req) => {
      const [recent] = await app.db
        .select({ n: count() })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.userId, req.userId),
            eq(auditLogs.action, CREDENTIAL_REVEALED_ACTION),
            gt(auditLogs.createdAt, sql`now() - interval '1 minute'`),
          ),
        );
      if ((recent?.n ?? 0) >= MAX_CREDENTIAL_REVEALS_PER_MINUTE) {
        throw new TooManyRequestsError('Muitas consultas de acessos em pouco tempo. Aguarde um minuto e tente de novo.');
      }
      const field = req.body.field;
      const value = await run(req, (ctx) => revealCredential(ctx.db, ctx.cipher, ctx.workspaceId, req.params.id, field));
      if (value === null) throw new NotFoundError('Este acesso não está cadastrado');
      // The record first: a value never leaves without its audit row.
      await audit(app.db, {
        ...requestContext(req),
        action: CREDENTIAL_REVEALED_ACTION,
        workspaceId: req.workspaceId,
        userId: req.userId,
        entity: 'client',
        entityId: req.params.id,
        metadata: { field },
      });
      return { field, value } satisfies ClientCredentialReveal;
    },
  );

  app.get(
    '/:id/credentials/views',
    { onRequest: requirePermission('clientCredentials'), schema: { params } },
    async (req): Promise<ClientCredentialView[]> => {
      await run(req, (ctx) => getClientOrThrow(ctx.db, ctx.workspaceId, req.params.id));
      const rows = await app.db
        .select({ metadata: auditLogs.metadata, userName: users.name, createdAt: auditLogs.createdAt })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.userId))
        .where(
          and(
            eq(auditLogs.workspaceId, req.workspaceId),
            eq(auditLogs.action, CREDENTIAL_REVEALED_ACTION),
            eq(auditLogs.entityId, req.params.id),
          ),
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(50);
      return rows.map((r) => ({
        field: (r.metadata?.field as ClientCredentialField) ?? 'accountantPassword',
        userName: r.userName,
        createdAt: r.createdAt.toISOString(),
      }));
    },
  );

  app.post(
    '/:id/contract/issues',
    { onRequest: requirePermission('finance'), schema: { params } },
    async (req, reply) => {
      assertSubscriptionAllowsWrite(req.access);
      const version = await run(req, async (ctx) => {
        await getClientOrThrow(ctx.db, ctx.workspaceId, req.params.id);
        return templateVersion(ctx);
      });
      await audit(app.db, {
        ...requestContext(req),
        action: 'client.contract_issued',
        workspaceId: req.workspaceId,
        userId: req.userId,
        entity: 'client',
        entityId: req.params.id,
        metadata: { templateSource: version.source, templateVersion: version.version },
      });
      return reply.code(204).send();
    },
  );
};
