import { useEffect, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { toast } from 'sonner';
import { conventionLabel, formatDateBR, monthName } from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/misc';
import { SkeletonRows } from '@/components/ui/skeleton';
import { usePermissions } from '@/features/auth/permissions';
import { adjustmentTitle } from '@/features/deadlines/deadline-logic';
import { useTaskSheetLinks } from '@/features/tasks/task-links';
import { toastError } from '@/lib/notify';
import { useSaveConventions, useUnion } from '../api';
import { cyclesChanged, cyclesForDialog, draftTracked, longDueDate, newlyPublished, toggleCycle, type CycleDraft } from '../union-logic';

/** Short name of who marked it: "Ana P.". */
function shortPerson(name: string): string {
  const [first, second] = name.split(/\s+/);
  return second ? `${first} ${second[0]}.` : (first ?? name);
}

/**
 * "Convenções coletivas · SINDCOM" (spec §13.7): the stored cycles plus the tracked one; checking the
 * last adds the next, unchecking removes the following unpublished ones. Saved together (substitutive).
 */
export function ConventionCyclesDialog({ unionId, onClose, onEdit }: { unionId: string | null; onClose: () => void; onEdit: (id: string) => void }) {
  const detail = useUnion(unionId);
  const union = unionId && detail.data?.id === unionId ? detail.data : null;
  const save = useSaveConventions();
  const { can, subscriptionActive } = usePermissions();
  const { newTask } = useTaskSheetLinks();
  const canEdit = can('registry');
  const [draft, setDraft] = useState<CycleDraft[]>([]);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (union) setDraft(cyclesForDialog(union.conventions, union.tracked?.year ?? null));
  }, [union]);

  const name = union ? (union.acronym ?? union.name) : '';
  const tracked = union ? draftTracked(union.baseMonth, draft, today) : null;
  const changed = union ? cyclesChanged(union.conventions, draft) : false;

  async function submit() {
    if (!union) return;
    try {
      const published = newlyPublished(union.conventions, draft);
      await save.mutateAsync({ id: union.id, input: { cycles: draft.map((c) => ({ year: c.year, published: c.published, note: c.note })) } });
      const last = published.length ? Math.max(...published) : null;
      toast.success('Convenções coletivas atualizadas.', {
        action:
          last !== null
            ? { label: 'Criar tarefa de reajuste', onClick: () => newTask({ title: adjustmentTitle(name, conventionLabel(last)) }) }
            : undefined,
      });
      onClose();
    } catch (error) {
      toastError(error);
    }
  }

  return (
    <Modal
      open={unionId !== null}
      onOpenChange={(o) => !o && onClose()}
      title={union ? `Convenções coletivas · ${name}` : 'Convenções coletivas'}
      description={union?.baseMonth ? `Data-base em ${monthName(union.baseMonth)!.toLowerCase()}.` : undefined}
      className="max-w-lg"
      footer={
        <div className="flex w-full flex-col gap-3">
          {union && tracked ? (
            <p className="text-caption text-muted">
              Acompanhando: Convenção Coletiva {tracked.label}, vence em {formatDateBR(tracked.dueDate)}.
            </p>
          ) : null}
          {!canEdit ? <p className="text-caption text-muted">Somente administradores marcam convenções.</p> : null}
          <div className="flex justify-end gap-2">
            {canEdit && union?.baseMonth ? (
              <>
                <Button variant="ghost" onClick={onClose}>
                  Cancelar
                </Button>
                <Button onClick={() => void submit()} loading={save.isPending} disabled={!changed || !subscriptionActive}>
                  Salvar convenções
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={onClose}>
                Fechar
              </Button>
            )}
          </div>
        </div>
      }
    >
      {unionId && detail.isPending ? (
        <SkeletonRows rows={3} />
      ) : detail.isError ? (
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      ) : union && !union.baseMonth ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-body-sm text-muted">
            Este sindicato ainda não tem o mês da data-base. Defina o mês no cadastro para acompanhar o vencimento.
          </p>
          {canEdit ? (
            <Button variant="outline" size="sm" onClick={() => onEdit(union.id)}>
              Editar sindicato
            </Button>
          ) : null}
        </div>
      ) : union ? (
        <div className="flex flex-col gap-3">
          <p className="text-caption text-muted">
            Marque a convenção que já foi publicada. Ao marcar, a do ano seguinte entra na lista e passa a ser acompanhada. Sem marcar, o sindicato continua no alerta, mesmo depois de vencido.
          </p>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {draft.map((c) => {
              const stored = union.conventions.find((s) => s.year === c.year);
              const id = `cycle-${c.year}`;
              const isTracked = tracked?.year === c.year;
              const sub = c.published
                ? stored?.published && stored.publishedBy
                  ? `publicada · marcada por ${shortPerson(stored.publishedBy.name)}${stored.publishedAt ? ` em ${formatDateBR(stored.publishedAt.slice(0, 10))}` : ''}`
                  : stored?.published
                    ? 'publicada'
                    : 'publicada · ao salvar'
                : `vence em ${longDueDate(c.year, union.baseMonth!)}`;
              return (
                <li key={c.year} className="flex min-h-14 items-center gap-3 px-3 py-2">
                  <Checkbox id={id} checked={c.published} disabled={!canEdit} onCheckedChange={(v) => setDraft((d) => toggleCycle(d, c.year, v))} />
                  <label htmlFor={id} className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-fg">Convenção Coletiva {conventionLabel(c.year)}</span>
                    <span className="block text-caption text-muted">{sub}</span>
                  </label>
                  {isTracked ? (
                    <Badge tone="neutral">Acompanhando</Badge>
                  ) : c.published ? (
                    <span className="flex items-center gap-1 text-caption font-medium text-success">
                      <CircleCheck className="size-3.5" aria-hidden /> <span className="max-sm:sr-only">Publicada</span>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </Modal>
  );
}
