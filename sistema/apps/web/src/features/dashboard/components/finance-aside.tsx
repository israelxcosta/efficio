import { useMemo } from 'react';
import { Link } from 'react-router';
import { formatBRL, displayCompanyName, type DashboardResponse } from '@effinance/shared';
import { rankDebtors } from '@/components/charts/chart-scale';
import { AsideCard } from '@/components/layout/page-with-aside';
import { BankLogo } from '@/components/ui/bank-logo';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { pluralize } from '@/lib/utils';
import { OVERDUE_RECEIVABLES_HREF } from '../layout/alerts';
import { useOverdueReceivables } from '../widgets/data';

// Right column of the Painel financeiro ("Hoje no caixa"): the overdue receivables on the solid card and
// the account balances. It sits beside the customizable board, never inside it (the board keeps its
// own layout, and every card of it can still be shown or hidden in "Personalizar").

export function OverdueSpotlight() {
  const overdue = useOverdueReceivables();
  const data = overdue.data;
  const debtors = useMemo(() => (data ? rankDebtors(data.items) : []), [data]);
  if (!data) return <SpotlightCard label="Inadimplência hoje" loading={overdue.isPending} title={overdue.isError ? 'Não foi possível carregar' : undefined} />;
  const total = data.items.reduce((n, t) => n + t.amount, 0);
  if (data.total === 0) {
    return <SpotlightCard label="Inadimplência hoje" title="Nenhum honorário vencido" caption="Todas as receitas vencidas foram recebidas." action={{ label: 'Contas a receber', to: '/contas-a-receber' }} />;
  }
  return (
    <SpotlightCard
      label="Inadimplência hoje"
      badge={pluralize(data.total, 'título', 'títulos')}
      badgeDanger
      value={formatBRL(total)}
      caption={`${pluralize(debtors.length, 'cliente', 'clientes')}${data.truncated ? ' · primeiros títulos' : ''}`}
      rows={debtors.slice(0, 3).map((d) => ({ label: displayCompanyName(d.name), value: formatBRL(d.amount), to: d.contactId ? `/contas-a-receber?status=overdue&modo=year&contato=${d.contactId}` : undefined }))}
      action={{ label: 'Cobrar', to: OVERDUE_RECEIVABLES_HREF }}
    />
  );
}

export function AccountsAsideCard({ d, loading }: { d: DashboardResponse | undefined; loading: boolean }) {
  const accounts = (d?.accounts ?? []).filter((a) => !a.archived && a.includeInTotal).sort((a, b) => b.balance - a.balance);
  return (
    <AsideCard
      title="Saldo em contas"
      meta={d ? formatBRL(d.balances.accounts) : undefined}
      footer={
        <Link to="/contas" className="text-caption font-semibold text-brand-text hover:underline">
          Ver contas
        </Link>
      }
    >
      {loading && !d ? (
        <Skeleton className="h-20 w-full" />
      ) : accounts.length === 0 ? (
        <p className="py-1 text-caption text-muted">Nenhuma conta no total.</p>
      ) : (
        <ul className="flex flex-col">
          {accounts.slice(0, 5).map((a) => (
            <li key={a.id} className="flex items-center gap-2.5 py-1.5">
              <BankLogo bank={a.bank} size="sm" />
              <span className="min-w-0 flex-1 truncate text-caption text-fg">{a.name}</span>
              <span className={a.balance < 0 ? 'tabular text-caption font-semibold text-danger' : 'tabular text-caption font-semibold text-fg'}>{formatBRL(a.balance)}</span>
            </li>
          ))}
        </ul>
      )}
    </AsideCard>
  );
}
