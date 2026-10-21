import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarRange, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  formatBRL,
  formatDateBR,
  todayISO,
  type Client,
  type ClientFee,
  type FeePeriod,
} from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Modal } from '@/components/ui/dialog';
import { Field } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/misc';
import { MoneyInput } from '@/components/ui/money-input';
import { Skeleton } from '@/components/ui/skeleton';
import { toastError } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { usePermissions, WriteGate } from '@/features/auth/permissions';
import { useClientFees, useSaveFee } from './api';

type Editing = { period: FeePeriod; fee: ClientFee | null } | null;

const ordinal = (index: number) => `${index + 1}ª vigência`;

function periodLabel(p: FeePeriod) {
  return `${formatDateBR(p.startDate)} a ${formatDateBR(p.endDate)}`;
}

function periodStatus(p: FeePeriod, today: string) {
  if (p.endDate < today) return { label: 'Encerrada', tone: 'neutral' as const };
  if (p.startDate > today) return { label: 'Futura', tone: 'brand' as const };
  return { label: 'Vigente', tone: 'success' as const };
}

/** "Honorários" of a client: the fee in force, the yearly periods and "+" for the next one. */
export function FeesDialog({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const fees = useClientFees(client?.id);
  const save = useSaveFee();
  const canWrite = usePermissions().canWrite;
  const [editing, setEditing] = useState<Editing>(null);
  const [amount, setAmount] = useState(0);
  const [employeeFee, setEmployeeFee] = useState(0);
  const [toDelete, setToDelete] = useState<ClientFee | null>(null);
  const today = todayISO();

  useEffect(() => {
    setEditing(null);
    setToDelete(null);
  }, [client?.id]);

  const data = fees.data;
  const latest = data?.items[0] ?? null;
  const current = data?.current ?? null;

  function startNew() {
    if (!data) return;
    // Readjustments usually start from the previous values.
    setAmount(latest?.amount ?? 0);
    setEmployeeFee(latest?.employeeFee ?? 0);
    setEditing({ period: data.next, fee: null });
  }

  function startEdit(fee: ClientFee) {
    setAmount(fee.amount);
    setEmployeeFee(fee.employeeFee);
    setEditing({ period: fee, fee });
  }

  async function submit() {
    if (!client || !editing) return;
    if (amount <= 0) {
      toast.error('Informe o valor do honorário mensal');
      return;
    }
    try {
      await save.mutateAsync({
        clientId: client.id,
        feeId: editing.fee?.id,
        input: { amount, employeeFee },
      });
      toast.success(editing.fee ? 'Vigência atualizada' : 'Nova vigência cadastrada');
      setEditing(null);
    } catch (error) {
      toastError(error);
    }
  }

  return (
    <Modal
      open={Boolean(client)}
      onOpenChange={(o) => !o && onClose()}
      title="Honorários"
      description={
        client
          ? `${client.tradeName || client.name} · vigência anual a partir de ${formatDateBR(client.contractStartDate)}`
          : undefined
      }
      className="max-w-lg"
    >
      {fees.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-14" />
        </div>
      ) : fees.isError ? (
        <ErrorState error={fees.error} onRetry={() => fees.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <section
            className="rounded-xl border border-border bg-surface-muted p-4"
            aria-label="Honorário vigente"
          >
            <p className="eyebrow text-muted">Honorário vigente</p>
            {current ? (
              <>
                <p className="tabular mt-1 text-[28px] leading-tight font-bold tracking-tight text-fg">
                  {formatBRL(current.amount)}
                  <span className="ml-1 text-sm font-medium text-muted">/mês</span>
                </p>
                <p className="mt-1 text-sm text-muted">
                  Taxa por empregado:{' '}
                  <span className="tabular font-semibold text-fg">
                    {formatBRL(current.employeeFee)}
                  </span>
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                  <CalendarRange className="size-3.5" /> {ordinal(current.index)}:{' '}
                  {periodLabel(current)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">
                {latest && latest.endDate < today
                  ? `Nenhuma vigência cobre hoje: a última terminou em ${formatDateBR(latest.endDate)}. Cadastre a próxima.`
                  : latest
                    ? `A próxima vigência começa em ${formatDateBR(latest.startDate)}.`
                    : 'Nenhum honorário cadastrado. A primeira vigência começa no início do contrato.'}
              </p>
            )}
          </section>

          <div className="flex items-center justify-between">
            <p className="eyebrow text-muted">Vigências</p>
            <WriteGate>
              <Button
                size="sm"
                variant="soft"
                onClick={startNew}
                disabled={Boolean(editing) && !editing?.fee}
              >
                <Plus /> Nova vigência
              </Button>
            </WriteGate>
          </div>

          {editing ? (
            <div className="flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50/60 p-4">
              <p className="text-sm font-semibold text-fg">
                {editing.fee
                  ? `Editar ${ordinal(editing.period.index)}`
                  : `Nova vigência (${ordinal(editing.period.index)})`}
                <span className="block text-xs font-normal text-muted">
                  {periodLabel(editing.period)}
                </span>
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Honorário mensal">
                  <MoneyInput value={amount} onChange={setAmount} autoFocus />
                </Field>
                <Field label="Taxa por empregado" hint="Por empregado, por mês">
                  <MoneyInput value={employeeFee} onChange={setEmployeeFee} />
                </Field>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={submit} loading={save.isPending}>
                  Salvar
                </Button>
              </div>
            </div>
          ) : null}

          {data!.items.length === 0 ? (
            !editing ? (
              <p className="text-sm text-muted">
                Clique em + para cadastrar a primeira vigência ({periodLabel(data!.next)}).
              </p>
            ) : null
          ) : (
            <ul className="scrollbar-thin flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {data!.items.map((fee, i) => {
                const status = periodStatus(fee, today);
                return (
                  <li
                    key={fee.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5',
                      status.label === 'Vigente' && 'bg-success-soft/40',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                        {ordinal(fee.index)} <Badge tone={status.tone}>{status.label}</Badge>
                      </p>
                      <p className="text-xs text-muted">{periodLabel(fee)}</p>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-sm font-semibold text-fg">
                        {formatBRL(fee.amount)}
                      </p>
                      <p className="tabular text-[11px] text-muted">
                        {formatBRL(fee.employeeFee)} / empregado
                      </p>
                    </div>
                    {canWrite ? (
                      <div className="flex gap-0.5">
                        <button
                          type="button"
                          className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-bg-subtle hover:text-fg"
                          aria-label={`Editar ${ordinal(fee.index)}`}
                          onClick={() => startEdit(fee)}
                        >
                          <Pencil className="size-4" />
                        </button>
                        {i === 0 ? (
                          <button
                            type="button"
                            className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger"
                            aria-label={`Excluir ${ordinal(fee.index)}`}
                            onClick={() => setToDelete(fee)}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        ) : (
                          <span className="size-8" aria-hidden />
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir vigência?"
        description={
          toDelete
            ? `${ordinal(toDelete.index)} (${periodLabel(toDelete)}) será excluída.`
            : undefined
        }
        confirmLabel="Excluir"
        loading={save.isPending}
        onConfirm={async () => {
          if (!client || !toDelete) return;
          try {
            await save.mutateAsync({ clientId: client.id, feeId: toDelete.id, input: null });
            toast.success('Vigência excluída');
            setToDelete(null);
            if (editing?.fee?.id === toDelete.id) setEditing(null);
          } catch (error) {
            toastError(error);
          }
        }}
      />
    </Modal>
  );
}
