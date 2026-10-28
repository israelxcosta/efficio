import type { DashboardResponse } from '@effinance/shared';

/** Subject of a widget: groups the list in "Personalizar" (the dashboard itself is one board). */
export type WidgetGroupId = 'visao-geral' | 'receber-pagar' | 'analises' | 'clientes' | 'planejamento';

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

/** Grid span: columns (1–4) × rows (96px each, 88px below 4 columns; 16px gap). */
export interface WidgetSize {
  c: number;
  r: number;
}

/** Column counts of the board (desktop, medium screens, phones). */
export type BoardCols = 4 | 2 | 1;

/** Top-left cell of a card on a board: column `x` and row `y`, from 0. */
export interface GridCell {
  x: number;
  y: number;
}

/** A card placed on a board: its cell and the span it shows there (columns already ≤ the board's). */
export interface BoardItem extends GridCell, WidgetSize {
  id: WidgetId;
}

export interface WidgetGroupSpec {
  id: WidgetGroupId;
  title: string;
}

export interface WidgetSpec {
  id: WidgetId;
  group: WidgetGroupId;
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
  v: 2;
  /** Size set by the user (desktop columns; narrower boards show at most their column count). */
  sizes: Partial<Record<WidgetId, WidgetSize>>;
  /**
   * Cell of each visible card on each board (4, 2 and 1 columns), free of overlaps. A board with
   * no cells follows the default arrangement (4) or the next wider board (2, 1); a visible card
   * without a cell takes the first free space that fits.
   */
  cells: Partial<Record<BoardCols, Partial<Record<WidgetId, GridCell>>>>;
  /** Explicit choices only; absent = the spec's default. */
  visible: Partial<Record<WidgetId, boolean>>;
  prefs: Partial<DashboardPrefs>;
}

/** Something in a widget that needs attention (red dot on the card). */
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
