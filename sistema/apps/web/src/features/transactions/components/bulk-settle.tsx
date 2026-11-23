import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCheck, X } from 'lucide-react';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, formatBRL, todayISO, type PaymentMethod, type Transaction } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAccounts } from '@/features/accounts/api';
import { toastError } from '@/lib/notify';
import { pluralize } from '@/lib/utils';
import { useSetPaid } from '../api';

// Bulk settlement ("Dar baixa em lote") of Contas a pagar/receber: the chosen pending rows are paid on one
// date, with one payment method (or each keeps its own) and an account for the rows without one. Interest,
// fines and discounts stay in the one-by-one flow. The toast offers "Desfazer", which reopens them.

/** Rows a bulk settlement can take: pending, not a card purchase (those go with the invoice). */
export function settleable(tx: Transaction): boolean {
  return !tx.paid && tx.type !== 'transfer' && !tx.creditCardId;
}

/** Bottom bar of the selection: count, total and the actions. */
export function SelectionBar({
  count,
  total,
  income,
  onSettle,
  onClear,
}: {
  count: number;
  total: number;
  income: boolean;
  onSettle: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="sticky bottom-24 z-[3] mx-auto flex w-fit max-w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 shadow-lg">
      <span className="text-body-sm text-fg">
        <span className="font-semibold">{pluralize(count, 'selecionado', 'selecionados')}</span>
        <span className="tabular text-muted"> · {formatBRL(total)}</span>
      </span>
      <Button size="toolbar" onClick={onSettle}>
        <CheckCheck /> {income ? 'Marcar como recebidos' : 'Marcar como pagos'}
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Limpar seleção" onClick={onClear}>
        <X />
      </Button>
    </div>
  );
}

export function BulkSettleDialog({
  rows,
  income,
  onClose,
  onDone,
}: {
  rows: Transaction[] | null;
  income: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const accounts = useAccounts();
  const setPaid = useSetPaid();
  const [paidAt, setPaidAt] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [accountId, setAccountId] = useState('');
  const [saving, setSaving] = useState(false);
  const withoutAccount = rows?.filter((t) => !t.accountId).length ?? 0;
  const total = rows?.reduce((a, t) => a + t.amount, 0) ?? 0;

  useEffect(() => {
    if (!rows) return;
    setPaidAt(todayISO());
    setMethod('');
    setAccountId('');
  }, [rows]);

  async function setAll(list: Transaction[], paid: boolean) {
    const done: Transaction[] = [];
    for (const tx of list) {
      await setPaid.mutateAsync({
        id: tx.id,
        input: paid
          ? { paid: true, paidAt, ...(method ? { paymentMethod: method } : {}), ...(!tx.accountId && accountId ? { accountId } : {}) }
          : { paid: false, paidAt: null },
      });
      done.push(tx);
    }
    return done;
  }

  async function confirm() {
    if (!rows?.length) return;
    setSaving(true);
    try {
      const done = await setAll(rows, true);
      onDone();
      toast.success(`${pluralize(done.length, 'lançamento', 'lançamentos')} ${income ? 'recebido' : 'pago'}${done.length === 1 ? '' : 's'} · ${formatBRL(total)}`, {
        action: {
          label: 'Desfazer',
          onClick: () => {
            void setAll(done, false).then(
              () => toast.info('Baixa desfeita'),
              (error) => toastError(error),
            );
          },
        },
      });
    } catch (error) {
      toastError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(rows)}
      onOpenChange={(o) => !o && !saving && onClose()}
      title={income ? 'Marcar como recebidos' : 'Marcar como pagos'}
      description={rows ? `${pluralize(rows.length, 'lançamento', 'lançamentos')} · ${formatBRL(total)}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={saving}>
            {saving ? 'Salvando…' : 'Confirmar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={income ? 'Recebidos em' : 'Pagos em'}>
          <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </Field>
        <Field label={income ? 'Forma de recebimento' : 'Forma de pagamento'} hint="Em branco, cada lançamento mantém a sua.">
          <Select aria-label={income ? 'Forma de recebimento' : 'Forma de pagamento'} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | '')}>
            <option value="">Manter a de cada lançamento</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        {withoutAccount > 0 ? (
          <Field label={income ? 'Receber em qual conta?' : 'Pagar com qual conta?'} hint={`Para ${pluralize(withoutAccount, 'lançamento sem conta', 'lançamentos sem conta')}.`}>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Sem conta vinculada</option>
              {(accounts.data ?? [])
                .filter((a) => !a.archived)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {formatBRL(a.balance)}
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}
        <p className="text-caption text-muted">Juros, multa e desconto não entram na baixa em lote: para isso, dê baixa no lançamento.</p>
      </div>
    </Modal>
  );
}
