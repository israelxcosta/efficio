import { Fragment } from 'react';
import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTaskActions } from '@/features/tasks/task-actions';
import { cn } from '@/lib/utils';
import { useDeadlinesSummary } from '../api';
import { stripParts, stripTone } from '../deadline-logic';

/**
 * "Vencimentos: 2 documentos vencidos · 3 vencem em até 30 dias · convenção do SINDCOM vencida há 12
 * dias" (spec §6.10), between the summary and the first steps of the home page. Only when something is
 * overdue or due in up to 30 days; nothing while loading or on error (the bell keeps trying).
 */
export function DeadlineAlertStrip() {
  const summary = useDeadlinesSummary();
  const { openDeadlines } = useTaskActions();
  if (!summary.data) return null;
  const parts = stripParts(summary.data);
  if (!parts.length) return null;
  const tone = stripTone(summary.data);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-surface px-4 py-3 text-body-sm" role="status">
      <CircleAlert className={cn('size-4 shrink-0', tone === 'danger' ? 'text-danger' : 'text-warning')} aria-hidden />
      <p className="min-w-0 flex-1 basis-[16rem] text-muted">
        <strong className="font-semibold text-fg">Vencimentos:</strong>{' '}
        {parts.map((p, i) => (
          <Fragment key={`${p.kind}-${p.bucket}`}>
            {i ? <span aria-hidden> · </span> : null}
            <button
              type="button"
              onClick={() => openDeadlines(p.kind, p.bucket)}
              className="rounded-sm font-medium text-fg underline decoration-border-strong underline-offset-4 hover:decoration-fg"
            >
              {p.count !== null ? (
                <>
                  <span className={cn('tabular', p.bucket === 'overdue' && 'text-danger')}>{p.count}</span> {p.text}
                </>
              ) : (
                <span className={p.bucket === 'overdue' ? 'text-danger' : undefined}>{p.text}</span>
              )}
            </button>
          </Fragment>
        ))}
      </p>
      <Button variant="ghost" size="sm" className="-ml-2 sm:ml-auto" onClick={() => openDeadlines(parts[0]!.kind)}>
        Ver vencimentos
      </Button>
    </div>
  );
}
