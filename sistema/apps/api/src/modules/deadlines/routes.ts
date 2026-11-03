// Deadlines of documents and collective agreements under /api/deadlines (spec §6.10): every member
// reads (no write here: documents are edited in the client registry, agreements in Sindicatos).

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { deadlinesQuerySchema } from '@effinance/shared';
import { memberGuards, runScoped } from '../../lib/scoped-context';
import { clientDocumentAlerts, deadlinesSummary, listDeadlines } from './service';

export const deadlineRoutes: FastifyPluginAsyncZod = async (app) => {
  memberGuards(app);
  const run = runScoped.bind(null, app.db);

  app.get('/summary', async (req) => run(req, (ctx) => deadlinesSummary(ctx)));
  app.get('/clients', async (req) => run(req, (ctx) => clientDocumentAlerts(ctx)));
  app.get('/', { schema: { querystring: deadlinesQuerySchema } }, async (req) => run(req, (ctx) => listDeadlines(ctx, req.query)));
};
