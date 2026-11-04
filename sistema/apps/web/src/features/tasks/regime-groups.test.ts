// Tarefas recorrentes › "Grupos por regime": the default obligations of each regime, what the office
// already has and what applying the group does.
import { describe, expect, it } from 'vitest';
import type { RegimeGroup, RegimeGroupApplyResponse, RegimeGroupItemView } from '@effinance/shared';
import { applyInput, applyPreview, applyResultText, itemState, parseRecurringView, regimeFromParam, writeRecurringView } from './regime-groups-logic';

const item = (patch: Partial<RegimeGroupItemView> = {}): RegimeGroupItemView => ({
  key: 'das',
  name: 'DAS',
  description: 'Guia do Simples',
  period: 'monthly',
  dueDay: 20,
  dueMonth: null,
  months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  targetDaysBefore: 3,
  nonBusinessDayRule: 'anticipate',
  referenceOffset: 1,
  department: { key: 'fiscal', name: 'Fiscal', match: { id: 'f', name: 'Fiscal' } },
  recurringTask: null,
  handmade: null,
  applied: false,
  state: 'missing',
  ...patch,
});
const ref = (patch: Partial<NonNullable<RegimeGroupItemView['recurringTask']>> = {}) => ({
  id: 'r1',
  name: 'DAS',
  period: 'monthly' as const,
  department: null,
  active: true,
  regimes: ['simples_nacional' as const],
  catalogKey: 'das',
  ...patch,
});

describe('the view of the recurring tasks page in the URL', () => {
  it('reads and writes "Grupos por regime" with the regime in Portuguese', () => {
    expect(parseRecurringView(new URLSearchParams('visao=regimes&grupo=presumido'))).toEqual({ view: 'regimes', regime: 'presumed_profit' });
    expect(parseRecurringView(new URLSearchParams(''))).toEqual({ view: 'list', regime: 'simples_nacional' });
    expect(parseRecurringView(new URLSearchParams('visao=regimes&grupo=xx'))).toEqual({ view: 'regimes', regime: 'simples_nacional' });
    expect(writeRecurringView(new URLSearchParams('busca=das'), { view: 'regimes', regime: 'real_profit' }).toString()).toBe('busca=das&visao=regimes&grupo=real');
    expect(writeRecurringView(new URLSearchParams('visao=regimes&grupo=mei'), { view: 'list' }).toString()).toBe('');
    expect(regimeFromParam('simples')).toBe('simples_nacional');
  });
});

describe('an item of a group', () => {
  it('follows the state of the server, telling apart what applying creates from what gains the regime', () => {
    expect(itemState(item())).toBe('missing');
    expect(itemState(item({ recurringTask: ref({ regimes: ['presumed_profit'] }) }))).toBe('addRegime');
    expect(itemState(item({ recurringTask: ref(), applied: true, state: 'applied' }))).toBe('applied');
    expect(itemState(item({ recurringTask: ref({ active: false }), state: 'ended' }))).toBe('ended');
    expect(itemState(item({ handmade: ref({ id: 'h', name: 'DAS', catalogKey: null }), state: 'handmade' }))).toBe('handmade');
  });
});

describe('applying a group', () => {
  const group = (items: RegimeGroupItemView[]): RegimeGroup => ({
    regime: 'simples_nacional',
    label: 'Simples Nacional',
    clientCount: 12,
    items,
    missing: items.filter((i) => !i.applied).length,
    recurring: [],
  });

  it('previews what it creates, what gains the regime, what stays, and what a hand-made one already covers', () => {
    const g = group([
      item({ key: 'a' }),
      item({ key: 'b', department: { key: 'personnel', name: 'Pessoal', match: null } }),
      item({ key: 'c', recurringTask: ref({ regimes: ['real_profit'] }) }),
      item({ key: 'd', recurringTask: ref(), applied: true, state: 'applied' }),
      item({ key: 'e', recurringTask: ref({ active: false }), state: 'ended' }),
      item({ key: 'f', handmade: ref({ id: 'h', name: 'DAS-MEI', catalogKey: null }), state: 'handmade', department: { key: 'accounting', name: 'Contábil', match: null } }),
    ]);
    expect(applyPreview(g, true)).toEqual({ create: 2, addRegime: 1, applied: 1, ended: 1, handmade: [{ key: 'f', name: 'DAS', existing: 'DAS-MEI' }], newDepartments: ['Pessoal'] });
    // Offices without departments: none is created.
    expect(applyPreview(g, false).newDepartments).toEqual([]);
  });

  it('sends the hand-made ones in `force` only when the person asks to create them anyway', () => {
    const g = group([item({ key: 'a' }), item({ key: 'f', handmade: ref({ id: 'h', catalogKey: null }), state: 'handmade' })]);
    expect(applyInput(g, false)).toEqual({ force: [] });
    expect(applyInput(g, true)).toEqual({ force: ['f'] });
  });

  it('says what happened, in one toast', () => {
    const res = (patch: Partial<RegimeGroupApplyResponse>): RegimeGroupApplyResponse => ({
      regime: 'simples_nacional',
      created: 0,
      regimeAdded: 0,
      unchanged: 0,
      skipped: [],
      ended: 0,
      items: [],
      departmentsCreated: [],
      ...patch,
    });
    expect(applyResultText(res({ created: 5, regimeAdded: 2 }), 'Simples Nacional')).toBe(
      'Simples Nacional: 5 tarefas recorrentes criadas e 2 passaram a incluir o regime. Elas geram todo mês uma tarefa para cada empresa do regime.',
    );
    expect(applyResultText(res({ created: 1, departmentsCreated: [{ id: 'p', name: 'Pessoal' }] }), 'MEI')).toBe(
      'MEI: 1 tarefa recorrente criada. Departamento criado: Pessoal. Elas geram todo mês uma tarefa para cada empresa do regime.',
    );
    expect(applyResultText(res({ unchanged: 4 }), 'MEI')).toBe('MEI: o grupo já estava aplicado.');
    expect(applyResultText(res({ created: 2, skipped: [{ key: 'f', name: 'DAS-MEI', reason: 'handmade', existing: { id: 'h', name: 'DAS MEI' } }] }), 'MEI')).toBe(
      'MEI: 2 tarefas recorrentes criadas. 1 já existia feita à mão e não foi duplicada. Elas geram todo mês uma tarefa para cada empresa do regime.',
    );
    expect(applyResultText(res({ skipped: [{ key: 'f', name: 'DAS-MEI', reason: 'handmade', existing: { id: 'h', name: 'DAS MEI' } }] }), 'MEI')).toBe(
      'MEI: nada criado; 1 já existia feita à mão e não foi duplicada.',
    );
  });
});
