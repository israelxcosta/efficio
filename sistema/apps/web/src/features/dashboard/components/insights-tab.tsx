import { Link, useNavigate } from 'react-router';
import { categoryListHref } from '@/features/transactions/links';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import {
  formatBRL,
  formatPercent,
  monthRange,
  type DashboardResponse,
  type Insight,
  type InsightKind,
} from '@effinance/shared';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { KpiCard } from '@/components/ui/kpi-card';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { DonutChart } from '@/components/charts/donut-chart';
import { cn } from '@/lib/utils';
import { useOverviewReport } from '@/features/reports/api';
import { TransactionRow } from '@/features/transactions/components/transaction-row';
import { INSIGHT_LABELS } from './insight-card';
import { HealthCard } from './health-card';

/** Kind in words; red only for a warning (the one kind that asks for action). */
const KIND_TONE: Record<InsightKind, string> = {
  warning: 'text-danger',
  opportunity: 'text-muted',
  achievement: 'text-muted',
  info: 'text-muted',
};

export function InsightList({ insights }: { insights: Insight[] }) {
  return (
    <ul className="grid gap-x-6 md:grid-cols-2">
      {insights.map((ins, i) => (
        <li key={i} className="flex gap-3 border-t border-border py-3.5 first:border-t-0 md:[&:nth-child(2)]:border-t-0">
          <div className="min-w-0 flex-1">
            <p className={cn('text-xs font-medium', KIND_TONE[ins.kind])}>{INSIGHT_LABELS[ins.kind]}</p>
            <p className="mt-0.5 text-sm font-semibold text-fg">{ins.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{ins.description}</p>
          </div>
          {ins.href ? (
            <Link to={ins.href} className="text-subtle hover:text-fg" aria-label={`Abrir análise: ${ins.title}`}>
              <ArrowUpRight className="size-4" />
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Fixed × installment × variable expenses: one stacked bar (the whole month) and a row per part with the
 * amount and the share. Replaces a 192px bar chart that was mostly empty (design review P2-5).
 */
function ExpenseSplit({ total, parts }: { total: number; parts: { name: string; value: number; fill: string; hint: string }[] }) {
  const shown = parts.filter((p) => p.value > 0);
  const fixed = parts[0]?.value ?? 0;
  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-bg-subtle" role="img" aria-label={shown.map((p) => `${p.name} ${formatPercent(p.value / total, 0)}`).join(', ')}>
        {shown.map((p) => (
          <span key={p.name} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.fill }} />
        ))}
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {parts.map((p) => (
          <li key={p.name} className="flex items-center justify-between gap-3 py-2 text-body-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.fill }} aria-hidden />
              <span className="font-medium text-fg">{p.name}</span>
              <span className="truncate text-caption text-muted">{p.hint}</span>
            </span>
            <span className="tabular shrink-0 font-semibold text-fg">
              {formatBRL(p.value)} <span className="text-caption font-normal text-muted">· {formatPercent(total ? p.value / total : 0, 0)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-caption text-muted">
        As fixas são {formatPercent(total ? fixed / total : 0, 0)} das despesas do mês: é o valor que os honorários precisam cobrir antes de sobrar resultado.
      </p>
    </div>
  );
}

export function InsightsTab({ month, dashboard, loading }: { month: string; dashboard: DashboardResponse | undefined; loading: boolean }) {
  const navigate = useNavigate();
  const range = monthRange(month);
  const overview = useOverviewReport(range);
  const o = overview.data;
  const insights = [...(dashboard?.insights ?? []), ...(o?.insights ?? [])].filter(
    (ins, i, arr) => arr.findIndex((x) => x.title === ins.title) === i,
  );

  const split = o
    ? [
        { name: 'Fixas', value: o.fixedExpense, fill: 'var(--app-chart-blue-1)', hint: 'recorrentes do mês' },
        { name: 'Parceladas', value: o.installmentExpense, fill: 'var(--app-chart-blue-3)', hint: 'parcelas de compras' },
        { name: 'Variáveis', value: o.variableExpense, fill: 'var(--app-chart-blue-5)', hint: 'avulsas' },
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="max-w-3xl text-[20px] leading-snug font-semibold tracking-tight text-fg">
          {o ? (
            o.income === 0 && o.expense === 0 ? (
              'Lance as receitas e despesas do mês para ver as análises.'
            ) : o.net >= 0 ? (
              `A margem do mês foi de ${formatPercent(o.savingsRate ?? 0, 1)} das receitas: ${formatBRL(o.net)} de resultado.`
            ) : (
              `As despesas superaram as receitas em ${formatBRL(Math.abs(o.net))} neste mês.`
            )
          ) : (
            'Analisando os números do mês…'
          )}
        </h2>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Gasto médio diário" value={o ? formatBRL(o.averageDailyExpense) : <Skeleton className="h-8 w-28" />} footerContent={<span>Despesas ÷ dias do mês</span>} />
        <KpiCard label="Despesas fixas" value={o ? formatBRL(o.fixedExpense) : <Skeleton className="h-8 w-28" />} footerContent={<span>{o && o.expense ? `${formatPercent(o.fixedExpense / o.expense, 0)} das despesas` : '—'}</span>} />
        <KpiCard label="Parcelamentos" value={o ? formatBRL(o.installmentExpense) : <Skeleton className="h-8 w-28" />} footerContent={<span>Parcelas no mês</span>} />
        <KpiCard label="Resultado do mês" value={o ? formatBRL(o.net) : <Skeleton className="h-8 w-28" />} valueClassName={o && o.net < 0 ? 'text-danger' : undefined} footerContent={<span>Receitas − despesas</span>} />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="p-5 lg:col-span-8">
          <CardHeader title="Insights do mês" />
          <div className="mt-4">
            {loading || overview.isPending ? (
              <SkeletonRows rows={3} />
            ) : insights.length ? (
              <InsightList insights={insights} />
            ) : (
              <EmptyState compact icon={<Sparkles />} title="Sem dados suficientes ainda" description="Assim que houver movimentações, trago análises e recomendações concretas." />
            )}
          </div>
        </Card>
        <div className="lg:col-span-4">
          <HealthCard health={dashboard?.health} loading={loading} />
        </div>
      </div>

      {/* A short list never spans the page (app-screens §4.2): the categories pair with the biggest expenses. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {o && o.topCategories.length ? (
          <Card className="flex flex-col p-5">
            <CardHeader title="Categorias que mais pesaram" />
            {/* Centred in the height of the pair, so the shorter block has no void at the bottom. */}
            <div className="mt-4 flex flex-1 flex-col justify-center">
              <DonutChart
                data={o.topCategories}
                total={o.expense}
                height={170}
                maxItems={7}
                onSelect={(c) => c.categoryId && navigate(categoryListHref('expense', c.categoryId, month))}
              />
            </div>
          </Card>
        ) : null}
        <Card className={cn('overflow-hidden', !(o && o.topCategories.length) && 'lg:col-span-2')}>
          <div className="p-5 pb-2">
            <CardHeader title="Maiores despesas" />
          </div>
          <div className="p-1.5">
            {overview.isPending ? (
              <SkeletonRows rows={4} className="p-3" />
            ) : o && o.topExpenses.length ? (
              o.topExpenses.slice(0, 5).map((t) => <TransactionRow key={t.id} tx={t} showDue={false} />)
            ) : (
              <EmptyState compact className="m-3" title="Sem despesas no mês" />
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader title="Fixas x variáveis" info="Fixas são as despesas recorrentes do mês (aluguel, folha, sistemas): o mínimo que o escritório cobre todo mês." />
          {overview.isPending ? (
            <SkeletonRows rows={3} className="mt-4" />
          ) : o && o.expense > 0 ? (
            <ExpenseSplit total={o.expense} parts={split} />
          ) : (
            <EmptyState compact className="mt-4" title="Sem despesas no mês" />
          )}
        </Card>
        <Card className="p-5">
          <CardHeader title="Formas de pagamento" />
          <div className="mt-4">
            {overview.isPending ? (
              <Skeleton className="h-40" />
            ) : o && o.byPaymentMethod.length ? (
              <DonutChart
                height={140}
                total={o.expense}
                data={o.byPaymentMethod.map((m, i) => ({
                  categoryId: m.method ?? `none-${i}`,
                  name: m.label,
                  icon: 'credit-card',
                  color: '',
                  amount: m.amount,
                  share: m.share,
                }))}
              />
            ) : (
              <EmptyState compact title="Sem despesas no mês" />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
