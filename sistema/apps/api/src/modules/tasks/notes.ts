// Personal notes ("Minhas anotações", Effy's UserNote). Private: every statement filters by the member
// of the session (never an id from the request), so another person's note is "not found", even for an
// administrator, and the workspace export carries only the requester's own notes. Title and text are
// encrypted with the workspace key. A member who leaves the workspace takes their notes along (cascade).

import { and, desc, eq, sql } from 'drizzle-orm';
import type { TaskNote, taskNoteInputSchema } from '@effinance/shared';
import type { z } from 'zod';
import { taskNotes, type TaskNoteRow } from '../../db/schema';
import { NotFoundError, ValidationError } from '../../lib/errors';
import type { TaskContext } from './access';
import { decryptTaskText, encryptTaskText, NOTE_CONTENT, NOTE_TITLE } from './encrypted-text';

type NoteInput = z.output<typeof taskNoteInputSchema>;

/** Notes per member (the list returns all of them). */
export const MAX_NOTES_PER_MEMBER = 500;

const mine = (ctx: TaskContext) => and(eq(taskNotes.workspaceId, ctx.workspaceId), eq(taskNotes.userId, ctx.userId))!;

async function toNote(ctx: TaskContext, row: TaskNoteRow): Promise<TaskNote> {
  return {
    id: row.id,
    title: await decryptTaskText(ctx.cipher, NOTE_TITLE, row.title),
    content: await decryptTaskText(ctx.cipher, NOTE_CONTENT, row.content),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The requester's notes, most recently edited first. */
export async function listNotes(ctx: TaskContext): Promise<TaskNote[]> {
  const rows = await ctx.db.select().from(taskNotes).where(mine(ctx)).orderBy(desc(taskNotes.updatedAt), desc(taskNotes.id));
  return Promise.all(rows.map((r) => toNote(ctx, r)));
}

async function getNoteOrThrow(ctx: TaskContext, id: string): Promise<TaskNoteRow> {
  const [row] = await ctx.db.select().from(taskNotes).where(and(mine(ctx), eq(taskNotes.id, id)));
  if (!row) throw new NotFoundError('Anotação não encontrada');
  return row;
}

async function encrypted(ctx: TaskContext, input: NoteInput) {
  return {
    title: await encryptTaskText(ctx.cipher, NOTE_TITLE, input.title),
    content: await encryptTaskText(ctx.cipher, NOTE_CONTENT, input.content),
  };
}

export async function createNote(ctx: TaskContext, input: NoteInput): Promise<TaskNote> {
  const [existing] = await ctx.db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(taskNotes).where(mine(ctx));
  if ((existing?.n ?? 0) >= MAX_NOTES_PER_MEMBER)
    throw new ValidationError(`Você chegou ao limite de ${MAX_NOTES_PER_MEMBER} anotações. Exclua alguma antes de criar outra.`);
  const [row] = await ctx.db
    .insert(taskNotes)
    .values({ workspaceId: ctx.workspaceId, userId: ctx.userId, ...(await encrypted(ctx, input)) })
    .returning();
  return toNote(ctx, row!);
}

export async function updateNote(ctx: TaskContext, id: string, input: NoteInput): Promise<TaskNote> {
  await getNoteOrThrow(ctx, id);
  const [row] = await ctx.db
    .update(taskNotes)
    .set(await encrypted(ctx, input))
    .where(and(mine(ctx), eq(taskNotes.id, id)))
    .returning();
  return toNote(ctx, row!);
}

export async function deleteNote(ctx: TaskContext, id: string): Promise<void> {
  await getNoteOrThrow(ctx, id);
  await ctx.db.delete(taskNotes).where(and(mine(ctx), eq(taskNotes.id, id)));
}
