// Attachments of a task (Effy's Attachment), stored in the database: no file storage to operate or to
// back up separately, and the browser demo (PGlite) works the same. The content is encrypted with the
// workspace key (AES-256-GCM, AAD bound to the workspace, the table and the attachment id) and the
// name like any free text. Limits: 10 MB per file, 50 MB and 50 files per task. Any member attaches;
// removing is for who attached it or an administrator. Downloads are always served as attachments
// (routes.ts: Content-Disposition, nosniff, a sandboxing CSP): nothing is ever rendered inline.

import { and, asc, eq, sql } from 'drizzle-orm';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_TASK,
  MAX_TASK_ATTACHMENT_BYTES,
  type TaskAttachment,
  type taskAttachmentInputSchema,
  type TaskAttachmentType,
} from '@effinance/shared';
import type { z } from 'zod';
import { taskAttachments, tasks } from '../../db/schema';
import { now } from '../../lib/clock';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors';
import type { TaskContext } from './access';
import { ATTACHMENT_NAME, decryptTaskText, encryptTaskText } from './encrypted-text';
import { recordEvent } from './events';
import { attachmentProblem, decodeBase64 } from './file-check';
import { myName, personRef } from './shared';

type AttachmentInput = z.output<typeof taskAttachmentInputSchema>;

const CONTENT = { table: 'task_attachments', column: 'content' } as const;

/** Metadata columns (never the content, except in the download). */
const META = {
  id: taskAttachments.id,
  taskId: taskAttachments.taskId,
  fileName: taskAttachments.fileName,
  contentType: taskAttachments.contentType,
  sizeBytes: taskAttachments.sizeBytes,
  uploadedBy: taskAttachments.uploadedBy,
  uploadedByName: taskAttachments.uploadedByName,
  createdAt: taskAttachments.createdAt,
};

type MetaRow = {
  id: string;
  fileName: string;
  contentType: TaskAttachmentType;
  sizeBytes: number;
  uploadedBy: string | null;
  uploadedByName: string;
  createdAt: Date;
};

async function assertTask(ctx: TaskContext, taskId: string): Promise<void> {
  const [row] = await ctx.db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, ctx.workspaceId), eq(tasks.id, taskId)));
  if (!row) throw new NotFoundError('Tarefa não encontrada');
}

const canDelete = (ctx: Pick<TaskContext, 'isAdmin' | 'userId'>, row: Pick<MetaRow, 'uploadedBy'>) =>
  ctx.isAdmin || row.uploadedBy === ctx.userId;

async function toAttachment(ctx: TaskContext, row: MetaRow): Promise<TaskAttachment> {
  return {
    id: row.id,
    fileName: await decryptTaskText(ctx.cipher, ATTACHMENT_NAME, row.fileName),
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    uploadedBy: personRef(ctx, row.uploadedBy, row.uploadedByName),
    canDelete: canDelete(ctx, row),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Attachments of a task, oldest first (metadata only). */
export async function listAttachments(ctx: TaskContext, taskId: string): Promise<TaskAttachment[]> {
  await assertTask(ctx, taskId);
  const rows = await ctx.db
    .select(META)
    .from(taskAttachments)
    .where(and(eq(taskAttachments.workspaceId, ctx.workspaceId), eq(taskAttachments.taskId, taskId)))
    .orderBy(asc(taskAttachments.createdAt), asc(taskAttachments.id));
  return Promise.all(rows.map((r) => toAttachment(ctx, r)));
}

/** Any member. The file comes in base64 (JSON body); size, type, signature and limits are checked. */
export async function addAttachment(ctx: TaskContext, taskId: string, input: AttachmentInput): Promise<TaskAttachment> {
  await assertTask(ctx, taskId);
  const bytes = decodeBase64(input.content);
  if (bytes.length === 0) throw new ValidationError('O arquivo está vazio.');
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new ValidationError('O arquivo passa de 10 MB.');
  const problem = attachmentProblem(input.fileName, input.contentType, bytes);
  if (problem) throw new ValidationError(problem);
  const [used] = await ctx.db
    .select({ n: sql<number>`count(*)`.mapWith(Number), bytes: sql<number>`coalesce(sum(${taskAttachments.sizeBytes}), 0)`.mapWith(Number) })
    .from(taskAttachments)
    .where(and(eq(taskAttachments.workspaceId, ctx.workspaceId), eq(taskAttachments.taskId, taskId)));
  if ((used?.n ?? 0) >= MAX_ATTACHMENTS_PER_TASK)
    throw new ValidationError(`Uma tarefa pode ter até ${MAX_ATTACHMENTS_PER_TASK} anexos. Remova algum antes de anexar outro.`);
  if ((used?.bytes ?? 0) + bytes.length > MAX_TASK_ATTACHMENT_BYTES)
    throw new ValidationError('Esta tarefa chegou ao limite de 50 MB de anexos. Remova algum antes de anexar outro.');

  const id = globalThis.crypto.randomUUID();
  const [row] = await ctx.db
    .insert(taskAttachments)
    .values({
      id,
      workspaceId: ctx.workspaceId,
      taskId,
      fileName: await encryptTaskText(ctx.cipher, ATTACHMENT_NAME, input.fileName),
      contentType: input.contentType,
      sizeBytes: bytes.length,
      content: await ctx.cipher.encryptBytes(CONTENT.table, CONTENT.column, id, bytes),
      uploadedBy: ctx.userId,
      uploadedByName: myName(ctx),
    })
    .returning(META);
  await ctx.db
    .update(tasks)
    .set({ updatedAt: now() })
    .where(and(eq(tasks.workspaceId, ctx.workspaceId), eq(tasks.id, taskId)));
  await recordEvent(ctx, { taskId, kind: 'attachment_added', data: { attachmentId: id }, note: input.fileName });
  return toAttachment(ctx, row!);
}

async function getAttachmentRow(ctx: TaskContext, taskId: string, attachmentId: string) {
  const [row] = await ctx.db
    .select(META)
    .from(taskAttachments)
    .where(
      and(
        eq(taskAttachments.workspaceId, ctx.workspaceId),
        eq(taskAttachments.taskId, taskId),
        eq(taskAttachments.id, attachmentId),
      ),
    );
  if (!row) throw new NotFoundError('Anexo não encontrado');
  return row;
}

/** The decrypted file (the route serves it as a download). */
export async function downloadAttachment(
  ctx: TaskContext,
  taskId: string,
  attachmentId: string,
): Promise<{ fileName: string; contentType: TaskAttachmentType; content: Uint8Array }> {
  await getAttachmentRow(ctx, taskId, attachmentId);
  const [row] = await ctx.db
    .select({ fileName: taskAttachments.fileName, contentType: taskAttachments.contentType, content: taskAttachments.content })
    .from(taskAttachments)
    .where(
      and(
        eq(taskAttachments.workspaceId, ctx.workspaceId),
        eq(taskAttachments.taskId, taskId),
        eq(taskAttachments.id, attachmentId),
      ),
    );
  return {
    fileName: await decryptTaskText(ctx.cipher, ATTACHMENT_NAME, row!.fileName),
    contentType: row!.contentType,
    content: await ctx.cipher.decryptBytes(CONTENT.table, CONTENT.column, attachmentId, row!.content),
  };
}

/** Who attached it, or an administrator. */
export async function deleteAttachment(ctx: TaskContext, taskId: string, attachmentId: string): Promise<void> {
  const row = await getAttachmentRow(ctx, taskId, attachmentId);
  if (!canDelete(ctx, row)) throw new ForbiddenError('Só quem anexou ou um administrador pode remover este anexo.');
  await ctx.db
    .delete(taskAttachments)
    .where(
      and(
        eq(taskAttachments.workspaceId, ctx.workspaceId),
        eq(taskAttachments.taskId, taskId),
        eq(taskAttachments.id, attachmentId),
      ),
    );
  await recordEvent(ctx, {
    taskId,
    kind: 'attachment_removed',
    data: { attachmentId },
    note: await decryptTaskText(ctx.cipher, ATTACHMENT_NAME, row.fileName),
  });
}
