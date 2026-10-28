// Helpers shared by the task services: references shown with every row, ownership checks (always by
// id + workspace; anything outside it is "not found") and the department rules.

import { and, eq, inArray, sql } from 'drizzle-orm';
import type { TaskClientRef, TaskMemberRef, TaskPersonRef } from '@effinance/shared';
import type { DbExecutor } from '../../db/client';
import {
  contacts,
  taskCategories,
  taskDepartmentMembers,
  taskDepartments,
  type TaskCategoryRow,
  type TaskDepartmentRow,
} from '../../db/schema';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { inChunks } from '../../lib/sql';
import type { TaskContext } from './access';

/** A member as an assignee/responsible (null when the id is not a current member). */
export function memberRef(
  ctx: Pick<TaskContext, 'members'>,
  id: string | null | undefined,
): TaskMemberRef | null {
  if (!id) return null;
  const m = ctx.members.get(id);
  return m ? { id: m.id, name: m.name } : null;
}

/** Author of something: the current name while a member, else the name recorded at the time. */
export function personRef(
  ctx: Pick<TaskContext, 'members'>,
  id: string | null | undefined,
  recordedName: string | null | undefined,
): TaskPersonRef | null {
  const m = id ? ctx.members.get(id) : undefined;
  if (m) return { id: m.id, name: m.name };
  if (recordedName) return { id: id ?? null, name: recordedName };
  return null;
}

/** Name of the person making the request, recorded with what they create or conclude. */
export function myName(ctx: Pick<TaskContext, 'members' | 'userId'>): string {
  return ctx.members.get(ctx.userId)?.name ?? 'Membro';
}

export function clientDisplayName(row: { name: string; tradeName: string | null }): string {
  return row.tradeName?.trim() ? row.tradeName : row.name;
}

export function clientRef(
  row: { id: string | null; name: string | null; tradeName: string | null } | null | undefined,
): TaskClientRef | null {
  if (!row?.id || row.name === null) return null;
  return { id: row.id, name: clientDisplayName({ name: row.name, tradeName: row.tradeName }) };
}

export function assertMember(
  ctx: Pick<TaskContext, 'members'>,
  userId: string | null | undefined,
  label = 'O responsável',
): void {
  if (userId && !ctx.members.has(userId))
    throw new ValidationError(`${label} precisa ser membro deste espaço`);
}

export async function getTaskClientOrThrow(db: DbExecutor, workspaceId: string, id: string) {
  const [row] = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      tradeName: contacts.tradeName,
      taxRegime: contacts.taxRegime,
    })
    .from(contacts)
    .where(
      and(eq(contacts.id, id), eq(contacts.workspaceId, workspaceId), eq(contacts.kind, 'client')),
    );
  if (!row) throw new NotFoundError('Cliente não encontrado');
  return row;
}

/** Every id must be a client of the workspace (404 otherwise, without saying which). */
export async function assertClients(
  db: DbExecutor,
  workspaceId: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  let found = 0;
  for (const chunk of inChunks([...new Set(ids)])) {
    const [row] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, workspaceId),
          eq(contacts.kind, 'client'),
          inArray(contacts.id, chunk),
        ),
      );
    found += row?.n ?? 0;
  }
  if (found !== new Set(ids).size) throw new NotFoundError('Cliente não encontrado');
}

export async function getDepartmentOrThrow(
  db: DbExecutor,
  workspaceId: string,
  id: string,
): Promise<TaskDepartmentRow> {
  const [row] = await db
    .select()
    .from(taskDepartments)
    .where(and(eq(taskDepartments.id, id), eq(taskDepartments.workspaceId, workspaceId)));
  if (!row) throw new NotFoundError('Departamento não encontrado');
  return row;
}

export async function getTaskCategoryOrThrow(
  db: DbExecutor,
  workspaceId: string,
  id: string,
): Promise<TaskCategoryRow> {
  const [row] = await db
    .select()
    .from(taskCategories)
    .where(and(eq(taskCategories.id, id), eq(taskCategories.workspaceId, workspaceId)));
  if (!row) throw new NotFoundError('Categoria não encontrada');
  return row;
}

/** Department of a member (null without one). */
export async function departmentOfMember(
  db: DbExecutor,
  workspaceId: string,
  userId: string | null,
): Promise<string | null> {
  if (!userId) return null;
  const [row] = await db
    .select({ departmentId: taskDepartmentMembers.departmentId })
    .from(taskDepartmentMembers)
    .where(
      and(
        eq(taskDepartmentMembers.workspaceId, workspaceId),
        eq(taskDepartmentMembers.userId, userId),
      ),
    );
  return row?.departmentId ?? null;
}

/**
 * Department of a task (Effy's rule, kept): the assignee's department; a task without assignee (or
 * whose assignee has no department) stays in the queue it was given, if any.
 */
export async function resolveTaskDepartment(
  ctx: Pick<TaskContext, 'db' | 'workspaceId'>,
  assigneeId: string | null,
  queueDepartmentId: string | null,
): Promise<string | null> {
  const fromAssignee = await departmentOfMember(ctx.db, ctx.workspaceId, assigneeId);
  if (fromAssignee) return fromAssignee;
  if (queueDepartmentId) await getDepartmentOrThrow(ctx.db, ctx.workspaceId, queueDepartmentId);
  return queueDepartmentId;
}

/** Department names by id (small table: read whole). */
export async function departmentNames(
  db: DbExecutor,
  workspaceId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: taskDepartments.id, name: taskDepartments.name })
    .from(taskDepartments)
    .where(eq(taskDepartments.workspaceId, workspaceId));
  return new Map(rows.map((r) => [r.id, r.name]));
}
