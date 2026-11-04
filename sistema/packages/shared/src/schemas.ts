// Zod schemas for every API input (bodies and query strings).
// The API validates with them and the web reuses them in react-hook-form.

import { z } from 'zod';
import {
  ACCOUNT_TYPES,
  BANK_CODES,
  CARD_BRANDS,
  CATEGORY_TYPES,
  CLIENT_CREDENTIAL_FIELDS,
  CLIENT_DOCUMENT_KINDS,
  CLIENT_DOCUMENT_NOTE_MAX,
  CLIENT_STATUSES,
  CONTACT_KINDS,
  CONTRACT_BLOCK_RULES,
  CONTRACT_BLOCK_TYPES,
  DEFAULT_COLOR,
  FREQUENCIES,
  GRANULARITIES,
  ICON_NAMES,
  INACTIVATION_REASONS,
  MAX_ATTACHMENT_BYTES,
  MAX_CLIENT_DOCUMENTS,
  MAX_CONTRACT_BLOCK_CHARS,
  MAX_CONTRACT_BLOCKS,
  MAX_CONTRACT_TOTAL_CHARS,
  MAX_OFFICE_IMAGE_BYTES,
  MAX_REFERENCE_OFFSET,
  MAX_UNION_CYCLES,
  NON_BUSINESS_DAY_RULES,
  PAYMENT_METHODS,
  PIX_KEY_TYPES,
  RECURRENCE_KINDS,
  RECURRENCE_PERIODS,
  SERIES_SCOPES,
  SIMPLES_ACCESS_REGIMES,
  SIMPLES_ANNEXES,
  TASK_ATTACHMENT_CONTENT_TYPES,
  TASK_DUE_BUCKETS,
  TASK_KINDS,
  TASK_PRIORITIES,
  TASK_SCOPES,
  TASK_SITUATIONS,
  TASK_STATUSES,
  TAX_REGIMES,
  TRANSACTION_STATUSES,
  UNION_CYCLE_MAX_YEAR,
  UNION_CYCLE_MIN_YEAR,
  UNION_SITUATIONS,
} from './constants';
import { REGIME_GROUP_ITEMS, REGIME_GROUP_REGIMES } from './regime-groups';
import { isISODate } from './utils/dates';
import { OCCURRENCE_PERIOD_RE, sanitizeFileName, TASK_TIME_RE } from './utils/tasks';
import { isValidCNPJ, isValidCPF, isValidDocument, isValidPhone, onlyDigits } from './utils/documents';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const idSchema = z.uuid({ message: 'ID inválido' });

/**
 * Calendar years accepted from clients. Postgres has no year 0 and reports reach back a year before
 * `from` (opening balances, history), so far-off years would surface as database errors (500).
 */
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2199;

const inYearRange = (value: string) => {
  const year = Number(value.slice(0, 4));
  return year >= MIN_YEAR && year <= MAX_YEAR;
};

export const isoDateSchema = z
  .string()
  .refine(isISODate, { message: 'Data inválida (use AAAA-MM-DD)' })
  .refine(inYearRange, { message: `Use uma data entre ${MIN_YEAR} e ${MAX_YEAR}` });

export const monthKeySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Mês inválido (use AAAA-MM)' })
  .refine(inYearRange, { message: `Use um mês entre ${MIN_YEAR} e ${MAX_YEAR}` });

/** Positive amount in cents. */
export const amountSchema = z
  .int({ message: 'Valor inválido' })
  .positive({ message: 'Informe um valor maior que zero' })
  .max(100_000_000_000, { message: 'Valor muito alto' });

/** Any amount in cents (balances may be negative). */
export const signedAmountSchema = z
  .int({ message: 'Valor inválido' })
  .min(-100_000_000_000)
  .max(100_000_000_000);

export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, { message: 'Cor inválida' });
export const iconSchema = z.enum(ICON_NAMES);
export const bankCodeSchema = z.enum(BANK_CODES);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const requiredName = (max = 80) =>
  z.string().trim().min(1, { message: 'Informe o nome' }).max(max, { message: `Máximo de ${max} caracteres` });

const dayOfMonth = z.int().min(1, { message: 'Dia inválido' }).max(31, { message: 'Dia inválido' });

/** Query-string pagination. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const dateRangeQuerySchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine((v) => v.from <= v.to, { message: 'Data inicial maior que a final', path: ['to'] });

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const registerSchema = z.object({
  name: requiredName(80),
  email: z.email({ message: 'E-mail inválido' }).trim().toLowerCase(),
  password: z
    .string()
    .min(10, { message: 'A senha deve ter ao menos 10 caracteres' })
    .max(128, { message: 'Senha muito longa' })
    .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), { message: 'Use letras e números' }),
  /** Name of the company (business workspace) created with the account; "Minha empresa" when blank. */
  companyName: optionalText(60),
  /** LGPD: explicit acceptance of the terms of use and privacy policy. */
  acceptTerms: z.literal(true, { message: 'Aceite os termos de uso e a política de privacidade' }),
});
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email({ message: 'E-mail inválido' }).trim().toLowerCase(),
  password: z.string().min(1, { message: 'Informe a senha' }),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const updateProfileSchema = z.object({
  name: requiredName(80),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ---------------------------------------------------------------------------
// Categories (a subcategory is a category with parentId; it inherits the parent's type)
// ---------------------------------------------------------------------------

export const categoryInputSchema = z.object({
  name: requiredName(60),
  type: z.enum(CATEGORY_TYPES),
  icon: iconSchema.default('tag'),
  color: colorSchema.default('#152B61'),
  parentId: idSchema.nullish().transform((v) => v ?? null),
});
export type CategoryInput = z.input<typeof categoryInputSchema>;

export const categoryQuerySchema = z.object({
  type: z.enum(CATEGORY_TYPES).optional(),
  includeArchived: z.stringbool().optional(),
});

export const categoryUpdateSchema = categoryInputSchema
  .omit({ type: true, parentId: true })
  .extend({ archived: z.boolean().optional() });
export type CategoryUpdateInput = z.input<typeof categoryUpdateSchema>;

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const accountInputSchema = z.object({
  name: requiredName(60),
  type: z.enum(ACCOUNT_TYPES),
  bank: bankCodeSchema.nullish().transform((v) => v ?? null),
  color: colorSchema.default('#152B61'),
  icon: iconSchema.default('wallet'),
  initialBalance: signedAmountSchema.default(0),
  /** Whether the account counts toward the "saldo em contas" total. */
  includeInTotal: z.boolean().default(true),
  archived: z.boolean().default(false),
});
export type AccountInput = z.input<typeof accountInputSchema>;

export const accountQuerySchema = z.object({
  includeArchived: z.stringbool().optional(),
});

// ---------------------------------------------------------------------------
// Credit cards
// ---------------------------------------------------------------------------

export const creditCardInputSchema = z.object({
  name: requiredName(60),
  bank: bankCodeSchema,
  brand: z.enum(CARD_BRANDS),
  limit: amountSchema,
  closingDay: dayOfMonth,
  dueDay: dayOfMonth,
  color: colorSchema.default('#152B61'),
  /** Account suggested when paying the invoice. */
  defaultAccountId: idSchema.nullish().transform((v) => v ?? null),
  archived: z.boolean().default(false),
});
export type CreditCardInput = z.input<typeof creditCardInputSchema>;

export const payInvoiceSchema = z.object({
  accountId: idSchema,
  date: isoDateSchema,
  /** Defaults to the unpaid total of the invoice. Only full payment is supported. */
  amount: amountSchema.optional(),
});
export type PayInvoiceInput = z.infer<typeof payInvoiceSchema>;

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export const goalInputSchema = z.object({
  name: requiredName(60),
  targetAmount: amountSchema,
  deadline: isoDateSchema.nullish().transform((v) => v ?? null),
  icon: iconSchema.default('target'),
  color: colorSchema.default('#152B61'),
  accountId: idSchema.nullish().transform((v) => v ?? null),
  notes: optionalText(500),
  archived: z.boolean().default(false),
});
export type GoalInput = z.input<typeof goalInputSchema>;

export const goalContributionInputSchema = z.object({
  /** Negative values register a withdrawal from the goal. */
  amount: signedAmountSchema.refine((v) => v !== 0, { message: 'Informe um valor' }),
  date: isoDateSchema,
  note: optionalText(200),
});
export type GoalContributionInput = z.input<typeof goalContributionInputSchema>;

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

const optionalEmail = () =>
  z
    .union([z.email({ message: 'E-mail inválido' }), z.literal('')])
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null));

const optionalPhone = () =>
  z
    .string()
    .nullish()
    .transform((v) => (v ? onlyDigits(v) : null))
    .refine((v) => v === null || isValidPhone(v), { message: 'Telefone inválido' });

/** Address and notes, shared by suppliers and clients. */
const addressFields = {
  zipCode: z
    .string()
    .nullish()
    .transform((v) => (v ? onlyDigits(v) : null))
    .refine((v) => v === null || v.length === 8, { message: 'CEP inválido' }),
  street: optionalText(120),
  number: optionalText(20),
  complement: optionalText(60),
  district: optionalText(80),
  city: optionalText(80),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .length(2, { message: 'UF inválida' })
    .nullish()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  notes: optionalText(500),
};

/** Suppliers (fornecedores). Clients have their own, richer schema below. */
export const contactInputSchema = z.object({
  name: requiredName(120),
  document: z
    .string()
    .nullish()
    .transform((v) => (v ? onlyDigits(v) : null))
    .refine((v) => v === null || isValidDocument(v), { message: 'CPF/CNPJ inválido' }),
  email: optionalEmail(),
  phone: optionalPhone(),
  ...addressFields,
});
export type ContactInput = z.input<typeof contactInputSchema>;

export const contactQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(80).optional(),
  kind: z.enum(CONTACT_KINDS).optional(),
});

// ---------------------------------------------------------------------------
// Clients (empresas atendidas) and their fees (honorários)
// ---------------------------------------------------------------------------

const requiredDate = (message: string) => z.string({ message }).min(1, { message }).pipe(isoDateSchema);

const optionalDate = () =>
  z
    .union([z.literal(''), isoDateSchema])
    .nullish()
    .transform((v) => (v ? v : null));

export const cnpjSchema = z
  .string({ message: 'Informe o CNPJ' })
  .transform((v) => onlyDigits(v))
  .superRefine((v, ctx) => {
    if (!v) ctx.addIssue({ code: 'custom', message: 'Informe o CNPJ' });
    else if (!isValidCNPJ(v)) ctx.addIssue({ code: 'custom', message: 'CNPJ inválido' });
  });

/** Optional text that, when absent (`undefined`), means "keep what is stored"; empty becomes null. */
const keepableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: `Máximo de ${max} caracteres` })
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

/** State/municipal registration: digits, letters and the usual separators. */
const keepableRegistration = () =>
  keepableText(40).refine((v) => !v || /^[0-9A-Za-z./ -]+$/.test(v), { message: 'Inscrição inválida' });

/** CPF (digits only), absent = keep, empty = remove. */
const keepableCpf = () =>
  z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? onlyDigits(v) : null))
    .refine((v) => !v || isValidCPF(v), { message: 'CPF inválido' });

/**
 * An encrypted access in three states, so the form never needs to read the stored value: `keep` (or
 * the field absent), `set` with the new value, `clear`.
 */
export const credentialUpdateSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('keep') }),
  z.object({
    action: z.literal('set'),
    value: z
      .string()
      .max(200, { message: 'Máximo de 200 caracteres' })
      .refine((v) => v.trim().length > 0, { message: 'Informe o acesso' }),
  }),
  z.object({ action: z.literal('clear') }),
]);
export type CredentialUpdateInput = z.infer<typeof credentialUpdateSchema>;

/** A document of the client (the list in the client form). `id` keeps an existing one. */
export const clientDocumentInputSchema = z
  .object({
    id: idSchema.optional(),
    kind: z.enum(CLIENT_DOCUMENT_KINDS, { message: 'Escolha o tipo do documento.' }),
    /** Name of an "Outro…" document. */
    customName: optionalText(80),
    expiresAt: optionalDate(),
    /** "Ex.: A1, emitido pela Certisign". */
    note: optionalText(CLIENT_DOCUMENT_NOTE_MAX),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'other' && !v.customName) {
      ctx.addIssue({ code: 'custom', path: ['customName'], message: 'Informe o nome do documento.' });
    }
  })
  .transform((v) => ({ ...v, customName: v.kind === 'other' ? v.customName : null }));
export type ClientDocumentInput = z.input<typeof clientDocumentInputSchema>;

/** Reveals one access of a client (POST, never cached; audited). */
export const clientCredentialRevealSchema = z.object({
  field: z.enum(CLIENT_CREDENTIAL_FIELDS, { message: 'Acesso inválido' }),
});
export type ClientCredentialRevealInput = z.infer<typeof clientCredentialRevealSchema>;

export const clientInputSchema = z
  .object({
    /** Razão social. */
    name: z
      .string()
      .trim()
      .min(1, { message: 'Informe a razão social' })
      .max(160, { message: 'Máximo de 160 caracteres' }),
    /** Nome fantasia. */
    tradeName: optionalText(160),
    document: cnpjSchema,
    /** Data de abertura (Receita Federal). */
    openedAt: optionalDate(),
    /** CNAE principal, e.g. "6920-6/01 — Atividades de contabilidade". */
    mainActivity: optionalText(200),
    email: optionalEmail(),
    phone: optionalPhone(),
    responsibleName: optionalText(120),
    responsibleEmail: optionalEmail(),
    responsiblePhone: optionalPhone(),
    taxRegime: z.enum(TAX_REGIMES, { message: 'Selecione o regime tributário' }),
    simplesAnnex: z
      .union([z.literal(''), z.enum(SIMPLES_ANNEXES)])
      .nullish()
      .transform((v) => (v ? v : null)),
    /** The first fee period starts on this date. */
    contractStartDate: requiredDate('Informe a data de início do contrato'),
    /** Day of the month the fee is due (in the month after the competence); clamped to short months. */
    feeDueDay: dayOfMonth.default(10),
    ...addressFields,
    // Phase 3 (spec §13.8): every field below is optional and, when absent from a PUT, keeps what is
    // stored (forms of earlier versions do not know them and must not wipe them).
    /** Inscrição estadual; cleared when `stateRegistrationExempt` is true. */
    stateRegistration: keepableRegistration(),
    /** "Isenta de inscrição estadual". */
    stateRegistrationExempt: z.boolean().optional(),
    /** Inscrição municipal. */
    municipalRegistration: keepableRegistration(),
    /** CPF of the responsible person (the contract needs it): personal data, stored encrypted. */
    responsibleDocument: keepableCpf(),
    /** Access code of the Simples Nacional portal (Simples Nacional and MEI only): keep, set or clear. */
    simplesAccessCode: credentialUpdateSchema.optional(),
    /** The office's password in this client's portals: keep, set or clear. */
    accountantPassword: credentialUpdateSchema.optional(),
    /** Documents with expiry date: the full list (replaces the stored one); absent = keep. */
    documents: z
      .array(clientDocumentInputSchema)
      .max(MAX_CLIENT_DOCUMENTS, { message: `Máximo de ${MAX_CLIENT_DOCUMENTS} documentos por cliente` })
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.taxRegime === 'simples_nacional' && !v.simplesAnnex) {
      ctx.addIssue({ code: 'custom', path: ['simplesAnnex'], message: 'Selecione o anexo do Simples Nacional' });
    }
    if (v.simplesAccessCode?.action === 'set' && !(SIMPLES_ACCESS_REGIMES as readonly string[]).includes(v.taxRegime)) {
      ctx.addIssue({
        code: 'custom',
        path: ['simplesAccessCode'],
        message: 'O código de acesso do Simples Nacional só vale para clientes do Simples Nacional ou MEI',
      });
    }
    const ids = (v.documents ?? []).map((d) => d.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['documents'], message: 'Documento repetido na lista' });
    }
  })
  .transform((v) => ({
    ...v,
    simplesAnnex: v.taxRegime === 'simples_nacional' ? v.simplesAnnex : null,
    // Exempt: no registration number.
    stateRegistration: v.stateRegistrationExempt === true ? null : v.stateRegistration,
  }));
export type ClientInput = z.input<typeof clientInputSchema>;

export const clientQuerySchema = paginationQuerySchema.extend({
  /** Razão social / nome fantasia (partial) or CNPJ (exact). */
  search: z.string().trim().max(80).optional(),
  status: z.enum([...CLIENT_STATUSES, 'all']).default('all'),
  taxRegime: z.enum(TAX_REGIMES).optional(),
});
export type ClientQuery = z.input<typeof clientQuerySchema>;

export const clientInactivationSchema = z
  .object({
    date: requiredDate('Informe a data da inativação'),
    reason: z.enum(INACTIVATION_REASONS, { message: 'Selecione o motivo' }),
    notes: optionalText(500),
  })
  .refine((v) => v.reason !== 'other' || Boolean(v.notes), { path: ['notes'], message: 'Descreva o motivo' });
export type ClientInactivationInput = z.input<typeof clientInactivationSchema>;

/** One fee period (vigência de 1 ano). The period itself is defined by the server. */
export const clientFeeInputSchema = z.object({
  /** Honorário mensal, in cents. */
  amount: amountSchema,
  /** Taxa por empregado (per employee, per month), in cents. */
  employeeFee: z
    .int({ message: 'Valor inválido' })
    .min(0, { message: 'Valor inválido' })
    .max(100_000_000_000, { message: 'Valor muito alto' })
    .default(0),
  /**
   * Discount for paying the fee by its due date, in basis points (500 = 5%); 0 = none. Copied into
   * each fee generated in the period (`Transaction.feeDiscountBps`).
   */
  discountBps: z
    .int({ message: 'Percentual inválido' })
    .min(0, { message: 'Percentual inválido' })
    .max(9_999, { message: 'O desconto deve ser menor que 100%' })
    .default(0),
});
export type ClientFeeInput = z.input<typeof clientFeeInputSchema>;

export const cnpjParamsSchema = z.object({ cnpj: cnpjSchema });

// ---------------------------------------------------------------------------
// Transactions (contas a pagar / a receber / lançamentos)
// ---------------------------------------------------------------------------

const transactionBaseSchema = z.object({
  type: z.enum(['income', 'expense']),
  description: z
    .string()
    .trim()
    .min(1, { message: 'Informe a descrição' })
    .max(120, { message: 'Máximo de 120 caracteres' }),
  /** For installments with installmentAmountMode = 'total' this is the TOTAL purchase amount. */
  amount: amountSchema,
  /** Due date (vencimento) / competence date. For card purchases: purchase date. */
  date: isoDateSchema,
  paid: z.boolean().default(false),
  /** Defaults to `date` when paid. */
  paidAt: isoDateSchema.nullish().transform((v) => v ?? null),
  accountId: idSchema.nullish().transform((v) => v ?? null),
  creditCardId: idSchema.nullish().transform((v) => v ?? null),
  categoryId: idSchema.nullish().transform((v) => v ?? null),
  subcategoryId: idSchema.nullish().transform((v) => v ?? null),
  contactId: idSchema.nullish().transform((v) => v ?? null),
  paymentMethod: z
    .enum(PAYMENT_METHODS)
    .nullish()
    .transform((v) => v ?? null),
  notes: optionalText(1000),
});

export const transactionSplitSchema = z.object({
  categoryId: idSchema,
  subcategoryId: idSchema.nullish().transform((v) => v ?? null),
  amount: amountSchema,
});
export type TransactionSplitInput = z.input<typeof transactionSplitSchema>;

export const transactionInputSchema = transactionBaseSchema
  .extend({
    /**
     * Divides `amount` across categories (2–10 parts). One linked transaction is created per part
     * (same date, account, status and repetition), sharing a `splitGroupId`; the parts' categories
     * replace `categoryId`/`subcategoryId` and their amounts must add up to `amount`.
     */
    splits: z
      .array(transactionSplitSchema)
      .min(2, { message: 'Divida em pelo menos 2 categorias' })
      .max(10, { message: 'Máximo de 10 categorias' })
      .nullish()
      .transform((v) => v ?? null),
    recurrenceKind: z.enum(RECURRENCE_KINDS).default('single'),
    frequency: z.enum(FREQUENCIES).default('monthly'),
    /** installment: number of installments (2–360). */
    installments: z.int().min(2, { message: 'Mínimo de 2 parcelas' }).max(360).nullish(),
    installmentAmountMode: z.enum(['total', 'per_installment']).default('total'),
    /** recurring: number of occurrences (2–360); null/undefined = no end. */
    occurrences: z.int().min(2).max(360).nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.accountId && v.creditCardId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Escolha uma conta OU um cartão',
        path: ['creditCardId'],
      });
    }
    if (v.creditCardId && v.type !== 'expense') {
      ctx.addIssue({
        code: 'custom',
        message: 'Cartão de crédito só pode ser usado em despesas',
        path: ['creditCardId'],
      });
    }
    if (v.recurrenceKind === 'installment' && !v.installments) {
      ctx.addIssue({ code: 'custom', message: 'Informe a quantidade de parcelas', path: ['installments'] });
    }
    if (v.subcategoryId && !v.categoryId) {
      ctx.addIssue({ code: 'custom', message: 'Selecione a categoria', path: ['categoryId'] });
    }
    if (v.splits) {
      const sum = v.splits.reduce((acc, s) => acc + s.amount, 0);
      if (sum !== v.amount) {
        ctx.addIssue({
          code: 'custom',
          message: 'A soma das categorias deve ser igual ao valor total',
          path: ['splits'],
        });
      }
    }
  });
export type TransactionInput = z.input<typeof transactionInputSchema>;
export type TransactionInputParsed = z.output<typeof transactionInputSchema>;

/**
 * Anticipates installments of an installment purchase: the LAST `count` unpaid installments after
 * this one (all of them by default) move to `date` (default: today). On a credit card they land in
 * the invoice that receives purchases made on that date (the current open invoice).
 */
export const anticipateInstallmentsSchema = z.object({
  count: z.int().min(1, { message: 'Antecipe ao menos 1 parcela' }).max(360).optional(),
  date: isoDateSchema.optional(),
});
export type AnticipateInstallmentsInput = z.input<typeof anticipateInstallmentsSchema>;

export const seriesScopeQuerySchema = z.object({
  scope: z.enum(SERIES_SCOPES).default('one'),
});

/**
 * Partial update. With scope 'future'/'all' every field except date/paid/paidAt is applied to
 * the unpaid occurrences of the series (paid ones are history and stay untouched).
 */
export const transactionUpdateSchema = transactionBaseSchema
  .omit({ type: true })
  // No default here: an omitted `paid` must keep the current value.
  .extend({ paid: z.boolean() })
  .partial()
  .superRefine((v, ctx) => {
    if (v.accountId && v.creditCardId) {
      ctx.addIssue({ code: 'custom', message: 'Escolha uma conta OU um cartão', path: ['creditCardId'] });
    }
  });
export type TransactionUpdateInput = z.input<typeof transactionUpdateSchema>;

/**
 * "Gerar honorários": one receivable per client for the competence month, due on the client's
 * `feeDueDay` of the following month (the fee due in November refers to October). Uses the fee
 * period in force at the end of the competence month. `dryRun` only computes what would be created.
 */
export const generateFeesSchema = z.object({
  competence: monthKeySchema,
  dryRun: z.boolean().default(false),
});
export type GenerateFeesInput = z.input<typeof generateFeesSchema>;

/**
 * "+ Empregados" on a generated fee: employees × the client's employee fee (same fee period), as its
 * own receivable with the same due date. Sending again replaces it; 0 removes it.
 */
export const feeEmployeesSchema = z.object({
  employees: z.int({ message: 'Informe um número inteiro' }).min(0).max(100_000),
  dryRun: z.boolean().default(false),
});
export type FeeEmployeesInput = z.input<typeof feeEmployeesSchema>;

/** Late-payment extra in cents (0 = none). */
const lateFeeAmountSchema = z.int({ message: 'Valor inválido' }).min(0, { message: 'Valor inválido' }).max(100_000_000_000);

/** Quick 👍/👎 toggle. */
export const setPaidSchema = z.object({
  paid: z.boolean(),
  paidAt: isoDateSchema.nullish(),
  /** Account used to pay/receive when the transaction had none. */
  accountId: idSchema.nullish(),
  /**
   * Paid after the due date: interest (juros) and fine (multa) charged on top. Each becomes a paid
   * transaction linked to this one; sending them again replaces the previous ones.
   */
  interest: lateFeeAmountSchema.optional(),
  fine: lateFeeAmountSchema.optional(),
  /**
   * Received by the due date: discount granted (desconto por pontualidade), at most the amount. It
   * becomes a paid expense linked to this one ("Descontos concedidos"); sending it again replaces it.
   */
  discount: lateFeeAmountSchema.optional(),
});
export type SetPaidInput = z.infer<typeof setPaidSchema>;

export const transactionQuerySchema = paginationQuerySchema.extend({
  type: z.enum(['income', 'expense', 'transfer']).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  status: z.enum(TRANSACTION_STATUSES).default('all'),
  accountId: idSchema.optional(),
  creditCardId: idSchema.optional(),
  categoryId: idSchema.optional(),
  contactId: idSchema.optional(),
  recurrenceKind: z.enum(RECURRENCE_KINDS).optional(),
  /** `TRANSACTION_ORIGINS` (integrations.ts, which imports this module — kept in sync by a type check there). */
  origin: z.enum(['manual', 'file', 'open_finance']).optional(),
  search: z.string().trim().max(80).optional(),
  sort: z.enum(['date_asc', 'date_desc', 'amount_desc', 'amount_asc']).default('date_asc'),
});
export type TransactionQuery = z.input<typeof transactionQuerySchema>;

// ---------------------------------------------------------------------------
// Transfers & investments
// ---------------------------------------------------------------------------

export const transferInputSchema = z
  .object({
    fromAccountId: idSchema,
    toAccountId: idSchema,
    amount: amountSchema,
    date: isoDateSchema,
    description: optionalText(120),
    notes: optionalText(1000),
    /** Scheduled (future) transfers can be created as pending. */
    paid: z.boolean().default(true),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: 'Escolha contas diferentes',
    path: ['toAccountId'],
  });
export type TransferInput = z.input<typeof transferInputSchema>;

export const transferQuerySchema = paginationQuerySchema.extend({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  accountId: idSchema.optional(),
  kind: z.enum(['transfer', 'investment', 'redemption', 'card_payment']).optional(),
});

// ---------------------------------------------------------------------------
// Statement (extrato)
// ---------------------------------------------------------------------------

export const statementQuerySchema = z
  .object({
    /** Omit for "todas as contas" (non-investment accounts included in total). */
    accountId: idSchema.optional(),
    from: isoDateSchema,
    to: isoDateSchema,
    includePending: z.stringbool().default(true),
  })
  .refine((v) => v.from <= v.to, { message: 'Data inicial maior que a final', path: ['to'] });
export type StatementQuery = z.input<typeof statementQuerySchema>;

// ---------------------------------------------------------------------------
// Dashboard & reports
// ---------------------------------------------------------------------------

export const dashboardQuerySchema = z.object({
  month: monthKeySchema,
});

const reportRange = {
  from: isoDateSchema,
  to: isoDateSchema,
};

export const categoryReportQuerySchema = z.object({
  ...reportRange,
  type: z.enum(CATEGORY_TYPES).default('expense'),
  granularity: z.enum(GRANULARITIES).default('month'),
  /** 'paid' = realizado; 'all' = realizado + previsto. */
  status: z.enum(['all', 'paid']).default('all'),
  /** Breaks a single category down into its subcategories. */
  categoryId: idSchema.optional(),
});
export type CategoryReportQuery = z.input<typeof categoryReportQuerySchema>;

export const contactReportQuerySchema = z.object({
  ...reportRange,
  granularity: z.enum(GRANULARITIES).default('month'),
  status: z.enum(['all', 'paid']).default('all'),
});
export type ContactReportQuery = z.input<typeof contactReportQuerySchema>;

/** Late payments of clients over the last `months` months (by due date, up to today). */
export const delinquencyReportQuerySchema = z.object({
  months: z.coerce.number().int().min(3).max(24).default(12),
});
export type DelinquencyReportQuery = z.input<typeof delinquencyReportQuerySchema>;

export const comparisonReportQuerySchema = z.object({
  aFrom: isoDateSchema,
  aTo: isoDateSchema,
  bFrom: isoDateSchema,
  bTo: isoDateSchema,
  type: z.enum(CATEGORY_TYPES).default('expense'),
  status: z.enum(['all', 'paid']).default('all'),
});
export type ComparisonReportQuery = z.input<typeof comparisonReportQuerySchema>;

export const cashflowReportQuerySchema = z.object({
  ...reportRange,
  granularity: z.enum(GRANULARITIES).default('month'),
  accountId: idSchema.optional(),
});
export type CashflowReportQuery = z.input<typeof cashflowReportQuerySchema>;

export const overviewReportQuerySchema = z.object({
  ...reportRange,
});
export type OverviewReportQuery = z.input<typeof overviewReportQuerySchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(80),
});

// ---------------------------------------------------------------------------
// Tasks (módulo Tarefas). Every member writes tasks, subtasks, comments, audit cells, flows and notes;
// the registries (departments, categories, recurring tasks, regime groups, flow templates) and
// deletions are for administrators (owner/editor). See docs/api.md → "Tarefas".
// ---------------------------------------------------------------------------

const nullableId = () => idSchema.nullish().transform((v) => v ?? null);

const taskTitleSchema = z
  .string()
  .trim()
  .min(1, { message: 'Informe o nome da tarefa' })
  .max(200, { message: 'Máximo de 200 caracteres' });

export const taskTimeSchema = z.string().regex(TASK_TIME_RE, { message: 'Hora inválida (use HH:MM)' });

const optionalTime = () =>
  z
    .union([z.literal(''), taskTimeSchema])
    .nullish()
    .transform((v) => (v ? v : null));

interface TaskDatesShape {
  startDate?: string | null;
  dueDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

/** Start ≤ due; an appointment (time range) lives on the due date and ends after it starts. */
function refineTaskDates(v: TaskDatesShape, ctx: z.RefinementCtx) {
  if (v.startDate && v.dueDate && v.startDate > v.dueDate) {
    ctx.addIssue({ code: 'custom', path: ['startDate'], message: 'O início não pode ser depois do vencimento' });
  }
  // `null` = no start time (a PATCH that omits it keeps the task's own, checked by the API).
  if (v.endTime && v.startTime === null) {
    ctx.addIssue({ code: 'custom', path: ['startTime'], message: 'Informe a hora de início' });
  }
  if (v.startTime && v.endTime && v.endTime <= v.startTime) {
    ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'A hora de término deve ser posterior à de início' });
  }
  if ((v.startTime || v.endTime) && v.dueDate === null) {
    ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'Informe o vencimento para definir o horário' });
  }
}

/**
 * New task. The department is never chosen for an assigned task: it is the assignee's department
 * (derived by the API). `departmentId` only places a task without assignee (or whose assignee has no
 * department) in a department's queue. Creating it already `done` records who/when like concluding.
 */
export const taskInputSchema = z
  .object({
    title: taskTitleSchema,
    description: optionalText(5000),
    /** null = "Interna" (no client). */
    clientId: nullableId(),
    categoryId: nullableId(),
    assigneeId: nullableId(),
    departmentId: nullableId(),
    priority: z.enum(TASK_PRIORITIES).default('medium'),
    status: z.enum(TASK_STATUSES).default('todo'),
    startDate: optionalDate(),
    dueDate: optionalDate(),
    /** Appointment ("compromisso") on the due date: wall-clock "HH:MM", no time zone. */
    startTime: optionalTime(),
    endTime: optionalTime(),
  })
  .superRefine(refineTaskDates);
export type TaskInput = z.input<typeof taskInputSchema>;

/**
 * Field-by-field autosave (PATCH): only the fields sent change (no defaults here — an omitted field
 * keeps its value). The status changes through `PATCH /tasks/:id/status`. Cross-field rules (dates,
 * time range) are checked again by the API on the merged task.
 */
export const taskUpdateSchema = z
  .object({
    title: taskTitleSchema,
    description: optionalText(5000),
    clientId: idSchema.nullable(),
    categoryId: idSchema.nullable(),
    assigneeId: idSchema.nullable(),
    departmentId: idSchema.nullable(),
    priority: z.enum(TASK_PRIORITIES),
    startDate: isoDateSchema.nullable(),
    dueDate: isoDateSchema.nullable(),
    startTime: taskTimeSchema.nullable(),
    endTime: taskTimeSchema.nullable(),
  })
  .partial()
  .superRefine(refineTaskDates);
export type TaskUpdateInput = z.input<typeof taskUpdateSchema>;

/**
 * Conclude, reopen, move on the board or undo: any status, any direction. `reason` goes to the task's
 * history; reopening a concluded recurring occurrence requires it (only who concluded it or an
 * administrator may), except when its author undoes the conclusion within a few minutes.
 */
export const taskStatusInputSchema = z.object({
  status: z.enum(TASK_STATUSES),
  reason: optionalText(500),
});
export type TaskStatusInput = z.input<typeof taskStatusInputSchema>;

export const taskQuerySchema = paginationQuerySchema.extend({
  scope: z.enum(TASK_SCOPES).default('all'),
  situation: z.enum(TASK_SITUATIONS).default('all'),
  /** Exact status (on top of `situation`). */
  status: z.enum(TASK_STATUSES).optional(),
  /** A client id, or `internal` for tasks without client. */
  clientId: z.union([idSchema, z.literal('internal')]).optional(),
  /** A member id, or `none` for unassigned. */
  assigneeId: z.union([idSchema, z.literal('none')]).optional(),
  departmentId: idSchema.optional(),
  categoryId: idSchema.optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  /** standalone / flow (process steps) / recurring (occurrences: only in `occurrences`, never in `items`). */
  kind: z.enum(TASK_KINDS).optional(),
  /** Due month (legal deadline of occurrences). */
  month: monthKeySchema.optional(),
  /** Exact due date (the "tasks per day" widget). */
  dueDate: isoDateSchema.optional(),
  dueFrom: isoDateSchema.optional(),
  dueTo: isoDateSchema.optional(),
  /** One due-date group of open items (the list's "Mostrar mais"; by the work date: target of occurrences). */
  dueBucket: z.enum(TASK_DUE_BUCKETS).optional(),
  /** Concluded/canceled items only from this date on (the board shows the last 14 days); open ones are unaffected. */
  closedFrom: isoDateSchema.optional(),
  /** Task title / recurring task name (partial). */
  search: z.string().trim().max(200).optional(),
  /**
   * Recurring occurrences (default true): aggregated per recurring task and period in `occurrences`
   * and counted (one per client) in the summary, groups and board counts. `false`: only standalone
   * tasks and process steps everywhere.
   */
  occurrences: z.stringbool().default(true),
});
export type TaskQuery = z.input<typeof taskQuerySchema>;

export const subtaskInputSchema = z.object({
  title: z.string().trim().min(1, { message: 'Informe a subtarefa' }).max(200, { message: 'Máximo de 200 caracteres' }),
});
export type SubtaskInput = z.infer<typeof subtaskInputSchema>;

export const subtaskUpdateSchema = z
  .object({
    title: subtaskInputSchema.shape.title,
    done: z.boolean(),
  })
  .partial()
  .refine((v) => v.title !== undefined || v.done !== undefined, { message: 'Nada para alterar' });
export type SubtaskUpdateInput = z.infer<typeof subtaskUpdateSchema>;

export const taskCommentInputSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, { message: 'Escreva um comentário antes de enviar' })
    .max(5000, { message: 'Máximo de 5000 caracteres' }),
});
export type TaskCommentInput = z.infer<typeof taskCommentInputSchema>;

// --- registries (administrators) -----------------------------------------------------------------

/** `memberIds`, when sent, is the full member list: marking a member moves them from their current department. */
export const taskDepartmentInputSchema = z.object({
  name: requiredName(80),
  memberIds: z.array(idSchema).max(500).optional(),
});
export type TaskDepartmentInput = z.input<typeof taskDepartmentInputSchema>;

/** Department of a member (each member is in at most one department). */
export const memberDepartmentSchema = z.object({ departmentId: idSchema.nullable() });
export type MemberDepartmentInput = z.infer<typeof memberDepartmentSchema>;

export const taskCategoryInputSchema = z.object({
  name: requiredName(60),
  icon: iconSchema.default('tag'),
  color: colorSchema.default(DEFAULT_COLOR),
});
export type TaskCategoryInput = z.input<typeof taskCategoryInputSchema>;

const recurringNameSchema = z
  .string()
  .trim()
  .min(1, { message: 'Informe o nome da tarefa' })
  .max(200, { message: 'Máximo de 200 caracteres' });

/**
 * Recurring task ("tarefa recorrente", Effy's obligation). PUT replaces every field (send them all).
 * Applies to the active clients of the chosen regimes and/or the chosen clients (union), minus the
 * exceptions, from `startCompetence` (default: the current one) until `endCompetence` (inclusive).
 * The legal deadline is required (without it nothing is generated): `dueDay` (weekly: the weekday) and,
 * for bimonthly…annual, the anchor month `dueMonth`; the internal target is `targetDaysBefore` days
 * before it. The reference month is the competence minus `referenceOffset` months.
 */
export const recurringTaskInputSchema = z
  .object({
    name: recurringNameSchema,
    description: optionalText(5000),
    period: z.enum(RECURRENCE_PERIODS).default('monthly'),
    /** Chosen in the registry (not derived): the occurrences belong to this department. */
    departmentId: nullableId(),
    categoryId: nullableId(),
    /** Default responsible of every occurrence (none: the department's queue). */
    assigneeId: nullableId(),
    dueDay: z
      .int({ message: 'Informe o prazo legal' })
      .min(1, { message: 'Dia inválido' })
      .max(31, { message: 'Dia inválido' })
      .nullish()
      .refine((v) => v !== null && v !== undefined, { message: 'Informe o prazo legal' })
      .transform((v) => v!),
    dueMonth: z.int().min(1, { message: 'Mês inválido' }).max(12, { message: 'Mês inválido' }).nullish().transform((v) => v ?? null),
    targetDaysBefore: z.int().min(0, { message: 'Use de 0 a 30 dias' }).max(30, { message: 'Use de 0 a 30 dias' }).default(0),
    nonBusinessDayRule: z.enum(NON_BUSINESS_DAY_RULES).default('anticipate'),
    referenceOffset: z
      .int()
      .min(0, { message: `Use de 0 a ${MAX_REFERENCE_OFFSET} meses` })
      .max(MAX_REFERENCE_OFFSET, { message: `Use de 0 a ${MAX_REFERENCE_OFFSET} meses` })
      .default(1),
    regimes: z.array(z.enum(TAX_REGIMES)).max(TAX_REGIMES.length).default([]),
    clientIds: z.array(idSchema).max(5000).default([]),
    /** Clients of the chosen regimes that do not have this obligation. */
    excludedClientIds: z.array(idSchema).max(5000).default([]),
    startCompetence: monthKeySchema.nullish().transform((v) => v ?? null),
    endCompetence: monthKeySchema.nullish().transform((v) => v ?? null),
  })
  .superRefine((v, ctx) => {
    if (v.regimes.length === 0 && v.clientIds.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['regimes'], message: 'Escolha ao menos um regime ou cliente' });
    }
    if (v.period === 'weekly') {
      if (v.dueDay > 7) ctx.addIssue({ code: 'custom', path: ['dueDay'], message: 'Escolha o dia da semana' });
      if (v.targetDaysBefore > 6) ctx.addIssue({ code: 'custom', path: ['targetDaysBefore'], message: 'Use de 0 a 6 dias' });
    } else if (v.period !== 'monthly' && v.dueMonth === null) {
      ctx.addIssue({ code: 'custom', path: ['dueMonth'], message: 'Informe o mês do prazo legal' });
    }
    if (v.startCompetence && v.endCompetence && v.endCompetence < v.startCompetence) {
      ctx.addIssue({ code: 'custom', path: ['endCompetence'], message: 'O encerramento deve ser depois do início' });
    }
    const included = new Set(v.clientIds);
    if (v.excludedClientIds.some((id) => included.has(id))) {
      ctx.addIssue({ code: 'custom', path: ['excludedClientIds'], message: 'Um cliente não pode estar nos específicos e nas exceções' });
    }
  })
  .transform((v) => ({
    ...v,
    dueMonth: v.period === 'monthly' || v.period === 'weekly' ? null : v.dueMonth,
    referenceOffset: v.period === 'weekly' ? 0 : v.referenceOffset,
    regimes: [...new Set(v.regimes)],
    clientIds: [...new Set(v.clientIds)],
    excludedClientIds: [...new Set(v.excludedClientIds)],
  }));
export type RecurringTaskInput = z.input<typeof recurringTaskInputSchema>;

export const recurringTaskQuerySchema = z.object({
  /** Month of the progress column (default: current). */
  month: monthKeySchema.optional(),
  search: z.string().trim().max(200).optional(),
  period: z.enum(RECURRENCE_PERIODS).optional(),
  departmentId: idSchema.optional(),
  /** Default responsible, or the responsible of any client in the month. */
  assigneeId: idSchema.optional(),
  regime: z.enum(TAX_REGIMES).optional(),
  /** active = no end or ending in the current competence or later; ended = ended before it. */
  status: z.enum(['active', 'ended', 'all']).default('active'),
});
export type RecurringTaskQuery = z.input<typeof recurringTaskQuerySchema>;

/** Period of an occurrence in the URL: the competence, or the Monday of a weekly occurrence. */
export const occurrencePeriodSchema = z.string().regex(OCCURRENCE_PERIOD_RE, { message: 'Período inválido' });

/** Generates the occurrences of a competence now (they are also generated when a competence is read). */
export const recurringGenerateSchema = z.object({ competence: monthKeySchema });
export type RecurringGenerateInput = z.infer<typeof recurringGenerateSchema>;

// --- regime groups (default recurring tasks per tax regime) ---------------------------------------

const REGIME_GROUP_KEYS = REGIME_GROUP_ITEMS.map((i) => i.key) as [string, ...string[]];

export const regimeGroupParamsSchema = z.object({ regime: z.enum(REGIME_GROUP_REGIMES) });

/**
 * POST /tasks/regime-groups/:regime/apply. `keys`: only these items of the group (default: all of it).
 * `departments`: the department of each suggested one; without it, an existing department whose name
 * matches (`matchSuggestedDepartment`), else one is created with the suggested name (only in offices
 * that use departments).
 */
export const regimeGroupApplySchema = z.object({
  keys: z.array(z.enum(REGIME_GROUP_KEYS)).min(1, { message: 'Escolha ao menos uma tarefa do grupo' }).max(REGIME_GROUP_KEYS.length).optional(),
  departments: z
    .object({ fiscal: idSchema.optional(), personnel: idSchema.optional(), accounting: idSchema.optional() })
    .default({}),
});
export type RegimeGroupApplyInput = z.input<typeof regimeGroupApplySchema>;

// --- monthly audit ---------------------------------------------------------------------------------

/**
 * The client × recurring task matrix of a competence. `assigneeId` keeps the clients where that member
 * answers for at least one cell (all their cells come, the screen dims the others).
 */
export const taskAuditQuerySchema = z.object({
  competence: monthKeySchema,
  taxRegime: z.enum(TAX_REGIMES).optional(),
  departmentId: idSchema.optional(),
  assigneeId: idSchema.optional(),
  recurringTaskId: idSchema.optional(),
});
export type TaskAuditQuery = z.input<typeof taskAuditQuerySchema>;

// --- processes (flows) and templates --------------------------------------------------------------

const relativeDaysSchema = z
  .int({ message: 'O prazo deve ser um número inteiro de dias' })
  .min(0, { message: 'O prazo deve ficar entre 0 e 365 dias' })
  .max(365, { message: 'O prazo deve ficar entre 0 e 365 dias' });

const stepTitleSchema = z
  .string()
  .trim()
  .min(1, { message: 'Informe o nome da tarefa desta etapa' })
  .max(200, { message: 'Máximo de 200 caracteres' });

/**
 * Step of a process built by hand. Deadline: absolute `dueDate` or `relativeDays` after the previous
 * step is concluded (step 1: after the process is created), computed when the step is activated. The
 * department follows the assignee (like a task); `departmentId` places a step without assignee.
 */
export const flowStepInputSchema = z
  .object({
    title: stepTitleSchema,
    description: optionalText(5000),
    /** Another client for this step only (default: the process's). */
    clientId: nullableId(),
    departmentId: nullableId(),
    categoryId: nullableId(),
    assigneeId: nullableId(),
    priority: z.enum(TASK_PRIORITIES).default('medium'),
    dueDate: optionalDate(),
    relativeDays: relativeDaysSchema.nullish().transform((v) => v ?? null),
  })
  .refine((v) => !(v.dueDate && v.relativeDays !== null), {
    path: ['relativeDays'],
    message: 'Use uma data ou um prazo em dias, não os dois',
  });
export type FlowStepInput = z.input<typeof flowStepInputSchema>;

export const taskFlowInputSchema = z
  .object({
    title: z.string().trim().min(1, { message: 'Informe o nome do processo' }).max(200, { message: 'Máximo de 200 caracteres' }),
    /** Client of every step (null = internal), unless a step sets its own. */
    clientId: nullableId(),
    steps: z.array(flowStepInputSchema).min(1, { message: 'Adicione pelo menos uma etapa' }).max(30, { message: 'Máximo de 30 etapas' }),
    /** Also saves the steps as a template (administrators only; deadlines must be in days). */
    saveAsTemplate: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.saveAsTemplate && v.steps.some((s) => s.dueDate)) {
      ctx.addIssue({ code: 'custom', path: ['saveAsTemplate'], message: 'Para salvar como modelo, use prazos em dias' });
    }
  });
export type TaskFlowInput = z.input<typeof taskFlowInputSchema>;

export const taskFlowQuerySchema = z.object({
  status: z.enum(['active', 'done', 'all']).default('active'),
  clientId: idSchema.optional(),
});
export type TaskFlowQuery = z.input<typeof taskFlowQuerySchema>;

/** Step of a template: relative deadline only (a template never ages), no client (chosen when applying). */
export const flowTemplateStepInputSchema = z.object({
  title: stepTitleSchema,
  description: optionalText(5000),
  departmentId: nullableId(),
  categoryId: nullableId(),
  assigneeId: nullableId(),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  relativeDays: relativeDaysSchema.default(0),
});
export type FlowTemplateStepInput = z.input<typeof flowTemplateStepInputSchema>;

/** PUT replaces the steps; processes already applied keep theirs. */
export const flowTemplateInputSchema = z.object({
  title: z.string().trim().min(1, { message: 'Informe o nome do modelo' }).max(200, { message: 'Máximo de 200 caracteres' }),
  description: optionalText(5000),
  steps: z.array(flowTemplateStepInputSchema).min(1, { message: 'Adicione pelo menos uma etapa' }).max(30, { message: 'Máximo de 30 etapas' }),
});
export type FlowTemplateInput = z.input<typeof flowTemplateInputSchema>;

/** Applying a template: only the client is chosen; the start date is today (set by the server). */
export const applyFlowTemplateSchema = z.object({
  clientId: idSchema.nullish().refine((v) => Boolean(v), { message: 'Selecione o cliente para aplicar o modelo' }).transform((v) => v!),
  /** Name of the process (default: "<template> · <client>"). */
  title: z.string().trim().min(1).max(200).nullish().transform((v) => v ?? null),
});
export type ApplyFlowTemplateInput = z.input<typeof applyFlowTemplateSchema>;

// --- home, calendar, reports ----------------------------------------------------------------------

/**
 * Home summary of a department. Members see their own department; administrators any department or
 * `all`. Default: the member's department (or only their own items when they have none).
 */
export const taskHomeQuerySchema = z.object({
  departmentId: z.union([idSchema, z.literal('all')]).optional(),
  /** Competence of the obligations block and month of the totals (default: current). */
  month: monthKeySchema.optional(),
});
export type TaskHomeQuery = z.input<typeof taskHomeQuerySchema>;

/** Up to 62 days (a month grid of 6 weeks fits). */
export const MAX_CALENDAR_DAYS = 62;

export const taskCalendarQuerySchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    scope: z.enum(TASK_SCOPES).default('all'),
    assigneeId: z.union([idSchema, z.literal('none')]).optional(),
    departmentId: idSchema.optional(),
    clientId: z.union([idSchema, z.literal('internal')]).optional(),
    categoryId: idSchema.optional(),
    kind: z.enum(TASK_KINDS).optional(),
  })
  .refine((v) => v.from <= v.to, { message: 'Data inicial maior que a final', path: ['to'] })
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 < MAX_CALENDAR_DAYS, {
    message: `Escolha um intervalo de até ${MAX_CALENDAR_DAYS} dias`,
    path: ['to'],
  });
export type TaskCalendarQuery = z.input<typeof taskCalendarQuerySchema>;

const reportFilters = {
  from: isoDateSchema,
  to: isoDateSchema,
  departmentId: idSchema.optional(),
  assigneeId: z.union([idSchema, z.literal('none')]).optional(),
  categoryId: idSchema.optional(),
  clientId: z.union([idSchema, z.literal('internal')]).optional(),
  /**
   * Grouped situation: open (overdue included), done (concluded only; canceled have their status),
   * overdue, doneOnTime / doneLate (concluded on or before / after the due date — the legal deadline of
   * an occurrence — by the day of the conclusion in the office time zone).
   */
  situation: z.enum(['open', 'done', 'overdue', 'doneOnTime', 'doneLate']).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  kind: z.enum(TASK_KINDS).optional(),
};
const reportPeriod = (v: { from: string; to: string }) => v.from <= v.to;

/**
 * Tasks with due date (legal deadline, for occurrences) in the period; without due date, created in
 * it. Up to a year.
 */
export const taskReportQuerySchema = z
  .object({
    ...reportFilters,
    page: z.coerce.number().int().min(1).default(1),
    /** Up to 1000 rows per page. */
    pageSize: z.coerce.number().int().min(1).max(1000).default(50),
  })
  .refine(reportPeriod, { message: 'Data inicial maior que a final', path: ['to'] });
export type TaskReportQuery = z.input<typeof taskReportQuerySchema>;

/** CSV export: the same filters, every row (up to the API's ceiling). */
export const taskReportExportQuerySchema = z
  .object(reportFilters)
  .refine(reportPeriod, { message: 'Data inicial maior que a final', path: ['to'] });
export type TaskReportExportQuery = z.input<typeof taskReportExportQuerySchema>;

// --- notes and attachments ------------------------------------------------------------------------

/** Personal note ("Minhas anotações"): visible only to its author; stored encrypted. */
export const taskNoteInputSchema = z.object({
  title: z.string().trim().min(1, { message: 'Informe o título da anotação' }).max(200, { message: 'Máximo de 200 caracteres' }),
  content: optionalText(20000),
});
export type TaskNoteInput = z.input<typeof taskNoteInputSchema>;

/** Base64 of up to MAX_ATTACHMENT_BYTES bytes. */
const MAX_ATTACHMENT_BASE64 = Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4;

/**
 * Task attachment, sent as JSON with the file in base64 (the API checks the size, the type against the
 * file's signature and the extension; the name is sanitized).
 */
export const taskAttachmentInputSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, { message: 'Informe o nome do arquivo' })
    .max(1000, { message: 'Nome de arquivo muito longo' })
    .transform(sanitizeFileName),
  contentType: z.enum(TASK_ATTACHMENT_CONTENT_TYPES, { message: 'Tipo de arquivo não permitido' }),
  content: z
    .string()
    .min(4, { message: 'O arquivo está vazio' })
    .max(MAX_ATTACHMENT_BASE64, { message: 'O arquivo passa de 10 MB' })
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, { message: 'Conteúdo do arquivo inválido' }),
});
export type TaskAttachmentInput = z.input<typeof taskAttachmentInputSchema>;

// ---------------------------------------------------------------------------
// Phase 3: unions (sindicatos) and collective agreements, deadlines, office and contract template
// ---------------------------------------------------------------------------

const unionDocumentSchema = z
  .string({ message: 'Informe o CNPJ do sindicato.' })
  .transform((v) => onlyDigits(v))
  .superRefine((v, ctx) => {
    if (!v) ctx.addIssue({ code: 'custom', message: 'Informe o CNPJ do sindicato.' });
    else if (!isValidCNPJ(v)) ctx.addIssue({ code: 'custom', message: 'CNPJ inválido.' });
  });

const { notes: _addressNotes, ...addressOnly } = addressFields;

/**
 * Registry of a union (spec §13.7). PUT replaces the registry fields; `active` and `clientIds`, when
 * absent, keep what is stored. The collective agreement cycles are NOT here: they have their own
 * request (`PUT /unions/:id/conventions`), so saving the registry can never erase them.
 */
export const unionInputSchema = z.object({
  /** Razão social. */
  name: z.string().trim().min(1, { message: 'Informe o nome do sindicato.' }).max(200, { message: 'Máximo de 200 caracteres' }),
  document: unionDocumentSchema,
  /** Sigla ("SINDCOM"). */
  acronym: optionalText(30),
  /** Categoria representada ("Comerciários"). */
  category: optionalText(120),
  /** Base territorial ("Mogi Guaçu e região"). */
  territory: optionalText(300),
  ...addressOnly,
  phone: optionalPhone(),
  email: optionalEmail(),
  website: optionalText(300),
  responsibleName: optionalText(200),
  /** Cargo ("Presidente"). */
  responsibleRole: optionalText(120),
  responsibleEmail: optionalEmail(),
  responsiblePhone: optionalPhone(),
  /** Month (1–12) the agreement renews every year; the due date is day 1 of it. null = not set. */
  baseMonth: z
    .int({ message: 'Mês inválido' })
    .min(1, { message: 'Mês inválido (1 a 12)' })
    .max(12, { message: 'Mês inválido (1 a 12)' })
    .nullish()
    .transform((v) => v ?? null),
  notes: optionalText(5000),
  /** Absent: true on create, unchanged on update. */
  active: z.boolean().optional(),
  /** Clients whose employees follow this agreement (the full list); absent = keep. */
  clientIds: z
    .array(idSchema)
    .max(5000, { message: 'Máximo de 5000 clientes' })
    .optional()
    .transform((v) => (v ? [...new Set(v)] : v)),
});
export type UnionInput = z.input<typeof unionInputSchema>;

export const unionQuerySchema = paginationQuerySchema.extend({
  /** Name, acronym, category or CNPJ (partial). */
  search: z.string().trim().max(80).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  situation: z.enum(UNION_SITUATIONS).optional(),
});
export type UnionQuery = z.input<typeof unionQuerySchema>;

const cycleYearSchema = z
  .int({ message: 'Ano inválido' })
  .min(UNION_CYCLE_MIN_YEAR, { message: 'Ano inválido' })
  .max(UNION_CYCLE_MAX_YEAR, { message: 'Ano inválido' });

/**
 * The agreement cycles of a union (substitutive: cycles not sent are removed). `year` 2026 =
 * "Convenção Coletiva 2026/2027". Who marked it published and when are recorded by the server.
 */
export const unionConventionsInputSchema = z.object({
  cycles: z
    .array(z.object({ year: cycleYearSchema, published: z.boolean(), note: optionalText(500) }))
    .max(MAX_UNION_CYCLES, { message: `Máximo de ${MAX_UNION_CYCLES} convenções` })
    .refine((list) => new Set(list.map((c) => c.year)).size === list.length, { message: 'Ano repetido na lista' }),
});
export type UnionConventionsInput = z.input<typeof unionConventionsInputSchema>;

/** Marks (or unmarks) one cycle as published: the optimistic toggle with "Desfazer". */
export const unionConventionPublishSchema = z.object({ published: z.boolean() });
export const unionConventionParamsSchema = z.object({ id: idSchema, year: z.coerce.number().pipe(cycleYearSchema) });

/** Documents and/or collective agreements. */
export const deadlinesQuerySchema = z.object({
  kind: z.enum(['documents', 'conventions']).optional(),
});
export type DeadlinesQuery = z.input<typeof deadlinesQuerySchema>;

// --- office -----------------------------------------------------------------------------------------

const MAX_OFFICE_IMAGE_DATA_URI = Math.ceil(MAX_OFFICE_IMAGE_BYTES / 3) * 4 + 64;

/**
 * `data:image/(png|jpeg|webp);base64,…` up to 500 KB (never SVG). The API also checks that the bytes
 * carry the signature of the declared type.
 */
export const officeImageSchema = z
  .string()
  .max(MAX_OFFICE_IMAGE_DATA_URI, { message: 'A imagem passa de 500 KB.' })
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/, { message: 'Use PNG, JPG ou WebP.' });

export const officeLogoInputSchema = z.object({ logo: officeImageSchema });
export type OfficeLogoInput = z.infer<typeof officeLogoInputSchema>;

const PIX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIX_RANDOM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The Pix key normalized for its type, or null when it is not valid for it. */
export function normalizePixKey(type: (typeof PIX_KEY_TYPES)[number], key: string): string | null {
  const value = key.trim();
  switch (type) {
    case 'cnpj':
      return isValidCNPJ(onlyDigits(value)) ? onlyDigits(value) : null;
    case 'cpf':
      return isValidCPF(onlyDigits(value)) ? onlyDigits(value) : null;
    case 'email':
      return value.length <= 77 && PIX_EMAIL.test(value) ? value.toLowerCase() : null;
    case 'phone': {
      // +55 DD 9XXXX-XXXX (the key format of the Pix directory).
      const digits = onlyDigits(value).replace(/^55(?=\d{10,11}$)/, '');
      return /^\d{10,11}$/.test(digits) ? `+55${digits}` : null;
    }
    case 'random':
      return PIX_RANDOM.test(value) ? value.toLowerCase() : null;
  }
}

/** Office registry (spec §13.9): one per workspace. Logo and contract template have their own requests. */
export const officeInputSchema = z
  .object({
    document: z
      .string({ message: 'Informe o CNPJ do escritório.' })
      .transform((v) => onlyDigits(v))
      .superRefine((v, ctx) => {
        if (!v) ctx.addIssue({ code: 'custom', message: 'Informe o CNPJ do escritório.' });
        else if (!isValidCNPJ(v)) ctx.addIssue({ code: 'custom', message: 'CNPJ inválido.' });
      }),
    legalName: z.string().trim().min(1, { message: 'Informe a razão social.' }).max(200, { message: 'Máximo de 200 caracteres' }),
    tradeName: optionalText(200),
    stateRegistration: optionalText(40),
    municipalRegistration: optionalText(40),
    ...addressOnly,
    phone: optionalPhone(),
    email: optionalEmail(),
    website: optionalText(300),
    responsibleName: optionalText(200),
    /** Signs the contract for the office: personal data, stored encrypted. */
    responsibleDocument: z
      .string()
      .nullish()
      .transform((v) => (v ? onlyDigits(v) : null))
      .refine((v) => v === null || isValidCPF(v), { message: 'CPF inválido.' }),
    responsibleEmail: optionalEmail(),
    responsiblePhone: optionalPhone(),
    pixKeyType: z.enum(PIX_KEY_TYPES).nullish().transform((v) => v ?? null),
    pixKey: optionalText(77),
  })
  .superRefine((v, ctx) => {
    if (v.pixKey && !v.pixKeyType) ctx.addIssue({ code: 'custom', path: ['pixKeyType'], message: 'Escolha o tipo da chave Pix.' });
    if (v.pixKey && v.pixKeyType && normalizePixKey(v.pixKeyType, v.pixKey) === null) {
      ctx.addIssue({ code: 'custom', path: ['pixKey'], message: 'Chave Pix inválida para o tipo escolhido.' });
    }
  })
  .transform((v) => ({
    ...v,
    pixKeyType: v.pixKey ? v.pixKeyType : null,
    pixKey: v.pixKey && v.pixKeyType ? normalizePixKey(v.pixKeyType, v.pixKey) : null,
  }));
export type OfficeInput = z.input<typeof officeInputSchema>;

// --- contract template ------------------------------------------------------------------------------

export const contractBlockSchema = z.object({
  type: z.enum(CONTRACT_BLOCK_TYPES, { message: 'Tipo de bloco desconhecido.' }),
  text: z
    .string()
    .max(MAX_CONTRACT_BLOCK_CHARS, { message: `O bloco passa de ${MAX_CONTRACT_BLOCK_CHARS.toLocaleString('pt-BR')} caracteres.` })
    .optional(),
  rule: z.enum(CONTRACT_BLOCK_RULES).optional(),
});

/**
 * Saves the contract template. Absent = keep; `blocks: null` = the factory template; `watermark: null`
 * = the factory watermark. "Voltar ao modelo de fábrica" has its own request, saved right away.
 */
export const contractTemplateInputSchema = z
  .object({
    blocks: z
      .array(contractBlockSchema)
      .max(MAX_CONTRACT_BLOCKS, { message: `O contrato pode ter no máximo ${MAX_CONTRACT_BLOCKS} blocos.` })
      .refine((list) => list.reduce((n, b) => n + (b.text?.length ?? 0), 0) <= MAX_CONTRACT_TOTAL_CHARS, {
        message: `O contrato passa de ${MAX_CONTRACT_TOTAL_CHARS.toLocaleString('pt-BR')} caracteres.`,
      })
      .nullable()
      .optional(),
    watermark: officeImageSchema.nullable().optional(),
    watermarkEnabled: z.boolean().optional(),
  })
  .refine((v) => v.blocks !== undefined || v.watermark !== undefined || v.watermarkEnabled !== undefined, {
    message: 'Nada para salvar',
  });
export type ContractTemplateInput = z.input<typeof contractTemplateInputSchema>;
