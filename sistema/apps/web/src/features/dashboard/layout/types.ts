import type { DashboardResponse } from '@effinance/shared';

export type SectionId = 'visao-geral' | 'receber-pagar' | 'analises' | 'clientes' | 'planejamento';

export type WidgetId =
  | 'fluxo-caixa'
  | 'saude'
  | 'saldo-contas'
  | 'insights'
  | 'projecao-caixa'
  | 'inadimplencia'
  | 'clientes-devedores'
  | 'proximos-vencimentos'
  | 'fatura-cartao'
  | 'resumo-periodo'
  | 'despesas-categoria'
  | 'resultado-mensal'
  | 'receitas-categoria'
  | 'evolucao'
  | 'composicao'
  | 'carteira-clientes'
  | 'vigencias-honorarios'
  | 'honorarios-mes'
  | 'cadastro-incompleto'
  | 'gastos-fixos'
  | 'receitas-fixas'
  | 'metas';

/** Grid span: columns (1–4) × rows (86px each, 12px gap). */
export interface WidgetSize {
  c: number;
  r: number;
}

export interface SectionSpec {
  id: SectionId;
  title: string;
}

export interface WidgetSpec {
  id: WidgetId;
  section: SectionId;
  title: string;
  /** One line shown in "Personalizar". */
  description: string;
  defaultSize: WidgetSize;
  min: WidgetSize;
  max: WidgetSize;
  /** Sizes offered in "Personalizar" (the corner handle allows any size within min/max). */
  presets: WidgetSize[];
  /** Available in "Personalizar" but off until the user turns it on. */
  defaultHidden?: boolean;
  /** Visible by default only in business workspaces (clients and fees); hidden elsewhere. */
  defaultFor?: 'business';
}

/** Per-widget options that live in the widget header (persisted with the layout). */
export interface DashboardPrefs {
  fluxoModo: 'D' | 'S' | 'M' | 'A';
  projecaoDias: 30 | 60 | 90;
  proximosFiltro: 'todos' | 'pagar' | 'receber';
  evolucaoTipo: 'expense' | 'income';
  composicaoTipo: 'expense' | 'income';
}

export interface DashboardLayout {
  v: 1;
  sizes: Partial<Record<WidgetId, WidgetSize>>;
  order: Partial<Record<SectionId, WidgetId[]>>;
  /** Explicit choices only; absent = the spec's default. */
  visible: Partial<Record<WidgetId, boolean>>;
  collapsed: SectionId[];
  prefs: Partial<DashboardPrefs>;
}

/** Something in a widget that needs attention (red dot + section badge). */
export interface WidgetAlert {
  count: number;
  label: string;
  href: string;
}

export interface WidgetProps {
  /** Active month (YYYY-MM). */
  month: string;
  d: DashboardResponse | undefined;
  loading: boolean;
  /** Size as displayed (columns already limited to the grid's column count). */
  size: WidgetSize;
  prefs: DashboardPrefs;
  setPref: <K extends keyof DashboardPrefs>(key: K, value: DashboardPrefs[K]) => void;
  alert?: WidgetAlert;
  /** Business workspace (clients and fees available). */
  business: boolean;
}
