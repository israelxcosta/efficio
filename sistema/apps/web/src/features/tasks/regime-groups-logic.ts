// Tarefas recorrentes › "Grupos por regime": the URL of the view, the state of each catalog item in the
// office and the wording of applying a group. Pure functions, tested in regime-groups.test.ts.

import { REGIME_GROUP_REGIMES, type RegimeGroup, type RegimeGroupApplyResponse, type RegimeGroupItemView, type RegimeGroupRegime } from '@effinance/shared';
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

export type RegimeItemState = 'applied' | 'missing' | 'addRegime' | 'ended';

/**
 * An item of the group in the office: applied (its recurring task is active and includes the regime),
 * missing (no recurring task from it: applying creates one), present without the regime (applying adds
 * the regime to it) or ended (applying leaves it; "Encerra em" brings it back).
 */
export function itemState(item: Pick<RegimeGroupItemView, 'applied' | 'recurringTask'>): RegimeItemState {
  if (item.applied) return 'applied';
  if (!item.recurringTask) return 'missing';
  return item.recurringTask.active ? 'addRegime' : 'ended';
}

export const ITEM_STATE_LABELS: Record<RegimeItemState, string> = {
  applied: 'Aplicada',
  missing: 'Falta',
  addRegime: 'Existe, sem este regime',
  ended: 'Encerrada',
};

/** What "Aplicar grupo" will do, and the departments it creates (offices that use departments). */
export function applyPreview(group: Pick<RegimeGroup, 'items'>, usesDepartments: boolean) {
  const states = group.items.map((i) => itemState(i));
  const count = (s: RegimeItemState) => states.filter((x) => x === s).length;
  const created = group.items.filter((i, k) => states[k] === 'missing' && !i.department.match).map((i) => i.department.name);
  return {
    create: count('missing'),
    addRegime: count('addRegime'),
    applied: count('applied'),
    ended: count('ended'),
    newDepartments: usesDepartments ? [...new Set(created)] : [],
  };
}

/** Name for comparison: no accents, case, spaces or punctuation ("DASN – SIMEI" = "dasn-simei"). */
const nameKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/**
 * Missing items that the office already has as a recurring task made by hand (same name, no catalog
 * key): applying would create a twin of each, so they are skipped unless the person asks.
 */
export function handMadeTwins(group: Pick<RegimeGroup, 'items' | 'recurring'>): { key: string; name: string; recurringId: string; recurringName: string }[] {
  const byName = new Map(group.recurring.filter((r) => r.catalogKey === null).map((r) => [nameKey(r.name), r]));
  return group.items
    .filter((i) => itemState(i) === 'missing' && byName.has(nameKey(i.name)))
    .map((i) => {
      const r = byName.get(nameKey(i.name))!;
      return { key: i.key, name: i.name, recurringId: r.id, recurringName: r.name };
    });
}

/** Keys sent to "Aplicar grupo": what is missing or lacks the regime, the hand-made twins only if asked. */
export function applyKeys(group: Pick<RegimeGroup, 'items' | 'recurring'>, includeTwins: boolean): string[] {
  const twins = new Set(handMadeTwins(group).map((t) => t.key));
  return group.items.filter((i) => {
    const st = itemState(i);
    return (st === 'missing' || st === 'addRegime') && (includeTwins || !twins.has(i.key));
  }).map((i) => i.key);
}

const GENERATES = 'Elas geram todo mês uma tarefa para cada empresa do regime.';

/** The toast after applying: "Simples Nacional: 5 tarefas recorrentes criadas e 2 passaram a incluir o regime. …". */
export function applyResultText(res: Pick<RegimeGroupApplyResponse, 'created' | 'regimeAdded' | 'departmentsCreated'>, label: string): string {
  const parts: string[] = [];
  if (res.created) parts.push(res.created === 1 ? '1 tarefa recorrente criada' : `${res.created} tarefas recorrentes criadas`);
  if (res.regimeAdded) parts.push(`${res.regimeAdded} ${res.regimeAdded === 1 ? 'passou' : 'passaram'} a incluir o regime`);
  if (!parts.length) return `${label}: o grupo já estava aplicado.`;
  const depts = res.departmentsCreated.length
    ? ` ${res.departmentsCreated.length === 1 ? 'Departamento criado' : 'Departamentos criados'}: ${res.departmentsCreated.map((d) => d.name).join(', ')}.`
    : '';
  return `${label}: ${parts.join(' e ')}.${depts} ${GENERATES}`;
}

/** "12 empresas" / "1 empresa" / "nenhuma empresa". */
export function companiesText(n: number): string {
  return n === 0 ? 'nenhuma empresa' : pluralize(n, 'empresa', 'empresas');
}
