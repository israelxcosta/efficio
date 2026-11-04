import type { QueryClient } from '@tanstack/react-query';

type Params = Record<string, unknown> | undefined;

/** Centralized query keys. The first segment is the "domain" used for invalidation. */
export const qk = {
  me: ['me'] as const,
  categories: (params?: Params) => ['categories', params ?? {}] as const,
  accounts: (params?: Params) => ['accounts', params ?? {}] as const,
  cards: (params?: Params) => ['credit-cards', params ?? {}] as const,
  invoices: (cardId: string, params?: Params) => ['credit-cards', cardId, 'invoices', params ?? {}] as const,
  invoice: (cardId: string, month: string) => ['credit-cards', cardId, 'invoice', month] as const,
  goals: () => ['goals'] as const,
  goalContributions: (goalId: string) => ['goals', goalId, 'contributions'] as const,
  contacts: (params?: Params) => ['contacts', params ?? {}] as const,
  contact: (id: string) => ['contacts', 'detail', id] as const,
  clients: (params?: Params) => ['clients', params ?? {}] as const,
  client: (id: string) => ['clients', 'detail', id] as const,
  clientFees: (id: string) => ['clients', 'fees', id] as const,
  transactions: (params?: Params) => ['transactions', params ?? {}] as const,
  transaction: (id: string) => ['transactions', 'detail', id] as const,
  transfers: (params?: Params) => ['transfers', params ?? {}] as const,
  statement: (params?: Params) => ['statement', params ?? {}] as const,
  dashboard: (month: string) => ['dashboard', month] as const,
  report: (name: string, params?: Params) => ['reports', name, params ?? {}] as const,
  search: (q: string) => ['search', q] as const,
  // SaaS: account security, the active workspace and its subscription.
  sessions: ['auth', 'sessions'] as const,
  members: ['workspace', 'members'] as const,
  invites: ['workspace', 'invites'] as const,
  audit: (page: number) => ['workspace', 'audit', page] as const,
  invitePreview: (token: string) => ['invite', token] as const,
  plans: ['billing', 'plans'] as const,
  subscription: ['billing', 'subscription'] as const,
  // Integrations: file imports (batches) and read-only bank connections (Open Finance).
  imports: (params?: Params) => ['imports', params ?? {}] as const,
  openFinanceStatus: ['open-finance', 'status'] as const,
  bankConnections: ['open-finance', 'connections'] as const,
  fakeInstitutions: ['open-finance', 'dev', 'institutions'] as const,
  // Task module (Gestão de tarefas): everything under the `tasks` domain is invalidated together.
  taskOptions: ['tasks', 'options'] as const,
  tasks: (params?: Params) => ['tasks', 'list', params ?? {}] as const,
  task: (id: string) => ['tasks', 'detail', id] as const,
  taskHome: (params?: Params) => ['tasks', 'home', params ?? {}] as const,
  taskDepartments: ['tasks', 'departments'] as const,
  taskCategories: ['tasks', 'categories'] as const,
  taskMembers: ['tasks', 'members'] as const,
  taskActivity: ['tasks', 'activity'] as const,
  taskHistory: (id: string) => ['tasks', 'history', id] as const,
  taskCalendar: (params?: Params) => ['tasks', 'calendar', params ?? {}] as const,
  taskReport: (params?: Params) => ['tasks', 'report', params ?? {}] as const,
  taskAudit: (params?: Params) => ['tasks', 'audit', params ?? {}] as const,
  recurringTasks: (params?: Params) => ['tasks', 'recurring', 'list', params ?? {}] as const,
  recurringTask: (id: string, month?: string) => ['tasks', 'recurring', 'detail', id, month ?? ''] as const,
  recurringOccurrence: (id: string, period: string) => ['tasks', 'recurring', 'occurrence', id, period] as const,
  regimeGroups: ['tasks', 'regime-groups'] as const,
  taskFlows: (params?: Params) => ['tasks', 'flows', 'list', params ?? {}] as const,
  taskFlow: (id: string) => ['tasks', 'flows', 'detail', id] as const,
  flowTemplates: ['tasks', 'flow-templates'] as const,
  /** Personal notes: not under `tasks` (a task change never touches them). */
  taskNotes: ['task-notes'] as const,
  /** Every client (all pages of /clients) for the read-only clients screen of the Gestão. */
  allClients: ['clients', 'all'] as const,
  // Phase 3: unions, deadlines (documents and agreements), office, contract and permissions per person.
  unions: (params?: Params) => ['unions', 'list', params ?? {}] as const,
  union: (id: string) => ['unions', 'detail', id] as const,
  deadlines: (kind?: string) => ['deadlines', 'list', kind ?? 'all'] as const,
  deadlinesSummary: ['deadlines', 'summary'] as const,
  deadlineClients: ['deadlines', 'clients'] as const,
  officeBranding: ['office', 'branding'] as const,
  office: ['office', 'registry'] as const,
  contractTemplate: ['office', 'contract-template'] as const,
  /** Under `clients`: a client or fee change makes it stale. */
  clientContract: (id: string) => ['clients', 'contract', id] as const,
  memberPermissions: (userId: string) => ['workspace', 'member-permissions', userId] as const,
};

/** Everything derived from transactions/balances. Called after any money-moving mutation. */
export function invalidateFinancialData(qc: QueryClient): Promise<unknown> {
  const domains = [
    'transactions',
    'transfers',
    'statement',
    'dashboard',
    'reports',
    'accounts',
    'credit-cards',
    'goals',
    'search',
    // Import batches count the transactions that still exist (deleting one changes it).
    'imports',
  ];
  return Promise.all(domains.map((d) => qc.invalidateQueries({ queryKey: [d] })));
}
