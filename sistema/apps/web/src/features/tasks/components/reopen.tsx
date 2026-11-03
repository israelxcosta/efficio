import { useEffect, useId, useState } from 'react';
import type { OpenTaskStatus } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export const REOPEN_REASON_REQUIRED = 'Escreva o motivo da reabertura.';

/** The reason is required (up to 500 characters); returns the error to show, or null. */
export function reopenReasonError(reason: string): string | null {
  return reason.trim() ? null : REOPEN_REASON_REQUIRED;
}

interface ReopenReasonFormProps {
  /** Where the task goes back to (A fazer by default, or Em andamento). */
  initialStatus?: OpenTaskStatus;
  busy?: boolean;
  onConfirm: (reason: string, status: OpenTaskStatus) => void;
  onCancel: () => void;
  /** Label of the cancel button ("Voltar" in the popover, "Cancelar" in the modal). */
  cancelLabel?: string;
}

/**
 * Reopening a concluded occurrence (spec §11.6): the reason, recorded in the history, and the status
 * it goes back to. Used in the conclusion popover (audit, occurrence sheet) and in the task sheet.
 */
export function ReopenReasonForm({ initialStatus = 'todo', busy, onConfirm, onCancel, cancelLabel = 'Voltar' }: ReopenReasonFormProps) {
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<OpenTaskStatus>(initialStatus === 'in_progress' ? 'in_progress' : 'todo');
  const [error, setError] = useState<string | null>(null);
  const formId = useId();
  return (
    <form
      id={formId}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const err = reopenReasonError(reason);
        setError(err);
        if (!err) onConfirm(reason.trim(), status);
      }}
      noValidate
    >
      <Field label="Motivo da reabertura*" error={error ?? undefined}>
        <Textarea
          data-autofocus
          autoFocus
          rows={2}
          maxLength={500}
          aria-required
          placeholder="Ex.: guia emitida com valor errado"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (error) setError(null);
          }}
        />
      </Field>
      <Field label="Voltar para">
        <Select size_="sm" value={status} onChange={(e) => setStatus(e.target.value as OpenTaskStatus)}>
          <option value="todo">A fazer</option>
          <option value="in_progress">Em andamento</option>
        </Select>
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button type="submit" size="sm" loading={busy}>
          Reabrir
        </Button>
      </div>
    </form>
  );
}

interface ReopenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialStatus?: OpenTaskStatus;
  busy?: boolean;
  onConfirm: (reason: string, status: OpenTaskStatus) => void;
}

/** The same form in a `Modal max-w-md` (the task sheet of an occurrence). */
export function ReopenDialog({ open, onOpenChange, title, initialStatus, busy, onConfirm }: ReopenDialogProps) {
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (open) setKey((k) => k + 1);
  }, [open]);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Reabrir “${title}”`}
      description="A conclusão é um registro de auditoria: o motivo fica no histórico da tarefa."
    >
      <div className="pb-5">
        <ReopenReasonForm key={key} initialStatus={initialStatus} busy={busy} cancelLabel="Cancelar" onCancel={() => onOpenChange(false)} onConfirm={onConfirm} />
      </div>
    </Modal>
  );
}
