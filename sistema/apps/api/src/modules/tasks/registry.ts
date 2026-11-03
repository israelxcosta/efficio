// Registries of the task module (administrators write, every member reads): departments and the
// department of each member, task categories, the responsible member of each client per department,
// and the options every picker needs in one request.

import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { monthKey } from '@effinance/shared';
import type {
  ClientResponsible,
  ClientResponsibleChangeResponse,
  ClientResponsiblesResponse,
  clientResponsibleBatchSchema,
  clientResponsibleInputSchema,
  TaskCategory,
  taskCategoryInputSchema,
  TaskClientOption,
  TaskDepartment,
  taskDepartmentInputSchema,
  TaskMember,
  TaskOptionsResponse,
  TaskRef,
} from '@effinance/shared';
import type { z } from 'zod';
import {
  contacts,
  recurringTasks,
  taskCategories,
  taskClientResponsibles,
  taskDepartmentMembers,
  taskDepartments,
  tasks,
} from '../../db/schema';
import { ConflictError, NotFoundError } from '../../lib/errors';
import type { TaskContext } from './access';
import { reassignClientOccurrences } from './generation';
import {
  assertClients,
  assertMember,
  clientDisplayName,
  getDepartmentOrThrow,
  getTaskCategoryOrThrow,
  memberRef,
} from './shared';
import { NOT_OCCURRENCE_SQL, OPEN_SQL } from './task-rows';

type DepartmentInput = z.output<typeof taskDepartmentInputSchema>;
type CategoryInput = z.output<typeof taskCategoryInputSchema>;
type ResponsibleInput = z.output<typeof clientResponsibleInputSchema>;
type ResponsibleBatch = z.output<typeof clientResponsibleBatchSchema>;

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'pt-BR');

// ---------------------------------------------------------------------------
// Members and departments
// ---------------------------------------------------------------------------

async function membership(
  ctx: Pick<TaskContext, 'db' | 'workspaceId'>,
): Promise<Map<string, string>> {
  const rows = await ctx.db
    .select({
      userId: taskDepartmentMembers.userId,
      departmentId: taskDepartmentMembers.departmentId,
    })
    .from(taskDepartmentMembers)
    .where(eq(taskDepartmentMembers.workspaceId, ctx.workspaceId));
  return new Map(rows.map((r) => [r.userId, r.departmentId]));
}

async function departmentRefs(ctx: Pick<TaskContext, 'db' | 'workspaceId'>): Promise<TaskRef[]> {
  return ctx.db
    .select({ id: taskDepartments.id, name: taskDepartments.name })
    .from(taskDepartments)
    .where(eq(taskDepartments.workspaceId, ctx.workspaceId))
    .orderBy(sql`lower(${taskDepartments.name})`);
}

export async function listMembers(ctx: TaskContext): Promise<TaskMember[]> {
  const [departments, links] = await Promise.all([departmentRefs(ctx), membership(ctx)]);
  return [...ctx.members.values()]
    .map((m) => {
      const departmentId = links.get(m.id);
      return {
        id: m.id,
        name: m.name,
        role: m.role,
        isAdmin: m.role === 'owner' || m.role === 'editor',
        department: departments.find((d) => d.id === departmentId) ?? null,
        isYou: m.id === ctx.userId,
      };
    })
    .sort(byName);
}

/**
 * Moves a member to a department (or out of any). Their open tasks follow them (a deliberate change
 * from Effy, where the department was frozen at save time): "Meu departamento" lists what each one is
 * doing now. Concluded tasks keep the department they were done in, and recurring occurrences always
 * stay in their recurring task's department.
 */
export async function setMemberDepartment(
  ctx: TaskContext,
  userId: string,
  departmentId: string | null,
): Promise<TaskMember> {
  if (!ctx.members.has(userId)) throw new NotFoundError('Membro não encontrado');
  if (departmentId) await getDepartmentOrThrow(ctx.db, ctx.workspaceId, departmentId);
  await moveMembers(ctx, [userId], departmentId);
  return (await listMembers(ctx)).find((m) => m.id === userId)!;
}

async function moveMembers(ctx: TaskContext, userIds: string[], departmentId: string | null) {
  if (userIds.length === 0) return;
  await ctx.db
    .delete(taskDepartmentMembers)
    .where(
      and(
        eq(taskDepartmentMembers.workspaceId, ctx.workspaceId),
        inArray(taskDepartmentMembers.userId, userIds),
      ),
    );
  if (!departmentId) return;
  await ctx.db
    .insert(taskDepartmentMembers)
    .values(userIds.map((userId) => ({ workspaceId: ctx.workspaceId, userId, departmentId })));
  await ctx.db
    .update(tasks)
    .set({ departmentId })
    .where(
      and(
        eq(tasks.workspaceId, ctx.workspaceId),
        inArray(tasks.assigneeId, userIds),
        OPEN_SQL,
        NOT_OCCURRENCE_SQL,
      ),
    );
}

/** Recurring tasks per department: active ones (`active`) and all of them (`all`, they block deleting it). */
async function recurringByDepartment(ctx: Pick<TaskContext, 'db' | 'workspaceId' | 'today'>) {
  const current = monthKey(ctx.today);
  const rows = await ctx.db
    .select({
      id: recurringTasks.departmentId,
      all: sql<number>`count(*)`.mapWith(Number),
      active: sql<number>`count(*) filter (where ${recurringTasks.endCompetence} is null or ${recurringTasks.endCompetence} >= ${current})`.mapWith(
        Number,
      ),
    })
    .from(recurringTasks)
    .where(and(eq(recurringTasks.workspaceId, ctx.workspaceId), isNotNull(recurringTasks.departmentId)))
    .groupBy(recurringTasks.departmentId);
  return new Map(rows.map((r) => [r.id!, r]));
}

export async function listDepartments(ctx: TaskContext): Promise<TaskDepartment[]> {
  const [rows, links, counts, recurring] = await Promise.all([
    ctx.db
      .select()
      .from(taskDepartments)
      .where(eq(taskDepartments.workspaceId, ctx.workspaceId))
      .orderBy(sql`lower(${taskDepartments.name})`),
    membership(ctx),
    ctx.db
      .select({
        id: tasks.departmentId,
        total: sql<number>`count(*)`.mapWith(Number),
        open: sql<number>`count(*) filter (where ${OPEN_SQL})`.mapWith(Number),
        overdue:
          sql<number>`count(*) filter (where ${OPEN_SQL} and ${tasks.dueDate} < ${ctx.today})`.mapWith(
            Number,
          ),
      })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, ctx.workspaceId), isNotNull(tasks.departmentId)))
      .groupBy(tasks.departmentId),
    recurringByDepartment(ctx),
  ]);
  return rows.map((d) => {
    const c = counts.find((x) => x.id === d.id);
    return {
      id: d.id,
      name: d.name,
      members: [...links.entries()]
        .filter(([, departmentId]) => departmentId === d.id)
        .map(([userId]) => memberRef(ctx, userId))
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .sort(byName),
      openCount: c?.open ?? 0,
      overdueCount: c?.overdue ?? 0,
      recurringCount: recurring.get(d.id)?.active ?? 0,
      taskCount: c?.total ?? 0,
      createdAt: d.createdAt.toISOString(),
    };
  });
}

async function getDepartment(ctx: TaskContext, id: string): Promise<TaskDepartment> {
  const department = (await listDepartments(ctx)).find((d) => d.id === id);
  if (!department) throw new NotFoundError('Departamento não encontrado');
  return department;
}

/** `memberIds` (when sent) is the whole list: marked members move here, unmarked ones leave it. */
async function applyMembers(
  ctx: TaskContext,
  departmentId: string,
  memberIds: string[] | undefined,
) {
  if (memberIds === undefined) return;
  for (const id of memberIds) assertMember(ctx, id, 'O membro');
  const current = [...(await membership(ctx)).entries()]
    .filter(([, d]) => d === departmentId)
    .map(([u]) => u);
  const leaving = current.filter((u) => !memberIds.includes(u));
  if (leaving.length) {
    await ctx.db
      .delete(taskDepartmentMembers)
      .where(
        and(
          eq(taskDepartmentMembers.workspaceId, ctx.workspaceId),
          inArray(taskDepartmentMembers.userId, leaving),
        ),
      );
  }
  await moveMembers(ctx, [...new Set(memberIds)], departmentId);
}

export async function createDepartment(
  ctx: TaskContext,
  input: DepartmentInput,
): Promise<TaskDepartment> {
  const [row] = await ctx.db
    .insert(taskDepartments)
    .values({ workspaceId: ctx.workspaceId, name: input.name })
    .returning({ id: taskDepartments.id });
  await applyMembers(ctx, row!.id, input.memberIds);
  return getDepartment(ctx, row!.id);
}

export async function updateDepartment(
  ctx: TaskContext,
  id: string,
  input: DepartmentInput,
): Promise<TaskDepartment> {
  await getDepartmentOrThrow(ctx.db, ctx.workspaceId, id);
  await ctx.db
    .update(taskDepartments)
    .set({ name: input.name })
    .where(and(eq(taskDepartments.workspaceId, ctx.workspaceId), eq(taskDepartments.id, id)));
  await applyMembers(ctx, id, input.memberIds);
  return getDepartment(ctx, id);
}

/** Effy's rule: refused while members, recurring tasks or tasks are still in the department. */
export async function deleteDepartment(ctx: TaskContext, id: string): Promise<void> {
  await getDepartmentOrThrow(ctx.db, ctx.workspaceId, id);
  const n = sql<number>`count(*)`.mapWith(Number);
  const [[members], [linked], recurring] = await Promise.all([
    ctx.db
      .select({ n })
      .from(taskDepartmentMembers)
      .where(
        and(
          eq(taskDepartmentMembers.workspaceId, ctx.workspaceId),
          eq(taskDepartmentMembers.departmentId, id),
        ),
      ),
    ctx.db
      .select({ n })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, ctx.workspaceId), eq(tasks.departmentId, id))),
    recurringByDepartment(ctx),
  ]);
  const details = { members: members?.n ?? 0, recurring: recurring.get(id)?.all ?? 0, tasks: linked?.n ?? 0 };
  if (details.members || details.recurring || details.tasks) {
    const parts = [
      details.members ? `${details.members} ${details.members === 1 ? 'membro' : 'membros'}` : null,
      details.recurring
        ? `${details.recurring} ${details.recurring === 1 ? 'tarefa recorrente' : 'tarefas recorrentes'}`
        : null,
      details.tasks ? `${details.tasks} ${details.tasks === 1 ? 'tarefa' : 'tarefas'}` : null,
    ].filter(Boolean);
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}` : parts[0];
    const single = details.members + details.recurring + details.tasks === 1;
    throw new ConflictError(
      `${list} ainda ${single ? 'está' : 'estão'} neste departamento. Mova-os antes de excluir.`,
      details,
    );
  }
  // Client responsibilities in the department are configuration: they go with it (cascade).
  await ctx.db
    .delete(taskDepartments)
    .where(and(eq(taskDepartments.workspaceId, ctx.workspaceId), eq(taskDepartments.id, id)));
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listCategories(ctx: TaskContext): Promise<TaskCategory[]> {
  const rows = await ctx.db
    .select({
      category: taskCategories,
      // Outer columns spelled out: Drizzle leaves them unqualified in a single-table select, and an
      // unqualified `id` inside the subquery would be the subquery's own.
      taskCount:
        sql<number>`(select count(*) from tasks t where t.workspace_id = task_categories.workspace_id and t.category_id = task_categories.id)`.mapWith(
          Number,
        ),
    })
    .from(taskCategories)
    .where(eq(taskCategories.workspaceId, ctx.workspaceId))
    .orderBy(sql`lower(${taskCategories.name})`);
  return rows.map(({ category, taskCount }) => ({
    id: category.id,
    name: category.name,
    icon: category.icon,
    color: category.color,
    taskCount,
    createdAt: category.createdAt.toISOString(),
  }));
}

async function getCategory(ctx: TaskContext, id: string): Promise<TaskCategory> {
  const category = (await listCategories(ctx)).find((c) => c.id === id);
  if (!category) throw new NotFoundError('Categoria não encontrada');
  return category;
}

export async function createCategory(
  ctx: TaskContext,
  input: CategoryInput,
): Promise<TaskCategory> {
  const [row] = await ctx.db
    .insert(taskCategories)
    .values({ workspaceId: ctx.workspaceId, ...input })
    .returning({ id: taskCategories.id });
  return getCategory(ctx, row!.id);
}

export async function updateCategory(
  ctx: TaskContext,
  id: string,
  input: CategoryInput,
): Promise<TaskCategory> {
  await getTaskCategoryOrThrow(ctx.db, ctx.workspaceId, id);
  await ctx.db
    .update(taskCategories)
    .set(input)
    .where(and(eq(taskCategories.workspaceId, ctx.workspaceId), eq(taskCategories.id, id)));
  return getCategory(ctx, id);
}

/** Simple delete (Effy): tasks and template steps lose the category (ON DELETE SET NULL). */
export async function deleteCategory(ctx: TaskContext, id: string): Promise<void> {
  await getTaskCategoryOrThrow(ctx.db, ctx.workspaceId, id);
  await ctx.db
    .delete(taskCategories)
    .where(and(eq(taskCategories.workspaceId, ctx.workspaceId), eq(taskCategories.id, id)));
}

// ---------------------------------------------------------------------------
// Clients (read only here) and their responsible per department
// ---------------------------------------------------------------------------

export async function clientOptions(
  ctx: Pick<TaskContext, 'db' | 'workspaceId'>,
): Promise<TaskClientOption[]> {
  const rows = await ctx.db
    .select({
      id: contacts.id,
      name: contacts.name,
      tradeName: contacts.tradeName,
      taxRegime: contacts.taxRegime,
      status: contacts.status,
      contractStartDate: contacts.contractStartDate,
      inactivatedAt: contacts.inactivatedAt,
    })
    .from(contacts)
    .where(and(eq(contacts.workspaceId, ctx.workspaceId), eq(contacts.kind, 'client')))
    .orderBy(sql`lower(coalesce(${contacts.tradeName}, ${contacts.name}))`, asc(contacts.id));
  return rows.map((r) => ({
    id: r.id,
    name: clientDisplayName(r),
    legalName: r.name,
    taxRegime: r.taxRegime ?? 'other',
    status: r.status,
    contractStartDate: r.contractStartDate!,
    inactivatedAt: r.inactivatedAt,
  }));
}

async function responsibles(ctx: TaskContext): Promise<ClientResponsible[]> {
  const rows = await ctx.db
    .select()
    .from(taskClientResponsibles)
    .where(eq(taskClientResponsibles.workspaceId, ctx.workspaceId));
  return rows.flatMap((r) => {
    const user = memberRef(ctx, r.userId);
    return user ? [{ clientId: r.clientId, departmentId: r.departmentId, user }] : [];
  });
}

export async function listClientResponsibles(
  ctx: TaskContext,
): Promise<ClientResponsiblesResponse> {
  const [departments, clients, items] = await Promise.all([
    departmentRefs(ctx),
    clientOptions(ctx),
    responsibles(ctx),
  ]);
  return { departments, clients, items };
}

async function writeResponsibles(ctx: TaskContext, items: ResponsibleInput[]): Promise<ClientResponsibleChangeResponse> {
  // The last entry wins when a pair repeats.
  const pairs = new Map<string, ResponsibleInput>();
  for (const item of items) pairs.set(`${item.clientId}:${item.departmentId}`, item);
  const list = [...pairs.values()];
  await assertClients(ctx.db, ctx.workspaceId, list.map((i) => i.clientId));
  for (const departmentId of new Set(list.map((i) => i.departmentId))) await getDepartmentOrThrow(ctx.db, ctx.workspaceId, departmentId);
  for (const item of list) assertMember(ctx, item.userId);

  let removed = 0;
  const out: ClientResponsible[] = [];
  for (const item of list) {
    const key = and(
      eq(taskClientResponsibles.workspaceId, ctx.workspaceId),
      eq(taskClientResponsibles.clientId, item.clientId),
      eq(taskClientResponsibles.departmentId, item.departmentId),
    );
    if (item.userId === null) {
      const gone = await ctx.db.delete(taskClientResponsibles).where(key).returning({ clientId: taskClientResponsibles.clientId });
      removed += gone.length;
      continue;
    }
    await ctx.db
      .insert(taskClientResponsibles)
      .values({ workspaceId: ctx.workspaceId, clientId: item.clientId, departmentId: item.departmentId, userId: item.userId })
      .onConflictDoUpdate({
        target: [taskClientResponsibles.workspaceId, taskClientResponsibles.clientId, taskClientResponsibles.departmentId],
        set: { userId: item.userId, updatedAt: sql`now()` },
      });
    out.push({ clientId: item.clientId, departmentId: item.departmentId, user: memberRef(ctx, item.userId)! });
  }
  // Open occurrences from the current competence on follow the new responsible (not those assigned by hand).
  const reassigned = await reassignClientOccurrences(ctx, list);
  return { items: out, removed, reassigned };
}

/**
 * Sets (or, with `userId: null`, removes) the responsible of a client in a department. Administrators.
 * The open occurrences of the client in the department's recurring tasks, from the current competence
 * on, go to the new responsible (or back to the default one), except those assigned by hand.
 */
export async function setClientResponsible(ctx: TaskContext, input: ResponsibleInput): Promise<ClientResponsibleChangeResponse> {
  return writeResponsibles(ctx, [input]);
}

/** Several at once (the batch dialog and its undo). Administrators. */
export async function setClientResponsibles(ctx: TaskContext, input: ResponsibleBatch): Promise<ClientResponsibleChangeResponse> {
  return writeResponsibles(ctx, input.items);
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export async function taskOptions(ctx: TaskContext): Promise<TaskOptionsResponse> {
  const [members, departments, categories, clients, items] = await Promise.all([
    listMembers(ctx),
    departmentRefs(ctx),
    listCategories(ctx),
    clientOptions(ctx),
    responsibles(ctx),
  ]);
  const me = members.find((m) => m.isYou);
  return {
    today: ctx.today,
    me: {
      id: ctx.userId,
      name: me?.name ?? '',
      role: ctx.role,
      department: me?.department ?? null,
      isAdmin: ctx.isAdmin,
      canWrite: ctx.canWrite,
    },
    members,
    departments,
    categories,
    clients,
    clientResponsibles: items,
  };
}
