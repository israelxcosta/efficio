import { useEffect, type ReactNode } from 'react';
import { SpotlightRow } from '@/components/ui/spotlight-card';
import { NextBillSpotlight } from '../components/finance-aside';
import { useSearchParams } from 'react-router';
import { LayoutGrid, Sparkles } from 'lucide-react';
import {
  formatBRL,
  formatMonthKey,
  monthKey,
  percentChange,
  type DashboardResponse,
  type MonthKey,
  type WorkspaceKind,
} from '@effinance/shared';
import { MetricStrip, type MetricCell } from '@/components/ui/metric-strip';
import { ErrorState } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { PeriodNavigator } from '@/components/ui/period-navigator';
import { useActiveMonth } from '@/lib/active-month';
import { useElementSize } from '@/lib/use-element-size';
import { useUpdatedLabel } from '@/lib/updated-label';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-context';
import { useDashboard } from '../api';
import { InsightsTab } from '../components/insights-tab';
import { changeParts, marginText, monthlySeries, netWorthText, type ChangeParts } from '../kpi-logic';
import { useDashboardAlerts } from '../layout/alerts';
import { WIDGET_COMPONENTS } from '../layout/catalog';
import { CustomizeSheet } from '../layout/customize-sheet';
import { BoardEditControls, useBoardEditing } from '../layout/board-editing';
import { FINANCE_BOARD, useDashboardLayout } from '../layout/layout-store';
import { DashboardBoard } from '../layout/widget-grid';

type Tab = 'dashboard' | 'insights';

export default function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const [month, setActiveMonth] = useActiveMonth();
  const { workspace } = useAuth();
  const kind = workspace?.kind;
  const tab = (params.get('aba') as Tab) || 'dashboard';
  const dashboard = useDashboard(month);
  const d = dashboard.data;
  // The board spans the page, so the page's width picks its columns (also for "Organizar").
  const { ref, width } = useElementSize();
  // "Personalizar" mode: the cards get their grip, hide button and corner handle.
  const edit = useBoardEditing(FINANCE_BOARD, kind, width);
  const { editing, customizing, setCustomizing } = edit;
  const startEditing = edit.start;
  const stopEditing = edit.stop;

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

  // `?personalizar=1` (link in Configurações) enters the mode with the list of cards open.
  const openCustomize = params.get('personalizar');
  useEffect(() => {
    if (!openCustomize) return;
    startEditing(true);
    update({ personalizar: null, aba: null });
  }, [openCustomize]);

  return (
    <div ref={ref} className="calm-text @container flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="text-title font-semibold tracking-tight text-fg">Painel financeiro</h1>
          <MonthLine month={month} updatedAt={dashboard.dataUpdatedAt} />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 max-lg:basis-full lg:shrink-0">
          <SegmentedControl
            ariaLabel="Visão"
            value={tab}
            onChange={(t) => {
              if (t !== 'dashboard' && editing) stopEditing();
              update({ aba: t === 'dashboard' ? null : t });
            }}
            options={[
              { value: 'dashboard', label: 'Visão geral', icon: <LayoutGrid /> },
              { value: 'insights', label: 'Dashboard inteligente', icon: <Sparkles /> },
            ]}
          />
          {/* The same month navigator as the Gestão screens (one period control in the whole app). */}
          <PeriodNavigator modes={['month']} value={{ mode: 'month', anchor: `${month}-01` }} onChange={(v) => setActiveMonth(monthKey(v.anchor))} />
          {tab === 'dashboard' ? <BoardEditControls editing={edit} /> : null}
        </div>
      </header>

      {dashboard.isError ? (
        <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />
      ) : (
        // Stale data while another month loads (keepPreviousData): dim to 60% like the other screens.
        // The delay only applies on the way down, so a fast cache hit does not flash and the way
        // back to 100% starts at once.
        <div
          className={cn(
            'flex flex-col gap-5 transition-opacity duration-(--dur-state)',
            dashboard.isPlaceholderData && 'opacity-60 delay-150',
          )}
          aria-busy={dashboard.isPlaceholderData || undefined}
        >
          {tab === 'insights' ? (
            <InsightsTab month={month} dashboard={d} loading={dashboard.isPending} />
          ) : (
            <Overview d={d} loading={dashboard.isPending} month={month} kind={kind} width={width} editing={editing} onCustomize={() => startEditing(true)} />
          )}
        </div>
      )}
      <CustomizeSheet open={customizing} onOpenChange={setCustomizing} kind={kind} />
      <p aria-live="polite" className="sr-only">
        {edit.message}
      </p>
    </div>
  );
}

interface OverviewProps {
  d: DashboardResponse | undefined;
  loading: boolean;
  month: string;
  kind: WorkspaceKind | undefined;
  width: number;
  editing: boolean;
  onCustomize: () => void;
}

/** "N ocultos" on "Personalizar" / "Cards". */
function Overview({ d, loading, month, kind, width, editing, onCustomize }: OverviewProps) {
  const { layout, prefs } = useDashboardLayout();
  const alerts = useDashboardAlerts({ d, kind, layout, prefs });
  return (
    <>
      {/* First row: the number strip and the solid card beside it; the board below keeps the full width. */}
      <SpotlightRow spotlight={<NextBillSpotlight d={d} loading={loading} />}>
        <DashboardKpis d={d} loading={loading} />
      </SpotlightRow>
      <DashboardBoard
        width={width}
        month={month}
        d={d}
        loading={loading}
        kind={kind}
        components={WIDGET_COMPONENTS}
        alerts={alerts}
        onCustomize={onCustomize}
        editing={editing}
      />
    </>
  );
}

/**
 * The line under the title: the month and the fact that most needs attention, with the way to act
 * on it. The current month shows everything overdue today; another month, its own receivables
 * (still overdue, still to come, or all received).
 */
/**
 * Month and freshness under the title, in small text and on one line: the header keeps the same width
 * every month, so the period controls beside it never jump (the overdue finding lives in the
 * Inadimplência card).
 */
function MonthLine({ month, updatedAt }: { month: MonthKey; updatedAt: number }) {
  const updated = useUpdatedLabel(updatedAt);
  return (
    <p className="mt-0.5 truncate text-caption text-muted">
      <span aria-live="polite">{formatMonthKey(month)}</span>
      {updated ? <span className="text-subtle">{` · ${updated}`}</span> : null}
    </p>
  );
}

const CHANGE_TONE = { success: 'text-success', danger: 'text-danger', muted: 'text-muted' } as const;

/** "+20,0% vs mês anterior" with the change coloured by whether it is good (plain text for the tooltip). */
function changeFooter(parts: ChangeParts | null): { footer: ReactNode; footerTitle: string } {
  if (!parts) return { footer: 'Sem base de comparação', footerTitle: 'Sem base de comparação' };
  return {
    footer: (
      <>
        <span className={cn('tabular font-semibold', CHANGE_TONE[parts.tone])}>{parts.text}</span> vs mês anterior
      </>
    ),
    footerTitle: `${parts.text} vs mês anterior`,
  };
}

/**
 * Number strip above the board (docs/dashboards-redesign.md §7.1): income, expenses, result (with
 * the margin as context) and net worth, each with its comparison and a 6-month sparkline.
 */
function DashboardKpis({ d, loading }: { d: DashboardResponse | undefined; loading: boolean }) {
  const s = d?.summary;
  const p = d?.previous;
  const busy = loading || !d;
  const monthly = d?.monthly ?? [];
  const margin = s && p ? marginText(s, p) : '';
  const worth = d ? netWorthText(d.balances) : '';
  const cells: MetricCell[] = [
    {
      key: 'receitas',
      label: 'Receitas',
      info: 'Receitas do mês pela competência (recebidas + a receber). Linha: últimos 6 meses.',
      value: s ? formatBRL(s.income) : null,
      ...changeFooter(s && p ? changeParts(percentChange(s.income, p.income), 'percent') : null),
      spark: { values: monthlySeries(monthly, 'income'), tone: 'data' },
      href: '/contas-a-receber',
      aria: s ? `Receitas: ${formatBRL(s.income)}. Ver contas a receber.` : 'Receitas',
      loading: busy,
    },
    {
      key: 'despesas',
      label: 'Despesas',
      info: 'Despesas do mês pela competência, incluindo compras no cartão. Linha: últimos 6 meses.',
      value: s ? formatBRL(s.expense) : null,
      ...changeFooter(s && p ? changeParts(percentChange(s.expense, p.expense), 'percent', true) : null),
      spark: { values: monthlySeries(monthly, 'expense'), tone: 'neutral' },
      href: '/contas-a-pagar',
      aria: s ? `Despesas: ${formatBRL(s.expense)}. Ver contas a pagar.` : 'Despesas',
      loading: busy,
    },
    {
      key: 'resultado',
      label: 'Resultado',
      info: 'Receitas − despesas do mês. Margem = resultado sobre as receitas; a variação é em pontos percentuais.',
      value: s ? formatBRL(s.net) : null,
      tone: s && s.net < 0 ? 'danger' : undefined,
      footer: margin,
      footerTitle: margin,
      spark: { values: monthlySeries(monthly, 'net'), tone: 'data' },
      href: '/relatorios',
      aria: s ? `Resultado: ${formatBRL(s.net)}, ${margin}. Ver relatórios.` : 'Resultado',
      loading: busy,
    },
    {
      key: 'patrimonio',
      label: 'Patrimônio',
      info: 'Saldo em contas + investimentos − dívida de cartão. Sem histórico de saldo para comparar.',
      value: d ? formatBRL(d.balances.netWorth) : null,
      footer: worth,
      footerTitle: worth,
      href: '/contas',
      aria: d ? `Patrimônio: ${formatBRL(d.balances.netWorth)}. ${worth}. Ver contas.` : 'Patrimônio',
      loading: busy,
    },
  ];
  return <MetricStrip cells={cells} medium={2} />;
}
