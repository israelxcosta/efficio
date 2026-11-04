// API response types. Amounts are integer cents; dates are 'YYYY-MM-DD'; timestamps ISO 8601.

import type {
  AccountType,
  BankCode,
  CardBrand,
  CategoryType,
  ClientCompletenessField,
  ClientCredentialField,
  ClientOverviewStatus,
  DashboardDocumentSituation,
  ClientDocumentKind,
  ClientStatus,
  DeadlineBucket,
  PixKeyType,
  UnionSituation,
  ContactKind,
  DelinquencyRisk,
  FeeEntryKind,
  GenerateFeesSkipReason,
  Frequency,
  IconName,
  InactivationReason,
  InvoiceStatus,
  LateFeeKind,
  AssigneeSource,
  FlowStepState,
  NonBusinessDayRule,
  OccurrenceSituation,
  OccurrenceStatus,
  OpenTaskStatus,
  PaymentMethod,
  RecurrenceKind,
  RecurrencePeriod,
  SimplesAnnex,
  TaskAttachmentType,
  TaskDueBucket,
  TaskEventKind,
  TaskKind,
  TaskPriority,
  TaskStatus,
  TaxRegime,
  TransactionType,
  TransferKind,
} from './constants';
import type { TransactionOrigin } from './integrations';
import type { RegimeGroupApplyResult, RegimeGroupRegime, SuggestedDepartment } from './regime-groups';
import type { PermissionMap, PermissionOverrides } from './permissions';
import type { MemberRole } from './saas';
import type { ContractBlock } from './utils/contract';
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
  // Phase 3 (spec §13.8): fiscal data, accesses, documents and unions.
  /** Inscrição estadual (null when exempt or not informed). */
  stateRegistration: string | null;
  /** "Isenta de inscrição estadual". */
  stateRegistrationExempt: boolean;
  /** Inscrição municipal. */
  municipalRegistration: string | null;
  /** CPF of the responsible person (digits). `null` for members without access to the finances. */
  responsibleDocument: string | null;
  /** Whether each encrypted access is stored: the values never leave the server here (reveal one by one). */
  credentials: ClientCredentialFlags;
  /** Documents with expiry date (every member reads them), most urgent first. */
  documents: ClientDocument[];
  /** Unions linked to the client, with the agreement being tracked. */
  unions: ClientUnionRef[];
  createdAt: string;
}

export type ClientCredentialFlags = Record<ClientCredentialField, boolean>;

/** Expiry of a document or agreement, computed by the API in the office time zone. */
export interface DeadlineInfo {
  bucket: DeadlineBucket;
  /** Days from today (negative = overdue, 0 = today); null without date. */
  days: number | null;
}

/** A document of a client (certificate, certificate of debt, license, report). */
export interface ClientDocument {
  id: string;
  kind: ClientDocumentKind;
  /** The catalog label, or the name typed for "Outro…". */
  name: string;
  /** Only for `other`. */
  customName: string | null;
  expiresAt: ISODate | null;
  /** Up to 200 characters ("A1, emitido pela Certisign"). */
  note: string | null;
  deadline: DeadlineInfo;
  /** Who changed it last (the name recorded at the time). */
  updatedBy: TaskPersonRef | null;
  updatedAt: string;
}

/** The collective agreement cycle a union is tracked by (null without base month). */
export interface UnionTrackedCycle {
  /** 2026 = "Convenção Coletiva 2026/2027". */
  year: number;
  /** "2026/2027". */
  label: string;
  /** Day 1 of the base month in the tracked year. */
  dueDate: ISODate;
  bucket: Exclude<DeadlineBucket, 'noDate'>;
  days: number;
}

/** A union linked to a client (the client's sheet). */
export interface ClientUnionRef {
  id: string;
  /** Acronym, else the legal name. */
  name: string;
  category: string | null;
  active: boolean;
  tracked: UnionTrackedCycle | null;
}

/** POST /clients/:id/credentials/reveal (never cached; the reveal is audited without the value). */
export interface ClientCredentialReveal {
  field: ClientCredentialField;
  value: string;
}

/** GET /clients/:id/credentials/views: who saw which access and when (never the value). */
export interface ClientCredentialView {
  field: ClientCredentialField;
  userName: string | null;
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
  /** Tasks (standalone and process steps) by title, for every member. */
  tasks: SearchTaskHit[];
  /** Recurring tasks by name. */
  recurringTasks: { id: string; name: string; period: RecurrencePeriod }[];
  /** Unions by name, acronym or category (every member; phase 3). */
  unions: { id: string; name: string; acronym: string | null; category: string | null; active: boolean }[];
}

export interface SearchTaskHit {
  id: string;
  title: string;
  kind: TaskKind;
  status: TaskStatus;
  dueDate: ISODate | null;
  overdue: boolean;
  client: TaskClientRef | null;
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
  /** Adjustments of the person over the role's defaults (phase 3; `{}` without adjustments). */
  permissionOverrides: PermissionOverrides;
  /** When the profile photo was last changed (null without photo): `GET /profile/photos/:userId?v=`. */
  photoUpdatedAt: string | null;
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
    /** Effective permissions (phase 3, spec §13.10): role defaults plus the person's adjustments. */
    permissions: PermissionMap;
  };
  members: TaskMember[];
  departments: TaskRef[];
  categories: TaskCategory[];
  /** Active and inactive clients (pickers usually show only the active ones). */
  clients: TaskClientOption[];
}

export interface TaskFlowRef {
  id: string;
  title: string;
  /** 1-based position of this task's step ("Etapa 2/4"). */
  position: number;
  stepCount: number;
}

/** What makes a task a recurring occurrence (one client × one period of a recurring task). */
export interface TaskOccurrenceRef {
  recurringTaskId: string;
  period: RecurrencePeriod;
  /** The competence, or the Monday of the week of a weekly occurrence. */
  periodKey: string;
  /** Month the legal deadline falls in (the audit column). */
  competence: MonthKey;
  /** Month the obligation refers to ("ref. 09/2026"). */
  referenceMonth: MonthKey;
  /** Internal target; the legal deadline is `Task.dueDate`. */
  targetDate: ISODate;
  /** Open, target passed, legal deadline today or later ("Fora da meta"). */
  targetMissed: boolean;
  /** Where the responsible comes from (null without one). */
  assigneeSource: AssigneeSource | null;
  situation: OccurrenceSituation;
}

/** A task as listed (row, card, widgets). */
export interface Task {
  id: string;
  title: string;
  /** standalone, recurring (occurrence) or flow (process step). */
  kind: TaskKind;
  status: TaskStatus;
  /** Status to go back to when reopening a concluded/canceled task (the one before concluding, else `todo`). */
  reopenStatus: OpenTaskStatus;
  priority: TaskPriority;
  /** null = internal ("Interna"). */
  client: TaskClientRef | null;
  /** The assignee's department (or the queue chosen for an unassigned task); for occurrences, the recurring task's. */
  department: TaskRef | null;
  category: TaskCategoryRef | null;
  assignee: TaskMemberRef | null;
  startDate: ISODate | null;
  /** Due date; the legal deadline for occurrences. */
  dueDate: ISODate | null;
  /** Appointment on the due date ("HH:MM"). */
  startTime: string | null;
  endTime: string | null;
  /** Open with a due date (legal deadline) before today. */
  overdue: boolean;
  /** Days past the due date (0 when not overdue). */
  daysOverdue: number;
  /** When it was concluded (set by the server; cleared when reopened). */
  completedAt: string | null;
  /** Who concluded it (may differ from the assignee). */
  completedBy: TaskPersonRef | null;
  subtaskCount: { done: number; total: number };
  commentCount: number;
  attachmentCount: number;
  /** Set when the task is the step of a process. */
  flow: TaskFlowRef | null;
  /** Set when the task is a recurring occurrence. */
  occurrence: TaskOccurrenceRef | null;
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
  /** The author or an administrator may remove it. */
  canDelete: boolean;
  createdAt: string;
}

export interface TaskAttachment {
  id: string;
  /** Sanitized name (decrypted). */
  fileName: string;
  contentType: TaskAttachmentType;
  sizeBytes: number;
  uploadedBy: TaskPersonRef | null;
  /** The uploader or an administrator may remove it. */
  canDelete: boolean;
  createdAt: string;
}

/** Fields an occurrence does not take in `PATCH /tasks/:id` (they come from the recurring task). */
export type TaskLockedField = 'title' | 'clientId' | 'categoryId' | 'departmentId' | 'startDate' | 'dueDate' | 'startTime' | 'endTime';

/** GET /tasks/:id (and the result of every task write). */
export interface TaskDetail extends Task {
  description: string | null;
  subtasks: TaskSubtask[];
  comments: TaskComment[];
  attachments: TaskAttachment[];
  /** The whole process when the task is one of its steps (FlowStepper). */
  flowProgress: TaskFlow | null;
  /** Fields locked for this task (occurrences); empty for the others. */
  lockedFields: TaskLockedField[];
  /** May the requester reopen it? (A concluded occurrence: who concluded it or an administrator.) */
  canReopen: boolean;
}

/** PATCH /tasks/:id/status: the task and, when it concluded a process step, the task of the next step. */
export interface TaskStatusChangeResponse {
  task: TaskDetail;
  activated: Task | null;
}

/**
 * A field changed by an `updated` entry, with the values before and after: dates `YYYY-MM-DD`, times
 * `HH:MM`, the priority code, the title, and the client/category by name (as they were then). The
 * description never carries values (it is encrypted): it only appears in `fields`.
 */
export interface TaskFieldChange {
  field: 'title' | 'clientId' | 'categoryId' | 'priority' | 'startDate' | 'dueDate' | 'startTime' | 'endTime';
  from: string | null;
  to: string | null;
}

/** One entry of a task's history ("linha do tempo"). */
export interface TaskHistoryItem {
  id: string;
  kind: TaskEventKind;
  /** Who did it (null = the system: a generated occurrence, an automatic reassignment). */
  actor: TaskPersonRef | null;
  createdAt: string;
  /** `updated`: names of the fields changed (TaskUpdateInput keys), the description included. */
  fields: string[];
  /** `updated`: before/after of the fields that have displayable values (not the description). */
  changes: TaskFieldChange[];
  /** `status` / `reopened`. */
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  /** `assigned` (names as recorded then). */
  fromAssignee: TaskPersonRef | null;
  toAssignee: TaskPersonRef | null;
  /** `reopened`: the reason; `attachment_*`: the file name; automatic changes: why. Decrypted. */
  note: string | null;
  /** `created`: where it came from, and the name of the recurring task or the process (as it was then). */
  origin: 'manual' | 'recurring' | 'flow' | null;
  originName: string | null;
  /**
   * `flow_step`: the process step that changed — it began (`activated`), was concluded (`completed`),
   * or went back to waiting because the previous step was reopened (`deactivated`, on that step's task).
   */
  flow: { id: string; title: string; position: number; event: 'activated' | 'completed' | 'deactivated' } | null;
}

/** GET /tasks/:id/history: newest first, up to 500. */
export interface TaskHistoryResponse {
  items: TaskHistoryItem[];
  total: number;
}

/** Responsible of the occurrences in a group, with how many each one has. */
export interface OccurrenceAssigneeCount {
  assignee: TaskMemberRef | null;
  count: number;
}

/**
 * A recurring task in one period, aggregated over the client occurrences in view (the list row
 * "DCTFWeb · 12 de 30 clientes pendentes", the board card, the calendar item, the audit column and
 * the home's obligations). Counts follow the request's scope and filters (e.g. "Minhas" counts only
 * the occurrences whose responsible is you). done + canceled + pending = total.
 */
export interface RecurringOccurrence {
  recurringTaskId: string;
  name: string;
  period: RecurrencePeriod;
  periodKey: string;
  competence: MonthKey;
  referenceMonth: MonthKey;
  legalDueDate: ISODate;
  /** Internal target (on or before the legal deadline): the work date. */
  targetDate: ISODate;
  department: TaskRef | null;
  category: TaskCategoryRef | null;
  /** Default responsible of the recurring task. */
  defaultAssignee: TaskMemberRef | null;
  /** Effective responsibles in the group (desc). */
  assignees: OccurrenceAssigneeCount[];
  total: number;
  done: number;
  /** Concluded after the legal deadline (part of `done`). */
  doneLate: number;
  canceled: number;
  inProgress: number;
  /** Open (todo, in progress, waiting for the client). */
  pending: number;
  /** Legal deadline before today with pending occurrences. */
  overdue: boolean;
  daysOverdue: number;
  /** Target before today, legal deadline today or later, with pending occurrences. */
  targetMissed: boolean;
  /** Derived: none done → todo; some → in_progress; all (but the canceled) → done. */
  status: OccurrenceStatus;
}

/** One cell: an occurrence (client × recurring task × period). */
export interface OccurrenceCell {
  taskId: string;
  recurringTaskId: string;
  clientId: string;
  periodKey: string;
  competence: MonthKey;
  status: TaskStatus;
  situation: OccurrenceSituation;
  assignee: TaskMemberRef | null;
  assigneeSource: AssigneeSource | null;
  legalDueDate: ISODate;
  targetDate: ISODate;
  overdue: boolean;
  targetMissed: boolean;
  /** Conclusion record (server-side; erased when reopened). */
  concludedBy: TaskPersonRef | null;
  concludedAt: string | null;
  /** Concluded on or before the legal deadline (office time zone); null while not concluded. */
  concludedOnTime: boolean | null;
  /** May the requester reopen it (who concluded it or an administrator)? */
  canReopen: boolean;
}

export interface OccurrenceClient {
  id: string;
  /** Trade name, else the legal name. */
  name: string;
  legalName: string;
  /** CNPJ, digits only (decrypted). */
  document: string;
  taxRegime: TaxRegime;
}

/** GET /tasks/recurring/:id/occurrences/:period (RecurringOccurrenceSheet). */
export interface RecurringOccurrenceDetail extends RecurringOccurrence {
  description: string | null;
  cells: (OccurrenceCell & { client: OccurrenceClient })[];
}

export interface RecurringTask {
  id: string;
  name: string;
  description: string | null;
  period: RecurrencePeriod;
  /** Day of the month (1–31) or, weekly, the ISO weekday (1 = Monday). */
  dueDay: number;
  /** Anchor month of bimonthly…annual tasks. */
  dueMonth: number | null;
  /** Months (1–12) it occurs in (all 12 for weekly and monthly). */
  months: number[];
  targetDaysBefore: number;
  nonBusinessDayRule: NonBusinessDayRule;
  /** Reference month = competence − this many months. */
  referenceOffset: number;
  department: TaskRef | null;
  category: TaskCategoryRef | null;
  /** Default responsible. */
  assignee: TaskMemberRef | null;
  regimes: TaxRegime[];
  clientIds: string[];
  excludedClientIds: string[];
  startCompetence: MonthKey;
  endCompetence: MonthKey | null;
  /** Not ended before the current competence. */
  active: boolean;
  /** Active clients it applies to in the current competence. */
  clientCount: number;
  /** Who receives the occurrences of the current competence: "Ana 12 (padrão) · Bruno 1 (à mão) · sem responsável 2". */
  distribution: { assignee: TaskMemberRef | null; source: AssigneeSource | null; count: number }[];
  /** Occurrences already generated (any competence). */
  occurrenceCount: number;
  /** Progress in the requested month. */
  month: {
    competence: MonthKey;
    occurs: boolean;
    legalDueDate: ISODate | null;
    targetDate: ISODate | null;
    total: number;
    done: number;
    canceled: number;
    inProgress: number;
    overdue: number;
  };
  createdBy: TaskPersonRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringTaskListResponse {
  month: MonthKey;
  items: RecurringTask[];
  summary: {
    active: number;
    ended: number;
    /** Occurrences of the month (active recurring tasks): "182 de 240 concluídas". */
    occurrences: { total: number; done: number; canceled: number };
  };
}

/** POST /tasks/recurring/generate. */
export interface RecurringGenerateResponse {
  competence: MonthKey;
  created: number;
}

/** A recurring task of the office as the regime groups show it. */
export interface RegimeGroupRecurringRef {
  id: string;
  name: string;
  period: RecurrencePeriod;
  department: TaskRef | null;
  /** Not ended before the current competence. */
  active: boolean;
  regimes: TaxRegime[];
  /** The catalog item it came from (null: made by hand). */
  catalogKey: string | null;
}

/** One item of a regime's group, with what the office already has. */
export interface RegimeGroupItemView {
  key: string;
  name: string;
  description: string;
  period: RecurrencePeriod;
  dueDay: number;
  dueMonth: number | null;
  /** Months (1–12) it occurs in. */
  months: number[];
  targetDaysBefore: number;
  nonBusinessDayRule: NonBusinessDayRule;
  referenceOffset: number;
  /** Suggested department and the office's department it would go to (null: created when applying). */
  department: { key: SuggestedDepartment; name: string; match: TaskRef | null };
  /** The recurring task created from this item (any regime), if any. */
  recurringTask: RegimeGroupRecurringRef | null;
  /** The recurring task exists, is active and includes this regime. */
  applied: boolean;
}

export interface RegimeGroup {
  regime: RegimeGroupRegime;
  label: string;
  /** Active clients of the regime in the current competence (they get the occurrences). */
  clientCount: number;
  items: RegimeGroupItemView[];
  /** Items not applied yet. */
  missing: number;
  /** Every recurring task of the office that applies to the regime (catalog or made by hand). */
  recurring: RegimeGroupRecurringRef[];
}

/** GET /tasks/regime-groups. */
export interface RegimeGroupsResponse {
  today: ISODate;
  /** The office uses departments (applying maps or creates them; otherwise none is set). */
  usesDepartments: boolean;
  groups: RegimeGroup[];
}

/** POST /tasks/regime-groups/:regime/apply. Applying again changes nothing (`unchanged`). */
export interface RegimeGroupApplyResponse {
  regime: RegimeGroupRegime;
  created: number;
  /** Existing recurring tasks of the catalog that now include the regime. */
  regimeAdded: number;
  unchanged: number;
  /** Existing but ended (not reopened: edit "Encerra em" to bring it back). */
  ended: number;
  items: { key: string; recurringTaskId: string; name: string; result: RegimeGroupApplyResult }[];
  /** Departments created for the suggested ones that had no match. */
  departmentsCreated: TaskRef[];
}

/** Audit column: the occurrence of a recurring task in a period, counted over the clients in view. */
export type AuditColumn = RecurringOccurrence;

export interface AuditClientRow extends OccurrenceClient {
  total: number;
  done: number;
  canceled: number;
  inProgress: number;
  /** Pending cells whose legal deadline has passed. */
  overduePending: number;
  /** Pending cells past the target, legal deadline still ahead. */
  targetMissedPending: number;
  /** The client's month is concluded: every cell (but the canceled) done — when the last one was. */
  monthConcludedAt: string | null;
}

/** Whole competence (filters of the request do not change it), like the clients summary. */
export interface AuditSummary {
  competence: MonthKey;
  total: number;
  done: number;
  doneLate: number;
  canceled: number;
  inProgress: number;
  pending: number;
  overduePending: number;
  targetMissedPending: number;
  /** Clients with at least one overdue pending cell. */
  overdueClients: number;
  clientsWithPending: number;
  clientCount: number;
  /** Clients whose month is concluded. */
  clientsConcluded: number;
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
  /** One per recurring task and period (weekly tasks: one per week), by target, then name. */
  columns: AuditColumn[];
  /** Clients with occurrences in the competence (after the filters), by name. */
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
  department: TaskRef | null;
  category: TaskCategoryRef | null;
  assignee: TaskMemberRef | null;
  priority: TaskPriority;
  /** Absolute deadline (built by hand) or, once activated, the computed one. */
  dueDate: ISODate | null;
  /** Days after the previous step is concluded (step 1: after the process was created). */
  relativeDays: number | null;
  state: FlowStepState;
  /** The task created when the step was activated (null before, or if it was deleted). */
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
  department: TaskRef | null;
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
  /** Departments of the steps ("Societário e Fiscal"). */
  departments: TaskRef[];
  /** Processes created from it ("Aplicado 7 vezes"). */
  usageCount: number;
  createdBy: TaskPersonRef | null;
  createdAt: string;
  updatedAt: string;
}

/** POST /tasks/flows and POST /tasks/flow-templates/:id/apply: the process and the task of step 1. */
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

/** The oldest overdue item (task or occurrence), for the "A mais antiga venceu há N dias" line. */
export interface TaskOverdueRef {
  kind: TaskKind;
  /** Task id (an occurrence is a task too). */
  id: string;
  recurringTaskId: string | null;
  periodKey: string | null;
  title: string;
  dueDate: ISODate;
  daysOverdue: number;
  client: TaskClientRef | null;
  assignee: TaskMemberRef | null;
}

/** Numbers of the TasksSummary panel: same filters as the list except the situation. */
export interface TaskListSummary {
  /** Month of the "Concluídas em …" cell (the `month` filter, else the current one). */
  month: MonthKey;
  /** Open overdue items (tasks + occurrences, one per client). */
  overdue: number;
  oldestOverdue: TaskOverdueRef | null;
  /** Open occurrences past the target with the legal deadline ahead. */
  targetMissed: number;
  open: number;
  /** Tasks due today and occurrences with target today. */
  dueToday: number;
  dueNext7Days: number;
  waitingClient: number;
  /** Items due in `month` and those of them concluded or canceled ("Concluídas em outubro · de 25 …"). */
  monthDue: number;
  monthDone: number;
  /** Open items per assignee (desc). */
  openByAssignee: { assignee: TaskMemberRef | null; open: number; overdue: number }[];
  /** Open items per client (desc). */
  openByClient: { client: TaskClientRef | null; open: number; overdue: number }[];
}

/** GET /tasks: a page of tasks plus the recurring occurrences in view (aggregated, not paginated) and the summary. */
export interface TaskListResponse extends Paginated<Task> {
  today: ISODate;
  /** Up to 200 groups; without a date filter, the open ones and those of the current competence ±. */
  occurrences: RecurringOccurrence[];
  summary: TaskListSummary;
  /** Open items per due-date group (with every filter but the group). */
  groups: Record<TaskDueBucket, number>;
  /** Items per status with every filter but the situation/status (board column headers). */
  byStatus: Record<TaskStatus, TaskStatusCount>;
  /** Due months with tasks in the scope, plus the current one (the "Mês de vencimento" filter). */
  months: MonthKey[];
}

/** Ranking line per responsible ("quem concentra mais"). Units: tasks and occurrences (one per client). */
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
  /** Id of the department/member/category/client, the priority, the month, or null ("Sem …"). */
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

/** The home's "Obrigações da competência" block. */
export interface TaskObligations {
  competence: MonthKey;
  /** Occurrences of the competence in the department (one per client). */
  total: number;
  done: number;
  canceled: number;
  pending: number;
  /** Pending occurrences past the legal deadline. */
  overdue: number;
  /** Per recurring task and period: overdue pending first, then by target; complete ones last. */
  items: RecurringOccurrence[];
}

/**
 * GET /tasks/home: the start page. Units are tasks (open ones plus those due or closed in the month)
 * and occurrences (one per client, same rule), of one department (or all).
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
    /** Open occurrences past the target, legal deadline ahead. */
    targetMissed: number;
    /** The nearest legal deadline among them ("prazo legal em até 3 dias"). */
    targetMissedNextLegalDate: ISODate | null;
    /** Tasks due today and occurrences with target today. */
    dueToday: number;
    /** Of them, appointments (tasks with a time). */
    appointmentsToday: number;
    dueNext7Days: number;
    waitingClient: number;
    doneOnTime: number;
    doneLate: number;
    canceled: number;
    /** Split by origin. */
    standalone: number;
    recurring: number;
  };
  oldestOverdue: TaskOverdueRef | null;
  byAssignee: TaskAssigneeStats[];
  byClient: { client: TaskClientRef | null; total: number; open: number; overdue: number }[];
  /** "Minhas tarefas": open items assigned to you, any department (overdue first, then by work date). */
  mine: {
    open: number;
    overdue: number;
    dueToday: number;
    tasks: Task[];
    /** Your occurrences, aggregated per recurring task and period ("8 de 12 dos seus clientes"). */
    occurrences: RecurringOccurrence[];
  };
  obligations: TaskObligations;
}

// --- GET /tasks/dashboard (Effy's dashboard cards) ------------------------------------------------

export interface DashboardDocumentItem {
  id: string;
  client: TaskClientRef;
  kind: ClientDocumentKind;
  /** Kind label, or the custom name of an "Outro…" document. */
  name: string;
  expiresAt: ISODate | null;
  situation: DashboardDocumentSituation;
  /** Days to the expiry (negative when overdue); null without a date. */
  days: number | null;
}

/** Certificates or the other documents ("laudos") of the active clients. */
export interface DashboardDocuments {
  counts: Record<DashboardDocumentSituation, number>;
  total: number;
  /** Every item (by expiry, without date last), up to 500: the lists by situation filter it. */
  items: DashboardDocumentItem[];
  truncated: boolean;
}

export interface DashboardFeeItem {
  client: TaskClientRef;
  taxRegime: TaxRegime;
  /** Last day of the latest registered fee period ("vigência"). */
  periodEnd: ISODate;
  /** Days to it (negative: already ended without a new period). */
  days: number;
  /** Monthly fee of that period (cents). */
  monthlyAmount: number;
}

export interface DashboardClientOverviewItem {
  client: { id: string; name: string; legalName: string; taxRegime: TaxRegime };
  status: ClientOverviewStatus;
  /** Open occurrences of the competence / of them, past the legal deadline. */
  pending: number;
  overdue: number;
}

export interface DashboardIncompleteItem {
  client: { id: string; name: string; legalName: string; taxRegime: TaxRegime };
  /** Fields that apply to the regime and are blank (`CLIENT_COMPLETENESS_FIELDS` order). */
  missing: ClientCompletenessField[];
  filled: number;
  total: number;
  /** filled / total, 0–100. */
  percent: number;
}

export interface TaskDashboardResponse {
  today: ISODate;
  /** Competence of the task cards (default: the current one). */
  month: MonthKey;
  /** Same as the start page: one department, all (`registry`) or, without department, your own items. */
  view: 'department' | 'all' | 'mine';
  department: TaskRef | null;
  /** "Situação das tarefas": occurrences of the competence + standalone tasks due in the month. */
  taskStatus: { total: number; pending: number; concluded: number; overdue: number };
  /** "Fluxo de tarefas por dia": open items per work date, today and the next 6 days. */
  flow: { date: ISODate; recurring: number; standalone: number }[];
  /** "Processos por departamento": occurrences of the competence per department. */
  processes: { department: TaskRef | null; recurringCount: number; total: number; done: number; pending: number; overdue: number }[];
  /** "Pendências fiscais": per recurring task and period of the competence (overdue first). */
  fiscal: { totals: { total: number; done: number; pending: number; overdue: number }; items: RecurringOccurrence[] };
  /** "Agenda": legal deadlines in the next 7 days (this and the next competence) and, past this month, with pending work. */
  agenda: { upcoming: RecurringOccurrence[]; overdue: RecurringOccurrence[] };
  /** "Visão geral dos clientes": active clients of the competence by the state of their occurrences. */
  clientsOverview: { counts: Record<ClientOverviewStatus, number>; items: DashboardClientOverviewItem[] };
  certificates: DashboardDocuments;
  /** Every other document ("Laudos"). */
  documents: DashboardDocuments;
  /** "Convenções coletivas" (same rule as /deadlines). */
  conventions: {
    counts: DeadlineCounts;
    /** Active unions with active clients and no base month. */
    noBaseMonth: number;
    /** Active unions. */
    total: number;
    items: ConventionDeadline[];
  };
  /** "Honorários próximos de vencer" (null without `finance`). within30 includes ended periods. */
  fees: { within30: DashboardFeeItem[]; within60: DashboardFeeItem[] } | null;
  /** "Cadastro incompleto" (null without `registry`). */
  incomplete: { count: number; averagePercent: number; items: DashboardIncompleteItem[] } | null;
}

/** GET /tasks/calendar: items by work date in a range (tasks by due date, occurrences by target). */
export interface TaskCalendarResponse {
  from: ISODate;
  to: ISODate;
  today: ISODate;
  /** Standalone tasks and process steps due in the range: appointments first within a day. */
  tasks: Task[];
  /** One item per recurring task and period, on its target ("DCTFWeb · 12/30"). */
  occurrences: RecurringOccurrence[];
  /** Open tasks without a due date in the scope ("3 sem vencimento"). */
  noDueDate: number;
  /** More than the ceiling of tasks in the range (only the first ones came). */
  truncated: boolean;
}

export interface TaskReportRow {
  /** Task id (an occurrence is a task too). */
  id: string;
  kind: TaskKind;
  recurringTaskId: string | null;
  competence: MonthKey | null;
  referenceMonth: MonthKey | null;
  title: string;
  client: TaskClientRef | null;
  department: TaskRef | null;
  category: TaskCategoryRef | null;
  assignee: TaskMemberRef | null;
  priority: TaskPriority;
  /** Due date; the legal deadline for occurrences. */
  dueDate: ISODate | null;
  /** Occurrences only. */
  targetDate: ISODate | null;
  status: TaskStatus;
  overdue: boolean;
  targetMissed: boolean;
  completedAt: string | null;
  completedBy: TaskPersonRef | null;
  completedOnTime: boolean | null;
}

/** Productivity of a member in the period: what they concluded (by the day of the conclusion). */
export interface TaskProductivityRow {
  member: TaskPersonRef | null;
  concluded: number;
  onTime: number;
  late: number;
  /** Average calendar days from creation to conclusion. */
  averageDays: number | null;
}

/**
 * GET /tasks/reports: tasks (every kind; an occurrence per client) with due date in the period
 * (without due date: created in it), with the filters. Everything aggregated in SQL.
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
    targetMissed: number;
  };
  byStatus: Record<TaskStatus, number>;
  byPriority: TaskBreakdownRow[];
  byDepartment: TaskBreakdownRow[];
  byAssignee: TaskBreakdownRow[];
  byCategory: TaskBreakdownRow[];
  byClient: TaskBreakdownRow[];
  byKind: TaskBreakdownRow[];
  /** Per due month (key `YYYY-MM`). */
  byMonth: TaskBreakdownRow[];
  /** Conclusions in the period per member (who concluded). */
  productivity: TaskProductivityRow[];
  items: Paginated<TaskReportRow>;
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

/** Personal note: only its author reads it (not even an administrator). */
export interface TaskNote {
  id: string;
  title: string;
  content: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Phase 3: unions (sindicatos), deadlines, office and the client's contract
// ---------------------------------------------------------------------------

/** A collective agreement cycle as stored ("Convenção Coletiva 2026/2027"). */
export interface UnionConvention {
  year: number;
  label: string;
  published: boolean;
  /** When it was marked as published (set by the server). */
  publishedAt: string | null;
  publishedBy: TaskPersonRef | null;
  note: string | null;
}

/** A union as listed (urgency first): the registry, the tracked cycle and the linked clients count. */
export interface UnionListItem {
  id: string;
  /** Razão social. */
  name: string;
  document: string;
  acronym: string | null;
  category: string | null;
  territory: string | null;
  /** 1–12; null = no base month (out of the alerts). */
  baseMonth: number | null;
  active: boolean;
  tracked: UnionTrackedCycle | null;
  situation: UnionSituation;
  /** Linked clients (all) and the active ones (the "afeta N clientes" counts these). */
  clientCount: number;
  activeClientCount: number;
}

/** GET /unions/:id (and the result of every write). */
export interface UnionDetail extends UnionListItem {
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  responsibleName: string | null;
  responsibleRole: string | null;
  responsibleEmail: string | null;
  responsiblePhone: string | null;
  notes: string | null;
  /** Stored cycles, oldest first (the tracked one may not be stored yet). */
  conventions: UnionConvention[];
  /** Linked clients, by display name. */
  clients: (TaskClientRef & { legalName: string; taxRegime: TaxRegime; status: ClientStatus })[];
  createdAt: string;
  updatedAt: string;
}

export interface UnionListSummary {
  active: number;
  inactive: number;
  /** Active unions per situation of the tracked agreement. */
  overdue: number;
  within30: number;
  within60: number;
  ok: number;
  noBaseMonth: number;
  /** Active clients linked to an active union whose agreement is overdue ("afeta 9 clientes"). */
  overdueClients: number;
}

/** GET /unions: page of the urgency order (filters applied) + summary of the whole workspace. */
export interface UnionListResponse extends Paginated<UnionListItem> {
  today: ISODate;
  summary: UnionListSummary;
}

export interface DeadlineCounts {
  overdue: number;
  within30: number;
  within60: number;
}

/** A document in the deadlines sheet (active clients only). */
export interface DocumentDeadline {
  id: string;
  client: TaskClientRef;
  kind: ClientDocumentKind;
  name: string;
  note: string | null;
  expiresAt: ISODate | null;
  deadline: DeadlineInfo;
}

/** A collective agreement in the alerts (active unions with active linked clients). */
export interface ConventionDeadline {
  unionId: string;
  /** Acronym, else the legal name. */
  name: string;
  legalName: string;
  category: string | null;
  cycle: UnionTrackedCycle;
  /** Active linked clients. */
  clientCount: number;
}

/** GET /deadlines (spec §6.10): what expired or expires in up to 60 days, for every member. */
export interface DeadlinesResponse {
  today: ISODate;
  documents: {
    counts: DeadlineCounts & { noDate: number };
    /** Overdue (oldest first), then up to 60 days, then without date; capped (`truncated`). */
    items: DocumentDeadline[];
    truncated: boolean;
    /** Whether the office has any document registered ("Nenhum documento cadastrado"). */
    hasAny: boolean;
  };
  conventions: {
    counts: DeadlineCounts;
    /** Overdue, then up to 60 days. */
    items: ConventionDeadline[];
    /** Whether the office has any union registered ("Nenhum sindicato cadastrado"). */
    hasUnions: boolean;
  };
}

/**
 * GET /deadlines/summary: the counts of the strip of the home page and of the bell. The bell adds
 * `overdueTotal` (documents + agreements already overdue) to what it already shows.
 */
export interface DeadlinesSummary {
  today: ISODate;
  documents: DeadlineCounts;
  conventions: DeadlineCounts;
  overdueTotal: number;
  /** The single overdue agreement by name ("convenção do SINDCOM vencida há 12 dias"); null otherwise. */
  overdueConvention: { unionId: string; name: string; days: number } | null;
}

/** Documents of one client in the Gestão client list (filter and the most urgent in the subtitle). */
export interface ClientDocumentAlert {
  clientId: string;
  overdue: number;
  within30: number;
  within60: number;
  total: number;
  /** The most urgent dated document. */
  mostUrgent: { documentId: string; kind: ClientDocumentKind; name: string; expiresAt: ISODate; deadline: DeadlineInfo } | null;
}

/** GET /deadlines/clients: per active client with documents, and the "Documentos" cell of the summary. */
export interface ClientDocumentAlertsResponse {
  today: ISODate;
  items: ClientDocumentAlert[];
  totals: DeadlineCounts & { clientsOverdue: number; clientsWithin30: number };
}

/** Name and logo of the office: every member reads them (header of the PDFs). */
export interface OfficeBranding {
  /** Trade name, else the legal name; null before the office is registered. */
  name: string | null;
  legalName: string | null;
  /** `data:image/...;base64,…` or null. */
  logo: string | null;
  /**
   * Whether the office registry is filled in (legal name and CNPJ): what the home page needs to know,
   * without reading `GET /office` (decrypted CPF and Pix key, `office` permission).
   */
  registered: boolean;
}

export interface OfficeContractSummary {
  source: 'factory' | 'custom';
  /** Version of the factory template the API ships. */
  factoryVersion: string;
  updatedAt: string | null;
  updatedBy: TaskPersonRef | null;
  watermark: { enabled: boolean; source: 'factory' | 'custom' };
}

/** GET /office (permission `office`): the whole registry, decrypted. */
export interface Office {
  /** False before the first save (every field null). */
  registered: boolean;
  document: string | null;
  legalName: string | null;
  tradeName: string | null;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  responsibleName: string | null;
  responsibleDocument: string | null;
  responsibleEmail: string | null;
  responsiblePhone: string | null;
  pixKeyType: PixKeyType | null;
  pixKey: string | null;
  logo: string | null;
  /** Office fields the contract needs and are blank ("CPF do responsável", "CEP"…). */
  missingForContract: string[];
  contract: OfficeContractSummary;
  updatedAt: string | null;
  updatedBy: TaskPersonRef | null;
}

/** GET /office/contract-template (permission `office`): the template in use for the editor. */
export interface ContractTemplateResponse extends OfficeContractSummary {
  /** The stored template, or the factory one when `source = 'factory'`. */
  blocks: ContractBlock[];
  /** Image in use (`data:` URI): the custom one or the factory one. */
  watermarkImage: string;
}

/** What is missing to generate the contract of a client, by origin (spec §13.9). */
export interface ContractRequirements {
  client: string[];
  fee: string[];
  office: string[];
}

/** GET /clients/:id/contract (permission `finance`): everything to print the contract of a client. */
export interface ClientContractResponse {
  /** True when nothing is missing. */
  ready: boolean;
  missing: ContractRequirements;
  client: TaskClientRef & { legalName: string };
  /** The fee period in force today (null when none covers today). */
  fee: { amount: number; employeeFee: number; dueDay: number; discountBps: number; startDate: ISODate; endDate: ISODate } | null;
  template: { source: 'factory' | 'custom'; factoryVersion: string; updatedAt: string | null };
  /** Blocks already filled (the discount clause only with discount). */
  blocks: ContractBlock[];
  /** Value of each field (empty when missing). */
  values: Record<string, string>;
  watermark: { enabled: boolean; image: string | null };
  office: OfficeBranding;
}
