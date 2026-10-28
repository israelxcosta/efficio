import type { ReactNode } from 'react';
import { CircleAlert, Info } from 'lucide-react';
import {
  TAX_REGIMES,
  TAX_REGIME_LABELS,
  formatBRL,
  formatDateBR,
  todayISO,
  type Client,
  type ClientListResponse,
  type ClientStatus,
  type TaxRegime,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { cn, pluralize } from '@/lib/utils';

/**
 * One tone per tax regime where the portfolio is split into parts (the dashboard's "Carteira de
 * clientes"): four steps of the blue data ramp, alternating dark and light in the usual order of size
 * (Simples, Presumido, Real, MEI) so neighbouring slices read apart, and greys for the residual
 * regimes. All are light enough for useTone to leave them as they are, so both themes match.
 */
export const REGIME_COLORS: Record<TaxRegime, string> = {
  simples_nacional: '#2F5FBF',
  presumed_profit: '#8FA9DD',
  real_profit: '#5B82D1',
  mei: '#B9C9EA',
  exempt: '#6B7280',
  other: '#AEB3BC',
};

type Summary = ClientListResponse['summary'];

/** The list filters the summary reads and sets (the toolbar's state); `search` is only cleared, never set. */
export interface ClientsSummaryFilter {
  status: ClientStatus | 'all';
  regime: TaxRegime | '';
  search?: string;
}

/** Active clients per regime with at least one client, the largest first (catalog order on ties). */
export function regimeBreakdown(byRegime: Partial<Record<TaxRegime, number>> | undefined): { regime: TaxRegime; count: number }[] {
  return TAX_REGIMES.map((regime) => ({ regime, count: byRegime?.[regime] ?? 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

const displayName = (c: Client) => c.tradeName || c.name;

/** Why an active client has no fee covering today, in the words of the table badge and the fees dialog. */
function feeGap(c: Client, today: string): string {
  const last = c.latestFee;
  if (!last) return 'sem honorário cadastrado';
  if (last.endDate < today) return `reajuste pendente, a última vigência terminou em ${formatDateBR(last.endDate)}`;
  return `a próxima vigência começa em ${formatDateBR(last.startDate)}`;
}

/** Small grey label over a figure. */
function Label({ children }: { children: ReactNode }) {
  return <p className="flex h-5 items-center gap-1.5 text-body-sm font-medium text-muted">{children}</p>;
}

/** Quiet toggle for a list filter: hover tint, the active fill while the list is filtered by it. */
const toggleClass =
  'rounded-md transition-colors duration-150 hover:bg-surface-muted aria-pressed:bg-bg-subtle aria-pressed:hover:bg-bg-subtle';

/**
 * Active clients without a fee covering today, by name, when the listed page holds all of them
 * (`summary` counts the whole workspace; the page is filtered and paginated). Otherwise the count only.
 */
function FeeGapNote({
  summary,
  items,
  filter,
  onFilter,
  onOpenFees,
}: Pick<ClientsSummaryProps, 'items' | 'filter' | 'onFilter' | 'onOpenFees'> & { summary: Summary }) {
  const today = todayISO();
  const count = summary.withoutCurrentFee ?? 0;
  const pending = items?.filter((c) => c.status === 'active' && !c.currentFee) ?? [];
  const named = pending.length === count && count <= 3 ? pending : null;

  let text: ReactNode;
  let action: ReactNode = null;
  if (named?.length === 1) {
    const c = named[0]!;
    text = (
      <>
        <span className="font-semibold">{displayName(c)}</span> não entra no total: {feeGap(c, today)}.
      </>
    );
    action = (
      <Button size="sm" variant="outline" onClick={() => onOpenFees(c)} aria-label={`Ver honorários de ${displayName(c)}`}>
        Ver honorários
      </Button>
    );
  } else if (named) {
    // The names go on the buttons only (one name, one place).
    text = `${count} clientes ativos não entram no total: estão sem vigência cobrindo hoje.`;
    action = (
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-body-sm text-muted">Ver honorários de</span>
        {named.map((c) => (
          <Button key={c.id} size="sm" variant="outline" onClick={() => onOpenFees(c)} aria-label={`Ver honorários de ${displayName(c)}`}>
            {displayName(c)}
          </Button>
        ))}
      </span>
    );
  } else {
    // Not all on this page: a filter hides them (offer the way back) or they are spread over pages.
    const one = count === 1;
    const narrowed = Boolean(filter.search) || filter.regime !== '' || filter.status === 'inactive';
    text = `${pluralize(count, 'cliente ativo', 'clientes ativos')} ${one ? 'não entra no total: está' : 'não entram no total: estão'} sem vigência cobrindo hoje.${
      narrowed ? '' : ` Na lista, ${one ? 'aparece' : 'aparecem'} como Reajuste pendente ou Sem honorário.`
    }`;
    if (narrowed) {
      action = (
        <Button size="sm" variant="outline" onClick={() => onFilter({ status: 'active', regime: '', search: '' })}>
          Ver todos os ativos
        </Button>
      );
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 border-t border-border px-4 py-3 sm:px-5">
      <p className="flex min-w-0 max-w-[72ch] items-start gap-2 text-body-sm text-fg">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <span>{text}</span>
      </p>
      {action ? <div className="pl-6 sm:pl-0">{action}</div> : null}
    </div>
  );
}

interface ClientsSummaryProps {
  summary: Summary | undefined;
  /** The listed page, to name the clients without a current fee when it holds all of them. */
  items?: readonly Client[];
  filter: ClientsSummaryFilter;
  onFilter: (filter: ClientsSummaryFilter) => void;
  onOpenFees: (client: Client) => void;
}

/**
 * Head of "Clientes": the monthly fees in force (the figure the page leads with), the active clients
 * split by tax regime (each row filters the list) and, when there are any, the active clients left
 * out of the total for lack of a fee period covering today.
 */
export function ClientsSummary({ summary, items, filter, onFilter, onOpenFees }: ClientsSummaryProps) {
  // No clients at all: the list's empty state carries the first action.
  if (summary && summary.active + summary.inactive === 0) return null;

  const regimes = regimeBreakdown(summary?.byRegime);
  const withFee = summary ? summary.active - (summary.withoutCurrentFee ?? 0) : 0;
  const maxCount = Math.max(1, ...regimes.map((r) => r.count));
  const inactiveShown = filter.status === 'inactive';

  return (
    <section
      aria-label="Resumo da carteira de clientes"
      aria-busy={summary ? undefined : true}
      className="overflow-hidden rounded-xl border border-border bg-surface"
    >
      {/* Desktop: fees | count (10rem) and regimes. Tablet: fees | count, the regimes under both. Phone: stacked. */}
      <div className="grid md:grid-cols-2 lg:grid-cols-[minmax(0,1.15fr)_10rem_minmax(0,1fr)]">
        <div className="min-w-0 p-4 sm:p-5">
          <Label>
            Honorários vigentes por mês
            <Tooltip content="Soma dos honorários mensais com vigência cobrindo hoje, dos clientes ativos. Não inclui a taxa por empregado.">
              <button type="button" className="rounded-sm text-subtle transition-colors hover:text-muted" aria-label="Como o total é calculado">
                <Info className="size-3.5" />
              </button>
            </Tooltip>
          </Label>
          {summary ? (
            <>
              <p className="tabular mt-1 text-[32px] leading-10 font-semibold tracking-tight whitespace-nowrap text-fg lg:text-[28px] xl:text-[32px]">
                {formatBRL(summary.monthlyFees ?? 0)}
              </p>
              <p className="mt-1 text-body-sm text-muted">
                {withFee > 0 ? (
                  <>
                    Ticket médio de <span className="tabular font-semibold text-fg">{formatBRL(summary.averageFee ?? 0)}</span> em{' '}
                    {pluralize(withFee, 'cliente', 'clientes')}
                  </>
                ) : (
                  'Nenhuma vigência cobrindo hoje'
                )}
              </p>
            </>
          ) : (
            <>
              <span className="mt-1 flex h-10 items-center">
                <Skeleton className="h-8 w-44" />
              </span>
              <span className="mt-1 flex h-5 items-center">
                <Skeleton className="h-3.5 w-56" />
              </span>
            </>
          )}
        </div>

        <div className="min-w-0 border-t border-border p-4 pb-3 sm:p-5 sm:pb-3 md:border-t-0 md:border-l md:pb-5 lg:pr-0">
          <Label>Clientes ativos</Label>
          {/* The inactive count sits beside the figure on phones, under it from tablets (like the ticket line). */}
          {summary ? (
            <div className="flex items-center gap-4 md:block">
              <p className="tabular mt-1 text-kpi leading-10 font-semibold tracking-tight text-fg">{summary.active}</p>
              {summary.inactive > 0 ? (
                <button
                  type="button"
                  aria-pressed={inactiveShown}
                  onClick={() => onFilter(inactiveShown ? { status: 'active', regime: filter.regime } : { status: 'inactive', regime: '' })}
                  className={cn(
                    '-mx-1.5 mt-1 flex h-7 items-center px-1.5 text-body-sm font-medium text-brand-text underline decoration-border-strong underline-offset-4 hover:decoration-current md:mt-0 md:-mb-1',
                    toggleClass,
                  )}
                >
                  {pluralize(summary.inactive, 'inativo', 'inativos')}
                </button>
              ) : (
                <p className="mt-1 text-body-sm text-muted">Nenhum inativo</p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-4 md:block">
              <span className="mt-1 flex h-10 items-center">
                <Skeleton className="h-6 w-8" />
              </span>
              <span className="mt-1 flex h-5 items-center">
                <Skeleton className="h-3.5 w-20" />
              </span>
            </div>
          )}
        </div>

        <div className="min-w-0 px-4 pb-4 sm:px-5 sm:pb-5 md:col-span-2 md:border-t md:border-border md:pt-4 lg:col-span-1 lg:border-t-0">
          {!summary ? (
            <div className="grid grid-cols-2 gap-x-4 lg:grid-cols-1" aria-hidden>
              {['w-full', 'w-4/5', 'w-3/5', 'w-1/2'].map((w) => (
                <span key={w} className="flex h-11 items-center lg:h-7">
                  <Skeleton className={cn('h-3.5', w)} />
                </span>
              ))}
            </div>
          ) : regimes.length === 0 ? (
            <p className="text-body-sm text-muted lg:pt-0.5">Nenhum cliente ativo.</p>
          ) : (
            <ul aria-label="Clientes ativos por regime (filtra a lista)" className="-mx-2 grid grid-cols-2 gap-x-4 gap-y-0.5 lg:grid-cols-1 lg:gap-y-0">
              {regimes.map((r) => {
                const label = TAX_REGIME_LABELS[r.regime];
                const pressed = filter.regime === r.regime;
                return (
                  <li key={r.regime} className="min-w-0">
                    <button
                      type="button"
                      aria-pressed={pressed}
                      aria-label={`${label}: ${pluralize(r.count, 'cliente ativo', 'clientes ativos')}`}
                      onClick={() => onFilter(pressed ? { status: filter.status, regime: '' } : { status: 'active', regime: r.regime })}
                      className={cn(
                        'grid w-full items-center gap-x-3 px-2 py-1.5 text-left lg:py-1 lg:pointer-coarse:py-2.5',
                        "grid-cols-[minmax(0,1fr)_auto] [grid-template-areas:'label_count'_'bar_bar']",
                        "lg:grid-cols-[9rem_minmax(0,1fr)_2.5rem] lg:[grid-template-areas:'label_bar_count']",
                        toggleClass,
                      )}
                    >
                      <span className={cn('truncate text-body-sm text-fg [grid-area:label]', pressed && 'font-semibold')}>{label}</span>
                      {/* One data hue, no track; the largest regime fills the bar's room. */}
                      <span className="mt-1.5 block h-1.5 [grid-area:bar] lg:mt-0" aria-hidden>
                        <span className="block h-full min-w-1 rounded-full bg-data" style={{ width: `${(r.count / maxCount) * 100}%` }} />
                      </span>
                      <span className="tabular text-right text-body-sm font-semibold text-fg [grid-area:count]">{r.count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {summary && (summary.withoutCurrentFee ?? 0) > 0 ? (
        <FeeGapNote summary={summary} items={items} filter={filter} onFilter={onFilter} onOpenFees={onOpenFees} />
      ) : null}
    </section>
  );
}
