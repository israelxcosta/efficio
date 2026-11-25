import { diffInDays, formatBRL, todayISO, type DashboardResponse } from '@effinance/shared';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { pluralize } from '@/lib/utils';

const PAYABLES_HREF = '/contas-a-pagar';

/** "05/12" */
const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * The solid card of the Painel financeiro (first row, beside the number strip): the next bill to pay,
 * the pair of the Gestão's "Próximo prazo legal". Overdue receivables already have their own card on
 * the board ("Inadimplência"), so this card never repeats them. Overdue bills come first: they are the
 * action for today. The whole card opens Contas a pagar.
 */
export function NextBillSpotlight({ d, loading }: { d: DashboardResponse | undefined; loading: boolean }) {
  if (!d) return <SpotlightCard label="Próxima conta a pagar" loading={loading} title={loading ? undefined : 'Não foi possível carregar'} />;
  const today = todayISO();
  if (d.overdue.count > 0) {
    const oldest = d.upcoming.find((t) => t.type === 'expense' && !t.paid && t.date < today);
    return (
      <SpotlightCard
        label="Contas a pagar vencidas"
        badge={pluralize(d.overdue.count, 'conta', 'contas')}
        value={formatBRL(d.overdue.amount)}
        caption={oldest ? `A mais antiga venceu em ${dayMonth(oldest.date)} · ${oldest.description}` : 'Veja em Contas a pagar.'}
        to={PAYABLES_HREF}
      />
    );
  }
  // `upcoming` is pending, card purchases left out, oldest first; overdue ones were handled above.
  const bills = d.upcoming.filter((t) => t.type === 'expense' && !t.paid && t.date >= today);
  const next = bills[0];
  if (!next) {
    return <SpotlightCard label="Próxima conta a pagar" title="Nada a pagar em 15 dias" caption="Nenhuma conta pendente vence nos próximos 15 dias." to={PAYABLES_HREF} />;
  }
  const days = diffInDays(next.date, today);
  const when = days <= 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${days} dias`;
  const others = bills.length - 1;
  const rest = others > 0 ? ` · +${pluralize(others, 'conta', 'contas')} em 15 dias` : '';
  return (
    <SpotlightCard
      label="Próxima conta a pagar"
      badge={when}
      value={formatBRL(next.amount)}
      caption={`${next.description} · ${dayMonth(next.date)}${rest}`}
      to={PAYABLES_HREF}
    />
  );
}
