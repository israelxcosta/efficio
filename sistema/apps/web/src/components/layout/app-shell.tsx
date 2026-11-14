import { Suspense, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/auth-context';
import { usePermissions } from '@/features/auth/permissions';
import { SubscriptionBanner, subscriptionRequiredToast } from '@/features/billing/subscription-banner';
import { onAccessError } from '@/lib/api';
import { TransactionActionsProvider } from '@/features/transactions/transaction-actions';
import { ImportActionsProvider } from '@/features/imports/import-actions';
import { TaskActionsProvider } from '@/features/tasks/task-actions';
import { PhotoDirectoryProvider } from '@/features/profile/photos';
import { Skeleton } from '@/components/ui/skeleton';
import { Sidebar } from './sidebar';
import { QuickBar } from './quick-bar';
import { MobileNav } from './mobile-nav';
import { CommandPalette } from './command-palette';
import { IS_DEMO } from '@/lib/demo';
import { DemoBanner } from './demo-banner';
import { areaMemoryKey, forgetStaleAreaMemories, railAreaFor, readAreaMemory, rememberAreaPath } from './area-memory';
import { areaOf } from './nav';
import { shellEntry, SitePage } from '@/features/site/site-entry';
import { MFA_ENROLLMENT_PATH } from '@/features/auth/mfa-enrollment';

export function AppShell() {
  const { user, workspace, loading, mfaEnrollmentPending, refreshMe, resyncSession } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const role = workspace?.role;
  const { canAccessFinance } = usePermissions();

  // Area of the page (Gestão or Financeiro) and the last page of each area in this session, for the
  // rail, the switch button, the bars and ⌘K. Collaborators always see the Gestão.
  const memoryKey = workspace && user ? areaMemoryKey(workspace.id, user.id) : null;
  const pathWithSearch = location.pathname + location.search;
  const memory = useMemo(() => (memoryKey ? readAreaMemory(memoryKey) : {}), [memoryKey, pathWithSearch]);
  const area = railAreaFor(location.pathname, memory, canAccessFinance);
  useEffect(() => {
    // Another workspace (or user) starts with a clean memory; signing out forgets every memory.
    forgetStaleAreaMemories({ loading, signedIn: Boolean(user), key: memoryKey });
  }, [loading, user, memoryKey]);
  useEffect(() => {
    if (!memoryKey) return;
    if (!canAccessFinance && areaOf(location.pathname) === 'financeiro') return;
    rememberAreaPath(memoryKey, pathWithSearch);
  }, [memoryKey, pathWithSearch, location.pathname, canAccessFinance]);

  // 402/403 from any request: explain once (deduplicated toast) and refresh the session state,
  // since the subscription or the member's role may have changed since it was loaded. With paid
  // subscriptions off (`BILLING_ENABLED`) there is no plan to offer: a 402 is told like a 403.
  useEffect(() => {
    onAccessError((kind, error) => {
      if (kind === 'workspace_mismatch') {
        // Another tab switched the shared session: reload it before the user retries.
        resyncSession();
        toast.error(error.message, { id: 'workspace-mismatch' });
        return;
      }
      void refreshMe();
      const subscription = kind === 'subscription_required' ? subscriptionRequiredToast(role === 'owner') : null;
      if (subscription) {
        const { action } = subscription;
        toast.error(subscription.title, {
          id: 'subscription-required',
          description: subscription.description,
          action: action ? { label: action.label, onClick: () => navigate(action.to) } : undefined,
        });
      } else {
        toast.error(error.message, { id: 'forbidden' });
      }
    });
    return () => onAccessError(null);
  }, [navigate, refreshMe, resyncSession, role]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const entry = shellEntry({ loading, signedIn: Boolean(user), pathname: location.pathname, mfaPending: mfaEnrollmentPending });
  if (entry === 'loading') return <FullPageLoader />;
  // Visitors see the office's site at `/`; any other app address asks for the login first.
  if (entry === 'site') {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <SitePage />
      </Suspense>
    );
  }
  if (entry === 'login') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  // Mandatory two-step verification not enabled yet: only the enrollment (back here afterwards).
  if (entry === 'mfa') return <Navigate to={MFA_ENROLLMENT_PATH} replace state={{ from: location.pathname + location.search }} />;

  return (
    <TransactionActionsProvider>
      <ImportActionsProvider>
      <TaskActionsProvider>
      <PhotoDirectoryProvider>
      <div className="min-h-dvh">
        <Sidebar area={area} memory={memory} />
        <div className="lg:pl-[76px] print:pl-0">
          <main className="mx-auto max-w-[1440px] px-4 pt-6 pb-28 sm:px-6 lg:pt-8 lg:pb-32 print:max-w-none print:p-0">
            <DemoBanner />
            <SubscriptionBanner key={workspace?.id} />
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
        <QuickBar area={area} onSearch={() => setPaletteOpen(true)} />
        <MobileNav area={area} memory={memory} onSearch={() => setPaletteOpen(true)} />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} area={area} memory={memory} />
      </div>
      </PhotoDirectoryProvider>
      </TaskActionsProvider>
      </ImportActionsProvider>
    </TransactionActionsProvider>
  );
}

export function FullPageLoader() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3" aria-busy="true">
      <span className="text-lg font-extrabold tracking-tight text-fg">efficio</span>
      <span className="h-1 w-24 overflow-hidden rounded-full bg-bg-subtle">
        <span className="block h-full w-1/2 animate-shimmer rounded-full bg-primary" />
      </span>
      {IS_DEMO ? <span className="text-xs text-muted">Preparando o ambiente de testes…</span> : null}
    </div>
  );
}

function PageLoader() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-8 w-60" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
