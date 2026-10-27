import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlarmClock, GitCompareArrows, LayoutDashboard, Tags, Users, Waves } from 'lucide-react';
import { PageHeader } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { CashflowTab } from '../components/cashflow-tab';
import { CategoriesTab } from '../components/categories-tab';
import { ComparisonTab } from '../components/comparison-tab';
import { ContactsTab } from '../components/contacts-tab';
import { DelinquencyMonthsControl, DelinquencyTab } from '../components/delinquency-tab';
import { OverviewTab } from '../components/overview-tab';
import { useActiveMonth } from '@/lib/active-month';
import { PeriodFilter, presetRange, type ReportPeriod } from '../components/period-filter';

type Tab = 'overview' | 'categories' | 'contacts' | 'comparison' | 'cashflow' | 'inadimplencia';

/**
 * Each report keeps its own period while the app is open. "Mês" follows the active month and
 * moving it moves the active month everywhere; multi-month choices stay local. Reports about a
 * trend (categories, contacts, cash flow) open on the last 12 months: one month is a single bar.
 */
const savedPeriods = new Map<Tab, ReportPeriod>();
const DEFAULT_PERIOD: Partial<Record<Tab, ReportPeriod>> = {
  categories: { preset: 'last-12' },
  contacts: { preset: 'last-12' },
  cashflow: { preset: 'last-12' },
};

/** What each report counts, in the office's words (competência vs caixa). */
const DESCRIPTIONS: Record<Tab, string> = {
  overview: 'Receitas, despesas e resultado do período pelo regime de competência (data de vencimento).',
  categories: 'Despesas e receitas por categoria, mês a mês, pelo regime de competência.',
  contacts: 'Movimentação por cliente e fornecedor, pelo regime de competência.',
  comparison: 'Dois períodos lado a lado, pelo regime de competência.',
  cashflow: 'Dinheiro que entrou e saiu das contas (regime de caixa), com o previsto adiante.',
  inadimplencia: 'Recebimentos em atraso, juros e multas cobrados e o risco de cada cliente.',
};

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('aba') as Tab) || 'overview';
  const [activeMonth, setActiveMonth] = useActiveMonth();
  const [periods, setPeriods] = useState(() => new Map(savedPeriods));
  const period = periods.get(tab) ?? DEFAULT_PERIOD[tab] ?? { preset: 'month' };
  const range = presetRange(period, activeMonth);

  function setPeriod(next: ReportPeriod) {
    savedPeriods.set(tab, next);
    setPeriods(new Map(savedPeriods));
  }

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Relatórios"
        description={DESCRIPTIONS[tab]}
        actions={
          tab === 'inadimplencia' ? (
            <DelinquencyMonthsControl />
          ) : tab !== 'comparison' ? (
            <PeriodFilter value={period} activeMonth={activeMonth} onChange={setPeriod} onMonthChange={setActiveMonth} />
          ) : null
        }
      />

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <SegmentedControl
          ariaLabel="Relatório"
          value={tab}
          onChange={(t) => update({ aba: t === 'overview' ? null : t, meses: null })}
          options={[
            { value: 'overview', label: 'Visão geral', icon: <LayoutDashboard /> },
            { value: 'categories', label: 'Categorias', icon: <Tags /> },
            { value: 'contacts', label: 'Contatos', icon: <Users /> },
            { value: 'comparison', label: 'Comparação', icon: <GitCompareArrows /> },
            { value: 'cashflow', label: 'Fluxo de caixa', icon: <Waves /> },
            { value: 'inadimplencia', label: 'Inadimplência', icon: <AlarmClock /> },
          ]}
        />
      </div>

      {tab === 'overview' ? <OverviewTab from={range.from} to={range.to} /> : null}
      {tab === 'categories' ? <CategoriesTab from={range.from} to={range.to} /> : null}
      {tab === 'contacts' ? <ContactsTab from={range.from} to={range.to} /> : null}
      {tab === 'comparison' ? <ComparisonTab /> : null}
      {tab === 'cashflow' ? <CashflowTab from={range.from} to={range.to} /> : null}
      {tab === 'inadimplencia' ? <DelinquencyTab /> : null}
    </div>
  );
}
