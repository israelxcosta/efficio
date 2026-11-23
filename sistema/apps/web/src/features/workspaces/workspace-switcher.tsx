import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { WorkspaceSummary } from '@effinance/shared';
import { toastError } from '@/lib/notify';
import { useAuth } from '@/features/auth/auth-context';

// Each person belongs to one office: there is no workspace switcher nor "Nova empresa" in the menus.
// Switching stays only for the flows that leave or delete the current workspace (Membros, Privacidade),
// which move the session to the remaining one.

/** Switches the active workspace: the server re-issues the session, cached data is dropped. */
export function useSwitchWorkspace() {
  const { workspace, switchWorkspace } = useAuth();
  const navigate = useNavigate();
  const [switching, setSwitching] = useState<string | null>(null);
  async function switchTo(target: WorkspaceSummary, { to = '/', silent = false }: { to?: string; silent?: boolean } = {}) {
    if (target.id === workspace?.id && !silent) return;
    setSwitching(target.id);
    try {
      await switchWorkspace(target.id);
      navigate(to);
      if (!silent) toast.success(`Você está em ${target.name}`);
    } catch (error) {
      toastError(error);
    } finally {
      setSwitching(null);
    }
  }
  return { switchTo, switching };
}

