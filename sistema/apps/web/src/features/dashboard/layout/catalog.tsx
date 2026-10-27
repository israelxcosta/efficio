import { CashflowWidget } from '../components/cashflow-card';
import { EvolutionWidget, CompositionWidget } from '../widgets/trend-widgets';
import { ExpenseCategoryWidget, IncomeCategoryWidget, MonthlyResultWidget, SummaryWidget } from '../widgets/analysis-widgets';
import { ClientsPortfolioWidget, FeePeriodsWidget, FeesMonthWidget, IncompleteClientsWidget } from '../widgets/clients-widgets';
import { BalancesWidget, HealthWidget, InsightsWidget } from '../widgets/overview-widgets';
import { FixedExpensesWidget, FixedIncomeWidget, GoalsWidget } from '../widgets/planning-widgets';
import { ProjectionWidget } from '../widgets/projection-widget';
import { CardsWidget, DebtorsWidget, OverdueWidget, UpcomingWidget } from '../widgets/receivables-widgets';
import type { WidgetComponents } from './widget-grid';

/** One component per widget id (the Record type fails the build when one is missing). */
export const WIDGET_COMPONENTS: WidgetComponents = {
  'fluxo-caixa': CashflowWidget,
  saude: HealthWidget,
  'saldo-contas': BalancesWidget,
  insights: InsightsWidget,
  'projecao-caixa': ProjectionWidget,
  inadimplencia: OverdueWidget,
  'clientes-devedores': DebtorsWidget,
  'proximos-vencimentos': UpcomingWidget,
  'fatura-cartao': CardsWidget,
  'resumo-periodo': SummaryWidget,
  'despesas-categoria': ExpenseCategoryWidget,
  'receitas-categoria': IncomeCategoryWidget,
  'resultado-mensal': MonthlyResultWidget,
  evolucao: EvolutionWidget,
  composicao: CompositionWidget,
  'carteira-clientes': ClientsPortfolioWidget,
  'vigencias-honorarios': FeePeriodsWidget,
  'honorarios-mes': FeesMonthWidget,
  'cadastro-incompleto': IncompleteClientsWidget,
  'gastos-fixos': FixedExpensesWidget,
  'receitas-fixas': FixedIncomeWidget,
  metas: GoalsWidget,
};
