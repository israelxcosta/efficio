// Yearly fee adjustment in batch under /api/fee-adjustments (docs/api.md → "Reajuste em lote").
// Mounted outside lib/tenant-routes (lib/tenant-scope.ts): the batch is audited on the system connection
// after its tenant transaction commits (the tenant role cannot write the audit trail). Shared with the
// browser demo.

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  applyFeeAdjustmentSchema,
  feeAdjustmentListQuerySchema,
  feeAdjustmentPreviewQuerySchema,
  TASK_TIME_ZONE,
} from '@effinance/shared';
import { audit } from '../../lib/audit';
import { todayIn } from '../../lib/clock';
import { financeOnly } from '../../lib/finance-access';
import { rateLimited } from '../../lib/platform';
import { requestContext } from '../../lib/request-context';
import { inTenant, tenantGuards } from '../../lib/tenant-scope';
import { idParams } from '../common/params';
import { applyFeeAdjustment, feeAdjustmentLetters, listFeeAdjustments, previewFeeAdjustment } from './service';

export const FEE_ADJUSTMENT_APPLIED_ACTION = 'fee_adjustment.applied';

export const feeAdjustmentRoutes: FastifyPluginAsyncZod = async (app) => {
  tenantGuards(app);
  // Financial module: permission `finance`, reads included (lib/finance-access.ts). After authentication.
  financeOnly(app);

  // Static routes before `/:id/...` (the demo's router takes the first match).
  app.get('/preview', { schema: { querystring: feeAdjustmentPreviewQuerySchema } }, async (req) =>
    // The notice deadlines are calendar dates of the office.
    inTenant(app.db, req.workspaceId, (tx) => previewFeeAdjustment(tx, req.workspaceId, req.query, todayIn(TASK_TIME_ZONE))),
  );

  app.get('/', { schema: { querystring: feeAdjustmentListQuerySchema } }, async (req) =>
    inTenant(app.db, req.workspaceId, (tx) => listFeeAdjustments(tx, req.workspaceId, req.query)),
  );

  app.post(
    '/',
    { schema: { body: applyFeeAdjustmentSchema }, config: rateLimited(app.platform, 20, '1 minute') },
    async (req, reply) => {
      // One transaction: every fee period, the batch and its items, or nothing.
      const result = await inTenant(app.db, req.workspaceId, (tx) =>
        applyFeeAdjustment(tx, req.workspaceId, req.body, { userId: req.userId, name: req.access.userName }),
      );
      if (!result.adjustment) return reply.code(200).send(result);
      // Who adjusted how many clients by how much — never names or amounts (lib/audit.ts).
      await audit(app.db, {
        ...requestContext(req),
        action: FEE_ADJUSTMENT_APPLIED_ACTION,
        workspaceId: req.workspaceId,
        userId: req.userId,
        entity: 'fee_adjustment',
        entityId: result.adjustment.id,
        metadata: {
          month: result.adjustment.month,
          appliedBps: result.adjustment.appliedBps,
          chosenIndex: result.adjustment.chosenIndex,
          adjustEmployeeFee: result.adjustment.adjustEmployeeFee,
          clients: result.created.length,
          skipped: result.skipped.length,
        },
      });
      return reply.code(201).send(result);
    },
  );

  app.get('/:id/letters', { schema: { params: idParams } }, async (req) =>
    inTenant(app.db, req.workspaceId, (tx, cipher) => feeAdjustmentLetters(tx, req.workspaceId, cipher, req.params.id)),
  );
};
