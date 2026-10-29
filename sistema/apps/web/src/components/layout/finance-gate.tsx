import { useEffect, useRef, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { LockKeyhole } from 'lucide-react';
import type { TaskMember } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { FINANCE_ONLY_REASON, usePermissions } from '@/features/auth/permissions';
import { useTaskMembers } from '@/features/tasks/api';

/**
 * Layout route around every finance page (spec §2.7). Administrators get the page; collaborators get
 * "Acesso restrito" at the same URL (no redirect, so a role change opens the page right there). The
 * pages below never mount for them, so no financial request is made.
 */
export function FinanceGate() {
  const { canAccessFinance } = usePermissions();
  return (
    <FinanceGateView canAccessFinance={canAccessFinance}>
      <Outlet />
    </FinanceGateView>
  );
}

export function FinanceGateView({ canAccessFinance, children, restricted }: { canAccessFinance: boolean; children: ReactNode; restricted?: ReactNode }) {
  return <>{canAccessFinance ? children : (restricted ?? <RestrictedAccess />)}</>;
}

/** Up to two administrators by name (owner first), and whether there are more. */
export function adminsToAsk(members: Pick<TaskMember, 'name' | 'role' | 'isAdmin' | 'isYou'>[]): { names: string[]; more: boolean } {
  const admins = members
    .filter((m) => m.isAdmin && !m.isYou)
    .sort((a, b) => (a.role === 'owner' ? 0 : 1) - (b.role === 'owner' ? 0 : 1) || a.name.localeCompare(b.name, 'pt-BR'));
  return { names: admins.slice(0, 2).map((m) => m.name), more: admins.length > 2 };
}

export function RestrictedAccess() {
  // Members are open to everyone (task module): the only request this page makes.
  const members = useTaskMembers();
  const location = useLocation();
  const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null);
  const ask = members.data ? adminsToAsk(members.data) : null;
  const canGoBack = location.key !== 'default';

  useEffect(() => {
    const previous = document.title;
    document.title = 'Acesso restrito · Efficio';
    heading.current?.focus();
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-bg-subtle text-muted" aria-hidden>
        <LockKeyhole className="size-5" />
      </span>
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
        Acesso restrito
      </h1>
      <p className="text-sm text-muted">{FINANCE_ONLY_REASON}</p>
      {ask && ask.names.length ? (
        <p className="max-w-md text-sm text-muted">
          Para pedir acesso, fale com <strong className="font-semibold text-fg">{ask.names[0]}</strong>
          {ask.names[1] ? (
            <>
              {ask.more ? ', ' : ' ou '}
              <strong className="font-semibold text-fg">{ask.names[1]}</strong>
            </>
          ) : null}
          {ask.more ? ' ou outro administrador' : ''}.
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link to="/">Ir para o início</Link>
        </Button>
        {canGoBack ? (
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Voltar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
