import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { BriefcaseBusiness, ChevronDown, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useElementSize } from '@/lib/use-element-size';
import { useAuth } from '@/features/auth/auth-context';
import { Tooltip } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { WORKSPACE_KIND_ICONS } from '@/features/workspaces/kind-icon';
import { usePermissions } from '@/features/auth/permissions';
import { lastPathOf, type AreaMemory } from './area-memory';
import { AREA_HOME, AREA_SHORT_LABELS, isActivePath, MY_AREA_ITEM, railItemsFor, SETTINGS_ITEM, splitRail, type Area, type NavItem } from './nav';
import { MemberAvatar } from '@/components/ui/member-avatar';

interface SidebarProps {
  /** Area whose rail is shown (Gestão or Financeiro). */
  area: Area;
  /** Last page of each area in this session (destination of the switch button). */
  memory: AreaMemory;
}

export function Sidebar({ area, memory }: SidebarProps) {
  const { user, workspace } = useAuth();
  const { pathname } = useLocation();
  const KindIcon = workspace ? WORKSPACE_KIND_ICONS[workspace.kind] : null;
  // Icons that do not fit the window height go to the "more" menu beside the rail (no scrollbar).
  const rail = useElementSize<HTMLElement>();
  // Only members with both areas see the area label and the switch button.
  const { canAccessFinance, can } = usePermissions();
  const { visible, hidden } = splitRail(railItemsFor(area, can), rail.height);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[76px] flex-col items-center border-r border-border bg-bg-subtle py-5 lg:flex print:hidden">
      <Link
        to={AREA_HOME[area]}
        className={cn('flex flex-col items-center', canAccessFinance ? 'mb-5' : 'mb-6')}
        aria-label={area === 'financeiro' ? 'Efficio — painel financeiro' : 'Efficio — início da gestão'}
      >
        <span className="text-[13px] font-extrabold tracking-tight text-fg">efficio</span>
        {canAccessFinance ? <span className="mt-0.5 text-micro font-semibold text-muted">{AREA_SHORT_LABELS[area]}</span> : null}
      </Link>
      <nav
        ref={rail.ref}
        aria-label={area === 'financeiro' ? 'Navegação do financeiro' : 'Navegação da gestão de tarefas'}
        className="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-hidden"
      >
        {visible.map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}
        {hidden.length ? <MoreLinks items={hidden} /> : null}
      </nav>
      <div className="mt-4 flex flex-col items-center gap-3">
        {canAccessFinance ? (
          <>
            <span className="my-1 h-px w-6 bg-border" aria-hidden />
            <AreaSwitchButton area={area} to={lastPathOf(memory, area === 'gestao' ? 'financeiro' : 'gestao')} />
          </>
        ) : null}
        <SidebarLink {...SETTINGS_ITEM} />
        <AvatarLink
          name={user?.name ?? ''}
          userId={user?.id ?? ''}
          photoVersion={user?.photoUpdatedAt ?? null}
          active={isActivePath(pathname, MY_AREA_ITEM)}
          badge={
            // Shared workspaces get a small badge so the active one is visible at a glance.
            KindIcon && workspace?.kind !== 'personal' ? (
              <span className="absolute -right-1 -bottom-1 flex size-[18px] items-center justify-center rounded-full bg-primary text-primary-fg ring-2 ring-bg-subtle">
                <KindIcon className="size-2.5" aria-hidden />
              </span>
            ) : null
          }
        />
      </div>
    </aside>
  );
}

/**
 * The avatar at the foot of the rail: a link to Minha área (spec §2.2), with the ring `ring-primary`
 * there (`ring-surface` at rest) and the badge of the workspace kind in the corner. No menu.
 */
export function AvatarLink({ name, userId, photoVersion, active, badge }: { name: string; userId: string; photoVersion: string | null; active: boolean; badge: ReactNode }) {
  return (
    <Tooltip content="Minha área" side="right" delay={150}>
      <Link
        to={MY_AREA_ITEM.to}
        aria-label={`Minha área — ${name}`}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative flex size-10 items-center justify-center rounded-full ring-2 transition-transform duration-150 hover:scale-105',
          active ? 'ring-primary' : 'ring-surface',
        )}
      >
        <MemberAvatar size="lg" name={name} userId={userId} photoVersion={photoVersion} />
        {badge}
      </Link>
    </Tooltip>
  );
}

/**
 * Fixed button at the foot of the rail that goes to the other area (administrators only), always in
 * the same place in both areas. It has a fill and a ring at rest, so it reads as "change place", and
 * it is never active.
 */
function AreaSwitchButton({ area, to }: { area: Area; to: string }) {
  const toFinance = area === 'gestao';
  const label = toFinance ? 'Ir para o financeiro' : 'Ir para a gestão de tarefas';
  const Icon = toFinance ? Wallet : BriefcaseBusiness;
  return (
    <Tooltip content={label} side="right" delay={150}>
      <Link
        to={to}
        aria-label={label}
        className="flex size-11 shrink-0 items-center justify-center rounded-md bg-surface text-muted shadow-xs ring-1 ring-border transition-colors duration-150 hover:text-fg hover:ring-border-strong"
      >
        <Icon className="size-5" />
      </Link>
    </Tooltip>
  );
}

/**
 * "More" button in the last slot of a short rail: a chevron that opens the icons that did not fit
 * in a menu beside the rail, with their names. It looks active when the current page is among them.
 */
function MoreLinks({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = items.some((i) => isActivePath(pathname, i));
  return (
    <DropdownMenu>
      <Tooltip content={`Mais ${items.length} ${items.length === 1 ? 'item' : 'itens'}`} side="right" delay={150}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Mais itens do menu (${items.length})`}
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-md transition-colors duration-150 data-[state=open]:bg-surface data-[state=open]:text-fg',
              active ? 'bg-surface text-fg ring-1 ring-border' : 'text-muted hover:bg-surface/70 hover:text-fg',
            )}
          >
            <ChevronDown className="size-5" />
          </button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent side="right" align="end" sideOffset={14} className="w-60">
        {items.map((item) => {
          const current = isActivePath(pathname, item);
          return (
            <DropdownMenuItem
              key={item.to}
              icon={<item.icon />}
              aria-current={current ? 'page' : undefined}
              className={cn(current && 'bg-bg-subtle font-semibold')}
              onSelect={() => navigate(item.to)}
            >
              {item.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarLink({
  to,
  label,
  icon: Icon,
  end,
  activeOn,
}: {
  to: string;
  label: string;
  end?: boolean;
  activeOn?: string[];
  icon: React.ComponentType<{ className?: string }>;
}) {
  const { pathname } = useLocation();
  const isActive = isActivePath(pathname, { to, end, activeOn });
  // Plain Link with a string className: Tooltip's Slot cannot merge NavLink's function className.
  return (
    <Tooltip content={label} side="right" delay={150}>
      <Link
        to={to}
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-md transition-colors duration-150',
          isActive
            ? 'bg-surface text-fg ring-1 ring-border'
            : 'text-muted hover:bg-surface/70 hover:text-fg',
        )}
      >
        <Icon className="size-5" />
      </Link>
    </Tooltip>
  );
}
