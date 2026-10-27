import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TriangleAlert } from 'lucide-react';
import {
  FEE_CATEGORY,
  addMonthKey,
  endOfMonth,
  formatBRL,
  formatDateBR,
  monthKey,
  startOfMonth,
  type Transaction,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError, errorMessage } from '@/lib/api';
import { toastError } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { useTransactions } from '@/features/transactions/api';
import { useFeeEmployees, useFeeEmployeesPreview } from './api';
import {
  MAX_EMPLOYEES,
  competenceLabel,
  employeesAction,
  employeesFormula,
  findEmployeesCharge,
  isMonthKey,
  parseEmployees,
  plural,
  transactionsInCacheData,
} from './fee-charges';
import { useDebounced } from './use-debounced';

/** Competence of a generated fee; older rows without it refer to the month before the due date. */
function feeCompetenceOf(fee: Transaction): string {
  return isMonthKey(fee.feeCompetence) ? fee.feeCompetence : addMonthKey(monthKey(fee.date), -1);
}

/**
 * Open/close state of the "+ Empregados" dialog of one fee row. The dialog is mounted only while
 * open, so rows don't run its lookups.
 */
export function useEmployeesDialog(fee: Transaction): { show: () => void; element: ReactNode } {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  return { show, element: open ? <EmployeesDialog fee={fee} open onOpenChange={setOpen} /> : null };
}

interface EmployeesDialogProps {
  /** A row made by "Gerar honorários" (`feeKind === 'fee'`). */
  fee: Transaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "+ Empregados": employees × the client's employee fee, as its own receivable due with the fee. */
export function EmployeesDialog({ fee, open, onOpenChange }: EmployeesDialogProps) {
  const client = fee.contact?.name ?? fee.description;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Lançar empregados"
      description={`${client} · honorários ref. ${competenceLabel(feeCompetenceOf(fee))} · venc. ${formatDateBR(fee.date)}`}
    >
      {open ? <EmployeesForm fee={fee} onClose={() => onOpenChange(false)} /> : null}
    </Modal>
  );
}

/**
 * The current employee charge of `fee`: whatever the cached lists/statement already hold, confirmed by
 * a small lookup of the client's receivables in the due month. `undefined` = not known (yet).
 */
function useExistingCharge(fee: Transaction): Transaction | null | undefined {
  const qc = useQueryClient();
  const cached = useMemo(() => {
    const data = [...qc.getQueriesData({ queryKey: ['transactions'] }), ...qc.getQueriesData({ queryKey: ['statement'] })];
    return findEmployeesCharge(
      fee.id,
      data.flatMap(([, d]) => transactionsInCacheData(d)),
    );
  }, [qc, fee.id]);
  const lookup = useTransactions({
    type: 'income',
    from: startOfMonth(fee.date),
    to: endOfMonth(fee.date),
    contactId: fee.contactId ?? undefined,
    pageSize: 200,
  });
  if (lookup.isSuccess && !lookup.isPlaceholderData) {
    // A page that is not the whole set can't prove there is none.
    const found = findEmployeesCharge(fee.id, lookup.data.items);
    return found ?? cached ?? (lookup.data.total <= lookup.data.items.length ? null : undefined);
  }
  return cached ?? undefined;
}

function EmployeesForm({ fee, onClose }: { fee: Transaction; onClose: () => void }) {
  const competence = competenceLabel(feeCompetenceOf(fee));
  const existing = useExistingCharge(fee);
  // null = untouched: shows the count of the existing charge once it is known.
  const [input, setInput] = useState<string | null>(null);
  const value = input ?? (existing?.employees != null ? String(existing.employees) : '');
  const employees = parseEmployees(value);
  const invalid = value.trim() !== '' && employees === null;

  const debounced = useDebounced(employees, 300);
  const preview = useFeeEmployeesPreview(fee.id, debounced);
  const save = useFeeEmployees();
  const [saveError, setSaveError] = useState<string | null>(null);

  const action = employeesAction(employees, existing);
  const priced = employees !== null && employees > 0;
  const current = priced && debounced === employees && preview.isSuccess && !preview.isPlaceholderData && !preview.isFetching;
  const paidCharge = existing?.paid === true;
  // Same headcount and amount as the charge already made: nothing to save.
  const unchanged = action === 'update' && current && existing?.employees === employees && preview.data?.amount === existing.amount;
  const canConfirm =
    !paidCharge && !unchanged && !save.isPending && (action === 'remove' || ((action === 'create' || action === 'update') && current));

  async function confirm() {
    if (!canConfirm || employees === null) return;
    setSaveError(null);
    try {
      const result = await save.mutateAsync({ feeId: fee.id, employees });
      if (employees === 0) toast.success('Cobrança de empregados removida');
      else
        toast.success(action === 'update' ? 'Cobrança de empregados atualizada' : 'Cobrança de empregados lançada', {
          description: `${employeesFormula(result.employees, result.rate, result.amount)} · venc. ${formatDateBR(result.transaction?.date ?? fee.date)}`,
        });
      onClose();
    } catch (error) {
      // 422: no employee fee on the client, or the charge was already received — explained in place.
      if (error instanceof ApiRequestError && error.status === 422) setSaveError(error.message);
      else toastError(error);
    }
  }

  const confirmLabel =
    action === 'remove'
      ? 'Remover cobrança'
      : unchanged
        ? 'Sem alterações'
        : current && preview.data
          ? `${action === 'update' ? 'Atualizar' : 'Lançar'} ${formatBRL(preview.data.amount)}`
          : action === 'update'
            ? 'Atualizar cobrança'
            : 'Lançar cobrança';

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void confirm();
      }}
    >
      <Field
        label={`Quantos empregados a empresa tinha em ${competence}?`}
        error={invalid ? `Informe um número inteiro de 0 a ${MAX_EMPLOYEES.toLocaleString('pt-BR')}` : undefined}
        hint={
          existing
            ? `Já lançado: ${plural(existing.employees ?? 0, 'empregado', 'empregados')} · ${formatBRL(existing.amount)}${existing.paid ? ' · recebido' : ''}. Salvar substitui; 0 remove.`
            : 'Valor = empregados × taxa por empregado do cadastro do cliente.'
        }
      >
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_EMPLOYEES}
          step={1}
          autoFocus
          placeholder="0"
          value={value}
          onChange={(e) => {
            setInput(e.target.value);
            setSaveError(null);
          }}
          className="tabular"
        />
      </Field>

      <div aria-live="polite">
        {paidCharge ? (
          <Notice tone="warning">A cobrança de empregados já foi recebida: reabra o recebimento para alterá-la.</Notice>
        ) : saveError ? (
          <Notice tone="danger">{saveError}</Notice>
        ) : action === 'remove' ? (
          <Notice tone="danger" alert={false}>
            {existing
              ? `A cobrança de ${plural(existing.employees ?? 0, 'empregado', 'empregados')} (${formatBRL(existing.amount)}) será excluída.`
              : 'Se houver cobrança de empregados para este honorário, ela será excluída.'}
          </Notice>
        ) : employees === 0 ? (
          <p className="text-[13px] text-muted">Com 0 empregados nada é lançado.</p>
        ) : priced ? (
          <EmployeesPreview preview={preview} dimmed={!current} dueDate={fee.date} />
        ) : null}
      </div>

      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant={action === 'remove' ? 'danger' : 'primary'} loading={save.isPending} disabled={!canConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </form>
  );
}

function EmployeesPreview({
  preview,
  dimmed,
  dueDate,
}: {
  preview: ReturnType<typeof useFeeEmployeesPreview>;
  dimmed: boolean;
  dueDate: string;
}) {
  if (preview.isError) {
    const unprocessable = preview.error instanceof ApiRequestError && preview.error.status === 422;
    return (
      <Notice tone="danger" action={unprocessable ? undefined : { label: 'Tentar novamente', onClick: () => void preview.refetch() }}>
        {errorMessage(preview.error)}
      </Notice>
    );
  }
  if (!preview.data) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-3" aria-busy="true" aria-label="Calculando">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-5 w-48" />
      </div>
    );
  }
  const p = preview.data;
  return (
    <div className={cn('rounded-lg border border-border bg-surface-muted p-3 transition-opacity', dimmed && 'opacity-60')} aria-busy={dimmed}>
      <p className="text-caption text-muted">
        {FEE_CATEGORY.name} › {FEE_CATEGORY.employees} · venc. {formatDateBR(dueDate)}
      </p>
      <p className="tabular mt-1 text-[15px] font-semibold text-fg">{employeesFormula(p.employees, p.rate, p.amount)}</p>
    </div>
  );
}

function Notice({
  tone,
  children,
  action,
  alert = true,
}: {
  tone: 'danger' | 'warning';
  children: ReactNode;
  action?: { label: string; onClick: () => void };
  /** Errors interrupt (role=alert); a confirmation note is only announced politely. */
  alert?: boolean;
}) {
  return (
    <div
      role={alert ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-lg border p-3 text-[13px]',
        tone === 'danger' ? 'border-danger/25 bg-danger-soft/60 text-danger' : 'border-warning/30 bg-warning-soft/60 text-warning',
      )}
    >
      <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <p className="font-medium">{children}</p>
        {action ? (
          <Button type="button" variant="outline" size="xs" onClick={action.onClick}>
            {action.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
