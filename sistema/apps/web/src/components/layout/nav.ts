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
  /** Shown in the mobile bottom bar. */
  mobile?: boolean;
  keywords?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutGrid, mobile: true, keywords: 'inicio resumo visao geral' },
  { to: '/extrato', label: 'Extrato', icon: ScrollText, mobile: true, keywords: 'lancamentos movimentacoes saldo' },
  { to: '/contas-a-pagar', label: 'Contas a pagar', icon: Receipt, mobile: true, keywords: 'despesas boletos vencimentos' },
  { to: '/contas-a-receber', label: 'Contas a receber', icon: HandCoins, keywords: 'receitas entradas salario' },
  { to: '/transferencias', label: 'Transferências e investimentos', icon: ArrowLeftRight, keywords: 'investir aplicar resgatar mover' },
  { to: '/contas', label: 'Contas e carteiras', icon: Landmark, keywords: 'bancos carteira poupanca' },
  { to: '/cartoes', label: 'Cartões de crédito', icon: CreditCard, keywords: 'fatura limite' },
  { to: '/metas', label: 'Metas', icon: Target, keywords: 'objetivos reserva' },
  { to: '/categorias', label: 'Categorias', icon: Tags, keywords: 'subcategorias' },
  { to: '/clientes', label: 'Clientes', icon: Building2, keywords: 'empresas cnpj honorarios contrato regime simples inativar receita federal' },
  { to: '/fornecedores', label: 'Fornecedores', icon: Truck, keywords: 'contatos pessoas cpf cnpj prestadores' },
  { to: '/relatorios', label: 'Relatórios', icon: ChartLine, mobile: true, keywords: 'analises fluxo de caixa comparacao insights' },
];

export const SETTINGS_ITEM: NavItem = { to: '/configuracoes', label: 'Configurações', icon: Settings, keywords: 'perfil tema senha seguranca 2fa sessoes membros convites assinatura plano integracoes open finance importacoes privacidade exportar lgpd' };
