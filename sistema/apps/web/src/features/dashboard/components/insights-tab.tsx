import { Link, useNavigate } from 'react-router';
import { categoryListHref } from '@/features/transactions/links';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
import { axisProps, MoneyTooltip } from '@/components/charts/chart-utils';
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
        { name: 'Fixas', value: o.fixedExpense, fill: 'var(--app-chart-1)' },
        { name: 'Parceladas', value: o.installmentExpense, fill: 'var(--app-chart-2)' },
        { name: 'Variáveis', value: o.variableExpense, fill: 'var(--app-chart-3)' },
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
        <p className="mt-2 text-sm text-muted">Análises automáticas dos lançamentos, honorários e contas do mês, pela competência.</p>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Gasto médio diário" value={o ? formatBRL(o.averageDailyExpense) : <Skeleton className="h-8 w-28" />} footerContent={<span>Despesas ÷ dias do mês</span>} />
        <KpiCard label="Despesas fixas" value={o ? formatBRL(o.fixedExpense) : <Skeleton className="h-8 w-28" />} footerContent={<span>{o && o.expense ? `${formatPercent(o.fixedExpense / o.expense, 0)} das despesas` : '—'}</span>} />
        <KpiCard label="Parcelamentos" value={o ? formatBRL(o.installmentExpense) : <Skeleton className="h-8 w-28" />} footerContent={<span>Parcelas no mês</span>} />
        <KpiCard label="Resultado do mês" value={o ? formatBRL(o.net) : <Skeleton className="h-8 w-28" />} valueClassName={o && o.net < 0 ? 'text-danger' : undefined} footerContent={<span>Receitas − despesas</span>} />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="p-5 lg:col-span-8">
          <CardHeader title="Insights do mês" subtitle="O que chamou atenção nos números do mês" />
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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <CardHeader title="Fixas x variáveis" subtitle="Composição das despesas" />
          <div className="mt-4 h-48">
            {overview.isPending ? (
              <Skeleton className="h-full" />
            ) : o && o.expense > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={split} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" {...axisProps} width={80} />
                  <Tooltip cursor={{ fill: 'var(--app-bg-subtle)' }} content={<MoneyTooltip names={{ value: 'Valor' }} />} />
                  <Bar dataKey="value" name="value" radius={[6, 6, 6, 6]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState compact className="h-full" title="Sem despesas no mês" />
            )}
          </div>
        </Card>
        <Card className="p-5">
          <CardHeader title="Formas de pagamento" subtitle="Como as despesas foram pagas" />
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
        <Card className="overflow-hidden">
          <div className="p-5 pb-2">
            <CardHeader title="Maiores despesas" subtitle="Top 5 do mês" />
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
      {o && o.topCategories.length ? (
        <Card className="p-5">
          <CardHeader title="Categorias que mais pesaram" subtitle="Distribuição das despesas do mês" />
          <div className="mt-4">
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
    </div>
  );
}
