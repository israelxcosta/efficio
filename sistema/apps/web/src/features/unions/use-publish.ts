import { useCallback } from 'react';
import { toast } from 'sonner';
import { toastError } from '@/lib/notify';
import { usePublishConvention } from './api';

/**
 * "Marcar 2026/2027 como publicada" (lists, deadlines sheet): saved at once, with "Desfazer" in the
 * toast (spec §6.10, §13.7). Needs `registry` (the menus only offer it then).
 */
export function usePublishAction() {
  const publish = usePublishConvention();
  const run = useCallback(
    async (union: { id: string; name: string }, cycle: { year: number; label: string }) => {
      try {
        await publish.mutateAsync({ id: union.id, year: cycle.year, published: true });
        toast.success(`Convenção ${cycle.label} do ${union.name} marcada como publicada.`, {
          action: {
            label: 'Desfazer',
            onClick: () =>
              void publish
                .mutateAsync({ id: union.id, year: cycle.year, published: false })
                .then(() => toast.success('Marcação desfeita.'))
                .catch(toastError),
          },
        });
      } catch (error) {
        toastError(error);
      }
    },
    [publish],
  );
  return { publish: run, pending: publish.isPending };
}
