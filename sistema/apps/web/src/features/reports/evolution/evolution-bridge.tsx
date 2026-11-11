import { useState } from 'react';
import { formatBRL, INACTIVATION_REASON_LABELS, type EvolutionChurnRef, type EvolutionClientRef, type EvolutionMonth } from '@effinance/shared';
import { Card, CardHeader } from '@/components/ui/card';
import { cn, initials, pluralize } from '@/lib/utils';
import { feeBridge, monthName, type BridgeRow } from './evolution-logic';

const LIST_LIMIT = 5;

const BRIDGE_HELP =
  'Base do mês anterior + honorário dos clientes novos − honorário que os encerrados tinham no mês anterior + reajustes (vigência nova, cliente que ganhou ou perdeu vigência) = base do mês.';

const SIGN: Record<BridgeRow['key'], string> = { previous: '', new: '+', adjustment: '+', churned: '−', current: '=' };
const BAR: Record<BridgeRow['key'], string> = {
  previous: 'bg-[var(--app-chart-neutral)]',
  new: 'bg-data',
  adjustment: 'bg-data/45',
  churned: 'bg-danger',
  current: 'bg-primary',
};

/** "1 cliente entrou, ninguém saiu" / "2 entraram, 1 saiu". */
function movesSummary(current: EvolutionMonth): string {
  const ins = current.newClients;
  const outs = current.churnedClients;
  if (ins === 0 && outs === 0) return 'ninguém entrou ou saiu';
  const inText = ins === 0 ? 'ninguém entrou' : `${pluralize(ins, 'cliente', 'clientes')} ${ins === 1 ? 'entrou' : 'entraram'}`;
  const outText = outs === 0 ? 'ninguém saiu' : `${outs} ${outs === 1 ? 'saiu' : 'saíram'}`;
  return `${inText}, ${outText}`;
}

/**
 * "Honorário mensal: outubro → novembro" (spec §4.3): the bridge as a list with signs and proportional
 * bars (not a waterfall chart), then who came in and who left (name, fee, reason), 5 of each with "+ N".
 */
export function EvolutionBridgeView({ current, previous, className }: { current: EvolutionMonth; previous: EvolutionMonth | undefined; className?: string }) {
  const rows = feeBridge(current, previous);
  const month = monthName(current.month);
  if (!rows || !previous) {
    return (
      <Card className={cn('flex min-w-0 flex-col p-4 sm:p-5', className)}>
        <CardHeader title={`Honorário mensal de ${month}`} subtitle={formatBRL(current.recurringFees)} info={BRIDGE_HELP} />
        <p className="mt-4 text-body-sm text-muted">Sem o mês anterior na janela: escolha um período maior para ver de onde veio a diferença.</p>
      </Card>
    );
  }
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.amount)));
  return (
    <Card className={cn('flex min-w-0 flex-col p-4 sm:p-5', className)}>
      <CardHeader
        title={`Honorário mensal: ${monthName(previous.month)} → ${month}`}
        subtitle={`${formatBRL(previous.recurringFees)} → ${formatBRL(current.recurringFees)} · ${movesSummary(current)}`}
        info={BRIDGE_HELP}
      />
      <ul className="mt-4 flex flex-col gap-3" aria-label="Ponte do honorário mensal">
        {rows.map((r) => {
          const negative = r.key === 'churned' || (r.key === 'adjustment' && r.amount < 0);
          const sign = r.key === 'adjustment' && r.amount < 0 ? '−' : SIGN[r.key];
          const total = r.key === 'current';
          return (
            <li key={r.key} className={cn('grid grid-cols-[1rem_minmax(0,1fr)] gap-x-1.5', total && 'mt-1 border-t border-border pt-3')}>
              <span className="text-body-sm text-subtle" aria-hidden>
                {sign}
              </span>
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-3 text-body-sm">
                  <span className={cn('truncate', r.amount === 0 && !total && r.key !== 'previous' ? 'text-muted' : 'text-fg', total && 'font-semibold')}>{r.label}</span>
                  <span className={cn('tabular shrink-0 whitespace-nowrap', r.amount === 0 ? 'text-muted' : 'font-semibold text-fg', negative && r.amount !== 0 && 'text-danger')}>
                    {formatBRL(Math.abs(r.amount))}
                  </span>
                </div>
                <span className={cn('mt-1 block w-full overflow-hidden rounded-full bg-bg-subtle', total ? 'h-1.5' : 'h-1')} aria-hidden>
                  <span className={cn('block h-full rounded-full', BAR[r.key], r.key === 'adjustment' && r.amount < 0 && 'bg-danger/60')} style={{ width: `${(Math.abs(r.amount) / max) * 100}%` }} />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
        {current.newClients === 0 && current.churnedClients === 0 ? (
          <p className="text-body-sm text-muted">{`Nenhum cliente entrou ou saiu em ${month}.`}</p>
        ) : (
          <>
            <PeopleList title="Quem entrou" items={current.newList} empty={`Ninguém entrou em ${month}.`} kind="new" month={month} />
            <PeopleList title="Quem saiu" items={current.churnedList} empty={`Ninguém saiu em ${month}.`} kind="churned" month={month} />
          </>
        )}
      </div>
    </Card>
  );
}

function PeopleList({
  title,
  items,
  empty,
  kind,
  month,
}: {
  title: string;
  items: readonly (EvolutionClientRef | EvolutionChurnRef)[];
  empty: string;
  kind: 'new' | 'churned';
  month: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, LIST_LIMIT);
  const more = items.length - shown.length;
  return (
    <div>
      <p className="text-caption font-medium text-muted">{`${title} (${items.length})`}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-body-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-2">
          {shown.map((c) => (
            <li key={c.id} className="flex items-center gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-primary-soft-fg" aria-hidden>
                {initials(c.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm text-fg">{c.name}</span>
                <span className="block truncate text-micro text-muted">{'reason' in c ? INACTIVATION_REASON_LABELS[c.reason] : `contrato iniciado em ${month}`}</span>
              </span>
              <span className={cn('tabular shrink-0 text-body-sm font-semibold whitespace-nowrap', c.fee === 0 ? 'font-normal text-muted' : kind === 'new' ? 'text-success' : 'text-danger')}>
                {c.fee === 0 ? 'sem vigência' : `${kind === 'new' ? '+' : '−'}${formatBRL(c.fee)}/mês`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {more > 0 ? (
        <button type="button" onClick={() => setAll(true)} className="mt-1.5 text-caption font-medium text-brand-text hover:underline">
          {`+ ${more}`}
        </button>
      ) : null}
    </div>
  );
}
