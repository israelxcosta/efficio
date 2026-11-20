// Client onboarding (docs/onboarding-cliente.md): the office's template (one per workspace), the
// adjustments of one client, the public links sent by WhatsApp/e-mail and what the API returns.
// The factory content is `onboarding-template.ts`; the assembly is `utils/onboarding.ts` (pure, used by
// the API, the demo and the web preview).

import { z } from 'zod';
import type { RecurrenceFrequency, TaxRegime } from './constants';
import { onboardingHideableKeys, onboardingTextKeys } from './onboarding-template';
import { isValidCPF, onlyDigits } from './utils/documents';
import type { ISODate } from './utils/dates';

/** The 19 slides of the document, in order. */
export const ONBOARDING_SLIDE_KEYS = [
  'cover',
  'summary',
  'howWeWork',
  'team',
  'numbers',
  'fiscal',
  'accounting',
  'personnel',
  'month',
  'documents',
  'sending',
  'admission',
  'vacation',
  'termination',
  'safety',
  'esocial',
  'fines',
  'firstSteps',
  'confirm',
] as const;
export type OnboardingSlideKey = (typeof ONBOARDING_SLIDE_KEYS)[number];

/** Areas of the obligation tables (slides fiscal, accounting, personnel); `other` = a department the system does not recognize. */
export const ONBOARDING_AREAS = ['fiscal', 'accounting', 'personnel', 'other'] as const;
export type OnboardingArea = (typeof ONBOARDING_AREAS)[number];

export const ONBOARDING_AREA_LABELS: Record<OnboardingArea, string> = {
  fiscal: 'Fiscal',
  accounting: 'Contábil',
  personnel: 'Pessoal',
  other: 'Outros',
};

/** Yes/no rules of the office's onboarding parameters (`OnboardingParams.rules`). */
export const ONBOARDING_RULE_KEYS = ['admissionExamByClient', 'terminationRequestFirst', 'unionAssistance', 'payrollAdvance'] as const;
export type OnboardingRuleKey = (typeof ONBOARDING_RULE_KEYS)[number];

/** When a block shows: every listed rule must hold (no rule = always). */
export interface OnboardingCondition {
  /** The client's regime is one of these. */
  regimes?: TaxRegime[];
  /** The client's regime is none of these. */
  notRegimes?: TaxRegime[];
  /**
   * `some`: at least one employee; `none`: no employee. Only for supporting sentences (subtitles): the
   * personnel content shows for every client, with or without employees (owner's decision).
   */
  employees?: 'some' | 'none';
  /** The office's yes/no parameters (e.g. `{ unionAssistance: true }`). */
  rules?: Partial<Record<OnboardingRuleKey, boolean>>;
}

/**
 * A text line of a slide. In the obligation slides: label = obligation (what the office does), detail =
 * what we need from the client, due = until when (internal deadline of the parameters). The client's
 * document never shows legal deadlines of ancillary obligations: those concern only the office.
 */
export interface OnboardingTemplateItem {
  id: string;
  label?: string;
  text?: string;
  detail?: string;
  /** Monospaced text (e-mail subject). */
  code?: string;
  /** Obligation slides: until when the client delivers (absent: nothing to deliver). */
  due?: string;
  when?: OnboardingCondition;
  /**
   * Obligation slides: a fixed row that stands for this catalog recurring task. It shows only when the
   * task does not apply to the client (or its row is hidden), so the table never repeats it.
   */
  covers?: string;
}

export interface OnboardingTemplateSubtitle {
  id: string;
  text: string;
  when?: OnboardingCondition;
}

export interface OnboardingTemplateSlide {
  key: OnboardingSlideKey;
  title: string;
  /** Small line above the title (cover). */
  kicker?: string;
  /** The first one whose condition holds is used. */
  subtitles: OnboardingTemplateSubtitle[];
  items: OnboardingTemplateItem[];
  /** Obligation slides: the table gets the recurring tasks of this area that apply to the client, then the items. */
  area?: Exclude<OnboardingArea, 'other'>;
}

/**
 * "O que precisamos de você" and "até quando" of a catalog recurring task (`recurring_tasks.catalog_key`).
 * No legal deadline: the client's document shows only what the client delivers and when.
 */
export interface OnboardingObligationText {
  need: string;
  /** Internal deadline (absent: the office needs nothing from the client for it). */
  due?: string;
}

/** Departments of the onboarding (e-mails, who receives each document). */
export const ONBOARDING_DEPARTMENTS = ['fiscal', 'accounting', 'personnel'] as const;
export type OnboardingDepartment = (typeof ONBOARDING_DEPARTMENTS)[number];
export const ONBOARDING_DEPARTMENT_LABELS: Record<OnboardingDepartment, string> = { fiscal: 'Fiscal', accounting: 'Contábil', personnel: 'Pessoal' };

/** Standard e-mail subjects (`{{assuntos.*}}`; may use `{{competencia}}` and `{{razaoSocial}}`). */
export const ONBOARDING_SUBJECT_KEYS = ['statements', 'invoices', 'payrollVariables', 'admission', 'vacation', 'termination'] as const;
export type OnboardingSubjectKey = (typeof ONBOARDING_SUBJECT_KEYS)[number];

/**
 * Onboarding parameters of the office (Configurações › Onboarding): its own contact data, e-mails by
 * department, standard subjects, internal deadlines and yes/no rules. The texts use them through
 * placeholders (`{{prazos.notas}}`, `{{emails.fiscal}}`, `{{assuntos.extratos}}`…) and the yes/no rules
 * through conditions (`when.rules`). Name, phone, e-mail, site, address and logo come from the office
 * registry (Configurações › Escritório), never from here.
 */
export interface OnboardingParams {
  contact: {
    /** Customer service WhatsApp. */
    whatsapp: string | null;
    /** "Segunda a sexta, das 8h às 18h". */
    hours: string | null;
    crc: string | null;
  };
  emails: Record<OnboardingDepartment, string>;
  subjects: Record<OnboardingSubjectKey, string>;
  deadlines: {
    /** Invoices and bank statements: day of the following month. */
    documentsDay: number;
    /** Card machines/PIX sales report: day of the following month. */
    cardsDay: number;
    /** Department that receives the card machines/PIX report. */
    cardsDepartment: OnboardingDepartment;
    /** Payroll variables (absences, overtime, commissions): day of the following month. */
    payrollVariablesDay: number;
    /** Partners' pro-labore amounts: day of the following month. */
    proLaboreDay: number;
    /** Admission data: business days before the first day (0 = up to the day before). */
    admissionBusinessDays: number;
    /** Vacation request to the office: days before it starts. */
    vacationDaysBefore: number;
    /** DEFIS data (Simples Nacional): day/month of the year. */
    defisDay: number;
    defisMonth: number;
    /** Validity of the links sent to the client, in days. */
    linkDays: number;
  };
  rules: Record<OnboardingRuleKey, boolean>;
}

/** The office data of the first version (before the parameters): still read from saved templates. */
export interface OnboardingLegacyOfficeData {
  name?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  hours?: string | null;
  crc?: string | null;
  emails?: Partial<Record<OnboardingDepartment, string>>;
  deadlines?: Partial<{ documentsDay: number; payrollVariablesDay: number; admissionBusinessDays: number; vacationDaysBefore: number }>;
}

/** What the office saved (stored as is; absent text = factory text). */
export interface OnboardingTemplateStored {
  /** Absent in templates saved before the parameters: `office` is converted (`normalizeOnboardingParams`). */
  params?: Partial<OnboardingParams>;
  /** First version (read only). */
  office?: OnboardingLegacyOfficeData;
  /** Text key → text (`onboardingTextKeys()`). Only what differs from the factory. */
  texts: Record<string, string>;
  /** Items and task rows hidden (`onboardingHideableKeys()`). */
  hidden: string[];
}

/** What a client's adjustment stores. */
export interface OnboardingOverridesStored {
  texts: Record<string, string>;
  hidden: string[];
  /** Number of employees shown for this client (null: the last "+ Empregados" charge, else 0). */
  employees: number | null;
}

// --- input -----------------------------------------------------------------------------------------

export const MAX_ONBOARDING_TEXT_CHARS = 1000;
/** Factory link validity (owner's decision, 18/11/2026); the office may change it (`params.deadlines.linkDays`). */
export const ONBOARDING_LINK_DAYS = 30;
export const MAX_ONBOARDING_LINK_DAYS = 90;
export const MAX_ONBOARDING_SUBJECT_CHARS = 150;
export const ONBOARDING_LINK_CHANNELS = ['whatsapp', 'email'] as const;
export type OnboardingLinkChannel = (typeof ONBOARDING_LINK_CHANNELS)[number];
export const ONBOARDING_LINK_CHANNEL_LABELS: Record<OnboardingLinkChannel, string> = { whatsapp: 'WhatsApp', email: 'E-mail' };
/** Recipients from the client's registry: the company's phone/e-mail or the responsible's. */
export const ONBOARDING_CONTACTS = ['company', 'responsible'] as const;
export type OnboardingContact = (typeof ONBOARDING_CONTACTS)[number];
export const ONBOARDING_CONTACT_LABELS: Record<OnboardingContact, string> = { company: 'Empresa', responsible: 'Responsável' };

/** Audit actions (the web translates them). */
export const ONBOARDING_AUDIT_ACTIONS = {
  linkCreated: 'onboarding.link_created',
  linkRevoked: 'onboarding.link_revoked',
  confirmed: 'onboarding.confirmed',
  templateUpdated: 'onboarding.template_updated',
  overridesUpdated: 'onboarding.overrides_updated',
} as const;

const text = (max: number) =>
  z
    .string()
    .max(max, { message: `Use no máximo ${max} caracteres` })
    .refine((v) => !v.includes('\u0000'), { message: 'Texto inválido' });
const optionalLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: `Use no máximo ${max} caracteres` })
    .nullish()
    .transform((v) => (v ? v : null));
const email = z.string().trim().toLowerCase().pipe(z.email({ message: 'E-mail inválido' }).max(200));
const day = z.int({ message: 'Informe um dia' }).min(1, { message: 'Dia de 1 a 31' }).max(31, { message: 'Dia de 1 a 31' });

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const range = (min: number, max: number, unit: string) =>
  z
    .int({ message: 'Informe um número inteiro' })
    .min(min, { message: `De ${min} a ${max} ${unit}` })
    .max(max, { message: `De ${min} a ${max} ${unit}` });
const subject = z
  .string()
  .trim()
  .min(1, { message: 'Informe o assunto' })
  .max(MAX_ONBOARDING_SUBJECT_CHARS, { message: `Use no máximo ${MAX_ONBOARDING_SUBJECT_CHARS} caracteres` })
  .refine((v) => !/[\u0000-\u001f]/.test(v), { message: 'Assunto inválido' });

export const onboardingParamsSchema = z.object({
  contact: z.object({ whatsapp: optionalLine(40), hours: optionalLine(120), crc: optionalLine(40) }),
  emails: z.object({ fiscal: email, personnel: email, accounting: email }),
  subjects: z.object({
    statements: subject,
    invoices: subject,
    payrollVariables: subject,
    admission: subject,
    vacation: subject,
    termination: subject,
  }),
  deadlines: z
    .object({
      documentsDay: day,
      cardsDay: day,
      cardsDepartment: z.enum(ONBOARDING_DEPARTMENTS, { message: 'Escolha o departamento' }),
      payrollVariablesDay: day,
      proLaboreDay: day,
      admissionBusinessDays: range(0, 30, 'dias úteis'),
      vacationDaysBefore: range(0, 60, 'dias'),
      defisDay: day,
      defisMonth: z.int({ message: 'Informe o mês' }).min(1, { message: 'Mês de 1 a 12' }).max(12, { message: 'Mês de 1 a 12' }),
      linkDays: range(1, MAX_ONBOARDING_LINK_DAYS, 'dias'),
    })
    .refine((d) => d.defisDay <= (MONTH_DAYS[d.defisMonth - 1] ?? 31), { message: 'Data inexistente', path: ['defisDay'] }),
  rules: z.object({
    admissionExamByClient: z.boolean(),
    terminationRequestFirst: z.boolean(),
    unionAssistance: z.boolean(),
    payrollAdvance: z.boolean(),
  }),
});

/** Texts by key and hidden keys of the factory template; unknown keys are refused (a typo would be saved and never show). */
let textKeys: Set<string> | null = null;
let hideableKeys: Set<string> | null = null;
const textsSchema = z
  .record(z.string().max(120), text(MAX_ONBOARDING_TEXT_CHARS))
  .default({})
  .superRefine((texts, ctx) => {
    textKeys ??= new Set(onboardingTextKeys());
    for (const key of Object.keys(texts)) {
      if (!textKeys.has(key)) ctx.addIssue({ code: 'custom', message: 'Texto desconhecido do modelo', path: [key] });
    }
  });
const hiddenSchema = z
  .array(z.string().max(120))
  .max(500)
  .default([])
  .superRefine((hidden, ctx) => {
    hideableKeys ??= new Set(onboardingHideableKeys());
    hidden.forEach((key, i) => {
      if (!hideableKeys!.has(key)) ctx.addIssue({ code: 'custom', message: 'Item desconhecido do modelo', path: [i] });
    });
  })
  .transform((hidden) => [...new Set(hidden)].sort());

/** PUT /onboarding/template: replaces what the office saved (send everything; texts only where they differ). */
export const onboardingTemplateInputSchema = z.object({
  params: onboardingParamsSchema,
  texts: textsSchema,
  hidden: hiddenSchema,
});
export type OnboardingTemplateInput = z.input<typeof onboardingTemplateInputSchema>;

/** PUT /clients/:id/onboarding/overrides: replaces the client's adjustment (empty = none). */
export const onboardingOverridesInputSchema = z.object({
  texts: textsSchema,
  hidden: hiddenSchema,
  employees: z.int().min(0).max(100_000).nullish().transform((v) => v ?? null),
});
export type OnboardingOverridesInput = z.input<typeof onboardingOverridesInputSchema>;

/**
 * POST /clients/:id/onboarding/links. The recipient is a contact of the client's registry (`contact`:
 * the company's or the responsible's phone/e-mail) or typed (`to`: phone for WhatsApp, e-mail for e-mail).
 */
export const onboardingLinkInputSchema = z
  .object({
    channel: z.enum(ONBOARDING_LINK_CHANNELS),
    contact: z.enum(ONBOARDING_CONTACTS).optional(),
    to: z.string().trim().min(1).max(200).optional(),
  })
  .refine((v) => (v.contact === undefined) !== (v.to === undefined), {
    message: 'Escolha um contato do cadastro ou informe o destino',
    path: ['contact'],
  })
  .superRefine((v, ctx) => {
    if (v.to === undefined) return;
    if (v.channel === 'email' && !z.email().safeParse(v.to).success) ctx.addIssue({ code: 'custom', message: 'E-mail inválido', path: ['to'] });
    if (v.channel === 'whatsapp' && !/^\d{10,13}$/.test(onlyDigits(v.to))) {
      ctx.addIssue({ code: 'custom', message: 'Telefone inválido', path: ['to'] });
    }
  });
export type OnboardingLinkInput = z.input<typeof onboardingLinkInputSchema>;

/** POST /public/onboarding/:token/confirm. */
export const onboardingConfirmInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, { message: 'Informe seu nome completo' })
    .max(120, { message: 'Use no máximo 120 caracteres' })
    .refine((v) => !v.includes('\u0000'), { message: 'Nome inválido' }),
  cpf: z
    .string()
    .transform((v) => onlyDigits(v))
    .refine((v) => isValidCPF(v), { message: 'CPF inválido' }),
});
export type OnboardingConfirmInput = z.input<typeof onboardingConfirmInputSchema>;

/** Public token in the path (`/o/<token>`: 32 random bytes in base64url = 43 characters). */
export const onboardingTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, { message: 'Link inválido' });

// --- responses -------------------------------------------------------------------------------------

export interface OnboardingSlideItem {
  id: string;
  label: string | null;
  text: string | null;
  detail: string | null;
  code: string | null;
}

export interface OnboardingObligationRow {
  /** Catalog key, `task-<n>` for a recurring task without one, or the template item id. */
  key: string;
  area: OnboardingArea;
  /** The obligation (what the office does for the client). */
  name: string;
  /** What we need from the client. */
  need: string;
  /** Until when (internal deadline); null when the office needs nothing. Never a legal deadline. */
  due: string | null;
  /** `task`: a recurring task that applies to the client; `template`: a fixed row of the template. */
  source: 'task' | 'template';
}

export interface OnboardingSlide {
  key: OnboardingSlideKey;
  /** 1–18 (hidden slides do not exist: every slide always shows). */
  number: number;
  title: string;
  kicker: string | null;
  subtitle: string | null;
  items: OnboardingSlideItem[];
  /** Obligation slides (fiscal, accounting, personnel): the table; null on the others. */
  table: OnboardingObligationRow[] | null;
}

/** The assembled document (always the current version). */
export interface OnboardingDocument {
  /** "Efficio Contabilidade · Onboarding do cliente · RAZÃO SOCIAL". */
  title: string;
  /** Latest relevant change (template, adjustment, client, its recurring tasks and unions). */
  updatedAt: string;
  client: {
    name: string;
    tradeName: string | null;
    /** Formatted (00.000.000/0000-00). */
    cnpj: string;
    regime: TaxRegime | null;
    regimeLabel: string;
    clientSince: ISODate | null;
    employees: number;
    /** Union(s)/agreement of the registry, or null. */
    union: string | null;
  };
  office: {
    /** From the office registry (trade name, else legal name), else "Efficio Contabilidade". */
    name: string;
    /** The office registry's logo (Configurações › Escritório), `data:image/...;base64,…`, or null (the deck shows the Efficio wordmark). */
    logo: string | null;
    /** Registry phone, e-mail, site and address. */
    phone: string | null;
    email: string | null;
    website: string | null;
    address: string | null;
    /** Onboarding parameters. */
    whatsapp: string | null;
    hours: string | null;
    crc: string | null;
    emails: OnboardingParams['emails'];
  };
  slides: OnboardingSlide[];
  /** Rows of every area (the obligation slides carry fiscal/accounting/personnel; `other` goes on the fiscal slide). */
  obligations: Record<OnboardingArea, OnboardingObligationRow[]>;
  /** Fields without value that the document uses (e.g. `escritorio.whatsapp`): shown as "—". */
  missing: string[];
}

export interface OnboardingTemplateResponse {
  /** Effective parameters (factory values where nothing was saved). */
  params: OnboardingParams;
  /** Only the texts the office changed. */
  texts: Record<string, string>;
  hidden: string[];
  /** null = never saved (factory template). */
  updatedAt: string | null;
  updatedByName: string | null;
}

export interface OnboardingOverridesResponse {
  texts: Record<string, string>;
  hidden: string[];
  employees: number | null;
  updatedAt: string | null;
  updatedByName: string | null;
}

export interface OnboardingLinkCreated {
  id: string;
  /** Relative to the web origin: `/o/<token>`. The token is shown only now (only its hash is stored). */
  path: string;
  /** Absolute URL from the app address (`APP_URL`; in the demo with `#`). */
  url: string;
  channel: OnboardingLinkChannel;
  expiresAt: string;
  /** Destination: phone digits with 55 (WhatsApp, for `wa.me/<to>`) or the e-mail. */
  to: string;
  recipientName: string | null;
  /** WhatsApp: ready-made message with the URL. E-mail: the same text, for the body. */
  message: string;
}

export interface OnboardingLinkView {
  id: string;
  channel: OnboardingLinkChannel;
  /** Masked destination (e.g. `(19) 9••••-4321`, `ma••••@empresa.com.br`). */
  to: string;
  recipientName: string | null;
  sentAt: string;
  sentByName: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedByName: string | null;
  status: 'active' | 'expired' | 'revoked';
  accessCount: number;
  firstAccessAt: string | null;
  lastAccessAt: string | null;
  confirmedAt: string | null;
}

export interface OnboardingAccessView {
  id: string;
  linkId: string;
  at: string;
  device: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  browser: string | null;
  os: string | null;
  /** Truncated: /24 (IPv4) or /48 (IPv6), e.g. `189.6.12.x`. */
  ip: string | null;
  /** Approximate city: not collected yet (always null). */
  city: string | null;
}

export interface OnboardingConfirmationView {
  linkId: string;
  name: string;
  /** `•••.456.789-••`. */
  cpf: string;
  at: string;
}

/** GET /clients/:id/onboarding: the card and the timeline of the client's page. */
/**
 * A link is only created once the office saved the Parâmetros do onboarding (its e-mails, deadlines and
 * contact): otherwise the client would receive the factory values (Efficio's e-mails) as the office's.
 */
export const ONBOARDING_PARAMS_REQUIRED_MESSAGE = 'Preencha os Parâmetros do onboarding em Configurações antes de enviar o link.';

export interface OnboardingHistoryResponse {
  /** Whether the office saved the Parâmetros do onboarding (false: the preview shows the factory ones and sending is refused). */
  paramsSaved?: boolean;
  links: OnboardingLinkView[];
  accesses: { items: OnboardingAccessView[]; count: number; firstAt: string | null; lastAt: string | null };
  /** The latest confirmation (any link). */
  confirmation: OnboardingConfirmationView | null;
}

/** GET /public/onboarding/:token. */
export interface PublicOnboardingResponse {
  document: OnboardingDocument;
  expiresAt: string;
  /** Whether this link already has a reading confirmation (and when). */
  confirmedAt: string | null;
}

export interface PublicOnboardingConfirmResponse {
  confirmedAt: string;
}

/** A recurring task of the registry that applies to the client (input of the assembly). */
export interface OnboardingRecurringInput {
  catalogKey: string | null;
  name: string;
  /** Department name (matched to the area). */
  department: string | null;
  period: RecurrenceFrequency;
  dueDay: number;
  dueMonth: number | null;
  referenceOffset: number;
}
