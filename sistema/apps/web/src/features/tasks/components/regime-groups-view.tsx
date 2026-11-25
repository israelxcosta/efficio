import { useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { Check, ChevronDown, ChevronRight, CircleDashed, CirclePlus, Layers, ListPlus, MinusCircle, MoreHorizontal, Plus, Power, RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  RECURRENCE_PERIOD_LABELS,
  type RecurrencePeriod,
  type RegimeGroup,
  type RegimeGroupExcludedItem,
  type RegimeGroupItemView,
  type RegimeGroupOwnTask,
  type RegimeGroupRegime,
} from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/misc';
import { Field, Input } from '@/components/ui/input';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { gateFor, usePermissions, WriteGate } from '@/features/auth/permissions';
import { toastError } from '@/lib/notify';
import { cn, pluralize } from '@/lib/utils';
import { useApplyRegimeGroup, useEditRegimeGroup, useRecurringTasks, useRegimeGroups, useTaskOptions } from '../api';
import { MemberPicker } from './pickers';
import { dueRuleText } from '../recurring-rules';
import {
  applyInput,
  applyPreview,
  applyResultText,
  changeResultText,
  companiesText,
  excludeEffect,
  excludeInput,
  ownRows,
  includeCandidates,
  ITEM_STATE_LABELS,
  itemState,
  overdueOnApply,
  overdueText,
  type ExcludeTarget,
  type RegimeItemState,
} from '../regime-groups-logic';

const STATE_STYLE: Record<RegimeItemState, { tone: 'success' | 'neutral' | 'warning' | 'brand'; icon: typeof Check }> = {
  applied: { tone: 'success', icon: Check },
  missing: { tone: 'neutral', icon: CircleDashed },
  addRegime: { tone: 'brand', icon: CirclePlus },
  ended: { tone: 'warning', icon: Power },
  handmade: { tone: 'neutral', icon: Check },
};

interface RegimeGroupsViewProps {
  regime: RegimeGroupRegime;
  onRegime: (r: RegimeGroupRegime) => void;
  /** Opens the registry of a recurring task (the sheet of the page). */
  onOpenRecurring: (id: string) => void;
  /** "Incluir tarefa › Nova tarefa recorrente": the registry sheet with the regime checked. */
  onNewRecurring: (regime: RegimeGroupRegime) => void;
}

/**
 * "Grupos por regime": the default obligations of Simples Nacional, MEI, Lucro Presumido and Lucro
 * Real, how many companies each regime has and what the office already applied. "Aplicar grupo"
 * (`registry`) creates the missing recurring tasks — they generate, every month, one task for each
 * active company of the regime (including the ones that join later).
 */
export function RegimeGroupsView({ regime, onRegime, onOpenRecurring, onNewRecurring }: RegimeGroupsViewProps) {
  const query = useRegimeGroups();
  const data = query.data;
  const group = data?.groups.find((g) => g.regime === regime) ?? data?.groups[0];

  return (
    <div className="flex flex-col gap-5">
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
            <GroupDetail key={group.regime} group={group} usesDepartments={data.usesDepartments} onOpenRecurring={onOpenRecurring} onNewRecurring={onNewRecurring} />
          )}
        </>
      )}
    </div>
  );
}

function RegimeChoice({ group: g, selected, onSelect }: { group: RegimeGroup; selected: boolean; onSelect: () => void }) {
  const total = g.items.length;
  // Covered: applied from the catalog or already made by hand (same name).
  const applied = g.items.filter((i) => i.state === 'applied' || i.state === 'handmade').length;
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
      <span className="truncate text-body-sm font-semibold text-fg">{g.label}</span>
      <span className="mt-0.5 truncate text-mini text-muted">{companiesText(g.clientCount)}</span>
      <span className="mt-3 flex items-center gap-2">
        <span className="block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
          <span className={cn('block h-full rounded-full', g.missing === 0 ? 'bg-success' : 'bg-data')} style={{ width: `${total ? (applied / total) * 100 : 0}%` }} />
        </span>
        <span className="tabular shrink-0 text-mini font-medium text-fg">
          {applied}/{total}
        </span>
      </span>
      <span className={cn('mt-1 truncate text-mini', g.missing ? 'text-muted' : 'text-success')}>{g.missing ? `${pluralize(g.missing, 'falta', 'faltam')} aplicar` : 'Grupo aplicado'}</span>
    </button>
  );
}

function GroupDetail({
  group: g,
  usesDepartments,
  onOpenRecurring,
  onNewRecurring,
}: {
  group: RegimeGroup;
  usesDepartments: boolean;
  onOpenRecurring: (id: string) => void;
  onNewRecurring: (regime: RegimeGroupRegime) => void;
}) {
  const permissions = usePermissions();
  const { canManage } = permissions;
  const gate = gateFor(permissions, 'admin');
  const apply = useApplyRegimeGroup();
  const edit = useEditRegimeGroup();
  const [confirming, setConfirming] = useState(false);
  const [createHandmade, setCreateHandmade] = useState(false);
  const [nextMonth, setNextMonth] = useState(false);
  // Default responsible of the recurring tasks created ('' = you, the API's default).
  const [assigneeId, setAssigneeId] = useState('');
  const options = useTaskOptions();
  const [picking, setPicking] = useState(false);
  const [excluding, setExcluding] = useState<ExcludeTarget | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const preview = applyPreview(g, usesDepartments);
  const overdue = overdueOnApply(g, createHandmade);
  const twins = preview.handmade;
  const pending = preview.create + preview.addRegime + twins.length;
  const creates = preview.create + (createHandmade ? twins.length : 0);
  // Members without `registry` do not see the row menus; an inactive subscription disables them.
  const canEdit = !gate.hidden && !gate.reason;

  async function confirm() {
    try {
      const res = await apply.mutateAsync({ regime: g.regime, input: { ...applyInput(g, createHandmade, nextMonth ? 'next' : 'current'), ...(assigneeId ? { assigneeId } : {}) } });
      toast.success(applyResultText(res, g.label), { duration: 7000 });
      setConfirming(false);
    } catch (error) {
      toastError(error);
    }
  }

  async function exclude() {
    if (!excluding) return;
    const name = excluding.kind === 'item' ? excluding.item.name : excluding.name;
    try {
      let res = await edit.mutateAsync({ action: 'exclude', regime: g.regime, body: excludeInput(excluding) });
      // "Existe (à mão)": the hand-made twin is the row's task, so it leaves the regime too.
      const twin = excluding.kind === 'item' ? excluding.item.handmade : null;
      if (twin && twin.active && twin.regimes.includes(g.regime)) {
        res = await edit.mutateAsync({ action: 'exclude', regime: g.regime, body: { recurringTaskId: twin.id } });
      }
      toast.success(changeResultText('exclude', res, name, g.label), { duration: res.change === 'ended' ? 8000 : 4000 });
      setExcluding(null);
    } catch (error) {
      toastError(error);
    }
  }

  async function restore(item: RegimeGroupExcludedItem) {
    setRestoring(item.key);
    try {
      const res = await edit.mutateAsync({ action: 'restore', regime: g.regime, body: { key: item.key } });
      toast.success(changeResultText('restore', res, item.name, g.label));
    } catch (error) {
      toastError(error);
    } finally {
      setRestoring(null);
    }
  }

  const own = ownRows(g);
  const empty = g.items.length === 0 && own.length === 0;

  return (
    <Card className="@container overflow-hidden">
      <div className="border-b border-border p-5">
        <CardHeader
          className="@max-xl:flex-col"
          title={`Grupo ${g.label}`}
          info="Aplicado o grupo, cada obrigação vira uma tarefa recorrente que gera todo mês uma tarefa para cada empresa ativa do regime, inclusive as cadastradas depois. Os prazos são sugestões: ajuste depois de aplicar."
          subtitle={`${companiesText(g.clientCount)} no regime · ${g.items.filter((i) => i.state === 'applied' || i.state === 'handmade').length} de ${pluralize(g.items.length, 'obrigação em uso', 'obrigações em uso')}`}
          action={
            <div className="flex shrink-0 flex-wrap gap-2 @xl:justify-end">
              <WriteGate scope="admin">
                <IncludeMenu onNew={() => onNewRecurring(g.regime)} onExisting={() => setPicking(true)} />
              </WriteGate>
              <WriteGate scope="admin">
                <Button size="sm" className="shrink-0" disabled={pending === 0} onClick={() => setConfirming(true)}>
                  <Layers /> {pending === 0 ? 'Grupo aplicado' : 'Aplicar grupo'}
                </Button>
              </WriteGate>
            </div>
          }
        />
      </div>
      <div className="hidden items-center gap-3 border-b border-border px-5.5 py-2.5 text-mini font-medium text-muted @3xl:flex">
        <span className="flex-1">Obrigação</span>
        <span className="w-36">Departamento</span>
        <span className="w-48">Prazo legal</span>
        <span className="w-44">Situação</span>
        {canEdit ? <span className="w-8" aria-hidden /> : null}
      </div>
      {empty ? (
        <EmptyState className="m-3" icon={<Layers />} title="Nenhuma tarefa neste grupo" />
      ) : (
        <ul className="p-1.5">
          {g.items.map((item) => (
            <GroupItemRow
              key={item.key}
              item={item}
              usesDepartments={usesDepartments}
              onOpenRecurring={onOpenRecurring}
              onExclude={canEdit ? () => setExcluding({ kind: 'item', item }) : undefined}
            />
          ))}
          {own.map((task) => (
            <OwnTaskRow
              key={task.id}
              task={task}
              usesDepartments={usesDepartments}
              onOpenRecurring={onOpenRecurring}
              onExclude={canEdit ? () => setExcluding({ kind: 'own', id: task.id, name: task.name }) : undefined}
            />
          ))}
        </ul>
      )}
      <RemovedItems
        items={g.excluded}
        open={showRemoved}
        onToggle={() => setShowRemoved((o) => !o)}
        onRestore={gate.hidden ? undefined : (item) => void restore(item)}
        disabledReason={gate.reason}
        restoring={restoring}
      />
      {!canManage ? <p className="border-t border-border px-5 py-3 text-caption text-muted">Os administradores editam e aplicam os grupos.</p> : null}

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
            <Button loading={apply.isPending} disabled={creates + preview.addRegime === 0} onClick={() => void confirm()}>
              Aplicar grupo
            </Button>
          </>
        }
      >
        <ul className="flex flex-col gap-2 text-body-sm text-fg">
          {creates ? <li>• {pluralize(creates, 'tarefa recorrente nova', 'tarefas recorrentes novas')}</li> : null}
          {preview.addRegime ? <li>• {pluralize(preview.addRegime, 'tarefa recorrente existente passa', 'tarefas recorrentes existentes passam')} a incluir {g.label}</li> : null}
          {preview.applied ? <li className="text-muted">• {pluralize(preview.applied, 'já aplicada fica como está', 'já aplicadas ficam como estão')}</li> : null}
          {preview.ended ? <li className="text-muted">• {pluralize(preview.ended, 'encerrada não é reaberta', 'encerradas não são reabertas')} (edite "Encerra em" para voltar)</li> : null}
          {preview.newDepartments.length ? <li>• Departamento criado: {preview.newDepartments.join(', ')}</li> : null}
        </ul>
        {twins.length ? (
          <div className="mt-3 rounded-lg border border-border bg-surface-muted p-3">
            <p className="text-body-sm text-fg">
              {twins.length === 1 ? 'Já existe uma tarefa recorrente feita à mão com o mesmo nome' : `Já existem ${twins.length} tarefas recorrentes feitas à mão com o mesmo nome`}: {twins.map((t) => t.existing).join(', ')}. Para não duplicar, {twins.length === 1 ? 'ela fica' : 'elas ficam'} de fora.
            </p>
            <label className="mt-2 flex items-center gap-2 text-body-sm text-fg">
              <Checkbox checked={createHandmade} onCheckedChange={setCreateHandmade} />
              Criar mesmo assim
            </label>
          </div>
        ) : null}
        {overdue.current > 0 ? (
          // QA #4: applied mid-month, the occurrences whose legal deadline already passed are born late.
          <div className="mt-3 rounded-lg border border-border bg-warning-soft p-3">
            <p className="text-body-sm text-fg">
              <strong className="font-semibold">{overdueText(overdue.current)}</strong>: o prazo legal já passou e elas entram atrasadas no acompanhamento.
            </p>
            <label className="mt-2 flex items-center gap-2 text-body-sm font-medium text-fg">
              <Checkbox checked={nextMonth} onCheckedChange={setNextMonth} />
              Começar no mês que vem
            </label>
            {nextMonth ? (
              <p className="mt-1.5 text-caption text-muted">
                {overdue.next
                  ? `As novas começam no mês que vem; ainda assim ${overdueText(overdue.next)}, porque as tarefas recorrentes existentes que passam a incluir o regime já rodam neste mês.`
                  : 'Nada é gerado neste mês: a primeira tarefa de cada obrigação sai no mês que vem.'}
              </p>
            ) : null}
          </div>
        ) : null}
        {creates > 0 && options.data ? (
          <Field className="mt-3" label="Responsável padrão" hint="Recebe as tarefas das recorrentes criadas agora. Dá para trocar em cada uma depois.">
            <MemberPicker value={assigneeId || options.data.me.id} onChange={setAssigneeId} members={options.data.members} meFirst />
          </Field>
        ) : null}
        <p className="mt-3 text-caption text-muted">Prazos, metas e responsável padrão são sugestões; ajuste em cada tarefa recorrente depois de aplicar. Aplicar de novo não duplica nada.</p>
      </Modal>

      <Modal
        open={excluding !== null}
        onOpenChange={(o) => !edit.isPending && !o && setExcluding(null)}
        title={`Excluir “${excluding?.kind === 'item' ? excluding.item.name : (excluding?.name ?? '')}” do ${g.label}?`}
        description={excluding ? excludeEffect(excluding, g.regime, g.clientCount) : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setExcluding(null)} disabled={edit.isPending}>
              Cancelar
            </Button>
            <Button variant="danger" loading={edit.isPending} onClick={() => void exclude()}>
              Excluir do regime
            </Button>
          </>
        }
      />
      <IncludeExistingDialog open={picking} onOpenChange={setPicking} group={g} />
    </Card>
  );
}

/** "Incluir tarefa": a new recurring task of the regime or one of the registry. */
function IncludeMenu({ onNew, onExisting, disabled }: { onNew: () => void; onExisting: () => void; disabled?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button size="sm" variant="outline" disabled={disabled}>
          <Plus /> Incluir tarefa <ChevronDown className="-mr-1 text-muted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem icon={<Plus />} onSelect={onNew}>
          Nova tarefa recorrente
        </DropdownMenuItem>
        <DropdownMenuItem icon={<ListPlus />} onSelect={onExisting}>
          Tarefa recorrente existente…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "Tarefa recorrente existente…": the registry's active recurring tasks without the regime, with search. */
function IncludeExistingDialog({ open, onOpenChange, group: g }: { open: boolean; onOpenChange: (open: boolean) => void; group: RegimeGroup }) {
  const list = useRecurringTasks({ origin: 'registry', status: 'active' }, { enabled: open });
  const edit = useEditRegimeGroup();
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const candidates = includeCandidates(list.data?.items ?? [], g.regime, search);
  const total = includeCandidates(list.data?.items ?? [], g.regime).length;

  async function include(id: string, name: string) {
    setSaving(id);
    try {
      const res = await edit.mutateAsync({ action: 'include', regime: g.regime, body: { recurringTaskId: id } });
      toast.success(changeResultText('include', res, name, g.label));
      onOpenChange(false);
      setSearch('');
    } catch (error) {
      toastError(error);
    } finally {
      setSaving(null);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (saving) return;
        onOpenChange(o);
        if (!o) setSearch('');
      }}
      title={`Incluir no ${g.label}`}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input
          aria-label="Buscar tarefa recorrente"
          placeholder="Buscar tarefa recorrente…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>
      <div className="mt-3 max-h-[min(360px,55dvh)] overflow-y-auto">
        {list.isError && !list.data ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data ? (
          <SkeletonRows rows={4} />
        ) : candidates.length === 0 ? (
          <p className="px-1 py-6 text-center text-body-sm text-muted">
            {total === 0 ? `Todas as tarefas recorrentes ativas já estão no ${g.label}.` : 'Nada encontrado.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {candidates.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={saving !== null}
                  onClick={() => void include(r.id, r.name)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm font-semibold text-fg">{r.name}</span>
                    <span className="block truncate text-mini text-muted">
                      {r.department ? `${r.department.name} · ` : ''}
                      {dueText(r)}
                    </span>
                  </span>
                  {saving === r.id ? <span className="text-mini text-muted">Incluindo…</span> : <Plus className="size-4 shrink-0 text-muted" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function dueText(r: Parameters<typeof dueRuleText>[0]): string {
  // The registry's recurring tasks are never `daily`.
  return `${RECURRENCE_PERIOD_LABELS[r.period as RecurrencePeriod]} · ${dueRuleText(r).toLowerCase()}`;
}

function GroupItemRow({
  item,
  usesDepartments,
  onOpenRecurring,
  onExclude,
}: {
  item: RegimeGroupItemView;
  usesDepartments: boolean;
  onOpenRecurring: (id: string) => void;
  onExclude?: () => void;
}) {
  const state = itemState(item);
  const style = STATE_STYLE[state];
  const openId = item.recurringTask?.id ?? item.handmade?.id ?? null;
  const Icon = style.icon;
  const dept = !usesDepartments ? '—' : item.department.match ? item.department.match.name : `${item.department.name} (novo)`;
  return (
    <GroupRow
      name={item.name}
      openId={openId}
      onOpenRecurring={onOpenRecurring}
      sub={item.description}
      dept={dept}
      deptMuted={usesDepartments && !item.department.match}
      usesDepartments={usesDepartments}
      due={dueText(item)}
      status={
        <Badge tone={style.tone} className="inline-flex items-center gap-1" title={item.handmade ? `Feita à mão: ${item.handmade.name}` : undefined}>
          <Icon className="size-3" aria-hidden />
          {ITEM_STATE_LABELS[state]}
        </Badge>
      }
      onExclude={onExclude}
    />
  );
}

/** An own task of the group (made by hand, or included from the registry): "Do escritório". */
export function OwnTaskRow({
  task,
  usesDepartments,
  onOpenRecurring,
  onExclude,
}: {
  task: RegimeGroupOwnTask;
  usesDepartments: boolean;
  onOpenRecurring: (id: string) => void;
  onExclude?: () => void;
}) {
  return (
    <GroupRow
      name={task.name}
      badge={<Badge tone="brand">Do escritório</Badge>}
      openId={task.id}
      onOpenRecurring={onOpenRecurring}
      dept={usesDepartments ? (task.department?.name ?? '—') : '—'}
      usesDepartments={usesDepartments}
      due={dueText(task)}
      status={
        <Badge tone="success" className="inline-flex items-center gap-1">
          <Check className="size-3" aria-hidden />
          Em uso
        </Badge>
      }
      onExclude={onExclude}
    />
  );
}

function GroupRow({
  name,
  badge,
  openId,
  onOpenRecurring,
  sub,
  dept,
  deptMuted,
  usesDepartments,
  due,
  status,
  onExclude,
}: {
  name: string;
  badge?: ReactNode;
  openId: string | null;
  onOpenRecurring: (id: string) => void;
  sub?: string;
  dept: string;
  deptMuted?: boolean;
  usesDepartments: boolean;
  due: string;
  status: ReactNode;
  onExclude?: () => void;
}) {
  const title = openId ? (
    <button type="button" onClick={() => onOpenRecurring(openId)} className="block min-w-0 truncate text-left text-body-sm font-semibold text-fg hover:underline">
      {name}
    </button>
  ) : (
    <span className="block min-w-0 truncate text-body-sm font-semibold text-fg">{name}</span>
  );
  return (
    <li className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-muted @lg:px-4">
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          {title}
          {badge ? <span className="shrink-0">{badge}</span> : null}
        </span>
        {sub ? <span className="block truncate text-mini text-muted">{sub}</span> : null}
        <span className="block truncate text-mini text-muted @3xl:hidden">
          {usesDepartments ? `${dept} · ` : ''}
          {due}
        </span>
      </span>
      <span className={cn('hidden w-36 truncate text-body-sm @3xl:block', deptMuted ? 'text-muted' : 'text-fg')}>{dept}</span>
      <span className="hidden w-48 truncate text-body-sm text-fg @3xl:block">{due}</span>
      <span className="flex shrink-0 justify-end @3xl:w-44 @3xl:justify-start">{status}</span>
      {onExclude ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="-my-1 shrink-0" aria-label={`Ações de “${name}”`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem tone="danger" icon={<MinusCircle />} onSelect={onExclude}>
              Excluir do regime
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </li>
  );
}

/**
 * "Removidas (n)", collapsed under the table: the catalog items the office took out of the group, each
 * with "Restaurar" (back as "Falta"; `onRestore` absent without `registry`).
 */
export function RemovedItems({
  items,
  open,
  onToggle,
  onRestore,
  disabledReason,
  restoring,
}: {
  items: RegimeGroupExcludedItem[];
  open: boolean;
  onToggle: () => void;
  onRestore?: (item: RegimeGroupExcludedItem) => void;
  disabledReason?: string | null;
  restoring?: string | null;
}) {
  if (items.length === 0) return null;
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="border-t border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 px-5 py-3 text-left text-body-sm font-medium text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Chevron className="size-4" aria-hidden />
        Removidas ({items.length})
      </button>
      {open ? (
        <ul className="px-1.5 pb-1.5">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-muted @lg:px-4">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm font-medium text-muted line-through decoration-border-strong">{item.name}</span>
                <span className="block truncate text-mini text-muted">
                  {dueText(item)} · removida em {format(new Date(item.excludedAt), 'dd/MM/yyyy')}
                </span>
              </span>
              {onRestore ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={Boolean(disabledReason) || restoring === item.key}
                  loading={restoring === item.key}
                  title={disabledReason ?? undefined}
                  onClick={() => onRestore(item)}
                >
                  <RotateCcw /> Restaurar
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
