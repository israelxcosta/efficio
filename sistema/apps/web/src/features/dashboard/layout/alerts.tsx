import { formatDateBR, type DashboardResponse, type WorkspaceKind } from '@effinance/shared';
import { summarizeProjection } from '@/components/charts/chart-scale';
import { useOfficeClients, useOverduePayables, useOverdueReceivables, useProjection } from '../widgets/data';
import { isVisible } from './layout';
import { SPEC_BY_ID } from './specs';
import type { DashboardLayout, DashboardPrefs, WidgetAlert, WidgetId } from './types';

export const OVERDUE_RECEIVABLES_HREF = '/contas-a-receber?status=overdue&modo=year';
export const OVERDUE_PAYABLES_HREF = '/contas-a-pagar?status=overdue&modo=year';

/**
 * What needs attention in each visible widget (red dot on the card). Same queries as the widgets,
 * so no extra requests.
 */
export function useDashboardAlerts({
  d,
  kind,
  layout,
  prefs,
}: {
  d: DashboardResponse | undefined;
  kind: WorkspaceKind | undefined;
  layout: DashboardLayout;
  prefs: DashboardPrefs;
}): Partial<Record<WidgetId, WidgetAlert>> {
  const shown = (id: WidgetId) => isVisible(layout, SPEC_BY_ID[id], kind);
  const projection = shown('projecao-caixa');
  const receivables = useOverdueReceivables(shown('inadimplencia') || shown('clientes-devedores') || projection);
  const payables = useOverduePayables(projection);
  const cashflow = useProjection(projection);
  const clients = useOfficeClients(shown('vigencias-honorarios'));

  const alerts: Partial<Record<WidgetId, WidgetAlert>> = {};
  const overdueIn = receivables.data?.summary;
  if (shown('inadimplencia') && overdueIn && overdueIn.overdueCount > 0) {
    alerts.inadimplencia = { count: overdueIn.overdueCount, label: 'recebimento(s) vencido(s)', href: OVERDUE_RECEIVABLES_HREF };
  }
  // Dashboard count: card purchases stay out (an overdue invoice is reported by the card widget).
  const overdueOut = d?.overdue.count ?? 0;
  if (shown('proximos-vencimentos') && overdueOut > 0) {
    alerts['proximos-vencimentos'] = { count: overdueOut, label: 'conta(s) a pagar vencida(s)', href: OVERDUE_PAYABLES_HREF };
  }
  const invoices = d?.invoicesToPay.length ?? 0;
  if (shown('fatura-cartao') && invoices > 0) {
    alerts['fatura-cartao'] = { count: invoices, label: 'fatura(s) fechada(s) em aberto', href: '/cartoes' };
  }
  if (projection && cashflow.data && overdueIn && payables.data) {
    const { negativeFrom } = summarizeProjection(cashflow.data, overdueIn.overdue - payables.data.summary.overdue, prefs.projecaoDias);
    if (negativeFrom) {
      alerts['projecao-caixa'] = { count: 1, label: `saldo negativo previsto em ${formatDateBR(negativeFrom)}`, href: '/relatorios?aba=cashflow' };
    }
  }
  const withoutFee = clients.data?.summary.withoutCurrentFee ?? 0;
  if (shown('vigencias-honorarios') && withoutFee > 0) {
    alerts['vigencias-honorarios'] = { count: withoutFee, label: 'cliente(s) sem vigência de honorários', href: '/clientes' };
  }
  return alerts;
}
