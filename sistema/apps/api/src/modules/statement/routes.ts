import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { statementQuerySchema } from '@effinance/shared';
import { financeOnly } from '../../lib/finance-access';
import { getStatement } from './service';

export const statementRoutes: FastifyPluginAsyncZod = async (app) => {
  // Financial module: owner/editor only, reads included (lib/finance-access.ts).
  financeOnly(app);

  app.get('/', { schema: { querystring: statementQuerySchema } }, async (req) =>
    getStatement(req.db, req.workspaceId, req.query),
  );
};
