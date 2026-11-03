// Finance is restricted to whoever has the `finance` permission (spec §13.10; by default the workspace
// administrators, owner and editor — the mapping of phases 1 and 2). Without it a member (by default
// the `viewer`, "Colaborador") uses the other modules (clients, suppliers, tasks, profile, workspace)
// but gets 403 on every financial route, reads included, and sees clients without fees (honorários)
// and the search without financial hits.
//
// Usage: call `financeOnly(app)` first thing in a financial route plugin (after `tenantGuards(app)`
// in plugins mounted outside lib/tenant-routes). The hook covers every route of the plugin, so a
// route added later is protected from birth. Works in Fastify and in the browser demo's router
// (plain `addHook('onRequest')`; no Node-only imports).

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PermissionMap } from '@effinance/shared';
import type { Access } from '../modules/workspaces/access';
import { ForbiddenError } from './errors';
import { can, FINANCE_FORBIDDEN_MESSAGE } from './permissions';

export { FINANCE_FORBIDDEN_MESSAGE };

type AccessLike = (Pick<Access, 'role'> & { permissions?: PermissionMap }) | null | undefined;

/** False without an authenticated access (a guard registered before authentication fails closed). */
export function canAccessFinance(access: AccessLike): boolean {
  return can(access, 'finance');
}

export function assertFinanceAccess(access: AccessLike): void {
  if (!canAccessFinance(access)) throw new ForbiddenError(FINANCE_FORBIDDEN_MESSAGE);
}

/** `onRequest` hook: must run after `authenticate` (it reads `req.access`). */
export async function requireFinanceAccess(req: FastifyRequest): Promise<void> {
  assertFinanceAccess(req.access);
}

/** Restricts every route of the calling plugin (and of the plugins it registers) to the finance key. */
export function financeOnly(app: Pick<FastifyInstance, 'addHook'>): void {
  app.addHook('onRequest', requireFinanceAccess);
}
