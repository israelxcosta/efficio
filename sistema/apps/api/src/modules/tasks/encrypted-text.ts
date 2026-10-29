// Free text of the task module, encrypted per field like the other "observações" of the privacy
// policy (§5): AES-256-GCM with the workspace data key, AAD `workspace:table:column`, stored as
// `v1.<iv>.<ct>` (lib/crypto/field-cipher.ts). A ciphertext copied to another workspace, table or
// column does not decrypt. Encrypted: the description of a task and the text of a comment. Titles
// (tasks, subtasks) stay in clear text: they are what `GET /tasks?search=` searches and what every
// list shows. The size limits live in the contract (5000 characters); the database only bounds the
// ciphertext (migration 0013).

import type { FieldCipher } from '../../lib/crypto/field-cipher';
import { InvalidTextError } from '../../lib/errors';

/** Table and column of each encrypted field (the AAD). Shared with the backfill and the LGPD export. */
export const TASK_DESCRIPTION = { table: 'tasks', column: 'description' } as const;
export const TASK_COMMENT_TEXT = { table: 'task_comments', column: 'text' } as const;

type TaskTextField = typeof TASK_DESCRIPTION | typeof TASK_COMMENT_TEXT;
type Cipher = Pick<FieldCipher, 'encrypt' | 'decrypt'>;

export async function encryptTaskText(
  cipher: Cipher,
  field: TaskTextField,
  value: string,
): Promise<string>;
export async function encryptTaskText(
  cipher: Cipher,
  field: TaskTextField,
  value: string | null,
): Promise<string | null>;
export async function encryptTaskText(
  cipher: Cipher,
  field: TaskTextField,
  value: string | null,
): Promise<string | null> {
  if (value === null) return null;
  // The contract never lets an empty text through (optional text becomes null; a comment has min 1).
  if (value === '') throw new Error(`encryptTaskText: empty ${field.table}.${field.column}`);
  // A clear-text column refuses NUL (22021 → 400); the ciphertext would hide it, so refuse it here.
  if (value.includes('\u0000')) throw new InvalidTextError();
  return (await cipher.encrypt(field.table, field.column, value))!;
}

/** Throws `DecryptionError` for plain text or a value from another workspace, table or column. */
export async function decryptTaskText(
  cipher: Cipher,
  field: TaskTextField,
  value: string,
): Promise<string>;
export async function decryptTaskText(
  cipher: Cipher,
  field: TaskTextField,
  value: string | null,
): Promise<string | null>;
export async function decryptTaskText(
  cipher: Cipher,
  field: TaskTextField,
  value: string | null,
): Promise<string | null> {
  if (value === null) return null;
  return (await cipher.decrypt(field.table, field.column, value))!;
}
