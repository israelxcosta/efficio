import { describe, expect, it } from 'vitest';
import { rolePermissions } from '@effinance/shared';
import { ADMIN_ONLY_REASON, FINANCE_ONLY_REASON, gateFor, permissionsFor, SUBSCRIPTION_REASON } from './permissions';
import { ROLE_LABELS } from './roles';

describe('permissionsFor', () => {
  it('gives the finances and the registries to owner and editor', () => {
    for (const role of ['owner', 'editor'] as const) {
      const p = permissionsFor(role, true);
      expect(p).toMatchObject({ isAdmin: true, canAccessFinance: true, canWriteTasks: true, canManage: true, canWrite: true, readOnlyReason: null });
    }
    expect(permissionsFor('owner', true).isOwner).toBe(true);
    expect(permissionsFor('editor', true).isOwner).toBe(false);
  });

  it('lets the collaborator work on tasks without the finances', () => {
    const p = permissionsFor('viewer', true);
    expect(p).toMatchObject({ isAdmin: false, canAccessFinance: false, canWriteTasks: true, canManage: false, canWrite: false });
    expect(p.readOnlyReason).toBe(FINANCE_ONLY_REASON);
  });

  it('blocks every write while the subscription is inactive, for everyone', () => {
    const admin = permissionsFor('owner', false);
    expect(admin).toMatchObject({ canAccessFinance: true, canWriteTasks: false, canManage: false, canWrite: false, readOnlyReason: SUBSCRIPTION_REASON });
    expect(permissionsFor('viewer', false)).toMatchObject({ canWriteTasks: false, canAccessFinance: false });
  });

  it('allows nothing without a workspace', () => {
    expect(permissionsFor(null, false, false)).toMatchObject({ canWriteTasks: false, canManage: false, canWrite: false, readOnlyReason: null });
  });
});

describe('gateFor (WriteGate scopes)', () => {
  const viewer = permissionsFor('viewer', true);
  const admin = permissionsFor('editor', true);
  const lapsed = permissionsFor('editor', false);

  it('shows the task controls to everyone, disabled only by the subscription', () => {
    expect(gateFor(viewer, 'tasks')).toEqual({ hidden: false, reason: null });
    expect(gateFor(permissionsFor('viewer', false), 'tasks')).toEqual({ hidden: false, reason: SUBSCRIPTION_REASON });
  });

  it('hides registry and finance controls from collaborators (a permanent restriction)', () => {
    expect(gateFor(viewer, 'admin')).toEqual({ hidden: true, reason: null });
    expect(gateFor(viewer, 'finance')).toEqual({ hidden: true, reason: null });
  });

  it('shows them to administrators, disabled with the reason when the subscription lapsed', () => {
    expect(gateFor(admin, 'admin')).toEqual({ hidden: false, reason: null });
    expect(gateFor(lapsed, 'finance')).toEqual({ hidden: false, reason: SUBSCRIPTION_REASON });
  });

  it('keeps the texts of the spec', () => {
    expect(FINANCE_ONLY_REASON).toBe('O financeiro é restrito aos administradores do espaço.');
    expect(ADMIN_ONLY_REASON).toBe('Somente administradores alteram este cadastro.');
    expect(ROLE_LABELS).toEqual({ owner: 'Proprietário', editor: 'Administrador', viewer: 'Colaborador' });
  });
});

describe('can(key) and per-person adjustments (phase 3)', () => {
  it('follows the role defaults without a map (the behavior of phases 1 and 2)', () => {
    const owner = permissionsFor('owner', true);
    const editor = permissionsFor('editor', true);
    const viewer = permissionsFor('viewer', true);
    expect(owner.can('members')).toBe(true);
    expect(editor.can('members')).toBe(false);
    expect(editor.can('office')).toBe(true);
    expect(viewer.can('finance')).toBe(false);
    expect(viewer.can('page.audit')).toBe(true);
  });

  it('reads the effective map of the session: a collaborator with the finances, an administrator without', () => {
    const viewerWithFinance = permissionsFor('viewer', true, true, { ...rolePermissions('viewer'), finance: true });
    expect(viewerWithFinance).toMatchObject({ canAccessFinance: true, canWrite: true, readOnlyReason: null });
    const editorNoFinance = permissionsFor('editor', true, true, { ...rolePermissions('editor'), finance: false });
    expect(editorNoFinance).toMatchObject({ canAccessFinance: false, canWrite: false, readOnlyReason: FINANCE_ONLY_REASON, isAdmin: true });
    // Registries follow `registry`, not the role.
    expect(permissionsFor('editor', true, true, { ...rolePermissions('editor'), registry: false }).canManage).toBe(false);
  });

  it('allows nothing without a workspace, whatever the map says', () => {
    expect(permissionsFor('owner', true, false, rolePermissions('owner')).can('finance')).toBe(false);
  });

  it('hides a gated control by an explicit permission key', () => {
    const editor = permissionsFor('editor', true);
    expect(gateFor(editor, 'tasks', 'members')).toEqual({ hidden: true, reason: null });
    expect(gateFor(editor, 'tasks', 'office')).toEqual({ hidden: false, reason: null });
    expect(gateFor(permissionsFor('owner', false), 'tasks', 'office')).toEqual({ hidden: false, reason: SUBSCRIPTION_REASON });
    // `admin` is a shortcut of `registry`.
    const noRegistry = permissionsFor('editor', true, true, { ...rolePermissions('editor'), registry: false });
    expect(gateFor(noRegistry, 'admin').hidden).toBe(true);
  });
});
