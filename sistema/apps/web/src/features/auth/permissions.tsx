import { cloneElement, type ReactElement } from 'react';
import type { MemberRole } from '@effinance/shared';
import { Tooltip } from '@/components/ui/tooltip';
import { useAuth } from './auth-context';

export interface Permissions {
  role: MemberRole | null;
  isOwner: boolean;
  /** owner or editor: registries of the task module, deletions and the finances. */
  isAdmin: boolean;
  /** Mirrors `canAccessFinance` of the API (`lib/finance-access.ts`): owner and editor. */
  canAccessFinance: boolean;
  /** The subscription allows writes (trialing, active or past_due within the grace period). */
  subscriptionActive: boolean;
  /** Day-to-day work in the task module (any role, subscription active). */
  canWriteTasks: boolean;
  /** Registries and deletions of the task module (administrators, subscription active). */
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

/** Pure form of `usePermissions` (tested): role + subscription → what the member may do. */
export function permissionsFor(role: MemberRole | null, subscriptionActive: boolean, hasWorkspace = true): Permissions {
  const isAdmin = isAdminRole(role);
  const readOnlyReason = !hasWorkspace ? null : !isAdmin ? FINANCE_ONLY_REASON : !subscriptionActive ? SUBSCRIPTION_REASON : null;
  return {
    role,
    isOwner: role === 'owner',
    isAdmin,
    canAccessFinance: isAdmin,
    subscriptionActive,
    canWriteTasks: hasWorkspace && subscriptionActive,
    canManage: hasWorkspace && isAdmin && subscriptionActive,
    canWrite: hasWorkspace && readOnlyReason === null,
    readOnlyReason,
  };
}

/** Role + subscription state of the active workspace, from `GET /auth/me`. */
export function usePermissions(): Permissions {
  const { workspace } = useAuth();
  return permissionsFor(workspace?.role ?? null, workspace?.subscription.canWrite ?? false, Boolean(workspace));
}

export type WriteScope = 'finance' | 'tasks' | 'admin';

/**
 * What a gated control does for a scope: hidden (a permanent restriction by role, said once in the
 * page description), disabled with the reason (a temporary one: inactive subscription) or enabled.
 */
export function gateFor(p: Permissions, scope: WriteScope): { hidden: boolean; reason: string | null } {
  if (scope === 'tasks') return { hidden: false, reason: p.subscriptionActive ? null : SUBSCRIPTION_REASON };
  if (!p.isAdmin) return { hidden: true, reason: null };
  return { hidden: false, reason: p.subscriptionActive ? null : SUBSCRIPTION_REASON };
}

/**
 * Wraps a create/edit control. `finance` (default) and `admin` hide it from members without that
 * role; every scope disables it with a tooltip while the subscription is inactive (the wrapper stays
 * focusable so keyboard users get the tooltip too).
 */
export function WriteGate({
  children,
  reason,
  scope = 'finance',
}: {
  children: ReactElement<{ disabled?: boolean }>;
  reason?: string | null;
  scope?: WriteScope;
}) {
  const permissions = usePermissions();
  const gate = gateFor(permissions, scope);
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
