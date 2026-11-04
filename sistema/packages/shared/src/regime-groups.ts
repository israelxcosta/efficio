// Default groups of recurring tasks per tax regime ("grupos padrão por regime"). As in Effy, a recurring
// task applies by regime: once a group is applied, its recurring tasks keep generating every month for
// every active client of the regime — a new client of the regime joins on its own. Applying creates only
// what is missing, identified by the catalog key (`recurring_tasks.catalog_key`); a common obligation
// (payroll, FGTS Digital, eSocial…) is one recurring task with several regimes, not a twin per regime.
//
// The deadlines are suggestions (the usual legal day; the office adjusts after applying): a day the month
// lacks becomes its last day (31 = "último dia"), `anticipate` moves to the previous business day,
// `postpone` to the next one (national holidays only).

import type { NonBusinessDayRule, RecurrencePeriod, TaxRegime } from './constants';

/** Regimes that have a default group. */
export const REGIME_GROUP_REGIMES = ['simples_nacional', 'mei', 'presumed_profit', 'real_profit'] as const satisfies readonly TaxRegime[];
export type RegimeGroupRegime = (typeof REGIME_GROUP_REGIMES)[number];

/** Department each item suggests; matched by name to the office's departments when applying. */
export const SUGGESTED_DEPARTMENTS = ['fiscal', 'personnel', 'accounting'] as const;
export type SuggestedDepartment = (typeof SUGGESTED_DEPARTMENTS)[number];

/** Name used when the department has to be created. */
export const SUGGESTED_DEPARTMENT_NAMES: Record<SuggestedDepartment, string> = {
  fiscal: 'Fiscal',
  personnel: 'Pessoal',
  accounting: 'Contábil',
};

/** Words (lower case, no accents) that identify each suggested department in a department's name. */
const DEPARTMENT_ALIASES: Record<SuggestedDepartment, readonly string[]> = {
  fiscal: ['fiscal', 'tributario', 'tributos'],
  personnel: ['pessoal', 'dp', 'folha', 'rh', 'trabalhista'],
  accounting: ['contabil', 'contabilidade'],
};

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** The suggested department a department's name stands for ("Pessoal/DP" → personnel), or null. */
export function matchSuggestedDepartment(name: string): SuggestedDepartment | null {
  const words = new Set(normalize(name).split(/[^a-z0-9]+/).filter(Boolean));
  for (const key of SUGGESTED_DEPARTMENTS) {
    if (DEPARTMENT_ALIASES[key].some((alias) => words.has(alias))) return key;
  }
  return null;
}

export interface RegimeGroupItem {
  /** Stable key (`recurring_tasks.catalog_key`). */
  key: string;
  name: string;
  description: string;
  department: SuggestedDepartment;
  period: RecurrencePeriod;
  dueDay: number;
  dueMonth: number | null;
  targetDaysBefore: number;
  nonBusinessDayRule: NonBusinessDayRule;
  referenceOffset: number;
  /** Regimes whose group contains it. */
  regimes: RegimeGroupRegime[];
}

const EMPLOYERS: RegimeGroupRegime[] = ['simples_nacional', 'presumed_profit', 'real_profit'];
const PROFIT: RegimeGroupRegime[] = ['presumed_profit', 'real_profit'];

export const REGIME_GROUP_ITEMS: readonly RegimeGroupItem[] = [
  // --- Common: employer obligations (Simples Nacional, Lucro Presumido, Lucro Real) ---
  {
    key: 'payroll',
    name: 'Folha de pagamento',
    description: 'Processar a folha e os holerites. Salários pagos até o 5º dia útil do mês seguinte: ajuste o dia se preciso.',
    department: 'personnel',
    period: 'monthly',
    dueDay: 5,
    dueMonth: null,
    targetDaysBefore: 2,
    nonBusinessDayRule: 'postpone',
    referenceOffset: 1,
    regimes: EMPLOYERS,
  },
  {
    key: 'esocial_periodic',
    name: 'eSocial — eventos periódicos',
    description: 'Remunerações e fechamento dos eventos periódicos (S-1200, S-1210, S-1299) até o dia 15 do mês seguinte.',
    department: 'personnel',
    period: 'monthly',
    dueDay: 15,
    dueMonth: null,
    targetDaysBefore: 3,
    nonBusinessDayRule: 'anticipate',
    referenceOffset: 1,
    regimes: EMPLOYERS,
  },
  {
    key: 'fgts_digital',
    name: 'FGTS Digital',
    description: 'Emitir e enviar a guia do FGTS Digital (vencimento no dia 20 do mês seguinte).',
    department: 'personnel',
    period: 'monthly',
    dueDay: 20,
    dueMonth: null,
    targetDaysBefore: 3,
    nonBusinessDayRule: 'anticipate',
    referenceOffset: 1,
    regimes: EMPLOYERS,
  },
  {
    key: 'dctfweb',
    name: 'DCTFWeb',
    description: 'Transmitir a DCTFWeb e emitir o DARF. Prazo de referência: dia 15 do mês seguinte; confira a regra vigente.',
    department: 'fiscal',
    period: 'monthly',
    dueDay: 15,
    dueMonth: null,
    targetDaysBefore: 3,
    nonBusinessDayRule: 'anticipate',
    referenceOffset: 1,
    regimes: EMPLOYERS,
  },
  {
    key: 'efd_reinf',
    name: 'EFD-Reinf',
    description: 'Retenções e demais eventos da EFD-Reinf até o dia 15 do mês seguinte.',
    department: 'fiscal',
    period: 'monthly',
    dueDay: 15,
    dueMonth: null,
    targetDaysBefore: 3,
    nonBusinessDayRule: 'anticipate',
    referenceOffset: 1,
    regimes: EMPLOYERS,
  },
  // --- Simples Nacional ---
  {
    key: 'pgdas_das',
    name: 'PGDAS-D e DAS',
    description: 'Apurar no PGDAS-D e enviar o DAS ao cliente (vencimento no dia 20 do mês seguinte).',
    department: 'fiscal',
    period: 'monthly',
    dueDay: 20,
    dueMonth: null,
    targetDaysBefore: 3,
    nonBusinessDayRule: 'postpone',
    referenceOffset: 1,
    regimes: ['simples_nacional'],
  },
  {
    key: 'defis',
    name: 'DEFIS',
    description: 'Declaração de Informações Socioeconômicas e Fiscais do ano anterior, até 31 de março.',
    department: 'fiscal',
    period: 'annual',
    dueDay: 31,
    dueMonth: 3,
    targetDaysBefore: 10,
    nonBusinessDayRule: 'anticipate',
    referenceOffset: 3,
    regimes: ['simples_nacional'],
  },
  // --- MEI ---
  {
    key: 'das_mei',
    name: 'DAS-MEI',
    description: 'Enviar o DAS do MEI ao cliente (vencimento no dia 20 de cada mês).',
    department: 'fiscal',
    period: 'monthly',
    dueDay: 20,
    dueMonth: null,
    targetDaysBefore: 3,
    nonBusinessDayRule: 'postpone',
    referenceOffset: 1,
    regimes: ['mei'],
  },
  {
    key: 'dasn_simei',
    name: 'DASN-SIMEI',
    description: 'Declaração anual do MEI referente ao ano anterior, até 31 de maio.',
    department: 'fiscal',
    period: 'annual',
    dueDay: 31,
    dueMonth: 5,
    targetDaysBefore: 10,
    nonBusinessDayRule: 'anticipate',
    referenceOffset: 5,
    regimes: ['mei'],
  },
  // --- Lucro Presumido and Lucro Real ---
  {
    key: 'pis_cofins',
    name: 'PIS/COFINS',
    description: 'Apurar PIS e COFINS e emitir os DARFs (vencimento no dia 25 do mês seguinte).',
    department: 'fiscal',
    period: 'monthly',
    dueDay: 25,
    dueMonth: null,
    targetDaysBefore: 3,
    nonBusinessDayRule: 'anticipate',
    referenceOffset: 1,
    regimes: PROFIT,
  },
  {
    key: 'efd_contribuicoes',
    name: 'EFD-Contribuições',
    description: 'Entrega até o 10º dia útil do segundo mês seguinte: o dia 14 aproxima, ajuste se preciso.',
    department: 'fiscal',
    period: 'monthly',
    dueDay: 14,
    dueMonth: null,
    targetDaysBefore: 3,
    nonBusinessDayRule: 'anticipate',
    referenceOffset: 2,
    regimes: PROFIT,
  },
  {
    key: 'efd_icms_ipi',
    name: 'EFD ICMS/IPI',
    description: 'SPED Fiscal dos contribuintes de ICMS/IPI. O prazo varia por estado: ajuste o dia.',
    department: 'fiscal',
    period: 'monthly',
    dueDay: 20,
    dueMonth: null,
    targetDaysBefore: 3,
    nonBusinessDayRule: 'anticipate',
    referenceOffset: 1,
    regimes: PROFIT,
  },
  {
    key: 'irpj_csll_quarterly',
    name: 'IRPJ e CSLL trimestrais',
    description: 'Apurar IRPJ e CSLL do trimestre e emitir os DARFs até o último dia útil do mês seguinte.',
    department: 'fiscal',
    period: 'quarterly',
    dueDay: 31,
    dueMonth: 1,
    targetDaysBefore: 5,
    nonBusinessDayRule: 'anticipate',
    referenceOffset: 1,
    regimes: ['presumed_profit'],
  },
  {
    key: 'irpj_csll_monthly_estimate',
    name: 'IRPJ e CSLL — estimativa mensal',
    description: 'Estimativa mensal de IRPJ e CSLL (Lucro Real anual), até o último dia útil do mês seguinte.',
    department: 'fiscal',
    period: 'monthly',
    dueDay: 31,
    dueMonth: null,
    targetDaysBefore: 5,
    nonBusinessDayRule: 'anticipate',
    referenceOffset: 1,
    regimes: ['real_profit'],
  },
  {
    key: 'ecd',
    name: 'ECD',
    description: 'Escrituração Contábil Digital do ano anterior, até o último dia útil de junho.',
    department: 'accounting',
    period: 'annual',
    dueDay: 31,
    dueMonth: 6,
    targetDaysBefore: 15,
    nonBusinessDayRule: 'anticipate',
    referenceOffset: 6,
    regimes: PROFIT,
  },
  {
    key: 'ecf',
    name: 'ECF',
    description: 'Escrituração Contábil Fiscal do ano anterior, até o último dia útil de julho.',
    department: 'accounting',
    period: 'annual',
    dueDay: 31,
    dueMonth: 7,
    targetDaysBefore: 15,
    nonBusinessDayRule: 'anticipate',
    referenceOffset: 7,
    regimes: PROFIT,
  },
];

/** What applying a group did with each item. */
export const REGIME_GROUP_APPLY_RESULTS = ['created', 'regimeAdded', 'unchanged', 'ended'] as const;
export type RegimeGroupApplyResult = (typeof REGIME_GROUP_APPLY_RESULTS)[number];

/** The items of a regime's group, in catalog order. */
export function regimeGroupItems(regime: RegimeGroupRegime): RegimeGroupItem[] {
  return REGIME_GROUP_ITEMS.filter((i) => i.regimes.includes(regime));
}
