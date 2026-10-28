import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { dashboardQuerySchema } from '@effinance/shared';
import { financeOnly } from '../../lib/finance-access';
import { getDashboard } from './service';

export const dashboardRoutes: FastifyPluginAsyncZod = async (app) => {
  // Financial module: owner/editor only, reads included (lib/finance-access.ts).
  financeOnly(app);

  app.get('/', { schema: { querystring: dashboardQuerySchema } }, async (req) =>
    getDashboard(req.db, req.workspaceId, req.query.month),
  );
};
