import { Link } from 'react-router';
import { formatDateBR, type DashboardResponse, type WorkspaceKind } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { summarizeProjection } from '@/components/charts/chart-scale';
import { useOfficeClients, useOverduePayables, useOverdueReceivables, useProjection } from '../widgets/data';
import { isVisible } from './layout';
import { SPEC_BY_ID } from './specs';
import type { DashboardLayout, DashboardPrefs, WidgetAlert, WidgetId } from './types';

export const OVERDUE_RECEIVABLES_HREF = '/contas-a-receber?status=overdue&modo=year';
export const OVERDUE_PAYABLES_HREF = '/contas-a-pagar?status=overdue&modo=year';

/**
 * What needs attention in each visible widget (red dot on the card, badge on its section, also
 * while the section is collapsed). Same queries as the widgets, so no extra requests.
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

export function SectionAlertModal({
  open,
  onOpenChange,
  title,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: { title: string; alert: WidgetAlert }[];
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Fechar
        </Button>
      }
    >
      <ul className="flex flex-col divide-y divide-border">
        {items.map(({ title: widget, alert }) => (
          <li key={widget} className="flex items-center gap-3 py-2.5">
            <span className="size-2 shrink-0 rounded-full bg-danger" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-semibold text-fg">{widget}</p>
              <p className="text-caption text-muted">
                {alert.count} {alert.label}
              </p>
            </div>
            <Link to={alert.href} onClick={() => onOpenChange(false)} className="text-caption font-semibold text-brand-text hover:underline">
              Ver
            </Link>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
