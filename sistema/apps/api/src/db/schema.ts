import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import type {
  AccountType,
  BankAccountKind,
  BankCode,
  BankConnectionStatus,
  CardBrand,
  CategoryType,
  ClientDocumentKind,
  ClientStatus,
  ContactKind,
  ContractBlock,
  FeeEntryKind,
  Frequency,
  IconName,
  ImportFormat,
  InactivationReason,
  AssigneeSource,
  LateFeeKind,
  MemberRole,
  MonthKey,
  OpenFinanceProvider,
  OpenTaskStatus,
  PaymentMethod,
  NonBusinessDayRule,
  PermissionOverrides,
  PixKeyType,
  PlanCode,
  ProfilePhotoContentType,
  OfficeImageContentType,
  RecurrenceKind,
  RecurrencePeriod,
  SimplesAnnex,
  SubscriptionStatus,
  TaskAttachmentType,
  TaskEventKind,
  TaskPriority,
  TaskStatus,
  TaxRegime,
  TransactionOrigin,
  TransactionType,
  TransferKind,
  WorkspaceKind,
} from '@effinance/shared';

const id = () => uuid().primaryKey().defaultRandom();
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const money = () => bigint({ mode: 'number' });
const calendarDate = () => date({ mode: 'string' });
const timestamptz = () => timestamp({ withTimezone: true });
const userRef = () =>
  uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });
/** Tenant column of every financial table (protected by Row Level Security). */
const workspaceRef = () => uuid().references(() => workspaces.id, { onDelete: 'cascade' });

// Tenant integrity (migration 0004): references between financial tables are composite foreign keys
// `(workspace_id, x_id) → parent(workspace_id, id)`, so a row can only point to a row of its own
// workspace. Foreign-key checks bypass RLS; a plain `x_id → parent(id)` would accept (and reveal) ids
// of other tenants. Every parent therefore has `unique (workspace_id, id)`.
// `onDelete('set null')` below is `ON DELETE SET NULL (x_id)` in the SQL (PostgreSQL 15+): only the
// reference is cleared, never `workspace_id`. drizzle-kit cannot express the column list — do not
// recreate these constraints with `drizzle-kit push`.
const tenantUnique = (table: string, t: { workspaceId: AnyPgColumn; id: AnyPgColumn }) =>
  unique(`${table}_workspace_id_id_uq`).on(t.workspaceId, t.id);

// ---------------------------------------------------------------------------
// Identity, tenancy and billing (not tenant-scoped: never touched inside a tenant transaction)
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: id(),
    name: text().notNull(),
    email: text().notNull().unique(),
    passwordHash: text().notNull(),
    /** TOTP secret encrypted with the master key (`KeyProvider.encryptSecret`). Set on setup. */
    mfaSecretEnc: text(),
    mfaEnabled: boolean().notNull().default(false),
    /** Salted PBKDF2 hashes of the unused recovery codes (`modules/auth/mfa.ts`; legacy rows: SHA-256). */
    mfaRecoveryCodes: jsonb().$type<string[]>(),
    /** Last accepted TOTP time step (a code is never accepted twice). */
    mfaLastStep: integer(),
    lastWorkspaceId: uuid().references((): AnyPgColumn => workspaces.id, { onDelete: 'set null' }),
    acceptedTermsAt: timestamptz(),
    passwordChangedAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  // Deleting a workspace clears this reference: without the index that is a scan of every user.
  (t) => [index('users_last_workspace_idx').on(t.lastWorkspaceId)],
);

export const workspaces = pgTable(
  'workspaces',
  {
    id: id(),
    name: text().notNull(),
    kind: text().$type<WorkspaceKind>().notNull(),
    /** Data key (AES-256) wrapped by the key provider; deleting it crypto-shreds the workspace. */
    wrappedKey: text(),
    keyId: text(),
    /**
     * When the encryption backfill last confirmed that no sensitive field of this workspace is in
     * plain text. New workspaces are born encrypted (default now()); rows that existed before
     * migration 0004 start null, so `db:migrate` re-checks them even if their key already exists.
     */
    encryptionBackfilledAt: timestamptz().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check('workspaces_kind_chk', sql`${t.kind} in ('personal', 'family', 'business')`)],
);

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: userRef(),
    role: text().$type<MemberRole>().notNull(),
    /**
     * Adjustments of the person over the role's defaults (migration 0015, spec §13.10): only the keys
     * that differ (`{ "finance": true }`). Read through `sanitizePermissionOverrides`; `{}` for the owner.
     */
    permissions: jsonb().$type<PermissionOverrides>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index('workspace_members_user_idx').on(t.userId),
    check('workspace_members_role_chk', sql`${t.role} in ('owner', 'editor', 'viewer')`),
    check(
      'workspace_members_permissions_chk',
      sql`jsonb_typeof(${t.permissions}) = 'object' and length(${t.permissions}::text) <= 2000 and (${t.role} <> 'owner' or ${t.permissions} = '{}'::jsonb)`,
    ),
    // Exactly one owner: owner-only actions (billing, deletion, members) and account deletion
    // ("workspaces where I am the owner") rely on it.
    uniqueIndex('workspace_members_single_owner_uq').on(t.workspaceId).where(sql`${t.role} = 'owner'`),
  ],
);

export const workspaceInvites = pgTable(
  'workspace_invites',
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    email: text().notNull(),
    role: text().$type<Exclude<MemberRole, 'owner'>>().notNull(),
    /** SHA-256 of the token sent by e-mail (the token itself is never stored). */
    tokenHash: text().notNull().unique(),
    invitedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    expiresAt: timestamptz().notNull(),
    acceptedAt: timestamptz(),
  },
  (t) => [
    index('workspace_invites_workspace_idx').on(t.workspaceId),
    // Account deletion removes the invites addressed to the user's e-mail (LGPD).
    index('workspace_invites_email_idx').on(sql`lower(${t.email})`),
    index('workspace_invites_invited_by_idx').on(t.invitedBy),
    // At most one pending invite per e-mail and workspace ("a new invite replaces the pending one").
    uniqueIndex('workspace_invites_pending_email_uq')
      .on(t.workspaceId, sql`lower(${t.email})`)
      .where(sql`${t.acceptedAt} is null`),
    check('workspace_invites_role_chk', sql`${t.role} in ('editor', 'viewer')`),
  ],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    workspaceId: uuid()
      .primaryKey()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    planCode: text().$type<PlanCode>(),
    status: text().$type<SubscriptionStatus>().notNull(),
    provider: text().$type<'mercadopago' | 'fake'>(),
    providerSubscriptionId: text().unique(),
    trialEndsAt: timestamptz(),
    currentPeriodEnd: timestamptz(),
    pastDueSince: timestamptz(),
    cancelAtPeriodEnd: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'subscriptions_status_chk',
      sql`${t.status} in ('trialing', 'pending', 'active', 'past_due', 'canceled', 'expired')`,
    ),
    check(
      'subscriptions_plan_code_chk',
      sql`${t.planCode} in ('individual_monthly', 'individual_yearly', 'family_monthly', 'business_monthly')`,
    ),
    check('subscriptions_provider_chk', sql`${t.provider} in ('mercadopago', 'fake')`),
  ],
);

/** Webhook notifications already received (idempotency). */
export const billingEvents = pgTable(
  'billing_events',
  {
    id: id(),
    provider: text().notNull(),
    eventId: text().notNull(),
    type: text().notNull(),
    payload: jsonb().notNull(),
    processedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('billing_events_provider_event_uq').on(t.provider, t.eventId)],
);

/**
 * One row per refresh token. Rotation marks the row `rotatedAt` and inserts the next one in the same
 * family; presenting a rotated token again revokes the whole family (reuse detection).
 */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    familyId: uuid().notNull(),
    userId: userRef(),
    /** Active workspace of this session (claim `wid` of the access tokens it issues). */
    workspaceId: uuid().references(() => workspaces.id, { onDelete: 'set null' }),
    tokenHash: text().notNull().unique(),
    userAgent: text(),
    /** Masked (last octet / last groups removed). */
    ip: text(),
    sessionStartedAt: timestamptz().notNull(),
    lastUsedAt: timestamptz().notNull().defaultNow(),
    expiresAt: timestamptz().notNull(),
    rotatedAt: timestamptz(),
    revokedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    index('sessions_user_idx').on(t.userId),
    index('sessions_family_idx').on(t.familyId),
    // Deleting a workspace clears `workspace_id` here; one row per refresh makes this table big.
    index('sessions_workspace_idx').on(t.workspaceId),
    // Retention purge (`db/retention.ts`).
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

export const passwordResets = pgTable(
  'password_resets',
  {
    id: id(),
    userId: userRef(),
    tokenHash: text().notNull().unique(),
    createdAt: createdAt(),
    expiresAt: timestamptz().notNull(),
    usedAt: timestamptz(),
  },
  (t) => [index('password_resets_user_idx').on(t.userId)],
);

/** Security/billing/membership events. No personal data beyond the masked IP. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    workspaceId: uuid().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    action: text().notNull(),
    entity: text(),
    entityId: text(),
    ip: text(),
    userAgent: text(),
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_workspace_idx').on(t.workspaceId, t.createdAt),
    index('audit_logs_user_idx').on(t.userId, t.createdAt),
    // Migration 0016: the records of one entity ("quem viu" a client's access) without scanning the
    // workspace's whole trail. Not partial: prepared statements get generic plans (`action = $n`).
    index('audit_logs_entity_idx').on(t.workspaceId, t.entityId, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Financial data — every table carries `workspace_id` and is protected by RLS
// ---------------------------------------------------------------------------

export const categories = pgTable(
  'categories',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    parentId: uuid(),
    name: text().notNull(),
    type: text().$type<CategoryType>().notNull(),
    icon: text().$type<IconName>().notNull(),
    color: text().notNull(),
    archived: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('categories_workspace_idx').on(t.workspaceId, t.type),
    check('categories_type_chk', sql`${t.type} in ('income', 'expense')`),
    tenantUnique('categories', t),
    foreignKey({
      name: 'categories_parent_fk',
      columns: [t.workspaceId, t.parentId],
      foreignColumns: [t.workspaceId, t.id],
    }).onDelete('cascade'),
  ],
);

export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    name: text().notNull(),
    type: text().$type<AccountType>().notNull(),
    bank: text().$type<BankCode>(),
    color: text().notNull(),
    icon: text().$type<IconName>().notNull(),
    initialBalance: money().notNull().default(0),
    includeInTotal: boolean().notNull().default(true),
    archived: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('accounts_workspace_idx').on(t.workspaceId),
    tenantUnique('accounts', t),
    check(
      'accounts_type_chk',
      sql`${t.type} in ('checking', 'savings', 'wallet', 'benefit', 'investment', 'other')`,
    ),
  ],
);

export const creditCards = pgTable(
  'credit_cards',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    name: text().notNull(),
    bank: text().$type<BankCode>().notNull(),
    brand: text().$type<CardBrand>().notNull(),
    limit: money().notNull(),
    closingDay: integer().notNull(),
    dueDay: integer().notNull(),
    color: text().notNull(),
    defaultAccountId: uuid(),
    archived: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('credit_cards_workspace_idx').on(t.workspaceId),
    check('credit_cards_days_chk', sql`${t.closingDay} between 1 and 31 and ${t.dueDay} between 1 and 31`),
    check('credit_cards_limit_chk', sql`${t.limit} >= 0`),
    check(
      'credit_cards_brand_chk',
      sql`${t.brand} in ('visa', 'mastercard', 'elo', 'amex', 'hipercard', 'diners', 'other')`,
    ),
    tenantUnique('credit_cards', t),
    foreignKey({
      name: 'credit_cards_default_account_fk',
      columns: [t.workspaceId, t.defaultAccountId],
      foreignColumns: [accounts.workspaceId, accounts.id],
    }).onDelete('set null'),
  ],
);

export const goals = pgTable(
  'goals',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    name: text().notNull(),
    targetAmount: money().notNull(),
    deadline: calendarDate(),
    icon: text().$type<IconName>().notNull(),
    color: text().notNull(),
    accountId: uuid(),
    notes: text(),
    archived: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('goals_workspace_idx').on(t.workspaceId),
    check('goals_target_amount_chk', sql`${t.targetAmount} > 0`),
    tenantUnique('goals', t),
    foreignKey({
      name: 'goals_account_fk',
      columns: [t.workspaceId, t.accountId],
      foreignColumns: [accounts.workspaceId, accounts.id],
    }).onDelete('set null'),
  ],
);

export const goalContributions = pgTable(
  'goal_contributions',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    goalId: uuid().notNull(),
    /** Negative = withdrawal; never zero. */
    amount: money().notNull(),
    date: calendarDate().notNull(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index('goal_contributions_goal_idx').on(t.goalId),
    index('goal_contributions_workspace_idx').on(t.workspaceId),
    check('goal_contributions_amount_chk', sql`${t.amount} <> 0`),
    foreignKey({
      name: 'goal_contributions_goal_fk',
      columns: [t.workspaceId, t.goalId],
      foreignColumns: [goals.workspaceId, goals.id],
    }).onDelete('cascade'),
  ],
);

/**
 * Suppliers and clients (migration 0007: `kind`). Client-only columns stay null for suppliers;
 * personal data of the client's responsible person is encrypted like the other contact fields.
 */
export const contacts = pgTable(
  'contacts',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    kind: text().$type<ContactKind>().notNull().default('supplier'),
    name: text().notNull(),
    document: text(),
    email: text(),
    phone: text(),
    zipCode: text(),
    street: text(),
    number: text(),
    complement: text(),
    district: text(),
    city: text(),
    state: text(),
    notes: text(),
    /** HMAC (per-workspace key) of the CPF/CNPJ digits: exact search over the encrypted document. */
    documentHash: text(),
    // Clients only (migration 0007).
    tradeName: text(),
    openedAt: calendarDate(),
    mainActivity: text(),
    responsibleName: text(),
    responsibleEmail: text(),
    responsiblePhone: text(),
    taxRegime: text().$type<TaxRegime>(),
    simplesAnnex: text().$type<SimplesAnnex>(),
    contractStartDate: calendarDate(),
    /**
     * Clients only (migration 0010): day of the month the fee is due, in the month after the
     * competence (clamped to short months). Contacts that existed before 0010 got 10.
     */
    feeDueDay: integer(),
    status: text().$type<ClientStatus>().notNull().default('active'),
    inactivatedAt: calendarDate(),
    inactivationReason: text().$type<InactivationReason>(),
    inactivationNotes: text(),
    // Clients only, phase 3 (migration 0015, spec §13.8): registrations in clear (public data, read by
    // every member), the responsible's CPF and the two accesses encrypted with the workspace key. The
    // accesses never leave in lists: only `POST /clients/:id/credentials/reveal` decrypts them.
    stateRegistration: text(),
    stateRegistrationExempt: boolean().notNull().default(false),
    municipalRegistration: text(),
    /** Encrypted (`v1.<iv>.<ct>`). */
    responsibleDocument: text(),
    /** Encrypted: access code of the Simples Nacional portal. */
    simplesAccessCode: text(),
    /** Encrypted: the office's password in this client's portals. */
    accountantPassword: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index('contacts_workspace_idx').on(t.workspaceId, t.name),
    index('contacts_document_hash_idx').on(t.workspaceId, t.documentHash),
    index('contacts_kind_idx').on(t.workspaceId, t.kind, t.name),
    // One client per CNPJ in the workspace (blind index of the encrypted document).
    uniqueIndex('contacts_client_document_uq')
      .on(t.workspaceId, t.documentHash)
      .where(sql`${t.kind} = 'client'`),
    tenantUnique('contacts', t),
    // Migration 0012: target of the task references, which must point to a client (`kind` included).
    unique('contacts_workspace_id_id_kind_uq').on(t.workspaceId, t.id, t.kind),
    check('contacts_kind_chk', sql`${t.kind} in ('client', 'supplier')`),
    check('contacts_status_chk', sql`${t.status} in ('active', 'inactive')`),
    check(
      'contacts_tax_regime_chk',
      sql`${t.taxRegime} in ('simples_nacional', 'mei', 'presumed_profit', 'real_profit', 'exempt', 'other')`,
    ),
    check('contacts_simples_annex_chk', sql`${t.simplesAnnex} in ('I', 'II', 'III', 'IV', 'V')`),
    check(
      'contacts_inactivation_reason_chk',
      sql`${t.inactivationReason} in ('accounting_transfer', 'contract_end', 'company_closure', 'default', 'other')`,
    ),
    // A client always has a regime and a contract start; the Simples annex only under the Simples.
    check(
      'contacts_client_chk',
      sql`${t.kind} <> 'client' or (${t.taxRegime} is not null and ${t.contractStartDate} is not null and (${t.simplesAnnex} is null or ${t.taxRegime} = 'simples_nacional'))`,
    ),
    // Inactive ⇔ date and reason recorded.
    check(
      'contacts_inactivation_chk',
      sql`(${t.status} = 'inactive') = (${t.inactivatedAt} is not null and ${t.inactivationReason} is not null)`,
    ),
    check('contacts_fee_due_day_chk', sql`${t.feeDueDay} between 1 and 31`),
    check(
      'contacts_registrations_chk',
      sql`length(${t.stateRegistration}) <= 40 and length(${t.municipalRegistration}) <= 40 and not (${t.stateRegistrationExempt} and ${t.stateRegistration} is not null)`,
    ),
    check(
      'contacts_secrets_chk',
      sql`${t.responsibleDocument} ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length(${t.responsibleDocument}) <= 200 and ${t.simplesAccessCode} ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length(${t.simplesAccessCode}) <= 1200 and ${t.accountantPassword} ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length(${t.accountantPassword}) <= 1200`,
    ),
  ],
);

/**
 * Fees of a client (honorários), one row per yearly period (vigência). Only the 0-based period index
 * is stored: dates derive from the client's contract start (shared `feePeriod`).
 */
export const clientFees = pgTable(
  'client_fees',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    clientId: uuid().notNull(),
    periodIndex: integer().notNull(),
    /** Honorário mensal (cents). */
    amount: money().notNull(),
    /** Taxa por empregado (cents). */
    employeeFee: money().notNull().default(0),
    /** Discount for paying by the due date, in basis points (500 = 5%; migration 0010). */
    discountBps: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    tenantUnique('client_fees', t),
    uniqueIndex('client_fees_period_uq').on(t.clientId, t.periodIndex),
    check('client_fees_period_chk', sql`${t.periodIndex} >= 0`),
    check('client_fees_amount_chk', sql`${t.amount} > 0 and ${t.employeeFee} >= 0`),
    check('client_fees_discount_chk', sql`${t.discountBps} between 0 and 9999`),
    foreignKey({
      name: 'client_fees_client_fk',
      columns: [t.workspaceId, t.clientId],
      foreignColumns: [contacts.workspaceId, contacts.id],
    }).onDelete('cascade'),
  ],
);

/** Values copied into every occurrence generated from a series. */
export interface RecurrenceTemplate {
  type: 'income' | 'expense';
  description: string;
  amount: number;
  accountId: string | null;
  creditCardId: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  contactId: string | null;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  /** Set when the series was created as one part of a category split. */
  splitGroupId?: string | null;
}

/**
 * A series of transactions. Finite series (installments, recurring with a count) are fully
 * generated on creation. Open-ended series (fixed, recurring without count) keep `nextIndex` /
 * `nextDate` and are materialized on demand up to the period being read.
 */
export const recurrences = pgTable(
  'recurrences',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    kind: text().$type<Exclude<RecurrenceKind, 'single'>>().notNull(),
    frequency: text().$type<Frequency>().notNull(),
    startDate: calendarDate().notNull(),
    /** null = open-ended. */
    totalOccurrences: integer(),
    /** Index (0-based) of the next occurrence to materialize. */
    nextIndex: integer().notNull().default(0),
    /** Date of the next occurrence to materialize; null when the series is complete/ended. */
    nextDate: calendarDate(),
    template: jsonb().$type<RecurrenceTemplate>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('recurrences_workspace_pending_idx').on(t.workspaceId, t.nextDate),
    tenantUnique('recurrences', t),
    check('recurrences_kind_chk', sql`${t.kind} in ('installment', 'recurring', 'fixed')`),
    check('recurrences_frequency_chk', sql`${t.frequency} in ('weekly', 'monthly', 'semiannual', 'annual')`),
    check(
      'recurrences_counters_chk',
      sql`${t.nextIndex} >= 0 and (${t.totalOccurrences} is null or ${t.totalOccurrences} > 0)`,
    ),
  ],
);

export const transactions = pgTable(
  'transactions',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    type: text().$type<TransactionType>().notNull(),
    description: text().notNull(),
    amount: money().notNull(),
    date: calendarDate().notNull(),
    paid: boolean().notNull().default(false),
    paidAt: calendarDate(),
    accountId: uuid(),
    toAccountId: uuid(),
    creditCardId: uuid(),
    invoiceMonth: text(),
    categoryId: uuid(),
    subcategoryId: uuid(),
    contactId: uuid(),
    paymentMethod: text().$type<PaymentMethod>(),
    notes: text(),
    transferKind: text().$type<TransferKind>(),
    recurrenceId: uuid(),
    recurrenceKind: text().$type<RecurrenceKind>().notNull().default('single'),
    frequency: text().$type<Frequency>(),
    installmentNumber: integer(),
    installmentTotal: integer(),
    /** 0-based position inside the series. */
    occurrenceIndex: integer(),
    /** Parts of an amount divided across categories share this id. */
    splitGroupId: uuid(),
    /** manual | file (OFX/CSV import) | open_finance (bank connection sync). */
    origin: text().$type<TransactionOrigin>().notNull().default('manual'),
    /** Import batch that created the row (undo removes what is left of it). */
    importBatchId: uuid(),
    /**
     * Identity of an imported row in its source: OFX FITID, provider transaction id or a content
     * hash. Unique per account/card, so re-importing never duplicates a transaction.
     */
    externalId: text(),
    /**
     * Interest or fine charged on a late payment (migration 0008): its own paid transaction pointing
     * to the one that was settled late. Removed with it (cascade) and when the payment is reopened.
     */
    lateFeeOf: uuid(),
    lateFeeKind: text().$type<LateFeeKind>(),
    /**
     * "Gerar honorários" (migration 0009): the competence month a generated receivable refers to
     * (due in the following month) and whether it is the client's fee or the employee charge.
     */
    feeCompetence: text().$type<MonthKey>(),
    feeKind: text().$type<FeeEntryKind>(),
    /** Employee charge ("+ Empregados"): the generated fee it belongs to (cascade) and the headcount. */
    feeOf: uuid(),
    employees: integer(),
    /**
     * Migration 0010. On a generated fee: the discount offered for paying by the due date (basis
     * points, copied from the fee period; null = none). On a discount row: the receivable settled on
     * time it was granted on — its own paid expense, removed with it (cascade) and when the payment
     * is reopened or no longer on time.
     */
    feeDiscountBps: integer(),
    discountOf: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    tenantUnique('transactions', t),
    index('transactions_workspace_date_idx').on(t.workspaceId, t.date),
    index('transactions_account_idx').on(t.accountId),
    index('transactions_to_account_idx').on(t.toAccountId),
    index('transactions_card_invoice_idx').on(t.creditCardId, t.invoiceMonth),
    index('transactions_contact_idx').on(t.contactId),
    index('transactions_category_idx').on(t.categoryId),
    index('transactions_split_group_idx').on(t.splitGroupId),
    uniqueIndex('transactions_series_occurrence_uq').on(t.recurrenceId, t.occurrenceIndex),
    // Deleting a category checks this reference: without the index, a scan of every tenant's rows.
    index('transactions_subcategory_idx').on(t.subcategoryId).where(sql`${t.subcategoryId} is not null`),
    check('transactions_type_chk', sql`${t.type} in ('income', 'expense', 'transfer')`),
    check('transactions_amount_chk', sql`${t.amount} > 0`),
    check(
      'transactions_recurrence_kind_chk',
      sql`${t.recurrenceKind} in ('single', 'installment', 'recurring', 'fixed')`,
    ),
    check('transactions_frequency_chk', sql`${t.frequency} in ('weekly', 'monthly', 'semiannual', 'annual')`),
    check(
      'transactions_payment_method_chk',
      sql`${t.paymentMethod} in ('pix', 'cash', 'debit_card', 'credit_card', 'bank_slip', 'transfer', 'auto_debit', 'other')`,
    ),
    check(
      'transactions_transfer_kind_chk',
      sql`${t.transferKind} in ('transfer', 'investment', 'redemption', 'card_payment')`,
    ),
    check('transactions_invoice_month_chk', sql`${t.invoiceMonth} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check(
      'transactions_installments_chk',
      sql`(${t.installmentNumber} is null or ${t.installmentNumber} > 0) and (${t.installmentTotal} is null or ${t.installmentTotal} > 0) and (${t.occurrenceIndex} is null or ${t.occurrenceIndex} >= 0)`,
    ),
    foreignKey({
      name: 'transactions_account_fk',
      columns: [t.workspaceId, t.accountId],
      foreignColumns: [accounts.workspaceId, accounts.id],
    }),
    foreignKey({
      name: 'transactions_to_account_fk',
      columns: [t.workspaceId, t.toAccountId],
      foreignColumns: [accounts.workspaceId, accounts.id],
    }),
    foreignKey({
      name: 'transactions_credit_card_fk',
      columns: [t.workspaceId, t.creditCardId],
      foreignColumns: [creditCards.workspaceId, creditCards.id],
    }),
    foreignKey({
      name: 'transactions_category_fk',
      columns: [t.workspaceId, t.categoryId],
      foreignColumns: [categories.workspaceId, categories.id],
    }),
    foreignKey({
      name: 'transactions_subcategory_fk',
      columns: [t.workspaceId, t.subcategoryId],
      foreignColumns: [categories.workspaceId, categories.id],
    }),
    foreignKey({
      name: 'transactions_contact_fk',
      columns: [t.workspaceId, t.contactId],
      foreignColumns: [contacts.workspaceId, contacts.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'transactions_recurrence_fk',
      columns: [t.workspaceId, t.recurrenceId],
      foreignColumns: [recurrences.workspaceId, recurrences.id],
    }).onDelete('set null'),
    // Migration 0005: imports.
    check('transactions_origin_chk', sql`${t.origin} in ('manual', 'file', 'open_finance')`),
    check('transactions_external_id_chk', sql`${t.externalId} is null or length(${t.externalId}) between 1 and 200`),
    // Batch and external id only exist on imported rows.
    check(
      'transactions_import_chk',
      sql`${t.origin} <> 'manual' or (${t.importBatchId} is null and ${t.externalId} is null)`,
    ),
    foreignKey({
      name: 'transactions_import_batch_fk',
      columns: [t.workspaceId, t.importBatchId],
      foreignColumns: [importBatches.workspaceId, importBatches.id],
    }).onDelete('set null'),
    index('transactions_import_batch_idx').on(t.importBatchId).where(sql`${t.importBatchId} is not null`),
    uniqueIndex('transactions_account_external_uq')
      .on(t.workspaceId, t.accountId, t.externalId)
      .where(sql`${t.externalId} is not null`),
    uniqueIndex('transactions_card_external_uq')
      .on(t.workspaceId, t.creditCardId, t.externalId)
      .where(sql`${t.externalId} is not null`),
    // Migration 0008: late-payment interest and fines.
    foreignKey({
      name: 'transactions_late_fee_fk',
      columns: [t.workspaceId, t.lateFeeOf],
      foreignColumns: [t.workspaceId, t.id],
    }).onDelete('cascade'),
    check('transactions_late_fee_kind_chk', sql`${t.lateFeeKind} in ('interest', 'fine')`),
    check('transactions_late_fee_chk', sql`(${t.lateFeeOf} is null) = (${t.lateFeeKind} is null)`),
    index('transactions_late_fee_idx').on(t.lateFeeOf).where(sql`${t.lateFeeOf} is not null`),
    // Migration 0009: fees generated per competence month and their employee charges.
    foreignKey({
      name: 'transactions_fee_of_fk',
      columns: [t.workspaceId, t.feeOf],
      foreignColumns: [t.workspaceId, t.id],
    }).onDelete('cascade'),
    check('transactions_fee_kind_chk', sql`${t.feeKind} in ('fee', 'employees')`),
    check('transactions_fee_competence_chk', sql`${t.feeCompetence} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check('transactions_employees_chk', sql`${t.employees} > 0`),
    // Generated rows are income with a competence; only the employee charge points to a fee and
    // carries the headcount (`is not distinct from`: a NULL kind must not pass the comparison).
    check(
      'transactions_fee_chk',
      sql`(${t.feeKind} is null) = (${t.feeCompetence} is null) and (${t.feeKind} is null or ${t.type} = 'income') and (${t.feeKind} is not distinct from 'employees') = (${t.feeOf} is not null) and (${t.feeOf} is null) = (${t.employees} is null)`,
    ),
    // A client is billed once per competence; a fee has at most one employee charge. The fee_of
    // index also backs the foreign key (fee_of is only set on employee charges, see the CHECK).
    uniqueIndex('transactions_fee_competence_uq')
      .on(t.workspaceId, t.contactId, t.feeCompetence)
      .where(sql`${t.feeKind} = 'fee'`),
    uniqueIndex('transactions_fee_of_uq').on(t.feeOf).where(sql`${t.feeOf} is not null`),
    // Migration 0010: discount for paying a fee by its due date.
    // Only generated fees offer it; 0 is stored as null ("no discount").
    check(
      'transactions_fee_discount_chk',
      sql`${t.feeDiscountBps} is null or (${t.feeDiscountBps} between 1 and 9999 and ${t.feeKind} = 'fee')`,
    ),
    foreignKey({
      name: 'transactions_discount_of_fk',
      columns: [t.workspaceId, t.discountOf],
      foreignColumns: [t.workspaceId, t.id],
    }).onDelete('cascade'),
    // A discount is a plain expense (never a late fee nor a generated fee).
    check(
      'transactions_discount_chk',
      sql`${t.discountOf} is null or (${t.type} = 'expense' and ${t.lateFeeOf} is null and ${t.feeKind} is null)`,
    ),
    // One discount per receivable; also the index the cascade from the receivable uses.
    uniqueIndex('transactions_discount_of_uq').on(t.discountOf).where(sql`${t.discountOf} is not null`),
  ],
);

// ---------------------------------------------------------------------------
// Imports and Open Finance (migration 0005)
// ---------------------------------------------------------------------------

/** One import: a file (OFX/CSV) or one Open Finance sync of one linked account. */
export const importBatches = pgTable(
  'import_batches',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    origin: text().$type<Exclude<TransactionOrigin, 'manual'>>().notNull(),
    format: text().$type<ImportFormat>(),
    fileName: text(),
    connectionId: uuid(),
    accountId: uuid(),
    creditCardId: uuid(),
    invoiceMonth: text(),
    createdCount: integer().notNull().default(0),
    skippedCount: integer().notNull().default(0),
    /** Member who imported (null for webhook-driven syncs and deleted users). */
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    /** Undone (`DELETE /imports/:id`): its transactions were removed; the batch stays as history (0006). */
    undoneAt: timestamptz(),
  },
  (t) => [
    index('import_batches_workspace_idx').on(t.workspaceId, t.createdAt),
    index('import_batches_created_by_idx').on(t.createdBy).where(sql`${t.createdBy} is not null`),
    tenantUnique('import_batches', t),
    check('import_batches_origin_chk', sql`${t.origin} in ('file', 'open_finance')`),
    check('import_batches_format_chk', sql`${t.format} in ('ofx', 'csv')`),
    check('import_batches_file_chk', sql`${t.origin} <> 'file' or (${t.format} is not null and ${t.fileName} is not null)`),
    check('import_batches_counts_chk', sql`${t.createdCount} >= 0 and ${t.skippedCount} >= 0`),
    check('import_batches_target_chk', sql`${t.accountId} is null or ${t.creditCardId} is null`),
    check('import_batches_invoice_month_chk', sql`${t.invoiceMonth} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    foreignKey({
      name: 'import_batches_connection_fk',
      columns: [t.workspaceId, t.connectionId],
      foreignColumns: [bankConnections.workspaceId, bankConnections.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'import_batches_account_fk',
      columns: [t.workspaceId, t.accountId],
      foreignColumns: [accounts.workspaceId, accounts.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'import_batches_credit_card_fk',
      columns: [t.workspaceId, t.creditCardId],
      foreignColumns: [creditCards.workspaceId, creditCards.id],
    }).onDelete('set null'),
  ],
);

/**
 * A read-only bank connection (aggregator "item"). The provider's item id is a bearer reference
 * to the user's bank data at the aggregator: stored encrypted with the workspace key, plus a
 * blind index for lookups.
 */
export const bankConnections = pgTable(
  'bank_connections',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    provider: text().$type<OpenFinanceProvider>().notNull(),
    /** FieldCipher (`bank_connections.provider_item_id`). */
    providerItemId: text().notNull(),
    /** Blind index (HMAC, workspace key) of the provider item id. */
    providerItemHash: text().notNull(),
    institutionName: text().notNull(),
    /** https only (rendered by the web as an image). */
    institutionImageUrl: text(),
    institutionBank: text().$type<BankCode>(),
    status: text().$type<BankConnectionStatus>().notNull(),
    statusDetail: text(),
    consentExpiresAt: timestamptz(),
    lastSyncAt: timestamptz(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    tenantUnique('bank_connections', t),
    uniqueIndex('bank_connections_item_uq').on(t.workspaceId, t.provider, t.providerItemHash),
    index('bank_connections_created_by_idx').on(t.createdBy).where(sql`${t.createdBy} is not null`),
    check('bank_connections_provider_chk', sql`${t.provider} in ('pluggy', 'fake')`),
    check(
      'bank_connections_status_chk',
      sql`${t.status} in ('syncing', 'active', 'login_error', 'waiting_user_input', 'outdated', 'error')`,
    ),
    check('bank_connections_image_url_chk', sql`${t.institutionImageUrl} is null or ${t.institutionImageUrl} ~ '^https://'`),
  ],
);

/** Accounts/cards of a connection, and the local account/card each one feeds. */
export const bankConnectionAccounts = pgTable(
  'bank_connection_accounts',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    connectionId: uuid().notNull(),
    /** FieldCipher (`bank_connection_accounts.provider_account_id`). */
    providerAccountId: text().notNull(),
    providerAccountHash: text().notNull(),
    kind: text().$type<BankAccountKind>().notNull(),
    /** Local account type suggested for 'new' links (bank accounts). */
    accountType: text().$type<'checking' | 'savings'>(),
    name: text().notNull(),
    /** Masked (last digits only). */
    number: text(),
    balance: money(),
    creditLimit: money(),
    cardBrand: text().$type<CardBrand>(),
    closingDay: integer(),
    dueDay: integer(),
    linkedAccountId: uuid(),
    linkedCreditCardId: uuid(),
    syncFrom: calendarDate(),
    lastSyncAt: timestamptz(),
    /** Latest posted transaction date seen (the next sync re-reads a week before it). */
    cursor: text(),
    /** Created by a 'new' link: the first sync sets the initial balance to match the bank. */
    adjustInitialBalance: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    tenantUnique('bank_connection_accounts', t),
    index('bank_connection_accounts_connection_idx').on(t.connectionId),
    uniqueIndex('bank_connection_accounts_provider_uq').on(t.workspaceId, t.connectionId, t.providerAccountHash),
    // One feed per local account/card (two feeds would import the same movements twice).
    uniqueIndex('bank_connection_accounts_linked_account_uq')
      .on(t.workspaceId, t.linkedAccountId)
      .where(sql`${t.linkedAccountId} is not null`),
    uniqueIndex('bank_connection_accounts_linked_card_uq')
      .on(t.workspaceId, t.linkedCreditCardId)
      .where(sql`${t.linkedCreditCardId} is not null`),
    check('bank_connection_accounts_kind_chk', sql`${t.kind} in ('bank', 'credit_card')`),
    check('bank_connection_accounts_account_type_chk', sql`${t.accountType} in ('checking', 'savings')`),
    check(
      'bank_connection_accounts_card_brand_chk',
      sql`${t.cardBrand} in ('visa', 'mastercard', 'elo', 'amex', 'hipercard', 'diners', 'other')`,
    ),
    check(
      'bank_connection_accounts_days_chk',
      sql`(${t.closingDay} is null or ${t.closingDay} between 1 and 31) and (${t.dueDay} is null or ${t.dueDay} between 1 and 31)`,
    ),
    check(
      'bank_connection_accounts_link_chk',
      sql`(${t.kind} = 'bank' or ${t.linkedAccountId} is null) and (${t.kind} = 'credit_card' or ${t.linkedCreditCardId} is null)`,
    ),
    foreignKey({
      name: 'bank_connection_accounts_connection_fk',
      columns: [t.workspaceId, t.connectionId],
      foreignColumns: [bankConnections.workspaceId, bankConnections.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'bank_connection_accounts_account_fk',
      columns: [t.workspaceId, t.linkedAccountId],
      foreignColumns: [accounts.workspaceId, accounts.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'bank_connection_accounts_credit_card_fk',
      columns: [t.workspaceId, t.linkedCreditCardId],
      foreignColumns: [creditCards.workspaceId, creditCards.id],
    }).onDelete('set null'),
  ],
);

/**
 * Open Finance rows the user removed (batch undone or transaction deleted): the next sync — which
 * re-reads a week of history — must not bring them back (migration 0006). Per destination
 * account/card; they go away with it.
 */
export const importTombstones = pgTable(
  'import_tombstones',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    accountId: uuid(),
    creditCardId: uuid(),
    externalId: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    tenantUnique('import_tombstones', t),
    uniqueIndex('import_tombstones_account_uq').on(t.workspaceId, t.accountId, t.externalId).where(sql`${t.accountId} is not null`),
    uniqueIndex('import_tombstones_card_uq').on(t.workspaceId, t.creditCardId, t.externalId).where(sql`${t.creditCardId} is not null`),
    check('import_tombstones_target_chk', sql`num_nonnulls(${t.accountId}, ${t.creditCardId}) = 1`),
    check('import_tombstones_external_id_chk', sql`length(${t.externalId}) between 1 and 200`),
    foreignKey({
      name: 'import_tombstones_account_fk',
      columns: [t.workspaceId, t.accountId],
      foreignColumns: [accounts.workspaceId, accounts.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'import_tombstones_credit_card_fk',
      columns: [t.workspaceId, t.creditCardId],
      foreignColumns: [creditCards.workspaceId, creditCards.id],
    }).onDelete('cascade'),
  ],
);

// Global (no RLS) tables used without a workspace context: Open Finance webhooks arrive with only
// the provider's item id. They hold no personal data.

/** Platform-wide secrets (random keys wrapped by the key provider: KMS in production). */
export const platformKeys = pgTable(
  'platform_keys',
  {
    name: text().primaryKey(),
    /** `KeyProvider.encryptSecret` output. */
    wrappedKey: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [check('platform_keys_name_chk', sql`${t.name} ~ '^[a-z0-9_.:-]{1,64}$'`)],
);

/**
 * Webhook routing: HMAC (platform key) of `provider:itemId` → workspace and connection. Rows go away
 * with the connection (FK cascade), so revoking a connection stops its webhooks.
 */
export const openFinanceItems = pgTable(
  'open_finance_items',
  {
    itemHash: text().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    connectionId: uuid().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('open_finance_items_connection_uq').on(t.workspaceId, t.connectionId),
    foreignKey({
      name: 'open_finance_items_connection_fk',
      columns: [t.workspaceId, t.connectionId],
      foreignColumns: [bankConnections.workspaceId, bankConnections.id],
    }).onDelete('cascade'),
  ],
);

/** Webhook deliveries already received (idempotency by the provider's event id). */
export const openFinanceEvents = pgTable(
  'open_finance_events',
  {
    id: id(),
    provider: text().$type<OpenFinanceProvider>().notNull(),
    eventId: text().notNull(),
    eventType: text().notNull(),
    processedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('open_finance_events_provider_event_uq').on(t.provider, t.eventId),
    index('open_finance_events_created_idx').on(t.createdAt),
    check('open_finance_events_provider_chk', sql`${t.provider} in ('pluggy', 'fake')`),
    check(
      'open_finance_events_size_chk',
      sql`length(${t.eventId}) between 1 and 200 and length(${t.eventType}) between 1 and 100`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Tasks, phase 1 (migration 0011). Tenant tables like the financial ones (RLS, composite keys inside
// the workspace). Members are referenced through `workspace_members (workspace_id, user_id)`: a task can
// only be assigned to a member of its own workspace, and removing the member clears the assignment
// (ON DELETE SET NULL (assignee_id)) or removes what belongs to them (department membership, client
// responsibilities). Authorship (created/concluded/commented by) points to `users`
// with the name recorded at the time, so history survives the person leaving the workspace. Deleting
// the account (users row) clears those ids and, through the triggers of migration 0012
// (`tasks_forget_deleted_user`, `task_comments_forget_deleted_user`), replaces the recorded name with
// "Usuário excluído" (LGPD): the name does not outlive the account.
// ---------------------------------------------------------------------------

const memberFk = (name: string, columns: [AnyPgColumn, AnyPgColumn]) =>
  foreignKey({ name, columns, foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.userId] });

export const taskDepartments = pgTable(
  'task_departments',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    name: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    tenantUnique('task_departments', t),
    uniqueIndex('task_departments_name_uq').on(t.workspaceId, sql`lower(${t.name})`),
    check('task_departments_name_chk', sql`length(${t.name}) between 1 and 80`),
  ],
);

/** Department of each member (at most one). */
export const taskDepartmentMembers = pgTable(
  'task_department_members',
  {
    workspaceId: workspaceRef().notNull(),
    userId: uuid().notNull(),
    departmentId: uuid().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index('task_department_members_department_idx').on(t.workspaceId, t.departmentId),
    memberFk('task_department_members_member_fk', [t.workspaceId, t.userId]).onDelete('cascade'),
    foreignKey({
      name: 'task_department_members_department_fk',
      columns: [t.workspaceId, t.departmentId],
      foreignColumns: [taskDepartments.workspaceId, taskDepartments.id],
    }),
  ],
);

export const taskCategories = pgTable(
  'task_categories',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    name: text().notNull(),
    icon: text().$type<IconName>().notNull().default('tag'),
    color: text().notNull().default('#152B61'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    tenantUnique('task_categories', t),
    uniqueIndex('task_categories_name_uq').on(t.workspaceId, sql`lower(${t.name})`),
    check('task_categories_color_chk', sql`${t.color} ~ '^#[0-9A-Fa-f]{6}$'`),
    // Migration 0012: the contract's limit (taskCategoryInputSchema), like the department name.
    check('task_categories_name_chk', sql`length(${t.name}) between 1 and 60`),
  ],
);

/**
 * Shape of a field encrypted by FieldCipher (`v1.<iv>.<ct>`, base64url without padding: a 12-byte IV
 * is 16 characters; at least 1 byte of text plus the 16-byte tag is 23). Used by the CHECKs of the
 * encrypted task texts (migration 0013).
 */
const ENCRYPTED_TEXT_PATTERN = '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$';
/**
 * Ceiling of an encrypted task text: the contract allows 5000 UTF-16 code units, at most 15000 UTF-8
 * bytes, i.e. 20042 characters of ciphertext; 28000 also covers 5000 four-byte characters (26708).
 */
const ENCRYPTED_TEXT_MAX = 28000;

/** CHECK of an encrypted text column: the `v1.<iv>.<ct>` format (never clear text) and a ceiling. */
const encryptedCheck = (name: string, column: AnyPgColumn, max: number) =>
  check(name, sql`${column} ~ ${sql.raw(`'${ENCRYPTED_TEXT_PATTERN}'`)} and length(${column}) <= ${sql.raw(String(max))}`);

const MONTH_KEY_PATTERN = `'^[0-9]{4}-(0[1-9]|1[0-2])$'`;

// ---------------------------------------------------------------------------
// Tasks, phase 2 (migration 0014): recurring tasks and their occurrences (rows of `tasks`), processes
// and templates, the history of each task, attachments and personal notes. Same tenant pattern.
// ---------------------------------------------------------------------------

/**
 * Recurring task ("tarefa recorrente", Effy's ObligationDef). Its occurrences are rows of `tasks`
 * (one per client and period), generated idempotently (modules/tasks/generation.ts).
 */
export const recurringTasks = pgTable(
  'recurring_tasks',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    name: text().notNull(),
    /** Encrypted with the workspace key (`v1.<iv>.<ct>`, modules/tasks/encrypted-text.ts). */
    description: text(),
    departmentId: uuid(),
    categoryId: uuid(),
    /** Default responsible (clients without a responsible in the department). */
    defaultAssigneeId: uuid(),
    period: text().$type<RecurrencePeriod>().notNull().default('monthly'),
    /** Day of the month (1–31) or, weekly, the ISO weekday (1 = Monday). */
    dueDay: integer().notNull(),
    dueMonth: integer(),
    targetDaysBefore: integer().notNull().default(0),
    nonBusinessDayRule: text().$type<NonBusinessDayRule>().notNull().default('anticipate'),
    referenceOffset: integer().notNull().default(1),
    regimes: text().array().$type<TaxRegime[]>().notNull().default(sql`'{}'::text[]`),
    startCompetence: text().$type<MonthKey>().notNull(),
    endCompetence: text().$type<MonthKey>(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdByName: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    tenantUnique('recurring_tasks', t),
    index('recurring_tasks_department_idx').on(t.workspaceId, t.departmentId),
    index('recurring_tasks_category_idx').on(t.workspaceId, t.categoryId),
    index('recurring_tasks_assignee_idx').on(t.workspaceId, t.defaultAssigneeId),
    index('recurring_tasks_created_by_idx').on(t.createdBy).where(sql`${t.createdBy} is not null`),
    check('recurring_tasks_name_chk', sql`length(${t.name}) between 1 and 200`),
    check('recurring_tasks_created_by_name_chk', sql`length(${t.createdByName}) between 1 and 120`),
    encryptedCheck('recurring_tasks_description_chk', t.description, ENCRYPTED_TEXT_MAX),
    check('recurring_tasks_period_chk', sql`${t.period} in ('weekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual')`),
    check('recurring_tasks_rule_chk', sql`${t.nonBusinessDayRule} in ('anticipate', 'postpone', 'keep')`),
    check(
      'recurring_tasks_schedule_chk',
      sql`(${t.period} = 'weekly' and ${t.dueDay} between 1 and 7 and ${t.dueMonth} is null and ${t.targetDaysBefore} between 0 and 6 and ${t.referenceOffset} = 0) or (${t.period} = 'monthly' and ${t.dueDay} between 1 and 31 and ${t.dueMonth} is null) or (${t.period} in ('bimonthly', 'quarterly', 'semiannual', 'annual') and ${t.dueDay} between 1 and 31 and ${t.dueMonth} is not null and ${t.dueMonth} between 1 and 12)`,
    ),
    check('recurring_tasks_target_chk', sql`${t.targetDaysBefore} between 0 and 30`),
    check('recurring_tasks_reference_chk', sql`${t.referenceOffset} between 0 and 12`),
    check(
      'recurring_tasks_regimes_chk',
      sql`${t.regimes} <@ array['simples_nacional', 'mei', 'presumed_profit', 'real_profit', 'exempt', 'other']::text[] and cardinality(${t.regimes}) <= 6`,
    ),
    check(
      'recurring_tasks_competence_chk',
      sql`${t.startCompetence} ~ ${sql.raw(MONTH_KEY_PATTERN)} and (${t.endCompetence} is null or (${t.endCompetence} ~ ${sql.raw(MONTH_KEY_PATTERN)} and ${t.endCompetence} >= ${t.startCompetence}))`,
    ),
    foreignKey({
      name: 'recurring_tasks_department_fk',
      columns: [t.workspaceId, t.departmentId],
      foreignColumns: [taskDepartments.workspaceId, taskDepartments.id],
    }),
    foreignKey({
      name: 'recurring_tasks_category_fk',
      columns: [t.workspaceId, t.categoryId],
      foreignColumns: [taskCategories.workspaceId, taskCategories.id],
    }).onDelete('set null'),
    memberFk('recurring_tasks_assignee_fk', [t.workspaceId, t.defaultAssigneeId]).onDelete('set null'),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    title: text().notNull(),
    /** Encrypted with the workspace key (`v1.<iv>.<ct>`, modules/tasks/encrypted-text.ts; migration 0013). */
    description: text(),
    /** null = internal task (no client). */
    clientId: uuid(),
    /**
     * Always 'client' (generated, migration 0012): third column of the foreign key to
     * `contacts (workspace_id, id, kind)`, so a task can never point to a supplier.
     */
    clientKind: text()
      .$type<'client'>()
      .generatedAlwaysAs(sql`'client'`),
    /** The assignee's department (derived by the API), or the queue of an unassigned task. */
    departmentId: uuid(),
    categoryId: uuid(),
    assigneeId: uuid(),
    priority: text().$type<TaskPriority>().notNull().default('medium'),
    status: text().$type<TaskStatus>().notNull().default('todo'),
    /** Open status before concluding/canceling: where "Reabrir" goes back to. */
    reopenStatus: text().$type<OpenTaskStatus>(),
    startDate: calendarDate(),
    dueDate: calendarDate(),
    /** Wall-clock "HH:MM" of an appointment on the due date (no time zone on purpose). */
    startTime: text(),
    endTime: text(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdByName: text().notNull(),
    /** Who concluded it and when (server-side, on the transition to `done`; cleared when leaving it). */
    completedAt: timestamptz(),
    completedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    completedByName: text(),
    /** Recurring occurrence (migration 0014): the recurring task, its period and deadlines. */
    recurringTaskId: uuid(),
    /** Month the (nominal) legal deadline falls in: the audit column. */
    competence: text().$type<MonthKey>(),
    /** The competence, or the Monday (`YYYY-MM-DD`) of a weekly occurrence: identity with the client. */
    periodKey: text(),
    referenceMonth: text().$type<MonthKey>(),
    /** Internal target ("meta"); the legal deadline is `due_date`. */
    targetDate: calendarDate(),
    /** Where the responsible of an occurrence came from ('manual' = only this competence). */
    assigneeSource: text().$type<AssigneeSource>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    tenantUnique('tasks', t),
    // Migration 0014: one occurrence per recurring task, client and period (the generation's ON
    // CONFLICT target; standalone tasks have nulls there and never conflict).
    unique('tasks_occurrence_uq').on(t.workspaceId, t.recurringTaskId, t.clientId, t.periodKey),
    index('tasks_recurring_idx').on(t.workspaceId, t.recurringTaskId, t.competence),
    index('tasks_competence_idx').on(t.workspaceId, t.competence).where(sql`${t.recurringTaskId} is not null`),
    // Migration 0016: the calendar aggregates occurrences by target date (a range per request).
    index('tasks_occurrence_target_idx').on(t.workspaceId, t.targetDate).where(sql`${t.recurringTaskId} is not null`),
    check(
      'tasks_occurrence_chk',
      sql`(${t.recurringTaskId} is null and ${t.competence} is null and ${t.periodKey} is null and ${t.referenceMonth} is null and ${t.targetDate} is null and ${t.assigneeSource} is null) or (${t.recurringTaskId} is not null and ${t.clientId} is not null and ${t.dueDate} is not null and ${t.targetDate} is not null and ${t.targetDate} <= ${t.dueDate} and ${t.competence} is not null and ${t.competence} ~ ${sql.raw(MONTH_KEY_PATTERN)} and ${t.referenceMonth} is not null and ${t.referenceMonth} ~ ${sql.raw(MONTH_KEY_PATTERN)} and ${t.periodKey} is not null and ${t.periodKey} ~ '^[0-9]{4}-(0[1-9]|1[0-2])(-[0-9]{2})?$' and (${t.assigneeSource} is null or ${t.assigneeSource} in ('manual', 'client', 'default')))`,
    ),
    index('tasks_due_idx').on(t.workspaceId, t.dueDate),
    index('tasks_assignee_idx').on(t.workspaceId, t.assigneeId),
    index('tasks_department_idx').on(t.workspaceId, t.departmentId),
    index('tasks_client_idx').on(t.workspaceId, t.clientId),
    index('tasks_category_idx').on(t.workspaceId, t.categoryId),
    index('tasks_created_by_idx').on(t.createdBy).where(sql`${t.createdBy} is not null`),
    index('tasks_completed_by_idx').on(t.completedBy).where(sql`${t.completedBy} is not null`),
    // Migration 0012: open tasks are a small, hot slice of a history that only grows. "Minhas", the
    // start page's `mine`, the assignee/client summaries and moving a member's open tasks read
    // (workspace, assignee); "Meu departamento" and the open totals read (workspace, department). The
    // predicate is spelled exactly like `OPEN_SQL` (modules/tasks/task-rows.ts), so the planner matches it.
    index('tasks_open_assignee_idx')
      .on(t.workspaceId, t.assigneeId, t.dueDate)
      .where(sql`${t.status} in ('todo', 'in_progress', 'waiting_client')`),
    index('tasks_open_department_idx')
      .on(t.workspaceId, t.departmentId, t.dueDate)
      .where(sql`${t.status} in ('todo', 'in_progress', 'waiting_client')`),
    check('tasks_title_chk', sql`length(${t.title}) between 1 and 200`),
    // Migration 0012: recorded names (copies of users.name, 80 in the contract; users has no CHECK, so
    // some slack: the copy must never stop a member from working).
    check(
      'tasks_people_names_chk',
      sql`length(${t.createdByName}) between 1 and 120 and length(${t.completedByName}) between 1 and 120`,
    ),
    // Migration 0013 (replaces 0012's 1–5000): the description is encrypted, so the database checks the
    // format (`v1.<iv>.<ct>`: never clear text) and bounds the ciphertext; the 5000-character limit is
    // the contract's (taskInputSchema.description). Empty text is stored as null.
    check('tasks_description_chk', sql`${t.description} ~ ${sql.raw(`'${ENCRYPTED_TEXT_PATTERN}'`)} and length(${t.description}) <= ${sql.raw(String(ENCRYPTED_TEXT_MAX))}`),
    check('tasks_status_chk', sql`${t.status} in ('todo', 'in_progress', 'waiting_client', 'done', 'canceled')`),
    check('tasks_reopen_status_chk', sql`${t.reopenStatus} in ('todo', 'in_progress', 'waiting_client')`),
    check('tasks_priority_chk', sql`${t.priority} in ('low', 'medium', 'high', 'urgent')`),
    check(
      'tasks_time_chk',
      sql`(${t.startTime} is null or ${t.startTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') and (${t.endTime} is null or (${t.endTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${t.startTime} is not null and ${t.endTime} > ${t.startTime})) and (${t.startTime} is null or ${t.dueDate} is not null)`,
    ),
    check('tasks_dates_chk', sql`${t.startDate} is null or ${t.dueDate} is null or ${t.startDate} <= ${t.dueDate}`),
    check(
      'tasks_completion_chk',
      sql`(${t.status} = 'done') = (${t.completedAt} is not null) and (${t.completedAt} is null or ${t.completedByName} is not null)`,
    ),
    foreignKey({
      name: 'tasks_client_fk',
      columns: [t.workspaceId, t.clientId, t.clientKind],
      foreignColumns: [contacts.workspaceId, contacts.id, contacts.kind],
    }),
    foreignKey({
      name: 'tasks_department_fk',
      columns: [t.workspaceId, t.departmentId],
      foreignColumns: [taskDepartments.workspaceId, taskDepartments.id],
    }),
    foreignKey({
      name: 'tasks_category_fk',
      columns: [t.workspaceId, t.categoryId],
      foreignColumns: [taskCategories.workspaceId, taskCategories.id],
    }).onDelete('set null'),
    memberFk('tasks_assignee_fk', [t.workspaceId, t.assigneeId]).onDelete('set null'),
    foreignKey({
      name: 'tasks_recurring_fk',
      columns: [t.workspaceId, t.recurringTaskId],
      foreignColumns: [recurringTasks.workspaceId, recurringTasks.id],
    }),
  ],
);

export const taskSubtasks = pgTable(
  'task_subtasks',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    taskId: uuid().notNull(),
    title: text().notNull(),
    done: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    tenantUnique('task_subtasks', t),
    index('task_subtasks_task_idx').on(t.workspaceId, t.taskId),
    check('task_subtasks_title_chk', sql`length(${t.title}) between 1 and 200`),
    foreignKey({ name: 'task_subtasks_task_fk', columns: [t.workspaceId, t.taskId], foreignColumns: [tasks.workspaceId, tasks.id] }).onDelete(
      'cascade',
    ),
  ],
);

export const taskComments = pgTable(
  'task_comments',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    taskId: uuid().notNull(),
    authorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    authorName: text().notNull(),
    /** Encrypted with the workspace key (`v1.<iv>.<ct>`, modules/tasks/encrypted-text.ts; migration 0013). */
    text: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    tenantUnique('task_comments', t),
    index('task_comments_task_idx').on(t.workspaceId, t.taskId, t.createdAt),
    index('task_comments_author_idx').on(t.authorId).where(sql`${t.authorId} is not null`),
    // Migration 0012: recent activity (`GET /tasks/activity`, last 5 days) without reading every comment.
    index('task_comments_recent_idx').on(t.workspaceId, t.createdAt),
    // Migration 0013 (replaces 1–5000): encrypted, like tasks_description_chk.
    check('task_comments_text_chk', sql`${t.text} ~ ${sql.raw(`'${ENCRYPTED_TEXT_PATTERN}'`)} and length(${t.text}) <= ${sql.raw(String(ENCRYPTED_TEXT_MAX))}`),
    // Migration 0012: recorded name of the author (see tasks_people_names_chk).
    check('task_comments_author_name_chk', sql`length(${t.authorName}) between 1 and 120`),
    foreignKey({ name: 'task_comments_task_fk', columns: [t.workspaceId, t.taskId], foreignColumns: [tasks.workspaceId, tasks.id] }).onDelete(
      'cascade',
    ),
  ],
);

/**
 * Responsible member of a client in a department ("carteira"): suggested as the assignee of a task of
 * that client in the department, and the responsible of the client's recurring work (later phase).
 */
export const taskClientResponsibles = pgTable(
  'task_client_responsibles',
  {
    workspaceId: workspaceRef().notNull(),
    clientId: uuid().notNull(),
    /** Always 'client' (generated, migration 0012): the foreign key only accepts clients. */
    clientKind: text()
      .$type<'client'>()
      .generatedAlwaysAs(sql`'client'`),
    departmentId: uuid().notNull(),
    userId: uuid().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'task_client_responsibles_pk', columns: [t.workspaceId, t.clientId, t.departmentId] }),
    index('task_client_responsibles_department_idx').on(t.workspaceId, t.departmentId),
    index('task_client_responsibles_user_idx').on(t.workspaceId, t.userId),
    foreignKey({
      name: 'task_client_responsibles_client_fk',
      columns: [t.workspaceId, t.clientId, t.clientKind],
      foreignColumns: [contacts.workspaceId, contacts.id, contacts.kind],
    }).onDelete('cascade'),
    foreignKey({
      name: 'task_client_responsibles_department_fk',
      columns: [t.workspaceId, t.departmentId],
      foreignColumns: [taskDepartments.workspaceId, taskDepartments.id],
    }).onDelete('cascade'),
    memberFk('task_client_responsibles_member_fk', [t.workspaceId, t.userId]).onDelete('cascade'),
  ],
);

/** Clients chosen by hand for a recurring task (`include`) and the exceptions of its regimes (`exclude`). */
export const recurringTaskClients = pgTable(
  'recurring_task_clients',
  {
    workspaceId: workspaceRef().notNull(),
    recurringTaskId: uuid().notNull(),
    clientId: uuid().notNull(),
    /** Always 'client' (generated): the foreign key only accepts clients. */
    clientKind: text()
      .$type<'client'>()
      .generatedAlwaysAs(sql`'client'`),
    mode: text().$type<'include' | 'exclude'>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'recurring_task_clients_pk', columns: [t.workspaceId, t.recurringTaskId, t.clientId] }),
    index('recurring_task_clients_client_idx').on(t.workspaceId, t.clientId),
    check('recurring_task_clients_mode_chk', sql`${t.mode} in ('include', 'exclude')`),
    foreignKey({
      name: 'recurring_task_clients_task_fk',
      columns: [t.workspaceId, t.recurringTaskId],
      foreignColumns: [recurringTasks.workspaceId, recurringTasks.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'recurring_task_clients_client_fk',
      columns: [t.workspaceId, t.clientId, t.clientKind],
      foreignColumns: [contacts.workspaceId, contacts.id, contacts.kind],
    }).onDelete('cascade'),
  ],
);

/** Template of a process ("modelo de processo"): relative deadlines, no client. */
export const taskFlowTemplates = pgTable(
  'task_flow_templates',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    title: text().notNull(),
    /** Encrypted with the workspace key. */
    description: text(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdByName: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    tenantUnique('task_flow_templates', t),
    index('task_flow_templates_created_by_idx').on(t.createdBy).where(sql`${t.createdBy} is not null`),
    check('task_flow_templates_title_chk', sql`length(${t.title}) between 1 and 200`),
    check('task_flow_templates_created_by_name_chk', sql`length(${t.createdByName}) between 1 and 120`),
    encryptedCheck('task_flow_templates_description_chk', t.description, ENCRYPTED_TEXT_MAX),
  ],
);

export const taskFlowTemplateSteps = pgTable(
  'task_flow_template_steps',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    templateId: uuid().notNull(),
    position: integer().notNull(),
    title: text().notNull(),
    /** Encrypted with the workspace key. */
    description: text(),
    departmentId: uuid(),
    categoryId: uuid(),
    assigneeId: uuid(),
    priority: text().$type<TaskPriority>().notNull().default('medium'),
    relativeDays: integer().notNull().default(0),
  },
  (t) => [
    tenantUnique('task_flow_template_steps', t),
    unique('task_flow_template_steps_position_uq').on(t.workspaceId, t.templateId, t.position),
    index('task_flow_template_steps_department_idx').on(t.workspaceId, t.departmentId),
    index('task_flow_template_steps_category_idx').on(t.workspaceId, t.categoryId),
    index('task_flow_template_steps_assignee_idx').on(t.workspaceId, t.assigneeId),
    check('task_flow_template_steps_title_chk', sql`length(${t.title}) between 1 and 200`),
    check('task_flow_template_steps_position_chk', sql`${t.position} between 1 and 30`),
    check('task_flow_template_steps_days_chk', sql`${t.relativeDays} between 0 and 365`),
    check('task_flow_template_steps_priority_chk', sql`${t.priority} in ('low', 'medium', 'high', 'urgent')`),
    encryptedCheck('task_flow_template_steps_description_chk', t.description, ENCRYPTED_TEXT_MAX),
    foreignKey({
      name: 'task_flow_template_steps_template_fk',
      columns: [t.workspaceId, t.templateId],
      foreignColumns: [taskFlowTemplates.workspaceId, taskFlowTemplates.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'task_flow_template_steps_department_fk',
      columns: [t.workspaceId, t.departmentId],
      foreignColumns: [taskDepartments.workspaceId, taskDepartments.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'task_flow_template_steps_category_fk',
      columns: [t.workspaceId, t.categoryId],
      foreignColumns: [taskCategories.workspaceId, taskCategories.id],
    }).onDelete('set null'),
    memberFk('task_flow_template_steps_assignee_fk', [t.workspaceId, t.assigneeId]).onDelete('set null'),
  ],
);

/** A process ("processo", Effy's TaskFlow): only the active step is a real task. */
export const taskFlows = pgTable(
  'task_flows',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    title: text().notNull(),
    clientId: uuid(),
    /** Always 'client' (generated): the foreign key only accepts clients. */
    clientKind: text()
      .$type<'client'>()
      .generatedAlwaysAs(sql`'client'`),
    templateId: uuid(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdByName: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    tenantUnique('task_flows', t),
    index('task_flows_client_idx').on(t.workspaceId, t.clientId),
    index('task_flows_template_idx').on(t.workspaceId, t.templateId),
    index('task_flows_created_by_idx').on(t.createdBy).where(sql`${t.createdBy} is not null`),
    check('task_flows_title_chk', sql`length(${t.title}) between 1 and 200`),
    check('task_flows_created_by_name_chk', sql`length(${t.createdByName}) between 1 and 120`),
    foreignKey({
      name: 'task_flows_client_fk',
      columns: [t.workspaceId, t.clientId, t.clientKind],
      foreignColumns: [contacts.workspaceId, contacts.id, contacts.kind],
    }),
    foreignKey({
      name: 'task_flows_template_fk',
      columns: [t.workspaceId, t.templateId],
      foreignColumns: [taskFlowTemplates.workspaceId, taskFlowTemplates.id],
    }).onDelete('set null'),
  ],
);

export const taskFlowSteps = pgTable(
  'task_flow_steps',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    flowId: uuid().notNull(),
    position: integer().notNull(),
    title: text().notNull(),
    /** Encrypted with the workspace key. */
    description: text(),
    clientId: uuid(),
    clientKind: text()
      .$type<'client'>()
      .generatedAlwaysAs(sql`'client'`),
    departmentId: uuid(),
    categoryId: uuid(),
    assigneeId: uuid(),
    priority: text().$type<TaskPriority>().notNull().default('medium'),
    /** Absolute deadline (built by hand) or, once activated, the computed one. */
    dueDate: calendarDate(),
    relativeDays: integer(),
    /** The task created when the step was activated (once). */
    taskId: uuid(),
    activatedAt: timestamptz(),
    /** When its task was first concluded: recorded once (the base of the next step's deadline). */
    completedAt: timestamptz(),
  },
  (t) => [
    tenantUnique('task_flow_steps', t),
    unique('task_flow_steps_position_uq').on(t.workspaceId, t.flowId, t.position),
    unique('task_flow_steps_task_uq').on(t.workspaceId, t.taskId),
    index('task_flow_steps_client_idx').on(t.workspaceId, t.clientId),
    index('task_flow_steps_department_idx').on(t.workspaceId, t.departmentId),
    index('task_flow_steps_category_idx').on(t.workspaceId, t.categoryId),
    index('task_flow_steps_assignee_idx').on(t.workspaceId, t.assigneeId),
    check('task_flow_steps_title_chk', sql`length(${t.title}) between 1 and 200`),
    check('task_flow_steps_position_chk', sql`${t.position} between 1 and 30`),
    check('task_flow_steps_days_chk', sql`${t.relativeDays} is null or ${t.relativeDays} between 0 and 365`),
    check('task_flow_steps_priority_chk', sql`${t.priority} in ('low', 'medium', 'high', 'urgent')`),
    check('task_flow_steps_activation_chk', sql`(${t.taskId} is null or ${t.activatedAt} is not null) and (${t.completedAt} is null or ${t.activatedAt} is not null)`),
    encryptedCheck('task_flow_steps_description_chk', t.description, ENCRYPTED_TEXT_MAX),
    foreignKey({
      name: 'task_flow_steps_flow_fk',
      columns: [t.workspaceId, t.flowId],
      foreignColumns: [taskFlows.workspaceId, taskFlows.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'task_flow_steps_client_fk',
      columns: [t.workspaceId, t.clientId, t.clientKind],
      foreignColumns: [contacts.workspaceId, contacts.id, contacts.kind],
    }),
    foreignKey({
      name: 'task_flow_steps_department_fk',
      columns: [t.workspaceId, t.departmentId],
      foreignColumns: [taskDepartments.workspaceId, taskDepartments.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'task_flow_steps_category_fk',
      columns: [t.workspaceId, t.categoryId],
      foreignColumns: [taskCategories.workspaceId, taskCategories.id],
    }).onDelete('set null'),
    memberFk('task_flow_steps_assignee_fk', [t.workspaceId, t.assigneeId]).onDelete('set null'),
    foreignKey({
      name: 'task_flow_steps_task_fk',
      columns: [t.workspaceId, t.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete('set null'),
  ],
);

/**
 * History of a task ("linha do tempo"), written by the services. `data` holds only structured,
 * non-sensitive facts (field names, statuses, member ids and names as recorded); free text (a reopening
 * reason, a file name) goes encrypted in `note`.
 */
export const taskEvents = pgTable(
  'task_events',
  {
    id: id(),
    /** Order of the entries (several are written in the same instant, e.g. "created" + "flow_step"). */
    seq: bigint({ mode: 'number' }).notNull().generatedAlwaysAsIdentity(),
    workspaceId: workspaceRef().notNull(),
    taskId: uuid().notNull(),
    kind: text().$type<TaskEventKind>().notNull(),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** Name of the actor at the time; null = the system. */
    actorName: text(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    /** Encrypted with the workspace key. */
    note: text(),
    /**
     * Migration 0016 (LGPD): ids of `data.fromAssignee`/`data.toAssignee`, filled by a trigger from `data`
     * (the API writes only `data`). Deleting the account clears them and a trigger replaces that side of
     * `data` with "Usuário excluído".
     */
    fromAssigneeId: uuid().references(() => users.id, { onDelete: 'set null' }),
    toAssigneeId: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    tenantUnique('task_events', t),
    index('task_events_task_idx').on(t.workspaceId, t.taskId, t.seq),
    index('task_events_actor_idx').on(t.actorId).where(sql`${t.actorId} is not null`),
    index('task_events_from_assignee_idx').on(t.fromAssigneeId).where(sql`${t.fromAssigneeId} is not null`),
    index('task_events_to_assignee_idx').on(t.toAssigneeId).where(sql`${t.toAssigneeId} is not null`),
    check(
      'task_events_kind_chk',
      sql`${t.kind} in ('created', 'updated', 'assigned', 'status', 'reopened', 'commented', 'comment_removed', 'attachment_added', 'attachment_removed', 'flow_step')`,
    ),
    check('task_events_actor_name_chk', sql`length(${t.actorName}) between 1 and 120`),
    check('task_events_data_chk', sql`jsonb_typeof(${t.data}) = 'object' and length(${t.data}::text) <= 4000`),
    encryptedCheck('task_events_note_chk', t.note, ENCRYPTED_TEXT_MAX),
    foreignKey({
      name: 'task_events_task_fk',
      columns: [t.workspaceId, t.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete('cascade'),
  ],
);

/** Binary column (bytea): postgres-js returns a Buffer, PGlite a Uint8Array — both are Uint8Array. */
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({ dataType: () => 'bytea' });

/**
 * Attachment of a task, stored in the database (no file storage to run): the content encrypted with
 * the workspace key (AES-256-GCM: 12-byte IV + ciphertext + 16-byte tag, AAD bound to the workspace,
 * the table and the attachment id), the name encrypted like any free text.
 */
export const taskAttachments = pgTable(
  'task_attachments',
  {
    id: uuid().primaryKey(),
    workspaceId: workspaceRef().notNull(),
    taskId: uuid().notNull(),
    /** Encrypted with the workspace key. */
    fileName: text().notNull(),
    contentType: text().$type<TaskAttachmentType>().notNull(),
    sizeBytes: integer().notNull(),
    content: bytea().notNull(),
    uploadedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    uploadedByName: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    tenantUnique('task_attachments', t),
    index('task_attachments_task_idx').on(t.workspaceId, t.taskId, t.createdAt),
    index('task_attachments_uploaded_by_idx').on(t.uploadedBy).where(sql`${t.uploadedBy} is not null`),
    encryptedCheck('task_attachments_file_name_chk', t.fileName, 2000),
    check(
      'task_attachments_type_chk',
      sql`${t.contentType} in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/xml', 'text/plain', 'text/csv', 'application/zip')`,
    ),
    check('task_attachments_size_chk', sql`${t.sizeBytes} between 1 and 10485760 and octet_length(${t.content}) = ${t.sizeBytes} + 28`),
    check('task_attachments_uploaded_by_name_chk', sql`length(${t.uploadedByName}) between 1 and 120`),
    foreignKey({
      name: 'task_attachments_task_fk',
      columns: [t.workspaceId, t.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete('cascade'),
  ],
);

/** Personal note ("Minhas anotações", Effy's UserNote): private to its author, title and text encrypted. */
export const taskNotes = pgTable(
  'task_notes',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    userId: uuid().notNull(),
    /** Encrypted with the workspace key. */
    title: text().notNull(),
    /** Encrypted with the workspace key. */
    content: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    tenantUnique('task_notes', t),
    index('task_notes_user_idx').on(t.workspaceId, t.userId, t.updatedAt),
    encryptedCheck('task_notes_title_chk', t.title, 2000),
    // 20000 UTF-16 units are at most 60000 UTF-8 bytes: ~80 thousand characters of ciphertext.
    encryptedCheck('task_notes_content_chk', t.content, 81000),
    memberFk('task_notes_member_fk', [t.workspaceId, t.userId]).onDelete('cascade'),
  ],
);

// ---------------------------------------------------------------------------
// Phase 3 (migration 0015): clients' documents, unions and collective agreements, the office, profile
// photos. Same tenant pattern as 0004–0014 (photos are identity data, outside RLS).
// ---------------------------------------------------------------------------

/** Document with expiry date of a client (Effy's CompanyReport); the note encrypted like free text. */
export const clientDocuments = pgTable(
  'client_documents',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    clientId: uuid().notNull(),
    /** Always 'client' (generated): the foreign key only accepts clients. */
    clientKind: text()
      .$type<'client'>()
      .generatedAlwaysAs(sql`'client'`),
    kind: text().$type<ClientDocumentKind>().notNull(),
    /** Name of an "Outro…" document (null for the catalog kinds). */
    customName: text(),
    expiresAt: calendarDate(),
    /** Encrypted with the workspace key. */
    note: text(),
    updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    updatedByName: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    tenantUnique('client_documents', t),
    index('client_documents_client_idx').on(t.workspaceId, t.clientId),
    index('client_documents_expires_idx').on(t.workspaceId, t.expiresAt).where(sql`${t.expiresAt} is not null`),
    index('client_documents_updated_by_idx').on(t.updatedBy).where(sql`${t.updatedBy} is not null`),
    check(
      'client_documents_kind_chk',
      sql`${t.kind} in ('digital_certificate', 'cnd_federal', 'cnd_state', 'cnd_municipal', 'crf_fgts', 'cndt', 'operating_license', 'sanitary_license', 'fire_certificate', 'environmental_license', 'pcmso', 'pgr', 'ltcat', 'professional_registration', 'other')`,
    ),
    check(
      'client_documents_name_chk',
      sql`(${t.kind} = 'other') = (${t.customName} is not null) and length(${t.customName}) between 1 and 80`,
    ),
    encryptedCheck('client_documents_note_chk', t.note, 2000),
    check('client_documents_updated_by_name_chk', sql`length(${t.updatedByName}) between 1 and 120`),
    foreignKey({
      name: 'client_documents_client_fk',
      columns: [t.workspaceId, t.clientId, t.clientKind],
      foreignColumns: [contacts.workspaceId, contacts.id, contacts.kind],
    }).onDelete('cascade'),
  ],
);

/**
 * Union (sindicato, Effy's Union): public data of the entity in clear (searchable); the responsible
 * person's contact and the notes encrypted. The base month (1–12) renews the agreement every year.
 */
export const unions = pgTable(
  'unions',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    name: text().notNull(),
    /** CNPJ, digits (public, unique in the workspace). */
    document: text().notNull(),
    acronym: text(),
    category: text(),
    territory: text(),
    zipCode: text(),
    street: text(),
    number: text(),
    complement: text(),
    district: text(),
    city: text(),
    state: text(),
    phone: text(),
    email: text(),
    website: text(),
    /** Encrypted. */
    responsibleName: text(),
    responsibleRole: text(),
    /** Encrypted. */
    responsibleEmail: text(),
    /** Encrypted. */
    responsiblePhone: text(),
    baseMonth: integer(),
    /** Encrypted. */
    notes: text(),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    tenantUnique('unions', t),
    uniqueIndex('unions_document_uq').on(t.workspaceId, t.document),
    index('unions_name_idx').on(t.workspaceId, t.active, t.name),
    check('unions_name_chk', sql`length(${t.name}) between 1 and 200`),
    check('unions_document_chk', sql`${t.document} ~ '^[0-9]{14}$'`),
    check('unions_base_month_chk', sql`${t.baseMonth} between 1 and 12`),
    check(
      'unions_lengths_chk',
      sql`length(${t.acronym}) <= 30 and length(${t.category}) <= 120 and length(${t.territory}) <= 300 and length(${t.responsibleRole}) <= 120 and length(${t.website}) <= 300`,
    ),
    check('unions_state_chk', sql`${t.state} ~ '^[A-Z]{2}$'`),
    encryptedCheck('unions_responsible_name_chk', t.responsibleName, 2000),
    encryptedCheck('unions_responsible_email_chk', t.responsibleEmail, 2000),
    encryptedCheck('unions_responsible_phone_chk', t.responsiblePhone, 2000),
    encryptedCheck('unions_notes_chk', t.notes, 28000),
  ],
);

/** One collective agreement cycle per year ("Convenção Coletiva 2026/2027"), marked as published. */
export const unionConventions = pgTable(
  'union_conventions',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    unionId: uuid().notNull(),
    year: integer().notNull(),
    published: boolean().notNull().default(false),
    publishedAt: timestamptz(),
    publishedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    publishedByName: text(),
    /** Encrypted. */
    note: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    tenantUnique('union_conventions', t),
    uniqueIndex('union_conventions_year_uq').on(t.workspaceId, t.unionId, t.year),
    index('union_conventions_published_by_idx').on(t.publishedBy).where(sql`${t.publishedBy} is not null`),
    check('union_conventions_year_chk', sql`${t.year} between 2000 and 2100`),
    check(
      'union_conventions_published_chk',
      sql`${t.published} = (${t.publishedAt} is not null) and (${t.publishedByName} is null or length(${t.publishedByName}) between 1 and 120) and (${t.published} or ${t.publishedByName} is null)`,
    ),
    encryptedCheck('union_conventions_note_chk', t.note, 4000),
    foreignKey({
      name: 'union_conventions_union_fk',
      columns: [t.workspaceId, t.unionId],
      foreignColumns: [unions.workspaceId, unions.id],
    }).onDelete('cascade'),
  ],
);

/** Clients whose employees follow the union's agreement (N:N). */
export const unionClients = pgTable(
  'union_clients',
  {
    workspaceId: workspaceRef().notNull(),
    unionId: uuid().notNull(),
    clientId: uuid().notNull(),
    clientKind: text()
      .$type<'client'>()
      .generatedAlwaysAs(sql`'client'`),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'union_clients_pk', columns: [t.workspaceId, t.unionId, t.clientId] }),
    index('union_clients_client_idx').on(t.workspaceId, t.clientId),
    foreignKey({
      name: 'union_clients_union_fk',
      columns: [t.workspaceId, t.unionId],
      foreignColumns: [unions.workspaceId, unions.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'union_clients_client_fk',
      columns: [t.workspaceId, t.clientId, t.clientKind],
      foreignColumns: [contacts.workspaceId, contacts.id, contacts.kind],
    }).onDelete('cascade'),
  ],
);

/**
 * The office that runs the workspace (Effy's Office): one row per workspace. The responsible's CPF,
 * e-mail and phone and the Pix key are encrypted; logo and watermark are images checked by signature.
 * `contract_blocks` null = the factory template; `contract_watermark` null = the factory watermark.
 */
export const offices = pgTable(
  'offices',
  {
    id: id(),
    workspaceId: workspaceRef().notNull(),
    document: text(),
    legalName: text(),
    tradeName: text(),
    stateRegistration: text(),
    municipalRegistration: text(),
    zipCode: text(),
    street: text(),
    number: text(),
    complement: text(),
    district: text(),
    city: text(),
    state: text(),
    phone: text(),
    email: text(),
    website: text(),
    responsibleName: text(),
    /** Encrypted. */
    responsibleDocument: text(),
    /** Encrypted. */
    responsibleEmail: text(),
    /** Encrypted. */
    responsiblePhone: text(),
    pixKeyType: text().$type<PixKeyType>(),
    /** Encrypted. */
    pixKey: text(),
    logo: bytea(),
    logoType: text().$type<OfficeImageContentType>(),
    contractBlocks: jsonb().$type<ContractBlock[]>(),
    contractWatermark: bytea(),
    contractWatermarkType: text().$type<OfficeImageContentType>(),
    contractWatermarkEnabled: boolean().notNull().default(true),
    contractUpdatedAt: timestamptz(),
    contractUpdatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    contractUpdatedByName: text(),
    updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    updatedByName: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    tenantUnique('offices', t),
    uniqueIndex('offices_workspace_uq').on(t.workspaceId),
    index('offices_updated_by_idx').on(t.updatedBy).where(sql`${t.updatedBy} is not null`),
    index('offices_contract_updated_by_idx').on(t.contractUpdatedBy).where(sql`${t.contractUpdatedBy} is not null`),
    check('offices_document_chk', sql`${t.document} ~ '^[0-9]{14}$'`),
    check('offices_names_chk', sql`length(${t.legalName}) between 1 and 200 and length(${t.tradeName}) <= 200 and length(${t.responsibleName}) <= 200`),
    check('offices_state_chk', sql`${t.state} ~ '^[A-Z]{2}$'`),
    check('offices_pix_chk', sql`${t.pixKeyType} in ('cnpj', 'cpf', 'email', 'phone', 'random') and (${t.pixKey} is null) = (${t.pixKeyType} is null)`),
    encryptedCheck('offices_responsible_document_chk', t.responsibleDocument, 2000),
    encryptedCheck('offices_responsible_email_chk', t.responsibleEmail, 2000),
    encryptedCheck('offices_responsible_phone_chk', t.responsiblePhone, 2000),
    encryptedCheck('offices_pix_key_chk', t.pixKey, 2000),
    check(
      'offices_logo_chk',
      sql`(${t.logo} is null) = (${t.logoType} is null) and ${t.logoType} in ('image/png', 'image/jpeg', 'image/webp') and octet_length(${t.logo}) between 1 and 512000`,
    ),
    check(
      'offices_watermark_chk',
      sql`(${t.contractWatermark} is null) = (${t.contractWatermarkType} is null) and ${t.contractWatermarkType} in ('image/png', 'image/jpeg', 'image/webp') and octet_length(${t.contractWatermark}) between 1 and 512000`,
    ),
    // 500 blocks of up to 20 000 characters, 400 000 in total (checked by the API): the JSON stays under ~1 MB.
    check(
      'offices_contract_chk',
      sql`jsonb_typeof(${t.contractBlocks}) = 'array' and jsonb_array_length(${t.contractBlocks}) <= 500 and length(${t.contractBlocks}::text) <= 1200000`,
    ),
    // Migration 0016: each block as the contract says (type/rule from the catalogs, 20 000 characters per
    // block, 400 000 in total; nothing else in the object). `contract_blocks_valid` is in the SQL file.
    check('offices_contract_blocks_chk', sql`public.contract_blocks_valid(${t.contractBlocks})`),
    check('offices_recorded_names_chk', sql`length(${t.updatedByName}) between 1 and 120 and length(${t.contractUpdatedByName}) between 1 and 120`),
  ],
);

/**
 * Profile photo of a user (identity data, outside RLS: one photo across workspaces), encrypted with a
 * platform key (12-byte IV + ciphertext + 16-byte tag, AAD bound to the user). Goes with the account.
 */
export const userPhotos = pgTable(
  'user_photos',
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    contentType: text().$type<ProfilePhotoContentType>().notNull(),
    sizeBytes: integer().notNull(),
    content: bytea().notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('user_photos_type_chk', sql`${t.contentType} in ('image/png', 'image/jpeg', 'image/webp')`),
    check('user_photos_size_chk', sql`${t.sizeBytes} between 1 and 102400 and octet_length(${t.content}) = ${t.sizeBytes} + 28`),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type CreditCardRow = typeof creditCards.$inferSelect;
export type GoalRow = typeof goals.$inferSelect;
export type GoalContributionRow = typeof goalContributions.$inferSelect;
export type ContactRow = typeof contacts.$inferSelect;
export type ClientFeeRow = typeof clientFees.$inferSelect;
export type RecurrenceRow = typeof recurrences.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
export type ImportBatchRow = typeof importBatches.$inferSelect;
export type BankConnectionRow = typeof bankConnections.$inferSelect;
export type BankConnectionAccountRow = typeof bankConnectionAccounts.$inferSelect;
export type TaskDepartmentRow = typeof taskDepartments.$inferSelect;
export type TaskCategoryRow = typeof taskCategories.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type RecurringTaskRow = typeof recurringTasks.$inferSelect;
export type TaskFlowRow = typeof taskFlows.$inferSelect;
export type TaskFlowStepRow = typeof taskFlowSteps.$inferSelect;
export type TaskFlowTemplateRow = typeof taskFlowTemplates.$inferSelect;
export type TaskFlowTemplateStepRow = typeof taskFlowTemplateSteps.$inferSelect;
export type TaskEventRow = typeof taskEvents.$inferSelect;
export type TaskNoteRow = typeof taskNotes.$inferSelect;
export type ClientDocumentRow = typeof clientDocuments.$inferSelect;
export type UnionRow = typeof unions.$inferSelect;
export type UnionConventionRow = typeof unionConventions.$inferSelect;
export type OfficeRow = typeof offices.$inferSelect;
