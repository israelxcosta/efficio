import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  clientFeeInputSchema,
  clientInactivationSchema,
  clientInputSchema,
  clientQuerySchema,
  cnpjParamsSchema,
  idSchema,
} from '@effinance/shared';
import { AppError, NotFoundError } from '../../lib/errors';
import { rateLimited } from '../../lib/platform';
import { tenantGuards } from '../../lib/tenant-scope';
import { idParams } from '../common/params';
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
} from './service';

const feeParams = z.object({ id: idSchema, feeId: idSchema });

/** Mounted inside the tenant boundary (lib/tenant-routes.ts): `req.db` is the RLS transaction. */
export const clientRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { schema: { querystring: clientQuerySchema } }, async (req) => listClients(req.db, req.workspaceId, req.query));

  app.get('/:id', { schema: { params: idParams } }, async (req) => getClient(req.db, req.workspaceId, req.params.id));

  app.post('/', { schema: { body: clientInputSchema } }, async (req, reply) =>
    reply.code(201).send(await createClient(req.db, req.workspaceId, req.body)),
  );

  app.put('/:id', { schema: { params: idParams, body: clientInputSchema } }, async (req) =>
    updateClient(req.db, req.workspaceId, req.params.id, req.body),
  );

  app.delete('/:id', { schema: { params: idParams } }, async (req, reply) => {
    await deleteClient(req.db, req.workspaceId, req.params.id);
    return reply.code(204).send();
  });

  app.post('/:id/inactivate', { schema: { params: idParams, body: clientInactivationSchema } }, async (req) =>
    inactivateClient(req.db, req.workspaceId, req.params.id, req.body),
  );

  app.post('/:id/reactivate', { schema: { params: idParams } }, async (req) =>
    reactivateClient(req.db, req.workspaceId, req.params.id),
  );

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
 * Company data from the Receita Federal by CNPJ (client form). Outside the tenant transaction: the
 * registry call never holds a database connection, and nothing is stored.
 */
export const cnpjRoutes: FastifyPluginAsyncZod = async (app) => {
  tenantGuards(app);

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
