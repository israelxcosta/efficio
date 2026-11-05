// Catalog of dashboard widgets: default sizes, limits and the presets offered in "Personalizar".
// The array order is the default arrangement of the board: each card takes the first free space
// at 4 columns, which packs the default board with no holes in both workspace kinds (checked in
// tests). Default sizes are only S/M/L (2, 3 or 4 rows) and every row of the default board has
// cards of one height (docs/dashboards-redesign.md §7.2):
//
//   inadimplência 2×3 | devedores 2×3 · honorários do mês 4×2 · próximos vencimentos 4×3 ·
//   fluxo 2×4 | saldo 2×4 · projeção 4×4 · insights 4×2 · carteira 2×4 | vigências 2×4 ·
//   resumo 2×4 | despesas por categoria 2×4 · gastos fixos 2×4 | receitas fixas 2×4
//
// Personal workspaces drop honorários, carteira and vigências and still pack with no holes.
// Hidden by default (turned on in "Cards"): fatura, saúde, cadastro incompleto, resultado mês a
// mês, receitas por categoria, evolução, composição and metas.

import type { WidgetGroupSpec, WidgetSize, WidgetSpec } from './types';

const s = (c: number, r: number): WidgetSize => ({ c, r });

/** Subjects that organize the list in "Personalizar" (ids match the sections of layouts v1). */
export const WIDGET_GROUPS: WidgetGroupSpec[] = [
  { id: 'receber-pagar', title: 'Honorários e cobrança' },
  { id: 'visao-geral', title: 'Caixa' },
  { id: 'clientes', title: 'Clientes' },
  { id: 'analises', title: 'Análises do mês' },
  { id: 'planejamento', title: 'Recorrentes e metas' },
];

export const WIDGET_SPECS: WidgetSpec[] = [
  // Row 1 (M): inadimplência | devedores (2×3). Row 2 (S): honorários do mês (4×2). Row 3 (M): vencimentos (4×3).
  // Card invoice starts hidden.
  {
    id: 'inadimplencia',
    group: 'receber-pagar',
    title: 'Inadimplência',
    description: 'Total vencido a receber, por faixa de atraso.',
    defaultSize: s(2, 3),
    min: s(1, 3),
    max: s(4, 5),
    presets: [s(2, 3), s(2, 4)],
  },
  {
    id: 'clientes-devedores',
    group: 'receber-pagar',
    title: 'Clientes devedores',
    description: 'Ranking de quem mais deve, com o título mais antigo.',
    defaultSize: s(2, 3),
    min: s(1, 3),
    max: s(4, 7),
    presets: [s(2, 3), s(2, 4), s(2, 5)],
  },
  {
    id: 'honorarios-mes',
    group: 'clientes',
    title: 'Honorários do mês',
    description: 'Previsto pelas vigências × faturado × recebido no mês.',
    defaultSize: s(4, 2),
    min: s(2, 2),
    max: s(4, 5),
    presets: [s(4, 2), s(2, 3)],
    defaultFor: 'business',
  },
  {
    id: 'proximos-vencimentos',
    group: 'receber-pagar',
    title: 'Próximos vencimentos',
    description: 'Contas vencidas e dos próximos 15 dias.',
    defaultSize: s(4, 3),
    min: s(2, 3),
    max: s(4, 7),
    presets: [s(4, 3), s(4, 4), s(2, 4)],
  },
  {
    id: 'fatura-cartao',
    group: 'receber-pagar',
    title: 'Fatura do cartão',
    description: 'Fatura atual, vencimento e uso do limite de cada cartão.',
    defaultSize: s(2, 4),
    min: s(1, 3),
    max: s(4, 5),
    presets: [s(2, 3), s(2, 4)],
    defaultHidden: true,
  },

  // Row 4 (L): fluxo | saldo (2×4). Row 5 (L): projeção (4×4). Row 6 (S): insights (4×2). Saúde starts hidden.
  {
    id: 'fluxo-caixa',
    group: 'visao-geral',
    title: 'Fluxo de caixa',
    description: 'Receitas e despesas por dia, semana, mês ou ano.',
    defaultSize: s(2, 4),
    min: s(2, 3),
    max: s(4, 7),
    presets: [s(2, 4), s(2, 5), s(4, 5)],
  },
  {
    id: 'saude',
    group: 'visao-geral',
    title: 'Saúde financeira',
    description: 'Pontuação de 0 a 1000 e os fatores que a compõem.',
    defaultSize: s(1, 3),
    min: s(1, 3),
    max: s(2, 6),
    presets: [s(1, 3), s(1, 4), s(2, 5)],
    defaultHidden: true,
  },
  {
    id: 'saldo-contas',
    group: 'visao-geral',
    title: 'Saldo em contas',
    description: 'Saldo de cada conta, total investido e patrimônio.',
    defaultSize: s(2, 4),
    min: s(1, 3),
    max: s(2, 7),
    presets: [s(1, 4), s(2, 4), s(2, 5)],
  },
  {
    id: 'projecao-caixa',
    group: 'visao-geral',
    title: 'Projeção de caixa',
    description: 'Saldo previsto dia a dia nos próximos 30, 60 ou 90 dias.',
    defaultSize: s(4, 4),
    min: s(2, 4),
    max: s(4, 7),
    presets: [s(2, 4), s(4, 4), s(4, 5)],
  },
  {
    id: 'insights',
    group: 'visao-geral',
    title: 'Insights',
    description: 'Análises automáticas do mês.',
    defaultSize: s(4, 2),
    min: s(1, 2),
    max: s(4, 4),
    presets: [s(1, 2), s(2, 2), s(4, 2)],
  },

  // Row 7 (L): carteira | vigências (2×4), business workspaces only. Cadastro incompleto starts hidden.
  {
    id: 'carteira-clientes',
    group: 'clientes',
    title: 'Carteira de clientes',
    description: 'Clientes ativos, inativos e honorários por regime tributário.',
    defaultSize: s(2, 4),
    min: s(2, 3),
    max: s(4, 6),
    presets: [s(2, 4), s(4, 4)],
    defaultFor: 'business',
  },
  {
    id: 'vigencias-honorarios',
    group: 'clientes',
    title: 'Vigências de honorários',
    description: 'Clientes sem vigência atual e vigências que vencem em 60 dias.',
    defaultSize: s(2, 4),
    min: s(1, 3),
    max: s(4, 6),
    presets: [s(2, 3), s(2, 4)],
    defaultFor: 'business',
  },
  {
    id: 'cadastro-incompleto',
    group: 'clientes',
    title: 'Cadastro incompleto',
    description: 'Clientes ativos sem e-mail, telefone, responsável ou cidade.',
    defaultSize: s(2, 4),
    min: s(1, 3),
    max: s(4, 6),
    presets: [s(2, 3), s(2, 4)],
    defaultHidden: true,
    defaultFor: 'business',
  },

  // Row 8 (L): resumo | despesas por categoria (2×4). Resultado (repeats the cash flow), trends and income start hidden.
  {
    id: 'resumo-periodo',
    group: 'analises',
    title: 'Resumo do período',
    description: 'Receitas e despesas do mês, pagas e pendentes.',
    defaultSize: s(2, 4),
    min: s(2, 3),
    max: s(4, 5),
    presets: [s(2, 3), s(2, 4)],
  },
  {
    id: 'despesas-categoria',
    group: 'analises',
    title: 'Despesas por categoria',
    description: 'Distribuição das despesas do mês por categoria.',
    defaultSize: s(2, 4),
    min: s(2, 3),
    max: s(4, 7),
    presets: [s(2, 4), s(2, 5), s(4, 5)],
  },
  {
    id: 'resultado-mensal',
    group: 'analises',
    title: 'Resultado mês a mês',
    description: 'Saldo (receitas − despesas) dos últimos 6 meses.',
    defaultSize: s(2, 4),
    min: s(2, 3),
    max: s(4, 6),
    presets: [s(2, 4), s(4, 3)],
    defaultHidden: true,
  },
  {
    id: 'receitas-categoria',
    group: 'analises',
    title: 'Receitas por categoria',
    description: 'Distribuição das receitas do mês por categoria.',
    defaultSize: s(2, 4),
    min: s(2, 3),
    max: s(4, 7),
    presets: [s(2, 4), s(2, 5), s(4, 5)],
    defaultHidden: true,
  },
  {
    id: 'evolucao',
    group: 'analises',
    title: 'Evolução do total',
    description: '12 meses de realizado e previsto, com linha de tendência.',
    defaultSize: s(4, 4),
    min: s(2, 3),
    max: s(4, 7),
    presets: [s(4, 4), s(4, 5)],
    defaultHidden: true,
  },
  {
    id: 'composicao',
    group: 'analises',
    title: 'Composição mês a mês',
    description: 'Barras empilhadas por categoria nos últimos 6 meses.',
    defaultSize: s(4, 4),
    min: s(2, 3),
    max: s(4, 7),
    presets: [s(4, 4), s(4, 5)],
    defaultHidden: true,
  },

  // Row 9 (L): gastos | receitas fixas (2×4). Metas start hidden.
  {
    id: 'gastos-fixos',
    group: 'planejamento',
    title: 'Gastos fixos',
    description: 'Despesas recorrentes do mês.',
    defaultSize: s(2, 4),
    min: s(2, 3),
    max: s(4, 6),
    presets: [s(2, 4), s(2, 5)],
  },
  {
    id: 'receitas-fixas',
    group: 'planejamento',
    title: 'Receitas fixas',
    description: 'Receitas recorrentes do mês.',
    defaultSize: s(2, 4),
    min: s(2, 3),
    max: s(4, 6),
    presets: [s(2, 4), s(2, 5)],
  },
  {
    id: 'metas',
    group: 'planejamento',
    title: 'Metas',
    description: 'Progresso das metas ativas.',
    defaultSize: s(4, 3),
    min: s(2, 3),
    max: s(4, 6),
    presets: [s(2, 4), s(4, 3)],
    defaultHidden: true,
  },
];

export const SPEC_BY_ID = Object.fromEntries(WIDGET_SPECS.map((w) => [w.id, w])) as Record<WidgetSpec['id'], WidgetSpec>;
