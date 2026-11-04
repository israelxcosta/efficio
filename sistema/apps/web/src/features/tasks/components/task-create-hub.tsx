import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { CalendarClock, ChevronDown, Layers, ListTree, Plus, Repeat, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { usePermissions, WriteGate } from '@/features/auth/permissions';
import { cn } from '@/lib/utils';
import { useTaskActions } from '../task-actions';
import { createActions, type CreateActionId } from '../task-hub';
import { useTaskSheetLinks } from '../task-links';

const ICONS: Record<CreateActionId, ReactNode> = {
  task: <Plus />,
  appointment: <CalendarClock />,
  recurring: <Repeat />,
  process: <Workflow />,
  regimeGroup: <Layers />,
};

/**
 * Top of Tarefas: every kind of task created from one place — Tarefa (primary), Compromisso, Tarefa
 * recorrente, Processo (from a template or ad hoc) and Grupo por regime. What the person may not
 * create is not shown (`createActions`); an inactive subscription disables the rest with the reason.
 */
export function TaskCreateHub() {
  const { can } = usePermissions();
  const { newTask } = useTaskSheetLinks();
  const { openTemplatePicker, openFlowBuilder } = useTaskActions();
  const navigate = useNavigate();
  const actions = createActions(can);
  const btn = 'max-sm:w-full max-sm:justify-start';

  return (
    <section aria-label="Criar" className="rounded-xl border border-border bg-surface p-3 sm:px-4">
      <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
        <span className="col-span-2 text-body-sm font-medium text-muted sm:mr-1">Criar</span>
        {actions.map((a, i) => {
          const last = i === actions.length - 1 && actions.length % 2 === 1;
          const wide = cn(last && 'max-sm:col-span-2');
          if (a.id === 'process') {
            return (
              <DropdownMenu key={a.id}>
                <WriteGate scope="tasks">
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className={cn(btn, wide)}>
                      {ICONS.process} {a.label} <ChevronDown className="ml-auto text-muted sm:ml-0" />
                    </Button>
                  </DropdownMenuTrigger>
                </WriteGate>
                <DropdownMenuContent align="start" className="w-72">
                  <DropdownMenuItem icon={<Workflow />} onSelect={openTemplatePicker} className="items-start">
                    <span>
                      <span className="block">Aplicar modelo de processo</span>
                      <span className="block text-xs font-normal text-muted">As etapas de um modelo para um cliente.</span>
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem icon={<ListTree />} onSelect={openFlowBuilder} className="items-start">
                    <span>
                      <span className="block">Processo avulso</span>
                      <span className="block text-xs font-normal text-muted">Monte as etapas agora, sem modelo.</span>
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            );
          }
          const onClick =
            a.id === 'task' ? () => newTask() : a.id === 'appointment' ? () => newTask({ appointment: true }) : () => navigate(a.href!);
          // Registries (recurring, regime groups) are gated by `registry` already in `createActions`.
          return (
            <WriteGate key={a.id} scope={a.id === 'recurring' || a.id === 'regimeGroup' ? 'admin' : 'tasks'}>
              <Button variant={a.id === 'task' ? 'primary' : 'outline'} className={cn(btn, wide)} onClick={onClick} aria-description={a.description}>
                {ICONS[a.id]} {a.label}
              </Button>
            </WriteGate>
          );
        })}
      </div>
    </section>
  );
}
