// Paid subscriptions are a future rollout (`BILLING_ENABLED` of @effinance/shared). While the flag is
// off the web shows nothing of billing: no Assinatura tab, no trial or read-only banner, no plan in the
// workspace switcher, no "assinatura inativa" block. The billing components stay in the code and come
// back as they were when the flag is turned on, so every piece is tested in both states.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rolePermissions, TRIAL_DAYS, type MeResponse, type MemberRole, type SubscriptionSummary } from '@effinance/shared';

const billing = vi.hoisted(() => ({ enabled: false }));
vi.mock('@effinance/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@effinance/shared')>()),
  get BILLING_ENABLED() {
    return billing.enabled;
  },
}));

import { AuthProvider } from '@/features/auth/auth-context';
import { gateFor, permissionsFor, SUBSCRIPTION_REASON, WriteGate } from '@/features/auth/permissions';
import { ROLE_HINTS } from '@/features/auth/roles';
import { accountCreatedMessage } from '@/features/auth/pages/register';
import { TooltipProvider } from '@/components/ui/tooltip';
import { settingsSearchKeywords } from '@/components/layout/nav';
import { resolveSettingsTab, settingsTabsFor } from '@/features/settings/pages/settings';
import { memberLimitCopy, membersCountLine } from '@/features/settings/tabs/members-tab';
import { newWorkspaceCreatedMessage, newWorkspaceTrialNote, workspaceAccessNote } from '@/features/workspaces/workspace-switcher';
import { qk } from '@/lib/query-keys';
import { SubscriptionBanner, subscriptionRequiredToast } from './subscription-banner';

afterEach(() => {
  billing.enabled = false;
});

const both = [false, true] as const;
const ID = '44444444-4444-4444-8444-444444444444';

const lapsed: SubscriptionSummary = { planCode: null, status: 'expired', trialEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, canWrite: false };
const trialing: SubscriptionSummary = { planCode: null, status: 'trialing', trialEndsAt: '2099-01-01T00:00:00.000Z', currentPeriodEnd: null, cancelAtPeriodEnd: false, canWrite: true };

function asMember(subscription: SubscriptionSummary, role: MemberRole = 'owner') {
  const qc = new QueryClient();
  const workspace = { id: ID, name: 'Escritório', kind: 'business', role, permissions: rolePermissions(role), subscription };
  qc.setQueryData(qk.me, { user: { id: 'me', name: 'Ana', email: 'a@x.com', photoUpdatedAt: null }, workspace, workspaces: [workspace] } as unknown as MeResponse);
  return (node: React.ReactNode) =>
    renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <MemoryRouter>
            <TooltipProvider>{node}</TooltipProvider>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );
}

describe('write blocks (WriteGate, permissions)', () => {
  it('with billing off, an inactive subscription blocks nothing and no screen says "assinatura inativa"', () => {
    const owner = permissionsFor('owner', false);
    expect(owner).toMatchObject({ subscriptionActive: true, canWriteTasks: true, canManage: true, canWrite: true, readOnlyReason: null, subscriptionReason: null });
    expect(permissionsFor('viewer', false)).toMatchObject({ canWriteTasks: true, subscriptionReason: null });
    for (const scope of ['finance', 'tasks', 'admin'] as const) expect(gateFor(owner, scope)).toEqual({ hidden: false, reason: null });
    // Without a workspace there is still nothing to write.
    expect(permissionsFor(null, false, false)).toMatchObject({ canWriteTasks: false, canManage: false, canWrite: false, readOnlyReason: null });
  });

  it('with billing on, an inactive subscription disables every write with the reason', () => {
    billing.enabled = true;
    const owner = permissionsFor('owner', false);
    expect(owner).toMatchObject({ subscriptionActive: false, canWriteTasks: false, canManage: false, canWrite: false, readOnlyReason: SUBSCRIPTION_REASON, subscriptionReason: SUBSCRIPTION_REASON });
    expect(gateFor(owner, 'tasks')).toEqual({ hidden: false, reason: SUBSCRIPTION_REASON });
    expect(permissionsFor('owner', true).subscriptionReason).toBeNull();
  });

  it('renders the gated control enabled with billing off and disabled with billing on', () => {
    const control = (
      <WriteGate scope="tasks">
        <button type="button">Nova tarefa</button>
      </WriteGate>
    );
    expect(asMember(lapsed)(control)).toBe('<button type="button">Nova tarefa</button>');
    billing.enabled = true;
    const blocked = asMember(lapsed)(control);
    expect(blocked).toContain('disabled=""');
    expect(blocked).toContain('cursor-not-allowed');
  });
});

describe('Configurações › Assinatura', () => {
  it('has no Assinatura tab with billing off, for anyone', () => {
    for (const office of [false, true]) expect(settingsTabsFor(true, office)).not.toContain('assinatura');
    expect(settingsTabsFor(true, true)).toEqual(['perfil', 'seguranca', 'membros', 'escritorio', 'integracoes', 'privacidade']);
  });

  it('keeps the Assinatura tab for administrators with billing on', () => {
    billing.enabled = true;
    expect(settingsTabsFor(true)).toContain('assinatura');
    expect(settingsTabsFor(false)).not.toContain('assinatura');
  });

  it('answers ?aba=assinatura like an unknown tab with billing off: Perfil, and the address is cleaned', () => {
    expect(resolveSettingsTab('assinatura', settingsTabsFor(true))).toEqual({ tab: 'perfil', redirect: true });
    expect(resolveSettingsTab('integracoes', settingsTabsFor(true))).toEqual({ tab: 'integracoes', redirect: false });
    expect(resolveSettingsTab(null, settingsTabsFor(true))).toEqual({ tab: 'perfil', redirect: false });
    billing.enabled = true;
    expect(resolveSettingsTab('assinatura', settingsTabsFor(true))).toEqual({ tab: 'assinatura', redirect: false });
  });

  it('is not found by ⌘K as "assinatura" or "plano" with billing off', () => {
    expect(settingsSearchKeywords()).not.toMatch(/assinatura|plano/);
    expect(settingsSearchKeywords()).toContain('seguranca');
    billing.enabled = true;
    expect(settingsSearchKeywords()).toMatch(/assinatura/);
  });
});

describe('trial and inactive-subscription notices', () => {
  it('shows no banner with billing off, whatever the subscription says', () => {
    for (const sub of [lapsed, trialing, { ...trialing, status: 'past_due' as const }, { ...trialing, status: 'pending' as const }]) {
      expect(asMember(sub)(<SubscriptionBanner />)).toBe('');
    }
  });

  it('shows the trial and read-only banners with billing on', () => {
    billing.enabled = true;
    expect(asMember(trialing)(<SubscriptionBanner />)).toContain('Período de teste');
    const readOnly = asMember(lapsed)(<SubscriptionBanner />);
    expect(readOnly).toContain('Modo somente leitura');
    expect(readOnly).toContain('href="/configuracoes?aba=assinatura"');
  });

  it('never offers to subscribe on a 402 with billing off', () => {
    for (const owner of both) expect(subscriptionRequiredToast(owner)).toBeNull();
    billing.enabled = true;
    expect(subscriptionRequiredToast(true)).toMatchObject({ title: 'Assinatura necessária', action: { label: 'Assinar', to: '/configuracoes?aba=assinatura' } });
    expect(subscriptionRequiredToast(false)?.action).toBeUndefined();
  });
});

describe('workspace switcher and new workspace', () => {
  it('shows no plan, trial or read-only state with billing off', () => {
    expect(workspaceAccessNote({ subscription: lapsed })).toBe('');
    expect(newWorkspaceTrialNote()).toBeNull();
    expect(newWorkspaceCreatedMessage('Filial')).toBe('Filial criada. Convide quem vai participar.');
  });

  it('shows them with billing on', () => {
    billing.enabled = true;
    expect(workspaceAccessNote({ subscription: lapsed })).toBe(' · somente leitura');
    expect(workspaceAccessNote({ subscription: trialing })).toBe('');
    expect(newWorkspaceTrialNote()?.title).toBe(`${TRIAL_DAYS} dias grátis, sem cartão`);
    expect(newWorkspaceTrialNote()?.detail).toMatch(/plano/);
    expect(newWorkspaceCreatedMessage('Filial')).toBe(`Filial criada com ${TRIAL_DAYS} dias grátis. Convide quem vai participar.`);
  });
});

describe('texts that spoke of the plan or the subscription', () => {
  it('drop the plan and the subscription with billing off', () => {
    expect(membersCountLine(3, 5)).toBe('3 de 5 membros');
    expect(membersCountLine(undefined, undefined)).toBe('Pessoas com acesso a este espaço');
    const limit = memberLimitCopy({ kind: 'business', max: 5, upgrade: { name: 'Empresa Plus', maxMembers: 20 } });
    expect(limit.title).toBe('Limite de membros atingido (5)');
    expect(limit.detail).toBe('Remova um membro ou um convite pendente para convidar outra pessoa.');
    expect(ROLE_HINTS.owner).not.toMatch(/assinatura/);
    expect(accountCreatedMessage()).not.toMatch(/grátis|teste/);
  });

  it('keep them with billing on', () => {
    billing.enabled = true;
    expect(membersCountLine(3, 5)).toBe('3 de 5 membros no plano atual');
    const limit = memberLimitCopy({ kind: 'business', max: 5, upgrade: { name: 'Empresa Plus', maxMembers: 20 } });
    expect(limit.title).toBe('Limite de membros do plano atingido (5)');
    expect(limit.detail).toBe('Mude para o plano Empresa Plus para convidar até 20 membros.');
    expect(ROLE_HINTS.owner).toMatch(/assinatura/);
    expect(accountCreatedMessage()).toContain(`${TRIAL_DAYS} dias grátis`);
  });

  it('say the same for a personal workspace in both states', () => {
    for (const on of both) {
      billing.enabled = on;
      expect(memberLimitCopy({ kind: 'personal', max: 1, upgrade: undefined }).detail).toBe('Este espaço é individual. Crie uma empresa para compartilhar com a equipe.');
    }
  });
});
