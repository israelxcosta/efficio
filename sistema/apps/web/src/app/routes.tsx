import { lazy } from 'react';
import { createBrowserRouter, createHashRouter, Link, Navigate, useLocation, type RouteObject } from 'react-router';
import { AppShell } from '@/components/layout/app-shell';
import { FinanceGate } from '@/components/layout/finance-gate';
import { Button } from '@/components/ui/button';
import { IS_DEMO } from '@/lib/demo';
import { SITE_PATH, SitePage } from '@/features/site/site-entry';

const LoginPage = lazy(() => import('@/features/auth/pages/login'));
const RegisterPage = lazy(() => import('@/features/auth/pages/register'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/pages/forgot-password'));
const ResetPasswordPage = lazy(() => import('@/features/auth/pages/reset-password'));
const InvitePage = lazy(() => import('@/features/workspaces/pages/invite'));
const TermsPage = lazy(() => import('@/features/legal/pages/legal').then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import('@/features/legal/pages/legal').then((m) => ({ default: m.PrivacyPage })));
const DashboardPage = lazy(() => import('@/features/dashboard/pages/dashboard'));
const StatementPage = lazy(() => import('@/features/statement/pages/statement'));
const PayablesPage = lazy(() => import('@/features/transactions/pages/payables'));
const ReceivablesPage = lazy(() => import('@/features/transactions/pages/receivables'));
const TransfersPage = lazy(() => import('@/features/transfers/pages/transfers'));
const AccountsPage = lazy(() => import('@/features/accounts/pages/accounts'));
const CardsPage = lazy(() => import('@/features/cards/pages/cards'));
const CardDetailPage = lazy(() => import('@/features/cards/pages/card-detail'));
const CategoriesPage = lazy(() => import('@/features/categories/pages/categories'));
const GoalsPage = lazy(() => import('@/features/goals/pages/goals'));
const ContactsPage = lazy(() => import('@/features/contacts/pages/contacts'));
const ClientsPage = lazy(() => import('@/features/clients/pages/clients'));
const ReportsPage = lazy(() => import('@/features/reports/pages/reports'));
const ClientReportPage = lazy(() => import('@/features/reports/pages/client-report'));
const SettingsPage = lazy(() => import('@/features/settings/pages/settings'));
// Gestão de tarefas: Início, Tarefas, Auditoria, Recorrentes, Processos, Clientes, Relatórios, Cadastros.
const GestaoLayout = lazy(() => import('@/features/tasks/gestao-layout'));
const MyAreaPage = lazy(() => import('@/features/tasks/pages/my-area'));
const TaskHomePage = lazy(() => import('@/features/tasks/pages/home'));
const TasksPage = lazy(() => import('@/features/tasks/pages/tasks'));
const TaskAuditPage = lazy(() => import('@/features/tasks/pages/audit'));
const RecurringTasksPage = lazy(() => import('@/features/tasks/pages/recurring'));
const ProcessesPage = lazy(() => import('@/features/tasks/pages/processes'));
const TaskReportsPage = lazy(() => import('@/features/tasks/pages/task-reports'));
const TaskClientsPage = lazy(() => import('@/features/tasks/pages/clients'));
const TaskRegistryPage = lazy(() => import('@/features/tasks/pages/registry'));
// Phase 3: the contract template editor (`office`) and the contract of a client (finance).
const ContractEditorPage = lazy(() => import('@/features/office/pages/contract-editor'));
const ClientContractPage = lazy(() => import('@/features/office/pages/client-contract'));

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <p className="eyebrow text-brand-text">Erro 404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Página não encontrada</h1>
      <p className="text-sm text-muted">O endereço acessado não existe ou foi movido.</p>
      <Button asChild className="mt-2">
        <Link to="/">Voltar ao início</Link>
      </Button>
    </div>
  );
}

/** /contatos became /fornecedores (clients have their own page): keep the query (?editar=<id>). */
function LegacyContactsRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/fornecedores${search}`} replace />;
}

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/cadastro', element: <RegisterPage /> },
  { path: '/esqueci-senha', element: <ForgotPasswordPage /> },
  { path: '/redefinir-senha', element: <ResetPasswordPage /> },
  { path: '/convite/:token', element: <InvitePage /> },
  // Same screen after the token leaves the address bar (it stays in the history state).
  { path: '/convite', element: <InvitePage /> },
  { path: '/termos', element: <TermsPage /> },
  { path: '/privacidade', element: <PrivacyPage /> },
  // The office's public site, signed in or not (visitors also get it at `/`, see AppShell).
  { path: SITE_PATH, element: <SitePage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      // Gestão de tarefas: the start page of everyone after login.
      {
        element: <GestaoLayout />,
        children: [
          { index: true, element: <TaskHomePage /> },
          { path: 'tarefas', element: <TasksPage /> },
          { path: 'tarefas/auditoria', element: <TaskAuditPage /> },
          { path: 'tarefas/recorrentes', element: <RecurringTasksPage /> },
          { path: 'tarefas/processos', element: <ProcessesPage /> },
          { path: 'tarefas/clientes', element: <TaskClientsPage /> },
          { path: 'tarefas/relatorios', element: <TaskReportsPage /> },
          { path: 'tarefas/cadastros', element: <TaskRegistryPage /> },
          // Common route (the rail stays the current area's), in this layout for the task sheets.
          { path: 'minha-area', element: <MyAreaPage /> },
        ],
      },
      // Financeiro (administrators): the same addresses as before, the panel moved to /financeiro.
      // Collaborators see "Acesso restrito" at these URLs and none of these pages mount.
      {
        element: <FinanceGate />,
        children: [
          { path: 'financeiro', element: <DashboardPage /> },
          { path: 'extrato', element: <StatementPage /> },
          { path: 'contas-a-pagar', element: <PayablesPage /> },
          { path: 'contas-a-receber', element: <ReceivablesPage /> },
          { path: 'transferencias', element: <TransfersPage /> },
          { path: 'contas', element: <AccountsPage /> },
          { path: 'cartoes', element: <CardsPage /> },
          { path: 'cartoes/:id', element: <CardDetailPage /> },
          { path: 'categorias', element: <CategoriesPage /> },
          { path: 'metas', element: <GoalsPage /> },
          { path: 'clientes', element: <ClientsPage /> },
          { path: 'clientes/:id/contrato', element: <ClientContractPage /> },
          { path: 'fornecedores', element: <ContactsPage /> },
          // Old address of the suppliers page (bookmarks, links in e-mails).
          { path: 'contatos', element: <LegacyContactsRedirect /> },
          { path: 'relatorios', element: <ReportsPage /> },
          { path: 'relatorios/cliente/:id', element: <ClientReportPage /> },
        ],
      },
      { path: 'configuracoes', element: <SettingsPage /> },
      { path: 'configuracoes/contrato', element: <ContractEditorPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];

// The demo build is served from a single static page, so it routes on the URL hash.
export function createAppRouter() {
  return (IS_DEMO ? createHashRouter : createBrowserRouter)(routes);
}
