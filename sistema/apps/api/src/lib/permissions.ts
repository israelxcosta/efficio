// Permission keys on the API (spec §13.10): every guard that used to check the role checks a key now.
// The defaults of each role are exactly the behavior of phases 1 and 2 (packages/shared
// `ROLE_PERMISSION_DEFAULTS`), so nothing changes until someone adjusts a member.
//
// Usage: `onRequest: requirePermission('registry')` on a route (after authentication), or
// `assertPermission(req.access, 'office')` inside a handler. Works in Fastify and in the browser demo's
// router (plain hooks; no Node-only imports).

import type { FastifyRequest } from 'fastify';
import type { PermissionKey } from '@effinance/shared';
import { hasAccessPermission, type Access } from '../modules/workspaces/access';
import { ForbiddenError } from './errors';

export const FINANCE_FORBIDDEN_MESSAGE = 'O financeiro é restrito aos administradores do espaço.';
/** Same text as the task module used for its administrator routes (phases 1 and 2). */
export const ADMIN_FORBIDDEN_MESSAGE = 'Somente os administradores do espaço podem fazer isso.';

/** What a member without the key reads (403). "Administradores" stays the right word: it is who they ask. */
export const PERMISSION_FORBIDDEN_MESSAGES: Record<PermissionKey, string> = {
  finance: FINANCE_FORBIDDEN_MESSAGE,
  clients: 'Você não tem permissão para editar o cadastro dos clientes.',
  registry: ADMIN_FORBIDDEN_MESSAGE,
  deleteRegistry: ADMIN_FORBIDDEN_MESSAGE,
  deleteTasks: ADMIN_FORBIDDEN_MESSAGE,
  reopenOthers: ADMIN_FORBIDDEN_MESSAGE,
  clientCredentials: 'Você não tem permissão para ver este acesso.',
  office: 'O modelo de contrato e os dados do escritório são restritos aos administradores do espaço.',
  members: 'Somente quem gerencia os membros do espaço pode fazer isso.',
  'page.audit': ADMIN_FORBIDDEN_MESSAGE,
  'page.recurring': ADMIN_FORBIDDEN_MESSAGE,
  'page.processes': ADMIN_FORBIDDEN_MESSAGE,
  'page.clients': ADMIN_FORBIDDEN_MESSAGE,
  'page.reports': ADMIN_FORBIDDEN_MESSAGE,
  'page.registry': ADMIN_FORBIDDEN_MESSAGE,
};

type AccessLike = Parameters<typeof hasAccessPermission>[0];

export function can(access: AccessLike, key: PermissionKey): boolean {
  return hasAccessPermission(access, key);
}

export function assertPermission(access: AccessLike, key: PermissionKey, message = PERMISSION_FORBIDDEN_MESSAGES[key]): void {
  if (!can(access, key)) throw new ForbiddenError(message);
}

/** Route-level `onRequest` hook (runs after authentication: it reads `req.access`). */
export function requirePermission(key: PermissionKey, message?: string) {
  return async function permissionGuard(req: FastifyRequest): Promise<void> {
    assertPermission(req.access as Access | undefined, key, message);
  };
}

/** One of several keys (e.g. the CNPJ lookup: whoever registers clients, unions or the office). */
export function requireAnyPermission(keys: readonly PermissionKey[], message = ADMIN_FORBIDDEN_MESSAGE) {
  return async function anyPermissionGuard(req: FastifyRequest): Promise<void> {
    if (!keys.some((k) => can(req.access as Access | undefined, k))) throw new ForbiddenError(message);
  };
}
