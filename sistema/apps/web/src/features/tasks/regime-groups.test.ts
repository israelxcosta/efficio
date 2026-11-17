// Tarefas recorrentes › "Grupos por regime": the default obligations of each regime, what the office
// already has and what applying the group does.
import { describe, expect, it } from 'vitest';
import type { RecurringTask, RegimeGroup, RegimeGroupApplyResponse, RegimeGroupItemView } from '@effinance/shared';
import {
  applyInput,
  applyPreview,
  applyResultText,
  changeResultText,
  excludeEffect,
  excludeInput,
  includeCandidates,
  itemState,
  overdueOnApply,
  overdueText,
  parseRecurringView,
  regimeFromParam,
  writeRecurringView,
  ownRows,
} from './regime-groups-logic';

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
  currentOverdue: 0,
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
    currentMonthOverdue: 0,
    recurring: [],
    own: [],
    excluded: [],
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
    expect(applyInput(g, false)).toEqual({ force: [], fromMonth: 'current' });
    expect(applyInput(g, true, 'next')).toEqual({ force: ['f'], fromMonth: 'next' });
  });

  it('counts the occurrences of the current month born overdue, with and without "Começar no mês que vem"', () => {
    const g = group([
      item({ key: 'a', currentOverdue: 1 }),
      item({ key: 'c', recurringTask: ref({ regimes: ['real_profit'] }), currentOverdue: 1 }),
      item({ key: 'd', recurringTask: ref(), applied: true, state: 'applied', currentOverdue: 1 }),
      item({ key: 'f', handmade: ref({ id: 'h', catalogKey: null }), state: 'handmade', currentOverdue: 1 }),
    ]);
    // 12 clients: "a" (created) and "c" (gains the regime) → 24; the applied one is already running.
    expect(overdueOnApply(g, false)).toEqual({ current: 24, next: 12 });
    expect(overdueOnApply(g, true)).toEqual({ current: 36, next: 12 });
    expect(overdueText(1)).toBe('1 ocorrência deste mês já nasce vencida');
    expect(overdueText(24)).toBe('24 ocorrências deste mês já nascem vencidas');
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
      fromMonth: 'current',
      startCompetence: '2026-11',
      overdueCreated: 0,
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
    expect(applyResultText(res({ created: 2, fromMonth: 'next', overdueCreated: 12 }), 'MEI')).toBe(
      'MEI: 2 tarefas recorrentes criadas. Elas geram todo mês uma tarefa para cada empresa do regime. As novas começam no mês que vem. 12 ocorrências deste mês nasceram vencidas.',
    );
  });
});

describe('editing the group: include, exclude and restore', () => {
  const rec = (patch: Partial<RecurringTask>) => ({ id: 'x', name: 'X', origin: 'registry', active: true, regimes: [], ...patch }) as RecurringTask;

  it('offers the active recurring tasks of the registry without the regime, by name, with search', () => {
    const list = [
      rec({ id: '1', name: 'Folha', regimes: ['mei'] }),
      rec({ id: '2', name: 'Balancete', regimes: ['simples_nacional'] }),
      rec({ id: '3', name: 'Ata', active: false }),
      rec({ id: '4', name: 'Repetição', origin: 'task' }),
      rec({ id: '5', name: 'Alvará' }),
    ];
    expect(includeCandidates(list, 'simples_nacional').map((r) => r.id)).toEqual(['5', '1']);
    expect(includeCandidates(list, 'simples_nacional', 'alvara').map((r) => r.id)).toEqual(['5']);
  });

  it('excludes a catalog item by key and an own task by id', () => {
    expect(excludeInput({ kind: 'item', item: item() })).toEqual({ key: 'das' });
    expect(excludeInput({ kind: 'own', id: 'r9', name: 'Alvará' })).toEqual({ recurringTaskId: 'r9' });
  });

  it('says what excluding does: stops generating when it runs for the regime, else only leaves the group', () => {
    const stops = 'Deixa de gerar para as 12 empresas do regime a partir de agora; tarefas "A fazer" deste mês são canceladas, as em andamento e concluídas ficam.';
    expect(excludeEffect({ kind: 'item', item: item({ recurringTask: ref() }) }, 'simples_nacional', 12)).toBe(stops);
    expect(excludeEffect({ kind: 'own', id: 'r9', name: 'Alvará' }, 'simples_nacional', 1)).toContain('para a empresa do regime');
    expect(excludeEffect({ kind: 'item', item: item() }, 'simples_nacional', 12)).toBe('Sai do grupo e o "Aplicar grupo" não a cria mais.');
    expect(excludeEffect({ kind: 'item', item: item({ recurringTask: ref({ regimes: ['mei'] }) }) }, 'simples_nacional', 12)).toContain('Sai do grupo');
  });

  it('tells in the toast when the recurring task was ended', () => {
    expect(changeResultText('exclude', { change: 'ended' }, 'Alvará', 'MEI')).toBe('“Alvará” saiu do grupo MEI. A tarefa recorrente ficou sem regime nem clientes e foi encerrada.');
    expect(changeResultText('exclude', { change: 'regimeRemoved' }, 'DAS', 'MEI')).toBe('“DAS” saiu do grupo MEI.');
    expect(changeResultText('include', { change: 'regimeAdded' }, 'Folha', 'MEI')).toBe('“Folha” incluída no grupo MEI.');
    expect(changeResultText('restore', { change: 'none' }, 'DAS', 'MEI')).toBe('“DAS” voltou ao grupo MEI (falta aplicar).');
  });
});

describe('the own tasks listed as "Do escritório"', () => {
  it('leaves out the hand-made twin already shown as "Existe (à mão)"', () => {
    const items = [{ handmade: { id: 'twin' } }, { handmade: null }] as unknown as RegimeGroupItemView[];
    const own = [{ id: 'twin' }, { id: 'mine' }];
    expect(ownRows({ items, own }).map((t) => t.id)).toEqual(['mine']);
  });

  it('counts a hand-made twin in the exclusion effect', () => {
    const item = { key: 'dctfweb', name: 'DCTFWeb', recurringTask: null, handmade: { active: true, regimes: ['simples_nacional'] } } as unknown as RegimeGroupItemView;
    expect(excludeEffect({ kind: 'item', item }, 'simples_nacional', 4)).toContain('Deixa de gerar para as 4 empresas');
  });
});
