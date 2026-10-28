import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowUpToLine, ChevronLeft, ChevronRight, LayoutGrid, Percent, SlidersHorizontal, Sparkles, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import {
  MONTH_NAMES,
  addMonthKey,
  formatBRL,
  formatMonthKey,
  formatPercent,
  monthKey,
  percentChange,
  todayISO,
  type DashboardResponse,
  type MonthKey,
  type WorkspaceKind,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/ui/kpi-card';
import { ErrorState } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { useActiveMonth } from '@/lib/active-month';
import { useElementSize } from '@/lib/use-element-size';
import { useAuth } from '@/features/auth/auth-context';
import { useDashboard } from '../api';
import { InsightsTab } from '../components/insights-tab';
import { monthFinding, overdueFinding } from '../layout/finding';
import { useMonthReceivables, useOverdueReceivables } from '../widgets/data';
import { useDashboardAlerts } from '../layout/alerts';
import { WIDGET_COMPONENTS } from '../layout/catalog';
import { CustomizeSheet } from '../layout/customize-sheet';
import { canArrange, columnsForWidth, hiddenCount, resolveBoard } from '../layout/layout';
import { useDashboardLayout } from '../layout/layout-store';
import { WIDGET_SPECS } from '../layout/specs';
import { CUSTOMIZE_BUTTON_ID, DashboardBoard } from '../layout/widget-grid';

type Tab = 'dashboard' | 'insights';

export default function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const [month, setActiveMonth] = useActiveMonth();
  const { workspace } = useAuth();
  const kind = workspace?.kind;
  const tab = (params.get('aba') as Tab) || 'dashboard';
  const dashboard = useDashboard(month);
  const d = dashboard.data;
  const layoutApi = useDashboardLayout();
  const [customizing, setCustomizing] = useState(false);
  const hidden = hiddenCount(layoutApi.layout, WIDGET_SPECS, kind);
  // The board spans the page, so the page's width picks its columns (also for "Organizar").
  const { ref, width } = useElementSize();
  const cols = columnsForWidth(width);
  const hasGaps = useMemo(
    () => width > 0 && canArrange(resolveBoard(layoutApi.layout, WIDGET_SPECS, kind, cols), cols),
    [layoutApi.layout, kind, cols, width],
  );

  function arrange() {
    const before = layoutApi.layout;
    layoutApi.arrange(cols);
    // The button goes away with the gaps: keep the focus in the header.
    requestAnimationFrame(() => document.getElementById(CUSTOMIZE_BUTTON_ID)?.focus());
    toast('Cards organizados.', { action: { label: 'Desfazer', onClick: () => layoutApi.restore(before) } });
  }

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  }

  // `?mes=` (old links) seeds the active month, which every other screen follows.
  const linkedMonth = params.get('mes');
  useEffect(() => {
    if (!linkedMonth) return;
    setActiveMonth(linkedMonth);
    update({ mes: null });
  }, [linkedMonth]);

  // `?personalizar=1` (link in Configurações) opens the customize sheet.
  const openCustomize = params.get('personalizar');
  useEffect(() => {
    if (!openCustomize) return;
    setCustomizing(true);
    update({ personalizar: null, aba: null });
  }, [openCustomize]);

  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7));
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 3 + i);
  const setMonth = (y: number, m: number) => setActiveMonth(`${y}-${String(m).padStart(2, '0')}`);

  return (
    <div ref={ref} className="@container flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-fg">Painel financeiro</h1>
          <FindingLine month={month} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            ariaLabel="Visão"
            value={tab}
            onChange={(t) => update({ aba: t === 'dashboard' ? null : t })}
            options={[
              { value: 'dashboard', label: 'Visão geral', icon: <LayoutGrid /> },
              { value: 'insights', label: 'Dashboard inteligente', icon: <Sparkles /> },
            ]}
          />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Mês anterior" onClick={() => setActiveMonth(addMonthKey(month, -1))}>
              <ChevronLeft />
            </Button>
            <Select aria-label="Mês" value={monthIndex} onChange={(e) => setMonth(year, Number(e.target.value))} className="h-9 w-[136px] bg-surface text-[13px] font-medium">
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </Select>
            <Select aria-label="Ano" value={year} onChange={(e) => setMonth(Number(e.target.value), monthIndex)} className="h-9 w-[92px] bg-surface text-[13px] font-medium">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
            <Button variant="ghost" size="icon-sm" aria-label="Próximo mês" onClick={() => setActiveMonth(addMonthKey(month, 1))}>
              <ChevronRight />
            </Button>
          </div>
          {tab === 'dashboard' ? (
            <Button id={CUSTOMIZE_BUTTON_ID} variant="outline" size="sm" onClick={() => setCustomizing(true)}>
              <SlidersHorizontal /> Personalizar
              {hidden > 0 ? (
                <span className="tabular rounded-full bg-bg-subtle px-1.5 text-mini font-semibold text-muted">
                  {hidden === 1 ? '1 oculto' : `${hidden} ocultos`}
                </span>
              ) : null}
            </Button>
          ) : null}
          {tab === 'dashboard' && hasGaps ? (
            <Tooltip content="Sobe os cards para fechar os espaços vazios do painel">
              <Button variant="outline" size="sm" onClick={arrange}>
                <ArrowUpToLine /> Organizar
              </Button>
            </Tooltip>
          ) : null}
        </div>
      </header>

      {dashboard.isError ? (
        <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />
      ) : tab === 'insights' ? (
        <InsightsTab month={month} dashboard={d} loading={dashboard.isPending} />
      ) : (
        <Overview d={d} loading={dashboard.isPending} month={month} kind={kind} width={width} onCustomize={() => setCustomizing(true)} />
      )}
      <CustomizeSheet open={customizing} onOpenChange={setCustomizing} kind={kind} />
    </div>
  );
}

interface OverviewProps {
  d: DashboardResponse | undefined;
  loading: boolean;
  month: string;
  kind: WorkspaceKind | undefined;
  width: number;
  onCustomize: () => void;
}

function Overview({ d, loading, month, kind, width, onCustomize }: OverviewProps) {
  const { layout, prefs } = useDashboardLayout();
  const alerts = useDashboardAlerts({ d, kind, layout, prefs });
  return (
    <>
      <DashboardKpis d={d} loading={loading} />
      <DashboardBoard
        width={width}
        month={month}
        d={d}
        loading={loading}
        kind={kind}
        components={WIDGET_COMPONENTS}
        alerts={alerts}
        onCustomize={onCustomize}
      />
    </>
  );
}

/**
 * The line under the title: the month and the fact that most needs attention, with the way to act
 * on it. The current month shows everything overdue today; another month, its own receivables
 * (still overdue, still to come, or all received).
 */
function FindingLine({ month }: { month: MonthKey }) {
  const today = todayISO();
  const current = month === monthKey(today);
  const overdue = useOverdueReceivables(current);
  const ofMonth = useMonthReceivables(month, !current);
  const finding = current
    ? overdue.data
      ? (overdueFinding(overdue.data.items) ?? { text: 'nenhum recebimento vencido em aberto', alert: false })
      : null
    : ofMonth.data
      ? monthFinding(ofMonth.data, today)
      : null;
  const href = current ? '/relatorios?aba=inadimplencia' : `/contas-a-receber?data=${month}-01&status=overdue`;
  return (
    <p className="mt-1 text-sm text-muted" aria-live="polite">
      {formatMonthKey(month)}
      {finding ? (
        finding.alert ? (
          <>
            {' · '}
            <span className="font-medium text-danger">{finding.text}</span>
            {' · '}
            <Link to={href} className="font-medium text-brand-text hover:underline">
              {current ? 'Ver inadimplência' : 'Ver vencidos'}
            </Link>
          </>
        ) : (
          ` · ${finding.text}`
        )
      ) : null}
    </p>
  );
}

/** Fixed strip above the grid: income, expenses, margin and net worth (same breakpoints as the grid). */
function DashboardKpis({ d, loading }: { d: DashboardResponse | undefined; loading: boolean }) {
  const s = d?.summary;
  const p = d?.previous;
  const money = (v: number | undefined) => (loading || v === undefined ? <Skeleton className="ml-auto h-7 w-32" /> : formatBRL(v));

  return (
    <div className="grid grid-cols-2 gap-4 @[1000px]:grid-cols-4">
      <KpiCard
        compact
        icon={<TrendingUp />}
        label="Receitas"
        info="Receitas do mês pela competência (recebidas + a receber)"
        value={money(s?.income)}
        change={s && p ? percentChange(s.income, p.income) : undefined}
        href="/contas-a-receber"
      />
      <KpiCard
        compact
        icon={<TrendingDown />}
        label="Despesas"
        info="Despesas do mês pela competência, incluindo compras no cartão"
        value={money(s?.expense)}
        change={s && p ? percentChange(s.expense, p.expense) : undefined}
        invert
        href="/contas-a-pagar"
      />
      <KpiCard
        compact
        icon={<Percent />}
        label="Margem"
        info="Resultado do mês (receitas − despesas) sobre as receitas. A variação é em pontos percentuais."
        value={s ? formatPercent(s.savingsRate ?? 0, 1) : <Skeleton className="ml-auto h-7 w-20" />}
        change={s && p && s.savingsRate !== null && p.savingsRate !== null ? s.savingsRate - p.savingsRate : undefined}
        changeUnit="pp"
        href="/relatorios"
      />
      <KpiCard
        compact
        icon={<Wallet />}
        label="Patrimônio"
        info="Saldo em contas + investimentos − dívida de cartão"
        value={money(d?.balances.netWorth)}
        footerContent={
          d ? (
            <span>
              Investido: <span className="tabular font-semibold text-fg">{formatBRL(d.balances.investments)}</span>
            </span>
          ) : undefined
        }
        href="/contas"
      />
    </div>
  );
}
