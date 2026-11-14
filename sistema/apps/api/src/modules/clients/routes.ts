import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  clientFeeInputSchema,
  clientInactivationSchema,
  clientInputSchema,
  clientQuerySchema,
  cnpjParamsSchema,
  idSchema,
  TASK_TIME_ZONE,
  type Client,
} from '@effinance/shared';
import { todayIn } from '../../lib/clock';
import { getCipher } from '../../lib/crypto/keyring';
import { requireAnyPermission } from '../../lib/permissions';
import { clientContract } from '../office/service';
import { AppError, NotFoundError } from '../../lib/errors';
import { canAccessFinance, financeOnly } from '../../lib/finance-access';
import { rateLimited } from '../../lib/platform';
import { tenantGuards } from '../../lib/tenant-scope';
import { idParams } from '../common/params';
import type { Actor } from './fiscal';
import { CnpjProviderError } from './providers/types';
import {
  addFee,
  createClient,
  deleteClient,
  deleteFee,
  getClient,
  inactivateClient,
  listClients,
  listFees,
  reactivateClient,
  updateClient,
  updateFee,
  withoutFees,
  type ClientView,
} from './service';

const feeParams = z.object({ id: idSchema, feeId: idSchema });

/** Fee periods and fee totals are financial: only members with access to the finances see them. */
const viewOf = (req: FastifyRequest): ClientView => ({ fees: canAccessFinance(req.access) });
const present = (req: FastifyRequest, client: Client): Client => (viewOf(req).fees ? client : withoutFees(client));
const actorOf = (req: FastifyRequest): Actor => ({ userId: req.userId, name: req.access.userName });

/**
 * Fee periods (honorários) of a client: financial, reads included. The guard covers every route of
 * this plugin, so a fee route added later is protected too.
 */
const clientFeeRoutes: FastifyPluginAsyncZod = async (app) => {
  financeOnly(app);

  app.get('/:id/fees', { schema: { params: idParams } }, async (req) => listFees(req.db, req.workspaceId, req.params.id));

  app.post('/:id/fees', { schema: { params: idParams, body: clientFeeInputSchema } }, async (req, reply) =>
    reply.code(201).send(await addFee(req.db, req.workspaceId, req.params.id, req.body)),
  );

  app.put('/:id/fees/:feeId', { schema: { params: feeParams, body: clientFeeInputSchema } }, async (req) =>
    updateFee(req.db, req.workspaceId, req.params.id, req.params.feeId, req.body),
  );

  app.delete('/:id/fees/:feeId', { schema: { params: feeParams } }, async (req, reply) => {
    await deleteFee(req.db, req.workspaceId, req.params.id, req.params.feeId);
    return reply.code(204).send();
  });
};

/**
 * Mounted inside the tenant boundary (lib/tenant-routes.ts): `req.db` is the RLS transaction.
 * Clients are visible to every member; their fees (honorários) only to the finance roles.
 */
export const clientRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { schema: { querystring: clientQuerySchema } }, async (req) =>
    listClients(req.db, req.workspaceId, req.query, viewOf(req)),
  );

  app.get('/:id', { schema: { params: idParams } }, async (req) => getClient(req.db, req.workspaceId, req.params.id, viewOf(req)));

  app.post('/', { schema: { body: clientInputSchema } }, async (req, reply) =>
    reply.code(201).send(present(req, await createClient(req.db, req.workspaceId, req.body, actorOf(req)))),
  );

  app.put('/:id', { schema: { params: idParams, body: clientInputSchema } }, async (req) =>
    present(req, await updateClient(req.db, req.workspaceId, req.params.id, req.body, actorOf(req))),
  );

  app.delete('/:id', { schema: { params: idParams } }, async (req, reply) => {
    await deleteClient(req.db, req.workspaceId, req.params.id);
    return reply.code(204).send();
  });

  app.post('/:id/inactivate', { schema: { params: idParams, body: clientInactivationSchema } }, async (req) =>
    present(req, await inactivateClient(req.db, req.workspaceId, req.params.id, req.body)),
  );

  app.post('/:id/reactivate', { schema: { params: idParams } }, async (req) =>
    present(req, await reactivateClient(req.db, req.workspaceId, req.params.id)),
  );

  // Fee periods (honorários): financial, reads included (child plugin: same prefix and boundary).
  await app.register(clientFeeRoutes);
  // The contract of a client (spec §13.9): financial too (it carries the fee).
  await app.register(clientContractRoutes);
};

/**
 * Data to print the service contract of a client and what is missing (permission `finance`, reads
 * included; the office's own permission is not needed to generate it).
 */
const clientContractRoutes: FastifyPluginAsyncZod = async (app) => {
  financeOnly(app);

  app.get('/:id/contract', { schema: { params: idParams } }, async (req) =>
    clientContract(
      { db: req.db, workspaceId: req.workspaceId, cipher: await getCipher(req.workspaceId), today: todayIn(TASK_TIME_ZONE) },
      req.params.id,
    ),
  );
};

/**
 * Company data from the Receita Federal by CNPJ (client, union and office forms). Outside the tenant
 * transaction: the registry call never holds a database connection, and nothing is stored.
 */
export const cnpjRoutes: FastifyPluginAsyncZod = async (app) => {
  tenantGuards(app);
  // Whoever registers something with a CNPJ: clients (`finance` creates them, `clients` keeps their
  // registry — by default every member), unions (`registry`) or the office (`office`).
  app.addHook('onRequest', requireAnyPermission(['finance', 'clients', 'registry', 'office']));

  app.get('/:cnpj', { schema: { params: cnpjParamsSchema }, config: rateLimited(app.platform, 30, '1 minute') }, async (req) => {
    const provider = app.platform.cnpj;
    if (!provider) throw new AppError(503, 'cnpj_lookup_disabled', 'A consulta à Receita Federal não está habilitada');
    let company;
    try {
      company = await provider.lookup(req.params.cnpj);
    } catch (error) {
      if (!(error instanceof CnpjProviderError)) throw error;
      req.log?.warn({ status: error.status }, 'cnpj lookup failed');
      throw new AppError(502, 'cnpj_unavailable', 'Não foi possível consultar a Receita Federal agora. Tente novamente em instantes.');
    }
    if (!company) throw new NotFoundError('CNPJ não encontrado na Receita Federal');
    return company;
  });
};
