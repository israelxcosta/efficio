import { useMemo } from 'react';
import { Link } from 'react-router';
import { CalendarClock, CreditCard, HandCoins, Users } from 'lucide-react';
import { formatBRL, formatDateBR, todayISO, type DashboardResponse } from '@effinance/shared';
import { agingBuckets, rankDebtors, type AgingBucket } from '@/components/charts/chart-scale';
import { BankLogo } from '@/components/ui/bank-logo';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress-bar';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { useElementSize } from '@/lib/use-element-size';
import { cn, pluralize } from '@/lib/utils';
import { OVERDUE_RECEIVABLES_HREF } from '../layout/alerts';
import type { DashboardPrefs, WidgetProps } from '../layout/types';
import { FitList, WidgetCard } from '../layout/widget-card';
import { OVERDUE_LIST_LIMIT, useOpenReceivables, useOverdueReceivables } from './data';
import { TransactionRow } from '@/features/transactions/components/transaction-row';
import { BodyEmpty, ListSkeleton } from './shared';

const LIMIT_LABEL = OVERDUE_LIST_LIMIT.toLocaleString('pt-BR');

// ---------------------------------------------------------------------------
// Inadimplência
// ---------------------------------------------------------------------------

/** Band row heights (px): label + meta line, and with its own bar below. Below the first, one line. */
const BAND_ROW_TWO_LINES_PX = 42;
const BAND_ROW_WITH_BAR_PX = 56;
/** Body width (px) from which the bands sit side by side as columns (the card's @2xl). */
const BANDS_AS_COLUMNS_PX = 672;

const AGING_BG: Record<AgingBucket['key'], string> = {
  ate30: 'bg-aging-1',
  ate60: 'bg-aging-2',
  mais60: 'bg-aging-3',
};

/** Column bars on wide cards: tinted fill with a solid cap (solid blocks that big get heavy). */
const AGING_COLUMN: Record<AgingBucket['key'], string> = {
  ate30: 'bg-aging-1/30 border-aging-1',
  ate60: 'bg-aging-2/20 border-aging-2',
  mais60: 'bg-aging-3/20 border-aging-3',
};

/** Overdue receivables: total, share of what is still to receive and the aging bands. */
export function OverdueWidget({ alert }: WidgetProps) {
  const overdue = useOverdueReceivables();
  const open = useOpenReceivables();
  const bandsBox = useElementSize<HTMLUListElement>();
  const data = overdue.data;
  const today = todayISO();
  const buckets = useMemo(() => (data ? agingBuckets(data.items, today) : []), [data, today]);

  let body;
  if (overdue.isPending) {
    body = (
      <div className="flex min-h-0 flex-1 flex-col gap-3" aria-busy="true" aria-label="Carregando">
        <Skeleton className="h-7 w-36 shrink-0" />
        <Skeleton className="h-2.5 w-full shrink-0" />
        <Skeleton className="min-h-0 w-full flex-1" />
      </div>
    );
  } else if (overdue.isError) {
    body = <ErrorState error={overdue.error} onRetry={() => overdue.refetch()} className="p-3" />;
  } else if (!data || data.total === 0) {
    body = <BodyEmpty icon={<HandCoins />} title="Nenhum recebimento vencido em aberto." />;
  } else {
    const total = data.summary.overdue;
    const count = data.total;
    const toReceive = open.data?.summary.pending ?? 0;
    const pct = toReceive > 0 ? Math.min(100, Math.round((total / toReceive) * 100)) : null;
    // Bands are summed from the listed items (the oldest ones when truncated).
    const banded = buckets.reduce((a, b) => a + b.amount, 0);
    const largest = Math.max(...buckets.map((b) => b.amount), 1);
    const share = (b: AgingBucket) => (banded > 0 ? b.amount / banded : 0);
    // The rows adapt to the room the card leaves them: columns with growing bars on wide cards,
    // otherwise stacked rows with one line, two lines or two lines plus a bar.
    const columns = bandsBox.width >= BANDS_AS_COLUMNS_PX;
    const rowHeight = bandsBox.height / 3;
    const oneLine = !columns && bandsBox.height > 0 && rowHeight < BAND_ROW_TWO_LINES_PX;
    const rowBars = !columns && rowHeight >= BAND_ROW_WITH_BAR_PX;
    body = (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className="text-kpi font-semibold tracking-tight text-danger tabular">{formatBRL(total)}</span>
          <span className="text-caption text-muted">
            {pct !== null ? `${pct}% do total a receber até o fim do mês · ` : ''}
            {pluralize(count, 'título', 'títulos')}
          </span>
        </div>
        <div
          role="img"
          aria-label={`Vencido por faixa de atraso: ${buckets.map((b) => `${b.label.toLowerCase()} ${formatBRL(b.amount)}`).join(', ')}`}
          className="mt-3 flex h-2.5 w-full shrink-0 gap-0.5 overflow-hidden rounded-full bg-bg-subtle"
        >
          {buckets
            .filter((b) => b.amount > 0)
            .map((b) => (
              <span key={b.key} className={cn('h-full min-w-1', AGING_BG[b.key])} style={{ width: `${share(b) * 100}%` }} />
            ))}
        </div>
        <ul
          ref={bandsBox.ref}
          className={cn(
            'flex min-h-0 flex-1 overflow-hidden',
            columns ? 'mt-4 flex-row gap-6' : 'mt-2 flex-col divide-y divide-border',
          )}
        >
          {buckets.map((b) => {
            const meta = `${pluralize(b.count, 'título', 'títulos')}${b.amount > 0 ? ` · ${Math.round(share(b) * 100)}% do vencido` : ''}`;
            return (
              <li key={b.key} className={cn('flex min-w-0 flex-1 flex-col', !columns && 'justify-center')}>
                <Link
                  to={OVERDUE_RECEIVABLES_HREF}
                  className="-mx-1.5 block rounded-md px-1.5 py-1 transition-colors hover:bg-surface-muted"
                  aria-label={`${b.label}: ${pluralize(b.count, 'título', 'títulos')}, ${formatBRL(b.amount)}`}
                >
                  <span className="flex items-center gap-2">
                    <span className={cn('size-2.5 shrink-0 rounded-[3px]', AGING_BG[b.key])} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-fg">{b.label}</span>
                    {oneLine ? <span className="shrink-0 text-micro text-muted">{pluralize(b.count, 'título', 'títulos')}</span> : null}
                    <span className={`shrink-0 text-body-sm font-semibold tabular ${b.amount > 0 ? 'text-fg' : 'text-subtle'}`}>
                      {formatBRL(b.amount)}
                    </span>
                  </span>
                  {oneLine ? null : (
                    <span className="mt-0.5 block truncate pl-[18px] text-micro text-muted">
                      {columns ? pluralize(b.count, 'título', 'títulos') : meta}
                    </span>
                  )}
                  {rowBars ? (
                    <span className="mt-1.5 ml-[18px] block h-1.5 overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
                      <span className={cn('block h-full rounded-full', AGING_BG[b.key])} style={{ width: `${share(b) * 100}%` }} />
                    </span>
                  ) : null}
                </Link>
                {columns ? (
                  // Column bar scaled to the largest band (its share on top): grows with the card's height.
                  <span className="mt-2 flex min-h-0 flex-1 flex-col justify-end border-b border-border" aria-hidden>
                    <span className="mb-1 text-caption font-semibold text-fg tabular">{Math.round(share(b) * 100)}%</span>
                    <span
                      className={cn('block w-full shrink-0 rounded-t-md border-t-[3px]', AGING_COLUMN[b.key])}
                      style={{ height: `max(2px, calc(${(b.amount / largest) * 100}% - 20px))` }}
                    />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <WidgetCard
      subtitle="Recebimentos vencidos e ainda em aberto"
      alert={alert}
      footer={
        data?.truncated ? (
          <p className="text-micro text-muted">Faixas calculadas sobre os {LIMIT_LABEL} títulos mais antigos.</p>
        ) : undefined
      }
    >
      {body}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Clientes devedores
// ---------------------------------------------------------------------------

/** Ranking of overdue receivables by client, with HTML bars relative to the largest debt. */
export function DebtorsWidget({ alert }: WidgetProps) {
  const overdue = useOverdueReceivables();
  const data = overdue.data;
  const debtors = useMemo(() => (data ? rankDebtors(data.items) : []), [data]);
  const max = debtors[0]?.amount ?? 0;

  let body;
  if (overdue.isPending) {
    body = <ListSkeleton rowClassName="h-11" />;
  } else if (overdue.isError) {
    body = <ErrorState error={overdue.error} onRetry={() => overdue.refetch()} className="p-3" />;
  } else if (debtors.length === 0) {
    body = <BodyEmpty icon={<Users />} title="Nenhum cliente com valor vencido em aberto." />;
  } else {
    body = (
      <FitList
        items={debtors}
        getKey={(d) => d.contactId ?? '__none__'}
        moreLabel="cliente(s) devedor(es)"
        moreHref={OVERDUE_RECEIVABLES_HREF}
        className="flex flex-col gap-1"
        renderItem={(debtor, i) => (
          <Link
            to={debtor.contactId ? `${OVERDUE_RECEIVABLES_HREF}&contato=${debtor.contactId}` : OVERDUE_RECEIVABLES_HREF}
            className={cn(
              'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-1.5 py-0.5 transition-colors hover:bg-surface-muted',
              "[grid-template-areas:'name_value'_'bar_bar'_'meta_meta']",
              "@2xl:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_7.5rem] @2xl:gap-x-5 @2xl:[grid-template-areas:'name_bar_value'_'meta_bar_value']",
            )}
          >
            <span className="flex min-w-0 items-baseline gap-1 [grid-area:name]" title={debtor.name}>
              <span className="shrink-0 text-micro text-subtle tabular">{i + 1}.</span>
              <span className={cn('truncate text-[12px] font-semibold', debtor.contactId ? 'text-fg' : 'text-muted')}>{debtor.name}</span>
            </span>
            <span className="text-right text-body-sm font-semibold text-danger tabular [grid-area:value]">{formatBRL(debtor.amount)}</span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-bg-subtle [grid-area:bar] @2xl:mt-0 @2xl:h-2" aria-hidden>
              <span className="block h-full min-w-0.5 rounded-full bg-danger" style={{ width: `${max > 0 ? (debtor.amount / max) * 100 : 0}%` }} />
            </span>
            <span className="mt-0.5 truncate text-micro text-muted [grid-area:meta] @2xl:mt-0">
              {pluralize(debtor.count, 'título', 'títulos')} · mais antigo vence em {formatDateBR(debtor.oldest)}
            </span>
          </Link>
        )}
      />
    );
  }

  return (
    <WidgetCard
      subtitle="Ranking por valor vencido em aberto"
      alert={alert}
      footer={
        data?.truncated ? (
          <p className="text-micro text-muted">Ranking calculado sobre os {LIMIT_LABEL} títulos mais antigos.</p>
        ) : undefined
      }
    >
      {body}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Próximos vencimentos
// ---------------------------------------------------------------------------

type UpcomingFilter = DashboardPrefs['proximosFiltro'];

const FILTER_OPTIONS: { value: UpcomingFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'pagar', label: 'A pagar' },
  { value: 'receber', label: 'A receber' },
];

/** Pending bills (no card purchases) overdue or due in the next 15 days, filtered by type. */
export function UpcomingWidget({ d, loading, size, prefs, setPref, alert }: WidgetProps) {
  const filter = prefs.proximosFiltro;
  const items = useMemo(
    () => (d?.upcoming ?? []).filter((t) => filter === 'todos' || t.type === (filter === 'pagar' ? 'expense' : 'income')),
    [d, filter],
  );
  const totals = d?.upcomingTotals;
  const total = !totals ? items.length : filter === 'pagar' ? totals.expenseCount : filter === 'receber' ? totals.incomeCount : totals.expenseCount + totals.incomeCount;
  const moreHref = filter === 'receber' ? '/contas-a-receber' : '/contas-a-pagar';

  // Overdue payables (the card's alert); plain text since the header is the drag handle.
  const subtitle = d?.overdue.count ? (
    <span className="text-danger">
      {d.overdue.count} vencido(s) · {formatBRL(d.overdue.amount)}
    </span>
  ) : (
    'Vencidos e próximos 15 dias'
  );

  let body;
  if (loading || !d) {
    body = <ListSkeleton />;
  } else if (items.length === 0 && total === 0) {
    body =
      filter === 'todos' ? (
        <BodyEmpty icon={<CalendarClock />} title="Nada vencendo por aqui" description="Contas a pagar e a receber dos próximos 15 dias aparecem aqui." />
      ) : (
        <BodyEmpty icon={<CalendarClock />} title={filter === 'pagar' ? 'Nada a pagar nos próximos 15 dias' : 'Nada a receber nos próximos 15 dias'} />
      );
  } else {
    body = (
      <FitList
        items={items}
        total={total}
        getKey={(t) => t.id}
        moreLabel="vencimento(s)"
        moreHref={moreHref}
        className="flex flex-col"
        contentKey={filter}
        renderItem={(tx) => <TransactionRow tx={tx} density="compact" />}
      />
    );
  }

  const showTotals = Boolean(totals) && size.r >= 4 && !loading;
  return (
    <WidgetCard
      subtitle={subtitle}
      alert={alert}
      action={
        <SegmentedControl
          size="sm"
          ariaLabel="Filtrar vencimentos"
          value={filter}
          onChange={(v) => setPref('proximosFiltro', v)}
          options={FILTER_OPTIONS}
        />
      }
      footer={
        showTotals && totals && totals.expenseCount + totals.incomeCount > 0 ? (
          <p className="truncate text-micro text-muted">
            {filter !== 'receber' ? (
              <>
                A pagar <span className="font-semibold text-danger tabular">{formatBRL(totals.expense)}</span> ({totals.expenseCount})
              </>
            ) : null}
            {filter === 'todos' ? ' · ' : null}
            {filter !== 'pagar' ? (
              <>
                A receber <span className="font-semibold text-success tabular">{formatBRL(totals.income)}</span> ({totals.incomeCount})
              </>
            ) : null}
          </p>
        ) : undefined
      }
    >
      {body}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Fatura do cartão
// ---------------------------------------------------------------------------

interface ClosedInvoice {
  dueDate: string;
  unpaid: number;
  overdue: boolean;
}

/** Closed/overdue unpaid invoices per card (the API lists them oldest due date first). */
function closedInvoices(invoices: DashboardResponse['invoicesToPay']): Map<string, ClosedInvoice> {
  const map = new Map<string, ClosedInvoice>();
  for (const inv of invoices) {
    const current = map.get(inv.cardId);
    if (current) {
      current.unpaid += inv.unpaidTotal;
      current.overdue ||= inv.status === 'overdue';
    } else {
      map.set(inv.cardId, { dueDate: inv.dueDate, unpaid: inv.unpaidTotal, overdue: inv.status === 'overdue' });
    }
  }
  return map;
}

/** Current invoice, the closed invoice still to pay and the limit usage of each card. */
export function CardsWidget({ d, loading, size, alert }: WidgetProps) {
  const closed = useMemo(() => closedInvoices(d?.invoicesToPay ?? []), [d]);
  const cards = useMemo(() => {
    const rank = (id: string) => (closed.get(id)?.overdue ? 0 : closed.has(id) ? 1 : 2);
    return (d?.cards ?? [])
      .filter((c) => !c.archived)
      .sort((a, b) => rank(a.id) - rank(b.id) || b.currentInvoice.unpaidTotal - a.currentInvoice.unpaidTotal);
  }, [d, closed]);
  const showUsage = size.r >= 4;
  const currentTotal = cards.reduce((a, c) => a + c.currentInvoice.unpaidTotal, 0);

  let body;
  if (loading || !d) {
    body = <ListSkeleton rowClassName="h-12" />;
  } else if (cards.length === 0) {
    body = (
      <BodyEmpty
        icon={<CreditCard />}
        title="Nenhum cartão cadastrado"
        description="Cadastre um cartão para acompanhar compras e faturas."
        action={
          <Button size="sm" variant="outline" asChild>
            <Link to="/cartoes">Adicionar cartão</Link>
          </Button>
        }
      />
    );
  } else {
    body = (
      <FitList
        items={cards}
        getKey={(c) => c.id}
        moreLabel="cartão(ões)"
        moreHref="/cartoes"
        className="flex flex-col gap-1"
        contentKey={String(showUsage)}
        renderItem={(card) => {
          const invoice = closed.get(card.id);
          const usage = card.limit > 0 ? card.usedLimit / card.limit : 0;
          const meta = invoice
            ? `${invoice.overdue ? 'fatura vencida em' : 'fatura fechada vence'} ${formatDateBR(invoice.dueDate)} · ${formatBRL(invoice.unpaid)} a pagar`
            : card.closingDay
              ? `fecha dia ${card.closingDay} · vence dia ${card.dueDay}`
              : 'sem data de fechamento';
          return (
            <Link
              to={`/cartoes/${card.id}`}
              className={cn(
                'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-muted',
                "[grid-template-areas:'logo_name_value'_'logo_meta_meta'_'usage_usage_usage']",
                "@2xl:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_8rem] @2xl:gap-x-4 @2xl:[grid-template-areas:'logo_name_usage_value'_'logo_meta_usage_value']",
              )}
            >
              <BankLogo bank={card.bank} size="xs" className="[grid-area:logo]" />
              <span className="truncate text-body-sm font-semibold text-fg [grid-area:name]">{card.name}</span>
              <span
                className={`truncate text-micro [grid-area:meta] ${invoice?.overdue ? 'font-medium text-danger' : invoice ? 'text-warning' : 'text-muted'}`}
                title={meta}
              >
                {meta}
              </span>
              <span className="text-right text-body-sm font-semibold text-danger tabular [grid-area:value]">
                {formatBRL(card.currentInvoice.unpaidTotal)}
              </span>
              {card.limit > 0 ? (
                <span className="mt-1 block min-w-0 [grid-area:usage] @2xl:mt-0">
                  <ProgressBar
                    value={usage}
                    size="sm"
                    tone={usage > 0.9 ? 'danger' : usage > 0.7 ? 'warning' : 'brand'}
                    label={`Uso do limite de ${card.name}`}
                  />
                  {showUsage ? (
                    <span className="mt-1 block truncate text-micro text-muted">
                      {Math.round(usage * 100)}% do limite · disponível {formatBRL(card.availableLimit)}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </Link>
          );
        }}
      />
    );
  }

  return (
    <WidgetCard
      subtitle={cards.length ? `Em aberto: ${formatBRL(d?.balances.cardDebt ?? 0)} · fatura atual ${formatBRL(currentTotal)}` : 'Total em aberto por cartão'}
      alert={alert}
    >
      {body}
    </WidgetCard>
  );
}
