import {
  ArrowLeftRight,
  Building2,
  ChartColumn,
  ChartLine,
  CircleUserRound,
  ClipboardCheck,
  CreditCard,
  FolderCog,
  HandCoins,
  Layers,
  House,
  Landmark,
  LayoutGrid,
  ListChecks,
  Receipt,
  Repeat,
  ScrollText,
  Settings,
  Tags,
  Target,
  Truck,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { PagePermissionKey, PermissionKey } from '@effinance/shared';

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
  /** Other paths (and their sub-paths) that also make it active: Tarefas on the hub pages (spec §2.2). */
  activeOn?: string[];
  /** `hub` pages live in the tasks hub (spec §2.9), not in the rail nor the "Mais"; ⌘K keeps them. */
  place?: 'rail' | 'hub';
  /** Page key that hides it (phase 3, spec §13.10): Início and Tarefas have none. */
  permission?: PagePermissionKey;
}

/**
 * The two areas of the app. Gestão de tarefas (everyone, the start page after login) and Financeiro
 * (administrators only). `/configuracoes` and unknown paths belong to neither (`common`).
 */
export type Area = 'gestao' | 'financeiro';

/** Pages of the tasks hub: Tarefas stays active in the rail on them (spec §2.2). */
const HUB_PATHS = ['/tarefas/auditoria', '/tarefas/recorrentes', '/tarefas/processos'];

/**
 * Gestão de tarefas (spec §2.2, revision 4): the 5-item rail (Início, Tarefas, Clientes, Relatórios,
 * Cadastros) and, after it, the hub pages (`place: 'hub'`), which ⌘K, the route test and
 * `pagePermissionOf` still need.
 */
export const GESTAO_NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Início', icon: House, mobile: true, end: true, keywords: 'painel resumo departamento hoje minhas' },
  {
    to: '/tarefas',
    label: 'Tarefas',
    icon: ListChecks,
    mobile: true,
    end: true,
    activeOn: HUB_PATHS,
    keywords: 'solicitacoes pedidos afazeres prazos kanban quadro agenda compromissos calendario',
  },
  {
    to: '/tarefas/clientes',
    label: 'Clientes',
    icon: Building2,
    mobile: true,
    permission: 'page.clients',
    keywords: 'empresas cnpj regime contatos documentos certificado certidoes alvara inscricao',
  },
  {
    to: '/tarefas/relatorios',
    label: 'Relatórios de tarefas',
    short: 'Relatórios',
    icon: ChartColumn,
    permission: 'page.reports',
    keywords: 'produtividade pontualidade entregas atrasos exportar csv pdf',
  },
  {
    to: '/tarefas/cadastros',
    label: 'Cadastros',
    icon: FolderCog,
    permission: 'page.registry',
    keywords: 'departamentos categorias equipe usuarios membros sindicatos convencoes data-base permissoes',
  },
  {
    to: '/tarefas/auditoria',
    label: 'Auditoria mensal',
    short: 'Auditoria',
    icon: ClipboardCheck,
    place: 'hub',
    permission: 'page.audit',
    keywords: 'competencia matriz obrigacoes entregas conclusao acompanhamento encerramento',
  },
  {
    to: '/tarefas/recorrentes',
    label: 'Tarefas recorrentes',
    short: 'Recorrentes',
    icon: Repeat,
    place: 'hub',
    permission: 'page.recurring',
    keywords: 'obrigacoes repeticoes repete prazo legal meta das dctfweb folha periodicidade feriados grupos regime',
  },
  {
    to: '/tarefas/processos',
    label: 'Processos',
    icon: Workflow,
    place: 'hub',
    permission: 'page.processes',
    keywords: 'fluxos modelos etapas roteiro abertura alteracao',
  },
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

/** Grupos por regime, a view of Recorrentes: in ⌘K (spec §2.8) and in the hub, never in the rail. */
export const REGIME_GROUPS_ITEM: NavItem = {
  to: '/tarefas/recorrentes?visao=regimes',
  label: 'Grupos por regime',
  icon: Layers,
  place: 'hub',
  permission: 'page.recurring',
  keywords: 'obrigacoes padrao regime simples presumido real mei',
};

/** Minha área (spec §15.4): a common route, opened by the avatar; in ⌘K and on the phone's "Mais". */
export const MY_AREA_ITEM: NavItem = {
  to: '/minha-area',
  label: 'Minha área',
  icon: CircleUserRound,
  keywords: 'perfil eu meu painel anotacoes calendario conta sair tema',
};

export const AREA_LABELS: Record<Area, string> = { gestao: 'Gestão de tarefas', financeiro: 'Financeiro' };
/** Short name under the logo. */
export const AREA_SHORT_LABELS: Record<Area, string> = { gestao: 'Gestão', financeiro: 'Financeiro' };
export const AREA_HOME: Record<Area, string> = { gestao: '/', financeiro: '/financeiro' };

/**
 * Items of an area that the person sees: a Gestão page whose `page.*` key is off is gone from the
 * rail, the "Mais" and ⌘K (its URL shows "Acesso restrito"). Without `can`, every item.
 */
export function navItemsFor(area: Area, can?: (key: PermissionKey) => boolean): NavItem[] {
  const items = area === 'financeiro' ? FINANCE_NAV_ITEMS : GESTAO_NAV_ITEMS;
  return can ? items.filter((i) => !i.permission || can(i.permission)) : items;
}

/** Items of the rail and of the mobile "Mais": `navItemsFor` without the hub pages (spec §2.2). */
export function railItemsFor(area: Area, can?: (key: PermissionKey) => boolean): NavItem[] {
  return navItemsFor(area, can).filter((i) => i.place !== 'hub');
}

/** Page key of a Gestão path (`/tarefas/auditoria/...` → `page.audit`); null for Início, Tarefas and others. */
export function pagePermissionOf(pathname: string): PagePermissionKey | null {
  const path = routePath(pathname);
  const item = GESTAO_NAV_ITEMS.find((i) => i.permission && underPath(path, i.to));
  return item?.permission ?? null;
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

/**
 * Whether the page hosts the task sheets (`?tarefa=`, `?recorrente=&periodo=`): the Gestão pages and
 * Minha área, a common route mounted in the Gestão layout (spec §15.4).
 */
export function hostsTaskSheets(pathname: string): boolean {
  return areaOf(pathname) === 'gestao' || underPath(routePath(pathname), MY_AREA_ITEM.to);
}

/**
 * Whether a rail item is the current page: `end` items only on their exact path, the others on their
 * sub-paths too; `activeOn` paths (and their sub-paths) also count (Tarefas on the hub pages).
 */
export function isActivePath(pathname: string, item: Pick<NavItem, 'to' | 'end' | 'activeOn'>): boolean {
  const path = routePath(pathname);
  if (item.activeOn?.some((to) => underPath(path, to))) return true;
  if (item.to === '/' || item.end) return path === item.to;
  return underPath(path, item.to);
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
