// Pieces shared by the widget files: list skeleton and empty state. Transaction lists use the same
// row as Contas a pagar (TransactionRow, compact density).

import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Placeholder rows filling the body while a list loads. */
export function ListSkeleton({ rowClassName = 'h-10' }: { rowClassName?: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className={cn('w-full shrink-0', rowClassName)} />
      ))}
    </div>
  );
}

/** Empty state that takes the card body, without a second frame (the card already is one). */
export function BodyEmpty(props: Parameters<typeof EmptyState>[0]) {
  return <EmptyState {...props} compact framed={false} className={cn('min-h-0 flex-1 overflow-hidden py-3', props.className)} />;
}
