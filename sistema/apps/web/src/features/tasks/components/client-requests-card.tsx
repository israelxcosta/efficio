import { TASK_REQUEST_CHANNEL_LABELS } from '@effinance/shared';
import { AsideCard } from '@/components/layout/page-with-aside';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, pluralize } from '@/lib/utils';
import { useTasks } from '../api';
import { useTaskSheetLinks } from '../task-links';

// "Pedidos dos clientes" (right column of the Início): open tasks with "Pedido por" (WhatsApp, e-mail,
// phone…); the client portal will add its own requests there.

/** Open tasks a client asked for ("Pedido por"): the portal's requests will land here too. */
export function ClientRequestsCard() {
  const requests = useTasks({
    scope: 'all',
    situation: 'open',
    requestChannel: 'any',
    page: 1,
    pageSize: 5,
  });
  const { openTask } = useTaskSheetLinks();
  return (
    <AsideCard
      title="Pedidos dos clientes"
      meta={requests.data ? pluralize(requests.data.total, 'aberto', 'abertos') : undefined}
    >
      {!requests.data ? (
        <Skeleton className="h-16 w-full" />
      ) : requests.data.items.length === 0 ? (
        <p className="py-1 text-caption text-muted">
          Nenhum pedido em aberto. Marque “Pedido por” na tarefa quando o cliente pedir por
          WhatsApp, e-mail ou telefone.
        </p>
      ) : (
        <ul className="flex flex-col">
          {requests.data.items.map((t) => (
            <li key={t.id} className="border-t border-surface-muted first:border-t-0">
              <button
                type="button"
                onClick={() => openTask(t.id)}
                className="block w-full py-2 text-left"
              >
                <span
                  className={cn(
                    'block truncate text-caption font-semibold text-fg',
                    t.overdue && 'text-danger',
                  )}
                >
                  {t.title}
                </span>
                <span className="block truncate text-mini text-muted">
                  {t.client?.name ?? 'Interna'}
                  {t.requestChannel ? ` · ${TASK_REQUEST_CHANNEL_LABELS[t.requestChannel]}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </AsideCard>
  );
}
