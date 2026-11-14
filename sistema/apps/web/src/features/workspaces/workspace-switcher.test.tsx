// The workspaces of the phone's "Mais": a real list of real buttons (a `role="listitem"` on a button
// made screen readers lose the button), with "Nova empresa" after the list.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceSummary } from '@effinance/shared';
import { WorkspaceList } from './workspace-switcher';

const ws = (id: string, name: string) =>
  ({ id, name, kind: 'business', role: 'owner', subscription: { canWrite: true } }) as unknown as WorkspaceSummary;
const workspaces = [ws('w1', 'Efficio Contabilidade'), ws('w2', 'Costa Ltda')];

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ workspace: workspaces[0], workspaces, switchWorkspace: async () => {} }),
}));

describe('WorkspaceList', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <WorkspaceList onCreate={() => {}} />
    </MemoryRouter>,
  );

  it('puts each workspace button inside a list item, with no role overriding the button', () => {
    expect(html).not.toContain('role="listitem"');
    expect(html).not.toContain('role="list"');
    const list = html.slice(html.indexOf('<ul'), html.indexOf('</ul>'));
    expect(list).toContain('aria-label="Empresas"');
    expect(list.match(/<li><button type="button"/g)).toHaveLength(2);
    expect(list).toContain('aria-current="true"');
  });

  it('keeps "Nova empresa" out of the list', () => {
    expect(html.indexOf('Nova empresa')).toBeGreaterThan(html.indexOf('</ul>'));
  });
});
