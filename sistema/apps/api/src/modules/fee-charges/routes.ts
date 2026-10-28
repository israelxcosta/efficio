import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { feeEmployeesSchema, generateFeesSchema } from '@effinance/shared';
import { financeOnly } from '../../lib/finance-access';
import { idParams } from '../common/params';
import { generateFees, setFeeEmployees } from './service';

/** Mounted inside the tenant boundary (lib/tenant-routes.ts): `req.db` is the RLS transaction; writes need canWrite. */
export const feeChargeRoutes: FastifyPluginAsyncZod = async (app) => {
  // Financial module: owner/editor only, reads included (lib/finance-access.ts).
  financeOnly(app);

  app.post('/generate', { schema: { body: generateFeesSchema } }, async (req, reply) => {
    const result = await generateFees(req.db, req.workspaceId, req.body);
    return reply.code(!result.dryRun && result.created.length > 0 ? 201 : 200).send(result);
  });

  app.post('/:id/employees', { schema: { params: idParams, body: feeEmployeesSchema } }, async (req) =>
    setFeeEmployees(req.db, req.workspaceId, req.params.id, req.body),
  );
};
