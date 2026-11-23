// The office and its contract template under /api/office (spec §13.9). Every member reads the name and
// the logo (`/office/branding`, headers of the PDFs); everything else needs the `office` permission (by
// default the administrators). Writes need a subscription (402). The contract of a client is under
// /api/clients/:id/contract (permission `finance`).

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { contractTemplateInputSchema, officeInputSchema, officeLogoInputSchema } from '@effinance/shared';
import { audit } from '../../lib/audit';
import { requirePermission } from '../../lib/permissions';
import { requestContext } from '../../lib/request-context';
import { memberGuards, runScoped } from '../../lib/scoped-context';
import {
  getBranding,
  getContractTemplate,
  getOffice,
  resetContractTemplate,
  saveContractTemplate,
  saveOffice,
  setLogo,
} from './service';

const office = { onRequest: requirePermission('office') };
/** A 500 KB image in base64 plus the JSON around it. */
export const OFFICE_LOGO_BODY_LIMIT = 1024 * 1024;
/** 400 000 characters (up to 3 bytes each, escaped) plus a 500 KB watermark in base64. */
export const CONTRACT_TEMPLATE_BODY_LIMIT = 3 * 1024 * 1024;

export const officeRoutes: FastifyPluginAsyncZod = async (app) => {
  memberGuards(app);
  const run = runScoped.bind(null, app.db);
  const record = (req: Parameters<typeof requestContext>[0] & { workspaceId: string; userId: string }, action: string, metadata?: Record<string, unknown>) =>
    audit(app.db, { ...requestContext(req), action, workspaceId: req.workspaceId, userId: req.userId, entity: 'office', entityId: req.workspaceId, metadata });

  app.get('/branding', async (req) => run(req, (ctx) => getBranding(ctx)));

  app.get('/', office, async (req) => run(req, (ctx) => getOffice(ctx)));

  app.put('/', { ...office, schema: { body: officeInputSchema } }, async (req) => {
    const result = await run(req, (ctx) => saveOffice(ctx, req.body));
    await record(req, 'office.updated');
    return result;
  });

  app.put('/logo', { ...office, bodyLimit: OFFICE_LOGO_BODY_LIMIT, schema: { body: officeLogoInputSchema } }, async (req) => {
    const result = await run(req, (ctx) => setLogo(ctx, req.body.logo));
    await record(req, 'office.logo_changed');
    return result;
  });

  app.delete('/logo', office, async (req, reply) => {
    await run(req, (ctx) => setLogo(ctx, null));
    await record(req, 'office.logo_removed');
    return reply.code(204).send();
  });

  app.get('/contract-template', office, async (req) => run(req, (ctx) => getContractTemplate(ctx)));

  app.put(
    '/contract-template',
    { ...office, bodyLimit: CONTRACT_TEMPLATE_BODY_LIMIT, schema: { body: contractTemplateInputSchema } },
    async (req) => {
      const result = await run(req, (ctx) => saveContractTemplate(ctx, req.body));
      // Who changed what — never the text (hundreds of KB) nor the image.
      await record(req, 'office.contract_updated', {
        factory: req.body.blocks === null,
        blocks: Array.isArray(req.body.blocks) ? req.body.blocks.length : null,
        watermarkChanged: req.body.watermark !== undefined,
        watermarkEnabled: req.body.watermarkEnabled ?? null,
      });
      return result;
    },
  );

  app.post('/contract-template/reset', office, async (req) => {
    const result = await run(req, (ctx) => resetContractTemplate(ctx));
    await record(req, 'office.contract_reset');
    return result;
  });
};
