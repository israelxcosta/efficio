// API response types. Amounts are integer cents; dates are 'YYYY-MM-DD'; timestamps ISO 8601.

import type {
  AccountType,
  BankCode,
  CardBrand,
  CategoryType,
  ClientStatus,
  ContactKind,
  Frequency,
  IconName,
  InactivationReason,
  InvoiceStatus,
  PaymentMethod,
  RecurrenceKind,
  SimplesAnnex,
  TaxRegime,
  TransactionType,
  TransferKind,
} from './constants';
import type { TransactionOrigin } from './integrations';
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
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  status: ClientStatus;
  /** Set while inactive. */
  inactivation: ClientInactivation | null;
  /** Fee period that contains today, when registered. */
  currentFee: ClientFee | null;
  /** Most recent registered period (may have expired or not started yet). */
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
    /** Sum of the current monthly fees of active clients (cents). */
    monthlyFees: number;
    /** Active clients without a registered fee period covering today (new or due for renewal). */
    withoutCurrentFee: number;
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
  /** Optional deep link inside the web app, e.g. '/relatorios?tab=categorias'. */
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
