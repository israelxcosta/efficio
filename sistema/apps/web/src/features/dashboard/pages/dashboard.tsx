import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowUpToLine, Check, ChevronLeft, ChevronRight, LayoutGrid, SlidersHorizontal, Sparkles } from 'lucide-react';
import {
  MONTH_NAMES,
  addMonthKey,
  formatBRL,
  formatMonthKey,
  monthKey,
  percentChange,
  todayISO,
  type DashboardResponse,
  type MonthKey,
  type WorkspaceKind,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { MetricStrip, type MetricCell } from '@/components/ui/metric-strip';
import { ErrorState } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';
import { useActiveMonth } from '@/lib/active-month';
import { useElementSize } from '@/lib/use-element-size';
import { useUpdatedLabel } from '@/lib/updated-label';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-context';
import { useDashboard } from '../api';
import { InsightsTab } from '../components/insights-tab';
import { changeParts, marginText, monthlySeries, netWorthText, type ChangeParts } from '../kpi-logic';
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
  // "Personalizar" mode: the cards get their grip, hide button and corner handle.
  const [editing, setEditing] = useState(false);
  const [modeMessage, setModeMessage] = useState('');
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

  function startEditing(openCards = false) {
    setEditing(true);
    if (openCards) setCustomizing(true);
    setModeMessage('Modo de personalização. Use a alça de cada card para mover.');
  }

  function stopEditing() {
    setEditing(false);
    setCustomizing(false);
    setModeMessage('');
    // "Concluir" goes away: the focus goes back to "Personalizar" (same id).
    requestAnimationFrame(() => document.getElementById(CUSTOMIZE_BUTTON_ID)?.focus());
  }

  // Escape leaves the mode, unless it closed a sheet/menu or cancelled a drag (those prevent it).
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || customizing) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
      stopEditing();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editing, customizing]);

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
          <FindingLine month={month} updatedAt={dashboard.dataUpdatedAt} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          {tab === 'dashboard' && !editing ? (
            <Button id={CUSTOMIZE_BUTTON_ID} variant="outline" size="sm" onClick={() => startEditing()}>
              <SlidersHorizontal /> Personalizar
              <HiddenBadge count={hidden} />
            </Button>
          ) : null}
          {tab === 'dashboard' && editing ? (
            <>
              <Button id={CUSTOMIZE_BUTTON_ID} variant="outline" size="sm" onClick={() => setCustomizing(true)}>
                <LayoutGrid /> Cards
                <HiddenBadge count={hidden} />
              </Button>
              {hasGaps ? (
                <Tooltip content="Sobe os cards para fechar os espaços vazios do painel">
                  <Button variant="outline" size="sm" onClick={arrange}>
                    <ArrowUpToLine /> Organizar
                  </Button>
                </Tooltip>
              ) : null}
              <Button variant="primary" size="sm" onClick={stopEditing}>
                <Check /> Concluir
              </Button>
            </>
          ) : null}
        </div>
      </header>

      {dashboard.isError ? (
        <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />
      ) : tab === 'insights' ? (
        <InsightsTab month={month} dashboard={d} loading={dashboard.isPending} />
      ) : (
        <Overview d={d} loading={dashboard.isPending} month={month} kind={kind} width={width} editing={editing} onCustomize={() => startEditing(true)} />
      )}
      <CustomizeSheet open={customizing} onOpenChange={setCustomizing} kind={kind} />
      <p aria-live="polite" className="sr-only">
        {modeMessage}
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
function HiddenBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return <span className="tabular rounded-full bg-bg-subtle px-1.5 text-mini font-semibold text-muted">{count === 1 ? '1 oculto' : `${count} ocultos`}</span>;
}

function Overview({ d, loading, month, kind, width, editing, onCustomize }: OverviewProps) {
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
function FindingLine({ month, updatedAt }: { month: MonthKey; updatedAt: number }) {
  const updated = useUpdatedLabel(updatedAt);
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
    <p className="mt-1 text-sm text-muted">
      {/* Only the finding is announced; the minute-by-minute "atualizado" stays out of the live region. */}
      <span aria-live="polite">
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
      </span>
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
