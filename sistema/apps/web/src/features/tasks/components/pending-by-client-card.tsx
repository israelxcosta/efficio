import { useState } from 'react';
import { Building2, X } from 'lucide-react';
import type { TaskListSummary } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, pluralize } from '@/lib/utils';
import { clientPendingRanking } from '../task-hub';
import { toggleClass } from './tasks-summary';

const TOP = 10;

interface PendingByClientCardProps {
  summary: TaskListSummary | undefined;
  /** Client filter of the list ('' = none). */
  client: string;
  onClient: (id: string) => void;
}

/**
 * "Pendências por cliente" (below the list): the clients ranked by open work with the overdue part,
 * how many clients carry it and the overdue ones; each row filters the list by the client (and
 * clears it when pressed again). Same filters as the list except the situation, like the summary.
 */
export function PendingByClientCard({ summary, client, onClient }: PendingByClientCardProps) {
  const [all, setAll] = useState(false);
  const ranking = summary ? clientPendingRanking(summary.openByClient, all ? Number.MAX_SAFE_INTEGER : TOP) : null;
  const t = ranking?.totals;
  const subtitle = !t
    ? 'Clientes com tarefas em aberto'
    : t.clients === 0
      ? 'Nenhum cliente com tarefas em aberto'
      : `${pluralize(t.clients, 'cliente', 'clientes')} com ${pluralize(t.open, 'tarefa em aberto', 'tarefas em aberto')}${t.overdue ? ` · ${pluralize(t.overdue, 'atrasada', 'atrasadas')} em ${pluralize(t.overdueClients, 'cliente', 'clientes')}` : ''}`;

  return (
    <Card className="@container p-5" aria-busy={summary ? undefined : true}>
      <CardHeader
        title="Pendências por cliente"
        subtitle={subtitle}
        info="Tarefas e obrigações em aberto de cada cliente, com os mesmos filtros da lista (exceto a situação). Clique num cliente para filtrar a lista."
        action={
          client ? (
            <Button variant="ghost" size="sm" className="-mt-1 -mr-2" onClick={() => onClient('')}>
              <X /> Limpar cliente
            </Button>
          ) : null
        }
      />
      {!ranking ? (
        <div className="mt-4 grid gap-x-8 gap-y-2 @3xl:grid-cols-2" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : ranking.rows.length === 0 ? (
        <EmptyState className="mt-4 py-8" icon={<Building2 />} title="Nenhuma pendência de cliente" description="Quando houver tarefas em aberto para clientes, o ranking aparece aqui." />
      ) : (
        <>
          <ol className="-mx-2 mt-3 grid gap-x-8 @3xl:grid-flow-col @3xl:grid-cols-2" style={{ gridTemplateRows: `repeat(${Math.ceil(ranking.rows.length / 2)}, auto)` }} aria-label="Ranking de pendências por cliente (filtra a lista)">
            {ranking.rows.map((r) => {
              const pressed = client === r.id;
              return (
                <li key={r.id} className="min-w-0">
                  <button
                    type="button"
                    aria-pressed={pressed}
                    aria-label={`${r.rank}º ${r.name}: ${r.open} em aberto${r.overdue ? `, ${r.overdue} ${r.overdue === 1 ? 'atrasada' : 'atrasadas'}` : ''}. ${pressed ? 'Remover o filtro' : 'Filtrar a lista'}.`}
                    onClick={() => onClient(pressed ? '' : r.id)}
                    className={cn(
                      'grid min-h-11 w-full items-center gap-x-3 px-2 py-1.5 text-left',
                      'grid-cols-[1.25rem_minmax(0,1fr)_4.5rem] [grid-template-areas:"rank_name_total"_"._bar_bar"]',
                      '@md:grid-cols-[1.25rem_minmax(0,12rem)_minmax(0,1fr)_4.5rem] @md:[grid-template-areas:"rank_name_bar_total"]',
                      toggleClass,
                    )}
                  >
                    <span className="tabular text-caption text-subtle [grid-area:rank]">{r.rank}</span>
                    <span className={cn('truncate text-body-sm text-fg [grid-area:name]', pressed && 'font-semibold')}>{r.name}</span>
                    <span className="mt-1 flex h-2 min-w-0 [grid-area:bar] @md:mt-0" aria-hidden>
                      <span className="flex h-full overflow-hidden rounded-full" style={{ width: `${r.share * 100}%` }}>
                        {r.overdueShare < 1 ? <span className="h-full flex-1 bg-data" /> : null}
                        {r.overdue > 0 ? <span className="h-full bg-danger" style={{ width: `${r.overdueShare * 100}%`, marginLeft: r.overdueShare < 1 ? 2 : 0 }} /> : null}
                      </span>
                    </span>
                    <span className="flex flex-col items-end leading-tight [grid-area:total]">
                      <span className="tabular text-body-sm font-semibold text-fg">{r.open}</span>
                      {r.overdue ? (
                        <span className="tabular text-mini whitespace-nowrap text-danger">
                          {r.overdue} {r.overdue === 1 ? 'atrasada' : 'atrasadas'}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-caption text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-data" aria-hidden /> em aberto
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-danger" aria-hidden /> atrasadas
            </span>
            {ranking.internal > 0 ? <span>{pluralize(ranking.internal, 'interna', 'internas')} (sem cliente) fora do ranking</span> : null}
            {ranking.hidden > 0 || all ? (
              <Button variant="link" size="sm" className="ml-auto text-caption" onClick={() => setAll((v) => !v)}>
                {all ? 'Mostrar os 10 primeiros' : `Ver todos (${ranking.totals.clients})`}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </Card>
  );
}
