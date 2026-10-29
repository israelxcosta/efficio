import {
  ArrowLeftRight,
  Building2,
  ChartLine,
  CreditCard,
  FolderCog,
  HandCoins,
  House,
  Landmark,
  LayoutGrid,
  ListChecks,
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
  /** Active only on the exact path (Tarefas: the other Gestão pages live under `/tarefas/`). */
  end?: boolean;
}

/**
 * The two areas of the app. Gestão de tarefas (everyone, the start page after login) and Financeiro
 * (administrators only). `/configuracoes` and unknown paths belong to neither (`common`).
 */
export type Area = 'gestao' | 'financeiro';

/** Gestão de tarefas, phase 1: Início, Tarefas, Clientes and Cadastros (in order of use). */
export const GESTAO_NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Início', icon: House, mobile: true, end: true, keywords: 'painel resumo departamento hoje minhas' },
  {
    to: '/tarefas',
    label: 'Tarefas',
    icon: ListChecks,
    mobile: true,
    end: true,
    keywords: 'solicitacoes pedidos afazeres prazos kanban quadro agenda compromissos',
  },
  { to: '/tarefas/clientes', label: 'Clientes', icon: Building2, mobile: true, keywords: 'empresas cnpj regime contatos responsaveis carteira' },
  { to: '/tarefas/cadastros', label: 'Cadastros', icon: FolderCog, keywords: 'departamentos categorias equipe usuarios membros' },
];

/** Financeiro: the rail of the finance app, with the panel at `/financeiro`. */
export const FINANCE_NAV_ITEMS: NavItem[] = [
  { to: '/financeiro', label: 'Painel financeiro', short: 'Painel', icon: LayoutGrid, mobile: true, keywords: 'dashboard inicio resumo visao geral caixa' },
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

export const AREA_LABELS: Record<Area, string> = { gestao: 'Gestão de tarefas', financeiro: 'Financeiro' };
/** Short name under the logo. */
export const AREA_SHORT_LABELS: Record<Area, string> = { gestao: 'Gestão', financeiro: 'Financeiro' };
export const AREA_HOME: Record<Area, string> = { gestao: '/', financeiro: '/financeiro' };

export function navItemsFor(area: Area): NavItem[] {
  return area === 'financeiro' ? FINANCE_NAV_ITEMS : GESTAO_NAV_ITEMS;
}

/** Old address of the suppliers page, still a finance path (it redirects). */
const LEGACY_FINANCE_PATHS = ['/contatos'];

function underPath(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}

/**
 * The path as the router matches it: without query and hash, each segment percent-decoded (an
 * encoded `/` stays encoded, as in React Router) and in lower case (routes are case-insensitive).
 * Otherwise `/FINANCEIRO` or `/%65xtrato` would open a finance page while counting as "common".
 */
function routePath(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] || '/';
  return path
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment).replace(/\//g, '%2F');
      } catch {
        return segment;
      }
    })
    .join('/')
    .toLowerCase();
}

/**
 * Area of a route: `/` and `/tarefas/*` are Gestão; the finance rail's paths and their sub-paths
 * (`/cartoes/:id`, `/relatorios/cliente/:id`, the old `/contatos`) are Financeiro; anything else
 * (`/configuracoes`, unknown paths) is common. Matches like the router (see `routePath`).
 */
export function areaOf(pathname: string): Area | 'common' {
  const path = routePath(pathname);
  if (path === '/' || underPath(path, '/tarefas')) return 'gestao';
  if ([...FINANCE_NAV_ITEMS.map((i) => i.to), ...LEGACY_FINANCE_PATHS].some((to) => underPath(path, to))) return 'financeiro';
  return 'common';
}

/** Whether a rail item is the current page (`end` items only on their exact path). */
export function isActivePath(pathname: string, item: Pick<NavItem, 'to' | 'end'>): boolean {
  if (item.to === '/' || item.end) return pathname === item.to;
  return underPath(pathname, item.to);
}

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
