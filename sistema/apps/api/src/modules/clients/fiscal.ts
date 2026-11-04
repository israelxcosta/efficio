// Phase 3 of the client registry (spec §13.8): fiscal data, the encrypted accesses, the documents with
// expiry date and the unions linked to the client. The registry stays the finance's (`finance` writes
// it); documents, registrations and unions are read by every member (Gestão), and the accesses never
// leave in lists, searches or exports of lists — only `revealCredential`, behind its own permission,
// a per-member limit and an audit record, decrypts one of them.

import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import {
  CLIENT_DOCUMENT_KIND_LABELS,
  deadlineStatus,
  trackedConvention,
  type ClientCredentialField,
  type ClientCredentialFlags,
  type ClientDocument,
  type ClientUnionRef,
  type CredentialUpdateInput,
  type clientDocumentInputSchema,
} from '@effinance/shared';
import type { z } from 'zod';
import type { DbExecutor } from '../../db/client';
import { clientDocuments, contacts, unionClients, unionConventions, unions, type ClientDocumentRow, type ContactRow } from '../../db/schema';
import type { FieldCipher } from '../../lib/crypto/field-cipher';
import { groupBy } from '../../lib/collections';
import { InvalidTextError, NotFoundError } from '../../lib/errors';
import { inChunks } from '../../lib/sql';

type DocumentInput = z.output<typeof clientDocumentInputSchema>;

const CONTACTS = 'contacts';
const DOCUMENTS = 'client_documents';

/** Who changes something (recorded with documents; the name at the time). */
export interface Actor {
  userId: string | null;
  name: string;
}

/** Writes outside a request (seeds, migrations of data). */
export const SYSTEM_ACTOR: Actor = { userId: null, name: 'Sistema' };

/** Column of each encrypted access. */
export const CREDENTIAL_COLUMNS = {
  simplesAccessCode: 'simplesAccessCode',
  accountantPassword: 'accountantPassword',
} as const satisfies Record<ClientCredentialField, keyof ContactRow>;

const hasNul = (value: string) => value.includes('\u0000');

/** Values of the phase 3 columns to write. Absent fields keep what is stored (`undefined` = no change). */
export async function fiscalColumns(
  cipher: FieldCipher,
  input: {
    stateRegistration?: string | null;
    stateRegistrationExempt?: boolean;
    municipalRegistration?: string | null;
    responsibleDocument?: string | null;
    simplesAccessCode?: CredentialUpdateInput;
    accountantPassword?: CredentialUpdateInput;
  },
): Promise<Partial<Pick<ContactRow, 'stateRegistration' | 'stateRegistrationExempt' | 'municipalRegistration' | 'responsibleDocument' | 'simplesAccessCode' | 'accountantPassword'>>> {
  const out: Partial<Pick<ContactRow, 'stateRegistration' | 'stateRegistrationExempt' | 'municipalRegistration' | 'responsibleDocument' | 'simplesAccessCode' | 'accountantPassword'>> = {};
  if (input.stateRegistrationExempt !== undefined) out.stateRegistrationExempt = input.stateRegistrationExempt;
  if (input.stateRegistration !== undefined) out.stateRegistration = input.stateRegistration;
  // Exempt: no registration number, even when only the flag was sent.
  if (input.stateRegistrationExempt === true) out.stateRegistration = null;
  if (input.municipalRegistration !== undefined) out.municipalRegistration = input.municipalRegistration;
  if (input.responsibleDocument !== undefined) {
    out.responsibleDocument = await cipher.encrypt(CONTACTS, 'responsibleDocument', input.responsibleDocument);
  }
  for (const field of ['simplesAccessCode', 'accountantPassword'] as const) {
    const update = input[field];
    if (!update || update.action === 'keep') continue;
    if (update.action === 'clear') {
      out[field] = null;
      continue;
    }
    if (hasNul(update.value)) throw new InvalidTextError();
    out[field] = await cipher.encrypt(CONTACTS, CREDENTIAL_COLUMNS[field], update.value);
  }
  return out;
}

export function credentialFlags(row: Pick<ContactRow, 'simplesAccessCode' | 'accountantPassword'>): ClientCredentialFlags {
  return { simplesAccessCode: Boolean(row.simplesAccessCode), accountantPassword: Boolean(row.accountantPassword) };
}

/** The value of one access of a client (decrypted). 404 when the client is not of the workspace. */
export async function revealCredential(
  db: DbExecutor,
  cipher: FieldCipher,
  workspaceId: string,
  clientId: string,
  field: ClientCredentialField,
): Promise<string | null> {
  const column = field === 'simplesAccessCode' ? contacts.simplesAccessCode : contacts.accountantPassword;
  const [row] = await db
    .select({ value: column })
    .from(contacts)
    .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, clientId), eq(contacts.kind, 'client')));
  if (!row) throw new NotFoundError('Cliente não encontrado');
  return cipher.decrypt(CONTACTS, CREDENTIAL_COLUMNS[field], row.value);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export function documentName(row: Pick<ClientDocumentRow, 'kind' | 'customName'>): string {
  return row.kind === 'other' ? (row.customName ?? CLIENT_DOCUMENT_KIND_LABELS.other) : CLIENT_DOCUMENT_KIND_LABELS[row.kind];
}

export async function toClientDocument(cipher: FieldCipher, row: ClientDocumentRow, today: string): Promise<ClientDocument> {
  return {
    id: row.id,
    kind: row.kind,
    name: documentName(row),
    customName: row.customName,
    expiresAt: row.expiresAt,
    note: await cipher.decrypt(DOCUMENTS, 'note', row.note),
    deadline: deadlineStatus(row.expiresAt, today),
    updatedBy: row.updatedByName ? { id: row.updatedBy, name: row.updatedByName } : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Documents of the given clients, by client, most urgent first (no date at the end). */
export async function loadDocuments(
  db: DbExecutor,
  cipher: FieldCipher,
  workspaceId: string,
  clientIds: readonly string[],
  today: string,
): Promise<Map<string, ClientDocument[]>> {
  const out = new Map<string, ClientDocument[]>();
  if (clientIds.length === 0) return out;
  for (const chunk of inChunks([...clientIds])) {
    const rows = await db
      .select()
      .from(clientDocuments)
      .where(and(eq(clientDocuments.workspaceId, workspaceId), inArray(clientDocuments.clientId, chunk)))
      .orderBy(sql`${clientDocuments.expiresAt} asc nulls last`, asc(clientDocuments.createdAt), asc(clientDocuments.id));
    for (const row of rows) {
      const list = out.get(row.clientId) ?? [];
      list.push(await toClientDocument(cipher, row, today));
      out.set(row.clientId, list);
    }
  }
  return out;
}

/**
 * Replaces the documents of a client with `list` (spec §18.14: the list is substitutive; the caller
 * passes nothing when the field was absent). Kept documents are updated only when something changed
 * (who changed it stays right); unknown ids are "not found".
 */
export async function replaceDocuments(
  db: DbExecutor,
  cipher: FieldCipher,
  workspaceId: string,
  clientId: string,
  list: readonly DocumentInput[],
  actor: Actor,
): Promise<void> {
  const current = await db
    .select()
    .from(clientDocuments)
    .where(and(eq(clientDocuments.workspaceId, workspaceId), eq(clientDocuments.clientId, clientId)));
  const byId = new Map(current.map((r) => [r.id, r]));
  const keep = list.filter((d) => d.id).map((d) => d.id!);
  if (keep.some((id) => !byId.has(id))) throw new NotFoundError('Documento não encontrado');
  for (const doc of list) {
    if (doc.note && hasNul(doc.note)) throw new InvalidTextError();
  }
  await db
    .delete(clientDocuments)
    .where(
      and(
        eq(clientDocuments.workspaceId, workspaceId),
        eq(clientDocuments.clientId, clientId),
        keep.length > 0 ? notInArray(clientDocuments.id, keep) : undefined,
      ),
    );
  const who = { updatedBy: actor.userId, updatedByName: actor.name };
  for (const doc of list) {
    const values = {
      kind: doc.kind,
      customName: doc.customName,
      expiresAt: doc.expiresAt,
      note: await cipher.encrypt(DOCUMENTS, 'note', doc.note),
    };
    const existing = doc.id ? byId.get(doc.id) : undefined;
    if (!existing) {
      await db.insert(clientDocuments).values({ workspaceId, clientId, ...values, ...who });
      continue;
    }
    const oldNote = await cipher.decrypt(DOCUMENTS, 'note', existing.note);
    const changed =
      existing.kind !== doc.kind || existing.customName !== doc.customName || existing.expiresAt !== doc.expiresAt || oldNote !== doc.note;
    if (!changed) continue;
    await db
      .update(clientDocuments)
      .set({ ...values, ...who })
      .where(and(eq(clientDocuments.workspaceId, workspaceId), eq(clientDocuments.id, existing.id)));
  }
}

// ---------------------------------------------------------------------------
// Unions of the clients
// ---------------------------------------------------------------------------

/** Unions linked to each client, with the agreement being tracked (by name). */
export async function loadClientUnions(
  db: DbExecutor,
  workspaceId: string,
  clientIds: readonly string[],
  today: string,
): Promise<Map<string, ClientUnionRef[]>> {
  const out = new Map<string, ClientUnionRef[]>();
  if (clientIds.length === 0) return out;
  const links: { clientId: string; unionId: string; name: string; acronym: string | null; category: string | null; active: boolean; baseMonth: number | null }[] = [];
  for (const chunk of inChunks([...clientIds])) {
    links.push(
      ...(await db
        .select({
          clientId: unionClients.clientId,
          unionId: unions.id,
          name: unions.name,
          acronym: unions.acronym,
          category: unions.category,
          active: unions.active,
          baseMonth: unions.baseMonth,
        })
        .from(unionClients)
        .innerJoin(unions, and(eq(unions.workspaceId, unionClients.workspaceId), eq(unions.id, unionClients.unionId)))
        .where(and(eq(unionClients.workspaceId, workspaceId), inArray(unionClients.clientId, chunk)))),
    );
  }
  if (links.length === 0) return out;
  const unionIds = [...new Set(links.map((l) => l.unionId))];
  const cycles: { unionId: string; year: number; published: boolean }[] = [];
  for (const chunk of inChunks(unionIds)) {
    cycles.push(
      ...(await db
        .select({ unionId: unionConventions.unionId, year: unionConventions.year, published: unionConventions.published })
        .from(unionConventions)
        .where(and(eq(unionConventions.workspaceId, workspaceId), inArray(unionConventions.unionId, chunk)))),
    );
  }
  const cyclesByUnion = groupBy(cycles, (c) => c.unionId);
  for (const link of links) {
    const ref: ClientUnionRef = {
      id: link.unionId,
      name: link.acronym?.trim() ? link.acronym : link.name,
      category: link.category,
      active: link.active,
      tracked: trackedConvention(
        link.baseMonth,
        cyclesByUnion.get(link.unionId) ?? [],
        today,
      ),
    };
    const list = out.get(link.clientId) ?? [];
    list.push(ref);
    out.set(link.clientId, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return out;
}
