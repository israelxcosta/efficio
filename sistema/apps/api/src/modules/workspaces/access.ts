// Per-request access check: the user must still be a member of the workspace in the token and the
// session must not be revoked. One query, executed on the system connection.

import { and, eq, exists, gt, isNull, sql } from 'drizzle-orm';
import {
  effectivePermissions,
  sanitizePermissionOverrides,
  type MemberRole,
  type PermissionMap,
  type PermissionOverrides,
  type SubscriptionSummary,
  type WorkspaceKind,
} from '@effinance/shared';
import type { DbExecutor } from '../../db/client';
import { sessions, subscriptions, users, workspaceMembers, workspaces } from '../../db/schema';
import { ForbiddenError, SubscriptionRequiredError } from '../../lib/errors';
import { summarizeSubscription } from '../billing/entitlements';

export interface Access {
  userId: string;
  workspaceId: string;
  /** Session family id (`sid` claim); null in contexts without sessions. */
  sessionId: string | null;
  role: MemberRole;
  /**
   * Effective permissions (spec §13.10): the role's defaults plus the member's adjustments, computed
   * on every request from the membership row (a change takes effect on the next request).
   */
  permissions: PermissionMap;
  /** The stored adjustments (only the keys that differ from the role's default). */
  permissionOverrides: PermissionOverrides;
  /** Current name of the user (recorded with what they change, e.g. a client's document). */
  userName: string;
  workspaceName: string;
  workspaceKind: WorkspaceKind;
  subscription: SubscriptionSummary;
}

export async function loadAccess(
  db: DbExecutor,
  userId: string,
  workspaceId: string,
  sessionId: string | null,
): Promise<Access | null> {
  const now = new Date();
  const conditions = [eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)];
  if (sessionId) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(sessions)
          .where(
            and(
              eq(sessions.familyId, sessionId),
              eq(sessions.userId, userId),
              isNull(sessions.rotatedAt),
              isNull(sessions.revokedAt),
              gt(sessions.expiresAt, now),
            ),
          ),
      ),
    );
  }
  const [row] = await db
    .select({
      role: workspaceMembers.role,
      permissions: workspaceMembers.permissions,
      userName: users.name,
      workspace: workspaces,
      subscription: subscriptions,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .leftJoin(subscriptions, eq(subscriptions.workspaceId, workspaceMembers.workspaceId))
    .where(and(...conditions));
  if (!row) return null;
  const overrides = row.role === 'owner' ? {} : sanitizePermissionOverrides(row.permissions);
  return {
    userId,
    workspaceId,
    sessionId,
    role: row.role,
    permissions: effectivePermissions(row.role, overrides),
    permissionOverrides: overrides,
    userName: row.userName,
    workspaceName: row.workspace.name,
    workspaceKind: row.workspace.kind,
    subscription: summarizeSubscription(row.subscription, now),
  };
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isMutation(method: string): boolean {
  return MUTATING.has(method.toUpperCase());
}

/**
 * Writes of the financial boundary (lib/tenant-routes.ts, lib/tenant-scope.ts): every module mounted
 * there is the finance or the clients' registry, so a write needs the `finance` permission (by default
 * owner and editor, exactly the roles of phases 1 and 2) and a subscription that allows writing.
 */
export function assertCanWrite(access: Access): void {
  if (!hasAccessPermission(access, 'finance')) throw new ForbiddenError('Você tem acesso somente leitura neste espaço');
  if (!access.subscription.canWrite) throw new SubscriptionRequiredError();
}

/** Writes need a subscription that allows writing (402), whatever the permission. */
export function assertSubscriptionAllowsWrite(access: Pick<Access, 'subscription'>): void {
  if (!access.subscription.canWrite) throw new SubscriptionRequiredError();
}

/**
 * Whether the access has a permission. Without the computed map (an access built by hand), the role's
 * defaults apply; without an access (a hook before authentication), nothing (fails closed).
 */
export function hasAccessPermission(
  access: (Pick<Access, 'role'> & { permissions?: PermissionMap }) | null | undefined,
  key: keyof PermissionMap,
): boolean {
  if (!access) return false;
  const map = access.permissions ?? effectivePermissions(access.role);
  return map[key] === true;
}

export function assertOwner(access: Access): void {
  if (access.role !== 'owner') throw new ForbiddenError('Somente o proprietário do espaço pode fazer isso');
}
