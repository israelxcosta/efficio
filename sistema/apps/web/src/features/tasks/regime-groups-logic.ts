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

/** The body of "Aplicar grupo": the hand-made ones go in `force` only when asked ("Criar mesmo assim"). */
export function applyInput(group: Pick<RegimeGroup, 'items'>, createHandmade: boolean): { force: string[] } {
  return { force: createHandmade ? group.items.filter((i) => i.state === 'handmade').map((i) => i.key) : [] };
}

const GENERATES = 'Elas geram todo mês uma tarefa para cada empresa do regime.';

/** The toast after applying: "Simples Nacional: 5 tarefas recorrentes criadas e 2 passaram a incluir o regime. …". */
export function applyResultText(res: Pick<RegimeGroupApplyResponse, 'created' | 'regimeAdded' | 'departmentsCreated' | 'skipped'>, label: string): string {
  const parts: string[] = [];
  if (res.created) parts.push(res.created === 1 ? '1 tarefa recorrente criada' : `${res.created} tarefas recorrentes criadas`);
  if (res.regimeAdded) parts.push(`${res.regimeAdded} ${res.regimeAdded === 1 ? 'passou' : 'passaram'} a incluir o regime`);
  const n = res.skipped.length;
  const skipped = n ? `${n} já ${n === 1 ? 'existia feita à mão e não foi duplicada' : 'existiam feitas à mão e não foram duplicadas'}` : '';
  if (!parts.length) return skipped ? `${label}: nada criado; ${skipped}.` : `${label}: o grupo já estava aplicado.`;
  const depts = res.departmentsCreated.length
    ? ` ${res.departmentsCreated.length === 1 ? 'Departamento criado' : 'Departamentos criados'}: ${res.departmentsCreated.map((d) => d.name).join(', ')}.`
    : '';
  return `${label}: ${parts.join(' e ')}.${depts}${skipped ? ` ${skipped.charAt(0).toUpperCase()}${skipped.slice(1)}.` : ''} ${GENERATES}`;
}

/** "12 empresas" / "1 empresa" / "nenhuma empresa". */
export function companiesText(n: number): string {
  return n === 0 ? 'nenhuma empresa' : pluralize(n, 'empresa', 'empresas');
}
