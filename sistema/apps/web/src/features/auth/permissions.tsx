import { cloneElement, type ReactElement } from 'react';
import { BILLING_ENABLED, rolePermissions, type MemberRole, type PermissionKey, type PermissionMap } from '@effinance/shared';
import { Tooltip } from '@/components/ui/tooltip';
import { useAuth } from './auth-context';

export interface Permissions {
  role: MemberRole | null;
  isOwner: boolean;
  /**
   * owner or editor. Only for the texts ("Somente administradores…"): what a person may do comes from
   * the permission keys (`can`), which the role gives by default and the person's adjustments change.
   */
  isAdmin: boolean;
  /** The effective permission map (role defaults + adjustments), as `GET /auth/me` sends it. */
  permissions: PermissionMap;
  /** Whether the person has a permission key (spec §13.10). */
  can: (key: PermissionKey) => boolean;
  /** `can('finance')`: mirrors the API's finance guard. */
  canAccessFinance: boolean;
  /**
   * The subscription allows writes (trialing, active or past_due within the grace period). Always true
   * while paid subscriptions are off (`BILLING_ENABLED`, a future rollout).
   */
  subscriptionActive: boolean;
  /** "Assinatura inativa…" when the subscription blocks writes; null otherwise (always, with billing off). */
  subscriptionReason: string | null;
  /** Day-to-day work in the task module (any role, subscription active). */
  canWriteTasks: boolean;
  /** Registries of the task module (`registry`, subscription active). */
  canManage: boolean;
  /** The current user may create/edit/delete financial data in the active workspace. */
  canWrite: boolean;
  /** Why financial writes are blocked (tooltips and toasts); null when they are allowed. */
  readOnlyReason: string | null;
}

export const SUBSCRIPTION_REASON = 'Assinatura inativa: o espaço está em modo somente leitura.';
/** Same text as `FINANCE_FORBIDDEN_MESSAGE` of the API. */
export const FINANCE_ONLY_REASON = 'O financeiro é restrito aos administradores do espaço.';
export const ADMIN_ONLY_REASON = 'Somente administradores alteram este cadastro.';

export function isAdminRole(role: MemberRole | null | undefined): boolean {
  return role === 'owner' || role === 'editor';
}

/**
 * Pure form of `usePermissions` (tested): role + subscription + the effective permission map → what the
 * member may do. Without a map (an older session answer) the role's defaults apply, which is exactly the
 * behavior before per-person permissions. With paid subscriptions off (`BILLING_ENABLED`) the
 * subscription never blocks anything.
 */
export function permissionsFor(
  role: MemberRole | null,
  subscriptionActive: boolean,
  hasWorkspace = true,
  map?: PermissionMap | null,
): Permissions {
  const permissions = map ?? rolePermissions(role);
  const can = (key: PermissionKey) => hasWorkspace && permissions[key] === true;
  const finance = can('finance');
  const active = subscriptionActive || !BILLING_ENABLED;
  const readOnlyReason = !hasWorkspace ? null : !finance ? FINANCE_ONLY_REASON : !active ? SUBSCRIPTION_REASON : null;
  return {
    role,
    isOwner: role === 'owner',
    isAdmin: isAdminRole(role),
    permissions,
    can,
    canAccessFinance: finance,
    subscriptionActive: active,
    subscriptionReason: active ? null : SUBSCRIPTION_REASON,
    canWriteTasks: hasWorkspace && active,
    canManage: hasWorkspace && can('registry') && active,
    canWrite: hasWorkspace && readOnlyReason === null,
    readOnlyReason,
  };
}

/** Role, permissions and subscription state of the active workspace, from `GET /auth/me`. */
export function usePermissions(): Permissions {
  const { workspace } = useAuth();
  return permissionsFor(workspace?.role ?? null, workspace?.subscription.canWrite ?? false, Boolean(workspace), workspace?.permissions);
}

/** `admin` is a shortcut of the `registry` permission (registries of the task module). */
export type WriteScope = 'finance' | 'tasks' | 'admin';

/**
 * What a gated control does: hidden (a permanent restriction by permission, said once in the page
 * description), disabled with the reason (a temporary one: inactive subscription, only with billing
 * on) or enabled.
 */
export function gateFor(p: Permissions, scope: WriteScope, permission?: PermissionKey): { hidden: boolean; reason: string | null } {
  const key: PermissionKey | null = permission ?? (scope === 'finance' ? 'finance' : scope === 'admin' ? 'registry' : null);
  if (key && !p.can(key)) return { hidden: true, reason: null };
  return { hidden: false, reason: p.subscriptionReason };
}

/**
 * Wraps a create/edit control. `finance` (default) and `admin` (= `registry`) hide it from members
 * without that permission, as does an explicit `permission`; every scope disables it with a tooltip
 * while the subscription is inactive (the wrapper stays focusable so keyboard users get the tooltip),
 * which never happens while paid subscriptions are off (`BILLING_ENABLED`).
 */
export function WriteGate({
  children,
  reason,
  scope = 'finance',
  permission,
}: {
  children: ReactElement<{ disabled?: boolean }>;
  reason?: string | null;
  scope?: WriteScope;
  permission?: PermissionKey;
}) {
  const permissions = usePermissions();
  const gate = gateFor(permissions, scope, permission);
  if (gate.hidden) return null;
  const blocked = reason ?? gate.reason;
  if (!blocked) return children;
  return (
    <Tooltip content={blocked}>
      <span tabIndex={0} className="inline-flex cursor-not-allowed rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/25">
        {cloneElement(children, { disabled: true })}
      </span>
    </Tooltip>
  );
}
