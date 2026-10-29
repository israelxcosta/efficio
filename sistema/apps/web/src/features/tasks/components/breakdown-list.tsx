import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface BreakdownRow {
  key: string;
  label: string;
  leading?: ReactNode;
  /** Open and not overdue. */
  open: number;
  overdue: number;
  href?: string;
  /** Tooltip of the name (e.g. the client's responsible in the department). */
  hint?: string;
  /** Names that are not a person or a client ("Sem responsável", "Interna"). */
  muted?: boolean;
}

/**
 * Load per person or client (spec §6.6, §14.1): name, a stacked bar without track (open in the data
 * tone, overdue in danger; the largest fills the room), the total in ink and "N atrasadas". Each row is
 * a link to the filtered list.
 */
export function BreakdownItem({ row, max }: { row: BreakdownRow; max: number }) {
  const total = row.open + row.overdue;
  const label = `${row.label}: ${total} em aberto${row.overdue ? `, ${row.overdue} ${row.overdue === 1 ? 'atrasada' : 'atrasadas'}` : ''}`;
  const name = <span className={cn('truncate text-body-sm', row.muted ? 'text-subtle' : 'text-fg')}>{row.label}</span>;
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-2 [grid-area:name]">
        {row.leading}
        {row.hint ? (
          <Tooltip content={row.hint}>
            <span className="min-w-0 truncate">{name}</span>
          </Tooltip>
        ) : (
          name
        )}
      </span>
      <span className="mt-1 flex h-2 min-w-0 overflow-hidden [grid-area:bar] @md:mt-0" aria-hidden>
        {row.open > 0 ? <span className="h-full rounded-l-full bg-data last:rounded-r-full" style={{ width: `${(row.open / max) * 100}%` }} /> : null}
        {row.overdue > 0 ? (
          <span className="h-full rounded-r-full bg-danger first:rounded-l-full" style={{ width: `${(row.overdue / max) * 100}%`, marginLeft: row.open ? 2 : 0 }} />
        ) : null}
      </span>
      <span className="flex flex-col items-end leading-tight [grid-area:total]">
        <span className="tabular text-body-sm font-semibold text-fg">{total}</span>
        {row.overdue ? (
          <span className="tabular text-mini whitespace-nowrap text-danger">
            {row.overdue} {row.overdue === 1 ? 'atrasada' : 'atrasadas'}
          </span>
        ) : null}
      </span>
    </>
  );
  // Narrow cards: name and total on top, the bar below; from 448px, one line.
  const cls = cn(
    'grid min-h-11 w-full items-center gap-x-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-muted',
    "grid-cols-[minmax(0,1fr)_4.5rem] [grid-template-areas:'name_total'_'bar_bar']",
    "@md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_4.5rem] @md:[grid-template-areas:'name_bar_total']",
  );
  return row.href ? (
    <Link to={row.href} aria-label={`${label}. Ver na lista de tarefas.`} className={cls}>
      {content}
    </Link>
  ) : (
    <div className={cls} aria-label={label}>
      {content}
    </div>
  );
}
