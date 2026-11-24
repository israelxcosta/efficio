import { useMemo } from 'react';
import { formatBRL, displayCompanyName } from '@effinance/shared';
import { rankDebtors } from '@/components/charts/chart-scale';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { pluralize } from '@/lib/utils';
import { OVERDUE_RECEIVABLES_HREF } from '../layout/alerts';
import { useOverdueReceivables } from '../widgets/data';

/**
 * The solid card of the Painel financeiro (first row, beside the number strip): today's overdue
 * receivables; the whole card opens them. The board below keeps its own layout and customization.
 */
export function OverdueSpotlight() {
  const overdue = useOverdueReceivables();
  const data = overdue.data;
  const debtors = useMemo(() => (data ? rankDebtors(data.items) : []), [data]);
  if (!data) return <SpotlightCard label="Inadimplência hoje" loading={overdue.isPending} title={overdue.isError ? 'Não foi possível carregar' : undefined} />;
  if (data.total === 0) return <SpotlightCard label="Inadimplência hoje" title="Nenhum honorário vencido" caption="Todas as receitas vencidas foram recebidas." to="/contas-a-receber" />;
  const total = data.items.reduce((n, t) => n + t.amount, 0);
  const top = debtors[0];
  return (
    <SpotlightCard
      label="Inadimplência hoje"
      badge={pluralize(data.total, 'título', 'títulos')}
      value={formatBRL(total)}
      caption={`${pluralize(debtors.length, 'cliente', 'clientes')}${top ? ` · maior: ${displayCompanyName(top.name)}` : ''}`}
      to={OVERDUE_RECEIVABLES_HREF}
    />
  );
}
