// Finance is restricted to the workspace administrators. Provisional mapping (no role migration):
// administrator = `owner` or `editor`; `viewer` (shown as "Colaborador" in the app) uses the other
// modules (clients, suppliers, tasks, profile, workspace) but gets 403 on every financial route,
// reads included, and sees clients without fees (honorários) and the search without financial hits.
//
// Usage: call `financeOnly(app)` first thing in a financial route plugin (after `tenantGuards(app)`
// in plugins mounted outside lib/tenant-routes). The hook covers every route of the plugin, so a
// route added later is protected from birth. Works in Fastify and in the browser demo's router
// (plain `addHook('onRequest')`; no Node-only imports).

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MemberRole } from '@effinance/shared';
import type { Access } from '../modules/workspaces/access';
import { ForbiddenError } from './errors';

/** Roles that see and manage the finances. An allowlist: a role added later starts without access. */
const FINANCE_ROLES: ReadonlySet<MemberRole> = new Set<MemberRole>(['owner', 'editor']);

export const FINANCE_FORBIDDEN_MESSAGE = 'O financeiro é restrito aos administradores do espaço.';

/** False without an authenticated access (a guard registered before authentication fails closed). */
export function canAccessFinance(access: Pick<Access, 'role'> | null | undefined): boolean {
  return access != null && FINANCE_ROLES.has(access.role);
}

export function assertFinanceAccess(access: Pick<Access, 'role'> | null | undefined): void {
  if (!canAccessFinance(access)) throw new ForbiddenError(FINANCE_FORBIDDEN_MESSAGE);
}

/** `onRequest` hook: must run after `authenticate` (it reads `req.access`). */
export async function requireFinanceAccess(req: FastifyRequest): Promise<void> {
  assertFinanceAccess(req.access);
}

/** Restricts every route of the calling plugin (and of the plugins it registers) to finance roles. */
export function financeOnly(app: Pick<FastifyInstance, 'addHook'>): void {
  app.addHook('onRequest', requireFinanceAccess);
}
