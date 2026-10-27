import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  DISCOUNT_CATEGORY,
  daysLate,
  discountAmount,
  earnsDiscount,
  formatBRL,
  formatBps,
  formatDateBR,
  formatMonthKey,
  suggestLateFees,
  todayISO,
  type Transaction,
  type TransactionListResponse,
} from '@effinance/shared';
import { ConfirmDialog, Modal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { Select } from '@/components/ui/select';
import { useAccounts } from '@/features/accounts/api';
import { useDeleteTransfer } from '@/features/transfers/api';
import { TransferSheet, type TransferMode, type TransferSheetState } from '@/features/transfers/transfer-sheet';
import { useAnticipateInstallments, useDeleteTransaction, useSetPaid } from './api';
import { ScopeDialog } from './scope-dialog';
import { TransactionSheet, type TransactionSheetState, type TxKind } from './transaction-sheet';
import { toastError } from '@/lib/notify';
import { usePermissions } from '@/features/auth/permissions';

interface OpenTransactionOptions {
  type: TxKind;
  defaults?: TransactionSheetState['defaults'];
}

interface TransactionActions {
  openTransaction: (options: OpenTransactionOptions) => void;
  openTransfer: (mode?: TransferMode) => void;
  edit: (tx: Transaction) => void;
  duplicate: (tx: Transaction) => void;
  remove: (tx: Transaction) => void;
  togglePaid: (tx: Transaction, paid: boolean) => void;
  /** Moves future installments of an installment purchase to today / the current invoice. */
  anticipate: (tx: Transaction) => void;
  /** Id of the transaction whose paid status is being saved. */
  savingPaidId: string | null;
  /** Why the workspace is read-only (viewer role or inactive subscription); null when writable. */
  readOnlyReason: string | null;
}

const Ctx = createContext<TransactionActions | null>(null);

const CLOSED_TX: TransactionSheetState = { open: false, mode: 'create', type: 'expense' };
const CLOSED_TRANSFER: TransferSheetState = { open: false, mode: 'transfer' };

export function TransactionActionsProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [txSheet, setTxSheet] = useState<TransactionSheetState>(CLOSED_TX);
  const [transferSheet, setTransferSheet] = useState<TransferSheetState>(CLOSED_TRANSFER);
  const [toDelete, setToDelete] = useState<Transaction | null>(null);
  const [payTarget, setPayTarget] = useState<Transaction | null>(null);
  const [anticipateTarget, setAnticipateTarget] = useState<Transaction | null>(null);
  const [savingPaidId, setSavingPaidId] = useState<string | null>(null);
  const txSheetUsed = useStickyTrue(txSheet.open);
  const transferSheetUsed = useStickyTrue(transferSheet.open);

  const deleteTx = useDeleteTransaction();
  const deleteTransfer = useDeleteTransfer();
  const setPaid = useSetPaid();
  const { readOnlyReason } = usePermissions();

  /** Every entry point (quick bar, palette, rows, dashboard) goes through here: read-only blocks it. */
  const blocked = useCallback(() => {
    if (!readOnlyReason) return false;
    toast.info(readOnlyReason, { id: 'read-only' });
    return true;
  }, [readOnlyReason]);

  const openTransaction = useCallback(
    (o: OpenTransactionOptions) => {
      if (blocked()) return;
      setTxSheet({ open: true, mode: 'create', type: o.type, defaults: o.defaults });
    },
    [blocked],
  );

  const openTransfer = useCallback(
    (mode: TransferMode = 'transfer') => {
      if (blocked()) return;
      setTransferSheet({ open: true, mode });
    },
    [blocked],
  );

  const edit = useCallback((tx: Transaction) => {
    if (blocked()) return;
    if (tx.type === 'transfer') {
      if (tx.transferKind === 'card_payment') {
        toast.info('Pagamentos de fatura são gerenciados na tela do cartão.');
        return;
      }
      setTransferSheet({ open: true, mode: 'transfer', transfer: tx });
      return;
    }
    setTxSheet({ open: true, mode: 'edit', type: tx.type, transaction: tx });
  }, [blocked]);

  const duplicate = useCallback(
    (tx: Transaction) => {
      if (tx.type === 'transfer' || blocked()) return;
      setTxSheet({ open: true, mode: 'duplicate', type: tx.type, transaction: tx });
    },
    [blocked],
  );

  const remove = useCallback(
    (tx: Transaction) => {
      if (!blocked()) setToDelete(tx);
    },
    [blocked],
  );

  const applyPaid = useCallback(
    async (tx: Transaction, paid: boolean, extra: PaymentExtra = {}) => {
      setSavingPaidId(tx.id);
      // Optimistic update of every cached transaction list.
      const snapshots = qc.getQueriesData<TransactionListResponse>({ queryKey: ['transactions'] });
      qc.setQueriesData<TransactionListResponse>({ queryKey: ['transactions'] }, (old) =>
        old?.items
          ? { ...old, items: old.items.map((t) => (t.id === tx.id ? { ...t, paid, overdue: paid ? false : t.overdue } : t)) }
          : old,
      );
      try {
        await setPaid.mutateAsync({
          id: tx.id,
          input: {
            paid,
            paidAt: paid ? (extra.paidAt ?? todayISO()) : null,
            accountId: extra.accountId ?? undefined,
            interest: extra.interest,
            fine: extra.fine,
            discount: extra.discount,
          },
        });
        const label = tx.type === 'income' ? (paid ? 'Recebimento confirmado' : 'Marcado como a receber') : paid ? 'Pagamento confirmado' : 'Marcado como pendente';
        const fees = (extra.interest ?? 0) + (extra.fine ?? 0);
        const description =
          fees > 0
            ? `Juros e multa de ${formatBRL(fees)} lançados.`
            : extra.discount
              ? `Desconto de ${formatBRL(extra.discount)} lançado em ${DISCOUNT_CATEGORY.discount}.`
              : undefined;
        toast.success(label, description ? { description } : undefined);
      } catch (error) {
        for (const [key, data] of snapshots) qc.setQueryData(key, data);
        toastError(error);
      } finally {
        setSavingPaidId(null);
      }
    },
    [qc, setPaid],
  );

  const togglePaid = useCallback(
    (tx: Transaction, paid: boolean) => {
      if (blocked()) return;
      if (tx.creditCardId && tx.type !== 'transfer') {
        toast.info('Compras no cartão são quitadas ao pagar a fatura.');
        return;
      }
      // No account yet, settled after the due date (interest and fine may be charged) or a fee with a
      // discount for paying on time (the discount is confirmed with the amount received): ask first.
      const late = tx.type !== 'transfer' && tx.date < todayISO();
      const discount = tx.type === 'income' && Boolean(tx.feeDiscountBps) && !late;
      if (paid && tx.type !== 'transfer' && (!tx.accountId || late || discount)) {
        setPayTarget(tx);
        return;
      }
      void applyPaid(tx, paid);
    },
    [applyPaid, blocked],
  );

  async function confirmDelete(scope: 'one' | 'future' | 'all') {
    if (!toDelete) return;
    try {
      if (toDelete.type === 'transfer') await deleteTransfer.mutateAsync(toDelete.id);
      else await deleteTx.mutateAsync({ id: toDelete.id, scope });
      toast.success('Lançamento excluído');
      setToDelete(null);
    } catch (error) {
      toastError(error);
    }
  }

  const anticipate = useCallback(
    (tx: Transaction) => {
      if (!blocked()) setAnticipateTarget(tx);
    },
    [blocked],
  );

  const value = useMemo<TransactionActions>(
    () => ({ openTransaction, openTransfer, edit, duplicate, remove, togglePaid, anticipate, savingPaidId, readOnlyReason }),
    [openTransaction, openTransfer, edit, duplicate, remove, togglePaid, anticipate, savingPaidId, readOnlyReason],
  );

  const isSeries = Boolean(toDelete?.recurrenceId) && toDelete?.type !== 'transfer';

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* Mounted on first use so their option queries don't run on every page load. */}
      {txSheetUsed ? (
        <TransactionSheet state={txSheet} onOpenChange={(open) => setTxSheet((s) => (open ? s : { ...s, open: false }))} />
      ) : null}
      {transferSheetUsed ? (
        <TransferSheet
          state={transferSheet}
          onOpenChange={(open) => setTransferSheet((s) => (open ? s : { ...s, open: false }))}
        />
      ) : null}
      <ScopeDialog
        open={Boolean(toDelete) && isSeries}
        onOpenChange={(o) => !o && setToDelete(null)}
        action="delete"
        kind={toDelete?.recurrenceKind}
        loading={deleteTx.isPending}
        onConfirm={(scope) => void confirmDelete(scope)}
      />
      <ConfirmDialog
        open={Boolean(toDelete) && !isSeries}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir lançamento?"
        description={
          toDelete ? `"${toDelete.description}" de ${formatBRL(toDelete.amount)} será excluído. Esta ação não pode ser desfeita.` : undefined
        }
        confirmLabel="Excluir"
        loading={deleteTx.isPending || deleteTransfer.isPending}
        onConfirm={() => void confirmDelete('one')}
      />
      <ConfirmPaymentDialog
        tx={payTarget}
        onClose={() => setPayTarget(null)}
        onConfirm={(extra) => {
          const tx = payTarget!;
          setPayTarget(null);
          void applyPaid(tx, true, extra);
        }}
      />
      <AnticipateDialog tx={anticipateTarget} onClose={() => setAnticipateTarget(null)} />
    </Ctx.Provider>
  );
}

/** Becomes true the first time `value` is true and stays true. */
function useStickyTrue(value: boolean): boolean {
  const [sticky, setSticky] = useState(value);
  if (value && !sticky) setSticky(true);
  return sticky || value;
}

interface PaymentExtra {
  accountId?: string | null;
  paidAt?: string | null;
  /** Late payment: interest (juros) and fine (multa) in cents. */
  interest?: number;
  fine?: number;
  /** Received by the due date: discount granted in cents (desconto por pontualidade). */
  discount?: number;
}

/**
 * Confirms a payment: the account when the transaction has none, the date and, when late, interest
 * and fine; a fee received by its due date gets the client's discount (desconto por pontualidade).
 */
function ConfirmPaymentDialog({
  tx,
  onClose,
  onConfirm,
}: {
  tx: Transaction | null;
  onClose: () => void;
  onConfirm: (extra: PaymentExtra) => void;
}) {
  const accounts = useAccounts();
  const [accountId, setAccountId] = useState('');
  const [paidAt, setPaidAt] = useState(todayISO());
  const [interest, setInterest] = useState(0);
  const [fine, setFine] = useState(0);
  const [giveDiscount, setGiveDiscount] = useState(true);
  const [discount, setDiscount] = useState(0);
  const income = tx?.type === 'income';
  const late = tx ? daysLate(tx.date, paidAt) : 0;
  const discountBps = income ? (tx?.feeDiscountBps ?? 0) : 0;
  const discountable = Boolean(tx && discountBps > 0 && earnsDiscount(tx.date, paidAt));
  const granted = discountable && giveDiscount ? Math.min(discount, tx?.amount ?? 0) : 0;
  const total = (tx?.amount ?? 0) + (late > 0 ? interest + fine : 0) - granted;

  // Each opening starts clean: today, no late fees and the client's discount suggested.
  useEffect(() => {
    if (!tx) return;
    setAccountId('');
    setPaidAt(todayISO());
    setInterest(0);
    setFine(0);
    setGiveDiscount(true);
    setDiscount(discountAmount(tx.amount, tx.type === 'income' ? tx.feeDiscountBps : 0));
  }, [tx]);

  function suggest() {
    if (!tx) return;
    const s = suggestLateFees(tx.amount, tx.date, paidAt);
    setInterest(s.interest);
    setFine(s.fine);
  }

  return (
    <Modal
      open={Boolean(tx)}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={income ? 'Confirmar recebimento' : 'Confirmar pagamento'}
      description={tx ? `${tx.description} · ${formatBRL(tx.amount)} · venc. ${formatDateBR(tx.date)}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              onConfirm({
                accountId: tx?.accountId ? undefined : accountId || null,
                paidAt,
                ...(late > 0 ? { interest, fine } : {}),
                ...(discountable ? { discount: granted } : {}),
              })
            }
          >
            Confirmar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {tx && !tx.accountId ? (
          <Field label={income ? 'Receber em qual conta?' : 'Pagar com qual conta?'} hint="O saldo da conta será atualizado.">
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
        <Field label={income ? 'Recebido em' : 'Pago em'}>
          <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </Field>
        {late > 0 ? (
          <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-soft/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-fg">
                {late === 1 ? '1 dia de atraso' : `${late} dias de atraso`}
                <span className="block text-caption font-normal text-muted">
                  {income ? 'Lance os juros e a multa cobrados do cliente, se houver.' : 'Lance os juros e a multa pagos, se houver.'}
                </span>
              </p>
              <Button type="button" variant="outline" size="sm" onClick={suggest}>
                Sugerir 2% + 1% a.m.
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Juros">
                <MoneyInput value={interest} onChange={setInterest} />
              </Field>
              <Field label="Multa">
                <MoneyInput value={fine} onChange={setFine} />
              </Field>
            </div>
            {interest + fine > 0 ? (
              <p className="flex items-center justify-between border-t border-border pt-2 text-[13px]">
                <span className="text-muted">{income ? 'Total recebido' : 'Total pago'}</span>
                <span className="tabular font-semibold text-fg">{formatBRL(total)}</span>
              </p>
            ) : null}
          </div>
        ) : null}
        {discountable ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted p-3">
            <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-fg">
              <Checkbox checked={giveDiscount} onCheckedChange={setGiveDiscount} aria-describedby="discount-hint" />
              <span>
                <span className="font-semibold">Conceder desconto de {formatBps(discountBps)}</span>
                <span id="discount-hint" className="block text-caption text-muted">
                  Recebido até o vencimento ({formatDateBR(tx!.date)}). O desconto vira uma despesa em {DISCOUNT_CATEGORY.name} ›{' '}
                  {DISCOUNT_CATEGORY.discount}.
                </span>
              </span>
            </label>
            {giveDiscount ? (
              <Field label="Valor do desconto">
                <MoneyInput value={discount} onChange={setDiscount} />
              </Field>
            ) : null}
            <p className="flex items-center justify-between border-t border-border pt-2 text-[13px]">
              <span className="text-muted">Valor recebido</span>
              <span className="tabular font-semibold text-fg">{formatBRL(total)}</span>
            </p>
          </div>
        ) : tx && discountBps > 0 && late > 0 ? (
          <p className="text-caption text-muted">
            O desconto de {formatBps(discountBps)} valia só para recebimento até {formatDateBR(tx.date)}.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/** Anticipates the last N future installments to today (on a card: the current open invoice). */
function AnticipateDialog({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) {
  const anticipate = useAnticipateInstallments();
  const remaining = tx?.installmentTotal && tx.installmentNumber ? tx.installmentTotal - tx.installmentNumber : 0;
  const [count, setCount] = useState(String(remaining));
  const n = Math.min(Math.max(Number(count) || 0, 0), remaining);
  const isCard = Boolean(tx?.creditCardId);

  async function confirm() {
    if (!tx || n < 1) return;
    try {
      const moved = await anticipate.mutateAsync({ id: tx.id, input: { count: n } });
      const where = isCard && moved[0]?.invoiceMonth ? ` para a fatura de ${formatMonthKey(moved[0].invoiceMonth, 'short')}` : ' para hoje';
      toast.success(`${moved.length} ${moved.length === 1 ? 'parcela antecipada' : 'parcelas antecipadas'}${where}`);
      onClose();
    } catch (error) {
      toastError(error);
    }
  }

  return (
    <Modal
      open={Boolean(tx)}
      onOpenChange={(o) => {
        if (!o) onClose();
        else setCount(String(remaining));
      }}
      title="Antecipar parcelas"
      description={tx ? `${tx.description} · parcela ${tx.installmentNumber}/${tx.installmentTotal}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void confirm()} loading={anticipate.isPending} disabled={n < 1}>
            Antecipar {n > 0 ? `${n} ${n === 1 ? 'parcela' : 'parcelas'}` : ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-muted">
          {isCard
            ? `As parcelas escolhidas saem dos próximos meses e entram na fatura atual do ${tx?.creditCard?.name ?? 'cartão'}.`
            : 'As parcelas escolhidas saem dos próximos meses e passam a vencer hoje.'}{' '}
          Como nos bancos, as últimas parcelas são antecipadas primeiro.
        </p>
        <Field label="Quantas parcelas antecipar?" hint={`Até ${remaining} ${remaining === 1 ? 'parcela futura' : 'parcelas futuras'}`}>
          <Input type="number" min={1} max={remaining} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
        </Field>
        {tx && n > 0 ? (
          <p className="rounded-md bg-primary-soft px-3 py-2 text-[13px] font-semibold text-primary-soft-fg">
            {n}x de {formatBRL(tx.amount)} · total {formatBRL(tx.amount * n)}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

export function useTransactionActions(): TransactionActions {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTransactionActions must be used inside TransactionActionsProvider');
  return ctx;
}
