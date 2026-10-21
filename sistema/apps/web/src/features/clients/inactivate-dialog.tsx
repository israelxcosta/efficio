import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  INACTIVATION_REASONS,
  INACTIVATION_REASON_LABELS,
  clientInactivationSchema,
  todayISO,
  type Client,
  type InactivationReason,
} from '@effinance/shared';
import { Modal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toastError } from '@/lib/notify';
import { useInactivateClient } from './api';

type FormIn = z.input<typeof clientInactivationSchema>;
type FormOut = z.output<typeof clientInactivationSchema>;

const empty = (): FormIn => ({ date: todayISO(), reason: '' as InactivationReason, notes: '' });

/** Asks when and why the client stopped being served (transfer, end of contract, closure…). */
export function InactivateDialog({
  client,
  onClose,
}: {
  client: Client | null;
  onClose: () => void;
}) {
  const inactivate = useInactivateClient();
  const { register, control, handleSubmit, reset, watch, formState } = useForm<
    FormIn,
    unknown,
    FormOut
  >({
    resolver: zodResolver(clientInactivationSchema),
    defaultValues: empty(),
  });
  const e = formState.errors;
  const reason = watch('reason');

  useEffect(() => {
    if (client) reset(empty());
  }, [client, reset]);

  const onSubmit = handleSubmit(async (input) => {
    if (!client) return;
    try {
      await inactivate.mutateAsync({ id: client.id, input });
      toast.success('Cliente inativado');
      onClose();
    } catch (error) {
      toastError(error);
    }
  });

  return (
    <Modal
      open={Boolean(client)}
      onOpenChange={(o) => !o && onClose()}
      title="Inativar cliente"
      description={
        client
          ? `${client.tradeName || client.name} sai da lista de ativos. Lançamentos e honorários continuam registrados.`
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onSubmit} loading={inactivate.isPending}>
            Inativar
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          void onSubmit();
        }}
        noValidate
      >
        <Field label="Data da inativação" error={e.date?.message}>
          <Input type="date" {...register('date')} />
        </Field>
        <Field label="Motivo" error={e.reason?.message}>
          <Controller
            control={control}
            name="reason"
            render={({ field }) => (
              <Select value={field.value ?? ''} onChange={field.onChange}>
                <option value="">Selecione o motivo…</option>
                {INACTIVATION_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {INACTIVATION_REASON_LABELS[r]}
                  </option>
                ))}
              </Select>
            )}
          />
        </Field>
        <Field
          label="Observação"
          hint={reason === 'other' ? 'Obrigatória para "Outro motivo"' : 'Opcional'}
          error={e.notes?.message}
        >
          <Controller
            control={control}
            name="notes"
            render={({ field }) => (
              <Textarea
                value={field.value ?? ''}
                onChange={field.onChange}
                maxLength={500}
                placeholder="Ex.: transferida para o escritório X a partir da competência 10/2026"
              />
            )}
          />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
