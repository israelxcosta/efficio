// Deadlines of clients' documents and unions' collective agreements (spec §6.10, §2.8 and §13.1): the
// strip of the home page, the bell, the deadlines sheet and the "Documentos" filter of the Gestão
// client list. Every member reads them (expiry dates are not financial data). Documents count only for
// active clients; agreements only for active unions with active linked clients. Bands from
// `deadlineStatus`/`trackedConvention` (packages/shared), in the office time zone; document counts in
// SQL (FILTER aggregates), the lists capped.

import { and, eq, sql } from 'drizzle-orm';
import {
  deadlineBounds,
  deadlineStatus,
  type ClientDocumentAlertsResponse,
  type ConventionDeadline,
  type DeadlineCounts,
  type DeadlinesResponse,
  type DeadlinesSummary,
  type DocumentDeadline,
  type deadlinesQuerySchema,
} from '@effinance/shared';
import type { z } from 'zod';
import { clientDocuments, contacts, unions } from '../../db/schema';
import type { ScopedContext } from '../../lib/scoped-context';
import { documentName } from '../clients/fiscal';
import { unionItems } from '../unions/service';

type Ctx = Pick<ScopedContext, 'db' | 'workspaceId' | 'cipher' | 'today'>;
type DeadlinesQuery = z.output<typeof deadlinesQuerySchema>;

/** Documents listed in the sheet (overdue + 60 days + without date). */
export const MAX_DEADLINE_DOCUMENTS = 500;

const activeClientJoin = and(eq(contacts.workspaceId, clientDocuments.workspaceId), eq(contacts.id, clientDocuments.clientId));

async function documentCounts(ctx: Ctx): Promise<DeadlineCounts & { noDate: number; total: number }> {
  const { today, soon, watch } = deadlineBounds(ctx.today);
  const [row] = await ctx.db
    .select({
      overdue: sql<number>`count(*) filter (where ${clientDocuments.expiresAt} < ${today}::date)`.mapWith(Number),
      within30: sql<number>`count(*) filter (where ${clientDocuments.expiresAt} between ${today}::date and ${soon}::date)`.mapWith(Number),
      within60: sql<number>`count(*) filter (where ${clientDocuments.expiresAt} > ${soon}::date and ${clientDocuments.expiresAt} <= ${watch}::date)`.mapWith(Number),
      noDate: sql<number>`count(*) filter (where ${clientDocuments.expiresAt} is null)`.mapWith(Number),
      total: sql<number>`count(*)`.mapWith(Number),
    })
    .from(clientDocuments)
    .innerJoin(contacts, activeClientJoin)
    .where(and(eq(clientDocuments.workspaceId, ctx.workspaceId), eq(contacts.status, 'active')));
  return row ?? { overdue: 0, within30: 0, within60: 0, noDate: 0, total: 0 };
}

/** Active unions with active linked clients whose tracked agreement is overdue or due within 60 days. */
async function conventionDeadlines(ctx: Ctx): Promise<{ items: ConventionDeadline[]; counts: DeadlineCounts; hasUnions: boolean }> {
  const all = await unionItems(ctx);
  const items: ConventionDeadline[] = [];
  const counts: DeadlineCounts = { overdue: 0, within30: 0, within60: 0 };
  for (const { item } of all) {
    const t = item.tracked;
    if (!item.active || item.activeClientCount === 0 || !t) continue;
    if (t.bucket !== 'overdue' && t.bucket !== 'within30' && t.bucket !== 'within60') continue;
    counts[t.bucket] += 1;
    items.push({
      unionId: item.id,
      name: item.acronym?.trim() ? item.acronym : item.name,
      legalName: item.name,
      category: item.category,
      cycle: t,
      clientCount: item.activeClientCount,
    });
  }
  items.sort((a, b) => (a.cycle.dueDate < b.cycle.dueDate ? -1 : a.cycle.dueDate > b.cycle.dueDate ? 1 : a.name.localeCompare(b.name, 'pt-BR')));
  return { items, counts, hasUnions: all.length > 0 };
}

/** The deadlines sheet: documents (overdue, up to 60 days, without date) and agreements. */
export async function listDeadlines(ctx: Ctx, q: DeadlinesQuery): Promise<DeadlinesResponse> {
  const wantDocuments = q.kind !== 'conventions';
  const wantConventions = q.kind !== 'documents';
  const { watch } = deadlineBounds(ctx.today);
  const [counts, rows, anyDocument, conventions] = await Promise.all([
    documentCounts(ctx),
    wantDocuments
      ? ctx.db
          .select({
            id: clientDocuments.id,
            clientId: contacts.id,
            clientName: contacts.name,
            clientTradeName: contacts.tradeName,
            kind: clientDocuments.kind,
            customName: clientDocuments.customName,
            note: clientDocuments.note,
            expiresAt: clientDocuments.expiresAt,
          })
          .from(clientDocuments)
          .innerJoin(contacts, activeClientJoin)
          .where(
            and(
              eq(clientDocuments.workspaceId, ctx.workspaceId),
              eq(contacts.status, 'active'),
              sql`(${clientDocuments.expiresAt} is null or ${clientDocuments.expiresAt} <= ${watch}::date)`,
            ),
          )
          .orderBy(sql`${clientDocuments.expiresAt} asc nulls last`, sql`lower(coalesce(${contacts.tradeName}, ${contacts.name}))`, clientDocuments.id)
          .limit(MAX_DEADLINE_DOCUMENTS + 1)
      : Promise.resolve([]),
    ctx.db
      .select({ id: clientDocuments.id })
      .from(clientDocuments)
      .where(eq(clientDocuments.workspaceId, ctx.workspaceId))
      .limit(1),
    wantConventions ? conventionDeadlines(ctx) : Promise.resolve(null),
  ]);
  const unionsExist =
    conventions?.hasUnions ??
    (await ctx.db.select({ id: unions.id }).from(unions).where(eq(unions.workspaceId, ctx.workspaceId)).limit(1)).length > 0;
  const items: DocumentDeadline[] = await Promise.all(
    rows.slice(0, MAX_DEADLINE_DOCUMENTS).map(async (r) => ({
      id: r.id,
      client: { id: r.clientId, name: r.clientTradeName?.trim() ? r.clientTradeName : r.clientName },
      kind: r.kind,
      name: documentName(r),
      note: await ctx.cipher.decrypt('client_documents', 'note', r.note),
      expiresAt: r.expiresAt,
      deadline: deadlineStatus(r.expiresAt, ctx.today),
    })),
  );
  return {
    today: ctx.today,
    documents: {
      counts: { overdue: counts.overdue, within30: counts.within30, within60: counts.within60, noDate: counts.noDate },
      items,
      truncated: rows.length > MAX_DEADLINE_DOCUMENTS,
      hasAny: anyDocument.length > 0,
    },
    conventions: {
      counts: conventions?.counts ?? { overdue: 0, within30: 0, within60: 0 },
      items: conventions?.items ?? [],
      hasUnions: unionsExist,
    },
  };
}

/** Counts for the strip of the home page and the bell (the bell adds `overdueTotal`). */
export async function deadlinesSummary(ctx: Ctx): Promise<DeadlinesSummary> {
  const [docs, conventions] = await Promise.all([documentCounts(ctx), conventionDeadlines(ctx)]);
  const overdue = conventions.items.filter((c) => c.cycle.bucket === 'overdue');
  return {
    today: ctx.today,
    documents: { overdue: docs.overdue, within30: docs.within30, within60: docs.within60 },
    conventions: conventions.counts,
    overdueTotal: docs.overdue + conventions.counts.overdue,
    overdueConvention:
      overdue.length === 1 ? { unionId: overdue[0]!.unionId, name: overdue[0]!.name, days: -overdue[0]!.cycle.days } : null,
  };
}

/** Documents per active client (the filter and the subtitle of the Gestão client list). */
export async function clientDocumentAlerts(ctx: Ctx): Promise<ClientDocumentAlertsResponse> {
  const { today, soon, watch } = deadlineBounds(ctx.today);
  const [aggregates, urgent] = await Promise.all([
    ctx.db
      .select({
        clientId: clientDocuments.clientId,
        overdue: sql<number>`count(*) filter (where ${clientDocuments.expiresAt} < ${today}::date)`.mapWith(Number),
        within30: sql<number>`count(*) filter (where ${clientDocuments.expiresAt} between ${today}::date and ${soon}::date)`.mapWith(Number),
        within60: sql<number>`count(*) filter (where ${clientDocuments.expiresAt} > ${soon}::date and ${clientDocuments.expiresAt} <= ${watch}::date)`.mapWith(Number),
        total: sql<number>`count(*)`.mapWith(Number),
      })
      .from(clientDocuments)
      .innerJoin(contacts, activeClientJoin)
      .where(and(eq(clientDocuments.workspaceId, ctx.workspaceId), eq(contacts.status, 'active')))
      .groupBy(clientDocuments.clientId),
    // The most urgent dated document of each client (earliest expiry).
    ctx.db
      .selectDistinctOn([clientDocuments.clientId], {
        clientId: clientDocuments.clientId,
        id: clientDocuments.id,
        kind: clientDocuments.kind,
        customName: clientDocuments.customName,
        expiresAt: clientDocuments.expiresAt,
      })
      .from(clientDocuments)
      .innerJoin(contacts, activeClientJoin)
      .where(
        and(
          eq(clientDocuments.workspaceId, ctx.workspaceId),
          eq(contacts.status, 'active'),
          sql`${clientDocuments.expiresAt} is not null`,
        ),
      )
      .orderBy(clientDocuments.clientId, clientDocuments.expiresAt, clientDocuments.id),
  ]);
  const byClient = new Map(urgent.map((u) => [u.clientId, u]));
  const items = aggregates.map((a) => {
    const u = byClient.get(a.clientId);
    return {
      ...a,
      mostUrgent: u
        ? { documentId: u.id, kind: u.kind, name: documentName(u), expiresAt: u.expiresAt!, deadline: deadlineStatus(u.expiresAt, ctx.today) }
        : null,
    };
  });
  return {
    today: ctx.today,
    items,
    totals: {
      overdue: items.reduce((n, i) => n + i.overdue, 0),
      within30: items.reduce((n, i) => n + i.within30, 0),
      within60: items.reduce((n, i) => n + i.within60, 0),
      clientsOverdue: items.filter((i) => i.overdue > 0).length,
      clientsWithin30: items.filter((i) => i.within30 > 0).length,
    },
  };
}
