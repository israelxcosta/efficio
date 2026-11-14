// Yearly fee adjustment in batch (reajuste anual dos honorários, contract clause 3; docs/api.md →
// "Reajuste em lote"). Fee periods renew every 12 months from the contract start, so a month's batch
// covers the active clients whose contract started in that month of an earlier year: the new period
// (index k) takes the values of the previous one (k − 1) adjusted by the percentage — by default the
// largest positive index among IGP-M, IPCA, INPC and the CCT — rounded to the cent, keeping the
// punctuality discount. Each batch is recorded (`fee_adjustments`) with the values of every period it
// registered (`fee_adjustment_items`), which feed the letters (notice 30 days before, with the
// calculation). Every function runs inside the request's tenant transaction (RLS) and filters by the
// workspace; browser-safe (the demo runs it on PGlite).

import { and, asc, count, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import {
  adjustByBps,
  adjustmentNoticeDeadline,
  chosenAdjustmentIndex,
  feePeriod,
  indexValuesOf,
  monthRange,
  renewalPeriodIn,
  suggestedAdjustment,
  type applyFeeAdjustmentSchema,
  type FeeAdjustment,
  type FeeAdjustmentApplyResponse,
  type FeeAdjustmentCreated,
  type FeeAdjustmentIndices,
  type FeeAdjustmentLetter,
  type FeeAdjustmentLettersResponse,
  type FeeAdjustmentPreviewItem,
  type FeeAdjustmentPreviewResponse,
  type FeeAdjustmentValues,
  type feeAdjustmentListQuerySchema,
  type feeAdjustmentPreviewQuerySchema,
  type FeePeriod,
  type ISODate,
  type Paginated,
} from '@effinance/shared';
import type { z } from 'zod';
import type { DbExecutor } from '../../db/client';
import {
  clientFees,
  contacts,
  feeAdjustmentItems,
  feeAdjustments,
  offices,
  type ClientFeeRow,
  type FeeAdjustmentRow,
} from '../../db/schema';
import { groupBy } from '../../lib/collections';
import type { FieldCipher } from '../../lib/crypto/field-cipher';
import { NotFoundError } from '../../lib/errors';
import { toDataUri } from '../../lib/images';
import { inChunks } from '../../lib/sql';

type PreviewQuery = z.output<typeof feeAdjustmentPreviewQuerySchema>;
type ApplyInput = z.output<typeof applyFeeAdjustmentSchema>;
type ListQuery = z.output<typeof feeAdjustmentListQuerySchema>;

/** Who applies a batch (recorded with it). */
export interface FeeAdjustmentActor {
  userId: string;
  name: string;
}

const CLIENT_COLUMNS = {
  id: contacts.id,
  name: contacts.name,
  tradeName: contacts.tradeName,
  contractStartDate: contacts.contractStartDate,
  status: contacts.status,
};
type ClientLite = { id: string; name: string; tradeName: string | null; contractStartDate: string | null; status: string };

/** Listed like everywhere: the trade name, else the legal name. */
const displayName = (c: Pick<ClientLite, 'name' | 'tradeName'>) => (c.tradeName?.trim() ? c.tradeName : c.name);
const byName = <T extends { name: string | null }>(a: T, b: T) => (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR');

/** The fee periods of some clients, grouped by client (ids in chunks: the client base grows). */
async function feesByClient(db: DbExecutor, workspaceId: string, clientIds: string[]): Promise<Map<string, ClientFeeRow[]>> {
  if (clientIds.length === 0) return new Map();
  const parts = await Promise.all(
    inChunks(clientIds).map((chunk) =>
      db
        .select()
        .from(clientFees)
        .where(and(eq(clientFees.workspaceId, workspaceId), inArray(clientFees.clientId, chunk))),
    ),
  );
  return groupBy(parts.flat(), (f) => f.clientId);
}

/** The batch that registered each of these fee periods (when one did). */
async function batchOfFees(db: DbExecutor, workspaceId: string, feeIds: string[]): Promise<Map<string, string>> {
  if (feeIds.length === 0) return new Map();
  const parts = await Promise.all(
    inChunks(feeIds).map((chunk) =>
      db
        .select({ feeId: feeAdjustmentItems.clientFeeId, adjustmentId: feeAdjustmentItems.adjustmentId })
        .from(feeAdjustmentItems)
        .where(and(eq(feeAdjustmentItems.workspaceId, workspaceId), inArray(feeAdjustmentItems.clientFeeId, chunk))),
    ),
  );
  return new Map(parts.flat().map((r) => [r.feeId, r.adjustmentId]));
}

const valuesOf = (fee: Pick<ClientFeeRow, 'amount' | 'employeeFee'>): FeeAdjustmentValues => ({
  amount: fee.amount,
  employeeFee: fee.employeeFee,
});

/** The previous period's values with the percentage applied (the fee per employee only when asked). */
function adjusted(previous: FeeAdjustmentValues, bps: number, adjustEmployeeFee: boolean): FeeAdjustmentValues {
  return {
    amount: adjustByBps(previous.amount, bps),
    employeeFee: adjustEmployeeFee ? adjustByBps(previous.employeeFee, bps) : previous.employeeFee,
  };
}

const indicesOf = (v: Pick<FeeAdjustmentRow, 'igpmBps' | 'ipcaBps' | 'inpcBps' | 'cctBps'>): FeeAdjustmentIndices => ({
  igpmBps: v.igpmBps,
  ipcaBps: v.ipcaBps,
  inpcBps: v.inpcBps,
  cctBps: v.cctBps,
});

function toFeeAdjustment(row: FeeAdjustmentRow, clientCount: number): FeeAdjustment {
  return {
    id: row.id,
    month: row.month,
    indices: indicesOf(row),
    appliedBps: row.appliedBps,
    chosenIndex: row.chosenIndex,
    adjustEmployeeFee: row.adjustEmployeeFee,
    clientCount,
    appliedBy: { id: row.appliedBy, name: row.appliedByName },
    createdAt: row.createdAt.toISOString(),
  };
}

/** Clients adjusted by each batch: the periods it registered that are still there. */
async function clientCounts(db: DbExecutor, workspaceId: string, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ adjustmentId: feeAdjustmentItems.adjustmentId, n: count() })
    .from(feeAdjustmentItems)
    .where(and(eq(feeAdjustmentItems.workspaceId, workspaceId), inArray(feeAdjustmentItems.adjustmentId, ids)))
    .groupBy(feeAdjustmentItems.adjustmentId);
  return new Map(rows.map((r) => [r.adjustmentId, Number(r.n)]));
}

/**
 * The active clients whose next fee period starts in `q.month` (contract started in that month of an
 * earlier year), with the values of the period in force before it and the adjusted ones, the notice
 * deadline (start − 30 days) and whether it has passed; those already registered for the month
 * ("já reajustado") or without the previous period are marked.
 */
export async function previewFeeAdjustment(
  db: DbExecutor,
  workspaceId: string,
  q: PreviewQuery,
  today: ISODate,
): Promise<FeeAdjustmentPreviewResponse> {
  const indices = { igpmBps: q.igpmBps, ipcaBps: q.ipcaBps, inpcBps: q.inpcBps, cctBps: q.cctBps };
  const suggested = suggestedAdjustment(indexValuesOf(indices));
  const appliedBps = q.appliedBps ?? suggested.bps;
  const monthNumber = Number(q.month.slice(5, 7));

  const clients = await db
    .select(CLIENT_COLUMNS)
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        eq(contacts.kind, 'client'),
        eq(contacts.status, 'active'),
        sql`extract(month from ${contacts.contractStartDate}) = ${monthNumber}`,
        lt(contacts.contractStartDate, monthRange(q.month).from),
      ),
    );
  const fees = await feesByClient(
    db,
    workspaceId,
    clients.map((c) => c.id),
  );

  const candidates = clients.flatMap((client) => {
    const period = client.contractStartDate ? renewalPeriodIn(client.contractStartDate, q.month) : null;
    if (!period) return [];
    const own = fees.get(client.id) ?? [];
    return [
      {
        client,
        period,
        previous: own.find((f) => f.periodIndex === period.index - 1) ?? null,
        existing: own.find((f) => f.periodIndex === period.index) ?? null,
      },
    ];
  });
  const batches = await batchOfFees(
    db,
    workspaceId,
    candidates.flatMap((c) => (c.existing ? [c.existing.id] : [])),
  );

  const items: FeeAdjustmentPreviewItem[] = candidates.map(({ client, period, previous, existing }) => {
    const noticeDeadline = adjustmentNoticeDeadline(period.startDate);
    return {
      clientId: client.id,
      name: displayName(client),
      legalName: client.name,
      status: existing ? 'already_adjusted' : previous ? 'ready' : 'no_previous_fee',
      period,
      noticeDeadline,
      noticeLate: today > noticeDeadline,
      current: previous ? { feeId: previous.id, ...valuesOf(previous), discountBps: previous.discountBps } : null,
      proposed: previous ? adjusted(valuesOf(previous), appliedBps, q.adjustEmployeeFee) : null,
      registered: existing ? { feeId: existing.id, ...valuesOf(existing), adjustmentId: batches.get(existing.id) ?? null } : null,
    };
  });
  items.sort(byName);

  const ready = items.filter((i) => i.status === 'ready');
  return {
    month: q.month,
    today,
    indices,
    suggested,
    appliedBps,
    adjustEmployeeFee: q.adjustEmployeeFee,
    items,
    totals: {
      clients: items.length,
      ready: ready.length,
      alreadyAdjusted: items.filter((i) => i.status === 'already_adjusted').length,
      noPreviousFee: items.filter((i) => i.status === 'no_previous_fee').length,
      noticeLate: ready.filter((i) => i.noticeLate).length,
      currentMonthly: ready.reduce((sum, i) => sum + i.current!.amount, 0),
      proposedMonthly: ready.reduce((sum, i) => sum + i.proposed!.amount, 0),
    },
  };
}

interface Planned {
  client: ClientLite;
  period: FeePeriod;
  previous: ClientFeeRow;
  values: FeeAdjustmentValues;
}

/**
 * Applies the batch to the selected clients, in the caller's transaction: registers the period of the
 * month for each one that can be adjusted (values of the previous period × percentage, rounded to the
 * cent; discount kept), records the batch and its items, and reports who was skipped and why. A period
 * registered meanwhile by someone else is skipped too (no duplicate: ON CONFLICT on the period).
 * Nothing is recorded when no client could be adjusted.
 */
export async function applyFeeAdjustment(
  db: DbExecutor,
  workspaceId: string,
  input: ApplyInput,
  actor: FeeAdjustmentActor,
): Promise<FeeAdjustmentApplyResponse> {
  const indices = { igpmBps: input.igpmBps, ipcaBps: input.ipcaBps, inpcBps: input.inpcBps, cctBps: input.cctBps };
  const values = indexValuesOf(indices);
  const appliedBps = input.appliedBps ?? suggestedAdjustment(values).bps;
  const ids = [...new Set(input.clientIds)];

  const parts = await Promise.all(
    inChunks(ids).map((chunk) =>
      db
        .select(CLIENT_COLUMNS)
        .from(contacts)
        .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.kind, 'client'), inArray(contacts.id, chunk))),
    ),
  );
  const clients = new Map(parts.flat().map((c) => [c.id, c]));
  const fees = await feesByClient(db, workspaceId, [...clients.keys()]);

  const skipped: FeeAdjustmentApplyResponse['skipped'] = [];
  const planned: Planned[] = [];
  for (const id of ids) {
    const client = clients.get(id);
    if (!client) {
      skipped.push({ clientId: id, name: null, reason: 'not_found' });
      continue;
    }
    const name = displayName(client);
    if (client.status !== 'active') {
      skipped.push({ clientId: id, name, reason: 'inactive' });
      continue;
    }
    const period = client.contractStartDate ? renewalPeriodIn(client.contractStartDate, input.month) : null;
    if (!period) {
      skipped.push({ clientId: id, name, reason: 'not_due' });
      continue;
    }
    const own = fees.get(id) ?? [];
    if (own.some((f) => f.periodIndex === period.index)) {
      skipped.push({ clientId: id, name, reason: 'already_adjusted' });
      continue;
    }
    const previous = own.find((f) => f.periodIndex === period.index - 1);
    if (!previous) {
      skipped.push({ clientId: id, name, reason: 'no_previous_fee' });
      continue;
    }
    planned.push({ client, period, previous, values: adjusted(valuesOf(previous), appliedBps, input.adjustEmployeeFee) });
  }

  const inserted = planned.length
    ? await db
        .insert(clientFees)
        .values(
          planned.map((p) => ({
            workspaceId,
            clientId: p.client.id,
            periodIndex: p.period.index,
            amount: p.values.amount,
            employeeFee: p.values.employeeFee,
            discountBps: p.previous.discountBps,
          })),
        )
        .onConflictDoNothing({ target: [clientFees.clientId, clientFees.periodIndex] })
        .returning({ id: clientFees.id, clientId: clientFees.clientId })
    : [];
  const feeOf = new Map(inserted.map((r) => [r.clientId, r.id]));
  for (const p of planned) {
    if (!feeOf.has(p.client.id)) skipped.push({ clientId: p.client.id, name: displayName(p.client), reason: 'already_adjusted' });
  }
  skipped.sort(byName);
  if (inserted.length === 0) return { adjustment: null, created: [], skipped };

  const [batch] = await db
    .insert(feeAdjustments)
    .values({
      workspaceId,
      month: input.month,
      ...indices,
      appliedBps,
      chosenIndex: chosenAdjustmentIndex(values, appliedBps),
      adjustEmployeeFee: input.adjustEmployeeFee,
      appliedBy: actor.userId,
      appliedByName: actor.name.trim().slice(0, 120) || 'Membro',
    })
    .returning();
  const done = planned.filter((p) => feeOf.has(p.client.id));
  await db.insert(feeAdjustmentItems).values(
    done.map((p) => ({
      workspaceId,
      adjustmentId: batch!.id,
      clientFeeId: feeOf.get(p.client.id)!,
      previousAmount: p.previous.amount,
      previousEmployeeFee: p.previous.employeeFee,
      amount: p.values.amount,
      employeeFee: p.values.employeeFee,
      discountBps: p.previous.discountBps,
    })),
  );
  const created: FeeAdjustmentCreated[] = done.map((p) => ({
    clientId: p.client.id,
    name: displayName(p.client),
    feeId: feeOf.get(p.client.id)!,
    period: p.period,
    previous: valuesOf(p.previous),
    adjusted: p.values,
    discountBps: p.previous.discountBps,
  }));
  created.sort(byName);
  return { adjustment: toFeeAdjustment(batch!, created.length), created, skipped };
}

/** The batches applied, newest first (optionally of one month). */
export async function listFeeAdjustments(db: DbExecutor, workspaceId: string, q: ListQuery): Promise<Paginated<FeeAdjustment>> {
  const where = and(eq(feeAdjustments.workspaceId, workspaceId), q.month ? eq(feeAdjustments.month, q.month) : undefined);
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(feeAdjustments)
      .where(where)
      .orderBy(desc(feeAdjustments.createdAt), desc(feeAdjustments.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ n: count() }).from(feeAdjustments).where(where),
  ]);
  const counts = await clientCounts(
    db,
    workspaceId,
    rows.map((r) => r.id),
  );
  return {
    items: rows.map((r) => toFeeAdjustment(r, counts.get(r.id) ?? 0)),
    total: Number(total?.n ?? 0),
    page: q.page,
    pageSize: q.pageSize,
  };
}

/** Office fields the letterhead needs (labels in pt-BR). */
function letterheadMissing(office: FeeAdjustmentLettersResponse['office']): string[] {
  if (!office.registered) return ['Cadastro do escritório'];
  const fields: [keyof FeeAdjustmentLettersResponse['office'], string][] = [
    ['legalName', 'Razão social'],
    ['document', 'CNPJ'],
    ['street', 'Logradouro'],
    ['number', 'Número'],
    ['city', 'Cidade'],
    ['state', 'UF'],
    ['responsibleName', 'Nome do responsável'],
  ];
  return fields.filter(([k]) => !office[k]).map(([, label]) => label);
}

/**
 * Everything to (re)print the letters of a batch (permission `finance`): the batch (indices, the
 * percentage and the chosen index), the office's letterhead (the registry of Configurações ›
 * Escritório) and, per client, the company data (decrypted), the period, the notice deadline and the
 * values the batch started from and applied.
 */
export async function feeAdjustmentLetters(
  db: DbExecutor,
  workspaceId: string,
  cipher: FieldCipher,
  id: string,
): Promise<FeeAdjustmentLettersResponse> {
  const [batch] = await db
    .select()
    .from(feeAdjustments)
    .where(and(eq(feeAdjustments.workspaceId, workspaceId), eq(feeAdjustments.id, id)));
  if (!batch) throw new NotFoundError('Reajuste não encontrado');

  const [rows, [office]] = await Promise.all([
    db
      .select({ item: feeAdjustmentItems, fee: clientFees, client: contacts })
      .from(feeAdjustmentItems)
      .innerJoin(clientFees, and(eq(clientFees.workspaceId, feeAdjustmentItems.workspaceId), eq(clientFees.id, feeAdjustmentItems.clientFeeId)))
      .innerJoin(contacts, and(eq(contacts.workspaceId, clientFees.workspaceId), eq(contacts.id, clientFees.clientId)))
      .where(and(eq(feeAdjustmentItems.workspaceId, workspaceId), eq(feeAdjustmentItems.adjustmentId, id)))
      .orderBy(asc(contacts.name)),
    db
      .select({
        legalName: offices.legalName,
        tradeName: offices.tradeName,
        document: offices.document,
        zipCode: offices.zipCode,
        street: offices.street,
        number: offices.number,
        complement: offices.complement,
        district: offices.district,
        city: offices.city,
        state: offices.state,
        phone: offices.phone,
        email: offices.email,
        website: offices.website,
        responsibleName: offices.responsibleName,
        logo: offices.logo,
        logoType: offices.logoType,
      })
      .from(offices)
      .where(eq(offices.workspaceId, workspaceId)),
  ]);

  const letterhead: FeeAdjustmentLettersResponse['office'] = {
    name: office?.tradeName?.trim() ? office.tradeName : (office?.legalName ?? null),
    legalName: office?.legalName ?? null,
    document: office?.document ?? null,
    zipCode: office?.zipCode ?? null,
    street: office?.street ?? null,
    number: office?.number ?? null,
    complement: office?.complement ?? null,
    district: office?.district ?? null,
    city: office?.city ?? null,
    state: office?.state ?? null,
    phone: office?.phone ?? null,
    email: office?.email ?? null,
    website: office?.website ?? null,
    responsibleName: office?.responsibleName ?? null,
    logo: office?.logo && office.logoType ? toDataUri(office.logoType, office.logo) : null,
    registered: Boolean(office?.legalName && office.document),
  };

  const letters: FeeAdjustmentLetter[] = await Promise.all(
    rows.map(async ({ item, fee, client }) => {
      const plain = await cipher.decryptFields('contacts', client, [
        'document',
        'email',
        'zipCode',
        'street',
        'number',
        'complement',
        'district',
        'responsibleName',
      ]);
      // Dates derive from the contract start, like every fee period (utils/fees.ts).
      const period = feePeriod(client.contractStartDate!, fee.periodIndex);
      return {
        clientId: client.id,
        feeId: fee.id,
        client: {
          name: client.name,
          tradeName: client.tradeName,
          document: plain.document ?? '',
          responsibleName: plain.responsibleName,
          email: plain.email,
          zipCode: plain.zipCode,
          street: plain.street,
          number: plain.number,
          complement: plain.complement,
          district: plain.district,
          city: client.city,
          state: client.state,
        },
        period,
        noticeDeadline: adjustmentNoticeDeadline(period.startDate),
        previous: { amount: item.previousAmount, employeeFee: item.previousEmployeeFee },
        adjusted: { amount: item.amount, employeeFee: item.employeeFee },
        discountBps: item.discountBps,
        edited: fee.amount !== item.amount || fee.employeeFee !== item.employeeFee || fee.discountBps !== item.discountBps,
      };
    }),
  );
  letters.sort((a, b) => displayName(a.client).localeCompare(displayName(b.client), 'pt-BR'));

  return {
    adjustment: toFeeAdjustment(batch, letters.length),
    office: letterhead,
    missingOffice: letterheadMissing(letterhead),
    letters,
  };
}
