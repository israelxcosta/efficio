import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  cashflowReportQuerySchema,
  categoryReportQuerySchema,
  comparisonReportQuerySchema,
  contactReportQuerySchema,
  delinquencyReportQuerySchema,
  evolutionReportQuerySchema,
  overviewReportQuerySchema,
} from '@effinance/shared';
import { financeOnly } from '../../lib/finance-access';
import { idParams } from '../common/params';
import { cashflowReport, categoryReport, comparisonReport, contactReport, overviewReport } from './service';
import { delinquencyReport } from './delinquency';
import { evolutionReport } from './evolution';
import { clientRework } from './rework';

export const reportRoutes: FastifyPluginAsyncZod = async (app) => {
  // Financial module: owner/editor only, reads included (lib/finance-access.ts).
  financeOnly(app);

  app.get('/overview', { schema: { querystring: overviewReportQuerySchema } }, async (req) =>
    overviewReport(req.db, req.workspaceId, req.query),
  );
  app.get('/categories', { schema: { querystring: categoryReportQuerySchema } }, async (req) =>
    categoryReport(req.db, req.workspaceId, req.query),
  );
  app.get('/contacts', { schema: { querystring: contactReportQuerySchema } }, async (req) =>
    contactReport(req.db, req.workspaceId, req.query),
  );
  app.get('/comparison', { schema: { querystring: comparisonReportQuerySchema } }, async (req) =>
    comparisonReport(req.db, req.workspaceId, req.query),
  );
  app.get('/cashflow', { schema: { querystring: cashflowReportQuerySchema } }, async (req) =>
    cashflowReport(req.db, req.workspaceId, req.query),
  );
  app.get('/delinquency', { schema: { querystring: delinquencyReportQuerySchema } }, async (req) =>
    delinquencyReport(req.db, req.workspaceId, req.query),
  );
  app.get('/evolution', { schema: { querystring: evolutionReportQuerySchema } }, async (req) =>
    evolutionReport(req.db, req.workspaceId, req.query),
  );
  // Rework of one client, read next to its history (`GET /transactions?contactId=…`) by the client report.
  app.get('/clients/:id/rework', { schema: { params: idParams } }, async (req) =>
    clientRework(req.db, req.workspaceId, req.params.id),
  );
};
