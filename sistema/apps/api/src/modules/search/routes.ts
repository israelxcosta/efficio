import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { searchQuerySchema } from '@effinance/shared';
import { canAccessFinance } from '../../lib/finance-access';
import { search } from './service';

/** Open to every member; financial results (transactions, accounts, categories) only for the finance roles. */
export const searchRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { schema: { querystring: searchQuerySchema } }, async (req) =>
    search(req.db, req.workspaceId, req.query.q, { finance: canAccessFinance(req.access) }),
  );
};
