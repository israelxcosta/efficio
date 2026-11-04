import {
  ACTION_PERMISSION_KEYS,
  PAGE_PERMISSION_KEYS,
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  effectivePermissions,
  normalizePermissionOverrides,
  rolePermissions,
  type MemberRole,
  type PermissionKey,
  type PermissionMap,
  type PermissionOverrides,
} from '@effinance/shared';
import { ROLE_LABELS } from '@/features/auth/roles';
import { pluralize } from '@/lib/utils';

// Permissions per person (spec §13.10): the role gives the defaults; the draft keeps only the keys that
// differ from them. Pure (tested): the sheet, the members list and the team list use these.

export type AdjustableRole = Exclude<MemberRole, 'owner'>;

export interface PermissionDraft {
  role: AdjustableRole;
  overrides: PermissionOverrides;
}

export { ACTION_PERMISSION_KEYS, PAGE_PERMISSION_KEYS };

/** Role defaults + the draft's adjustments. */
export function draftEffective(draft: PermissionDraft): PermissionMap {
  return effectivePermissions(draft.role, draft.overrides);
}

/** Turns a key on or off: equal to the role's default, the adjustment goes away. */
export function setDraftKey(draft: PermissionDraft, key: PermissionKey, value: boolean): PermissionDraft {
  const overrides = { ...draft.overrides };
  if (rolePermissions(draft.role)[key] === value) delete overrides[key];
  else overrides[key] = value;
  return { ...draft, overrides };
}

/** "Voltar ao padrão" of one key. */
export function resetDraftKey(draft: PermissionDraft, key: PermissionKey): PermissionDraft {
  const overrides = { ...draft.overrides };
  delete overrides[key];
  return { ...draft, overrides };
}

/**
 * Another role: the defaults change right away and the adjustments stay (only the ones that still
 * differ from the new role count; the API drops the others when saving).
 */
export function setDraftRole(draft: PermissionDraft, role: AdjustableRole): PermissionDraft {
  return { ...draft, role };
}

/** Keys whose value differs from the role's default (the "Ajustado" badge). */
export function adjustedKeys(role: MemberRole, overrides: PermissionOverrides | null | undefined): PermissionKey[] {
  if (role === 'owner') return [];
  return Object.keys(normalizePermissionOverrides(role, overrides ?? {})) as PermissionKey[];
}

/** Whether the draft differs from what is stored (role or effective permissions). */
export function draftChanged(draft: PermissionDraft, stored: { role: MemberRole; overrides: PermissionOverrides }): boolean {
  if (draft.role !== stored.role) return true;
  const a = draftEffective(draft);
  const b = effectivePermissions(stored.role, stored.overrides);
  return PERMISSION_KEYS.some((k) => a[k] !== b[k]);
}

/** "ligado"/"desligado" for actions; "visível"/"oculto" for pages. */
export function permissionValueText(key: PermissionKey, value: boolean): string {
  if (key.startsWith('page.')) return value ? 'visível' : 'oculto';
  return value ? 'ligado' : 'desligado';
}

/** Tooltip of a switch: "Padrão de Colaborador: desligado". */
export function defaultHint(role: MemberRole, key: PermissionKey): string {
  return `Padrão de ${ROLE_LABELS[role]}: ${permissionValueText(key, rolePermissions(role)[key])}`;
}

/**
 * The line under a member's name: "Colaborador · 2 ajustes", "Administrador · sem financeiro" (an
 * administrator without the finances is said by name: it changes what they see the most).
 */
export function memberAccessLine(member: { role: MemberRole; permissionOverrides?: PermissionOverrides | null }): string {
  const keys = adjustedKeys(member.role, member.permissionOverrides);
  const parts = [ROLE_LABELS[member.role]];
  let rest = keys;
  if (member.role === 'editor' && keys.includes('finance')) {
    parts.push('sem financeiro');
    rest = keys.filter((k) => k !== 'finance');
  }
  if (rest.length) parts.push(pluralize(rest.length, 'ajuste', 'ajustes'));
  return parts.join(' · ');
}

/** "2 ajustes" (null without adjustments). */
export function adjustmentCountText(member: { role: MemberRole; permissionOverrides?: PermissionOverrides | null }): string | null {
  const n = adjustedKeys(member.role, member.permissionOverrides).length;
  return n ? pluralize(n, 'ajuste', 'ajustes') : null;
}

/** Tooltip with the adjustments: "Cadastros da gestão: ligado · Relatórios de tarefas: oculto". */
export function adjustmentSummary(member: { role: MemberRole; permissionOverrides?: PermissionOverrides | null }): string | null {
  const keys = adjustedKeys(member.role, member.permissionOverrides);
  if (!keys.length) return null;
  const map = effectivePermissions(member.role, member.permissionOverrides);
  return PERMISSION_KEYS.filter((k) => keys.includes(k))
    .map((k) => `${PERMISSION_LABELS[k]}: ${permissionValueText(k, map[k])}`)
    .join(' · ');
}
