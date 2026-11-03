// Runner of the phase 3 modules mounted outside the financial boundary (unions, office, deadlines,
// clients' accesses): every member reaches them and each route checks its own permission key
// (lib/permissions.ts). Like the task module, a request authenticates, writes need a subscription that
// allows writing (402), and the work happens in one tenant transaction (RLS) whose result is returned
// after COMMIT. The workspace cipher is unwrapped before the transaction (lib/tenant-scope.ts).

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { effectivePermissions, TASK_TIME_ZONE, type ISODate, type PermissionMap } from '@effinance/shared';
import type { DbExecutor } from '../db/client';
import { assertSubscriptionAllowsWrite, isMutation, type Access } from '../modules/workspaces/access';
import { todayIn } from './clock';
import type { FieldCipher } from './crypto/field-cipher';
import { inTenant } from './tenant-scope';

export interface ScopedContext {
  /** Tenant transaction (role effinance_app + RLS). */
  db: DbExecutor;
  workspaceId: string;
  userId: string;
  /** Current name of the requester (recorded with what they change). */
  userName: string;
  permissions: PermissionMap;
  cipher: FieldCipher;
  /** Today in the office time zone (deadlines are calendar dates of the office). */
  today: ISODate;
}

/** Authentication for every route; writes by any member, as long as the subscription allows writing. */
export function memberGuards(app: Pick<FastifyInstance, 'addHook' | 'authenticate'>): void {
  app.addHook('onRequest', app.authenticate);
  app.addHook('onRequest', async (req: FastifyRequest) => {
    if (isMutation(req.method)) assertSubscriptionAllowsWrite(req.access);
  });
}

/** Runs `fn` in the tenant transaction of the request. */
export function runScoped<T>(
  system: DbExecutor,
  req: Pick<FastifyRequest, 'workspaceId' | 'userId'> & { access: Access },
  fn: (ctx: ScopedContext) => Promise<T>,
): Promise<T> {
  return inTenant(system, req.workspaceId, (db, cipher) =>
    fn({
      db,
      workspaceId: req.workspaceId,
      userId: req.userId,
      userName: req.access.userName,
      permissions: req.access.permissions ?? effectivePermissions(req.access.role),
      cipher,
      today: todayIn(TASK_TIME_ZONE),
    }),
  );
}
