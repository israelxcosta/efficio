import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  CalendarDays,
  CalendarPlus,
  CalendarSync,
  ClipboardCheck,
  GitBranchPlus,
  Layers,
  List,
  ListTree,
  Plus,
  Repeat,
  SquareKanban,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip } from '@/components/ui/tooltip';
import { gateFor, usePermissions } from '@/features/auth/permissions';
import { cn } from '@/lib/utils';
import { useTaskActions } from '../task-actions';
import { activeHubView, createActions, hubViewHref, hubViewItems, type CreateAction, type CreateActionId, type HubViewId, type HubViewItem } from '../task-hub';
import { useTaskSheetLinks } from '../task-links';
import type { TaskView } from '../url-state';

/** Icons of Ver (spec §2.9): the views of Tarefas, then the other pages. */
export const HUB_VIEW_ICONS: Record<HubViewId, LucideIcon> = {
  list: List,
  board: SquareKanban,
  calendar: CalendarDays,
  audit: ClipboardCheck,
  recurring: Repeat,
  regimes: Layers,
  processes: Workflow,
};

/** Icons of Criar: variations with "+" or of a calendar, never the shapes of Ver. */
export const CREATE_ICONS: Record<CreateActionId, LucideIcon> = {
  task: Plus,
  appointment: CalendarPlus,
  recurring: CalendarSync,
  process: GitBranchPlus,
};

const TASK_VIEWS = new Set<HubViewId>(['list', 'board', 'calendar']);

export interface TasksHubViewProps {
  views: HubViewItem[];
  active: HubViewId | null;
  hrefOf: (id: HubViewId) => string;
  /** On Tarefas the views replace the history entry (they only change `visao`). */
  replaceViews: boolean;
  onViewChosen?: (view: TaskView) => void;
  creates: CreateAction[];
  /** Why Criar is disabled (inactive subscription, only with billing on); null when it is enabled. */
  blockedReason: string | null;
  onCreate: (id: 'task' | 'appointment' | 'recurring') => void;
  onApplyTemplate: () => void;
  onAdHocProcess: () => void;
}

// On the computer each item is a 36px icon named by its tooltip (the owner's choice). A tap opens no
// tooltip, so touch screens (`sm:pointer-coarse`) and narrow ones (`max-sm`, two rows: views, then
// pages) show the name under the icon. The two variants never apply together.
const itemClass = cn(
  'flex size-9 shrink-0 items-center justify-center rounded-[10px] transition-colors duration-150',
  'max-sm:h-12 max-sm:w-auto max-sm:min-w-0 max-sm:flex-1 max-sm:flex-col max-sm:gap-0.5 max-sm:px-1',
  'sm:pointer-coarse:h-12 sm:pointer-coarse:w-auto sm:pointer-coarse:min-w-14 sm:pointer-coarse:flex-col sm:pointer-coarse:gap-0.5 sm:pointer-coarse:px-2',
);
const createClass =
  'size-9 sm:pointer-coarse:h-12 sm:pointer-coarse:w-auto sm:pointer-coarse:min-w-14 sm:pointer-coarse:flex-col sm:pointer-coarse:gap-0.5 sm:pointer-coarse:px-2.5';
/** The visible name: hidden on the computer, where the tooltip and the `aria-label` carry it. */
const captionClass = 'hidden max-w-full truncate text-[11px] leading-tight font-semibold max-sm:block sm:pointer-coarse:block';

function Caption({ children }: { children: ReactNode }) {
  return (
    <span data-hub-caption aria-hidden className={captionClass}>
      {children}
    </span>
  );
}

/**
 * The disabled state of a Criar button (the button gets `disabled` itself), with the reason in a
 * focusable wrapper's tooltip, like `WriteGate`.
 */
function Blocked({ reason, children }: { reason: string | null; children: ReactNode }) {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip content={reason} side="bottom" delay={150}>
      <span tabIndex={0} className="inline-flex cursor-not-allowed rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/25">
        {children}
      </span>
    </Tooltip>
  );
}

/**
 * The hub without data hooks: Ver (links to the views and pages of tasks) and Criar (buttons). Only
 * icons: the name is the tooltip and the `aria-label` (spec §2.9).
 */
export function TasksHubView({ views, active, hrefOf, replaceViews, onViewChosen, creates, blockedReason, onCreate, onApplyTemplate, onAdHocProcess }: TasksHubViewProps) {
  const hasPages = views.some((v) => v.group === 'pages') && views.some((v) => v.group === 'views');
  const firstPage = views.findIndex((v) => v.group === 'pages');
  return (
    <div className="flex items-center gap-3 max-sm:w-full">
      <nav aria-label="Páginas de tarefas" className="inline-flex items-center gap-1 rounded-md bg-bg-subtle p-1 max-sm:w-full">
        {views.map((v, i) => {
          const Icon = HUB_VIEW_ICONS[v.id];
          const current = v.id === active;
          const isView = TASK_VIEWS.has(v.id);
          return (
            <span key={v.id} className="contents">
              {hasPages && i === firstPage ? <span data-hub-divider aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" /> : null}
              <Tooltip content={v.label} side="bottom" delay={150}>
                <Link
                  to={hrefOf(v.id)}
                  replace={replaceViews && isView}
                  aria-label={v.label}
                  aria-current={current ? 'page' : undefined}
                  onClick={isView && onViewChosen ? () => onViewChosen(v.id as TaskView) : undefined}
                  className={cn(itemClass, current ? 'bg-surface text-fg shadow-xs' : 'text-muted hover:text-fg')}
                >
                  <Icon className="size-4" aria-hidden />
                </Link>
              </Tooltip>
            </span>
          );
        })}
      </nav>
      {creates.length ? (
        <div role="group" aria-label="Criar" className="flex items-center gap-1.5 max-sm:hidden">
          {creates.map((a) => {
            const Icon = CREATE_ICONS[a.id];
            if (a.id === 'process') {
              return (
                <DropdownMenu key={a.id}>
                  <Blocked reason={blockedReason}>
                    <Tooltip content={a.label} side="bottom" delay={150}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" aria-label={a.label} className={createClass} disabled={Boolean(blockedReason)}>
                          <Icon aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                    </Tooltip>
                  </Blocked>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuItem icon={<Workflow />} onSelect={onApplyTemplate} className="items-start">
                      <span>
                        <span className="block">Aplicar modelo de processo</span>
                        <span className="block text-xs font-normal text-muted">As etapas de um modelo para um cliente.</span>
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem icon={<ListTree />} onSelect={onAdHocProcess} className="items-start">
                      <span>
                        <span className="block">Processo avulso</span>
                        <span className="block text-xs font-normal text-muted">Monte as etapas agora, sem modelo.</span>
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }
            const id = a.id;
            return (
              <Blocked key={a.id} reason={blockedReason}>
                <Tooltip content={a.label} side="bottom" delay={150}>
                  <Button
                    variant={id === 'task' ? 'primary' : 'outline'}
                    size="icon"
                    aria-label={a.label}
                    className={createClass}
                    disabled={Boolean(blockedReason)}
                    onClick={() => onCreate(id)}
                  >
                    <Icon aria-hidden />
                  </Button>
                </Tooltip>
              </Blocked>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The hub in the headers of Tarefas, Auditoria, Recorrentes (and Grupos por regime) and Processos:
 * always in the same place. On Tarefas, `currentView` marks the view on screen and `onViewChosen`
 * remembers the chosen one.
 */
export function TasksHub({ currentView, onViewChosen }: { currentView?: TaskView; onViewChosen?: (view: TaskView) => void }) {
  const permissions = usePermissions();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { newTask } = useTaskSheetLinks();
  const { openTemplatePicker, openFlowBuilder } = useTaskActions();
  const creates = createActions(permissions.can);
  const onTasks = activeHubView(pathname, params, currentView);
  const isTasksPage = onTasks !== null && TASK_VIEWS.has(onTasks) && currentView !== undefined;
  return (
    <TasksHubView
      views={hubViewItems(permissions.can)}
      active={onTasks}
      hrefOf={(id) => hubViewHref(id, pathname, params)}
      replaceViews={isTasksPage}
      onViewChosen={onViewChosen}
      creates={creates}
      blockedReason={gateFor(permissions, 'tasks').reason}
      onCreate={(id) => {
        if (id === 'task') newTask();
        else if (id === 'appointment') newTask({ appointment: true });
        else navigate(creates.find((a) => a.id === 'recurring')?.href ?? '/tarefas/recorrentes?recorrente=nova');
      }}
      onApplyTemplate={openTemplatePicker}
      onAdHocProcess={openFlowBuilder}
    />
  );
}
