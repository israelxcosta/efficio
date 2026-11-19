// Removing a member revokes every key they hold, and nobody revokes what they do not have (the API
// answers 403 with `details.keys`): the members list only offers "Remover" when the manager holds every
// effective key of the person.
import { describe, expect, it } from 'vitest';
import { effectivePermissions, PERMISSION_KEYS, type PermissionKey } from '@effinance/shared';
import { keysBlockingRemoval } from './member-access';

const holding = (keys: Iterable<PermissionKey>) => {
  const set = new Set(keys);
  return (k: PermissionKey) => set.has(k);
};
const keysOf = (role: 'owner' | 'editor' | 'viewer') => {
  const map = effectivePermissions(role);
  return PERMISSION_KEYS.filter((k) => map[k]);
};

describe('who may remove whom', () => {
  it('the owner (every key) removes anyone but the owner', () => {
    const owner = holding(PERMISSION_KEYS);
    expect(keysBlockingRemoval({ role: 'editor', permissionOverrides: {} }, owner)).toEqual([]);
    expect(keysBlockingRemoval({ role: 'viewer', permissionOverrides: { finance: true } }, owner)).toEqual([]);
    expect(keysBlockingRemoval({ role: 'owner', permissionOverrides: {} }, owner).length).toBeGreaterThan(0);
  });

  it('a manager without `finance` cannot remove someone who has it', () => {
    const manager = holding([...keysOf('viewer'), 'members']);
    expect(keysBlockingRemoval({ role: 'editor', permissionOverrides: {} }, manager)).toContain('finance');
    expect(keysBlockingRemoval({ role: 'viewer', permissionOverrides: { finance: true } }, manager)).toEqual(['finance']);
    // Someone whose keys the manager all holds can go.
    expect(keysBlockingRemoval({ role: 'viewer', permissionOverrides: {} }, manager)).toEqual([]);
    // An editor with finance turned off (and only keys the manager holds) too, when that is the case.
    const editorKeys = holding([...keysOf('editor'), 'members']);
    expect(keysBlockingRemoval({ role: 'editor', permissionOverrides: { finance: false } }, editorKeys)).toEqual([]);
  });

  it('missing overrides count as the role defaults', () => {
    const manager = holding(keysOf('viewer'));
    expect(keysBlockingRemoval({ role: 'viewer' }, manager)).toEqual([]);
    expect(keysBlockingRemoval({ role: 'viewer', permissionOverrides: null }, manager)).toEqual([]);
  });
});
