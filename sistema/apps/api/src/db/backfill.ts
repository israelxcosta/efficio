// Encrypts data written before field encryption existed (contacts, notes, task descriptions and
// comments) and gives every workspace a data key. Idempotent: values already in the `v1.` format are
// skipped. Runs after migrations (`db:migrate`, the demo's boot); a migration that encrypts a new
// field clears `encryption_backfilled_at` so every workspace is checked again (0013).
//
// Completion is tracked per workspace (`workspaces.encryption_backfilled_at`), not by the presence of
// the data key: keys are created outside the tenant transaction (and lazily by the API), so "has a
// key" never proved that its rows were encrypted — a run interrupted after the key was stored, or a
// workspace first opened by the API before `db:migrate`, would have kept plain text forever.

import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { DbExecutor } from './client';
import {
  contacts,
  goalContributions,
  goals,
  recurrences,
  taskComments,
  tasks,
  transactions,
  workspaces,
} from './schema';
import { getCipher } from '../lib/crypto/keyring';
import { isEncrypted } from '../lib/crypto/field-cipher';
import { withTenant } from '../lib/tenant';
import { CONTACT_ALL_ENCRYPTED_FIELDS, CONTACT_ENCRYPTED_FIELDS, encryptContactInput, responsibleNameIndex } from '../modules/contacts/service';
import { encryptTaskText, TASK_COMMENT_TEXT, TASK_DESCRIPTION } from '../modules/tasks/encrypted-text';

const CLIENT_ONLY_ENCRYPTED_FIELDS = CONTACT_ALL_ENCRYPTED_FIELDS.filter(
  (f): f is Exclude<(typeof CONTACT_ALL_ENCRYPTED_FIELDS)[number], (typeof CONTACT_ENCRYPTED_FIELDS)[number]> =>
    !(CONTACT_ENCRYPTED_FIELDS as readonly string[]).includes(f),
);

const pendingWorkspaces =or(isNull(workspaces.wrappedKey), isNull(workspaces.encryptionBackfilledAt));

export async function backfillEncryption(db: DbExecutor): Promise<{ workspaces: number; rows: number }> {
  const pending = await db.select({ id: workspaces.id }).from(workspaces).where(pendingWorkspaces);
  let rows = 0;
  for (const { id } of pending) {
    const cipher = await getCipher(id); // generates the key of migrated workspaces
    rows += await withTenant(db, id, async (tx) => {
      let n = 0;
      const plain = (v: string | null) => v !== null && v !== '' && !isEncrypted(v);

      for (const c of await tx.select().from(contacts)) {
        // Client-only encrypted fields (responsible person, inactivation notes): migration 0026 refuses
        // clear text in any of them, so they are encrypted in the same UPDATE as the supplier fields.
        const clientOnly: Partial<Record<(typeof CLIENT_ONLY_ENCRYPTED_FIELDS)[number], string | null>> = {};
        for (const f of CLIENT_ONLY_ENCRYPTED_FIELDS) {
          if (plain(c[f])) clientOnly[f] = await cipher.encrypt('contacts', f, c[f]);
        }
        const mainPending = CONTACT_ENCRYPTED_FIELDS.some((f) => plain(c[f])) || (!c.documentHash && !!c.document);
        if (!mainPending && Object.keys(clientOnly).length === 0) continue;
        let main = {};
        if (mainPending) {
          const decrypted = { ...c };
          for (const f of CONTACT_ENCRYPTED_FIELDS) {
            if (isEncrypted(c[f])) decrypted[f] = await cipher.decrypt('contacts', f, c[f]);
          }
          const { id: _id, workspaceId: _w, createdAt: _c, documentHash: _h, ...input } = decrypted;
          main = await encryptContactInput(cipher, { ...input, name: c.name });
        }
        await tx.update(contacts).set({ ...main, ...clientOnly }).where(eq(contacts.id, c.id));
        n++;
      }
      // Blind index of the responsible name of clients saved before 0022 (exact search).
      for (const c of await tx
        .select({ id: contacts.id, responsibleName: contacts.responsibleName })
        .from(contacts)
        .where(and(isNull(contacts.responsibleNameHash), sql`${contacts.responsibleName} is not null`))) {
        const name = isEncrypted(c.responsibleName) ? await cipher.decrypt('contacts', 'responsibleName', c.responsibleName) : c.responsibleName;
        const hash = await responsibleNameIndex(cipher, name);
        if (!hash) continue;
        await tx.update(contacts).set({ responsibleNameHash: hash }).where(eq(contacts.id, c.id));
        n++;
      }
      for (const t of await tx.select({ id: transactions.id, notes: transactions.notes }).from(transactions)) {
        if (!plain(t.notes)) continue;
        await tx.update(transactions).set({ notes: await cipher.encrypt('transactions', 'notes', t.notes) }).where(eq(transactions.id, t.id));
        n++;
      }
      for (const r of await tx.select().from(recurrences)) {
        if (!plain(r.template.notes)) continue;
        const notes = await cipher.encrypt('transactions', 'notes', r.template.notes);
        await tx.update(recurrences).set({ template: { ...r.template, notes } }).where(eq(recurrences.id, r.id));
        n++;
      }
      for (const g of await tx.select({ id: goals.id, notes: goals.notes }).from(goals)) {
        if (!plain(g.notes)) continue;
        await tx.update(goals).set({ notes: await cipher.encrypt('goals', 'notes', g.notes) }).where(eq(goals.id, g.id));
        n++;
      }
      for (const c of await tx.select({ id: goalContributions.id, note: goalContributions.note }).from(goalContributions)) {
        if (!plain(c.note)) continue;
        await tx
          .update(goalContributions)
          .set({ note: await cipher.encrypt('goal_contributions', 'note', c.note) })
          .where(eq(goalContributions.id, c.id));
        n++;
      }
      // Task module (migration 0013): descriptions and comments.
      for (const t of await tx
        .select({ id: tasks.id, description: tasks.description })
        .from(tasks)
        .where(eq(tasks.workspaceId, id))) {
        if (!plain(t.description)) continue;
        await tx
          .update(tasks)
          .set({ description: await encryptTaskText(cipher, TASK_DESCRIPTION, t.description) })
          .where(and(eq(tasks.workspaceId, id), eq(tasks.id, t.id)));
        n++;
      }
      for (const c of await tx
        .select({ id: taskComments.id, text: taskComments.text })
        .from(taskComments)
        .where(eq(taskComments.workspaceId, id))) {
        if (!plain(c.text)) continue;
        await tx
          .update(taskComments)
          .set({ text: await encryptTaskText(cipher, TASK_COMMENT_TEXT, c.text) })
          .where(and(eq(taskComments.workspaceId, id), eq(taskComments.id, c.id)));
        n++;
      }
      return n;
    });
    // Only after the tenant transaction committed (a failure above leaves the workspace pending).
    await db.update(workspaces).set({ encryptionBackfilledAt: new Date() }).where(eq(workspaces.id, id));
  }
  return { workspaces: pending.length, rows };
}

/** True when some workspace still lacks a data key or was never checked by the backfill. */
export async function needsBackfill(db: DbExecutor): Promise<boolean> {
  const [row] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(workspaces).where(pendingWorkspaces);
  return (row?.n ?? 0) > 0;
}
