import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight, Printer, ScrollText } from 'lucide-react';
import { formatMonthKey, type FeeAdjustment } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/misc';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { formatDateTime } from '@/lib/datetime';
import { cn, pluralize } from '@/lib/utils';
import { useFeeAdjustments } from '../api';
import { batchIndexLabel, formatBps } from '../logic';
import { lettersPath } from './apply-result';

const PAGE_SIZE = 10;
const NO_LETTERS = 'As vigências deste lote foram excluídas: não há cartas para imprimir.';

function Reprint({ batch }: { batch: FeeAdjustment }) {
  if (batch.clientCount === 0) {
    return (
      <Tooltip content={NO_LETTERS}>
        <span tabIndex={0} className="inline-flex cursor-not-allowed rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/25">
          <Button variant="outline" size="sm" disabled>
            <Printer /> Reimprimir cartas
          </Button>
        </span>
      </Tooltip>
    );
  }
  return (
    <Button variant="outline" size="sm" asChild>
      <Link to={lettersPath(batch.id)} aria-label={`Reimprimir cartas de ${formatMonthKey(batch.month).toLowerCase()}`}>
        <Printer /> Reimprimir cartas
      </Link>
    </Button>
  );
}

const clients = (b: FeeAdjustment) => (b.clientCount ? pluralize(b.clientCount, 'cliente', 'clientes') : 'Nenhum cliente');

/** The batches already applied, most recent first, with "Reimprimir cartas". */
export function HistoryList({ onStart }: { onStart: () => void }) {
  const [page, setPage] = useState(1);
  const list = useFeeAdjustments({ page, pageSize: PAGE_SIZE });
  const data = list.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Card className="@container overflow-hidden">
      <div className="border-b border-border p-5">
        <h2 className="text-title-sm font-semibold tracking-tight text-fg">Lotes aplicados</h2>
        <p className="mt-0.5 text-xs text-muted">{data?.total ? `${pluralize(data.total, 'reajuste', 'reajustes')} em lote, o mais recente primeiro.` : 'Cada reajuste aplicado fica aqui, com as cartas.'}</p>
      </div>
      {list.isPending ? (
        <SkeletonRows rows={4} className="p-4" />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} className="m-4" />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          className="m-4"
          icon={<ScrollText />}
          title="Nenhum reajuste aplicado ainda"
          description="Depois de aplicar um reajuste em lote, ele aparece aqui com as cartas para reimprimir."
          action={
            <Button variant="outline" onClick={onStart}>
              Fazer um reajuste
            </Button>
          }
        />
      ) : (
        <div className={cn('transition-opacity', list.isPlaceholderData && 'opacity-60')} aria-busy={list.isPlaceholderData || undefined}>
          <ul className="divide-y divide-border @2xl:hidden">
            {data.items.map((b) => (
              <li key={b.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-fg">{formatMonthKey(b.month)}</span>
                  <span className="text-sm font-semibold text-fg tabular">
                    {formatBps(b.appliedBps)} <span className="font-normal text-muted">· {batchIndexLabel(b)}</span>
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {clients(b)} · {b.appliedBy.name} em {formatDateTime(b.createdAt)}
                </p>
                <div>
                  <Reprint batch={b} />
                </div>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-sm @2xl:table">
            <caption className="sr-only">Reajustes em lote aplicados</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted">
                <th scope="col" className="py-2.5 pr-3 pl-5">
                  Mês das vigências
                </th>
                <th scope="col" className="px-3 py-2.5 text-right">
                  Percentual
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Índice
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Clientes
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Aplicado por
                </th>
                <th scope="col" className="py-2.5 pr-5 pl-3 text-right">
                  <span className="sr-only">Cartas</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0">
                  <td className="py-3 pr-3 pl-5 font-semibold whitespace-nowrap text-fg">{formatMonthKey(b.month)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-fg tabular">{formatBps(b.appliedBps)}</td>
                  <td className="px-3 py-3">
                    {batchIndexLabel(b)}
                    {!b.adjustEmployeeFee ? <span className="block text-xs text-muted">taxa por empregado mantida</span> : null}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{clients(b)}</td>
                  <td className="px-3 py-3">
                    <span className="block">{b.appliedBy.name}</span>
                    <span className="block text-xs text-muted tabular">{formatDateTime(b.createdAt)}</span>
                  </td>
                  <td className="py-3 pr-5 pl-3 text-right">
                    <Reprint batch={b} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.total > PAGE_SIZE ? (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
          <span>
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Página anterior">
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Próxima página">
              <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
