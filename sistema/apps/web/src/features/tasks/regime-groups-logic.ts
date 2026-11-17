// Tarefas recorrentes › "Grupos por regime": the URL of the view, the state of each catalog item in the
// office and the wording of applying a group. Pure functions, tested in regime-groups.test.ts.

import {
  REGIME_GROUP_REGIMES,
  type RecurringTask,
  type RegimeGroup,
  type RegimeGroupApplyResponse,
  type RegimeGroupChangeResponse,
  type RegimeGroupFromMonth,
  type RegimeGroupItemView,
  type RegimeGroupRegime,
} from '@effinance/shared';
import { pluralize } from '@/lib/utils';

export type RecurringView = 'list' | 'regimes';

const REGIME_PARAM: Record<RegimeGroupRegime, string> = {
  simples_nacional: 'simples',
  mei: 'mei',
  presumed_profit: 'presumido',
  real_profit: 'real',
};

export function regimeFromParam(value: string | null): RegimeGroupRegime {
  return REGIME_GROUP_REGIMES.find((r) => REGIME_PARAM[r] === value) ?? 'simples_nacional';
}

/** `visao=regimes&grupo=presumido` (the hub's "Grupo por regime" links here). */
export function parseRecurringView(params: URLSearchParams): { view: RecurringView; regime: RegimeGroupRegime } {
  return { view: params.get('visao') === 'regimes' ? 'regimes' : 'list', regime: regimeFromParam(params.get('grupo')) };
}

export function writeRecurringView(params: URLSearchParams, patch: { view?: RecurringView; regime?: RegimeGroupRegime }): URLSearchParams {
  const next = new URLSearchParams(params);
  if (patch.view === 'list') {
    next.delete('visao');
    next.delete('grupo');
    return next;
  }
  if (patch.view === 'regimes') next.set('visao', 'regimes');
  if (patch.regime) next.set('grupo', REGIME_PARAM[patch.regime]);
  return next;
}

export type RegimeItemState = 'applied' | 'missing' | 'addRegime' | 'ended' | 'handmade';

/**
 * The server's state of an item (`RegimeGroupItemView.state`), with "missing" split in two for the
 * screen: no recurring task from it (applying creates one) or an active one without the regime
 * (applying adds the regime). "handmade": a recurring task made by hand with the same name covers it.
 */
export function itemState(item: Pick<RegimeGroupItemView, 'state' | 'recurringTask'>): RegimeItemState {
  if (item.state === 'missing' && item.recurringTask?.active) return 'addRegime';
  return item.state;
}

export const ITEM_STATE_LABELS: Record<RegimeItemState, string> = {
  applied: 'Aplicada',
  missing: 'Falta',
  addRegime: 'Existe, sem este regime',
  ended: 'Encerrada',
  handmade: 'Existe (à mão)',
};

/** What "Aplicar grupo" will do, the hand-made ones it skips and the departments it creates. */
export function applyPreview(group: Pick<RegimeGroup, 'items'>, usesDepartments: boolean) {
  const states = group.items.map((i) => itemState(i));
  const count = (s: RegimeItemState) => states.filter((x) => x === s).length;
  const created = group.items.filter((i, k) => states[k] === 'missing' && !i.department.match).map((i) => i.department.name);
  return {
    create: count('missing'),
    addRegime: count('addRegime'),
    applied: count('applied'),
    ended: count('ended'),
    handmade: group.items.filter((i, k) => states[k] === 'handmade').map((i) => ({ key: i.key, name: i.name, existing: i.handmade?.name ?? i.name })),
    newDepartments: usesDepartments ? [...new Set(created)] : [],
  };
}

/**
 * The body of "Aplicar grupo": the hand-made ones go in `force` only when asked ("Criar mesmo assim");
 * `fromMonth: 'next'` when the person chose "Começar no mês que vem".
 */
export function applyInput(
  group: Pick<RegimeGroup, 'items'>,
  createHandmade: boolean,
  fromMonth: RegimeGroupFromMonth = 'current',
): { force: string[]; fromMonth: RegimeGroupFromMonth } {
  return { force: createHandmade ? group.items.filter((i) => i.state === 'handmade').map((i) => i.key) : [], fromMonth };
}

/**
 * Occurrences of the current month born overdue (legal deadline already gone) by start month (QA #4).
 * `next` only spares the recurring tasks created: an existing one that gains the regime already runs
 * this month.
 */
export function overdueOnApply(group: Pick<RegimeGroup, 'items' | 'clientCount'>, createHandmade: boolean): { current: number; next: number } {
  let created = 0;
  let added = 0;
  for (const i of group.items) {
    const state = itemState(i);
    if (state === 'missing' || (state === 'handmade' && createHandmade)) created += i.currentOverdue;
    else if (state === 'addRegime') added += i.currentOverdue;
  }
  return { current: (created + added) * group.clientCount, next: added * group.clientCount };
}

/** "3 ocorrências deste mês já nascem vencidas" / "1 ocorrência deste mês já nasce vencida". */
export function overdueText(n: number): string {
  return pluralize(n, 'ocorrência deste mês já nasce vencida', 'ocorrências deste mês já nascem vencidas');
}

const GENERATES = 'Elas geram todo mês uma tarefa para cada empresa do regime.';

/** The toast after applying: "Simples Nacional: 5 tarefas recorrentes criadas e 2 passaram a incluir o regime. …". */
export function applyResultText(
  res: Pick<RegimeGroupApplyResponse, 'created' | 'regimeAdded' | 'departmentsCreated' | 'skipped'> & Partial<Pick<RegimeGroupApplyResponse, 'fromMonth' | 'overdueCreated'>>,
  label: string,
): string {
  const parts: string[] = [];
  if (res.created) parts.push(res.created === 1 ? '1 tarefa recorrente criada' : `${res.created} tarefas recorrentes criadas`);
  if (res.regimeAdded) parts.push(`${res.regimeAdded} ${res.regimeAdded === 1 ? 'passou' : 'passaram'} a incluir o regime`);
  const n = res.skipped.length;
  const skipped = n ? `${n} já ${n === 1 ? 'existia feita à mão e não foi duplicada' : 'existiam feitas à mão e não foram duplicadas'}` : '';
  if (!parts.length) return skipped ? `${label}: nada criado; ${skipped}.` : `${label}: o grupo já estava aplicado.`;
  const depts = res.departmentsCreated.length
    ? ` ${res.departmentsCreated.length === 1 ? 'Departamento criado' : 'Departamentos criados'}: ${res.departmentsCreated.map((d) => d.name).join(', ')}.`
    : '';
  const start = res.fromMonth === 'next' && res.created ? ' As novas começam no mês que vem.' : '';
  const overdue = res.overdueCreated
    ? ` ${pluralize(res.overdueCreated, 'ocorrência deste mês nasceu vencida', 'ocorrências deste mês nasceram vencidas')}.`
    : '';
  return `${label}: ${parts.join(' e ')}.${depts}${skipped ? ` ${skipped.charAt(0).toUpperCase()}${skipped.slice(1)}.` : ''} ${GENERATES}${start}${overdue}`;
}

/** "12 empresas" / "1 empresa" / "nenhuma empresa". */
export function companiesText(n: number): string {
  return n === 0 ? 'nenhuma empresa' : pluralize(n, 'empresa', 'empresas');
}

// ---------------------------------------------------------------------------
// Editing the group: include / exclude / restore
// ---------------------------------------------------------------------------

/** "Tarefa recorrente existente…": the registry's active recurring tasks without the regime, by name. */
export function includeCandidates(items: readonly RecurringTask[], regime: RegimeGroupRegime, search = ''): RecurringTask[] {
  const q = fold(search.trim());
  return items
    .filter((r) => r.origin === 'registry' && r.active && !r.regimes.includes(regime) && (!q || fold(r.name).includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/**
 * The office's own tasks to list as "Do escritório": a hand-made twin of a catalog item is already the
 * "Existe (à mão)" row of that item, so it is not listed twice.
 */
export function ownRows<T extends { id: string }>(group: { items: readonly Pick<RegimeGroupItemView, 'handmade'>[]; own: readonly T[] }): T[] {
  const twins = new Set(group.items.map((i) => i.handmade?.id).filter(Boolean));
  return group.own.filter((t) => !twins.has(t.id));
}

/** What the row's "Excluir do regime" acts on: a catalog item (by key) or an own recurring task. */
export type ExcludeTarget =
  | { kind: 'item'; item: Pick<RegimeGroupItemView, 'key' | 'name' | 'recurringTask'> & Partial<Pick<RegimeGroupItemView, 'handmade'>> }
  | { kind: 'own'; id: string; name: string };

export function excludeInput(target: ExcludeTarget): { key: string } | { recurringTaskId: string } {
  return target.kind === 'item' ? { key: target.item.key } : { recurringTaskId: target.id };
}

/**
 * The confirmation of "Excluir do regime". A task that generates for the regime stops (open "A fazer"
 * of this month canceled); an item never applied just leaves the group.
 */
export function excludeEffect(target: ExcludeTarget, regime: RegimeGroupRegime, clientCount: number): string {
  const generates =
    target.kind === 'own' ||
    Boolean(target.item.recurringTask?.active && target.item.recurringTask.regimes.includes(regime)) ||
    Boolean(target.item.handmade?.active && target.item.handmade.regimes.includes(regime));
  if (!generates) return 'Sai do grupo e o "Aplicar grupo" não a cria mais.';
  const who = clientCount === 0 ? 'as empresas' : clientCount === 1 ? 'a empresa' : `as ${clientCount} empresas`;
  return `Deixa de gerar para ${who} do regime a partir de agora; tarefas "A fazer" deste mês são canceladas, as em andamento e concluídas ficam.`;
}

/** The toast after including, excluding or restoring (`ended`: the recurring task had nothing left). */
export function changeResultText(action: 'include' | 'exclude' | 'restore', res: Pick<RegimeGroupChangeResponse, 'change'>, name: string, label: string): string {
  if (action === 'restore') return `“${name}” voltou ao grupo ${label} (falta aplicar).`;
  if (action === 'include') return res.change === 'none' ? `“${name}” já estava no grupo ${label}.` : `“${name}” incluída no grupo ${label}.`;
  if (res.change === 'ended') return `“${name}” saiu do grupo ${label}. A tarefa recorrente ficou sem regime nem clientes e foi encerrada.`;
  return `“${name}” saiu do grupo ${label}.`;
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}
