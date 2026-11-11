import { Link } from 'react-router';
import { ArrowUpRight, CircleCheck } from 'lucide-react';
import { formatDateBR, REWORK_PENALTY_OLDER, REWORK_PENALTY_RECENT, TASK_STATUS_LABELS, type ClientReworkResponse, type ReworkTask } from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { getIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';

const REWORK_HELP =
  'Tarefas abertas para o cliente em categorias marcadas "Conta como retrabalho" (canceladas e ocorrências de recorrentes não contam). Cada uma tira 40 pontos do score nos últimos 90 dias e 10 de 91 dias a 12 meses, até 200.';

/** "2 em 90 dias · 3 em 12 meses · −90 pontos no score". */
export function reworkSubtitle(data: ClientReworkResponse): string {
  const { last90Days, last12Months } = data.rework;
  return `${last90Days} em 90 dias · ${last12Months} em 12 meses${data.penalty > 0 ? ` · −${data.penalty} pontos no score` : ''}`;
}

/**
 * Card "Retrabalho" of the client report (spec §5.4): both windows and the points taken, the latest
 * tasks (opening day, title, category, status) with what each one takes, and "Abrir tarefa" when the
 * title can be read (`canOpen` and a title from the API: a member without access gets counts only).
 */
export function ReworkCardView({
  data,
  canOpen,
  loading,
  failed = false,
  categoriesLink = false,
  className,
}: {
  data: ClientReworkResponse | undefined;
  canOpen: boolean;
  loading: boolean;
  failed?: boolean;
  /** Link "Ver categorias" (Cadastros › Categorias), for who can open it. */
  categoriesLink?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn('flex flex-col p-5 print:break-inside-avoid', className)} aria-busy={loading && !data}>
      <CardHeader title="Retrabalho" subtitle={data ? reworkSubtitle(data) : failed ? undefined : 'Tarefas que contam como retrabalho'} info={REWORK_HELP} />
      {failed && !data ? (
        <p className="mt-4 text-body-sm text-muted">Não foi possível carregar o retrabalho agora.</p>
      ) : !data ? (
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-11 rounded-md" />
          <Skeleton className="h-11 rounded-md" />
        </div>
      ) : data.rework.last12Months === 0 ? (
        <EmptyState compact className="mt-4" icon={<CircleCheck />} title="Nenhum retrabalho nos últimos 12 meses" description="Nenhuma tarefa de categoria de retrabalho foi aberta para este cliente." />
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {data.rework.latest.map((task) => (
            <ReworkRow key={task.id} task={task} recent={task.date >= data.windows.recentFrom} canOpen={canOpen} />
          ))}
        </ul>
      )}
      {data && data.rework.last12Months > 0 ? (
        <p className="mt-auto pt-3 text-caption text-subtle">
          {`Tarefas das categorias marcadas "Conta como retrabalho": −${REWORK_PENALTY_RECENT} por tarefa nos últimos 90 dias e −${REWORK_PENALTY_OLDER} pelas de até 12 meses (até −200).`}
          {categoriesLink ? (
            <>
              {' '}
              <Link to="/tarefas/cadastros?aba=categorias" className="font-medium text-brand-text hover:underline print:hidden">
                Ver categorias
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </Card>
  );
}

function ReworkRow({ task, recent, canOpen }: { task: ReworkTask; recent: boolean; canOpen: boolean }) {
  const Icon = getIcon(task.category.icon);
  const linkable = canOpen && task.title !== null;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 py-2.5">
      <span className="truncate text-body-sm text-fg" title={task.title ?? undefined}>
        {task.title ?? `Tarefa de ${task.category.name}`}
      </span>
      <span className="flex items-baseline justify-end gap-1.5 whitespace-nowrap">
        {recent ? null : <span className="text-micro text-subtle">há mais de 90 dias</span>}
        <span className="tabular text-body-sm font-semibold text-danger">{`−${recent ? REWORK_PENALTY_RECENT : REWORK_PENALTY_OLDER}`}</span>
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-caption text-muted">
        <span className="tabular">{`Aberta em ${formatDateBR(task.date)}`}</span>
        <span aria-hidden>·</span>
        <Badge tone="warning" className="[&_svg]:size-3">
          <Icon aria-hidden />
          {task.category.name}
        </Badge>
        <span aria-hidden>·</span>
        <span>{TASK_STATUS_LABELS[task.status]}</span>
      </span>
      <span className="text-right">
        {linkable ? (
          <Link to={`/tarefas?tarefa=${encodeURIComponent(task.id)}`} className="inline-flex items-center gap-0.5 text-caption font-medium text-brand-text hover:underline print:hidden">
            Abrir tarefa <ArrowUpRight className="size-3" aria-hidden />
          </Link>
        ) : null}
      </span>
    </li>
  );
}
