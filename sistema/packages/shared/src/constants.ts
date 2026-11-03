// Domain enums, labels (pt-BR) and catalogs shared by API and web.

export const CATEGORY_TYPES = ['income', 'expense'] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

export const TRANSACTION_TYPES = ['income', 'expense', 'transfer'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** How a transfer row should be read. Derived by the API from the accounts involved. */
export const TRANSFER_KINDS = ['transfer', 'investment', 'redemption', 'card_payment'] as const;
export type TransferKind = (typeof TRANSFER_KINDS)[number];

export const TRANSFER_KIND_LABELS: Record<TransferKind, string> = {
  transfer: 'Transferência',
  investment: 'Aplicação',
  redemption: 'Resgate',
  card_payment: 'Pagamento de fatura',
};

/** Extra charged on a payment made after the due date (recorded as its own linked transaction). */
export const LATE_FEE_KINDS = ['interest', 'fine'] as const;
export type LateFeeKind = (typeof LATE_FEE_KINDS)[number];

export const LATE_FEE_KIND_LABELS: Record<LateFeeKind, string> = {
  interest: 'Juros',
  fine: 'Multa',
};

/**
 * Receivables made by "Gerar honorários": the monthly fee of a client for a competence month, and
 * the employee charge added to it ("+ Empregados").
 */
export const FEE_ENTRY_KINDS = ['fee', 'employees'] as const;
export type FeeEntryKind = (typeof FEE_ENTRY_KINDS)[number];

/** Why "Gerar honorários" left a client out. */
export const GENERATE_FEES_SKIP_REASONS = ['already_generated', 'no_current_fee', 'not_started', 'inactive'] as const;
export type GenerateFeesSkipReason = (typeof GENERATE_FEES_SKIP_REASONS)[number];

export const GENERATE_FEES_SKIP_LABELS: Record<GenerateFeesSkipReason, string> = {
  already_generated: 'Já gerado nesta competência',
  no_current_fee: 'Sem honorário vigente na competência',
  not_started: 'Contrato começa depois da competência',
  inactive: 'Cliente inativo antes da competência',
};

/** Income categories used by the fee generation (found by name, created when missing). */
export const FEE_CATEGORY = { name: 'Serviços Prestados', fee: 'Honorários contábeis', employees: 'Folha de pagamento' } as const;

/** Expense category of the discounts granted for paying by the due date (found by name, created when missing). */
export const DISCOUNT_CATEGORY = { name: 'Despesas financeiras', discount: 'Descontos concedidos' } as const;

/** Payment risk of a client, from the delinquency score (see utils/delinquency.ts). */
export const DELINQUENCY_RISKS = ['baixo', 'moderado', 'alto', 'critico'] as const;
export type DelinquencyRisk = (typeof DELINQUENCY_RISKS)[number];

export const DELINQUENCY_RISK_LABELS: Record<DelinquencyRisk, string> = {
  baixo: 'Bom pagador',
  moderado: 'Atenção',
  alto: 'Risco alto',
  critico: 'Crítico',
};

export const ACCOUNT_TYPES = [
  'checking',
  'savings',
  'wallet',
  'benefit',
  'investment',
  'other',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  wallet: 'Carteira',
  benefit: 'Benefício (VR/VA)',
  investment: 'Investimento',
  other: 'Outra',
};

export const PAYMENT_METHODS = [
  'pix',
  'cash',
  'debit_card',
  'credit_card',
  'bank_slip',
  'transfer',
  'auto_debit',
  'other',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  debit_card: 'Cartão de débito',
  credit_card: 'Cartão de crédito',
  bank_slip: 'Boleto',
  transfer: 'TED/DOC',
  auto_debit: 'Débito automático',
  other: 'Outro',
};

/**
 * single      → lançamento único
 * installment → parcelado (N parcelas geradas na criação)
 * recurring   → recorrente na frequência escolhida, com quantidade definida
 * fixed       → recorrente sem fim (na frequência escolhida, mensal por padrão); gerada a cada
 *               período e presente em relatórios/projeções. Na interface é "Recorrente" sem quantidade.
 */
export const RECURRENCE_KINDS = ['single', 'installment', 'recurring', 'fixed'] as const;
export type RecurrenceKind = (typeof RECURRENCE_KINDS)[number];

export const RECURRENCE_KIND_LABELS: Record<RecurrenceKind, string> = {
  single: 'Única',
  installment: 'Parcelada',
  recurring: 'Recorrente',
  fixed: 'Fixa',
};

export const FREQUENCIES = ['weekly', 'monthly', 'semiannual', 'annual'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  semiannual: 'Semestral',
  annual: 'Anual',
};

/** Scope used when editing/deleting an occurrence that belongs to a series. */
export const SERIES_SCOPES = ['one', 'future', 'all'] as const;
export type SeriesScope = (typeof SERIES_SCOPES)[number];

export const SERIES_SCOPE_LABELS: Record<SeriesScope, string> = {
  one: 'Somente este',
  future: 'Este e os próximos',
  all: 'Todos da série',
};

// ---------------------------------------------------------------------------
// Clients and suppliers (cadastros da empresa)
// ---------------------------------------------------------------------------

/** Every contact is either a client (company served under contract) or a supplier. */
export const CONTACT_KINDS = ['client', 'supplier'] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export const CONTACT_KIND_LABELS: Record<ContactKind, string> = {
  client: 'Cliente',
  supplier: 'Fornecedor',
};

export const TAX_REGIMES = ['simples_nacional', 'mei', 'presumed_profit', 'real_profit', 'exempt', 'other'] as const;
export type TaxRegime = (typeof TAX_REGIMES)[number];

export const TAX_REGIME_LABELS: Record<TaxRegime, string> = {
  simples_nacional: 'Simples Nacional',
  mei: 'MEI',
  presumed_profit: 'Lucro Presumido',
  real_profit: 'Lucro Real',
  exempt: 'Imune / Isenta',
  other: 'Outro',
};

/** Annexes of the Simples Nacional (LC 123/2006). Required when the regime is simples_nacional. */
export const SIMPLES_ANNEXES = ['I', 'II', 'III', 'IV', 'V'] as const;
export type SimplesAnnex = (typeof SIMPLES_ANNEXES)[number];

export const SIMPLES_ANNEX_LABELS: Record<SimplesAnnex, string> = {
  I: 'Anexo I — Comércio',
  II: 'Anexo II — Indústria',
  III: 'Anexo III — Serviços',
  IV: 'Anexo IV — Serviços',
  V: 'Anexo V — Serviços',
};

export const CLIENT_STATUSES = ['active', 'inactive'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
};

export const INACTIVATION_REASONS = [
  'accounting_transfer',
  'contract_end',
  'company_closure',
  'default',
  'other',
] as const;
export type InactivationReason = (typeof INACTIVATION_REASONS)[number];

export const INACTIVATION_REASON_LABELS: Record<InactivationReason, string> = {
  accounting_transfer: 'Transferência de contabilidade',
  contract_end: 'Encerramento de contrato',
  company_closure: 'Encerramento da empresa',
  default: 'Inadimplência',
  other: 'Outro motivo',
};

export const TRANSACTION_STATUSES = ['all', 'paid', 'pending', 'overdue'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const GRANULARITIES = ['day', 'week', 'month', 'year'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export const CARD_BRANDS = [
  'visa',
  'mastercard',
  'elo',
  'amex',
  'hipercard',
  'diners',
  'other',
] as const;
export type CardBrand = (typeof CARD_BRANDS)[number];

export const CARD_BRAND_LABELS: Record<CardBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  elo: 'Elo',
  amex: 'American Express',
  hipercard: 'Hipercard',
  diners: 'Diners Club',
  other: 'Outra',
};

export type InvoiceStatus = 'open' | 'closed' | 'paid' | 'overdue';

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  open: 'Aberta',
  closed: 'Fechada',
  paid: 'Paga',
  overdue: 'Vencida',
};

export interface BankInfo {
  code: string;
  name: string;
  /** 1–3 chars shown inside the round badge. */
  short: string;
  color: string;
  textColor: string;
}

/** Main Brazilian banks/fintechs. Colors approximate each brand; no trademarked artwork is used. */
export const BANKS = [
  { code: 'nubank', name: 'Nubank', short: 'nu', color: '#820AD1', textColor: '#FFFFFF' },
  { code: 'itau', name: 'Itaú', short: 'itaú', color: '#EC7000', textColor: '#FFFFFF' },
  { code: 'bradesco', name: 'Bradesco', short: 'B', color: '#CC092F', textColor: '#FFFFFF' },
  { code: 'bb', name: 'Banco do Brasil', short: 'BB', color: '#FCF000', textColor: '#0038A8' },
  { code: 'caixa', name: 'Caixa', short: 'CX', color: '#005CA9', textColor: '#FFFFFF' },
  { code: 'santander', name: 'Santander', short: 'S', color: '#EC0000', textColor: '#FFFFFF' },
  { code: 'inter', name: 'Banco Inter', short: 'in', color: '#FF7A00', textColor: '#FFFFFF' },
  { code: 'c6', name: 'C6 Bank', short: 'C6', color: '#1F1F1F', textColor: '#FFFFFF' },
  { code: 'btg', name: 'BTG Pactual', short: 'btg', color: '#0B2A5B', textColor: '#FFFFFF' },
  { code: 'xp', name: 'XP Investimentos', short: 'XP', color: '#111111', textColor: '#F5D400' },
  { code: 'sicoob', name: 'Sicoob', short: 'sc', color: '#00A091', textColor: '#FFFFFF' },
  { code: 'sicredi', name: 'Sicredi', short: 'sr', color: '#3FA110', textColor: '#FFFFFF' },
  { code: 'picpay', name: 'PicPay', short: 'pp', color: '#21C25E', textColor: '#FFFFFF' },
  { code: 'mercadopago', name: 'Mercado Pago', short: 'mp', color: '#00B1EA', textColor: '#FFFFFF' },
  { code: 'pagbank', name: 'PagBank', short: 'pb', color: '#00A868', textColor: '#FFFFFF' },
  { code: 'neon', name: 'Neon', short: 'ne', color: '#0FD3F0', textColor: '#06243A' },
  { code: 'safra', name: 'Safra', short: 'sf', color: '#00205B', textColor: '#D4B46A' },
  { code: 'banrisul', name: 'Banrisul', short: 'br', color: '#004B8D', textColor: '#FFFFFF' },
  { code: 'original', name: 'Banco Original', short: 'og', color: '#00A857', textColor: '#FFFFFF' },
  { code: 'next', name: 'Next', short: 'nx', color: '#00E35F', textColor: '#0B0B0B' },
  { code: 'will', name: 'Will Bank', short: 'wb', color: '#FFD500', textColor: '#1A1A1A' },
  { code: 'stone', name: 'Stone', short: 'st', color: '#00A868', textColor: '#FFFFFF' },
  { code: 'other', name: 'Outro banco', short: '$', color: '#6B6F76', textColor: '#FFFFFF' },
] as const satisfies readonly BankInfo[];

export type BankCode = (typeof BANKS)[number]['code'];
export const BANK_CODES = BANKS.map((b) => b.code) as unknown as readonly [BankCode, ...BankCode[]];

export function getBank(code: string | null | undefined): BankInfo | undefined {
  return BANKS.find((b) => b.code === code);
}

/** Curated lucide icon names (kebab-case) offered in pickers. The web maps them to components. */
export const ICON_NAMES = [
  'wallet',
  'banknote',
  'coins',
  'hand-coins',
  'piggy-bank',
  'landmark',
  'credit-card',
  'receipt',
  'trending-up',
  'briefcase',
  'laptop',
  'building-2',
  'shopping-cart',
  'shopping-bag',
  'store',
  'utensils',
  'coffee',
  'pizza',
  'beer',
  'car',
  'fuel',
  'bus',
  'bike',
  'plane',
  'house',
  'lightbulb',
  'droplet',
  'wifi',
  'smartphone',
  'tv',
  'heart-pulse',
  'pill',
  'stethoscope',
  'dumbbell',
  'graduation-cap',
  'book-open',
  'gift',
  'party-popper',
  'music',
  'gamepad-2',
  'film',
  'ticket',
  'shirt',
  'scissors',
  'baby',
  'paw-print',
  'wrench',
  'shield',
  'umbrella',
  'sparkles',
  'tag',
  'target',
  'flag',
  'star',
] as const;
export type IconName = (typeof ICON_NAMES)[number];

/** Swatches offered in color pickers (categories, accounts, cards, goals). */
export const COLOR_SWATCHES = [
  '#152B61',
  '#3F64BE',
  '#0EA5E9',
  '#14B8A6',
  '#12A150',
  '#84CC16',
  '#EAB308',
  '#F59E0B',
  '#F97316',
  '#E5484D',
  '#EC4899',
  '#A855F7',
  '#7C3AED',
  '#64748B',
  '#78716C',
  '#0F766E',
] as const;

export const DEFAULT_COLOR = '#152B61';

// ---------------------------------------------------------------------------
// Tasks (módulo Tarefas): work items of the office, recurring obligations per client and competence
// (monthly audit), sequential flows and their templates. See docs/api.md → "Tarefas".
// ---------------------------------------------------------------------------

/** Status of a task. "Atrasada" (overdue) is derived (open + due date before today), never stored. */
export const TASK_STATUSES = ['todo', 'in_progress', 'waiting_client', 'done', 'canceled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  waiting_client: 'Aguardando cliente',
  done: 'Concluída',
  canceled: 'Cancelada',
};

/** Statuses that still count as work to do (and can become overdue). */
export const OPEN_TASK_STATUSES = ['todo', 'in_progress', 'waiting_client'] as const satisfies readonly TaskStatus[];
export type OpenTaskStatus = (typeof OPEN_TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
};

/** Tie-break order (urgent first). */
export const TASK_PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/** "Minhas" (assigned to me), "Meu departamento" or "Todas". */
export const TASK_SCOPES = ['mine', 'department', 'all'] as const;
export type TaskScope = (typeof TASK_SCOPES)[number];

export const TASK_SCOPE_LABELS: Record<TaskScope, string> = {
  mine: 'Minhas',
  department: 'Meu departamento',
  all: 'Todas',
};

/**
 * Situation filter of the lists ("Situação"). `done` = concluded or canceled; `overdue` = open with a
 * due date before today; `waiting` = waiting for the client.
 */
export const TASK_SITUATIONS = ['open', 'overdue', 'waiting', 'done', 'all'] as const;
export type TaskSituation = (typeof TASK_SITUATIONS)[number];

export const TASK_SITUATION_LABELS: Record<TaskSituation, string> = {
  open: 'Abertas',
  overdue: 'Atrasadas',
  waiting: 'Aguardando cliente',
  done: 'Concluídas',
  all: 'Todas',
};

/** "Tipo": standalone tasks, recurring occurrences (one per client and competence) or process steps. */
export const TASK_KINDS = ['standalone', 'recurring', 'flow'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  standalone: 'Avulsas',
  recurring: 'Recorrentes',
  flow: 'Etapas de processo',
};

/**
 * Groups of the list (open items), by the work date (the due date of a task; the internal target of a
 * recurring occurrence): Atrasadas (past the due date / legal deadline), Fora da meta (occurrence past
 * its target, legal deadline still ahead), Hoje, Próximos 7 dias, Mais tarde, Sem vencimento.
 */
export const TASK_DUE_BUCKETS = ['overdue', 'targetMissed', 'today', 'next7Days', 'later', 'noDueDate'] as const;
export type TaskDueBucket = (typeof TASK_DUE_BUCKETS)[number];

export const TASK_DUE_BUCKET_LABELS: Record<TaskDueBucket, string> = {
  overdue: 'Atrasadas',
  targetMissed: 'Fora da meta',
  today: 'Hoje',
  next7Days: 'Próximos 7 dias',
  later: 'Mais tarde',
  noDueDate: 'Sem vencimento',
};

/**
 * Periodicity of a recurring task. The competence (`YYYY-MM`) is the month the legal deadline falls in
 * (Effy's rule); weekly tasks have one occurrence per week (Monday to Sunday) whose deadline weekday
 * falls in the month. Bimonthly, quarterly, semiannual and annual ones occur every 2, 3, 6 and 12
 * months from the anchor month (`dueMonth`).
 */
export const RECURRENCE_PERIODS = ['weekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'] as const;
export type RecurrencePeriod = (typeof RECURRENCE_PERIODS)[number];

export const RECURRENCE_PERIOD_LABELS: Record<RecurrencePeriod, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  bimonthly: 'Bimestral',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
};

/** Months between two occurrences (weekly: every month has occurrences). */
export const RECURRENCE_PERIOD_MONTHS: Record<RecurrencePeriod, number> = {
  weekly: 1,
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

/** Weekdays of a weekly legal deadline (ISO: 1 = Monday … 7 = Sunday). */
export const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
  7: 'Domingo',
};

/**
 * What happens to a legal deadline that falls on a non-business day (weekends and the national
 * holidays of `utils/tasks.ts`). The internal target always anticipates.
 */
export const NON_BUSINESS_DAY_RULES = ['anticipate', 'postpone', 'keep'] as const;
export type NonBusinessDayRule = (typeof NON_BUSINESS_DAY_RULES)[number];

export const NON_BUSINESS_DAY_RULE_LABELS: Record<NonBusinessDayRule, string> = {
  anticipate: 'Antecipar para o dia útil anterior',
  postpone: 'Postergar para o próximo dia útil',
  keep: 'Manter a data',
};

/**
 * Reference month of an occurrence ("competência de referência"): the competence (month of the legal
 * deadline) minus this many months. 0 = the same month, 1 = the previous one (DAS, DCTFWeb, FGTS), up
 * to 12. Weekly tasks always use 0.
 */
export const MAX_REFERENCE_OFFSET = 12;

/** State of an audit cell as the matrix cycles it (A fazer → Em andamento → Concluída). */
export const OCCURRENCE_STATUSES = ['todo', 'in_progress', 'done'] as const;
export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number];

export const OCCURRENCE_STATUS_LABELS: Record<OccurrenceStatus, string> = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  done: 'Concluída',
};

/**
 * Derived situation of a recurring occurrence (never stored): not started, in progress (incl. waiting
 * for the client), past the internal target with the legal deadline still ahead ("Fora da meta"), past
 * the legal deadline ("Atrasada"), concluded on time / late (by the legal deadline, office time zone) or
 * canceled (counted apart from the concluded ones).
 */
export const OCCURRENCE_SITUATIONS = [
  'not_started',
  'in_progress',
  'target_missed',
  'overdue',
  'done_on_time',
  'done_late',
  'canceled',
] as const;
export type OccurrenceSituation = (typeof OCCURRENCE_SITUATIONS)[number];

export const OCCURRENCE_SITUATION_LABELS: Record<OccurrenceSituation, string> = {
  not_started: 'Não iniciada',
  in_progress: 'Em andamento',
  target_missed: 'Fora da meta',
  overdue: 'Atrasada',
  done_on_time: 'Concluída no prazo',
  done_late: 'Concluída com atraso',
  canceled: 'Cancelada',
};

/**
 * Where the responsible of an occurrence comes from: assigned by hand for that competence only, the
 * client's responsible in the recurring task's department, or the recurring task's default responsible.
 */
export const ASSIGNEE_SOURCES = ['manual', 'client', 'default'] as const;
export type AssigneeSource = (typeof ASSIGNEE_SOURCES)[number];

export const ASSIGNEE_SOURCE_LABELS: Record<AssigneeSource, string> = {
  manual: 'Atribuída só nesta competência',
  client: 'Responsável do cliente no departamento',
  default: 'Responsável padrão',
};

/** Step of a process: concluded, the one whose task is active now, or waiting for the previous one. */
export const FLOW_STEP_STATES = ['done', 'current', 'waiting'] as const;
export type FlowStepState = (typeof FLOW_STEP_STATES)[number];

export const FLOW_STEP_STATE_LABELS: Record<FlowStepState, string> = {
  done: 'Concluída',
  current: 'Em execução',
  waiting: 'Aguardando a etapa anterior',
};

/** Entries of a task's history ("linha do tempo"), written by the services. */
export const TASK_EVENT_KINDS = [
  'created',
  'updated',
  'assigned',
  'status',
  'reopened',
  'commented',
  'comment_removed',
  'attachment_added',
  'attachment_removed',
  'flow_step',
] as const;
export type TaskEventKind = (typeof TASK_EVENT_KINDS)[number];

export const TASK_EVENT_KIND_LABELS: Record<TaskEventKind, string> = {
  created: 'Criada',
  updated: 'Alterada',
  assigned: 'Responsável alterado',
  status: 'Situação alterada',
  reopened: 'Reaberta',
  commented: 'Comentário',
  comment_removed: 'Comentário removido',
  attachment_added: 'Anexo adicionado',
  attachment_removed: 'Anexo removido',
  flow_step: 'Etapa de processo',
};

/**
 * File types accepted as task attachments. The content is checked against the type's signature
 * (magic bytes) by the API; HTML, SVG, scripts and executables are never accepted, and every download
 * is served as an attachment (never rendered inline).
 */
export const TASK_ATTACHMENT_TYPES = {
  'application/pdf': { label: 'PDF', extensions: ['pdf'] },
  'image/png': { label: 'Imagem PNG', extensions: ['png'] },
  'image/jpeg': { label: 'Imagem JPEG', extensions: ['jpg', 'jpeg'] },
  'image/webp': { label: 'Imagem WEBP', extensions: ['webp'] },
  'application/msword': { label: 'Word (.doc)', extensions: ['doc'] },
  'application/vnd.ms-excel': { label: 'Excel (.xls)', extensions: ['xls'] },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { label: 'Word', extensions: ['docx'] },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { label: 'Excel', extensions: ['xlsx'] },
  'application/xml': { label: 'XML', extensions: ['xml'] },
  'text/plain': { label: 'Texto', extensions: ['txt'] },
  'text/csv': { label: 'CSV', extensions: ['csv'] },
  'application/zip': { label: 'ZIP', extensions: ['zip'] },
} as const satisfies Record<string, { label: string; extensions: readonly string[] }>;
export type TaskAttachmentType = keyof typeof TASK_ATTACHMENT_TYPES;
export const TASK_ATTACHMENT_CONTENT_TYPES = Object.keys(TASK_ATTACHMENT_TYPES) as [TaskAttachmentType, ...TaskAttachmentType[]];

/** Limits of task attachments (stored in the database, encrypted): per file, per task, files per task. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TASK_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TASK = 50;

/** Office time zone: "today" and the day something was concluded are taken here (deadlines are calendar dates). */
export const TASK_TIME_ZONE = 'America/Sao_Paulo';

// ---------------------------------------------------------------------------
// Phase 3: clients' documents and accesses, unions (sindicatos), office and contract
// ---------------------------------------------------------------------------

/**
 * Documents with an expiry date of a client (Effy's CompanyReport, "laudo"), by group (spec §13.8.1).
 * `other` takes a name typed by the user.
 */
export const CLIENT_DOCUMENT_KINDS = [
  'digital_certificate',
  'cnd_federal',
  'cnd_state',
  'cnd_municipal',
  'crf_fgts',
  'cndt',
  'operating_license',
  'sanitary_license',
  'fire_certificate',
  'environmental_license',
  'pcmso',
  'pgr',
  'ltcat',
  'professional_registration',
  'other',
] as const;
export type ClientDocumentKind = (typeof CLIENT_DOCUMENT_KINDS)[number];

export const CLIENT_DOCUMENT_KIND_LABELS: Record<ClientDocumentKind, string> = {
  digital_certificate: 'Certificado digital (e-CNPJ A1/A3)',
  cnd_federal: 'CND federal (Receita e PGFN)',
  cnd_state: 'CND estadual',
  cnd_municipal: 'CND municipal',
  crf_fgts: 'CRF do FGTS',
  cndt: 'CNDT trabalhista',
  operating_license: 'Alvará de funcionamento',
  sanitary_license: 'Licença sanitária',
  fire_certificate: 'AVCB/CLCB (bombeiros)',
  environmental_license: 'Licença ambiental',
  pcmso: 'PCMSO',
  pgr: 'PGR',
  ltcat: 'LTCAT',
  professional_registration: 'Registro em órgão de classe',
  other: 'Outro',
};

/** Groups of the type picker; the icon of a row follows the group (spec §6.10). */
export const CLIENT_DOCUMENT_GROUPS = ['certificates', 'certificates_of_debt', 'licenses', 'health_safety', 'others'] as const;
export type ClientDocumentGroup = (typeof CLIENT_DOCUMENT_GROUPS)[number];

export const CLIENT_DOCUMENT_GROUP_LABELS: Record<ClientDocumentGroup, string> = {
  certificates: 'Certificados',
  certificates_of_debt: 'Certidões',
  licenses: 'Licenças e alvarás',
  health_safety: 'Saúde e segurança do trabalho',
  others: 'Outros',
};

export const CLIENT_DOCUMENT_KIND_GROUP: Record<ClientDocumentKind, ClientDocumentGroup> = {
  digital_certificate: 'certificates',
  cnd_federal: 'certificates_of_debt',
  cnd_state: 'certificates_of_debt',
  cnd_municipal: 'certificates_of_debt',
  crf_fgts: 'certificates_of_debt',
  cndt: 'certificates_of_debt',
  operating_license: 'licenses',
  sanitary_license: 'licenses',
  fire_certificate: 'licenses',
  environmental_license: 'licenses',
  pcmso: 'health_safety',
  pgr: 'health_safety',
  ltcat: 'health_safety',
  professional_registration: 'others',
  other: 'others',
};

/** Up to 50 documents per client; the note up to 200 characters. */
export const MAX_CLIENT_DOCUMENTS = 50;
export const CLIENT_DOCUMENT_NOTE_MAX = 200;

/**
 * Deadline bands of documents and collective agreements (computed by the API in the office time
 * zone): `overdue` before today; `within30` from today to today + 30 (inclusive); `within60` from
 * today + 31 to today + 60; `later` after that; `noDate` without expiry (documents) or without the
 * base month (unions).
 */
export const DEADLINE_BUCKETS = ['overdue', 'within30', 'within60', 'later', 'noDate'] as const;
export type DeadlineBucket = (typeof DEADLINE_BUCKETS)[number];

export const DEADLINE_BUCKET_LABELS: Record<DeadlineBucket, string> = {
  overdue: 'Vencidos',
  within30: 'Em até 30 dias',
  within60: 'Em 31 a 60 dias',
  later: 'Em dia',
  noDate: 'Sem vencimento informado',
};

/** Encrypted accesses of a client (never in lists): revealed one at a time, with an audit record. */
export const CLIENT_CREDENTIAL_FIELDS = ['simplesAccessCode', 'accountantPassword'] as const;
export type ClientCredentialField = (typeof CLIENT_CREDENTIAL_FIELDS)[number];

export const CLIENT_CREDENTIAL_FIELD_LABELS: Record<ClientCredentialField, string> = {
  simplesAccessCode: 'Código de acesso do Simples Nacional',
  accountantPassword: 'Senha do contador',
};

/** Regimes where the Simples Nacional access code applies. */
export const SIMPLES_ACCESS_REGIMES = ['simples_nacional', 'mei'] as const satisfies readonly TaxRegime[];

/** Reveals of a client's access per member per minute (on top of the per-IP limit). */
export const MAX_CREDENTIAL_REVEALS_PER_MINUTE = 10;

/** Situation of a union's collective agreement (the list filter, spec §13.7). `ok` = more than 60 days. */
export const UNION_SITUATIONS = ['overdue', 'within30', 'within60', 'ok', 'noBaseMonth'] as const;
export type UnionSituation = (typeof UNION_SITUATIONS)[number];

export const UNION_SITUATION_LABELS: Record<UnionSituation, string> = {
  overdue: 'Convenção vencida',
  within30: 'Vence em até 30 dias',
  within60: 'Vence em 31 a 60 dias',
  ok: 'Em dia',
  noBaseMonth: 'Sem data-base',
};

/** Unions of a workspace (a dozen in practice; the cap keeps the in-memory urgency order bounded). */
export const MAX_UNIONS = 1000;
/** Collective agreement cycles per union (one per year). */
export const MAX_UNION_CYCLES = 60;
export const UNION_CYCLE_MIN_YEAR = 2000;
export const UNION_CYCLE_MAX_YEAR = 2100;

/** Pix key types of the office (spec §13.9). */
export const PIX_KEY_TYPES = ['cnpj', 'cpf', 'email', 'phone', 'random'] as const;
export type PixKeyType = (typeof PIX_KEY_TYPES)[number];

export const PIX_KEY_TYPE_LABELS: Record<PixKeyType, string> = {
  cnpj: 'CNPJ',
  cpf: 'CPF',
  email: 'E-mail',
  phone: 'Telefone',
  random: 'Chave aleatória',
};

/** Logo and watermark of the office: PNG, JPG or WebP up to 500 KB (never SVG). */
export const OFFICE_IMAGE_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type OfficeImageContentType = (typeof OFFICE_IMAGE_CONTENT_TYPES)[number];
export const MAX_OFFICE_IMAGE_BYTES = 500 * 1024;

/** Block types of the contract template (the ones the PDF knows how to draw; Effy's TIPOS_DE_BLOCO). */
export const CONTRACT_BLOCK_TYPES = [
  'title',
  'subtitle',
  'heading1',
  'heading2',
  'label',
  'paragraph',
  'paragraph_center',
  'spacer',
] as const;
export type ContractBlockType = (typeof CONTRACT_BLOCK_TYPES)[number];

export const CONTRACT_BLOCK_TYPE_LABELS: Record<ContractBlockType, string> = {
  title: 'Título do contrato',
  subtitle: 'Subtítulo',
  heading1: 'Título de cláusula',
  heading2: 'Título de seção',
  label: 'Rótulo em negrito',
  paragraph: 'Parágrafo',
  paragraph_center: 'Parágrafo centralizado',
  spacer: 'Espaço em branco',
};

/** Rules a block may carry: `discount` enters the contract only when the fee period has a discount. */
export const CONTRACT_BLOCK_RULES = ['discount'] as const;
export type ContractBlockRule = (typeof CONTRACT_BLOCK_RULES)[number];

/** Limits of the template (Effy's): blocks, characters per block and in total. */
export const MAX_CONTRACT_BLOCKS = 500;
export const MAX_CONTRACT_BLOCK_CHARS = 20_000;
export const MAX_CONTRACT_TOTAL_CHARS = 400_000;
