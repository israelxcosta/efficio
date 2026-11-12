import { useEffect, useState } from 'react';
import { Repeat } from 'lucide-react';
import { toast } from 'sonner';
import type { ISODate, TaskDetail, TaskUpdateInput } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { usePermissions } from '@/features/auth/permissions';
import { toastError } from '@/lib/notify';
import { useUpdateTask } from '../api';
import {
  defaultRepeatForm,
  repeatErrors,
  repeatFormOf,
  repeatModeOf,
  repeatShortText,
  repeatSummaryOf,
  toRecurrenceInput,
  type ApplyScope,
  type RepeatForm,
} from '../repeat-rules';
import { RepeatFieldView } from './repeat-field';

/** Who may change a repetition (spec §9.4), when the API says the person may not. */
export const NO_EDIT_REASON = 'Só o responsável, o departamento dele ou um administrador alteram a repetição.';

/**
 * "Aplicar alterações a: Só esta · Esta e as próximas", above the fields of an occurrence of a
 * repetition that the person may edit (spec §9.4).
 */
export function ApplyScopeControl({ value, onChange }: { value: ApplyScope; onChange: (scope: ApplyScope) => void }) {
  return (
    <SegmentedControl<ApplyScope>
      size="sm"
      ariaLabel="Aplicar alterações a"
      value={value}
      onChange={onChange}
      options={[
        { value: 'occurrence', label: 'Só esta' },
        { value: 'series', label: 'Esta e as próximas' },
      ]}
      className="self-start"
    />
  );
}

/**
 * The "Repetição" field of an existing task, by kind (spec §9.4, "Detalhe"): start one on a task
 * without repetition (Repetir / Cancelar, with Desfazer), see and edit the rule of a series (Salvar
 * repetição), stop it (confirmation), or show it disabled (registry, no `canEdit`, read-only).
 */
export function TaskRepeatField({
  task,
  today,
  readOnly,
  canRegistry,
  onSeriesSaved,
}: {
  task: TaskDetail;
  today: ISODate;
  /** Inactive subscription (only with billing on) or no task permission. */
  readOnly: boolean;
  canRegistry: boolean;
  /** "Salvo nesta e nas próximas" after saving the rule. */
  onSeriesSaved: () => void;
}) {
  const mode = repeatModeOf(task);
  const update = useUpdateTask();
  const { subscriptionReason } = usePermissions();
  const rule = mode === 'series' ? task.recurrence : null;
  const start = (task.dueDate ?? today) as ISODate;
  const [draft, setDraft] = useState<{ on: boolean; form: RepeatForm } | null>(null);
  const [errors, setErrors] = useState<ReturnType<typeof repeatErrors>>({});
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    setDraft(null);
    setErrors({});
  }, [task.id, mode]);

  if (mode === 'hidden') return null;

  async function patch(body: TaskUpdateInput) {
    try {
      return await update.mutateAsync({ id: task.id, patch: body });
    } catch (error) {
      toastError(error);
      return null;
    }
  }

  // Occurrence of the registry: on, disabled; the "Ver tarefa recorrente" link is in the Prazo block.
  if (mode === 'registry') return <FrozenRepeat reason="Vem da tarefa recorrente." />;

  const canEdit = mode === 'series' || mode === 'ended' ? (task.recurrence?.canEdit ?? true) : true;
  const lockReason = readOnly ? (subscriptionReason ?? 'Somente leitura.') : !canEdit ? NO_EDIT_REASON : undefined;

  if (mode === 'series' && rule) {
    if (draft) {
      const saveRule = async () => {
        const errs = repeatErrors(draft.form, rule.startDate);
        setErrors(errs);
        if (Object.keys(errs).length) return;
        const saved = await patch({ recurrence: toRecurrenceInput(draft.form, rule.startDate), applyTo: 'series' });
        if (saved) {
          setDraft(null);
          onSeriesSaved();
        }
      };
      return (
        <RepeatFieldView
          on
          onToggle={(on) => !on && setStopping(true)}
          form={draft.form}
          onForm={(form) => {
            setDraft({ ...draft, form });
            if (Object.keys(errors).length) setErrors({});
          }}
          start={rule.startDate}
          today={today}
          errors={errors}
          readOnly={false}
          canRegistry={canRegistry}
          note={<p className="text-caption text-subtle">Vale para esta e as próximas ainda não iniciadas; as concluídas não mudam.</p>}
          footer={
            <>
              <Button size="sm" loading={update.isPending} onClick={() => void saveRule()}>
                Salvar repetição
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                Cancelar
              </Button>
            </>
          }
        />
      );
    }
    return (
      <div className="flex flex-col gap-3 sm:col-span-2">
        <SegmentedControl<'off' | 'on'>
          size="sm"
          ariaLabel="Repetição"
          value="on"
          onChange={(v) => v === 'off' && !lockReason && setStopping(true)}
          options={[
            { value: 'off', label: 'Não se repete' },
            { value: 'on', label: 'Repete' },
          ]}
          className={lockReason ? 'self-start opacity-60' : 'self-start'}
        />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-fg">
          <Repeat className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 flex-1">{repeatSummaryOf(rule, today)}</span>
          {!lockReason ? (
            <Button variant="link" size="sm" onClick={() => setDraft({ on: true, form: repeatFormOf(rule) })}>
              Editar repetição
            </Button>
          ) : null}
        </div>
        {lockReason ? <p className="text-xs text-muted">{lockReason}</p> : null}
        <ConfirmDialog
          open={stopping}
          onOpenChange={setStopping}
          title={`Parar de repetir “${task.title}”?`}
          description="Esta tarefa continua. As próximas não serão criadas."
          confirmLabel="Parar de repetir"
          loading={update.isPending}
          onConfirm={async () => {
            if (await patch({ recurrence: null })) {
              setStopping(false);
              toast.success('Não repete mais.');
            }
          }}
        />
      </div>
    );
  }

  // A task without repetition (or whose series stopped): "Repete" opens the rule; Repetir saves it.
  const on = draft?.on ?? false;
  const form = draft?.form ?? defaultRepeatForm(start);
  const repeatNow = async () => {
    const errs = repeatErrors(form, start);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const input = toRecurrenceInput(form, start);
    const saved = await patch({ recurrence: input });
    if (!saved) return;
    setDraft(null);
    const short = saved.recurrence ? repeatShortText(saved.recurrence) : '';
    toast.success(short ? `Agora repete ${short}.` : 'Agora repete.', {
      action: {
        label: 'Desfazer',
        onClick: () => void patch({ recurrence: null }),
      },
    });
  };
  return (
    <RepeatFieldView
      on={on}
      onToggle={(next) => {
        setErrors({});
        setDraft(next ? { on: true, form } : null);
      }}
      form={form}
      onForm={(f) => {
        setDraft({ on: true, form: f });
        if (Object.keys(errors).length) setErrors({});
      }}
      start={start}
      today={today}
      errors={errors}
      readOnly={false}
      canRegistry={canRegistry}
      disabledReason={lockReason}
      hint={mode === 'ended' && !on ? 'Parou de repetir.' : undefined}
      footer={
        <>
          <Button size="sm" loading={update.isPending} onClick={() => void repeatNow()}>
            Repetir
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
            Cancelar
          </Button>
        </>
      }
    />
  );
}

/** "Repete", disabled, with the reason (registry occurrences). */
function FrozenRepeat({ reason }: { reason: string }) {
  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <SegmentedControl<'off' | 'on'>
        size="sm"
        ariaLabel="Repetição"
        value="on"
        onChange={() => {}}
        options={[
          { value: 'off', label: 'Não se repete' },
          { value: 'on', label: 'Repete' },
        ]}
        className="self-start opacity-60"
      />
      <p className="text-xs text-muted">{reason}</p>
    </div>
  );
}
