import {
  ArrowLeftRight,
  Building2,
  ChartLine,
  CreditCard,
  HandCoins,
  Landmark,
  LayoutGrid,
  Receipt,
  ScrollText,
  Settings,
  Tags,
  Target,
  Truck,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the mobile bottom bar (the first three). */
  mobile?: boolean;
  /** One-word label of the mobile bottom bar; the first word of `label` when omitted. */
  short?: string;
  keywords?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', short: 'Painel', icon: LayoutGrid, mobile: true, keywords: 'inicio resumo visao geral' },
  { to: '/extrato', label: 'Extrato', icon: ScrollText, keywords: 'lancamentos movimentacoes saldo' },
  { to: '/contas-a-pagar', label: 'Contas a pagar', icon: Receipt, keywords: 'despesas boletos vencimentos' },
  { to: '/contas-a-receber', label: 'Contas a receber', short: 'Receber', icon: HandCoins, mobile: true, keywords: 'receitas entradas honorarios' },
  { to: '/transferencias', label: 'Transferências e investimentos', icon: ArrowLeftRight, keywords: 'investir aplicar resgatar mover' },
  { to: '/contas', label: 'Contas e carteiras', icon: Landmark, keywords: 'bancos carteira poupanca' },
  { to: '/cartoes', label: 'Cartões de crédito', icon: CreditCard, keywords: 'fatura limite' },
  { to: '/metas', label: 'Metas', icon: Target, keywords: 'objetivos reserva' },
  { to: '/categorias', label: 'Categorias', icon: Tags, keywords: 'subcategorias' },
  { to: '/clientes', label: 'Clientes', icon: Building2, mobile: true, keywords: 'empresas cnpj honorarios contrato regime simples inativar receita federal' },
  { to: '/fornecedores', label: 'Fornecedores', icon: Truck, keywords: 'contatos pessoas cpf cnpj prestadores' },
  { to: '/relatorios', label: 'Relatórios', icon: ChartLine, mobile: true, keywords: 'analises fluxo de caixa comparacao insights' },
];

export const SETTINGS_ITEM: NavItem = { to: '/configuracoes', label: 'Configurações', icon: Settings, keywords: 'perfil tema senha seguranca 2fa sessoes membros convites assinatura plano integracoes open finance importacoes privacidade exportar lgpd' };

/** Rail geometry (px): a 44px icon button every 50px (6px gap). */
export const RAIL_ITEM_PX = 44;
export const RAIL_GAP_PX = 6;

/**
 * Splits the rail's items by the height available: everything fits, or the last visible slot
 * becomes the "more" button (chevron) that opens the rest in a menu beside the rail. Never a
 * scrollbar in the rail.
 */
export function splitRail<T>(items: readonly T[], height: number): { visible: T[]; hidden: T[] } {
  // Not measured yet: show everything (the rail is laid out before the first measure).
  if (height <= 0) return { visible: [...items], hidden: [] };
  const slots = Math.max(1, Math.floor((height + RAIL_GAP_PX) / (RAIL_ITEM_PX + RAIL_GAP_PX)));
  if (items.length <= slots) return { visible: [...items], hidden: [] };
  const keep = Math.max(0, slots - 1);
  return { visible: items.slice(0, keep), hidden: items.slice(keep) };
}
