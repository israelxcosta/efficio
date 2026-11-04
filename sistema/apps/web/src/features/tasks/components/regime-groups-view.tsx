import { useState } from 'react';
import { Check, CircleDashed, CirclePlus, Info, Layers, Power } from 'lucide-react';
import { toast } from 'sonner';
import { RECURRENCE_PERIOD_LABELS, type RegimeGroup, type RegimeGroupItemView, type RegimeGroupRegime } from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/misc';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { usePermissions, WriteGate } from '@/features/auth/permissions';
import { toastError } from '@/lib/notify';
import { cn, pluralize } from '@/lib/utils';
import { useApplyRegimeGroup, useRegimeGroups } from '../api';
import { dueRuleText } from '../recurring-rules';
import { applyPreview, applyResultText, companiesText, ITEM_STATE_LABELS, itemState, type RegimeItemState } from '../regime-groups-logic';

const STATE_STYLE: Record<RegimeItemState, { tone: 'success' | 'neutral' | 'warning' | 'brand'; icon: typeof Check }> = {
  applied: { tone: 'success', icon: Check },
  missing: { tone: 'neutral', icon: CircleDashed },
  addRegime: { tone: 'brand', icon: CirclePlus },
  ended: { tone: 'warning', icon: Power },
};

interface RegimeGroupsViewProps {
  regime: RegimeGroupRegime;
  onRegime: (r: RegimeGroupRegime) => void;
  /** Opens the registry of a recurring task (the sheet of the page). */
  onOpenRecurring: (id: string) => void;
}

/**
 * "Grupos por regime": the default obligations of Simples Nacional, MEI, Lucro Presumido and Lucro
 * Real, how many companies each regime has and what the office already applied. "Aplicar grupo"
 * (`registry`) creates the missing recurring tasks — they generate, every month, one task for each
 * active company of the regime (including the ones that join later).
 */
export function RegimeGroupsView({ regime, onRegime, onOpenRecurring }: RegimeGroupsViewProps) {
  const query = useRegimeGroups();
  const data = query.data;
  const group = data?.groups.find((g) => g.regime === regime) ?? data?.groups[0];

  return (
    <div className="flex flex-col gap-5">
      <p className="flex items-start gap-2 text-body-sm text-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Cada regime tem um grupo de obrigações padrão. Aplicado o grupo, cada obrigação vira uma tarefa recorrente que gera <span className="font-medium text-fg">todo mês uma tarefa para cada empresa ativa do regime</span> — inclusive as que forem cadastradas depois. Os prazos são sugestões: ajuste depois de aplicar.
        </span>
      </p>

      {query.isError && !data ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <div role="radiogroup" aria-label="Regime" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {!data
              ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)
              : data.groups.map((g) => <RegimeChoice key={g.regime} group={g} selected={g.regime === group?.regime} onSelect={() => onRegime(g.regime)} />)}
          </div>
          {!data || !group ? (
            <Card className="p-5">
              <SkeletonRows rows={6} />
            </Card>
          ) : (
            <GroupDetail group={group} usesDepartments={data.usesDepartments} onOpenRecurring={onOpenRecurring} />
          )}
        </>
      )}
    </div>
  );
}

function RegimeChoice({ group: g, selected, onSelect }: { group: RegimeGroup; selected: boolean; onSelect: () => void }) {
  const total = g.items.length;
  const applied = total - g.missing;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex min-w-0 flex-col rounded-xl border bg-surface p-4 text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <span className="truncate text-sm font-semibold text-fg">{g.label}</span>
      <span className="mt-0.5 truncate text-xs text-muted">{companiesText(g.clientCount)}</span>
      <span className="mt-3 flex items-center gap-2">
        <span className="block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
          <span className={cn('block h-full rounded-full', g.missing === 0 ? 'bg-success' : 'bg-data')} style={{ width: `${total ? (applied / total) * 100 : 0}%` }} />
        </span>
        <span className="tabular shrink-0 text-xs font-medium text-fg">
          {applied}/{total}
        </span>
      </span>
      <span className={cn('mt-1 truncate text-xs', g.missing ? 'text-muted' : 'text-success')}>{g.missing ? `${pluralize(g.missing, 'falta', 'faltam')} aplicar` : 'Grupo aplicado'}</span>
    </button>
  );
}

function GroupDetail({ group: g, usesDepartments, onOpenRecurring }: { group: RegimeGroup; usesDepartments: boolean; onOpenRecurring: (id: string) => void }) {
  const { canManage } = usePermissions();
  const apply = useApplyRegimeGroup();
  const [confirming, setConfirming] = useState(false);
  const preview = applyPreview(g, usesDepartments);
  const pending = preview.create + preview.addRegime;
  const catalogIds = new Set(g.items.map((i) => i.recurringTask?.id).filter(Boolean));
  const others = g.recurring.filter((r) => !catalogIds.has(r.id) && r.active);

  async function confirm() {
    try {
      const res = await apply.mutateAsync({ regime: g.regime });
      toast.success(applyResultText(res, g.label), { duration: 7000 });
      setConfirming(false);
    } catch (error) {
      toastError(error);
    }
  }

  return (
    <Card className="@container overflow-hidden">
      <div className="border-b border-border p-5">
        <CardHeader
          title={`Grupo ${g.label}`}
          subtitle={`${companiesText(g.clientCount)} no regime · ${g.items.length - g.missing} de ${pluralize(g.items.length, 'obrigação aplicada', 'obrigações aplicadas')}`}
          action={
            <WriteGate scope="admin">
              <Button size="sm" className="shrink-0" disabled={pending === 0} onClick={() => setConfirming(true)}>
                <Layers /> {pending === 0 ? 'Grupo aplicado' : 'Aplicar grupo'}
              </Button>
            </WriteGate>
          }
        />
      </div>
      <div className="hidden items-center gap-3 border-b border-border px-5.5 py-2.5 text-xs font-medium text-muted @3xl:flex">
        <span className="flex-1">Obrigação</span>
        <span className="w-36">Departamento</span>
        <span className="w-48">Prazo legal</span>
        <span className="w-44">Situação</span>
      </div>
      {g.items.length === 0 ? (
        <EmptyState className="m-3" icon={<Layers />} title="Nenhuma obrigação padrão neste regime" />
      ) : (
        <ul className="p-1.5">
          {g.items.map((item) => (
            <GroupItemRow key={item.key} item={item} usesDepartments={usesDepartments} onOpenRecurring={onOpenRecurring} />
          ))}
        </ul>
      )}
      {others.length ? (
        <p className="border-t border-border px-5 py-3 text-caption text-muted">
          Também se aplicam a este regime (cadastradas à mão): {others.map((r) => r.name).join(', ')}.
        </p>
      ) : null}
      {!canManage ? <p className="border-t border-border px-5 py-3 text-caption text-muted">Os administradores aplicam os grupos.</p> : null}

      <Modal
        open={confirming}
        onOpenChange={(o) => !apply.isPending && setConfirming(o)}
        title={`Aplicar o grupo ${g.label}?`}
        description={`Gera todo mês uma tarefa para cada uma das ${companiesText(g.clientCount)} do regime, e para as que entrarem depois.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={apply.isPending}>
              Cancelar
            </Button>
            <Button loading={apply.isPending} onClick={() => void confirm()}>
              Aplicar grupo
            </Button>
          </>
        }
      >
        <ul className="flex flex-col gap-2 text-body-sm text-fg">
          {preview.create ? <li>• {pluralize(preview.create, 'tarefa recorrente nova', 'tarefas recorrentes novas')}</li> : null}
          {preview.addRegime ? <li>• {pluralize(preview.addRegime, 'tarefa recorrente existente passa', 'tarefas recorrentes existentes passam')} a incluir {g.label}</li> : null}
          {preview.applied ? <li className="text-muted">• {pluralize(preview.applied, 'já aplicada fica como está', 'já aplicadas ficam como estão')}</li> : null}
          {preview.ended ? <li className="text-muted">• {pluralize(preview.ended, 'encerrada não é reaberta', 'encerradas não são reabertas')} (edite "Encerra em" para voltar)</li> : null}
          {preview.newDepartments.length ? <li>• Departamento criado: {preview.newDepartments.join(', ')}</li> : null}
        </ul>
        <p className="mt-3 text-caption text-muted">Prazos, metas e responsável padrão são sugestões; ajuste em cada tarefa recorrente depois de aplicar. Aplicar de novo não duplica nada.</p>
      </Modal>
    </Card>
  );
}

function GroupItemRow({ item, usesDepartments, onOpenRecurring }: { item: RegimeGroupItemView; usesDepartments: boolean; onOpenRecurring: (id: string) => void }) {
  const state = itemState(item);
  const style = STATE_STYLE[state];
  const Icon = style.icon;
  const due = `${RECURRENCE_PERIOD_LABELS[item.period]} · ${dueRuleText(item).toLowerCase()}`;
  const dept = !usesDepartments ? '—' : item.department.match ? item.department.match.name : `${item.department.name} (novo)`;
  const name = item.recurringTask ? (
    <button type="button" onClick={() => onOpenRecurring(item.recurringTask!.id)} className="block max-w-full truncate text-left text-sm font-semibold text-fg hover:underline">
      {item.name}
    </button>
  ) : (
    <span className="block truncate text-sm font-semibold text-fg">{item.name}</span>
  );
  return (
    <li className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-muted @lg:px-4">
      <span className="min-w-0 flex-1">
        {name}
        <span className="block truncate text-xs text-muted">{item.description}</span>
        <span className="block truncate text-xs text-muted @3xl:hidden">
          {usesDepartments ? `${dept} · ` : ''}
          {due}
        </span>
      </span>
      <span className={cn('hidden w-36 truncate text-body-sm @3xl:block', item.department.match || !usesDepartments ? 'text-fg' : 'text-muted')}>{dept}</span>
      <span className="hidden w-48 truncate text-body-sm text-fg @3xl:block">{due}</span>
      <span className="flex shrink-0 justify-end @3xl:w-44 @3xl:justify-start">
        <Badge tone={style.tone} className="inline-flex items-center gap-1">
          <Icon className="size-3" aria-hidden />
          {ITEM_STATE_LABELS[state]}
        </Badge>
      </span>
    </li>
  );
}
