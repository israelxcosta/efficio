// Records of a client that need the system connection besides the tenant transaction, under
// /api/clients (next to the financial client routes, outside their boundary):
// - revealing an encrypted access (spec §13.8.3): permission `clientCredentials` (by default the
//   administrators), a POST never cached, a limit per member per minute on top of the per-IP one, and an
//   audit record (who, when, which field — never the value) written BEFORE the value leaves. Reading is
//   not a write: it works without an active subscription, like every read;
// - who saw each access (the audit records of the client);
// - registering that a contract was issued (optional, spec §18.16): permission `finance`;
// - the registry of the client (UX 2.3): registration and fiscal data (only the non-financial fields) and
//   the documents, with the permission `clients` (by default every member), audited after the commit
//   (field names and document kinds, never values). Creating, inactivating, reactivating and deleting a
//   client, the fees, the contract and the notes stay in the financial routes (`finance`).

import { and, count, desc, eq, gt, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  clientCredentialRevealSchema,
  clientDocumentInputSchema,
  clientDocumentsInputSchema,
  clientRegistrationInputSchema,
  idSchema,
  MAX_CREDENTIAL_REVEALS_PER_MINUTE,
  type ClientCredentialField,
  type ClientCredentialReveal,
  type ClientCredentialView,
  type ClientDocument,
} from '@effinance/shared';
import type { FastifyRequest } from 'fastify';
import { auditLogs, users } from '../../db/schema';
import { audit } from '../../lib/audit';
import { NotFoundError, TooManyRequestsError } from '../../lib/errors';
import { requirePermission } from '../../lib/permissions';
import { rateLimited } from '../../lib/platform';
import { requestContext } from '../../lib/request-context';
import { runScoped } from '../../lib/scoped-context';
import { assertSubscriptionAllowsWrite } from '../workspaces/access';
import { addDocument, deleteDocument, loadDocuments, replaceDocuments, revealCredential, updateDocument, type Actor } from '../clients/fiscal';
import { updateClientRegistration } from '../clients/service';
import { getClientOrThrow } from '../common/ownership';
import { templateVersion } from '../office/service';

export const CREDENTIAL_REVEALED_ACTION = 'client.credential_revealed';
const params = z.object({ id: idSchema });
const documentParams = z.object({ id: idSchema, documentId: idSchema });

export const REGISTRATION_UPDATED_ACTION = 'client.registration_updated';
export const DOCUMENTS_REPLACED_ACTION = 'client.documents_replaced';
export const DOCUMENT_ADDED_ACTION = 'client.document_added';
export const DOCUMENT_UPDATED_ACTION = 'client.document_updated';
export const DOCUMENT_DELETED_ACTION = 'client.document_deleted';

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

  // Registry of the client (permission `clients`; writes need a subscription that allows writing).
  const registry = { onRequest: requirePermission('clients') };
  const actorOf = (req: FastifyRequest): Actor => ({ userId: req.userId, name: req.access.userName });
  const recordChange = (req: FastifyRequest & { params: { id: string } }, action: string, metadata: Record<string, unknown>) =>
    audit(app.db, { ...requestContext(req), action, workspaceId: req.workspaceId, userId: req.userId, entity: 'client', entityId: req.params.id, metadata });

  app.patch('/:id/registration', { ...registry, schema: { params, body: clientRegistrationInputSchema } }, async (req) => {
    assertSubscriptionAllowsWrite(req.access);
    const { client, fields } = await run(req, (ctx) =>
      updateClientRegistration(ctx.db, ctx.workspaceId, req.params.id, req.body, { fees: ctx.permissions.finance === true }),
    );
    if (fields.length > 0) await recordChange(req, REGISTRATION_UPDATED_ACTION, { fields });
    return client;
  });

  app.put('/:id/documents', { ...registry, schema: { params, body: clientDocumentsInputSchema } }, async (req): Promise<ClientDocument[]> => {
    assertSubscriptionAllowsWrite(req.access);
    const documents = await run(req, async (ctx) => {
      await getClientOrThrow(ctx.db, ctx.workspaceId, req.params.id);
      await replaceDocuments(ctx.db, ctx.cipher, ctx.workspaceId, req.params.id, req.body.documents, actorOf(req));
      return (await loadDocuments(ctx.db, ctx.cipher, ctx.workspaceId, [req.params.id], ctx.today)).get(req.params.id) ?? [];
    });
    await recordChange(req, DOCUMENTS_REPLACED_ACTION, { count: documents.length, kinds: documents.map((d) => d.kind) });
    return documents;
  });

  app.post('/:id/documents', { ...registry, schema: { params, body: clientDocumentInputSchema } }, async (req, reply) => {
    assertSubscriptionAllowsWrite(req.access);
    const document = await run(req, async (ctx) => {
      await getClientOrThrow(ctx.db, ctx.workspaceId, req.params.id);
      return addDocument(ctx.db, ctx.cipher, ctx.workspaceId, req.params.id, req.body, actorOf(req), ctx.today);
    });
    await recordChange(req, DOCUMENT_ADDED_ACTION, { documentId: document.id, kind: document.kind });
    return reply.code(201).send(document);
  });

  app.put(
    '/:id/documents/:documentId',
    { ...registry, schema: { params: documentParams, body: clientDocumentInputSchema } },
    async (req): Promise<ClientDocument> => {
      assertSubscriptionAllowsWrite(req.access);
      const document = await run(req, async (ctx) => {
        await getClientOrThrow(ctx.db, ctx.workspaceId, req.params.id);
        return updateDocument(ctx.db, ctx.cipher, ctx.workspaceId, req.params.id, req.params.documentId, req.body, actorOf(req), ctx.today);
      });
      await recordChange(req, DOCUMENT_UPDATED_ACTION, { documentId: document.id, kind: document.kind });
      return document;
    },
  );

  app.delete('/:id/documents/:documentId', { ...registry, schema: { params: documentParams } }, async (req, reply) => {
    assertSubscriptionAllowsWrite(req.access);
    const removed = await run(req, async (ctx) => {
      await getClientOrThrow(ctx.db, ctx.workspaceId, req.params.id);
      return deleteDocument(ctx.db, ctx.workspaceId, req.params.id, req.params.documentId);
    });
    await recordChange(req, DOCUMENT_DELETED_ACTION, { documentId: removed.id, kind: removed.kind });
    return reply.code(204).send();
  });

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
