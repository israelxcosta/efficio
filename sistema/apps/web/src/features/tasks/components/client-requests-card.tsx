import { TASK_REQUEST_CHANNEL_LABELS } from '@effinance/shared';
import { BodyEmpty, ListSkeleton } from '@/features/dashboard/widgets/shared';
import { WidgetCard } from '@/features/dashboard/layout/widget-card';
import { pluralize } from '@/lib/utils';
import { useTasks } from '../api';
import { useTaskSheetLinks } from '../task-links';
import { tasksHref } from '../url-state';
import { SlotList } from './dash-slot';

/**
 * "Pedidos dos clientes" (a card of the Início): open tasks with "Pedido por" (WhatsApp, e-mail,
 * phone…); the client portal will add its own requests here.
 */
export function ClientRequestsCard() {
  const requests = useTasks({ scope: 'all', situation: 'open', requestChannel: 'any', page: 1, pageSize: 8 });
  const { openTask } = useTaskSheetLinks();
  const data = requests.data;
  return (
    <WidgetCard
      title="Pedidos dos clientes"
      subtitle={data ? (data.total ? `${pluralize(data.total, 'pedido aberto', 'pedidos abertos')}` : 'Nenhum pedido em aberto') : 'Tarefas com “Pedido por”'}
      info="Tarefas abertas que o cliente pediu (campo “Pedido por” na tarefa: WhatsApp, e-mail, telefone…). Os pedidos do futuro portal do cliente também entram aqui."
    >
      {!data ? (
        <ListSkeleton rowClassName="h-9" />
      ) : data.items.length === 0 ? (
        <BodyEmpty title="Nenhum pedido em aberto" description="Marque “Pedido por” na tarefa quando o cliente pedir por WhatsApp, e-mail ou telefone." />
      ) : (
        <SlotList
          cap={5}
          items={data.items}
          total={data.total}
          getKey={(t) => t.id}
          moreLabel={['pedido', 'pedidos']}
          moreHref={tasksHref({ scope: 'all', situation: 'open' })}
          renderItem={(t) => (
            <button type="button" onClick={() => openTask(t.id)} className="block w-full rounded-md px-1 py-1.5 text-left hover:bg-surface-muted">
              <span className="block truncate text-body-sm font-semibold text-fg">{t.title}</span>
              <span className="block truncate text-caption text-muted">
                {t.client?.name ?? 'Interna'}
                {t.requestChannel ? ` · ${TASK_REQUEST_CHANNEL_LABELS[t.requestChannel]}` : ''}
              </span>
            </button>
          )}
        />
      )}
    </WidgetCard>
  );
}
