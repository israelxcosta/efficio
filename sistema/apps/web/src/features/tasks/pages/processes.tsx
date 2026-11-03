import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Copy, Ellipsis, Eye, ListOrdered, Pencil, Plus, Trash2, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { dateInTimeZone, diffInDays, formatDateBR, todayISO, type FlowTemplate, type TaskFlow } from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { ErrorState, PageHeader } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SkeletonRows } from '@/components/ui/skeleton';
import { usePermissions, WriteGate } from '@/features/auth/permissions';
import { isUuid } from '@/lib/safe-url';
import { toastError } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { useDeleteFlow, useDeleteFlowTemplate, useFlowTemplates, useTaskFlows, useTaskOptions } from '../api';
import { daysText, DUE_TONE_CLASS, shortName, taskDueInfo } from '../due';
import { templateDepartments } from '../flow-logic';
import { flowActions, templateActions } from '../actions';
import { FlowDots } from '../components/flow-stepper';
import { NeutralIcon } from '../components/neutral-icon';
import { FlowStepsSheet, FlowTemplateSheet } from '../components/flow-sheets';
import { useTaskActions } from '../task-actions';
import { useTaskSheetLinks } from '../task-links';

type FlowStatus = 'active' | 'done';

/** URL of the page: `modelo=<id>|novo` (editor), `aplicar=<id>` (dialog), `processos=andamento|concluidos`. */
export function parseProcessParams(params: URLSearchParams): { template: string; apply: string; status: FlowStatus } {
  const modelo = params.get('modelo') ?? '';
  const aplicar = params.get('aplicar') ?? '';
  return {
    template: modelo === 'novo' || isUuid(modelo) ? modelo : '',
    apply: isUuid(aplicar) ? aplicar : '',
    status: params.get('processos') === 'concluidos' ? 'done' : 'active',
  };
}

/** Processos e modelos (spec §12): templates applied to a client, and the processes that are moving. */
export default function ProcessesPage() {
  const [params, setParams] = useSearchParams();
  const options = useTaskOptions();
  const today = options.data?.today ?? todayISO();
  const { template, apply, status } = parseProcessParams(params);
  const templates = useFlowTemplates();
  const flows = useTaskFlows({ status });
  const activeFlows = useTaskFlows({ status: 'active' });
  const { isAdmin, canManage } = usePermissions();
  const actions = useTaskActions();
  const { openTask } = useTaskSheetLinks();
  const [duplicating, setDuplicating] = useState<FlowTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<FlowTemplate | null>(null);
  const [deletingFlow, setDeletingFlow] = useState<TaskFlow | null>(null);
  const [viewing, setViewing] = useState<TaskFlow | null>(null);
  const removeTemplate = useDeleteFlowTemplate();
  const removeFlow = useDeleteFlow();

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  // `?aplicar=<id>` opens the apply dialog once the template list arrives.
  useEffect(() => {
    if (!apply || !templates.data) return;
    const t = templates.data.find((x) => x.id === apply);
    if (t) actions.applyTemplate(t);
    set('aplicar', null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apply, templates.data]);

  const editing = template && template !== 'novo' ? (templates.data?.find((t) => t.id === template) ?? null) : null;
  const nTemplates = templates.data?.length ?? 0;
  const nActive = activeFlows.data?.length ?? 0;
  const description = `Roteiros em etapas: cada etapa vira tarefa quando a anterior é concluída.${templates.data ? ` ${nTemplates} ${nTemplates === 1 ? 'modelo' : 'modelos'} · ${nActive} ${nActive === 1 ? 'processo em andamento' : 'processos em andamento'}.` : ''}${isAdmin ? '' : ' Somente administradores alteram os modelos.'}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Processos"
        description={description}
        actions={
          <>
            <WriteGate scope="tasks">
              <Button variant="outline" onClick={actions.openFlowBuilder}>
                <ListOrdered /> Criar processo avulso
              </Button>
            </WriteGate>
            <WriteGate scope="admin">
              <Button onClick={() => set('modelo', 'novo')}>
                <Plus /> Novo modelo
              </Button>
            </WriteGate>
          </>
        }
      />

      <Card className="@container overflow-hidden">
        <CardHeader title="Modelos de processo" className="px-5 pt-5" />
        <div className="p-1.5 pt-3">
          {templates.isPending ? (
            <SkeletonRows rows={3} className="p-3" />
          ) : templates.isError && !templates.data ? (
            <ErrorState error={templates.error} onRetry={() => templates.refetch()} className="m-3" />
          ) : nTemplates === 0 ? (
            <EmptyState
              className="m-3"
              icon={<Workflow />}
              title="Nenhum modelo de processo"
              description={
                isAdmin
                  ? 'Cadastre roteiros como Abertura de empresa ou Alteração contratual e aplique a qualquer cliente com um clique.'
                  : 'Os administradores cadastram os modelos. Enquanto isso, use Criar processo avulso.'
              }
              action={
                <WriteGate scope="admin">
                  <Button variant="outline" onClick={() => set('modelo', 'novo')}>
                    Novo modelo
                  </Button>
                </WriteGate>
              }
            />
          ) : (
            <ul>
              {templates.data!.map((t) => (
                <li key={t.id}>
                  <TemplateRow
                    template={t}
                    canEdit={canManage}
                    canDelete={isAdmin}
                    onOpen={() => set('modelo', t.id)}
                    onApply={() => actions.applyTemplate(t)}
                    onDuplicate={() => setDuplicating(t)}
                    onDelete={() => setDeletingTemplate(t)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="@container overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <h2 className="text-[15px] font-semibold tracking-tight text-fg">Processos</h2>
            <SegmentedControl<FlowStatus>
              size="sm"
              ariaLabel="Processos"
              value={status}
              onChange={(s) => set('processos', s === 'done' ? 'concluidos' : null)}
              options={[
                { value: 'active', label: `Em andamento${activeFlows.data ? ` (${nActive})` : ''}` },
                { value: 'done', label: 'Concluídos' },
              ]}
            />
        </div>
        <div className="p-1.5 pt-3">
          {flows.isPending ? (
            <SkeletonRows rows={3} className="p-3" />
          ) : flows.isError && !flows.data ? (
            <ErrorState error={flows.error} onRetry={() => flows.refetch()} className="m-3" />
          ) : flows.data!.length === 0 ? (
            <p className="px-4 py-4 text-body-sm text-muted">{status === 'active' ? 'Nenhum processo em andamento.' : 'Nenhum processo concluído.'}</p>
          ) : (
            <ul className={cn(flows.isPlaceholderData && 'opacity-60')}>
              {flows.data!.map((f) => (
                <li key={f.id}>
                  <FlowRow flow={f} today={today} canDelete={isAdmin} onOpenTask={openTask} onSteps={() => setViewing(f)} onDelete={() => setDeletingFlow(f)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <FlowTemplateSheet
        open={Boolean(template) || duplicating !== null}
        onOpenChange={(o) => {
          if (o) return;
          setDuplicating(null);
          set('modelo', null);
        }}
        template={duplicating ?? editing}
        duplicate={duplicating !== null}
        options={options.data}
        loading={template !== '' && template !== 'novo' && !editing && templates.isPending}
      />
      <FlowStepsSheet flow={viewing} onOpenChange={(o) => !o && setViewing(null)} onOpenTask={(id) => { setViewing(null); openTask(id); }} />
      <ConfirmDialog
        open={deletingTemplate !== null}
        onOpenChange={(o) => !o && setDeletingTemplate(null)}
        title={`Excluir o modelo “${deletingTemplate?.title ?? ''}”?`}
        description="Os processos já aplicados continuam; só o roteiro deixa de existir."
        confirmLabel="Excluir modelo"
        loading={removeTemplate.isPending}
        onConfirm={async () => {
          if (!deletingTemplate) return;
          try {
            await removeTemplate.mutateAsync(deletingTemplate.id);
            setDeletingTemplate(null);
            toast.success('Modelo excluído.');
          } catch (e) {
            toastError(e);
          }
        }}
      />
      <ConfirmDialog
        open={deletingFlow !== null}
        onOpenChange={(o) => !o && setDeletingFlow(null)}
        title={`Excluir o processo “${deletingFlow ? flowTitle(deletingFlow) : ''}”?`}
        description="As tarefas já criadas continuam; as etapas que ainda não começaram deixam de existir."
        confirmLabel="Excluir processo"
        loading={removeFlow.isPending}
        onConfirm={async () => {
          if (!deletingFlow) return;
          try {
            await removeFlow.mutateAsync(deletingFlow.id);
            setDeletingFlow(null);
            toast.success('Processo excluído.');
          } catch (e) {
            toastError(e);
          }
        }}
      />
    </div>
  );
}

/** "Abertura de empresa · Construtora Vale Verde" (the client only when the title does not say it). */
export function flowTitle(f: Pick<TaskFlow, 'title' | 'client'>): string {
  if (!f.client || f.title.includes(f.client.name)) return f.title;
  return `${f.title} · ${f.client.name}`;
}

function TemplateRow({
  template: t,
  canEdit,
  canDelete,
  onOpen,
  onApply,
  onDuplicate,
  onDelete,
}: {
  template: FlowTemplate;
  canEdit: boolean;
  canDelete: boolean;
  onOpen: () => void;
  onApply: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const steps = `${t.stepCount} ${t.stepCount === 1 ? 'etapa' : 'etapas'}`;
  const actions = templateActions({ canEdit, canDelete });
  const usage = t.usageCount === 0 ? 'Nunca aplicado' : `Aplicado ${t.usageCount} ${t.usageCount === 1 ? 'vez' : 'vezes'}`;
  return (
    <div className="group flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-surface-muted @lg:px-4">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left">
        <span className="hidden @sm:contents">
          <NeutralIcon icon={Workflow} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-fg">{t.title}</span>
            <Badge tone="neutral" className="hidden @md:inline-flex">
              {steps}
            </Badge>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted @2xl:hidden">
            {steps} · até {daysText(t.totalDays)} · {usage.toLowerCase()}
          </span>
          {t.description ? <span className="mt-0.5 hidden truncate text-xs text-muted @2xl:block">{t.description}</span> : null}
        </span>
      </button>
      <div className="hidden w-36 min-w-0 @4xl:block">
        <span className={cn('block truncate text-body-sm', t.departments.length ? 'text-fg' : 'text-subtle')}>{templateDepartments(t)}</span>
      </div>
      <div className="hidden w-36 @2xl:block">
        <span className="block text-body-sm text-fg">até {daysText(t.totalDays)}</span>
        <span className="block text-caption text-muted">somando os prazos</span>
      </div>
      <div className="hidden w-36 @3xl:block">
        <span className="text-body-sm text-muted">{usage}</span>
      </div>
      <WriteGate scope="tasks">
        <Button variant="outline" size="sm" onClick={onApply}>
          Aplicar
        </Button>
      </WriteGate>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted opacity-70 transition hover:bg-bg-subtle hover:text-fg group-hover:opacity-100 pointer-coarse:opacity-100"
            aria-label={`Ações de ${t.title}`}
          >
            <Ellipsis className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {actions.includes('edit') ? (
            <DropdownMenuItem icon={<Pencil />} onSelect={onOpen}>
              Editar
            </DropdownMenuItem>
          ) : null}
          {actions.includes('duplicate') ? (
            <DropdownMenuItem icon={<Copy />} onSelect={onDuplicate}>
              Duplicar
            </DropdownMenuItem>
          ) : null}
          {actions.includes('view') ? (
            <DropdownMenuItem icon={<Eye />} onSelect={onOpen}>
              Ver etapas
            </DropdownMenuItem>
          ) : null}
          {actions.includes('delete') ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Trash2 />} tone="danger" onSelect={onDelete}>
                Excluir
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function FlowRow({
  flow: f,
  today,
  canDelete,
  onOpenTask,
  onSteps,
  onDelete,
}: {
  flow: TaskFlow;
  today: string;
  canDelete: boolean;
  onOpenTask: (id: string) => void;
  onSteps: () => void;
  onDelete: () => void;
}) {
  const step = f.currentStep;
  const done = Boolean(f.completedAt) || !step;
  const due = step?.task ? taskDueInfo({ status: step.task.status, dueDate: step.task.dueDate, completedAt: null, startTime: null, endTime: null }, today, true) : null;
  const subtitle = done
    ? `Concluído em ${f.completedAt ? formatDateBR(dateInTimeZone(new Date(f.completedAt))) : '—'}`
    : `Etapa ${step!.position} de ${f.stepCount} · ${step!.title}`;
  const span = f.completedAt ? diffInDays(dateInTimeZone(new Date(f.completedAt)), dateInTimeZone(new Date(f.createdAt))) : 0;
  const open = () => (step?.task ? onOpenTask(step.task.id) : onSteps());
  const actions = flowActions(f, { canDelete });
  return (
    <div className="group flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-surface-muted @lg:px-4">
      <button type="button" onClick={open} className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-md text-left @sm:flex-row @sm:items-center @sm:gap-3">
        <span className="flex w-24 shrink-0 @sm:justify-start" aria-label={`${f.doneCount} de ${f.stepCount} etapas concluídas`}>
          <FlowDots flow={f} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-fg">{flowTitle(f)}</span>
          <span className="mt-0.5 block truncate text-xs text-muted">{subtitle}</span>
          <span className={cn('mt-0.5 block truncate text-xs @xl:hidden', due ? DUE_TONE_CLASS[due.tone] : 'text-muted')}>
            {done ? `${f.stepCount} etapas em ${daysText(span)}` : due?.text}
          </span>
        </span>
      </button>
      <div className="hidden w-36 min-w-0 items-center gap-2 @2xl:flex">
        {!done ? (
          <>
            <MemberAvatar name={step?.assignee?.name} unassigned={!step?.assignee} />
            <span className={cn('truncate text-[13px]', step?.assignee ? 'text-fg' : 'text-subtle')}>{step?.assignee ? shortName(step.assignee.name) : 'Sem responsável'}</span>
          </>
        ) : null}
      </div>
      <div className="hidden w-36 text-right @xl:block">
        {done ? (
          <span className="text-xs text-muted">
            {f.stepCount} etapas em {daysText(span)}
          </span>
        ) : (
          <>
            <p className="tabular text-[13px] font-medium text-fg">{step?.task?.dueDate ? formatDateBR(step.task.dueDate) : '—'}</p>
            {due ? <span className={cn('text-xs', DUE_TONE_CLASS[due.tone])}>{due.text}</span> : null}
          </>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted opacity-70 transition hover:bg-bg-subtle hover:text-fg group-hover:opacity-100 pointer-coarse:opacity-100"
            aria-label={`Ações de ${flowTitle(f)}`}
          >
            <Ellipsis className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {actions.includes('open-step') && step?.task ? (
            <DropdownMenuItem icon={<Eye />} onSelect={() => onOpenTask(step.task!.id)}>
              Abrir etapa atual
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem icon={<ListOrdered />} onSelect={onSteps}>
            Ver etapas
          </DropdownMenuItem>
          {actions.includes('delete') ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Trash2 />} tone="danger" onSelect={onDelete}>
                Excluir processo
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
