// API response types. Amounts are integer cents; dates are 'YYYY-MM-DD'; timestamps ISO 8601.

import type {
  AccountType,
  BankCode,
  CardBrand,
  CategoryType,
  ClientStatus,
  ContactKind,
  DelinquencyRisk,
  FeeEntryKind,
  GenerateFeesSkipReason,
  Frequency,
  IconName,
  InactivationReason,
  InvoiceStatus,
  LateFeeKind,
  FlowStepState,
  NonBusinessDayRule,
  OccurrenceStatus,
  OpenTaskStatus,
  PaymentMethod,
  RecurrenceKind,
  RecurrencePeriod,
  SimplesAnnex,
  TaskDueBucket,
  TaskPriority,
  TaskStatus,
  TaxRegime,
  TransactionType,
  TransferKind,
} from './constants';
import type { TransactionOrigin } from './integrations';
import type { MemberRole } from './saas';
import type { ISODate, MonthKey } from './utils/dates';
import type { FeePeriod } from './utils/fees';

export interface ApiError {
  /** Machine-readable code: 'validation_error' | 'not_found' | 'unauthorized' | 'conflict' | ... */
  error: string;
  /** Human-readable message in pt-BR. */
  message: string;
  details?: unknown;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

/** Session cookie (httpOnly) is also set; `token` allows Bearer usage by non-browser clients. */
export interface AuthResponse {
  user: User;
  token: string;
}

// ---------------------------------------------------------------------------
// Catalog entities
// ---------------------------------------------------------------------------

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  icon: IconName;
  color: string;
  parentId: string | null;
  archived: boolean;
  createdAt: string;
}

/** GET /categories returns top-level categories with their subcategories nested. */
export interface CategoryWithChildren extends Category {
  subcategories: Category[];
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  bank: BankCode | null;
  color: string;
  icon: IconName;
  initialBalance: number;
  includeInTotal: boolean;
  archived: boolean;
  createdAt: string;
  /** initialBalance + paid movements up to today. */
  balance: number;
  /** balance + pending movements due until the end of the current month. */
  projectedBalance: number;
}

export interface InvoiceSummary {
  cardId: string;
  month: MonthKey;
  closingDate: ISODate;
  dueDate: ISODate;
  total: number;
  unpaidTotal: number;
  status: InvoiceStatus;
}

export interface CreditCard {
  id: string;
  name: string;
  bank: BankCode;
  brand: CardBrand;
  limit: number;
  closingDay: number;
  dueDay: number;
  color: string;
  defaultAccountId: string | null;
  archived: boolean;
  createdAt: string;
  /** Sum of every unpaid purchase/installment on the card. */
  usedLimit: number;
  availableLimit: number;
  /** Invoice that receives purchases made today. */
  currentInvoice: InvoiceSummary;
}

export interface Invoice extends InvoiceSummary {
  card: Pick<CreditCard, 'id' | 'name' | 'bank' | 'brand' | 'color'>;
  transactions: Transaction[];
  /** Payment transfer(s) registered for this invoice. */
  payments: Transaction[];
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  deadline: ISODate | null;
  icon: IconName;
  color: string;
  accountId: string | null;
  notes: string | null;
  archived: boolean;
  createdAt: string;
  /** Sum of contributions (withdrawals are negative). */
  currentAmount: number;
  /** 0..1 (capped). */
  progress: number;
  /** Amount needed per month to reach the target by the deadline (null without deadline). */
  monthlyNeeded: number | null;
  completed: boolean;
}

export interface GoalContribution {
  id: string;
  goalId: string;
  amount: number;
  date: ISODate;
  note: string | null;
  createdAt: string;
}

export interface Contact {
  id: string;
  /** Client (empresa atendida) or supplier (fornecedor). */
  kind: ContactKind;
  /** Suppliers are always active; clients can be inactivated. */
  status: ClientStatus;
  name: string;
  /** Digits only (CPF or CNPJ). */
  document: string | null;
  email: string | null;
  /** Digits only. */
  phone: string | null;
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Clients (empresas atendidas) and fees (honorários)
// ---------------------------------------------------------------------------

export interface ClientInactivation {
  date: ISODate;
  reason: InactivationReason;
  notes: string | null;
}

/** One fee period (vigência): one year, the first starting on the contract start date. */
export interface ClientFee extends FeePeriod {
  id: string;
  clientId: string;
  /** Honorário mensal (cents). */
  amount: number;
  /** Taxa por empregado (cents per employee, per month). */
  employeeFee: number;
  /** Discount for paying by the due date, in basis points (500 = 5%); 0 = none. */
  discountBps: number;
  createdAt: string;
}

export interface Client {
  id: string;
  /** Razão social. */
  name: string;
  /** Nome fantasia. */
  tradeName: string | null;
  /** CNPJ, digits only. */
  document: string;
  openedAt: ISODate | null;
  mainActivity: string | null;
  email: string | null;
  phone: string | null;
  responsibleName: string | null;
  responsibleEmail: string | null;
  responsiblePhone: string | null;
  taxRegime: TaxRegime;
  /** Only for the Simples Nacional. */
  simplesAnnex: SimplesAnnex | null;
  contractStartDate: ISODate;
  /**
   * Day of the month the fee is due (month after the competence). `null` for members without access
   * to the finances (role `viewer`): it is part of the fee terms.
   */
  feeDueDay: number | null;
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  /** Observações. `null` for members without access to the finances (role `viewer`). */
  notes: string | null;
  status: ClientStatus;
  /** Set while inactive. */
  inactivation: ClientInactivation | null;
  /**
   * Fee period that contains today, when registered. Always `null` for members without access to
   * the finances (role `viewer`): fees are financial data.
   */
  currentFee: ClientFee | null;
  /** Most recent registered period (may have expired or not started yet). `null` for `viewer` too. */
  latestFee: ClientFee | null;
  /** Transactions (lançamentos) linked to the client. While > 0 the client cannot be deleted. */
  transactionCount: number;
  createdAt: string;
}

export interface ClientListResponse extends Paginated<Client> {
  /** Whole workspace, regardless of filters and page. */
  summary: {
    active: number;
    inactive: number;
    /**
     * Sum of the current monthly fees of active clients (cents). The three fee totals are `null` for
     * members without access to the finances (role `viewer`).
     */
    monthlyFees: number | null;
    /** Active clients without a registered fee period covering today (new or due for renewal). */
    withoutCurrentFee: number | null;
    /** Active clients per tax regime. */
    byRegime: Record<TaxRegime, number>;
    /** Average current monthly fee of the active clients that have one (cents; 0 when none). */
    averageFee: number | null;
  };
}

export interface ClientFeesResponse {
  /** Period that contains today, when registered. */
  current: ClientFee | null;
  /** Every period, newest first. */
  items: ClientFee[];
  /** Period the next registration ("+ nova vigência") will cover. */
  next: FeePeriod;
}

export interface CnpjPartner {
  name: string;
  /** Qualificação, e.g. "Sócio-Administrador". */
  role: string | null;
}

/** Basic company data from the Receita Federal (CNPJ), normalized for the client form. */
export interface CnpjLookupResult {
  document: string;
  name: string;
  tradeName: string | null;
  openedAt: ISODate | null;
  mainActivity: string | null;
  /** Situação cadastral, e.g. "ATIVA", "BAIXADA". */
  registrationStatus: string | null;
  email: string | null;
  phone: string | null;
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  /** Simples Nacional / MEI when the company opted in; null otherwise (Presumido/Real are not public). */
  taxRegime: TaxRegime | null;
  partners: CnpjPartner[];
  /** Suggested responsible person: the first administrator partner. */
  responsibleName: string | null;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export interface RefCategory {
  id: string;
  name: string;
  icon: IconName;
  color: string;
}

export interface RefAccount {
  id: string;
  name: string;
  type: AccountType;
  bank: BankCode | null;
  color: string;
}

export interface RefCard {
  id: string;
  name: string;
  bank: BankCode;
  brand: CardBrand;
  color: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  description: string;
  amount: number;
  /** Due date / competence date (purchase date for card purchases). */
  date: ISODate;
  paid: boolean;
  paidAt: ISODate | null;
  /** paid && paidAt ? paidAt : date — used by the statement and cash flow. */
  effectiveDate: ISODate;
  /** !paid && date < today */
  overdue: boolean;

  accountId: string | null;
  /** Transfers only: destination account. */
  toAccountId: string | null;
  creditCardId: string | null;
  /** Card purchases and card payments: invoice month 'YYYY-MM'. */
  invoiceMonth: MonthKey | null;
  categoryId: string | null;
  subcategoryId: string | null;
  contactId: string | null;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  transferKind: TransferKind | null;

  recurrenceId: string | null;
  recurrenceKind: RecurrenceKind;
  frequency: Frequency | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  /** Position of this occurrence in a recurring/fixed series (1-based). */
  occurrenceNumber: number | null;
  /** Shared by the parts of an amount divided across categories at creation. */
  splitGroupId: string | null;
  /** How the row was created: by hand, from an imported file or synced through Open Finance. */
  origin: TransactionOrigin;
  /** Import batch (file or Open Finance sync) that created the row; undoing the batch removes it. */
  importBatchId: string | null;
  /** Interest or fine of a late payment: the transaction it was charged on, and which one. */
  lateFeeOf: string | null;
  lateFeeKind: LateFeeKind | null;
  /** Interest and fine charged when this transaction was settled late (null when none). */
  lateFees: { interest: number; fine: number } | null;
  /** Made by "Gerar honorários": the competence month ('YYYY-MM') and whether it is the fee or the employee charge. */
  feeCompetence: MonthKey | null;
  feeKind: FeeEntryKind | null;
  /** Employee charge: the fee it belongs to, and how many employees were billed. */
  feeOf: string | null;
  employees: number | null;
  /** Generated fee: discount offered for paying by the due date, in basis points (null = none). */
  feeDiscountBps: number | null;
  /** Discount row: the receivable it was granted on. */
  discountOf: string | null;
  /** Discount granted when this receivable was settled by the due date (cents; null when none). */
  discount: number | null;

  createdAt: string;
  updatedAt: string;

  category: RefCategory | null;
  subcategory: RefCategory | null;
  account: RefAccount | null;
  toAccount: RefAccount | null;
  creditCard: RefCard | null;
  contact: { id: string; name: string } | null;
}

export interface TransactionTotals {
  count: number;
  total: number;
  paid: number;
  pending: number;
  overdue: number;
  overdueCount: number;
}

export interface TransactionListResponse extends Paginated<Transaction> {
  /** Totals of the whole filtered set (not just the page). */
  summary: TransactionTotals & {
    income: number;
    expense: number;
  };
}

// ---------------------------------------------------------------------------
// Statement
// ---------------------------------------------------------------------------

export interface StatementEntry {
  transaction: Transaction;
  /** Signed effect on the selected account(s): + inflow, − outflow, 0 for internal transfers. */
  amount: number;
  /** Running balance after this entry. For pending entries it is the projected running balance. */
  balanceAfter: number;
  pending: boolean;
}

export interface StatementResponse {
  account: Account | null;
  from: ISODate;
  to: ISODate;
  /** Paid balance at the end of the day before `from`. */
  openingBalance: number;
  /** Opening + paid entries in the period. */
  closingBalance: number;
  /** Opening + paid + pending entries in the period. */
  projectedClosingBalance: number;
  totalIn: number;
  totalOut: number;
  pendingIn: number;
  pendingOut: number;
  entries: StatementEntry[];
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export type InsightKind = 'opportunity' | 'warning' | 'achievement' | 'info';

export interface Insight {
  kind: InsightKind;
  title: string;
  description: string;
  /** Optional deep link inside the web app, e.g. '/relatorios?aba=categories'. */
  href?: string;
}

export interface CategoryAmount {
  categoryId: string | null;
  name: string;
  icon: IconName;
  color: string;
  amount: number;
  /** 0..1 share of the total. */
  share: number;
}

export interface MonthSummary {
  month: MonthKey;
  income: number;
  expense: number;
  net: number;
  /** net / income (0..1, may be negative); null without income. */
  savingsRate: number | null;
  paidIncome: number;
  paidExpense: number;
  pendingIncome: number;
  pendingExpense: number;
}

export interface HealthScore {
  /** 0..1000 */
  score: number;
  label: 'Crítica' | 'Atenção' | 'Saudável' | 'Excelente';
  factors: { label: string; score: number; max: number; hint: string }[];
}

export interface DashboardResponse {
  month: MonthKey;
  balances: {
    /** Non-investment accounts with includeInTotal. */
    accounts: number;
    investments: number;
    /** Unpaid card purchases. */
    cardDebt: number;
    /** accounts + investments − cardDebt */
    netWorth: number;
  };
  summary: MonthSummary;
  previous: MonthSummary;
  /** Last 6 months (competence), oldest first. */
  monthly: MonthSummary[];
  expensesByCategory: CategoryAmount[];
  incomeByCategory: CategoryAmount[];
  /** Pending transactions (no card purchases) overdue or due in the next 15 days, oldest first (up to 50). */
  upcoming: Transaction[];
  /** Totals of everything `upcoming` covers (the list itself is capped). */
  upcomingTotals: { incomeCount: number; income: number; expenseCount: number; expense: number };
  /** Overdue expenses (no card purchases). */
  overdue: { count: number; amount: number };
  /** Closed or overdue card invoices still unpaid, oldest due date first. */
  invoicesToPay: InvoiceSummary[];
  fixedExpenses: Transaction[];
  fixedIncome: Transaction[];
  goals: Goal[];
  cards: CreditCard[];
  accounts: Account[];
  health: HealthScore;
  insights: Insight[];
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface ReportPeriod {
  key: string;
  label: string;
  start: ISODate;
  end: ISODate;
  /** Period starts after today (values come from scheduled/pending items). */
  projected: boolean;
}

export interface CategorySeries {
  categoryId: string | null;
  name: string;
  icon: IconName;
  color: string;
  total: number;
  share: number;
  /** One value per period (same order as `periods`). */
  values: number[];
  /** Monthly average across the periods with data. */
  average: number;
}

export interface CategoryReportResponse {
  type: CategoryType;
  periods: ReportPeriod[];
  series: CategorySeries[];
  totals: number[];
  total: number;
}

export interface ContactSeries {
  contactId: string | null;
  name: string;
  income: number;
  expense: number;
  net: number;
  count: number;
  incomeValues: number[];
  expenseValues: number[];
}

export interface ContactReportResponse {
  periods: ReportPeriod[];
  items: ContactSeries[];
}

/** Open receivable of a client, past its due date. */
export interface DelinquencyOverdueItem {
  id: string;
  description: string;
  /** Due date. */
  date: ISODate;
  amount: number;
  daysLate: number;
  /** Competence month of generated fees; null for other receivables (the message then uses the month before the due date). */
  competence: MonthKey | null;
}

export interface GenerateFeesResponse {
  competence: MonthKey;
  dryRun: boolean;
  /**
   * Fees created (or that would be created on a dry run, with `transactionId` null), each due on the
   * client's `feeDueDay` and carrying the fee period's discount.
   */
  created: {
    clientId: string;
    name: string;
    amount: number;
    dueDate: ISODate;
    /** Discount for paying by the due date (basis points; 0 = none). */
    discountBps: number;
    transactionId: string | null;
  }[];
  skipped: { clientId: string; name: string; reason: GenerateFeesSkipReason }[];
  /** Sum of `created`. */
  total: number;
}

export interface FeeEmployeesResponse {
  employees: number;
  /** Client's employee fee for the fee period of the competence (cents). */
  rate: number;
  amount: number;
  dryRun: boolean;
  /** The employee receivable; null when removed (employees = 0) or on a dry run. */
  transaction: Transaction | null;
}

export interface DelinquencyClient {
  contactId: string;
  /** Razão social. */
  name: string;
  tradeName: string | null;
  /** CNPJ, digits only. */
  document: string | null;
  responsibleName: string | null;
  /** Best number for WhatsApp: the responsible person's, else the company's. */
  phone: string | null;
  status: ClientStatus;
  /** Receivables due in the period (paid, or unpaid and past due). */
  dueCount: number;
  onTimeCount: number;
  /** Paid after the due date, or still open past it. */
  lateCount: number;
  /** Open and past due, any date (also before the period). */
  openCount: number;
  openAmount: number;
  /** Average days late of the late ones (open ones count until today); null when never late. */
  avgDaysLate: number | null;
  maxDaysLate: number;
  /** Late payments settled with interest / with a fine, and the amounts charged. */
  interestCount: number;
  fineCount: number;
  interestTotal: number;
  fineTotal: number;
  /** Chance (0..1) of paying the next receivable late, from the history (recent months weigh more). */
  probability: number;
  /** 0..1000, higher is a better payer. */
  score: number;
  risk: DelinquencyRisk;
  /** Fewer than 3 receivables in the period: the score leans on the default. */
  lowHistory: boolean;
  /** Open past-due receivables, oldest first (for the collection message). */
  overdue: DelinquencyOverdueItem[];
}

export interface DelinquencyMonth {
  month: MonthKey;
  dueCount: number;
  lateCount: number;
  /** lateCount / dueCount (0 when nothing was due). */
  lateRate: number;
  avgDaysLate: number | null;
  dueAmount: number;
  lateAmount: number;
}

export interface DelinquencyReportResponse {
  from: ISODate;
  to: ISODate;
  summary: {
    dueCount: number;
    lateCount: number;
    lateRate: number;
    avgDaysLate: number | null;
    openCount: number;
    openAmount: number;
    /** Clients with something open past due. */
    openClients: number;
    interestTotal: number;
    fineTotal: number;
    /** Late payments settled with interest or a fine. */
    paidWithFeesCount: number;
    /** Average chance of paying late over the clients in the report, weighted by their history. */
    probability: number;
    /** Clients with risk 'alto' or 'critico'. */
    clientsAtRisk: number;
  };
  monthly: DelinquencyMonth[];
  /** Clients with receivables in the period or open past due; most open amount first. */
  clients: DelinquencyClient[];
}

export interface PeriodTotals {
  from: ISODate;
  to: ISODate;
  income: number;
  expense: number;
  net: number;
  count: number;
}

export interface ComparisonRow {
  categoryId: string | null;
  name: string;
  icon: IconName;
  color: string;
  a: number;
  b: number;
  diff: number;
  /** (b − a) / a; null when a = 0. */
  diffPercent: number | null;
}

export interface ComparisonReportResponse {
  type: CategoryType;
  a: PeriodTotals;
  b: PeriodTotals;
  rows: ComparisonRow[];
}

export interface CashflowPeriod extends ReportPeriod {
  inflow: number;
  outflow: number;
  net: number;
  /** Running balance at the end of the period (realized + projected). */
  balance: number;
  realizedInflow: number;
  realizedOutflow: number;
  pendingInflow: number;
  pendingOutflow: number;
}

export interface CashflowReportResponse {
  openingBalance: number;
  closingBalance: number;
  periods: CashflowPeriod[];
}

export interface OverviewReportResponse {
  from: ISODate;
  to: ISODate;
  income: number;
  expense: number;
  net: number;
  savingsRate: number | null;
  /** expense / days in range */
  averageDailyExpense: number;
  fixedExpense: number;
  variableExpense: number;
  installmentExpense: number;
  byPaymentMethod: { method: PaymentMethod | null; label: string; amount: number; share: number }[];
  topExpenses: Transaction[];
  topCategories: CategoryAmount[];
  insights: Insight[];
}

export interface SearchResponse {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  contacts: Contact[];
}

// ---------------------------------------------------------------------------
// Tasks (módulo Tarefas). Every number shown by the screens comes computed by the API with the same
// filters as the lists. "Overdue" is always derived from the due date and today (office time zone).
// ---------------------------------------------------------------------------

export interface TaskRef {
  id: string;
  name: string;
}

/** A current member of the workspace (assignees, responsibles). */
export interface TaskMemberRef {
  id: string;
  name: string;
}

/**
 * Who did something (created, concluded, commented). The current name while the person is a member;
 * otherwise the name recorded at the time. `id` is null when the account no longer exists.
 */
export interface TaskPersonRef {
  id: string | null;
  name: string;
}

export interface TaskClientRef {
  id: string;
  /** Trade name, else the legal name. */
  name: string;
}

export interface TaskCategoryRef {
  id: string;
  name: string;
  icon: IconName;
  color: string;
}

/** A member as the task module sees it. Each member is in at most one department. */
export interface TaskMember {
  id: string;
  name: string;
  role: MemberRole;
  /** owner/editor: manages the registries of the module (and sees the finances). */
  isAdmin: boolean;
  department: TaskRef | null;
  isYou: boolean;
}

export interface TaskDepartment {
  id: string;
  name: string;
  members: TaskMemberRef[];
  /** Open tasks in the department (standalone and flow steps). */
  openCount: number;
  overdueCount: number;
  /** Active recurring tasks of the department. */
  recurringCount: number;
  /** Every task ever placed in the department; while > 0 (or members / recurring tasks) it cannot be deleted. */
  taskCount: number;
  createdAt: string;
}

export interface TaskCategory {
  id: string;
  name: string;
  icon: IconName;
  color: string;
  taskCount: number;
  createdAt: string;
}

/** Client as the task module sees it: read only, no fees. */
export interface TaskClientOption {
  id: string;
  /** Trade name, else the legal name. */
  name: string;
  legalName: string;
  taxRegime: TaxRegime;
  status: ClientStatus;
  contractStartDate: ISODate;
  inactivatedAt: ISODate | null;
}

/** Responsible member of a client in a department (Onvio/Tareffa style "carteira"). */
export interface ClientResponsible {
  clientId: string;
  departmentId: string;
  user: TaskMemberRef;
}

/** GET /tasks/client-responsibles: the grid client × department. */
export interface ClientResponsiblesResponse {
  departments: TaskRef[];
  clients: TaskClientOption[];
  items: ClientResponsible[];
}

/** GET /tasks/options: everything the pickers of the module need, in one request. */
export interface TaskOptionsResponse {
  /** Today in the office time zone. */
  today: ISODate;
  me: {
    id: string;
    name: string;
    role: MemberRole;
    department: TaskRef | null;
    /** owner/editor: registries, deletions, any department in the home summary. */
    isAdmin: boolean;
    /** The subscription allows writing (any member writes tasks; 402 otherwise). */
    canWrite: boolean;
  };
  members: TaskMember[];
  departments: TaskRef[];
  categories: TaskCategory[];
  /** Active and inactive clients (pickers usually show only the active ones). */
  clients: TaskClientOption[];
  clientResponsibles: ClientResponsible[];
}

export interface TaskFlowRef {
  id: string;
  title: string;
  /** 1-based position of this task's step ("Etapa 2/4"). */
  position: number;
  stepCount: number;
}

/** A task as listed (row, card, widgets). */
export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  /** Status to go back to when reopening a concluded/canceled task (the one before concluding, else `todo`). */
  reopenStatus: OpenTaskStatus;
  priority: TaskPriority;
  /** null = internal ("Interna"). */
  client: TaskClientRef | null;
  /** The assignee's department (or the queue chosen for an unassigned task). */
  department: TaskRef | null;
  category: TaskCategoryRef | null;
  assignee: TaskMemberRef | null;
  startDate: ISODate | null;
  dueDate: ISODate | null;
  /** Appointment on the due date ("HH:MM"). */
  startTime: string | null;
  endTime: string | null;
  /** Open with a due date before today. */
  overdue: boolean;
  /** Days past the due date (0 when not overdue). */
  daysOverdue: number;
  /** When it was concluded (set by the server; cleared when reopened). */
  completedAt: string | null;
  /** Who concluded it (may differ from the assignee). */
  completedBy: TaskPersonRef | null;
  subtaskCount: { done: number; total: number };
  commentCount: number;
  /** Set when the task is the step of a flow. */
  flow: TaskFlowRef | null;
  createdBy: TaskPersonRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskSubtask {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

export interface TaskComment {
  id: string;
  author: TaskPersonRef | null;
  /** Plain text (render with pre-wrap, never as HTML). */
  text: string;
  isYours: boolean;
  createdAt: string;
}

/** GET /tasks/:id (and the result of every task write). */
export interface TaskDetail extends Task {
  description: string | null;
  subtasks: TaskSubtask[];
  comments: TaskComment[];
  /** The whole flow when the task is one of its steps (FlowStepper). */
  flowProgress: TaskFlow | null;
}

/** PATCH /tasks/:id/status: the task and, when it concluded a flow step, the task of the next step. */
export interface TaskStatusChangeResponse {
  task: TaskDetail;
  activated: Task | null;
}

/**
 * A recurring task in one competence, aggregated over the client cells in view (the list row
 * "DCTFWeb · 12 de 30 clientes pendentes", the board card and the audit column). Counts follow the
 * request's scope and filters (e.g. "Minhas" counts only the cells whose responsible is you).
 */
export interface RecurringOccurrence {
  recurringTaskId: string;
  name: string;
  period: RecurrencePeriod;
  competence: MonthKey;
  /** Legal deadline ("prazo legal"); null for a recurring task without due day (audit only). */
  legalDueDate: ISODate | null;
  /** Internal target ("meta interna"), on or before the legal deadline. */
  targetDate: ISODate | null;
  department: TaskRef | null;
  /** Default responsible of the recurring task (each client may have its own, see the cells). */
  assignee: TaskMemberRef | null;
  total: number;
  done: number;
  inProgress: number;
  /** total − done. */
  pending: number;
  /** Legal deadline before today with pending cells. */
  overdue: boolean;
  daysOverdue: number;
  /** Target before today with pending cells. */
  targetMissed: boolean;
  /** Derived: none done → todo; some → in_progress; all → done. */
  status: OccurrenceStatus;
}

/** One cell: client × recurring task × competence. */
export interface OccurrenceCell {
  recurringTaskId: string;
  clientId: string;
  competence: MonthKey;
  status: OccurrenceStatus;
  /** The client's responsible in the recurring task's department, else the default responsible. */
  assignee: TaskMemberRef | null;
  legalDueDate: ISODate | null;
  targetDate: ISODate | null;
  overdue: boolean;
  /** Conclusion record (server-side, immutable while concluded; erased when reopened). */
  concludedBy: TaskPersonRef | null;
  concludedAt: string | null;
  /** Concluded on or before the legal deadline (office time zone); null while open or without deadline. */
  concludedOnTime: boolean | null;
}

export interface OccurrenceClient {
  id: string;
  /** Trade name, else the legal name. */
  name: string;
  legalName: string;
  /** CNPJ, digits only. */
  document: string;
  taxRegime: TaxRegime;
}

/** GET /tasks/recurring/:id/occurrences/:competence (RecurringOccurrenceSheet). */
export interface RecurringOccurrenceDetail extends RecurringOccurrence {
  description: string | null;
  cells: (OccurrenceCell & { client: OccurrenceClient })[];
}

export interface RecurringTask {
  id: string;
  name: string;
  description: string | null;
  period: RecurrencePeriod;
  dueDay: number | null;
  dueMonth: number | null;
  /** Months (1–12) it occurs in (all 12 for monthly or without due day). */
  months: number[];
  targetDaysBefore: number;
  nonBusinessDayRule: NonBusinessDayRule;
  department: TaskRef | null;
  assignee: TaskMemberRef | null;
  regimes: TaxRegime[];
  clientIds: string[];
  /** Active clients it applies to today. */
  clientCount: number;
  /** Archived: leaves the next competences; recorded history stays. */
  archivedAt: string | null;
  /** Competences with recorded states (deleting is refused while > 0: archive instead). */
  historyCount: number;
  /** Progress in the requested month. */
  month: {
    competence: MonthKey;
    occurs: boolean;
    legalDueDate: ISODate | null;
    targetDate: ISODate | null;
    total: number;
    done: number;
    inProgress: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface RecurringTaskListResponse {
  month: MonthKey;
  items: RecurringTask[];
  summary: {
    active: number;
    archived: number;
    /** Cells of the month (active recurring tasks): "182 de 240 ocorrências concluídas". */
    occurrences: { total: number; done: number };
  };
}

/** Audit column: the occurrence of a recurring task, counted over the clients in view. */
export type AuditColumn = RecurringOccurrence;

export interface AuditClientRow extends OccurrenceClient {
  total: number;
  done: number;
  inProgress: number;
  /** Pending cells whose legal deadline has passed. */
  overduePending: number;
}

/** Whole competence (filters of the request do not change it), like the clients summary. */
export interface AuditSummary {
  competence: MonthKey;
  total: number;
  done: number;
  inProgress: number;
  pending: number;
  overduePending: number;
  /** Clients with at least one overdue pending cell. */
  overdueClients: number;
  clientsWithPending: number;
  clientCount: number;
  byDepartment: {
    department: TaskRef | null;
    total: number;
    done: number;
    overduePending: number;
  }[];
}

/** GET /tasks/audit: the client × recurring task matrix of a competence. Absent cell = "Não se aplica". */
export interface AuditMatrixResponse {
  today: ISODate;
  competence: MonthKey;
  /** Ordered by legal deadline, then name. */
  columns: AuditColumn[];
  /** Active clients in the competence, by name. */
  clients: AuditClientRow[];
  cells: OccurrenceCell[];
  summary: AuditSummary;
}

export interface TaskFlowStep {
  id: string;
  position: number;
  title: string;
  description: string | null;
  client: TaskClientRef | null;
  category: TaskCategoryRef | null;
  assignee: TaskMemberRef | null;
  priority: TaskPriority;
  /** Absolute deadline set when building the flow (null when relative). */
  dueDate: ISODate | null;
  /** Days after the previous step is concluded (step 1: after the flow was created). */
  relativeDays: number | null;
  state: FlowStepState;
  /** The task created when the step was activated. */
  task: { id: string; status: TaskStatus; dueDate: ISODate | null; overdue: boolean } | null;
  activatedAt: string | null;
  /** When its task was first concluded (recorded once: the base of the next step's deadline). */
  completedAt: string | null;
}

export interface TaskFlow {
  id: string;
  title: string;
  client: TaskClientRef | null;
  template: TaskRef | null;
  createdBy: TaskPersonRef | null;
  createdAt: string;
  stepCount: number;
  doneCount: number;
  /** The active step (null when every step is done). */
  currentStep: TaskFlowStep | null;
  /** When the last step was concluded. */
  completedAt: string | null;
  steps: TaskFlowStep[];
}

export interface FlowTemplateStep {
  id: string;
  position: number;
  title: string;
  description: string | null;
  category: TaskCategoryRef | null;
  assignee: TaskMemberRef | null;
  priority: TaskPriority;
  relativeDays: number;
}

export interface FlowTemplate {
  id: string;
  title: string;
  description: string | null;
  steps: FlowTemplateStep[];
  stepCount: number;
  /** Sum of the steps' deadlines ("até 16 dias"). */
  totalDays: number;
  /** Flows created from it ("Aplicado 7 vezes"). */
  usageCount: number;
  createdBy: TaskPersonRef | null;
  createdAt: string;
  updatedAt: string;
}

/** POST /tasks/flows and POST /tasks/flow-templates/:id/apply: the flow and the task of step 1. */
export interface TaskFlowCreatedResponse {
  flow: TaskFlow;
  task: Task;
  /** Set when `saveAsTemplate` was asked. */
  template: FlowTemplate | null;
}

export interface TaskStatusCount {
  count: number;
  overdue: number;
}

/** Numbers of the TasksSummary panel: same filters as the list except the situation. */
export interface TaskListSummary {
  /** Month of the "Concluídas em …" cell (the `month` filter, else the current one). */
  month: MonthKey;
  /** Open overdue items (tasks + recurring occurrences, one per occurrence). */
  overdue: number;
  oldestOverdue: {
    kind: 'task' | 'recurring';
    /** Task id, or the recurring task id (with `competence`). */
    id: string;
    competence: MonthKey | null;
    title: string;
    dueDate: ISODate;
    daysOverdue: number;
    client: TaskClientRef | null;
  } | null;
  open: number;
  dueToday: number;
  dueNext7Days: number;
  waitingClient: number;
  /** Items due in `month` and those of them concluded or canceled ("Concluídas em outubro · de 25 …"). */
  monthDue: number;
  monthDone: number;
  /** Open tasks per assignee (desc), occurrences counted once for their default responsible. */
  openByAssignee: { assignee: TaskMemberRef | null; open: number; overdue: number }[];
  /** Open standalone/flow tasks per client (desc); recurring occurrences are not per client here. */
  openByClient: { client: TaskClientRef | null; open: number; overdue: number }[];
}

/** GET /tasks: a page of tasks plus the recurring occurrences in view (not paginated) and the summary. */
export interface TaskListResponse extends Paginated<Task> {
  today: ISODate;
  occurrences: RecurringOccurrence[];
  summary: TaskListSummary;
  /** Open items per due-date group (with every filter but the group). */
  groups: Record<TaskDueBucket, number>;
  /** Tasks per status with every filter but the situation/status (board column headers). */
  byStatus: Record<TaskStatus, TaskStatusCount>;
  /** Due months with tasks in the scope, plus the current one (the "Mês de vencimento" filter). */
  months: MonthKey[];
}

/** Ranking line per responsible ("quem concentra mais"). Units: tasks and recurring cells. */
export interface TaskAssigneeStats {
  assignee: TaskMemberRef | null;
  total: number;
  /** Open, not overdue. */
  open: number;
  overdue: number;
  dueToday: number;
  doneOnTime: number;
  doneLate: number;
  canceled: number;
}

/**
 * Breakdown row of reports and widgets. done = doneOnTime + doneLate (canceled apart); open excludes
 * overdue, so done + canceled + open + overdue = total.
 */
export interface TaskBreakdownRow {
  /** Id of the department/member/category/client, the priority, or null ("Sem …"). */
  key: string | null;
  label: string;
  total: number;
  done: number;
  doneOnTime: number;
  doneLate: number;
  canceled: number;
  open: number;
  overdue: number;
}

/**
 * GET /tasks/home: the start page. Units are tasks (standalone and flow steps: open ones plus those due
 * or closed in the month) and recurring cells of the competence, of one department (or all).
 */
export interface TaskHomeResponse {
  today: ISODate;
  month: MonthKey;
  /** `department` = one department; `all` = every department (administrators); `mine` = member without department. */
  view: 'department' | 'all' | 'mine';
  department: TaskRef | null;
  totals: {
    total: number;
    byStatus: Record<TaskStatus, number>;
    open: number;
    overdue: number;
    dueToday: number;
    dueNext7Days: number;
    doneOnTime: number;
    doneLate: number;
    canceled: number;
    /** Split by origin. */
    standalone: number;
    recurring: number;
  };
  byAssignee: TaskAssigneeStats[];
  byClient: { client: TaskClientRef | null; total: number; open: number; overdue: number }[];
  /** "Minhas tarefas": open items assigned to you (overdue first, then by due date). */
  mine: {
    open: number;
    overdue: number;
    dueToday: number;
    tasks: Task[];
    occurrences: RecurringOccurrence[];
  };
}

export interface TaskReportRow {
  /** Task id, or `<recurringTaskId>:<clientId>:<competence>` for a recurring cell. */
  id: string;
  kind: 'standalone' | 'flow' | 'recurring';
  taskId: string | null;
  recurringTaskId: string | null;
  competence: MonthKey | null;
  title: string;
  client: TaskClientRef | null;
  department: TaskRef | null;
  category: TaskCategoryRef | null;
  assignee: TaskMemberRef | null;
  /** null for recurring cells. */
  priority: TaskPriority | null;
  dueDate: ISODate | null;
  status: TaskStatus;
  overdue: boolean;
  completedAt: string | null;
  completedBy: TaskPersonRef | null;
  completedOnTime: boolean | null;
}

/**
 * GET /tasks/reports: tasks with due date in the period (without due date: created in it) and the
 * recurring cells whose legal deadline is in it.
 */
export interface TaskReportResponse {
  from: ISODate;
  to: ISODate;
  today: ISODate;
  summary: {
    total: number;
    done: number;
    doneOnTime: number;
    doneLate: number;
    canceled: number;
    open: number;
    overdue: number;
  };
  byStatus: Record<TaskStatus, number>;
  byPriority: TaskBreakdownRow[];
  byDepartment: TaskBreakdownRow[];
  byAssignee: TaskBreakdownRow[];
  byCategory: TaskBreakdownRow[];
  byClient: TaskBreakdownRow[];
  items: Paginated<TaskReportRow>;
}

/** GET /tasks/dashboard: data of the task widgets (§14 of docs/tarefas-ui.md). */
export interface TasksDashboardResponse {
  today: ISODate;
  month: MonthKey;
  /** The member's department (subtitle of "Clientes com mais pendências"). */
  department: TaskRef | null;
  mine: { overdue: number; dueToday: number; tasks: Task[]; occurrences: RecurringOccurrence[] };
  overdue: {
    count: number;
    oldestDaysOverdue: number | null;
    tasks: Task[];
    occurrences: RecurringOccurrence[];
  };
  /** Tasks due in the month and recurring cells of the competence. */
  situation: { total: number; done: number; canceled: number; open: number; overdue: number };
  /** Next 14 days from today: open tasks and pending recurring cells due each day. */
  byDay: { date: ISODate; tasks: number; occurrences: number; total: number }[];
  /** Recurring cells of the competence per department. */
  departments: TaskBreakdownRow[];
  /** From the 1st of the month to today + 14: tasks (appointments first within a day) and occurrences. */
  agenda: { tasks: Task[]; occurrences: RecurringOccurrence[] };
  /** Clients with most open items in the member's department (all departments without one). */
  clientsWithPending: { client: TaskClientRef; open: number; overdue: number }[];
}

/** GET /tasks/activity: recent comments by others on tasks assigned to or created by you. */
export interface TaskActivityItem {
  id: string;
  taskId: string;
  taskTitle: string;
  author: TaskPersonRef | null;
  text: string;
  createdAt: string;
}

export interface TaskNote {
  id: string;
  title: string;
  content: string | null;
  createdAt: string;
  updatedAt: string;
}
