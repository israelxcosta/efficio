import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { contactInputSchema, contactQuerySchema } from '@effinance/shared';
import { canAccessFinance, financeOnly } from '../../lib/finance-access';
import { idParams } from '../common/params';
import { createContact, deleteContact, getContact, listContacts, updateContact } from './service';

/**
 * Suppliers (fornecedores) are financial, like in the web (behind `FinanceGate`) and the search: every
 * route needs the `finance` permission, reads included. Only the finance screens (supplier page,
 * transaction forms and filters) call it; clients are read by everyone through /clients.
 */
export const contactRoutes: FastifyPluginAsyncZod = async (app) => {
  financeOnly(app);

  app.get('/', { schema: { querystring: contactQuerySchema } }, async (req) =>
    // Second barrier: clients' notes only for the finance roles (same as /clients and the search).
    listContacts(req.db, req.workspaceId, req.query, { finance: canAccessFinance(req.access) }),
  );

  app.get('/:id', { schema: { params: idParams } }, async (req) => getContact(req.db, req.workspaceId, req.params.id));

  app.post('/', { schema: { body: contactInputSchema } }, async (req, reply) =>
    reply.code(201).send(await createContact(req.db, req.workspaceId, req.body)),
  );

  app.put('/:id', { schema: { params: idParams, body: contactInputSchema } }, async (req) =>
    updateContact(req.db, req.workspaceId, req.params.id, req.body),
  );

  app.delete('/:id', { schema: { params: idParams } }, async (req, reply) => {
    await deleteContact(req.db, req.workspaceId, req.params.id);
    return reply.code(204).send();
  });
};
