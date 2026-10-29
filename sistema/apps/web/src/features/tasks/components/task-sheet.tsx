import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { CircleCheck, Copy, Ellipsis, Link2, ListChecks, Pencil, Plus, RotateCcw, Send, Trash2, X, CircleX } from 'lucide-react';
import { toast } from 'sonner';
import {
  daysOverdue,
  isOpenTaskStatus,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  taskInputSchema,
  todayISO,
  type ISODate,
  type TaskComment,
  type TaskDetail,
  type TaskInput,
  type TaskOptionsResponse,
  type TaskPriority,
  type TaskStatus,
  type TaskUpdateInput,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Textarea } from '@/components/ui/input';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { ErrorState } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { SUBSCRIPTION_REASON, usePermissions, WriteGate } from '@/features/auth/permissions';
import { ApiRequestError, errorMessage } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { toastError } from '@/lib/notify';
import { qk } from '@/lib/query-keys';
import { isUuid } from '@/lib/safe-url';
import { cn } from '@/lib/utils';
import {
  useAddComment,
  useAddSubtask,
  useCreateTask,
  useDeleteSubtask,
  useDeleteTask,
  useTask,
  useTaskOptions,
  useUpdateSubtask,
  useUpdateTask,
} from '../api';
import { daysText } from '../due';
import { commentTime, dateTimeBR } from '../format';
import { SHEET_PARAMS, statusFromParam, withSheetParams } from '../task-links';
import { useTaskStatusChange } from '../use-task-status';
import { INTERNAL, NONE, ClientPicker, MemberPicker } from './pickers';

type Stamp = 'idle' | 'saving' | 'saved' | 'error';

/** "Salvando…", "Salvo", "Não foi salvo" (announced politely). */
function SavedStamp({ state }: { state: Stamp }) {
  return (
    <span aria-live="polite" className={cn('mr-auto text-caption', state === 'error' ? 'font-medium text-danger' : 'text-subtle')}>
      {state === 'saving' ? 'Salvando…' : state === 'saved' ? 'Salvo' : state === 'error' ? 'Não foi salvo' : ''}
    </span>
  );
}

/**
 * Task sheet of the Gestão (spec §9), driven by the URL: `?tarefa=<id>` shows and edits a task (each
 * field saves on its own), `?nova=1` creates one and then stays open in edit mode. Mounted once by
 * the Gestão layout, so it opens over Início, Tarefas, Clientes and Cadastros.
 */
export function TaskSheetHost() {
  const [params, setParams] = useSearchParams();
  const rawId = params.get('tarefa');
  const isNew = params.get('nova') === '1' && rawId === null;
  const open = rawId !== null || isNew;

  function close() {
    const next = new URLSearchParams(params);
    for (const k of SHEET_PARAMS) next.delete(k);
    setParams(next, { replace: true });
  }

  return (
    <TaskSheet
      open={open}
      taskId={rawId}
      isNew={isNew}
      params={params}
      onClose={close}
      onCreated={(id) => setParams(withSheetParams(params, { tarefa: id }), { replace: true })}
    />
  );
}

interface TaskSheetProps {
  open: boolean;
  taskId: string | null;
  isNew: boolean;
  params: URLSearchParams;
  onClose: () => void;
  onCreated: (id: string) => void;
}

function TaskSheet({ open, taskId, isNew, params, onClose, onCreated }: TaskSheetProps) {
  const options = useTaskOptions();
  const detail = useTask(isNew ? null : taskId);
  const { canWriteTasks } = usePermissions();
  const readOnly = !canWriteTasks;
  const [stamp, setStamp] = useState<Stamp>('idle');
  useEffect(() => setStamp('idle'), [taskId, isNew]);

  if (isNew) {
    return (
      <NewTaskSheet
        open={open}
        params={params}
        options={options.data}
        onClose={onClose}
        onCreated={onCreated}
      />
    );
  }

  const task = detail.data;
  const notFound =
    !isUuid(taskId) || (detail.error instanceof ApiRequestError && (detail.error.status === 404 || detail.error.status === 400));

  let title: ReactNode = task?.title ?? 'Tarefa';
  let body: ReactNode;
  let footer: ReactNode = null;
  if (notFound) {
    title = 'Tarefa';
    body = (
      <EmptyState
        icon={<ListChecks />}
        title="Tarefa não encontrada"
        description="Ela pode ter sido excluída."
        action={
          <Button variant="outline" onClick={onClose}>
            Voltar às tarefas
          </Button>
        }
      />
    );
  } else if (detail.isError && !task) {
    body = <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;
  } else if (!task || !options.data) {
    body = <DetailSkeleton />;
  } else {
    title = <TaskTitle task={task} readOnly={readOnly} onStamp={setStamp} />;
    body = <TaskDetailBody task={task} options={options.data} readOnly={readOnly} onStamp={setStamp} />;
    footer = <DetailFooter task={task} stamp={stamp} readOnly={readOnly} onClose={onClose} />;
  }

  const description = task ? `${task.client?.name ?? 'Interna'}${task.department ? ` · ${task.department.name}` : ''}` : undefined;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={title} description={description} footer={footer} width="lg">
      {body}
    </Sheet>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando">
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit mode
// ---------------------------------------------------------------------------

/** The task with a field patch applied, for the optimistic cache update (refs from the options). */
export function applyTaskPatch(task: TaskDetail, patch: TaskUpdateInput, options: TaskOptionsResponse): TaskDetail {
  const next: TaskDetail = { ...task };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.description !== undefined) next.description = patch.description ?? null;
  if (patch.priority !== undefined) next.priority = patch.priority;
  if (patch.dueDate !== undefined) next.dueDate = patch.dueDate;
  if (patch.startDate !== undefined) next.startDate = patch.startDate;
  if (patch.startTime !== undefined) next.startTime = patch.startTime;
  if (patch.endTime !== undefined) next.endTime = patch.endTime;
  if (patch.clientId !== undefined) {
    const c = options.clients.find((x) => x.id === patch.clientId);
    next.client = c ? { id: c.id, name: c.name } : null;
  }
  if (patch.categoryId !== undefined) {
    const c = options.categories.find((x) => x.id === patch.categoryId);
    next.category = c ? { id: c.id, name: c.name, icon: c.icon, color: c.color } : null;
  }
  if (patch.departmentId !== undefined) {
    const d = options.departments.find((x) => x.id === patch.departmentId);
    next.department = d ?? null;
  }
  if (patch.assigneeId !== undefined) {
    const m = options.members.find((x) => x.id === patch.assigneeId);
    next.assignee = m ? { id: m.id, name: m.name } : null;
    // The API places an assigned task in the assignee's department.
    if (m?.department) next.department = m.department;
  }
  const today = options.today;
  next.overdue = isOpenTaskStatus(next.status) && next.dueDate !== null && next.dueDate < today;
  next.daysOverdue = next.overdue ? daysOverdue(next.dueDate, today) : 0;
  return next;
}

function useAutosave(task: TaskDetail, options: TaskOptionsResponse, onStamp: (s: Stamp) => void) {
  const qc = useQueryClient();
  const update = useUpdateTask();
  return async (patch: TaskUpdateInput) => {
    const before = qc.getQueryData<TaskDetail>(qk.task(task.id)) ?? task;
    qc.setQueryData(qk.task(task.id), applyTaskPatch(before, patch, options));
    onStamp('saving');
    try {
      await update.mutateAsync({ id: task.id, patch });
      onStamp('saved');
      return true;
    } catch (error) {
      qc.setQueryData(qk.task(task.id), before);
      onStamp('error');
      toastError(error);
      return false;
    }
  };
}

function TaskTitle({ task, readOnly, onStamp }: { task: TaskDetail; readOnly: boolean; onStamp: (s: Stamp) => void }) {
  const options = useTaskOptions();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(task.title);
  const save = useAutosave(task, options.data!, onStamp);
  useEffect(() => setValue(task.title), [task.title]);

  if (readOnly) return <span>{task.title}</span>;
  if (editing) {
    return (
      <Input
        autoFocus
        value={value}
        maxLength={200}
        aria-label="Nome da tarefa"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setValue(task.title);
            setEditing(false);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const title = value.trim();
            setEditing(false);
            if (title && title !== task.title) void save({ title });
            else setValue(task.title);
          }
        }}
        className="h-10 text-lg font-semibold"
      />
    );
  }
  return (
    <button type="button" onClick={() => setEditing(true)} className="group/title -mx-1 flex max-w-full items-center gap-2 rounded-md px-1 text-left hover:bg-bg-subtle" aria-label={`${task.title}. Renomear`}>
      <span className="min-w-0 break-words">{task.title}</span>
      <Pencil className="size-4 shrink-0 text-muted opacity-0 transition-opacity group-hover/title:opacity-100 group-focus-visible/title:opacity-100" aria-hidden />
    </button>
  );
}

function TaskDetailBody({ task, options, readOnly, onStamp }: { task: TaskDetail; options: TaskOptionsResponse; readOnly: boolean; onStamp: (s: Stamp) => void }) {
  const save = useAutosave(task, options, onStamp);
  const status = useTaskStatusChange();
  const [description, setDescription] = useState(task.description ?? '');
  useEffect(() => setDescription(task.description ?? ''), [task.description]);

  return (
    <div className="flex flex-col gap-6">
      <TaskProperties
        values={{
          status: task.status,
          priority: task.priority,
          departmentId: task.department?.id ?? '',
          assigneeId: task.assignee?.id ?? '',
          clientId: task.client?.id ?? '',
          dueDate: task.dueDate ?? '',
          categoryId: task.category?.id ?? '',
          startDate: task.startDate ?? '',
          startTime: task.startTime ?? '',
          endTime: task.endTime ?? '',
        }}
        options={options}
        readOnly={readOnly}
        onStatus={(s) => void status.change(task, s, 'menu')}
        onChange={(patch) => void save(patch)}
      />
      <Field label="Descrição">
        <Textarea
          value={description}
          disabled={readOnly}
          rows={3}
          maxLength={5000}
          placeholder="Descreva o que precisa ser feito…"
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            const next = description.trim();
            if (next !== (task.description ?? '')) void save({ description: next || null });
          }}
          className="field-sizing-content min-h-20"
        />
      </Field>
      <SubtaskList task={task} readOnly={readOnly} />
      <CommentThread task={task} me={options.me} readOnly={readOnly} />
      <History task={task} />
    </div>
  );
}

interface PropertyValues {
  status: TaskStatus;
  priority: TaskPriority;
  departmentId: string;
  assigneeId: string;
  clientId: string;
  dueDate: string;
  categoryId: string;
  startDate: string;
  startTime: string;
  endTime: string;
}

interface TaskPropertiesProps {
  values: PropertyValues;
  options: TaskOptionsResponse;
  readOnly: boolean;
  onStatus: (s: TaskStatus) => void;
  onChange: (patch: TaskUpdateInput) => void;
  errors?: Partial<Record<keyof PropertyValues, string>>;
}

/**
 * Two-column grid of the task fields (§9.1). The department follows the assignee (the API places an
 * assigned task in the assignee's department), so it is only chosen for a task without assignee or
 * whose assignee has no department.
 */
function TaskProperties({ values, options, readOnly, onStatus, onChange, errors = {} }: TaskPropertiesProps) {
  const today = options.today;
  const assignee = options.members.find((m) => m.id === values.assigneeId);
  const derivedDepartment = assignee?.department ?? null;
  const [showTime, setShowTime] = useState(Boolean(values.startTime));
  const [timeDraft, setTimeDraft] = useState({ start: values.startTime, end: values.endTime });
  const [timeError, setTimeError] = useState<string | null>(null);
  const [more, setMore] = useState(Boolean(values.startDate));
  useEffect(() => {
    setTimeDraft({ start: values.startTime, end: values.endTime });
    if (values.startTime) setShowTime(true);
  }, [values.startTime, values.endTime]);

  const overdueDays = values.dueDate && isOpenTaskStatus(values.status) && values.dueDate < today ? daysOverdue(values.dueDate as ISODate, today) : 0;

  function commitTime(start: string, end: string) {
    if (!start && !end) return;
    if (!start) return setTimeError('Informe a hora de início.');
    if (end && end <= start) return setTimeError('A hora de término deve ser posterior à de início.');
    setTimeError(null);
    if (start !== values.startTime || end !== values.endTime) onChange({ startTime: start, endTime: end || null });
  }

  return (
    <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
      <Field label="Situação">
        <Select value={values.status} disabled={readOnly} onChange={(e) => onStatus(e.target.value as TaskStatus)}>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Prioridade">
        <Select value={values.priority} disabled={readOnly} onChange={(e) => onChange({ priority: e.target.value as TaskPriority })}>
          {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
            <option key={p} value={p}>
              {TASK_PRIORITY_LABELS[p]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Responsável">
        <MemberPicker
          value={values.assigneeId || NONE}
          onChange={(v) => onChange({ assigneeId: v === NONE ? null : v })}
          members={options.members}
          allowNone
          meFirst
          departmentId={values.departmentId || options.me.department?.id}
          disabled={readOnly}
        />
      </Field>
      <Field
        label="Departamento"
        hint={derivedDepartment ? `Vem do responsável: ${derivedDepartment.name}.` : options.departments.length ? 'Fila do departamento enquanto não houver responsável.' : undefined}
      >
        <Select
          value={derivedDepartment?.id ?? values.departmentId}
          disabled={readOnly || Boolean(derivedDepartment) || options.departments.length === 0}
          onChange={(e) => onChange({ departmentId: e.target.value || null })}
        >
          <option value="">{options.departments.length ? 'Sem departamento' : 'Nenhum departamento cadastrado'}</option>
          {options.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Cliente">
        <ClientPicker
          value={values.clientId || INTERNAL}
          onChange={(v) => onChange({ clientId: v === INTERNAL ? null : v })}
          clients={options.clients}
          allowInternal
          disabled={readOnly}
        />
      </Field>
      <Field
        label="Vencimento"
        error={errors.dueDate}
        hint={overdueDays ? <span className="font-medium text-danger">Venceu há {daysText(overdueDays)}</span> : undefined}
      >
        <Input
          type="date"
          value={values.dueDate}
          disabled={readOnly}
          className="h-10"
          onChange={(e) => {
            const v = e.target.value;
            if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
            // Without a due date the appointment time goes too (it lives on the due date).
            onChange(v ? { dueDate: v } : { dueDate: null, startTime: null, endTime: null });
            if (!v) setShowTime(false);
          }}
        />
      </Field>
      <Field label="Categoria">
        <Select value={values.categoryId} disabled={readOnly} onChange={(e) => onChange({ categoryId: e.target.value || null })}>
          <option value="">Sem categoria</option>
          {options.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-fg">Horário</span>
        {showTime ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Input
                type="time"
                aria-label="Hora de início"
                value={timeDraft.start}
                disabled={readOnly}
                className="h-10 min-w-0 flex-1"
                onChange={(e) => setTimeDraft((d) => ({ ...d, start: e.target.value }))}
                onBlur={() => commitTime(timeDraft.start, timeDraft.end)}
              />
              <span className="text-sm text-muted">às</span>
              <Input
                type="time"
                aria-label="Hora de término"
                value={timeDraft.end}
                disabled={readOnly}
                className="h-10 min-w-0 flex-1"
                onChange={(e) => setTimeDraft((d) => ({ ...d, end: e.target.value }))}
                onBlur={() => commitTime(timeDraft.start, timeDraft.end)}
              />
            </div>
            {timeError || errors.endTime ? (
              <p role="alert" className="text-xs font-medium text-danger">
                {timeError ?? errors.endTime}
              </p>
            ) : null}
            {!readOnly ? (
              <Button
                variant="ghost"
                size="xs"
                className="self-start"
                onClick={() => {
                  setShowTime(false);
                  setTimeError(null);
                  setTimeDraft({ start: '', end: '' });
                  if (values.startTime || values.endTime) onChange({ startTime: null, endTime: null });
                }}
              >
                <X /> Remover horário
              </Button>
            ) : null}
          </div>
        ) : (
          <Tooltip content={!values.dueDate ? 'Defina o vencimento antes do horário.' : null}>
            <span className="self-start">
              <Button
                variant="ghost"
                size="sm"
                className="h-10"
                disabled={readOnly || !values.dueDate}
                onClick={() => {
                  setShowTime(true);
                  setTimeDraft({ start: '09:00', end: '10:00' });
                  onChange({ startTime: '09:00', endTime: '10:00' });
                }}
              >
                <Plus /> Definir horário
              </Button>
            </span>
          </Tooltip>
        )}
      </div>
      {more ? (
        <Field label="Início" error={errors.startDate}>
          <Input
            type="date"
            value={values.startDate}
            disabled={readOnly}
            className="h-10"
            onChange={(e) => onChange({ startDate: e.target.value || null })}
          />
        </Field>
      ) : (
        <div className="flex items-end">
          <Button variant="link" size="sm" onClick={() => setMore(true)}>
            Mais campos
          </Button>
        </div>
      )}
    </div>
  );
}

function SubtaskList({ task, readOnly }: { task: TaskDetail; readOnly: boolean }) {
  const add = useAddSubtask(task.id);
  const update = useUpdateSubtask(task.id);
  const remove = useDeleteSubtask(task.id);
  const [text, setText] = useState('');
  const done = task.subtasks.filter((s) => s.done).length;

  async function submit() {
    const title = text.trim();
    if (!title) return;
    try {
      await add.mutateAsync(title);
      setText('');
    } catch (error) {
      toastError(error);
    }
  }

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="task-subtasks">
      <div className="flex items-center gap-3">
        <h3 id="task-subtasks" className="text-body-sm font-semibold text-fg">
          Subtarefas
        </h3>
        {task.subtasks.length ? (
          <>
            <span className="tabular text-body-sm text-muted">
              {done} de {task.subtasks.length}
            </span>
            <ProgressBar size="sm" value={done / task.subtasks.length} className="max-w-40" label="Subtarefas concluídas" />
          </>
        ) : null}
      </div>
      {task.subtasks.length === 0 ? <p className="text-body-sm text-subtle">Nenhuma subtarefa.</p> : null}
      <ul className="flex flex-col">
        {task.subtasks.map((s) => (
          <li key={s.id} className="group/sub flex min-h-10 items-center gap-3 rounded-md px-1 hover:bg-surface-muted">
            <Checkbox
              checked={s.done}
              disabled={readOnly}
              aria-label={`${s.done ? 'Desmarcar' : 'Marcar'} ${s.title}`}
              onCheckedChange={(checked) =>
                update.mutate({ id: s.id, patch: { done: checked } }, { onError: (e) => toastError(e) })
              }
            />
            <span className={cn('min-w-0 flex-1 text-sm break-words', s.done ? 'text-muted line-through' : 'text-fg')}>{s.title}</span>
            {!readOnly ? (
              <button
                type="button"
                aria-label={`Remover subtarefa ${s.title}`}
                onClick={() => remove.mutate(s.id, { onError: (e) => toastError(e) })}
                className="flex size-8 items-center justify-center rounded-md text-muted opacity-0 transition hover:bg-bg-subtle hover:text-fg group-hover/sub:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {!readOnly ? (
        <div className="relative">
          <Plus className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input
            value={text}
            maxLength={200}
            placeholder="Adicionar subtarefa"
            aria-label="Adicionar subtarefa"
            className="h-10 pl-9"
            disabled={add.isPending}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              } else if (e.key === 'Escape' && text) {
                e.preventDefault();
                e.stopPropagation();
                setText('');
              }
            }}
          />
        </div>
      ) : null}
    </section>
  );
}

function CommentThread({ task, me, readOnly }: { task: TaskDetail; me: TaskOptionsResponse['me']; readOnly: boolean }) {
  const add = useAddComment(task.id);
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [pending, setPending] = useState<TaskComment | null>(null);

  async function submit() {
    const value = text.trim();
    if (!value) return;
    // The comment shows at once; a failure puts the text back in the field.
    setPending({ id: 'pending', author: { id: me.id, name: me.name }, text: value, isYours: true, createdAt: new Date().toISOString() });
    setText('');
    try {
      await add.mutateAsync(value);
    } catch (error) {
      setText(value);
      toastError(error);
      void qc.invalidateQueries({ queryKey: qk.task(task.id) });
    } finally {
      setPending(null);
    }
  }

  const comments = pending ? [...task.comments, pending] : task.comments;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="task-comments">
      <h3 id="task-comments" className="text-body-sm font-semibold text-fg">
        Comentários{task.comments.length ? <span className="ml-1.5 font-normal text-muted">{task.comments.length}</span> : null}
      </h3>
      {comments.length === 0 ? <p className="text-body-sm text-subtle">Nenhum comentário ainda.</p> : null}
      <ul className="flex flex-col gap-4">
        {comments.map((c) => (
          <li key={c.id} className={cn('flex gap-3', c.id === 'pending' && 'opacity-70')}>
            <MemberAvatar size="md" name={c.author?.name} unassigned={!c.author} />
            <div className="min-w-0 flex-1">
              <p className="text-body-sm">
                <span className="font-semibold text-fg">{c.author?.name ?? 'Pessoa removida'}</span>{' '}
                <span className="text-caption text-muted">{c.id === 'pending' ? 'enviando…' : commentTime(c.createdAt)}</span>
              </p>
              <p className="mt-0.5 text-sm break-words whitespace-pre-wrap text-fg">{c.text}</p>
            </div>
          </li>
        ))}
      </ul>
      {!readOnly ? (
        <div className="flex gap-3">
          <MemberAvatar size="md" name={me.name} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Textarea
              value={text}
              rows={2}
              maxLength={5000}
              placeholder="Escreva um comentário…"
              aria-label="Escreva um comentário"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
            <Button variant="outline" size="sm" className="self-end" disabled={!text.trim() || add.isPending} onClick={() => void submit()}>
              <Send /> Comentar
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** What the API records about the task: who created and concluded it, and the last change. */
function History({ task }: { task: TaskDetail }) {
  const lines = [
    `Criada${task.createdBy ? ` por ${task.createdBy.name}` : ''} em ${dateTimeBR(task.createdAt)}`,
    task.completedAt ? `Concluída${task.completedBy ? ` por ${task.completedBy.name}` : ''} em ${dateTimeBR(task.completedAt)}` : null,
    task.updatedAt !== task.createdAt ? `Última alteração em ${dateTimeBR(task.updatedAt)}` : null,
  ].filter(Boolean);
  return (
    <section className="flex flex-col gap-1.5 border-t border-border pt-4" aria-labelledby="task-history">
      <h3 id="task-history" className="text-body-sm font-semibold text-fg">
        Histórico
      </h3>
      <ul className="flex flex-col gap-1">
        {lines.map((l) => (
          <li key={l} className="text-caption text-subtle">
            {l}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DetailFooter({ task, stamp, readOnly, onClose }: { task: TaskDetail; stamp: Stamp; readOnly: boolean; onClose: () => void }) {
  const status = useTaskStatusChange();
  const remove = useDeleteTask();
  const { isAdmin } = usePermissions();
  const [confirming, setConfirming] = useState(false);
  const [params, setParams] = useSearchParams();
  const closed = task.status === 'done' || task.status === 'canceled';

  if (readOnly) {
    return (
      <p className="mr-auto text-caption text-muted">{SUBSCRIPTION_REASON}</p>
    );
  }
  return (
    <>
      <SavedStamp state={stamp} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Mais ações da tarefa">
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end">
          <DropdownMenuItem icon={<Copy />} onSelect={() => setParams(withSheetParams(params, { nova: '1', duplicar: task.id }))}>
            Duplicar
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={<Link2 />}
            onSelect={async () => {
              const ok = await copyText(window.location.href);
              if (ok) toast.success('Link copiado.');
              else toast.error('Não foi possível copiar o link.');
            }}
          >
            Copiar link
          </DropdownMenuItem>
          {task.status !== 'canceled' ? (
            <DropdownMenuItem icon={<CircleX />} onSelect={() => void status.change(task, 'canceled', 'menu')}>
              Cancelar tarefa
            </DropdownMenuItem>
          ) : null}
          {isAdmin ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Trash2 />} tone="danger" onSelect={() => setConfirming(true)}>
                Excluir
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {closed ? (
        <Button variant="outline" loading={status.savingId === task.id} onClick={() => void status.change(task, task.reopenStatus, 'toggle')}>
          <RotateCcw /> Reabrir
        </Button>
      ) : (
        <Button loading={status.savingId === task.id} onClick={() => void status.change(task, 'done', 'toggle')}>
          <CircleCheck /> Concluir tarefa
        </Button>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Excluir “${task.title}”?`}
        description="Subtarefas e comentários também serão excluídos. Esta ação não pode ser desfeita."
        confirmLabel="Excluir tarefa"
        loading={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(task.id);
            setConfirming(false);
            onClose();
            toast.success('Tarefa excluída.');
          } catch (error) {
            toastError(error);
          }
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Create mode
// ---------------------------------------------------------------------------

interface NewTaskValues extends PropertyValues {
  title: string;
  description: string;
}

/** Defaults of a new task from the URL: the board column, an appointment, a copy, the active filters. */
export function newTaskDefaults(params: URLSearchParams, options: TaskOptionsResponse | undefined, copy: TaskDetail | undefined): NewTaskValues {
  const today = options?.today ?? todayISO();
  const appointment = params.get('horario') === '1';
  const dept = params.get('departamento');
  const client = params.get('cliente');
  const escopo = params.get('escopo');
  const base: NewTaskValues = {
    title: '',
    description: '',
    status: statusFromParam(params.get('estado')),
    priority: 'medium',
    departmentId: isUuid(dept) && options?.departments.some((d) => d.id === dept) ? dept : '',
    assigneeId: escopo === 'minhas' && options ? options.me.id : '',
    clientId: isUuid(client) ? client : '',
    dueDate: appointment ? today : '',
    categoryId: '',
    startDate: '',
    startTime: appointment ? '09:00' : '',
    endTime: appointment ? '10:00' : '',
  };
  if (!copy) return base;
  return {
    ...base,
    title: copy.title,
    description: copy.description ?? '',
    priority: copy.priority,
    departmentId: copy.department?.id ?? '',
    assigneeId: copy.assignee?.id ?? '',
    clientId: copy.client?.id ?? '',
    dueDate: copy.dueDate ?? '',
    categoryId: copy.category?.id ?? '',
    startDate: copy.startDate ?? '',
    startTime: copy.startTime ?? '',
    endTime: copy.endTime ?? '',
  };
}

function NewTaskSheet({
  open,
  params,
  options,
  onClose,
  onCreated,
}: {
  open: boolean;
  params: URLSearchParams;
  options: TaskOptionsResponse | undefined;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const duplicateId = params.get('duplicar');
  const copy = useTask(isUuid(duplicateId) ? duplicateId : null);
  const create = useCreateTask();
  const defaults = useMemo(
    () => newTaskDefaults(params, options, copy.data),
    // Only when the sheet opens or the data it copies arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Boolean(options), copy.data?.id, params.get('estado'), params.get('horario')],
  );
  const form = useForm<NewTaskValues>({ defaultValues: defaults });
  const [errors, setErrors] = useState<Partial<Record<keyof NewTaskValues, string>>>({});
  useEffect(() => {
    form.reset(defaults);
    setErrors({});
  }, [defaults, form]);

  const values = form.watch();
  const { canWriteTasks } = usePermissions();

  function setField(patch: TaskUpdateInput) {
    for (const [k, v] of Object.entries(patch)) form.setValue(k as keyof NewTaskValues, (v ?? '') as never, { shouldDirty: true });
    // The client's responsible in the department, when nobody was chosen yet (the user may change it).
    if (patch.clientId && !form.getValues('assigneeId') && options) {
      const dept = form.getValues('departmentId');
      const r = options.clientResponsibles.find((x) => x.clientId === patch.clientId && x.departmentId === dept);
      if (r) form.setValue('assigneeId', r.user.id);
    }
  }

  const submit = form.handleSubmit(async (v) => {
    const input: TaskInput = {
      title: v.title,
      description: v.description || null,
      clientId: v.clientId || null,
      categoryId: v.categoryId || null,
      assigneeId: v.assigneeId || null,
      departmentId: v.departmentId || null,
      priority: v.priority,
      status: v.status,
      startDate: v.startDate || null,
      dueDate: v.dueDate || null,
      startTime: v.startTime || null,
      endTime: v.endTime || null,
    };
    const parsed = taskInputSchema.safeParse(input);
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof NewTaskValues | undefined;
        if (key && !next[key]) next[key] = issue.message.endsWith('.') ? issue.message : `${issue.message}.`;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    try {
      const task = await create.mutateAsync(input);
      toast.success('Tarefa criada.');
      onCreated(task.id);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const fields = error.fieldErrors();
        if (Object.keys(fields).length) setErrors(fields as typeof errors);
      }
      toastError(error);
    }
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={duplicateId ? 'Duplicar tarefa' : 'Nova tarefa'}
      description="Atribua um responsável e um prazo."
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <WriteGate scope="tasks">
            <Button type="submit" form="new-task-form" loading={create.isPending}>
              Criar tarefa
            </Button>
          </WriteGate>
        </>
      }
    >
      {!options ? (
        <DetailSkeleton />
      ) : (
        <form id="new-task-form" onSubmit={submit} className="flex flex-col gap-6" noValidate>
          <Field label="Nome" error={errors.title}>
            <Input data-autofocus maxLength={200} placeholder="Ex.: Balancete de setembro, Alteração contratual" {...form.register('title')} />
          </Field>
          <TaskProperties
            values={values}
            options={options}
            readOnly={!canWriteTasks}
            errors={errors}
            onStatus={(s) => form.setValue('status', s)}
            onChange={setField}
          />
          <Controller
            control={form.control}
            name="description"
            render={({ field }) => (
              <Field label="Descrição" error={errors.description}>
                <Textarea rows={3} maxLength={5000} placeholder="Descreva o que precisa ser feito…" {...field} />
              </Field>
            )}
          />
          <p className="text-caption text-subtle">Subtarefas e comentários ficam disponíveis depois de criar.</p>
          {create.isError && !(create.error instanceof ApiRequestError) ? (
            <p role="alert" className="text-xs text-danger">
              {errorMessage(create.error)}
            </p>
          ) : null}
        </form>
      )}
    </Sheet>
  );
}

