import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import {
  onlyDigits,
  type Contact,
  type Paginated,
  type contactInputSchema,
  type contactQuerySchema,
} from '@effinance/shared';
import type { z } from 'zod';
import type { DbExecutor } from '../../db/client';
import { contacts, recurrences, type ContactRow } from '../../db/schema';
import { getCipher } from '../../lib/crypto/keyring';
import type { FieldCipher } from '../../lib/crypto/field-cipher';
import { countAll, likePattern } from '../../lib/sql';
import { getSupplierOrThrow } from '../common/ownership';

type ContactInput = z.output<typeof contactInputSchema>;
type ContactQuery = z.output<typeof contactQuerySchema>;

/** Personal data stored encrypted with the workspace key. Name, city and state stay searchable. */
export const CONTACT_ENCRYPTED_FIELDS = [
  'document',
  'email',
  'phone',
  'zipCode',
  'street',
  'number',
  'complement',
  'district',
  'notes',
] as const satisfies readonly (keyof ContactRow & keyof ContactInput)[];

/** Every encrypted column of `contacts` (supplier fields + the client-only personal fields). */
export const CONTACT_ALL_ENCRYPTED_FIELDS = [
  ...CONTACT_ENCRYPTED_FIELDS,
  'responsibleName',
  'responsibleEmail',
  'responsiblePhone',
  'inactivationNotes',
] as const satisfies readonly (keyof ContactRow)[];

const TABLE = 'contacts';

/** Blind index of a CPF/CNPJ (digits only) for exact search. */
export function documentIndex(cipher: FieldCipher, digits: string): Promise<string> {
  return cipher.blindIndex(`document:${digits}`);
}

export async function toContact(cipher: FieldCipher, row: ContactRow): Promise<Contact> {
  const plain = await cipher.decryptFields(TABLE, row, CONTACT_ENCRYPTED_FIELDS);
  return {
    id: plain.id,
    kind: plain.kind,
    status: plain.status,
    name: plain.name,
    document: plain.document,
    email: plain.email,
    phone: plain.phone,
    zipCode: plain.zipCode,
    street: plain.street,
    number: plain.number,
    complement: plain.complement,
    district: plain.district,
    city: plain.city,
    state: plain.state,
    notes: plain.notes,
    createdAt: plain.createdAt.toISOString(),
  };
}

/** Encrypted columns (+ document blind index) for an insert/update. */
export async function encryptContactInput(cipher: FieldCipher, input: ContactInput) {
  const encrypted = await cipher.encryptFields(TABLE, input, CONTACT_ENCRYPTED_FIELDS);
  const digits = input.document ? onlyDigits(input.document) : '';
  return { ...encrypted, documentHash: digits ? await documentIndex(cipher, digits) : null };
}

/**
 * Search: name (partial) or CPF/CNPJ (exact, through the blind index). Encrypted fields such as
 * e-mail and phone are not searchable. Without `kind`, suppliers and clients (pickers of the
 * transaction forms and filters).
 */
export async function listContacts(db: DbExecutor, workspaceId: string, q: ContactQuery): Promise<Paginated<Contact>> {
  const cipher = await getCipher(workspaceId);
  let search;
  if (q.search) {
    const digits = onlyDigits(q.search);
    search = or(
      ilike(contacts.name, likePattern(q.search)),
      digits.length === 11 || digits.length === 14
        ? eq(contacts.documentHash, await documentIndex(cipher, digits))
        : undefined,
    );
  }
  const where = and(eq(contacts.workspaceId, workspaceId), q.kind ? eq(contacts.kind, q.kind) : undefined, search);
  const [rows, [count]] = await Promise.all([
    db
      .select()
      .from(contacts)
      .where(where)
      .orderBy(asc(contacts.name))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: countAll() }).from(contacts).where(where),
  ]);
  return {
    items: await Promise.all(rows.map((r) => toContact(cipher, r))),
    total: count?.total ?? 0,
    page: q.page,
    pageSize: q.pageSize,
  };
}

/** Suppliers only: clients are read and written through /clients. */
export async function getContact(db: DbExecutor, workspaceId: string, id: string) {
  return toContact(await getCipher(workspaceId), await getSupplierOrThrow(db, workspaceId, id));
}

export async function createContact(db: DbExecutor, workspaceId: string, input: ContactInput) {
  const cipher = await getCipher(workspaceId);
  const [row] = await db
    .insert(contacts)
    .values({ workspaceId, kind: 'supplier', ...(await encryptContactInput(cipher, input)) })
    .returning();
  return toContact(cipher, row!);
}

export async function updateContact(db: DbExecutor, workspaceId: string, id: string, input: ContactInput) {
  await getSupplierOrThrow(db, workspaceId, id);
  const cipher = await getCipher(workspaceId);
  const [row] = await db
    .update(contacts)
    .set(await encryptContactInput(cipher, input))
    .where(eq(contacts.id, id))
    .returning();
  return toContact(cipher, row!);
}

/**
 * Series templates keep a copy of the contact id (jsonb, no foreign key): without clearing it, the
 * next occurrence generated from the series would point at the deleted contact.
 */
export async function detachContactFromSeries(db: DbExecutor, workspaceId: string, id: string) {
  await db
    .update(recurrences)
    .set({ template: sql`jsonb_set(${recurrences.template}, '{contactId}', 'null'::jsonb)` })
    .where(and(eq(recurrences.workspaceId, workspaceId), sql`${recurrences.template}->>'contactId' = ${id}`));
}

/** Transactions keep existing without the supplier (FK is ON DELETE SET NULL). */
export async function deleteContact(db: DbExecutor, workspaceId: string, id: string) {
  await getSupplierOrThrow(db, workspaceId, id);
  await detachContactFromSeries(db, workspaceId, id);
  await db.delete(contacts).where(eq(contacts.id, id));
}
