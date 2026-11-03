// Permissions per person (spec §13.10, phase 3). The ROLE gives the defaults (owner, editor, viewer);
// a member may have ADJUSTMENTS ("ajustes"): only the keys that differ from the role's default are
// stored (`workspace_members.permissions`), so changing someone's role carries along everything that
// was not adjusted (Effy's rule). The owner has every key, always, and is never adjusted. The
// effective map is computed on every request (the API re-reads the membership each time) and sent to
// the web with the session (`WorkspaceSummary.permissions`) and with the task options.
//
// Action keys are checked by the API on each operation. Page keys (`page.*`) only hide a page of the
// task area (menu, ⌘K, URL); the data keeps reaching the other screens (like in Effy).
// The defaults below are exactly the behavior of phases 1 and 2.

import { z } from 'zod';
import type { MemberRole } from './saas';

/** Checked by the API on every operation. */
export const ACTION_PERMISSION_KEYS = [
  'finance',
  'registry',
  'deleteRegistry',
  'deleteTasks',
  'reopenOthers',
  'clientCredentials',
  'office',
  'members',
] as const;
export type ActionPermissionKey = (typeof ACTION_PERMISSION_KEYS)[number];

/** Only hide a page of the task area (menu, "Mais", ⌘K and the URL). Início and Tarefas have none. */
export const PAGE_PERMISSION_KEYS = [
  'page.audit',
  'page.recurring',
  'page.processes',
  'page.clients',
  'page.reports',
  'page.registry',
] as const;
export type PagePermissionKey = (typeof PAGE_PERMISSION_KEYS)[number];

export const PERMISSION_KEYS = [...ACTION_PERMISSION_KEYS, ...PAGE_PERMISSION_KEYS] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/** Every key with its effective value. */
export type PermissionMap = Record<PermissionKey, boolean>;
/** The adjustments of a member: only the keys that differ from the role's default. */
export type PermissionOverrides = Partial<Record<PermissionKey, boolean>>;

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  finance: 'Financeiro',
  registry: 'Cadastros da gestão',
  deleteRegistry: 'Excluir cadastros',
  deleteTasks: 'Excluir tarefas',
  reopenOthers: 'Reabrir conclusões de outras pessoas',
  clientCredentials: 'Ver acessos dos clientes',
  office: 'Escritório e contrato',
  members: 'Membros e permissões',
  'page.audit': 'Auditoria mensal',
  'page.recurring': 'Tarefas recorrentes',
  'page.processes': 'Processos',
  'page.clients': 'Clientes',
  'page.reports': 'Relatórios de tarefas',
  'page.registry': 'Cadastros',
};

/** Description shown under the switch (page keys have none). */
export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string | null> = {
  finance:
    'Abre a área Financeiro: painel, contas, extrato, clientes com honorários, cadastro de clientes, contrato e relatórios financeiros.',
  registry:
    'Cria e edita departamentos, categorias, tarefas recorrentes, modelos de processo e sindicatos; define os responsáveis dos clientes e o departamento de cada pessoa.',
  deleteRegistry: 'Exclui departamentos, categorias, tarefas recorrentes sem histórico, modelos de processo e sindicatos.',
  deleteTasks: 'Exclui tarefas, processos e anexos de outras pessoas. Sem esta permissão, a pessoa cancela a tarefa.',
  reopenOthers:
    'Reabre, com motivo, tarefas recorrentes concluídas por outra pessoa (na auditoria, nas listas e no detalhe). As próprias conclusões, todos reabrem.',
  clientCredentials:
    'Revela o código de acesso do Simples Nacional e a senha do contador na ficha do cliente. Cada visualização fica registrada.',
  office: 'Edita os dados do escritório, a logo e o modelo de contrato.',
  members: 'Convida, muda o papel, remove pessoas e ajusta permissões. Ninguém concede o que não tem.',
  'page.audit': null,
  'page.recurring': null,
  'page.processes': null,
  'page.clients': null,
  'page.reports': null,
  'page.registry': null,
};

const allPages = { 'page.audit': true, 'page.recurring': true, 'page.processes': true, 'page.clients': true, 'page.reports': true, 'page.registry': true } as const;

/**
 * Defaults of each role: the behavior of phases 1 and 2. Administrators (owner and editor) keep the
 * finances, the registries, the deletions, the clients' accesses and the office; only the owner manages
 * members. The collaborator (`viewer`) uses the whole task area.
 */
export const ROLE_PERMISSION_DEFAULTS: Record<MemberRole, PermissionMap> = {
  owner: {
    finance: true,
    registry: true,
    deleteRegistry: true,
    deleteTasks: true,
    reopenOthers: true,
    clientCredentials: true,
    office: true,
    members: true,
    ...allPages,
  },
  editor: {
    finance: true,
    registry: true,
    deleteRegistry: true,
    deleteTasks: true,
    reopenOthers: true,
    clientCredentials: true,
    office: true,
    members: false,
    ...allPages,
  },
  viewer: {
    finance: false,
    registry: false,
    deleteRegistry: false,
    deleteTasks: false,
    reopenOthers: false,
    clientCredentials: false,
    office: false,
    members: false,
    ...allPages,
  },
};

const PERMISSION_KEY_SET: ReadonlySet<string> = new Set(PERMISSION_KEYS);

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_KEY_SET.has(value);
}

const nothing = (): PermissionMap => Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false])) as PermissionMap;

/** The map a role gives by itself. An unknown role gets nothing (fails closed). */
export function rolePermissions(role: MemberRole | string | null | undefined): PermissionMap {
  const defaults = role ? (ROLE_PERMISSION_DEFAULTS as Record<string, PermissionMap | undefined>)[role] : undefined;
  return defaults ? { ...defaults } : nothing();
}

/**
 * Keeps only known keys with boolean values: a request (or a stored row) cannot invent a permission
 * nor store something that would later be read as `true` by coercion.
 */
export function sanitizePermissionOverrides(raw: unknown): PermissionOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: PermissionOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isPermissionKey(key) && typeof value === 'boolean') out[key] = value;
  }
  return out;
}

/**
 * The adjustments worth storing for `role`: known keys whose value differs from the role's default.
 * The owner is never adjusted (always `{}`).
 */
export function normalizePermissionOverrides(role: MemberRole, overrides: unknown): PermissionOverrides {
  if (role === 'owner') return {};
  const defaults = rolePermissions(role);
  const out: PermissionOverrides = {};
  for (const [key, value] of Object.entries(sanitizePermissionOverrides(overrides)) as [PermissionKey, boolean][]) {
    if (defaults[key] !== value) out[key] = value;
  }
  return out;
}

/** Role defaults + the member's adjustments. The owner has every key; an unknown role, none. */
export function effectivePermissions(role: MemberRole | string | null | undefined, overrides?: unknown): PermissionMap {
  if (role === 'owner') return rolePermissions('owner');
  const base = rolePermissions(role);
  if (!role || !(role in ROLE_PERMISSION_DEFAULTS)) return base;
  return { ...base, ...sanitizePermissionOverrides(overrides) };
}

/** Keys whose effective value goes from false to true (what a change grants). */
export function grantedPermissions(before: PermissionMap, after: PermissionMap): PermissionKey[] {
  return PERMISSION_KEYS.filter((k) => after[k] && !before[k]);
}

/** Keys whose effective value changes, with the values before and after (the audit record). */
export function permissionChanges(before: PermissionMap, after: PermissionMap): Partial<Record<PermissionKey, { from: boolean; to: boolean }>> {
  const out: Partial<Record<PermissionKey, { from: boolean; to: boolean }>> = {};
  for (const k of PERMISSION_KEYS) if (before[k] !== after[k]) out[k] = { from: before[k], to: after[k] };
  return out;
}

// ---------------------------------------------------------------------------
// Input and responses
// ---------------------------------------------------------------------------

/**
 * Adjustments of a member (`PUT /workspaces/current/members/:userId/permissions`). `overrides` is the
 * full set of adjustments (keys absent follow the role); unknown keys and non-boolean values are
 * discarded, and keys equal to the role's default are not stored. `role`, when sent, changes the role
 * in the same operation (the sheet has the role selector).
 */
export const memberPermissionsInputSchema = z.object({
  role: z.enum(['editor', 'viewer']).optional(),
  overrides: z
    .record(z.string().max(60), z.unknown())
    .refine((v) => Object.keys(v).length <= 100, { message: 'Ajustes demais' })
    .transform(sanitizePermissionOverrides),
});
export type MemberPermissionsInput = z.input<typeof memberPermissionsInputSchema>;

/** GET/PUT /workspaces/current/members/:userId/permissions. */
export interface MemberPermissions {
  userId: string;
  name: string;
  role: MemberRole;
  /** The stored adjustments (only keys that differ from the role's default). */
  overrides: PermissionOverrides;
  /** What the role gives by itself ("Padrão de Colaborador: desligado"). */
  defaults: PermissionMap;
  /** Role defaults + adjustments. */
  effective: PermissionMap;
  /** False for the owner and for yourself (nobody adjusts the owner nor their own permissions). */
  editable: boolean;
  /** Keys the requester may change (the ones they have: nobody grants what they do not have). */
  grantable: PermissionKey[];
}
