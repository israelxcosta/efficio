import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, Building2, Ellipsis, GripVertical, ListChecks, Plus, Search, Tags, Text, Trash2, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import {
  TASK_PRIORITY_LABELS,
  todayISO,
  type FlowTemplate,
  type TaskFlow,
  type TaskOptionsResponse,
  type TaskPriority,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Textarea } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { ADMIN_ONLY_REASON, usePermissions, WriteGate } from '@/features/auth/permissions';
import { toastError } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { useApplyFlowTemplate, useCreateFlow, useFlowTemplates, useSaveFlowTemplate } from '../api';
import { daysText, firstName } from '../due';
import {
  applyPreview,
  flowInputOf,
  hasFlowErrors,
  moveStep,
  newStep,
  stepsOfTemplate,
  templateInputOf,
  templatePreview,
  validateFlow,
  validateTemplate,
  type FlowErrors,
  type StepDraft,
} from '../flow-logic';
import { FlowStepper } from './flow-stepper';
import { ClientPicker, INTERNAL, MemberPicker, NONE } from './pickers';

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

interface StepsEditorProps {
  steps: StepDraft[];
  onChange: (steps: StepDraft[]) => void;
  options: TaskOptionsResponse;
  errors: FlowErrors['step'];
  readOnly: boolean;
  /** The ad hoc process: deadline in days or a date, another client per step. */
  builder?: boolean;
}

/**
 * Steps of a template or of an ad hoc process (spec §12.2): name, deadline in days (or a date in the
 * builder), responsible, priority and the queue when there is no responsible; reorder by dragging
 * the handle or with Alt+↑/↓ on it.
 */
export function FlowStepsEditor({ steps, onChange, options, errors, readOnly, builder }: StepsEditorProps) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');
  const patch = (i: number, p: Partial<StepDraft>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= steps.length) return;
    onChange(moveStep(steps, from, to));
    setAnnounce(`Etapa movida para a posição ${to + 1} de ${steps.length}`);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-step-handle="${to}"]`)?.focus());
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => {
          const member = options.members.find((m) => m.id === s.assigneeId);
          const e = errors[s.key] ?? {};
          return (
            <li
              key={s.key}
              onDragOver={(ev) => {
                if (dragging === null) return;
                ev.preventDefault();
              }}
              onDrop={(ev) => {
                ev.preventDefault();
                if (dragging !== null) move(dragging, i);
                setDragging(null);
              }}
              className={cn('rounded-lg border border-border p-3', dragging === i && 'border-dashed opacity-60')}
            >
              <fieldset className="flex min-w-0 flex-col gap-2" disabled={readOnly}>
                <legend className="sr-only">Etapa {i + 1}</legend>
                <div className="flex items-start gap-2">
                  {!readOnly ? (
                    <button
                      type="button"
                      draggable
                      data-step-handle={i}
                      onDragStart={(ev) => {
                        ev.dataTransfer.effectAllowed = 'move';
                        setDragging(i);
                      }}
                      onDragEnd={() => setDragging(null)}
                      onKeyDown={(ev: KeyboardEvent) => {
                        if (ev.altKey && ev.key === 'ArrowUp') {
                          ev.preventDefault();
                          move(i, i - 1);
                        } else if (ev.altKey && ev.key === 'ArrowDown') {
                          ev.preventDefault();
                          move(i, i + 1);
                        }
                      }}
                      aria-label={`Mover etapa ${i + 1} (Alt e setas)`}
                      className="mt-2 flex size-6 shrink-0 cursor-grab items-center justify-center rounded-md text-subtle hover:bg-bg-subtle hover:text-muted active:cursor-grabbing"
                    >
                      <GripVertical className="size-4" />
                    </button>
                  ) : null}
                  <span className="mt-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-mini font-semibold text-muted" aria-hidden>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Input
                      value={s.title}
                      maxLength={200}
                      placeholder="Nome da tarefa desta etapa"
                      aria-label={`Nome da etapa ${i + 1}`}
                      aria-invalid={e.title ? true : undefined}
                      data-step-title={s.key}
                      onChange={(ev) => patch(i, { title: ev.target.value })}
                    />
                    {e.title ? (
                      <p role="alert" className="mt-1 text-xs font-medium text-danger">
                        {e.title}
                      </p>
                    ) : null}
                  </div>
                  {!readOnly ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" className="mt-1" aria-label={`Mais opções da etapa ${i + 1}`}>
                          <Ellipsis />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem icon={<Tags />} onSelect={() => patch(i, { showCategory: true })}>
                          Categoria…
                        </DropdownMenuItem>
                        <DropdownMenuItem icon={<Text />} onSelect={() => patch(i, { showDescription: true })}>
                          Descrição…
                        </DropdownMenuItem>
                        {builder ? (
                          <DropdownMenuItem icon={<Building2 />} onSelect={() => patch(i, { showClient: true })}>
                            Outro cliente…
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem icon={<ArrowUp />} disabled={i === 0} onSelect={() => move(i, i - 1)}>
                          Mover para cima
                        </DropdownMenuItem>
                        <DropdownMenuItem icon={<ArrowDown />} disabled={i === steps.length - 1} onSelect={() => move(i, i + 1)}>
                          Mover para baixo
                        </DropdownMenuItem>
                        <DropdownMenuItem icon={<Trash2 />} tone="danger" disabled={steps.length === 1} onSelect={() => onChange(steps.filter((_, j) => j !== i))}>
                          Remover etapa
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
                <div className={cn('grid gap-2 sm:grid-cols-2', readOnly ? 'pl-8' : 'pl-0 sm:pl-16')}>
                  <div className="flex flex-col gap-1">
                    <span className="text-caption font-medium text-muted">Prazo</span>
                    {builder ? (
                      <SegmentedControl<'days' | 'date'>
                        size="sm"
                        ariaLabel={`Prazo da etapa ${i + 1}`}
                        value={s.mode}
                        onChange={(mode) => patch(i, { mode })}
                        options={[
                          { value: 'days', label: 'Em dias' },
                          { value: 'date', label: 'Data' },
                        ]}
                        className="self-start"
                      />
                    ) : null}
                    {s.mode === 'date' ? (
                      <Input type="date" className="h-9" aria-label={`Data da etapa ${i + 1}`} value={s.dueDate} onChange={(ev) => patch(i, { dueDate: ev.target.value })} />
                    ) : (
                      <span className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={365}
                          inputMode="numeric"
                          className="h-9 w-20"
                          aria-label={`Prazo da etapa ${i + 1}, em dias`}
                          value={s.relativeDays}
                          onChange={(ev) => patch(i, { relativeDays: ev.target.value })}
                        />
                        <span className="text-body-sm text-muted">dias</span>
                      </span>
                    )}
                    {e.deadline ? (
                      <p role="alert" className="text-xs font-medium text-danger">
                        {e.deadline}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-caption font-medium text-muted">Prioridade</span>
                    <Select size_="sm" aria-label={`Prioridade da etapa ${i + 1}`} value={s.priority} onChange={(ev) => patch(i, { priority: ev.target.value as TaskPriority })}>
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {TASK_PRIORITY_LABELS[p]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-caption font-medium text-muted">Responsável</span>
                    <MemberPicker
                      size_="sm"
                      value={s.assigneeId || NONE}
                      onChange={(v) => patch(i, { assigneeId: v === NONE ? '' : v })}
                      members={options.members}
                      allowNone
                      noneLabel="Sem responsável"
                      disabled={readOnly}
                      aria-label={`Responsável da etapa ${i + 1}`}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-caption font-medium text-muted">Departamento</span>
                    {member?.department ? (
                      <span className="flex h-9 items-center text-caption text-muted">{member.department.name} (do responsável)</span>
                    ) : (
                      <Select size_="sm" aria-label={`Fila da etapa ${i + 1}`} value={s.departmentId} onChange={(ev) => patch(i, { departmentId: ev.target.value })}>
                        <option value="">{options.departments.length ? 'Fila: nenhuma' : 'Nenhum departamento'}</option>
                        {options.departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            Fila: {d.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>
                  {s.showCategory || s.categoryId ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-caption font-medium text-muted">Categoria</span>
                      <Select size_="sm" aria-label={`Categoria da etapa ${i + 1}`} value={s.categoryId} onChange={(ev) => patch(i, { categoryId: ev.target.value })}>
                        <option value="">Sem categoria</option>
                        {options.categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ) : null}
                  {builder && (s.showClient || s.clientId) ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-caption font-medium text-muted">Cliente desta etapa</span>
                      <ClientPicker
                        size_="sm"
                        value={s.clientId}
                        onChange={(v) => patch(i, { clientId: v })}
                        clients={options.clients}
                        allowAll
                        allLabel="O mesmo do processo"
                        aria-label={`Cliente da etapa ${i + 1}`}
                      />
                    </div>
                  ) : null}
                  {s.showDescription || s.description ? (
                    <div className="flex flex-col gap-1 sm:col-span-2">
                      <span className="text-caption font-medium text-muted">Descrição</span>
                      <Textarea rows={2} maxLength={5000} aria-label={`Descrição da etapa ${i + 1}`} value={s.description} onChange={(ev) => patch(i, { description: ev.target.value })} />
                    </div>
                  ) : null}
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>
      {!readOnly && steps.length < 30 ? (
        <Button
          variant="ghost"
          className="self-start"
          onClick={() => {
            const step = newStep(steps.at(-1));
            onChange([...steps, step]);
            requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-step-title="${step.key}"]`)?.focus());
          }}
        >
          <Plus /> Adicionar etapa
        </Button>
      ) : null}
    </div>
  );
}

interface FlowTemplateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: FlowTemplate | null;
  /** A copy of the template (Duplicar). */
  duplicate?: boolean;
  options: TaskOptionsResponse | undefined;
  loading?: boolean;
}

/** Editor of a process template (spec §12.2); read-only for collaborators. */
export function FlowTemplateSheet({ open, onOpenChange, template, duplicate, options, loading }: FlowTemplateSheetProps) {
  const { canManage } = usePermissions();
  const readOnly = !canManage;
  const save = useSaveFlowTemplate();
  const editing = Boolean(template) && !duplicate;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<StepDraft[]>([newStep()]);
  const [errors, setErrors] = useState<FlowErrors>({ step: {} });
  const today = options?.today ?? todayISO();

  useEffect(() => {
    if (!open) return;
    setTitle(template ? (duplicate ? `${template.title} (cópia)` : template.title) : '');
    setDescription(template?.description ?? '');
    setSteps(template ? stepsOfTemplate(template) : [newStep()]);
    setErrors({ step: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id, duplicate]);

  async function submit() {
    if (!options) return;
    const e = validateTemplate(title, description, steps, options.members);
    setErrors(e);
    if (hasFlowErrors(e)) return;
    try {
      await save.mutateAsync({ id: editing ? template!.id : undefined, input: templateInputOf(title, description, steps, options.members) });
      toast.success('Modelo salvo.');
      onOpenChange(false);
    } catch (error) {
      toastError(error);
    }
  }

  const days = steps.map((s) => Math.max(0, Number(s.relativeDays) || 0));
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title={readOnly && template ? template.title : editing ? 'Editar modelo de processo' : 'Novo modelo de processo'}
      description="O cliente não é definido aqui: é escolhido ao aplicar o modelo e vale para todas as etapas."
      footer={
        readOnly ? (
          <>
            <p className="mr-auto text-caption text-muted">{ADMIN_ONLY_REASON}</p>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </>
        ) : (
          <>
            <p className="mr-auto text-caption text-subtle">Processos já aplicados não mudam.</p>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button loading={save.isPending} onClick={() => void submit()}>
              Salvar modelo
            </Button>
          </>
        )
      }
    >
      {loading || !options ? (
        <SkeletonRows rows={6} />
      ) : (
        <div className="flex flex-col gap-5">
          <Field label="Nome do modelo*" error={errors.title}>
            <Input data-autofocus disabled={readOnly} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Abertura de empresa" />
          </Field>
          <Field label="Descrição">
            <Textarea disabled={readOnly} rows={2} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Para que serve este roteiro" />
          </Field>
          <div className="flex flex-col gap-2">
            <h3 className="text-body-sm font-semibold text-fg">Etapas</h3>
            <p className="text-xs text-muted">
              O prazo de cada etapa conta em dias corridos a partir da conclusão da anterior. Na primeira, conta do dia em que o modelo for aplicado. Use 0 para vencer no mesmo dia.
            </p>
            {errors.steps ? (
              <p role="alert" className="text-xs font-medium text-danger">
                {errors.steps}
              </p>
            ) : null}
            <FlowStepsEditor steps={steps} onChange={setSteps} options={options} errors={errors.step} readOnly={readOnly} />
          </div>
          <p className="rounded-lg bg-surface-muted p-3 text-caption text-muted">{templatePreview(days, today)}</p>
        </div>
      )}
    </Sheet>
  );
}

interface FlowBuilderSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: TaskOptionsResponse | undefined;
  onCreated?: (taskId: string) => void;
}

/** "Criar processo avulso" (spec §12.4): steps by hand, deadlines in days or dates, one client per step if needed. */
export function FlowBuilderSheet({ open, onOpenChange, options, onCreated }: FlowBuilderSheetProps) {
  const { canManage } = usePermissions();
  const create = useCreateFlow();
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [steps, setSteps] = useState<StepDraft[]>([newStep()]);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [errors, setErrors] = useState<FlowErrors>({ step: {} });

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setClientId('');
    setSteps([{ ...newStep(), relativeDays: '0' }]);
    setSaveAsTemplate(false);
    setErrors({ step: {} });
  }, [open]);

  async function submit() {
    if (!options) return;
    const client = clientId && clientId !== INTERNAL ? clientId : null;
    const e = validateFlow(title, client, steps, options.members, saveAsTemplate);
    setErrors(e);
    if (hasFlowErrors(e)) return;
    try {
      const res = await create.mutateAsync(flowInputOf(title, client, steps, options.members, saveAsTemplate));
      onOpenChange(false);
      const who = res.task.assignee ? firstName(res.task.assignee.name) : null;
      toast(who ? `Processo criado. A primeira tarefa já está com ${who}.` : 'Processo criado. A primeira tarefa já foi criada.', {
        action: onCreated ? { label: 'Ver tarefa', onClick: () => onCreated(res.task.id) } : undefined,
      });
    } catch (error) {
      toastError(error);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title="Novo processo"
      description="Cada etapa só aparece para o responsável quando a anterior for concluída."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <WriteGate scope="tasks">
            <Button loading={create.isPending} onClick={() => void submit()}>
              Criar processo
            </Button>
          </WriteGate>
        </>
      }
    >
      {!options ? (
        <SkeletonRows rows={6} />
      ) : (
        <div className="flex flex-col gap-5">
          <Field label="Nome do processo*" error={errors.title}>
            <Input data-autofocus maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Alteração contratual da Padaria Pão Dourado" />
          </Field>
          <Field label="Cliente" hint="Vale para todas as etapas.">
            <ClientPicker value={clientId || INTERNAL} onChange={setClientId} clients={options.clients} allowInternal />
          </Field>
          <div className="flex flex-col gap-2">
            <h3 className="text-body-sm font-semibold text-fg">Etapas</h3>
            {errors.steps ? (
              <p role="alert" className="text-xs font-medium text-danger">
                {errors.steps}
              </p>
            ) : null}
            <FlowStepsEditor steps={steps} onChange={setSteps} options={options} errors={errors.step} readOnly={false} builder />
          </div>
          {canManage ? (
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2.5 text-sm text-fg">
                <Checkbox checked={saveAsTemplate} onCheckedChange={setSaveAsTemplate} aria-label="Salvar também como modelo" />
                Salvar também como modelo
              </label>
              {errors.saveAsTemplate ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {errors.saveAsTemplate}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}

interface ApplyTemplateDialogProps {
  template: FlowTemplate | null;
  options: TaskOptionsResponse | undefined;
  onOpenChange: (open: boolean) => void;
  onOpenTask: (taskId: string) => void;
}

/** "Aplicar “Abertura de empresa”" (spec §12.3): only the client is chosen; step 1 is created now. */
export function ApplyTemplateDialog({ template, options, onOpenChange, onOpenTask }: ApplyTemplateDialogProps) {
  const apply = useApplyFlowTemplate();
  const [clientId, setClientId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const today = options?.today ?? todayISO();
  useEffect(() => {
    setClientId('');
    setName('');
    setError(null);
  }, [template?.id]);
  if (!template) return null;
  const client = options?.clients.find((c) => c.id === clientId);

  async function submit() {
    if (!template) return;
    if (!clientId) {
      setError('Selecione o cliente para aplicar o modelo.');
      return;
    }
    try {
      const res = await apply.mutateAsync({ id: template.id, input: { clientId, title: name.trim() || null } });
      onOpenChange(false);
      toast('Modelo aplicado. A primeira tarefa já foi criada.', { action: { label: 'Ver tarefa', onClick: () => onOpenTask(res.task.id) } });
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <Modal
      open
      onOpenChange={onOpenChange}
      className="max-w-lg"
      title={`Aplicar “${template.title}”`}
      description="A primeira tarefa é criada agora; as outras, quando a anterior for concluída."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <WriteGate scope="tasks">
            <Button loading={apply.isPending} onClick={() => void submit()}>
              Aplicar ao cliente
            </Button>
          </WriteGate>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Cliente*" error={error ?? undefined}>
          <ClientPicker
            value={clientId}
            onChange={(v) => {
              setClientId(v);
              setError(null);
            }}
            clients={options?.clients ?? []}
            placeholder="Selecione o cliente…"
          />
        </Field>
        <Field label="Nome do processo" hint="Opcional.">
          <Input maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder={`${template.title} · ${client?.name ?? '{cliente}'}`} />
        </Field>
        <div>
          <p className="text-body-sm font-semibold text-fg">Tarefas que serão criadas</p>
          <ol className="mt-1.5 flex flex-col gap-1 text-body-sm text-muted">
            {applyPreview(template, today).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </div>
      </div>
    </Modal>
  );
}

interface TemplatePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (template: FlowTemplate) => void;
  onNewTemplate: () => void;
  onAdHoc: () => void;
}

/** "Escolha o modelo" (spec §12.3), before applying from Tarefas, the floating bar or the phone's "+". */
export function TemplatePickerDialog({ open, onOpenChange, onPick, onNewTemplate, onAdHoc }: TemplatePickerDialogProps) {
  const templates = useFlowTemplates({ enabled: open });
  const isAdmin = usePermissions().can('registry');
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (open) setSearch('');
  }, [open]);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (templates.data ?? []).filter((t) => !q || t.title.toLowerCase().includes(q));
  }, [templates.data, search]);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Escolha o modelo" description="Aplique um roteiro em etapas a um cliente.">
      <div className="flex flex-col gap-3 pb-5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input data-autofocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar modelo" aria-label="Buscar modelo" className="h-9 pl-9 text-[13px]" />
        </div>
        {templates.isPending ? (
          <SkeletonRows rows={3} />
        ) : (templates.data ?? []).length === 0 ? (
          <EmptyState
            compact
            icon={<Workflow />}
            title="Nenhum modelo de processo."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {isAdmin ? (
                  <Button variant="outline" size="sm" onClick={onNewTemplate}>
                    Novo modelo
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" onClick={onAdHoc}>
                  Criar processo avulso
                </Button>
              </div>
            }
          />
        ) : (
          <ul className="-mx-2 flex flex-col">
            {list.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => onPick(t)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-surface-muted">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-bg-subtle text-muted" aria-hidden>
                    <Workflow className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-fg">{t.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {t.stepCount} {t.stepCount === 1 ? 'etapa' : 'etapas'} · até {daysText(t.totalDays)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {list.length === 0 ? <li className="px-2 py-3 text-center text-caption text-muted">Nenhum modelo com esse nome.</li> : null}
            <li className="mt-1 border-t border-border pt-2">
              <button type="button" onClick={onAdHoc} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-body-sm font-medium text-brand-text hover:bg-surface-muted">
                <ListChecks className="size-4" aria-hidden /> Criar processo avulso
              </button>
            </li>
          </ul>
        )}
      </div>
    </Modal>
  );
}

/** "Ver etapas" (spec §12.1): the whole process, read only. */
export function FlowStepsSheet({ flow, onOpenChange, onOpenTask }: { flow: TaskFlow | null; onOpenChange: (open: boolean) => void; onOpenTask: (taskId: string) => void }) {
  const today = todayISO();
  return (
    <Sheet open={flow !== null} onOpenChange={onOpenChange} title={flow?.title ?? 'Processo'} description={flow?.client?.name ?? 'Interno'}>
      {flow ? <FlowStepper flow={flow} today={today} onOpenTask={onOpenTask} bare /> : null}
    </Sheet>
  );
}
