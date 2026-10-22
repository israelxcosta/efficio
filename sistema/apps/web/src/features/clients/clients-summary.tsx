import { Building2, CalendarClock, HandCoins, UserX } from 'lucide-react';
import { TAX_REGIMES, TAX_REGIME_LABELS, formatBRL, type ClientListResponse, type TaxRegime } from '@effinance/shared';
import { SERIES_PALETTE } from '@/components/charts/chart-utils';
import { KpiCard } from '@/components/ui/kpi-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTone } from '@/lib/theme';
import { cn, pluralize } from '@/lib/utils';

/** One hue per tax regime (series palette; lifted in dark mode by useTone). */
export const REGIME_COLORS: Record<TaxRegime, string> = {
  simples_nacional: SERIES_PALETTE[0]!,
  mei: SERIES_PALETTE[2]!,
  presumed_profit: SERIES_PALETTE[3]!,
  real_profit: SERIES_PALETTE[9]!,
  exempt: SERIES_PALETTE[5]!,
  other: SERIES_PALETTE[10]!,
};

type Summary = ClientListResponse['summary'];

/** Active clients per regime with at least one client, in the catalog order. */
export function regimeBreakdown(byRegime: Partial<Record<TaxRegime, number>> | undefined): { regime: TaxRegime; count: number }[] {
  return TAX_REGIMES.map((regime) => ({ regime, count: byRegime?.[regime] ?? 0 })).filter((r) => r.count > 0);
}

/** Cards at the top of "Clientes": portfolio by regime, monthly fees with the average ticket, renewals and inactive. */
export function ClientsSummary({ summary }: { summary: Summary | undefined }) {
  const tone = useTone();
  const loading = <Skeleton className="h-7 w-24" />;
  const regimes = regimeBreakdown(summary?.byRegime);
  const regimeTotal = regimes.reduce((a, r) => a + r.count, 0);
  const withFee = summary ? summary.active - summary.withoutCurrentFee : 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard
        compact
        className="col-span-2 sm:col-span-1"
        icon={<Building2 className="text-brand-text" />}
        label="Clientes ativos"
        value={summary ? summary.active : loading}
        footerContent={<span className="truncate">{summary ? `${pluralize(summary.active + summary.inactive, 'empresa', 'empresas')} na carteira` : '—'}</span>}
      >
        {summary && regimeTotal > 0 ? (
          <div className="mt-2.5">
            <div
              role="img"
              aria-label={`Clientes ativos por regime: ${regimes.map((r) => `${TAX_REGIME_LABELS[r.regime]} ${r.count}`).join(', ')}`}
              className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-bg-subtle"
            >
              {regimes.map((r) => (
                <span key={r.regime} className="h-full min-w-1" style={{ width: `${(r.count / regimeTotal) * 100}%`, backgroundColor: tone(REGIME_COLORS[r.regime]) }} />
              ))}
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1" aria-hidden>
              {regimes.map((r) => (
                <li key={r.regime} className="flex items-center gap-1.5 text-caption whitespace-nowrap text-muted">
                  <span className="size-2 shrink-0 rounded-[3px]" style={{ backgroundColor: tone(REGIME_COLORS[r.regime]) }} />
                  {TAX_REGIME_LABELS[r.regime]}
                  <span className="tabular font-semibold text-fg">{r.count}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </KpiCard>

      <KpiCard
        compact
        className="col-span-2 sm:col-span-1"
        icon={<HandCoins className="text-success" />}
        label="Honorários vigentes / mês"
        info="Soma dos honorários mensais vigentes hoje dos clientes ativos"
        value={summary ? formatBRL(summary.monthlyFees) : loading}
        valueClassName={cn(summary && summary.monthlyFees > 0 && 'text-success')}
        footerContent={<span className="truncate">{summary ? `${pluralize(withFee, 'cliente', 'clientes')} com honorário vigente` : '—'}</span>}
      >
        {summary ? (
          <p className="mt-2 text-caption text-muted">
            Ticket médio <span className="tabular font-semibold text-fg">{formatBRL(summary.averageFee ?? 0)}</span>
          </p>
        ) : null}
      </KpiCard>

      <KpiCard
        compact
        icon={<CalendarClock className="text-warning" />}
        label="Sem vigência atual"
        info="Clientes ativos sem período de honorário cobrindo hoje (novos ou com reajuste pendente)"
        value={summary ? summary.withoutCurrentFee : loading}
        valueClassName={cn(summary && summary.withoutCurrentFee > 0 && 'text-warning')}
        footerContent={<span className="truncate">Honorário a cadastrar ou reajustar</span>}
      />

      <KpiCard
        compact
        icon={<UserX className="text-muted" />}
        label="Inativos"
        value={summary ? summary.inactive : loading}
        valueClassName={cn(summary && 'text-muted')}
        footerContent={<span className="truncate">Fora da carteira ativa</span>}
      />
    </div>
  );
}
