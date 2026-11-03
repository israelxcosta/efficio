import { useState } from 'react';
import type { TaskDetail } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useTaskHistory } from '../api';
import { commentTime, dateTimeBR } from '../format';
import { timelinePhrase } from '../timeline';

const VISIBLE = 5;

/**
 * History of the task as a timeline (spec §9.1, item 7): newest first, 5 visible and "Ver todo o
 * histórico (N)". Tasks older than phase 2 have no events: the three lines of phase 1 stay.
 */
export function TaskTimeline({ task }: { task: TaskDetail }) {
  const history = useTaskHistory(task.id);
  const [expanded, setExpanded] = useState(false);
  const items = history.data?.items ?? [];
  const shown = expanded ? items : items.slice(0, VISIBLE);
  const total = history.data?.total ?? items.length;

  let body;
  if (history.isPending) {
    body = (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando o histórico">
        {['w-3/4', 'w-2/3', 'w-1/2'].map((w) => (
          <Skeleton key={w} className={cn('h-3.5', w)} />
        ))}
      </div>
    );
  } else if (history.isError && !history.data) {
    body = (
      <p className="text-caption text-muted">
        Não foi possível carregar o histórico.{' '}
        <Button variant="link" size="sm" className="text-caption" onClick={() => void history.refetch()}>
          Tentar de novo
        </Button>
      </p>
    );
  } else if (items.length === 0) {
    body = <LegacyLines task={task} />;
  } else {
    body = (
      <>
        <ol aria-label="Histórico da tarefa" className="flex flex-col">
          {shown.map((item, i) => {
            const phrase = timelinePhrase(item);
            const last = i === shown.length - 1;
            return (
              <li key={item.id} className="grid grid-cols-[12px_minmax(0,1fr)] gap-3">
                <span className="relative flex justify-center" aria-hidden>
                  <span className={cn('relative z-10 mt-1.5 size-2 rounded-full', phrase.success ? 'bg-success' : 'bg-border-strong')} />
                  {!last ? <span className="absolute top-3.5 bottom-0 w-px bg-border" /> : null}
                </span>
                <div className={cn('min-w-0', !last && 'pb-3')}>
                  <p className="text-body-sm break-words text-fg">
                    {phrase.actor ? <span className="font-semibold">{phrase.actor} </span> : null}
                    {phrase.text}
                  </p>
                  <p className="text-caption text-subtle">
                    <time dateTime={item.createdAt}>
                      {commentTime(item.createdAt)} · {dateTimeBR(item.createdAt)}
                    </time>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        {total > VISIBLE ? (
          <Button variant="ghost" size="sm" className="self-start" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
            {expanded ? 'Mostrar menos' : `Ver todo o histórico (${total})`}
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <section className="flex flex-col gap-2.5 border-t border-border pt-4" aria-labelledby="task-history">
      <h3 id="task-history" className="text-body-sm font-semibold text-fg">
        Histórico
      </h3>
      {body}
    </section>
  );
}

/** What phase 1 recorded about a task: who created and concluded it, and the last change. */
function LegacyLines({ task }: { task: TaskDetail }) {
  const lines = [
    `Criada${task.createdBy ? ` por ${task.createdBy.name}` : ''} em ${dateTimeBR(task.createdAt)}`,
    task.completedAt ? `Concluída${task.completedBy ? ` por ${task.completedBy.name}` : ''} em ${dateTimeBR(task.completedAt)}` : null,
    task.updatedAt !== task.createdAt ? `Última alteração em ${dateTimeBR(task.updatedAt)}` : null,
  ].filter(Boolean);
  return (
    <ul className="flex flex-col gap-1">
      {lines.map((l) => (
        <li key={l} className="text-caption text-subtle">
          {l}
        </li>
      ))}
    </ul>
  );
}
