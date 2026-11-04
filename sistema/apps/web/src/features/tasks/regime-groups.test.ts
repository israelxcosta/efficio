// Tarefas recorrentes › "Grupos por regime": the default obligations of each regime, what the office
// already has and what applying the group does.
import { describe, expect, it } from 'vitest';
import type { RegimeGroup, RegimeGroupApplyResponse, RegimeGroupItemView } from '@effinance/shared';
import { applyKeys, applyPreview, applyResultText, handMadeTwins, itemState, parseRecurringView, regimeFromParam, writeRecurringView } from './regime-groups-logic';

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
  it('is missing, applied, present without the regime, or ended', () => {
    expect(itemState(item())).toBe('missing');
    expect(itemState(item({ recurringTask: ref(), applied: true }))).toBe('applied');
    expect(itemState(item({ recurringTask: ref({ regimes: ['presumed_profit'] }), applied: false }))).toBe('addRegime');
    expect(itemState(item({ recurringTask: ref({ active: false }), applied: false }))).toBe('ended');
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

  it('previews what it creates, what gains the regime and what stays (ended ones are not reopened)', () => {
    const g = group([
      item({ key: 'a' }),
      item({ key: 'b', department: { key: 'personnel', name: 'Pessoal', match: null } }),
      item({ key: 'c', recurringTask: ref({ regimes: ['real_profit'] }) }),
      item({ key: 'd', recurringTask: ref(), applied: true }),
      item({ key: 'e', recurringTask: ref({ active: false }) }),
    ]);
    expect(applyPreview(g, true)).toEqual({ create: 2, addRegime: 1, applied: 1, ended: 1, newDepartments: ['Pessoal'] });
    // Offices without departments: none is created.
    expect(applyPreview(g, false).newDepartments).toEqual([]);
  });

  it('spots the missing items that already exist made by hand (same name), so applying does not create twins', () => {
    const g = {
      ...group([item({ key: 'das-mei', name: 'DAS-MEI' }), item({ key: 'dasn', name: 'DASN-SIMEI' }), item({ key: 'x', name: 'Outra', recurringTask: ref({ regimes: ['real_profit'] }) })]),
      recurring: [ref({ id: 'h1', name: 'das mei', catalogKey: null }), ref({ id: 'h2', name: 'DASN – SIMEI', catalogKey: null })],
    };
    expect(handMadeTwins(g).map((t) => [t.key, t.recurringName])).toEqual([
      ['das-mei', 'das mei'],
      ['dasn', 'DASN – SIMEI'],
    ]);
    // Applying skips them unless asked; the item that only gains the regime stays.
    expect(applyKeys(g, false)).toEqual(['x']);
    expect(applyKeys(g, true)).toEqual(['das-mei', 'dasn', 'x']);
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
  });
});
