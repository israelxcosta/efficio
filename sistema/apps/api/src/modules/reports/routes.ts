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

/** No permission key gates reading tasks (every member reads them): see the rework route. */
const TASKS_READABLE_BY_EVERY_MEMBER = true;

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
  // Titles go to who can read tasks: today every member reads every task (modules/tasks/access.ts has no
  // key for reading), so always; a permission that gates reading tasks is what this flag will carry.
  app.get('/clients/:id/rework', { schema: { params: idParams } }, async (req) =>
    clientRework(req.db, req.workspaceId, req.params.id, TASKS_READABLE_BY_EVERY_MEMBER),
  );
};
