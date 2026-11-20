// Client onboarding (docs/onboarding-cliente.md, docs/api.md → "Onboarding do cliente"): the office's
// template (one per workspace, what differs from the factory content of packages/shared), a client's
// adjustment, the assembled document (always the current version: computed on every read), the links
// sent to the client and their history (accesses, reading confirmation). Runs inside the tenant
// transaction of the request (lib/scoped-context.ts); the public page reuses `loadDocument` and the
// access/confirmation writers from `public.ts`.

import { and, asc, count, desc, eq, inArray, lt, max, min, sql } from 'drizzle-orm';
import {
  buildOnboardingDocument,
  formatOfficeAddress,
  maskCpf,
  normalizeOnboardingParams,
  monthKey,
  onboardingFactoryText,
  onboardingHideableKeys,
  onboardingMessage,
  onlyDigits,
  ONBOARDING_FACTORY_VERSION,
  ONBOARDING_PARAMS_REQUIRED_MESSAGE,
  type OnboardingAccessView,
  type OnboardingDocument,
  type OnboardingHistoryResponse,
  type OnboardingLinkChannel,
  type OnboardingLinkCreated,
  type OnboardingLinkView,
  type OnboardingOverridesResponse,
  type OnboardingOverridesStored,
  type OnboardingRecurringInput,
  type OnboardingTemplateResponse,
  type OnboardingTemplateStored,
  onboardingLinkInputSchema,
  onboardingOverridesInputSchema,
  onboardingTemplateInputSchema,
} from '@effinance/shared';
import type { z } from 'zod';
import type { DbExecutor } from '../../db/client';
import {
  offices,
  onboardingAccesses,
  onboardingClientOverrides,
  onboardingLinks,
  onboardingTemplates,
  recurringTaskClients,
  taskDepartments,
  transactions,
  unionClients,
  unions,
  type ContactRow,
  type OnboardingLinkRow,
} from '../../db/schema';
import type { FieldCipher } from '../../lib/crypto/field-cipher';
import { randomToken, sha256Hex } from '../../lib/crypto/encoding';
import { NotFoundError, ValidationError } from '../../lib/errors';
import type { ScopedContext } from '../../lib/scoped-context';
import { loadClientUnions } from '../clients/fiscal';
import { getClientOrThrow } from '../common/ownership';
import { getBranding } from '../office/service';
import { appliesTo, loadDefs, type GenClient } from '../tasks/generation';

const LINKS = 'onboarding_links';
const CONTACTS = 'contacts';
/** Accesses listed in the history (the count covers all). */
export const HISTORY_ACCESS_LIMIT = 200;

/** What the document needs from the request context (the public page has no user). */
export type DocumentContext = Pick<ScopedContext, 'db' | 'workspaceId' | 'cipher' | 'today'>;
type Ctx = ScopedContext;

// --- template --------------------------------------------------------------------------------------

let knownHideable: Set<string> | null = null;
/**
 * Saved texts and hidden keys the current template still has: a block removed from the factory content
 * (e.g. the MEI rows "with employees", now rows for everyone) is dropped, so the editor can save again.
 */
function known(content: { texts?: Record<string, string>; hidden?: string[] } | null | undefined) {
  knownHideable ??= new Set(onboardingHideableKeys());
  return {
    texts: Object.fromEntries(Object.entries(content?.texts ?? {}).filter(([key]) => onboardingFactoryText(key) !== undefined)),
    hidden: (content?.hidden ?? []).filter((key) => knownHideable!.has(key)),
  };
}

/** Keeps only the texts that differ from the factory (an unchanged text follows future factory updates). */
function onlyChanged(texts: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(texts).filter(([key, value]) => onboardingFactoryText(key) !== value));
}

async function templateRow(db: DbExecutor, workspaceId: string) {
  const [row] = await db.select().from(onboardingTemplates).where(eq(onboardingTemplates.workspaceId, workspaceId));
  return row ?? null;
}

/** Whether the office saved its Parâmetros do onboarding (a template row carrying `params`). */
function paramsSaved(row: Awaited<ReturnType<typeof templateRow>>): boolean {
  const content = row?.content as { params?: unknown } | null | undefined;
  return typeof content?.params === 'object' && content.params !== null;
}

export async function getTemplate(ctx: Pick<Ctx, 'db' | 'workspaceId'>): Promise<OnboardingTemplateResponse> {
  const row = await templateRow(ctx.db, ctx.workspaceId);
  return {
    params: normalizeOnboardingParams(row?.content),
    ...known(row?.content),
    updatedAt: row?.updatedAt.toISOString() ?? null,
    updatedByName: row?.updatedByName ?? null,
  };
}

export async function saveTemplate(ctx: Ctx, input: z.output<typeof onboardingTemplateInputSchema>): Promise<OnboardingTemplateResponse> {
  const content: OnboardingTemplateStored = { params: input.params, texts: onlyChanged(input.texts), hidden: input.hidden };
  await ctx.db
    .insert(onboardingTemplates)
    .values({ workspaceId: ctx.workspaceId, content, updatedBy: ctx.userId, updatedByName: ctx.userName })
    .onConflictDoUpdate({
      target: onboardingTemplates.workspaceId,
      set: { content, updatedBy: ctx.userId, updatedByName: ctx.userName, updatedAt: new Date() },
    });
  return getTemplate(ctx);
}

// --- client's adjustment ---------------------------------------------------------------------------

async function overridesRow(db: DbExecutor, workspaceId: string, clientId: string) {
  const [row] = await db
    .select()
    .from(onboardingClientOverrides)
    .where(and(eq(onboardingClientOverrides.workspaceId, workspaceId), eq(onboardingClientOverrides.clientId, clientId)));
  return row ?? null;
}

export async function getOverrides(ctx: Pick<Ctx, 'db' | 'workspaceId'>, clientId: string): Promise<OnboardingOverridesResponse> {
  await getClientOrThrow(ctx.db, ctx.workspaceId, clientId);
  const row = await overridesRow(ctx.db, ctx.workspaceId, clientId);
  return {
    ...known(row?.content),
    employees: row?.content.employees ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
    updatedByName: row?.updatedByName ?? null,
  };
}

/** Replaces the adjustment; an empty one (no text, nothing hidden, no employees) removes the row. */
export async function saveOverrides(
  ctx: Ctx,
  clientId: string,
  input: z.output<typeof onboardingOverridesInputSchema>,
): Promise<OnboardingOverridesResponse> {
  await getClientOrThrow(ctx.db, ctx.workspaceId, clientId);
  const content: OnboardingOverridesStored = { texts: input.texts, hidden: input.hidden, employees: input.employees };
  if (Object.keys(content.texts).length === 0 && content.hidden.length === 0 && content.employees === null) {
    await ctx.db
      .delete(onboardingClientOverrides)
      .where(and(eq(onboardingClientOverrides.workspaceId, ctx.workspaceId), eq(onboardingClientOverrides.clientId, clientId)));
  } else {
    await ctx.db
      .insert(onboardingClientOverrides)
      .values({ workspaceId: ctx.workspaceId, clientId, content, updatedBy: ctx.userId, updatedByName: ctx.userName })
      .onConflictDoUpdate({
        target: [onboardingClientOverrides.workspaceId, onboardingClientOverrides.clientId],
        set: { content, updatedBy: ctx.userId, updatedByName: ctx.userName, updatedAt: new Date() },
      });
  }
  return getOverrides(ctx, clientId);
}

// --- document --------------------------------------------------------------------------------------

const latest = (dates: (Date | string | null | undefined)[]): Date => {
  let out = new Date(`${ONBOARDING_FACTORY_VERSION}T12:00:00Z`);
  for (const d of dates) {
    if (!d) continue;
    const date = d instanceof Date ? d : new Date(d);
    if (!Number.isNaN(date.getTime()) && date > out) out = date;
  }
  return out;
};

/**
 * Recurring tasks of the registry that apply to the client (the rule of the occurrences: its regimes or
 * chosen by hand, minus the exceptions), not ended before the current competence. Internal ones and
 * tasks' recurrences are not obligations of the client.
 */
async function applicableRecurring(ctx: DocumentContext, client: ContactRow) {
  const current = monthKey(ctx.today);
  const gen: GenClient = {
    id: client.id,
    name: client.name,
    tradeName: client.tradeName,
    taxRegime: client.taxRegime,
    status: client.status,
    contractStartDate: client.contractStartDate,
    inactivatedAt: client.inactivatedAt,
  };
  const defs = (await loadDefs(ctx, undefined, { origin: 'registry' })).filter(
    (d) => !d.row.internal && (d.row.endCompetence === null || d.row.endCompetence >= current) && appliesTo(d, gen),
  );
  if (defs.length === 0) return { recurring: [] as OnboardingRecurringInput[], dates: [] as Date[] };
  const departments = await ctx.db
    .select({ id: taskDepartments.id, name: taskDepartments.name })
    .from(taskDepartments)
    .where(and(eq(taskDepartments.workspaceId, ctx.workspaceId), inArray(taskDepartments.id, [...new Set(defs.map((d) => d.row.departmentId))])));
  const nameOf = new Map(departments.map((d) => [d.id, d.name]));
  return {
    recurring: defs.map((d) => ({
      catalogKey: d.row.catalogKey,
      name: d.row.name,
      department: nameOf.get(d.row.departmentId) ?? null,
      period: d.row.period,
      dueDay: d.row.dueDay,
      dueMonth: d.row.dueMonth,
      referenceOffset: d.row.referenceOffset,
    })),
    dates: defs.map((d) => d.row.updatedAt),
  };
}

/** Employees of the client's last generated fee ("+ Empregados" of the latest competence; 0 without it). */
async function employeesOf(db: DbExecutor, workspaceId: string, clientId: string): Promise<{ employees: number | null; at: Date | null }> {
  const [fee] = await db
    .select({ competence: max(transactions.feeCompetence) })
    .from(transactions)
    .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.contactId, clientId), eq(transactions.feeKind, 'fee')));
  if (!fee?.competence) return { employees: null, at: null };
  const [charge] = await db
    .select({ employees: transactions.employees, updatedAt: transactions.updatedAt })
    .from(transactions)
    .where(
      and(
        eq(transactions.workspaceId, workspaceId),
        eq(transactions.contactId, clientId),
        eq(transactions.feeKind, 'employees'),
        eq(transactions.feeCompetence, fee.competence),
      ),
    )
    .orderBy(desc(transactions.updatedAt))
    .limit(1);
  return { employees: charge?.employees ?? 0, at: charge?.updatedAt ?? null };
}

/** The current document of a client (computed on every read). */
export async function loadDocument(ctx: DocumentContext, clientId: string): Promise<OnboardingDocument> {
  const client = await getClientOrThrow(ctx.db, ctx.workspaceId, clientId);
  const [template, overrides, branding, officeRows, unionsOf, unionDates, linkDates, applicable, employees, cnpj] = await Promise.all([
    templateRow(ctx.db, ctx.workspaceId),
    overridesRow(ctx.db, ctx.workspaceId, clientId),
    getBranding(ctx),
    ctx.db
      .select({
        updatedAt: offices.updatedAt,
        phone: offices.phone,
        email: offices.email,
        website: offices.website,
        street: offices.street,
        number: offices.number,
        complement: offices.complement,
        district: offices.district,
        city: offices.city,
        state: offices.state,
      })
      .from(offices)
      .where(eq(offices.workspaceId, ctx.workspaceId)),
    loadClientUnions(ctx.db, ctx.workspaceId, [clientId], ctx.today),
    ctx.db
      .select({ updatedAt: max(unions.updatedAt), linkedAt: max(unionClients.createdAt) })
      .from(unionClients)
      .innerJoin(unions, and(eq(unions.workspaceId, unionClients.workspaceId), eq(unions.id, unionClients.unionId)))
      .where(and(eq(unionClients.workspaceId, ctx.workspaceId), eq(unionClients.clientId, clientId))),
    ctx.db
      .select({ at: max(recurringTaskClients.createdAt) })
      .from(recurringTaskClients)
      .where(and(eq(recurringTaskClients.workspaceId, ctx.workspaceId), eq(recurringTaskClients.clientId, clientId))),
    applicableRecurring(ctx, client),
    employeesOf(ctx.db, ctx.workspaceId, clientId),
    ctx.cipher.decrypt(CONTACTS, 'document', client.document),
  ]);
  const updatedAt = latest([
    template?.updatedAt,
    overrides?.updatedAt,
    client.updatedAt ?? client.createdAt,
    officeRows[0]?.updatedAt,
    unionDates[0]?.updatedAt,
    unionDates[0]?.linkedAt,
    linkDates[0]?.at,
    employees.at,
    ...applicable.dates,
  ]);
  return buildOnboardingDocument({
    template: template?.content ?? null,
    overrides: overrides?.content ?? null,
    // The logo is only the office registry's (Configurações › Escritório).
    office: {
      name: branding.name,
      logo: branding.logo,
      phone: officeRows[0]?.phone ?? null,
      email: officeRows[0]?.email ?? null,
      website: officeRows[0]?.website ?? null,
      address: officeRows[0] ? formatOfficeAddress(officeRows[0]) : null,
    },
    client: {
      name: client.name,
      tradeName: client.tradeName,
      cnpj,
      taxRegime: client.taxRegime,
      clientSince: client.contractStartDate,
      employees: employees.employees,
      unions: (unionsOf.get(clientId) ?? []).filter((u) => u.active).map((u) => u.name),
    },
    recurring: applicable.recurring,
    updatedAt: updatedAt.toISOString(),
    today: ctx.today,
  });
}

// --- links -----------------------------------------------------------------------------------------

/**
 * Phone digits for `wa.me`: Brazilian numbers only, with the country code 55. A number with an explicit
 * international prefix (`+1 …`) other than Brazil's is refused (its digits must not be read as a DDD and a
 * number of someone else), and the national part must look like a real one: DDD 11–99 and a mobile
 * (9 + 8 digits) or a landline (2–5 + 7 digits). The link goes to the client: never to a guessed number.
 */
export function whatsappNumber(phone: string): string | null {
  const d = onlyDigits(phone);
  let national: string;
  if (phone.trim().startsWith('+')) {
    if (!d.startsWith('55')) return null;
    national = d.slice(2);
  } else if (d.length === 10 || d.length === 11) national = d;
  else if ((d.length === 12 || d.length === 13) && d.startsWith('55')) national = d.slice(2);
  else return null;
  return /^[1-9][1-9](?:9\d{8}|[2-5]\d{7})$/.test(national) ? `55${national}` : null;
}

export function maskPhone(digits: string): string {
  const d = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  if (d.length < 10) return '••••';
  return `(${d.slice(0, 2)}) ${d.length === 11 ? d[2] : ''}••••-${d.slice(-4)}`;
}

export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 2)}••••@${domain}`;
}

const maskTo = (channel: OnboardingLinkChannel, to: string) => (channel === 'whatsapp' ? maskPhone(to) : maskEmail(to));

/**
 * Creates a link valid for 30 days. The recipient comes from the client's registry (`contact`) or is
 * typed (`to`). A new link never revokes the previous ones: each keeps working until it expires or is
 * revoked (the history shows them all).
 */
export async function createLink(
  ctx: Ctx,
  clientId: string,
  input: z.output<typeof onboardingLinkInputSchema>,
  appUrl: string,
): Promise<OnboardingLinkCreated> {
  const client = await getClientOrThrow(ctx.db, ctx.workspaceId, clientId);
  let to: string | null;
  let recipientName: string | null = null;
  if (input.contact) {
    const company = input.contact === 'company';
    const raw = await ctx.cipher.decrypt(
      CONTACTS,
      input.channel === 'whatsapp' ? (company ? 'phone' : 'responsiblePhone') : company ? 'email' : 'responsibleEmail',
      input.channel === 'whatsapp' ? (company ? client.phone : client.responsiblePhone) : company ? client.email : client.responsibleEmail,
    );
    recipientName = company ? (client.tradeName?.trim() ? client.tradeName : client.name) : await ctx.cipher.decrypt(CONTACTS, 'responsibleName', client.responsibleName);
    to = raw ? (input.channel === 'whatsapp' ? whatsappNumber(raw) : raw.trim().toLowerCase()) : null;
    if (!to) {
      const what = input.channel === 'whatsapp' ? 'um telefone válido' : 'e-mail';
      throw new ValidationError(`O cadastro do cliente não tem ${what} ${company ? 'da empresa' : 'do responsável'}.`);
    }
  } else {
    to = input.channel === 'whatsapp' ? whatsappNumber(input.to!) : input.to!.trim().toLowerCase();
    if (!to) throw new ValidationError('Telefone inválido: informe DDD e número.');
  }
  await purgeExpiredAccesses(ctx.db, ctx.workspaceId);
  const template = await templateRow(ctx.db, ctx.workspaceId);
  // Never the factory parameters (Efficio's e-mails) in another office's link.
  if (!paramsSaved(template)) throw new ValidationError(ONBOARDING_PARAMS_REQUIRED_MESSAGE);
  const days = normalizeOnboardingParams(template?.content).deadlines.linkDays;
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + days * 86_400_000);
  const [row] = await ctx.db
    .insert(onboardingLinks)
    .values({
      workspaceId: ctx.workspaceId,
      clientId,
      tokenHash,
      channel: input.channel,
      recipientContact: input.contact ?? null,
      recipientName: await ctx.cipher.encrypt(LINKS, 'recipientName', recipientName),
      recipientTo: (await ctx.cipher.encrypt(LINKS, 'recipientTo', to))!,
      createdBy: ctx.userId,
      createdByName: ctx.userName,
      createdAt,
      expiresAt,
    })
    .returning({ id: onboardingLinks.id });
  const path = `/o/${token}`;
  const url = `${appUrl.replace(/\/+$/, '')}${path}`;
  const branding = await getBranding(ctx);
  const officeName = branding.name?.trim() ? branding.name : 'Efficio Contabilidade';
  return {
    id: row!.id,
    path,
    url,
    channel: input.channel,
    expiresAt: expiresAt.toISOString(),
    to,
    recipientName,
    message: onboardingMessage({ clientName: client.tradeName?.trim() ? client.tradeName : client.name, officeName, url, days }),
  };
}

/** Revokes a link of the client (already revoked: nothing changes). Returns whether it changed. */
export async function revokeLink(ctx: Ctx, clientId: string, linkId: string): Promise<boolean> {
  await getClientOrThrow(ctx.db, ctx.workspaceId, clientId);
  const [row] = await ctx.db
    .select({ revokedAt: onboardingLinks.revokedAt })
    .from(onboardingLinks)
    .where(and(eq(onboardingLinks.workspaceId, ctx.workspaceId), eq(onboardingLinks.clientId, clientId), eq(onboardingLinks.id, linkId)));
  if (!row) throw new NotFoundError('Link não encontrado');
  if (row.revokedAt) return false;
  await ctx.db
    .update(onboardingLinks)
    .set({ revokedAt: new Date(), revokedBy: ctx.userId, revokedByName: ctx.userName })
    .where(and(eq(onboardingLinks.workspaceId, ctx.workspaceId), eq(onboardingLinks.id, linkId)));
  return true;
}

export function linkStatus(row: Pick<OnboardingLinkRow, 'revokedAt' | 'expiresAt'>, at: Date = new Date()): OnboardingLinkView['status'] {
  if (row.revokedAt) return 'revoked';
  return row.expiresAt <= at ? 'expired' : 'active';
}

async function toAccessView(row: typeof onboardingAccesses.$inferSelect): Promise<OnboardingAccessView> {
  return {
    id: row.id,
    linkId: row.linkId,
    at: row.accessedAt.toISOString(),
    device: row.device,
    browser: row.browser,
    os: row.os,
    ip: row.ip,
    city: row.city,
  };
}

/** The client's onboarding card: links, accesses and the latest reading confirmation. */
export async function getHistory(ctx: Pick<Ctx, 'db' | 'workspaceId' | 'cipher'>, clientId: string): Promise<OnboardingHistoryResponse> {
  await getClientOrThrow(ctx.db, ctx.workspaceId, clientId);
  const scope = and(eq(onboardingLinks.workspaceId, ctx.workspaceId), eq(onboardingLinks.clientId, clientId));
  const links = await ctx.db.select().from(onboardingLinks).where(scope).orderBy(desc(onboardingLinks.createdAt), asc(onboardingLinks.id));
  const ids = links.map((l) => l.id);
  const accessScope = and(
    eq(onboardingAccesses.workspaceId, ctx.workspaceId),
    ids.length > 0 ? inArray(onboardingAccesses.linkId, ids) : sql`false`,
  );
  const [perLink, recent] = await Promise.all([
    ids.length === 0
      ? []
      : ctx.db
          .select({ linkId: onboardingAccesses.linkId, n: count(), first: min(onboardingAccesses.accessedAt), last: max(onboardingAccesses.accessedAt) })
          .from(onboardingAccesses)
          .where(accessScope)
          .groupBy(onboardingAccesses.linkId),
    ids.length === 0
      ? []
      : ctx.db.select().from(onboardingAccesses).where(accessScope).orderBy(desc(onboardingAccesses.accessedAt)).limit(HISTORY_ACCESS_LIMIT),
  ]);
  const stats = new Map(perLink.map((s) => [s.linkId, s]));
  const now = new Date();
  const views: OnboardingLinkView[] = await Promise.all(
    links.map(async (l) => {
      const s = stats.get(l.id);
      return {
        id: l.id,
        channel: l.channel,
        to: maskTo(l.channel, (await ctx.cipher.decrypt(LINKS, 'recipientTo', l.recipientTo)) ?? ''),
        recipientName: await ctx.cipher.decrypt(LINKS, 'recipientName', l.recipientName),
        sentAt: l.createdAt.toISOString(),
        sentByName: l.createdByName,
        expiresAt: l.expiresAt.toISOString(),
        revokedAt: l.revokedAt?.toISOString() ?? null,
        revokedByName: l.revokedByName,
        status: linkStatus(l, now),
        accessCount: s?.n ?? 0,
        firstAccessAt: s?.first ? new Date(s.first).toISOString() : null,
        lastAccessAt: s?.last ? new Date(s.last).toISOString() : null,
        confirmedAt: l.confirmedAt?.toISOString() ?? null,
      };
    }),
  );
  const total = perLink.reduce((acc, s) => acc + s.n, 0);
  const firsts = perLink.map((s) => (s.first ? new Date(s.first).getTime() : Infinity));
  const lasts = perLink.map((s) => (s.last ? new Date(s.last).getTime() : -Infinity));
  const confirmed = links.filter((l) => l.confirmedAt).sort((a, b) => b.confirmedAt!.getTime() - a.confirmedAt!.getTime())[0];
  return {
    paramsSaved: paramsSaved(await templateRow(ctx.db, ctx.workspaceId)),
    links: views,
    accesses: {
      items: await Promise.all(recent.map(toAccessView)),
      count: total,
      firstAt: total > 0 ? new Date(Math.min(...firsts)).toISOString() : null,
      lastAt: total > 0 ? new Date(Math.max(...lasts)).toISOString() : null,
    },
    confirmation: confirmed
      ? {
          linkId: confirmed.id,
          name: (await ctx.cipher.decrypt(LINKS, 'confirmedName', confirmed.confirmedName)) ?? '',
          cpf: maskCpf((await ctx.cipher.decrypt(LINKS, 'confirmedCpf', confirmed.confirmedCpf)) ?? ''),
          at: confirmed.confirmedAt!.toISOString(),
        }
      : null,
  };
}

// --- public page (called by public.ts inside the link's tenant transaction) ------------------------

export async function linkById(db: DbExecutor, workspaceId: string, linkId: string): Promise<OnboardingLinkRow | null> {
  const [row] = await db.select().from(onboardingLinks).where(and(eq(onboardingLinks.workspaceId, workspaceId), eq(onboardingLinks.id, linkId)));
  return row ?? null;
}

/** Same visitor (truncated IP, device, browser) within this window = the same access (reloads, refetches). */
export const ACCESS_DEDUP_MINUTES = 30;
/** Upper bound of stored accesses per link (a link shared widely cannot fill the table). */
export const MAX_ACCESSES_PER_LINK = 1000;

/** Accesses of a link are kept this long after it expires (LGPD: minimization), then deleted. */
export const ACCESS_RETENTION_MONTHS = 12;

/**
 * Deletes the accesses of the workspace's links expired more than {@link ACCESS_RETENTION_MONTHS} ago
 * (one statement, inside the caller's tenant transaction). Runs whenever the workspace records an access
 * or creates a link, so the clean-up costs nothing to schedule; returns how many rows went.
 */
export async function purgeExpiredAccesses(db: DbExecutor, workspaceId: string): Promise<number> {
  const expired = db
    .select({ id: onboardingLinks.id })
    .from(onboardingLinks)
    .where(
      and(
        eq(onboardingLinks.workspaceId, workspaceId),
        lt(onboardingLinks.expiresAt, sql`now() - make_interval(months => ${ACCESS_RETENTION_MONTHS})`),
      ),
    );
  const deleted = await db
    .delete(onboardingAccesses)
    .where(and(eq(onboardingAccesses.workspaceId, workspaceId), inArray(onboardingAccesses.linkId, expired)))
    .returning({ id: onboardingAccesses.id });
  return deleted.length;
}

export async function recordAccess(
  db: DbExecutor,
  workspaceId: string,
  linkId: string,
  visit: Pick<OnboardingAccessView, 'device' | 'browser' | 'os' | 'ip'>,
): Promise<void> {
  await purgeExpiredAccesses(db, workspaceId);
  const scope = and(eq(onboardingAccesses.workspaceId, workspaceId), eq(onboardingAccesses.linkId, linkId));
  const [stats] = await db
    .select({
      n: count(),
      recent: sql<number>`count(*) filter (where ${onboardingAccesses.accessedAt} > now() - make_interval(mins => ${ACCESS_DEDUP_MINUTES})
        and ${onboardingAccesses.ip} is not distinct from ${visit.ip} and ${onboardingAccesses.device} = ${visit.device}
        and ${onboardingAccesses.browser} is not distinct from ${visit.browser})`.mapWith(Number),
    })
    .from(onboardingAccesses)
    .where(scope);
  if ((stats?.n ?? 0) >= MAX_ACCESSES_PER_LINK || (stats?.recent ?? 0) > 0) return;
  await db.insert(onboardingAccesses).values({ workspaceId, linkId, ...visit, city: null });
}

/** Records the reading confirmation (once per link). Returns null when the link was already confirmed. */
export async function confirmLink(
  db: DbExecutor,
  cipher: FieldCipher,
  workspaceId: string,
  linkId: string,
  input: { name: string; cpf: string; ip: string | null },
): Promise<Date | null> {
  const at = new Date();
  const updated = await db
    .update(onboardingLinks)
    .set({
      confirmedAt: at,
      confirmedName: await cipher.encrypt(LINKS, 'confirmedName', input.name),
      confirmedCpf: await cipher.encrypt(LINKS, 'confirmedCpf', input.cpf),
      confirmedIp: input.ip,
    })
    .where(and(eq(onboardingLinks.workspaceId, workspaceId), eq(onboardingLinks.id, linkId), sql`${onboardingLinks.confirmedAt} is null`))
    .returning({ id: onboardingLinks.id });
  return updated.length > 0 ? at : null;
}
