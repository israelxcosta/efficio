// Clients (empresas atendidas): company data, contract, inactivation and the yearly fee periods
// (honorários). Stored in `contacts` with kind = 'client', so receivables link to a client like to
// any contact. A client with linked transactions cannot be deleted, only inactivated.

import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import {
  feePeriod,
  feePeriodIndexAt,
  formatDateBR,
  onlyDigits,
  TAX_REGIMES,
  type Client,
  type ClientFee,
  type ClientFeesResponse,
  type ClientListResponse,
  type clientFeeInputSchema,
  type clientInactivationSchema,
  type clientInputSchema,
  type clientQuerySchema,
  type TaxRegime,
} from '@effinance/shared';
import type { z } from 'zod';
import type { DbExecutor } from '../../db/client';
import { clientFees, contacts, recurrences, transactions, type ClientFeeRow, type ContactRow } from '../../db/schema';
import { today } from '../../lib/clock';
import { getCipher } from '../../lib/crypto/keyring';
import type { FieldCipher } from '../../lib/crypto/field-cipher';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { countAll, inChunks, likePattern } from '../../lib/sql';
import { getClientOrThrow } from '../common/ownership';
import { CONTACT_ALL_ENCRYPTED_FIELDS, CONTACT_ENCRYPTED_FIELDS, documentIndex } from '../contacts/service';

type ClientInput = z.output<typeof clientInputSchema>;
type ClientQuery = z.output<typeof clientQuerySchema>;
type InactivationInput = z.output<typeof clientInactivationSchema>;
type FeeInput = z.output<typeof clientFeeInputSchema>;

const TABLE = 'contacts';

/**
 * What the requesting member may see of the clients. Fee periods (honorários) and fee totals are
 * financial data: hidden from members without access to the finances (lib/finance-access.ts).
 */
export interface ClientView {
  fees: boolean;
}

/** Inside the service (writes, then re-read): the route decides what leaves (`withoutFees`). */
const FULL_VIEW: ClientView = { fees: true };

/** A client as seen by a member without access to the finances. */
export function withoutFees(client: Client): Client {
  return { ...client, currentFee: null, latestFee: null };
}

/** Due day of a client saved before migration 0010 set one (the column is filled for them). */
const DEFAULT_FEE_DUE_DAY = 10;

/** Personal data written by the client form, encrypted with the workspace key. */
const CLIENT_INPUT_ENCRYPTED_FIELDS = [
  ...CONTACT_ENCRYPTED_FIELDS,
  'responsibleName',
  'responsibleEmail',
  'responsiblePhone',
] as const satisfies readonly (keyof ClientInput)[];

function toFee(row: ClientFeeRow, contractStart: string): ClientFee {
  return {
    id: row.id,
    clientId: row.clientId,
    ...feePeriod(contractStart, row.periodIndex),
    amount: row.amount,
    employeeFee: row.employeeFee,
    discountBps: row.discountBps,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The period containing `on` and the most recent registered one. Nothing is in force after the
 * client was inactivated.
 */
function pickFees(fees: ClientFee[], client: Pick<ContactRow, 'contractStartDate' | 'inactivatedAt'>, on: string) {
  let latest: ClientFee | null = null;
  for (const fee of fees) if (!latest || fee.index > latest.index) latest = fee;
  if (client.inactivatedAt && client.inactivatedAt < on) return { current: null, latest };
  const index = feePeriodIndexAt(client.contractStartDate!, on);
  return { current: fees.find((f) => f.index === index) ?? null, latest };
}

async function toClient(
  cipher: FieldCipher,
  row: ContactRow,
  feeRows: ClientFeeRow[],
  transactionCount: number,
  view: ClientView,
): Promise<Client> {
  const plain = await cipher.decryptFields(TABLE, row, CONTACT_ALL_ENCRYPTED_FIELDS);
  const contractStart = plain.contractStartDate!;
  const fees = view.fees ? feeRows.map((f) => toFee(f, contractStart)) : [];
  const { current, latest } = view.fees ? pickFees(fees, plain, today()) : { current: null, latest: null };
  return {
    id: plain.id,
    name: plain.name,
    tradeName: plain.tradeName,
    document: plain.document ?? '',
    openedAt: plain.openedAt,
    mainActivity: plain.mainActivity,
    email: plain.email,
    phone: plain.phone,
    responsibleName: plain.responsibleName,
    responsibleEmail: plain.responsibleEmail,
    responsiblePhone: plain.responsiblePhone,
    taxRegime: plain.taxRegime!,
    simplesAnnex: plain.simplesAnnex,
    contractStartDate: contractStart,
    feeDueDay: plain.feeDueDay ?? DEFAULT_FEE_DUE_DAY,
    zipCode: plain.zipCode,
    street: plain.street,
    number: plain.number,
    complement: plain.complement,
    district: plain.district,
    city: plain.city,
    state: plain.state,
    notes: plain.notes,
    status: plain.status,
    inactivation:
      plain.status === 'inactive' && plain.inactivatedAt && plain.inactivationReason
        ? { date: plain.inactivatedAt, reason: plain.inactivationReason, notes: plain.inactivationNotes }
        : null,
    currentFee: current,
    latestFee: latest,
    transactionCount,
    createdAt: plain.createdAt.toISOString(),
  };
}

/** Fees (when visible) and transaction counts of a set of clients, then the API shape. */
async function hydrate(db: DbExecutor, workspaceId: string, rows: ContactRow[], view: ClientView): Promise<Client[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [fees, counts] = await Promise.all([
    view.fees
      ? db
          .select()
          .from(clientFees)
          .where(and(eq(clientFees.workspaceId, workspaceId), inArray(clientFees.clientId, ids)))
      : Promise.resolve([] as ClientFeeRow[]),
    db
      .select({ contactId: transactions.contactId, total: countAll() })
      .from(transactions)
      .where(and(eq(transactions.workspaceId, workspaceId), inArray(transactions.contactId, ids)))
      .groupBy(transactions.contactId),
  ]);
  const cipher = await getCipher(workspaceId);
  return Promise.all(
    rows.map((row) =>
      toClient(
        cipher,
        row,
        fees.filter((f) => f.clientId === row.id),
        counts.find((c) => c.contactId === row.id)?.total ?? 0,
        view,
      ),
    ),
  );
}

/** What a report needs of a client: names, document, phones and status (no fees or counts). */
export type ClientContact = Pick<
  Client,
  'id' | 'name' | 'tradeName' | 'document' | 'phone' | 'responsibleName' | 'responsiblePhone' | 'status'
>;

/**
 * Clients by id with their contact data decrypted. Ids outside the workspace or not clients are
 * ignored; the list goes in chunks (it grows with the office's client base).
 */
export async function getClientContacts(db: DbExecutor, workspaceId: string, ids: string[]): Promise<ClientContact[]> {
  if (ids.length === 0) return [];
  const columns = {
    id: contacts.id,
    name: contacts.name,
    tradeName: contacts.tradeName,
    document: contacts.document,
    phone: contacts.phone,
    responsibleName: contacts.responsibleName,
    responsiblePhone: contacts.responsiblePhone,
    status: contacts.status,
  };
  const parts = await Promise.all(
    inChunks(ids).map((chunk) =>
      db
        .select(columns)
        .from(contacts)
        .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.kind, 'client'), inArray(contacts.id, chunk))),
    ),
  );
  const cipher = await getCipher(workspaceId);
  return Promise.all(
    parts.flat().map(async (row) => {
      const plain = await cipher.decryptFields(TABLE, row, ['document', 'phone', 'responsibleName', 'responsiblePhone']);
      return { ...plain, document: plain.document ?? '' };
    }),
  );
}

async function encryptClientInput(cipher: FieldCipher, input: ClientInput) {
  const encrypted = await cipher.encryptFields(TABLE, input, CLIENT_INPUT_ENCRYPTED_FIELDS);
  return { ...encrypted, documentHash: await documentIndex(cipher, input.document) };
}

async function assertUniqueDocument(db: DbExecutor, workspaceId: string, documentHash: string, exceptId?: string) {
  const [duplicate] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        eq(contacts.kind, 'client'),
        eq(contacts.documentHash, documentHash),
        exceptId ? ne(contacts.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  if (duplicate) throw new ConflictError('Já existe um cliente cadastrado com este CNPJ');
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

/**
 * Counts and the monthly fees currently in force, over every client of the workspace. Without
 * access to the fees, only the counts: the fee totals are `null` (the fees are not even read).
 */
async function summarize(db: DbExecutor, workspaceId: string, view: ClientView): Promise<ClientListResponse['summary']> {
  const [rows, fees] = await Promise.all([
    db
      .select({ id: contacts.id, status: contacts.status, contractStartDate: contacts.contractStartDate, taxRegime: contacts.taxRegime })
      .from(contacts)
      .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.kind, 'client'))),
    view.fees
      ? db
          .select({ clientId: clientFees.clientId, periodIndex: clientFees.periodIndex, amount: clientFees.amount })
          .from(clientFees)
          .where(eq(clientFees.workspaceId, workspaceId))
      : Promise.resolve([]),
  ]);
  const byPeriod = new Map(fees.map((f) => [`${f.clientId}:${f.periodIndex}`, f.amount]));
  const now = today();
  const byRegime = Object.fromEntries(TAX_REGIMES.map((r) => [r, 0])) as Record<TaxRegime, number>;
  const summary = { active: 0, inactive: 0, monthlyFees: 0, withoutCurrentFee: 0, byRegime, averageFee: 0 };
  for (const row of rows) {
    if (row.status === 'inactive') {
      summary.inactive += 1;
      continue;
    }
    summary.active += 1;
    if (row.taxRegime) byRegime[row.taxRegime] += 1;
    const amount = byPeriod.get(`${row.id}:${feePeriodIndexAt(row.contractStartDate!, now)}`);
    if (amount === undefined) summary.withoutCurrentFee += 1;
    else summary.monthlyFees += amount;
  }
  const withFee = summary.active - summary.withoutCurrentFee;
  summary.averageFee = withFee > 0 ? Math.round(summary.monthlyFees / withFee) : 0;
  if (!view.fees) return { ...summary, monthlyFees: null, withoutCurrentFee: null, averageFee: null };
  return summary;
}

/** Search: razão social / nome fantasia (partial) or CNPJ (exact, through the blind index). */
export async function listClients(
  db: DbExecutor,
  workspaceId: string,
  q: ClientQuery,
  view: ClientView,
): Promise<ClientListResponse> {
  let search;
  if (q.search) {
    const digits = onlyDigits(q.search);
    const pattern = likePattern(q.search);
    search = or(
      ilike(contacts.name, pattern),
      ilike(contacts.tradeName, pattern),
      digits.length === 14 ? eq(contacts.documentHash, await documentIndex(await getCipher(workspaceId), digits)) : undefined,
    );
  }
  const where = and(
    eq(contacts.workspaceId, workspaceId),
    eq(contacts.kind, 'client'),
    q.status === 'all' ? undefined : eq(contacts.status, q.status),
    q.taxRegime ? eq(contacts.taxRegime, q.taxRegime) : undefined,
    search,
  );
  const [rows, [count], summary] = await Promise.all([
    db
      .select()
      .from(contacts)
      .where(where)
      // As listed: trade name when there is one, else the legal name.
      .orderBy(sql`lower(coalesce(${contacts.tradeName}, ${contacts.name}))`, asc(contacts.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: countAll() }).from(contacts).where(where),
    summarize(db, workspaceId, view),
  ]);
  return { items: await hydrate(db, workspaceId, rows, view), total: count?.total ?? 0, page: q.page, pageSize: q.pageSize, summary };
}

export async function getClient(db: DbExecutor, workspaceId: string, id: string, view: ClientView): Promise<Client> {
  const [client] = await hydrate(db, workspaceId, [await getClientOrThrow(db, workspaceId, id)], view);
  return client!;
}

export async function createClient(db: DbExecutor, workspaceId: string, input: ClientInput): Promise<Client> {
  const cipher = await getCipher(workspaceId);
  const values = await encryptClientInput(cipher, input);
  await assertUniqueDocument(db, workspaceId, values.documentHash);
  const [row] = await db
    .insert(contacts)
    .values({ workspaceId, kind: 'client', status: 'active', ...values })
    .returning();
  return toClient(cipher, row!, [], 0, FULL_VIEW);
}

export async function updateClient(db: DbExecutor, workspaceId: string, id: string, input: ClientInput): Promise<Client> {
  const current = await getClientOrThrow(db, workspaceId, id);
  if (current.status === 'inactive' && current.inactivatedAt && input.contractStartDate > current.inactivatedAt) {
    throw new ValidationError(
      `O cliente foi inativado em ${formatDateBR(current.inactivatedAt)}: o início do contrato não pode ser posterior a essa data`,
    );
  }
  const cipher = await getCipher(workspaceId);
  const values = await encryptClientInput(cipher, input);
  await assertUniqueDocument(db, workspaceId, values.documentHash, id);
  await db.update(contacts).set(values).where(eq(contacts.id, id));
  return getClient(db, workspaceId, id, FULL_VIEW);
}

/** Refused while any transaction (or series) is linked to the client: inactivate it instead. */
export async function deleteClient(db: DbExecutor, workspaceId: string, id: string): Promise<void> {
  await getClientOrThrow(db, workspaceId, id);
  const [[linked], [series]] = await Promise.all([
    db
      .select({ total: countAll() })
      .from(transactions)
      .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.contactId, id))),
    db
      .select({ total: countAll() })
      .from(recurrences)
      .where(and(eq(recurrences.workspaceId, workspaceId), sql`${recurrences.template}->>'contactId' = ${id}`)),
  ]);
  const total = (linked?.total ?? 0) + (series?.total ?? 0);
  if (total > 0) {
    throw new ConflictError(
      'Este cliente possui lançamentos vinculados e não pode ser excluído. Se ele deixou de ser atendido, use "Inativar".',
      { transactions: linked?.total ?? 0 },
    );
  }
  await db.delete(contacts).where(eq(contacts.id, id));
}

export async function inactivateClient(db: DbExecutor, workspaceId: string, id: string, input: InactivationInput): Promise<Client> {
  const row = await getClientOrThrow(db, workspaceId, id);
  if (row.status === 'inactive') throw new ConflictError('Este cliente já está inativo');
  if (input.date < row.contractStartDate!) {
    throw new ValidationError(
      `A inativação não pode ser anterior ao início do contrato (${formatDateBR(row.contractStartDate)})`,
    );
  }
  const cipher = await getCipher(workspaceId);
  await db
    .update(contacts)
    .set({
      status: 'inactive',
      inactivatedAt: input.date,
      inactivationReason: input.reason,
      inactivationNotes: await cipher.encrypt(TABLE, 'inactivationNotes', input.notes),
    })
    .where(eq(contacts.id, id));
  return getClient(db, workspaceId, id, FULL_VIEW);
}

export async function reactivateClient(db: DbExecutor, workspaceId: string, id: string): Promise<Client> {
  await getClientOrThrow(db, workspaceId, id);
  await db
    .update(contacts)
    .set({ status: 'active', inactivatedAt: null, inactivationReason: null, inactivationNotes: null })
    .where(eq(contacts.id, id));
  return getClient(db, workspaceId, id, FULL_VIEW);
}

// ---------------------------------------------------------------------------
// Fees (honorários): one-year periods, back to back from the contract start
// ---------------------------------------------------------------------------

async function feeRows(db: DbExecutor, workspaceId: string, clientId: string) {
  return db
    .select()
    .from(clientFees)
    .where(and(eq(clientFees.workspaceId, workspaceId), eq(clientFees.clientId, clientId)))
    .orderBy(desc(clientFees.periodIndex));
}

async function getFeeOrThrow(db: DbExecutor, workspaceId: string, clientId: string, feeId: string) {
  const [row] = await db
    .select()
    .from(clientFees)
    .where(and(eq(clientFees.id, feeId), eq(clientFees.workspaceId, workspaceId), eq(clientFees.clientId, clientId)));
  if (!row) throw new NotFoundError('Vigência não encontrada');
  return row;
}

export async function listFees(db: DbExecutor, workspaceId: string, clientId: string): Promise<ClientFeesResponse> {
  const client = await getClientOrThrow(db, workspaceId, clientId);
  const start = client.contractStartDate!;
  const rows = await feeRows(db, workspaceId, clientId);
  const items = rows.map((r) => toFee(r, start));
  return {
    current: pickFees(items, client, today()).current,
    items,
    next: feePeriod(start, rows.length > 0 ? rows[0]!.periodIndex + 1 : 0),
  };
}

/** Registers the next period: the first one starts on the contract start date. */
export async function addFee(db: DbExecutor, workspaceId: string, clientId: string, input: FeeInput): Promise<ClientFee> {
  const client = await getClientOrThrow(db, workspaceId, clientId);
  const start = client.contractStartDate!;
  const [last] = await feeRows(db, workspaceId, clientId);
  const period = feePeriod(start, last ? last.periodIndex + 1 : 0);
  if (client.status === 'inactive' && client.inactivatedAt && period.startDate > client.inactivatedAt) {
    throw new ValidationError(
      `O cliente foi inativado em ${formatDateBR(client.inactivatedAt)}: não há vigência a partir de ${formatDateBR(period.startDate)}`,
    );
  }
  const [row] = await db
    .insert(clientFees)
    .values({
      workspaceId,
      clientId,
      periodIndex: period.index,
      amount: input.amount,
      employeeFee: input.employeeFee,
      discountBps: input.discountBps,
    })
    .returning();
  return toFee(row!, start);
}

export async function updateFee(
  db: DbExecutor,
  workspaceId: string,
  clientId: string,
  feeId: string,
  input: FeeInput,
): Promise<ClientFee> {
  const client = await getClientOrThrow(db, workspaceId, clientId);
  await getFeeOrThrow(db, workspaceId, clientId, feeId);
  const [row] = await db
    .update(clientFees)
    .set({ amount: input.amount, employeeFee: input.employeeFee, discountBps: input.discountBps })
    .where(eq(clientFees.id, feeId))
    .returning();
  return toFee(row!, client.contractStartDate!);
}

/** Only the most recent period can be removed: the others stay back to back. */
export async function deleteFee(db: DbExecutor, workspaceId: string, clientId: string, feeId: string): Promise<void> {
  await getClientOrThrow(db, workspaceId, clientId);
  const fee = await getFeeOrThrow(db, workspaceId, clientId, feeId);
  const [last] = await feeRows(db, workspaceId, clientId);
  if (last && last.periodIndex !== fee.periodIndex) {
    throw new ValidationError('Só a vigência mais recente pode ser excluída');
  }
  await db.delete(clientFees).where(eq(clientFees.id, feeId));
}
