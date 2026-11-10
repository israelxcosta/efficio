import { forwardRef, useState, type ComponentPropsWithoutRef } from 'react';
import { useNavigate } from 'react-router';
import { ChevronDown, LogOut, Moon, Settings, Sun } from 'lucide-react';
import { WORKSPACE_KIND_LABELS, type WorkspaceKind } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/features/auth/auth-context';
import { WORKSPACE_KIND_ICONS } from '@/features/workspaces/kind-icon';
import { WorkspaceMenuItems, WorkspaceSheet } from '@/features/workspaces/workspace-switcher';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

/** The button of the account menu: the workspace's kind icon, its name and a chevron (no hooks). */
export const AccountMenuTrigger = forwardRef<HTMLButtonElement, { workspace: { name: string; kind: WorkspaceKind } } & ComponentPropsWithoutRef<'button'>>(
  function AccountMenuTrigger({ workspace, className, ...props }, ref) {
    const Icon = WORKSPACE_KIND_ICONS[workspace.kind];
    return (
      <Button ref={ref} variant="outline" aria-label={`Conta e espaço: ${workspace.name}`} className={cn('min-w-0 justify-start', className)} {...props}>
        <Icon aria-hidden />
        <span className="max-w-56 min-w-0 truncate">{workspace.name}</span>
        <ChevronDown className="ml-auto text-muted" aria-hidden />
      </Button>
    );
  },
);

/** "Conta": who is logged in and the current workspace, on top of the menu (no hooks). */
export function AccountMenuHeader({ name, email, workspace, kindLabel }: { name: string; email: string; workspace: string; kindLabel: string }) {
  return (
    <div className="px-2.5 pb-2">
      <p className="truncate text-sm font-semibold">{name}</p>
      <p className="truncate text-xs text-muted">{email}</p>
      {workspace ? (
        <p className="mt-1.5 truncate text-xs text-muted">
          Espaço atual: <span className="font-semibold text-fg">{workspace}</span> · {kindLabel}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The account menu of Minha área (spec §15.4), what the avatar's menu was minus Perfil (the button
 * beside it) and Minhas anotações (a card): workspaces and Nova empresa, theme, Configurações, Sair.
 */
export function AccountMenu({ className }: { className?: string }) {
  const { user, workspace, logout } = useAuth();
  const { resolved, toggle } = useTheme();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  if (!workspace) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <AccountMenuTrigger workspace={workspace} className={className} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="w-72">
          <DropdownMenuLabel>Conta</DropdownMenuLabel>
          <AccountMenuHeader name={user?.name ?? ''} email={user?.email ?? ''} workspace={workspace.name} kindLabel={WORKSPACE_KIND_LABELS[workspace.kind]} />
          <DropdownMenuSeparator />
          <WorkspaceMenuItems onCreate={() => setCreating(true)} />
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={resolved === 'dark' ? <Sun /> : <Moon />} onSelect={toggle}>
            {resolved === 'dark' ? 'Tema claro' : 'Tema escuro'}
          </DropdownMenuItem>
          <DropdownMenuItem icon={<Settings />} onSelect={() => navigate('/configuracoes')}>
            Configurações
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            icon={<LogOut />}
            tone="danger"
            onSelect={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          >
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <WorkspaceSheet open={creating} onOpenChange={setCreating} />
    </>
  );
}
