import { Copy, CreditCard, Ellipsis, FastForward, FileDown, Landmark, Pencil, Plus, ThumbsDown, ThumbsUp, Trash2, UsersRound } from 'lucide-react';
import {
  FREQUENCY_LABELS,
  LATE_FEE_KIND_LABELS,
  TRANSACTION_ORIGIN_LABELS,
  TRANSFER_KIND_LABELS,
  diffInDays,
  formatBRL,
  formatBps,
  formatDateBR,
  formatMonthKey,
  todayISO,
  type Transaction,
} from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { BankLogo } from '@/components/ui/bank-logo';
import { Button } from '@/components/ui/button';
import { CategoryIcon } from '@/components/ui/category-icon';
import { Money } from '@/components/ui/misc';
import { PaidToggle } from '@/components/ui/paid-toggle';
import { Tooltip } from '@/components/ui/tooltip';
import { WriteGate } from '@/features/auth/permissions';
import { useEmployeesDialog } from '@/features/fee-charges/employees-dialog';
import { competenceLabel, isMonthKey, lateFeesSplit, lateFeesTotal, plural } from '@/features/fee-charges/fee-charges';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useTransactionActions } from '../transaction-actions';
import { transactionOrigin } from '../origin';

export function SeriesBadge({ tx }: { tx: Transaction }) {
  if (tx.recurrenceKind === 'installment' && tx.installmentNumber)
    return (
      <Badge tone="brand" title="Parcela">
        {tx.installmentNumber}/{tx.installmentTotal}
      </Badge>
    );
  if (tx.recurrenceKind === 'fixed')
    return <Badge tone="brand">{tx.frequency && tx.frequency !== 'monthly' ? `Fixa · ${FREQUENCY_LABELS[tx.frequency]}` : 'Fixa'}</Badge>;
  if (tx.recurrenceKind === 'recurring')
    return <Badge tone="neutral">{tx.frequency ? FREQUENCY_LABELS[tx.frequency] : 'Recorrente'}</Badge>;
  return null;
}

/** "Importado" / "Open Finance" for rows that did not come from the form (tolerates APIs without `origin`). */
export function OriginBadge({ tx }: { tx: Transaction }) {
  const origin = transactionOrigin(tx);
  if (origin === 'manual') return null;
  return (
    <Badge
      tone="neutral"
      title={origin === 'file' ? 'Criado por importação de arquivo (OFX/CSV)' : 'Sincronizado do banco via Open Finance'}
      className="shrink-0 px-1.5 @md:px-2"
    >
      {origin === 'file' ? <FileDown aria-hidden /> : <Landmark aria-hidden />}
      {/* Icon only in narrow rows (mobile); the label stays for screen readers. */}
      <span className="sr-only @md:not-sr-only">{TRANSACTION_ORIGIN_LABELS[origin]}</span>
    </Badge>
  );
}

/**
 * Rows made by "Gerar honorários" ("Ref. 10/2026", "Folha · 5 empregados") and interest/fine rows of a
 * late payment ("Juros", "Multa"). Tolerates APIs that don't send these fields yet.
 */
export function FeeBadges({ tx }: { tx: Transaction }) {
  return (
    <>
      {tx.feeKind === 'fee' && isMonthKey(tx.feeCompetence) ? (
        // The description already says "ref. MM/AAAA": narrow rows keep the room for it.
        <Badge tone="neutral" title={`Honorário da competência ${competenceLabel(tx.feeCompetence)}`} className="hidden shrink-0 @md:inline-flex">
          Ref. {competenceLabel(tx.feeCompetence)}
        </Badge>
      ) : null}
      {tx.feeKind === 'employees' ? (
        <Badge tone="brand" className="shrink-0" title="Cobrança de empregados (folha de pagamento)">
          <UsersRound aria-hidden />
          {tx.employees != null ? (
            <>
              {/* Narrow rows: icon + count; the full label stays for screen readers. */}
              <span className="@md:hidden" aria-hidden>
                {tx.employees.toLocaleString('pt-BR')}
              </span>
              <span className="sr-only @md:not-sr-only">Folha · {plural(tx.employees, 'empregado', 'empregados')}</span>
            </>
          ) : (
            'Folha'
          )}
        </Badge>
      ) : null}
      {tx.lateFeeKind ? (
        <Badge tone="warning" className="shrink-0" title="Cobrado por pagamento em atraso">
          {LATE_FEE_KIND_LABELS[tx.lateFeeKind]}
        </Badge>
      ) : null}
      {tx.discountOf ? (
        <Badge tone="neutral" className="shrink-0" title="Desconto concedido por pagamento até o vencimento">
          Desconto
        </Badge>
      ) : null}
      {/* Open fee with a discount for paying by the due date. */}
      {tx.feeDiscountBps && !tx.paid ? (
        <Badge tone="neutral" className="hidden shrink-0 @md:inline-flex" title={`Desconto de ${formatBps(tx.feeDiscountBps)} se pago até ${formatDateBR(tx.date)}`}>
          {formatBps(tx.feeDiscountBps)} até o venc.
        </Badge>
      ) : null}
    </>
  );
}

/** "− desconto R$ X" on a fee received by its due date with the client's discount. */
export function DiscountBadge({ tx }: { tx: Transaction }) {
  if (!tx.discount) return null;
  return (
    <Badge tone="neutral" className="shrink-0" title="Desconto concedido por pagamento até o vencimento">
      <span className="@md:hidden" aria-hidden>
        − {formatBRL(tx.discount)}
      </span>
      <span className="sr-only @md:not-sr-only">− desconto {formatBRL(tx.discount)}</span>
    </Badge>
  );
}

/** "+ juros/multa R$ X" on a row settled late; the tooltip (and screen readers) get the split. */
export function LateFeesBadge({ tx }: { tx: Transaction }) {
  if (!tx.lateFees) return null;
  const total = lateFeesTotal(tx.lateFees);
  if (total <= 0) return null;
  const split = lateFeesSplit(tx.lateFees);
  return (
    <Tooltip content={split}>
      <Badge tone="warning" className="shrink-0">
        {/* Narrow rows: just the amount, so the description keeps its room. */}
        <span className="@md:hidden" aria-hidden>
          + {formatBRL(total)}
        </span>
        <span className="sr-only @md:not-sr-only">+ juros/multa {formatBRL(total)}</span>
        <span className="sr-only"> ({split})</span>
      </Badge>
    </Tooltip>
  );
}

const daysText = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
/** "05/10" in the current year, "05/10/25" otherwise (inline labels of narrow rows). */
const shortDate = (date: string) => {
  const [y, m, d] = date.split('-');
  return y === todayISO().slice(0, 4) ? `${d}/${m}` : `${d}/${m}/${y!.slice(2)}`;
};

/**
 * Due status of a row. Under the due date (`beside`) it never repeats the date: "Vence em 9 dias",
 * "Pago no vencimento"; inline (narrow rows, no date column) it carries the date instead.
 */
export function DueLabel({ tx, beside = false }: { tx: Transaction; beside?: boolean }) {
  if (tx.creditCardId && tx.type !== 'transfer') {
    return (
      <span className="text-xs text-muted">
        {tx.paid ? 'Fatura paga' : tx.invoiceMonth ? `Fatura ${formatMonthKey(tx.invoiceMonth, 'short')}` : 'No cartão'}
      </span>
    );
  }
  if (tx.paid) {
    const verb = tx.type === 'income' ? 'Recebido' : tx.type === 'transfer' ? 'Efetivada' : 'Pago';
    const when = !tx.paidAt ? '' : !beside ? ` em ${shortDate(tx.paidAt)}` : tx.paidAt === tx.date ? ' no vencimento' : ` em ${formatDateBR(tx.paidAt)}`;
    return <span className="text-xs text-muted">{verb}{when}</span>;
  }
  const days = diffInDays(tx.date, todayISO());
  if (tx.overdue || days < 0) return <span className="text-xs font-semibold text-danger">Venceu há {daysText(Math.abs(days))}</span>;
  if (days === 0) return <span className="text-xs font-semibold text-warning">Vence hoje</span>;
  if (days <= 5) return <span className="text-xs font-medium text-warning">Vence em {daysText(days)}</span>;
  return <span className="text-xs text-muted">Vence em {beside ? daysText(days) : shortDate(tx.date)}</span>;
}

export function TxIcon({ tx, size = 'md' }: { tx: Transaction; size?: 'sm' | 'md' }) {
  if (tx.type === 'transfer') {
    return <CategoryIcon icon={tx.transferKind === 'investment' || tx.transferKind === 'redemption' ? 'trending-up' : tx.transferKind === 'card_payment' ? 'credit-card' : 'landmark'} color="#3F64BE" size={size} />;
  }
  return <CategoryIcon icon={tx.subcategory?.icon ?? tx.category?.icon ?? 'tag'} color={tx.category?.color ?? '#9A9EA5'} size={size} />;
}

export function SourceLabel({ tx }: { tx: Transaction }) {
  if (tx.creditCard) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
        <BankLogo bank={tx.creditCard.bank} size="xs" />
        <span className="truncate">{tx.creditCard.name}</span>
        {tx.invoiceMonth ? <span className="shrink-0 text-subtle">· fatura {formatMonthKey(tx.invoiceMonth, 'short')}</span> : null}
      </span>
    );
  }
  if (tx.type === 'transfer') {
    return (
      <span className="truncate text-xs text-muted">
        {tx.account?.name ?? '—'} → {tx.toAccount?.name ?? '—'}
      </span>
    );
  }
  if (tx.account) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
        <BankLogo bank={tx.account.bank} color={tx.account.color} size="xs" />
        <span className="truncate">{tx.account.name}</span>
      </span>
    );
  }
  return <span className="text-xs text-subtle">Sem conta</span>;
}

interface TransactionRowProps {
  tx: Transaction;
  /** Signed amount to show instead of tx.amount (statement). */
  amount?: number;
  trailing?: React.ReactNode;
  showDue?: boolean;
  muted?: boolean;
  /** `compact`: the same row with less padding and smaller status/icon, for dashboard cards. */
  density?: 'default' | 'compact';
}

/** Responsive list row used across lists (payables, receivables, dashboard, statement). */
export function TransactionRow({ tx, amount, trailing, showDue = true, muted, density = 'default' }: TransactionRowProps) {
  const compact = density === 'compact';
  const detail = [tx.category ? `${tx.category.name}${tx.subcategory ? ` · ${tx.subcategory.name}` : ''}` : null, tx.contact?.name]
    .filter(Boolean)
    .join(' · ');
  const actions = useTransactionActions();
  const signed = amount ?? (tx.type === 'expense' ? -tx.amount : tx.amount);
  const isCardPurchase = Boolean(tx.creditCardId) && tx.type !== 'transfer';
  // Read-only workspaces (viewer / inactive subscription): the row is informational only.
  const readOnly = Boolean(actions.readOnlyReason);
  const Main = readOnly ? 'div' : 'button';
  // Generated fees: "+ Empregados" (chip on wide rows, item in the menu) opens one dialog per row.
  const employees = useEmployeesDialog(tx);
  const isFee = tx.feeKind === 'fee';
  return (
    <div className="@container">
    <div
      className={cn(
        'group flex items-center gap-3 rounded-lg transition-colors hover:bg-surface-muted',
        compact ? 'px-2 py-2' : 'px-3 py-3 @lg:px-4',
        muted && 'opacity-70',
      )}
    >
      {tx.type !== 'transfer' ? (
        isCardPurchase ? (
          <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-bg-subtle text-muted', compact ? 'size-8' : 'size-9')} title="Quitado ao pagar a fatura">
            <CreditCard className="size-4" />
          </span>
        ) : (
          <PaidToggle
            size={compact ? 'sm' : 'md'}
            paid={tx.paid}
            kind={tx.type}
            loading={actions.savingPaidId === tx.id}
            disabled={Boolean(actions.readOnlyReason)}
            disabledReason={actions.readOnlyReason ?? undefined}
            onToggle={(paid) => actions.togglePaid(tx, paid)}
          />
        )
      ) : (
        <PaidToggle size={compact ? 'sm' : 'md'} paid={tx.paid} kind="transfer" disabled disabledReason={tx.paid ? 'Efetivada' : 'Agendada'} onToggle={() => undefined} />
      )}
      <Main
        {...(readOnly ? {} : { type: 'button' as const, onClick: () => actions.edit(tx) })}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {/* Phones: the status toggle is enough; the category icon gives its room to the description. */}
        <span className="hidden @sm:contents">
          <TxIcon tx={tx} size={compact ? 'sm' : 'md'} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-[4.5rem] truncate text-sm font-semibold text-fg">{tx.description}</span>
            {/* Labels the description already implies (Fixa, Ref., Juros…) give way on phones. */}
            <span className="hidden shrink-0 items-center gap-1.5 @md:flex">
              <SeriesBadge tx={tx} />
              {tx.splitGroupId ? <Badge tone="neutral" title="Valor dividido entre categorias">Dividido</Badge> : null}
              {tx.type === 'transfer' && tx.transferKind ? <Badge tone="brand">{TRANSFER_KIND_LABELS[tx.transferKind]}</Badge> : null}
              <FeeBadges tx={tx} />
            </span>
            <LateFeesBadge tx={tx} />
            <DiscountBadge tx={tx} />
            <OriginBadge tx={tx} />
          </span>
          {detail ? <span className="mt-0.5 block truncate text-xs text-muted">{detail}</span> : null}
          {showDue ? (
            // Narrow rows have no date column: the due status gets its own line (compact rows up to a
            // wider width, to leave room for the description).
            <span className={cn('mt-0.5 block truncate', compact ? '@2xl:hidden' : '@xl:hidden')}>
              <DueLabel tx={tx} />
            </span>
          ) : null}
        </span>
      </Main>
      {isFee ? (
        // Right after the flexible column, so the fixed columns (account, due date, amount) stay aligned.
        <div className="hidden shrink-0 @xl:block">
          <WriteGate>
            <Button
              variant="outline"
              size="xs"
              className="rounded-full px-2.5 [&_svg]:size-3.5"
              onClick={employees.show}
              aria-label={`+ Empregados · ${tx.contact?.name ?? tx.description}`}
            >
              <Plus aria-hidden /> Empregados
            </Button>
          </WriteGate>
        </div>
      ) : null}
      <div className="hidden w-44 min-w-0 @3xl:block">
        <SourceLabel tx={tx} />
      </div>
      {showDue ? (
        <div className={cn('hidden w-36 text-right', compact ? '@2xl:block' : '@xl:block')}>
          <p className="text-[13px] font-medium text-fg tabular">{formatDateBR(tx.date)}</p>
          <DueLabel tx={tx} beside />
        </div>
      ) : null}
      <div className="shrink-0 text-right @md:w-28 @lg:w-32">
        <Money value={signed} tone={tx.type === 'transfer' && amount === undefined ? 'neutral' : undefined} signed className="text-[15px]" />
        {trailing}
      </div>
      <RowMenu tx={tx} onAddEmployees={isFee ? employees.show : undefined} />
    </div>
    {employees.element}
    </div>
  );
}

interface RowMenuProps {
  tx: Transaction;
  /** Opens the row's "+ Empregados" dialog; without it (compact rows) the menu opens its own. */
  onAddEmployees?: () => void;
}

export function RowMenu({ tx, onAddEmployees }: RowMenuProps) {
  const actions = useTransactionActions();
  const ownEmployees = useEmployeesDialog(tx);
  const isCardPurchase = Boolean(tx.creditCardId) && tx.type !== 'transfer';
  // Every item changes data; keep the column width so rows stay aligned.
  if (actions.readOnlyReason) return <span className="size-8 shrink-0" aria-hidden />;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted opacity-70 transition hover:bg-bg-subtle hover:text-fg group-hover:opacity-100"
            aria-label={`Ações de ${tx.description}`}
          >
            <Ellipsis className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem icon={<Pencil />} onSelect={() => actions.edit(tx)}>
            Editar
          </DropdownMenuItem>
          {tx.feeKind === 'fee' ? (
            <DropdownMenuItem icon={<UsersRound />} onSelect={onAddEmployees ?? ownEmployees.show}>
              + Empregados
            </DropdownMenuItem>
          ) : null}
          {tx.type !== 'transfer' ? (
            <DropdownMenuItem icon={<Copy />} onSelect={() => actions.duplicate(tx)}>
              Duplicar
            </DropdownMenuItem>
          ) : null}
          {tx.type !== 'transfer' && !isCardPurchase ? (
            <DropdownMenuItem
              icon={tx.paid ? <ThumbsDown /> : <ThumbsUp />}
              onSelect={() => actions.togglePaid(tx, !tx.paid)}
            >
              {tx.paid
                ? tx.type === 'income'
                  ? 'Marcar como a receber'
                  : 'Marcar como pendente'
                : tx.type === 'income'
                  ? 'Marcar como recebido'
                  : 'Marcar como pago'}
            </DropdownMenuItem>
          ) : null}
          {tx.recurrenceKind === 'installment' && (tx.installmentNumber ?? 0) < (tx.installmentTotal ?? 0) ? (
            <DropdownMenuItem icon={<FastForward />} onSelect={() => actions.anticipate(tx)}>
              Antecipar parcelas
            </DropdownMenuItem>
          ) : null}
          {tx.transferKind !== 'card_payment' ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Trash2 />} tone="danger" onSelect={() => actions.remove(tx)}>
                Excluir
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {onAddEmployees ? null : ownEmployees.element}
    </>
  );
}
