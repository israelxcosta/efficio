import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { CreditCard, Plug, ShieldCheck, ShieldEllipsis, UserRound, Users } from 'lucide-react';
import { WORKSPACE_KIND_LABELS } from '@effinance/shared';
import { PageHeader } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useAuth } from '@/features/auth/auth-context';
import { usePermissions } from '@/features/auth/permissions';
import { ProfileTab } from '../tabs/profile-tab';
import { SecurityTab } from '../tabs/security-tab';
import { MembersTab } from '../tabs/members-tab';
import { SubscriptionTab } from '../tabs/subscription-tab';
import { PrivacyTab } from '../tabs/privacy-tab';
import { IntegrationsTab } from '../tabs/integrations-tab';

const TABS = ['perfil', 'seguranca', 'membros', 'assinatura', 'integracoes', 'privacidade'] as const;
type Tab = (typeof TABS)[number];
/** Collaborators (no finance access) see Perfil, Segurança, Membros and Privacidade (spec §2.6). */
const ADMIN_TABS: readonly Tab[] = ['assinatura', 'integracoes'];

export function settingsTabsFor(canAccessFinance: boolean): readonly Tab[] {
  return canAccessFinance ? TABS : TABS.filter((t) => !ADMIN_TABS.includes(t));
}

export default function SettingsPage() {
  const { workspace } = useAuth();
  const { canAccessFinance } = usePermissions();
  const tabs = settingsTabsFor(canAccessFinance);
  const [params, setParams] = useSearchParams();
  const raw = params.get('aba');
  const tab: Tab = (tabs as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'perfil';

  // Narrow screens scroll the tab bar: keep the active tab (e.g. from a link) in view.
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = tabsRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    const bar = tabsRef.current;
    if (!active || !bar || bar.scrollWidth <= bar.clientWidth) return;
    const a = active.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    bar.scrollLeft += a.left - b.left - (b.width - a.width) / 2;
  }, [tab]);

  function select(next: Tab) {
    // Tab-specific params (e.g. ?simular= from the fake checkout) don't carry over.
    setParams(next === 'perfil' ? {} : { aba: next }, { replace: true });
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Configurações"
        description={
          workspace ? (
            <>
              Conta, segurança e o espaço <span className="font-semibold text-fg">{workspace.name}</span> ({WORKSPACE_KIND_LABELS[workspace.kind]}).
            </>
          ) : (
            'Conta, segurança e assinatura.'
          )
        }
      />
      <div ref={tabsRef} className="-mx-1 overflow-x-auto px-1 pb-1">
        <SegmentedControl
          variant="solid"
          ariaLabel="Seções das configurações"
          value={tab}
          onChange={select}
          options={[
            { value: 'perfil' as const, label: 'Perfil', icon: <UserRound /> },
            { value: 'seguranca' as const, label: 'Segurança', icon: <ShieldCheck /> },
            { value: 'membros' as const, label: 'Membros', icon: <Users /> },
            { value: 'assinatura' as const, label: 'Assinatura', icon: <CreditCard /> },
            { value: 'integracoes' as const, label: 'Integrações', icon: <Plug /> },
            { value: 'privacidade' as const, label: 'Privacidade', icon: <ShieldEllipsis /> },
          ].filter((o) => tabs.includes(o.value))}
        />
      </div>
      {tab === 'perfil' ? <ProfileTab /> : null}
      {tab === 'seguranca' ? <SecurityTab /> : null}
      {tab === 'membros' ? <MembersTab /> : null}
      {tab === 'assinatura' ? <SubscriptionTab /> : null}
      {tab === 'integracoes' ? <IntegrationsTab /> : null}
      {tab === 'privacidade' ? <PrivacyTab /> : null}
    </div>
  );
}
