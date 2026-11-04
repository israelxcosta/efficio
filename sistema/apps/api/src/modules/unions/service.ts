// Unions (sindicatos) and their collective agreements (spec §13.7, Effy's Union/UnionConvention), with
// the clients whose employees follow each agreement (N:N, new). Every member reads (public data of the
// entity); `registry` writes and marks agreements as published; `deleteRegistry` deletes. The tracked
// cycle and its band come from `trackedConvention` (packages/shared), in the office time zone — the
// single implementation of the rule. A workspace has at most MAX_UNIONS unions, so the urgency order
// is computed in memory over a bounded set; counts come from SQL aggregates.

import { and, asc, count, eq, inArray, notInArray } from 'drizzle-orm';
import {
  compareUnionUrgency,
  conventionLabel,
  MAX_UNIONS,
  trackedConvention,
  unionSituationOf,
  type UnionConvention,
  type UnionDetail,
  type UnionListItem,
  type UnionListResponse,
  type UnionListSummary,
  type unionConventionsInputSchema,
  type unionInputSchema,
  type unionQuerySchema,
} from '@effinance/shared';
import type { z } from 'zod';
import { contacts, unionClients, unionConventions, unions, type UnionRow } from '../../db/schema';
import { now } from '../../lib/clock';
import { groupBy } from '../../lib/collections';
import { InvalidTextError, NotFoundError, ValidationError } from '../../lib/errors';
import type { ScopedContext } from '../../lib/scoped-context';
import { inChunks } from '../../lib/sql';

type UnionInput = z.output<typeof unionInputSchema>;
type UnionQuery = z.output<typeof unionQuerySchema>;
type ConventionsInput = z.output<typeof unionConventionsInputSchema>;

const TABLE = 'unions';
const CYCLES = 'union_conventions';
/** Personal data of the union's responsible and free text: encrypted with the workspace key. */
const ENCRYPTED = ['responsibleName', 'responsibleEmail', 'responsiblePhone', 'notes'] as const;

type Ctx = Pick<ScopedContext, 'db' | 'workspaceId' | 'cipher' | 'today'>;
type WriteCtx = Ctx & Pick<ScopedContext, 'userId' | 'userName'>;

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function getUnionRowOrThrow(ctx: Ctx, id: string): Promise<UnionRow> {
  const [row] = await ctx.db
    .select()
    .from(unions)
    .where(and(eq(unions.workspaceId, ctx.workspaceId), eq(unions.id, id)));
  if (!row) throw new NotFoundError('Sindicato não encontrado');
  return row;
}

/** Cycles of the given unions (all of the workspace without ids). */
async function cyclesOf(ctx: Ctx, unionIds?: readonly string[]) {
  return ctx.db
    .select()
    .from(unionConventions)
    .where(
      and(
        eq(unionConventions.workspaceId, ctx.workspaceId),
        unionIds ? inArray(unionConventions.unionId, [...unionIds]) : undefined,
      ),
    )
    .orderBy(asc(unionConventions.year));
}

/** (union, client, client active?) of the workspace's links. */
async function linksOf(ctx: Ctx, unionId?: string) {
  return ctx.db
    .select({ unionId: unionClients.unionId, clientId: unionClients.clientId, status: contacts.status })
    .from(unionClients)
    .innerJoin(contacts, and(eq(contacts.workspaceId, unionClients.workspaceId), eq(contacts.id, unionClients.clientId)))
    .where(and(eq(unionClients.workspaceId, ctx.workspaceId), unionId ? eq(unionClients.unionId, unionId) : undefined));
}

function toListItem(
  row: Pick<UnionRow, 'id' | 'name' | 'document' | 'acronym' | 'category' | 'territory' | 'baseMonth' | 'active'>,
  cycles: { year: number; published: boolean }[],
  links: { status: string }[],
  today: string,
): UnionListItem {
  const tracked = trackedConvention(row.baseMonth, cycles, today);
  return {
    id: row.id,
    name: row.name,
    document: row.document,
    acronym: row.acronym,
    category: row.category,
    territory: row.territory,
    baseMonth: row.baseMonth,
    active: row.active,
    tracked,
    situation: unionSituationOf(tracked),
    clientCount: links.length,
    activeClientCount: links.filter((l) => l.status === 'active').length,
  };
}

/** Every union of the workspace with its tracked cycle and client counts (bounded by MAX_UNIONS). */
export async function unionItems(ctx: Ctx): Promise<{ item: UnionListItem; activeClientIds: string[] }[]> {
  const [rows, cycles, links] = await Promise.all([
    ctx.db
      .select({
        id: unions.id,
        name: unions.name,
        document: unions.document,
        acronym: unions.acronym,
        category: unions.category,
        territory: unions.territory,
        baseMonth: unions.baseMonth,
        active: unions.active,
      })
      .from(unions)
      .where(eq(unions.workspaceId, ctx.workspaceId))
      .limit(MAX_UNIONS),
    cyclesOf(ctx),
    linksOf(ctx),
  ]);
  // Grouped once: a filter per union would be unions × links (up to 1000 × millions) on every read.
  const linksByUnion = groupBy(links, (l) => l.unionId);
  const cyclesByUnion = groupBy(cycles, (c) => c.unionId);
  return rows.map((row) => {
    const mine = linksByUnion.get(row.id) ?? [];
    return {
      item: toListItem(
        row,
        cyclesByUnion.get(row.id) ?? [],
        mine,
        ctx.today,
      ),
      activeClientIds: mine.filter((l) => l.status === 'active').map((l) => l.clientId),
    };
  });
}

/**
 * Unions in the urgency order (overdue first, then by the tracked due date; without base month at the
 * end; then by name), with the filters; the summary covers the whole workspace.
 */
export async function listUnions(ctx: Ctx, q: UnionQuery): Promise<UnionListResponse> {
  const all = await unionItems(ctx);
  const active = all.filter((u) => u.item.active);
  const overdueClients = new Set(active.filter((u) => u.item.situation === 'overdue').flatMap((u) => u.activeClientIds));
  const summary: UnionListSummary = {
    active: active.length,
    inactive: all.length - active.length,
    overdue: 0,
    within30: 0,
    within60: 0,
    ok: 0,
    noBaseMonth: 0,
    overdueClients: overdueClients.size,
  };
  for (const u of active) summary[u.item.situation] += 1;

  const term = q.search ? fold(q.search) : null;
  const digits = q.search?.replace(/\D/g, '') ?? '';
  const filtered = all
    .map((u) => u.item)
    .filter((u) => (q.status === 'all' ? true : q.status === 'active' ? u.active : !u.active))
    .filter((u) => !q.situation || u.situation === q.situation)
    .filter(
      (u) =>
        !term ||
        [u.name, u.acronym, u.category].some((v) => v && fold(v).includes(term)) ||
        (digits.length >= 4 && u.document.includes(digits)),
    )
    .sort(
      (a, b) =>
        compareUnionUrgency(a.tracked, b.tracked) ||
        (a.acronym ?? a.name).localeCompare(b.acronym ?? b.name, 'pt-BR') ||
        a.id.localeCompare(b.id),
    );
  const start = (q.page - 1) * q.pageSize;
  return { items: filtered.slice(start, start + q.pageSize), total: filtered.length, page: q.page, pageSize: q.pageSize, today: ctx.today, summary };
}

async function toConventions(ctx: Ctx, rows: (typeof unionConventions.$inferSelect)[]): Promise<UnionConvention[]> {
  return Promise.all(
    rows.map(async (r) => ({
      year: r.year,
      label: conventionLabel(r.year),
      published: r.published,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      publishedBy: r.publishedByName ? { id: r.publishedBy, name: r.publishedByName } : null,
      note: await ctx.cipher.decrypt(CYCLES, 'note', r.note),
    })),
  );
}

export async function getUnion(ctx: Ctx, id: string): Promise<UnionDetail> {
  const row = await getUnionRowOrThrow(ctx, id);
  const [cycles, clients] = await Promise.all([
    cyclesOf(ctx, [id]),
    ctx.db
      .select({ id: contacts.id, name: contacts.name, tradeName: contacts.tradeName, taxRegime: contacts.taxRegime, status: contacts.status })
      .from(unionClients)
      .innerJoin(contacts, and(eq(contacts.workspaceId, unionClients.workspaceId), eq(contacts.id, unionClients.clientId)))
      .where(and(eq(unionClients.workspaceId, ctx.workspaceId), eq(unionClients.unionId, id))),
  ]);
  const plain = await ctx.cipher.decryptFields(TABLE, row, ENCRYPTED);
  const display = (c: { name: string; tradeName: string | null }) => (c.tradeName?.trim() ? c.tradeName : c.name);
  return {
    ...toListItem(row, cycles, clients, ctx.today),
    zipCode: row.zipCode,
    street: row.street,
    number: row.number,
    complement: row.complement,
    district: row.district,
    city: row.city,
    state: row.state,
    phone: row.phone,
    email: row.email,
    website: row.website,
    responsibleName: plain.responsibleName,
    responsibleRole: row.responsibleRole,
    responsibleEmail: plain.responsibleEmail,
    responsiblePhone: plain.responsiblePhone,
    notes: plain.notes,
    conventions: await toConventions(ctx, cycles),
    clients: clients
      .map((c) => ({ id: c.id, name: display(c), legalName: c.name, taxRegime: c.taxRegime!, status: c.status }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Every id must be a client of the workspace (404 otherwise, without saying which). */
async function assertClients(ctx: Ctx, ids: readonly string[]): Promise<void> {
  let found = 0;
  for (const chunk of inChunks([...ids])) {
    const [row] = await ctx.db
      .select({ n: count() })
      .from(contacts)
      .where(and(eq(contacts.workspaceId, ctx.workspaceId), eq(contacts.kind, 'client'), inArray(contacts.id, chunk)));
    found += row?.n ?? 0;
  }
  if (found !== ids.length) throw new NotFoundError('Cliente não encontrado');
}

async function replaceLinks(ctx: Ctx, unionId: string, clientIds: readonly string[]): Promise<void> {
  await assertClients(ctx, clientIds);
  await ctx.db
    .delete(unionClients)
    .where(
      and(
        eq(unionClients.workspaceId, ctx.workspaceId),
        eq(unionClients.unionId, unionId),
        clientIds.length > 0 ? notInArray(unionClients.clientId, [...clientIds]) : undefined,
      ),
    );
  for (const chunk of inChunks([...clientIds])) {
    await ctx.db
      .insert(unionClients)
      .values(chunk.map((clientId) => ({ workspaceId: ctx.workspaceId, unionId, clientId })))
      .onConflictDoNothing();
  }
}

async function registryValues(ctx: Ctx, input: UnionInput) {
  const { clientIds: _clients, active: _active, ...fields } = input;
  for (const v of [fields.responsibleName, fields.notes]) if (v?.includes('\u0000')) throw new InvalidTextError();
  return ctx.cipher.encryptFields(TABLE, fields, ENCRYPTED);
}

export async function createUnion(ctx: WriteCtx, input: UnionInput): Promise<UnionDetail> {
  const [existing] = await ctx.db.select({ n: count() }).from(unions).where(eq(unions.workspaceId, ctx.workspaceId));
  if ((existing?.n ?? 0) >= MAX_UNIONS) throw new ValidationError(`Limite de ${MAX_UNIONS} sindicatos por espaço`);
  const values = await registryValues(ctx, input);
  const [row] = await ctx.db
    .insert(unions)
    .values({ workspaceId: ctx.workspaceId, ...values, active: input.active ?? true })
    .returning({ id: unions.id });
  if (input.clientIds?.length) await replaceLinks(ctx, row!.id, input.clientIds);
  return getUnion(ctx, row!.id);
}

/** Replaces the registry fields; `active` and `clientIds` only when sent. The cycles are never touched. */
export async function updateUnion(ctx: WriteCtx, id: string, input: UnionInput): Promise<UnionDetail> {
  await getUnionRowOrThrow(ctx, id);
  const values = await registryValues(ctx, input);
  await ctx.db
    .update(unions)
    .set({ ...values, ...(input.active !== undefined ? { active: input.active } : {}) })
    .where(and(eq(unions.workspaceId, ctx.workspaceId), eq(unions.id, id)));
  if (input.clientIds) await replaceLinks(ctx, id, input.clientIds);
  return getUnion(ctx, id);
}

type CycleRow = typeof unionConventions.$inferSelect;

/** Values of a cycle: who marked it published and when are the server's (kept while it stays published). */
function publication(ctx: WriteCtx, existing: CycleRow | undefined, published: boolean) {
  if (!published) return { published: false, publishedAt: null, publishedBy: null, publishedByName: null };
  if (existing?.published) {
    return { published: true, publishedAt: existing.publishedAt, publishedBy: existing.publishedBy, publishedByName: existing.publishedByName };
  }
  return { published: true, publishedAt: now(), publishedBy: ctx.userId, publishedByName: ctx.userName };
}

/** The cycles of a union, substitutive (cycles not sent are removed). */
export async function saveConventions(ctx: WriteCtx, id: string, input: ConventionsInput): Promise<UnionDetail> {
  await getUnionRowOrThrow(ctx, id);
  const current = await cyclesOf(ctx, [id]);
  const byYear = new Map(current.map((c) => [c.year, c]));
  const years = input.cycles.map((c) => c.year);
  await ctx.db
    .delete(unionConventions)
    .where(
      and(
        eq(unionConventions.workspaceId, ctx.workspaceId),
        eq(unionConventions.unionId, id),
        years.length > 0 ? notInArray(unionConventions.year, years) : undefined,
      ),
    );
  for (const cycle of input.cycles) {
    if (cycle.note?.includes('\u0000')) throw new InvalidTextError();
    const existing = byYear.get(cycle.year);
    const values = { ...publication(ctx, existing, cycle.published), note: await ctx.cipher.encrypt(CYCLES, 'note', cycle.note) };
    if (existing) {
      await ctx.db
        .update(unionConventions)
        .set(values)
        .where(and(eq(unionConventions.workspaceId, ctx.workspaceId), eq(unionConventions.id, existing.id)));
    } else {
      await ctx.db.insert(unionConventions).values({ workspaceId: ctx.workspaceId, unionId: id, year: cycle.year, ...values });
    }
  }
  return getUnion(ctx, id);
}

/** Marks (or unmarks) one cycle as published, creating it when needed (the toggle with "Desfazer"). */
export async function setConventionPublished(ctx: WriteCtx, id: string, year: number, published: boolean): Promise<UnionDetail> {
  await getUnionRowOrThrow(ctx, id);
  const [existing] = await ctx.db
    .select()
    .from(unionConventions)
    .where(and(eq(unionConventions.workspaceId, ctx.workspaceId), eq(unionConventions.unionId, id), eq(unionConventions.year, year)));
  const values = publication(ctx, existing, published);
  if (existing) {
    await ctx.db
      .update(unionConventions)
      .set(values)
      .where(and(eq(unionConventions.workspaceId, ctx.workspaceId), eq(unionConventions.id, existing.id)));
  } else {
    await ctx.db
      .insert(unionConventions)
      .values({ workspaceId: ctx.workspaceId, unionId: id, year, ...values })
      .onConflictDoNothing();
  }
  return getUnion(ctx, id);
}

/** Deletes the union with its cycles and links (cascade). To keep the history, inactivate it. */
export async function deleteUnion(ctx: Ctx, id: string): Promise<void> {
  await getUnionRowOrThrow(ctx, id);
  await ctx.db.delete(unions).where(and(eq(unions.workspaceId, ctx.workspaceId), eq(unions.id, id)));
}
