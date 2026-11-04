// Processes ("processos", Effy's task flows) and their templates. Any member applies a template to a
// client or builds a process by hand; templates (and saving a process as a template) and deletions are
// for administrators. A template is copied when applied: editing or deleting it never changes the
// processes already applied. The activation engine lives in flow-engine.ts.

import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type {
  applyFlowTemplateSchema,
  FlowTemplate,
  flowTemplateInputSchema,
  Task,
  TaskFlow,
  TaskFlowCreatedResponse,
  taskFlowInputSchema,
  taskFlowQuerySchema,
  TaskRef,
} from '@effinance/shared';
import type { z } from 'zod';
import { taskFlowSteps, taskFlowTemplateSteps, taskFlowTemplates, taskFlows, type TaskFlowRow, type TaskFlowTemplateRow } from '../../db/schema';
import { ForbiddenError, NotFoundError } from '../../lib/errors';
import { groupBy } from '../../lib/collections';
import { TASK_ADMIN_MESSAGE, type TaskContext } from './access';
import { decryptTaskText, encryptTaskText, FLOW_STEP_DESCRIPTION, TEMPLATE_DESCRIPTION, TEMPLATE_STEP_DESCRIPTION } from './encrypted-text';
import { activateStep, categoryRefs, hydrateFlows } from './flow-engine';
import {
  assertMember,
  clientDisplayName,
  departmentNames,
  getDepartmentOrThrow,
  getTaskCategoryOrThrow,
  getTaskClientOrThrow,
  memberRef,
  myName,
  personRef,
} from './shared';
import { selectTask } from './task-rows';

type FlowInput = z.output<typeof taskFlowInputSchema>;
type FlowQuery = z.output<typeof taskFlowQuerySchema>;
type TemplateInput = z.output<typeof flowTemplateInputSchema>;
type ApplyInput = z.output<typeof applyFlowTemplateSchema>;

/** Most recent processes a list returns. */
export const MAX_FLOWS_LISTED = 200;

// ---------------------------------------------------------------------------
// Processes
// ---------------------------------------------------------------------------

async function getFlowRowOrThrow(ctx: TaskContext, id: string): Promise<TaskFlowRow> {
  const [row] = await ctx.db
    .select()
    .from(taskFlows)
    .where(and(eq(taskFlows.workspaceId, ctx.workspaceId), eq(taskFlows.id, id)));
  if (!row) throw new NotFoundError('Processo não encontrado');
  return row;
}

export async function getFlow(ctx: TaskContext, id: string): Promise<TaskFlow> {
  const [flow] = await hydrateFlows(ctx, [await getFlowRowOrThrow(ctx, id)]);
  return flow!;
}

/** Processes, most recent first: `active` (some step not done), `done` or `all` (up to 200). */
export async function listFlows(ctx: TaskContext, q: FlowQuery): Promise<TaskFlow[]> {
  const rows = await ctx.db
    .select()
    .from(taskFlows)
    .where(and(eq(taskFlows.workspaceId, ctx.workspaceId), q.clientId ? eq(taskFlows.clientId, q.clientId) : undefined))
    .orderBy(desc(taskFlows.createdAt), desc(taskFlows.id))
    .limit(MAX_FLOWS_LISTED);
  const flows = await hydrateFlows(ctx, rows);
  if (q.status === 'all') return flows;
  return flows.filter((f) => (q.status === 'done' ? f.completedAt !== null : f.completedAt === null));
}

async function validateSteps(
  ctx: TaskContext,
  steps: { clientId?: string | null; departmentId: string | null; categoryId: string | null; assigneeId: string | null }[],
) {
  for (const id of new Set(steps.map((s) => s.clientId).filter((v): v is string => Boolean(v))))
    await getTaskClientOrThrow(ctx.db, ctx.workspaceId, id);
  for (const id of new Set(steps.map((s) => s.departmentId).filter((v): v is string => Boolean(v))))
    await getDepartmentOrThrow(ctx.db, ctx.workspaceId, id);
  for (const id of new Set(steps.map((s) => s.categoryId).filter((v): v is string => Boolean(v))))
    await getTaskCategoryOrThrow(ctx.db, ctx.workspaceId, id);
  for (const s of steps) assertMember(ctx, s.assigneeId);
}

async function createdResponse(ctx: TaskContext, flowId: string, taskId: string | null, template: FlowTemplate | null): Promise<TaskFlowCreatedResponse> {
  const flow = await getFlow(ctx, flowId);
  const task = taskId ? await selectTask(ctx, taskId) : null;
  return { flow, task: task as Task, template };
}

/**
 * A process built by hand (any member). Each step may have its own client; with `saveAsTemplate`
 * (administrators) the steps are also saved as a template. Step 1 is activated now, counting from today.
 */
export async function createFlow(ctx: TaskContext, input: FlowInput): Promise<TaskFlowCreatedResponse> {
  if (input.saveAsTemplate && !ctx.permissions.registry) throw new ForbiddenError(TASK_ADMIN_MESSAGE);
  if (input.clientId) await getTaskClientOrThrow(ctx.db, ctx.workspaceId, input.clientId);
  await validateSteps(ctx, input.steps);
  const [flow] = await ctx.db
    .insert(taskFlows)
    .values({ workspaceId: ctx.workspaceId, title: input.title, clientId: input.clientId, createdBy: ctx.userId, createdByName: myName(ctx) })
    .returning({ id: taskFlows.id });
  await ctx.db.insert(taskFlowSteps).values(
    await Promise.all(
      input.steps.map(async (step, index) => ({
        workspaceId: ctx.workspaceId,
        flowId: flow!.id,
        position: index + 1,
        title: step.title,
        description: await encryptTaskText(ctx.cipher, FLOW_STEP_DESCRIPTION, step.description),
        clientId: step.clientId ?? input.clientId,
        departmentId: step.departmentId,
        categoryId: step.categoryId,
        assigneeId: step.assigneeId,
        priority: step.priority,
        dueDate: step.dueDate,
        relativeDays: step.relativeDays,
      })),
    ),
  );
  const taskId = await activateStep(ctx, flow!.id, 1, ctx.today);
  const template = input.saveAsTemplate
    ? await createTemplate(ctx, {
        title: input.title,
        description: null,
        steps: input.steps.map((s) => ({
          title: s.title,
          description: s.description,
          departmentId: s.departmentId,
          categoryId: s.categoryId,
          assigneeId: s.assigneeId,
          priority: s.priority,
          relativeDays: s.relativeDays ?? 0,
        })),
      })
    : null;
  return createdResponse(ctx, flow!.id, taskId, template);
}

/** Removes the process and its steps; tasks already activated stay (Effy). Administrators. */
export async function deleteFlow(ctx: TaskContext, id: string): Promise<void> {
  await getFlowRowOrThrow(ctx, id);
  await ctx.db.delete(taskFlows).where(and(eq(taskFlows.workspaceId, ctx.workspaceId), eq(taskFlows.id, id)));
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

async function getTemplateRowOrThrow(ctx: TaskContext, id: string): Promise<TaskFlowTemplateRow> {
  const [row] = await ctx.db
    .select()
    .from(taskFlowTemplates)
    .where(and(eq(taskFlowTemplates.workspaceId, ctx.workspaceId), eq(taskFlowTemplates.id, id)));
  if (!row) throw new NotFoundError('Modelo de processo não encontrado');
  return row;
}

async function hydrateTemplates(ctx: TaskContext, rows: TaskFlowTemplateRow[]): Promise<FlowTemplate[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [steps, usage, categories, departments] = await Promise.all([
    ctx.db
      .select()
      .from(taskFlowTemplateSteps)
      .where(and(eq(taskFlowTemplateSteps.workspaceId, ctx.workspaceId), inArray(taskFlowTemplateSteps.templateId, ids)))
      .orderBy(asc(taskFlowTemplateSteps.position)),
    ctx.db
      .select({ id: taskFlows.templateId, n: sql<number>`count(*)`.mapWith(Number) })
      .from(taskFlows)
      .where(and(eq(taskFlows.workspaceId, ctx.workspaceId), isNotNull(taskFlows.templateId), inArray(taskFlows.templateId, ids)))
      .groupBy(taskFlows.templateId),
    categoryRefs(ctx),
    departmentNames(ctx.db, ctx.workspaceId),
  ]);
  const [templateDescriptions, stepDescriptions] = await Promise.all([
    Promise.all(rows.map((r) => decryptTaskText(ctx.cipher, TEMPLATE_DESCRIPTION, r.description))),
    Promise.all(steps.map((s) => decryptTaskText(ctx.cipher, TEMPLATE_STEP_DESCRIPTION, s.description))),
  ]);
  const stepDescription = new Map(steps.map((s, i) => [s.id, stepDescriptions[i] ?? null]));
  const deptRef = (id: string | null): TaskRef | null => {
    const name = id ? departments.get(id) : undefined;
    return id && name ? { id, name } : null;
  };
  const stepsByTemplate = groupBy(steps, (s) => s.templateId);
  return rows.map((row, i) => {
    const own = stepsByTemplate.get(row.id) ?? [];
    const depts = new Map<string, TaskRef>();
    for (const s of own) {
      const d = deptRef(s.departmentId);
      if (d) depts.set(d.id, d);
    }
    return {
      id: row.id,
      title: row.title,
      description: templateDescriptions[i] ?? null,
      steps: own.map((s) => ({
        id: s.id,
        position: s.position,
        title: s.title,
        description: stepDescription.get(s.id) ?? null,
        department: deptRef(s.departmentId),
        category: s.categoryId ? (categories.get(s.categoryId) ?? null) : null,
        assignee: memberRef(ctx, s.assigneeId),
        priority: s.priority,
        relativeDays: s.relativeDays,
      })),
      stepCount: own.length,
      totalDays: own.reduce((sum, s) => sum + s.relativeDays, 0),
      departments: [...depts.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      usageCount: usage.find((u) => u.id === row.id)?.n ?? 0,
      createdBy: personRef(ctx, row.createdBy, row.createdByName),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

export async function listTemplates(ctx: TaskContext): Promise<FlowTemplate[]> {
  const rows = await ctx.db
    .select()
    .from(taskFlowTemplates)
    .where(eq(taskFlowTemplates.workspaceId, ctx.workspaceId))
    .orderBy(sql`lower(${taskFlowTemplates.title})`, asc(taskFlowTemplates.id));
  return hydrateTemplates(ctx, rows);
}

export async function getTemplate(ctx: TaskContext, id: string): Promise<FlowTemplate> {
  const [template] = await hydrateTemplates(ctx, [await getTemplateRowOrThrow(ctx, id)]);
  return template!;
}

async function insertTemplateSteps(ctx: TaskContext, templateId: string, steps: TemplateInput['steps']) {
  await ctx.db.insert(taskFlowTemplateSteps).values(
    await Promise.all(
      steps.map(async (s, index) => ({
        workspaceId: ctx.workspaceId,
        templateId,
        position: index + 1,
        title: s.title,
        description: await encryptTaskText(ctx.cipher, TEMPLATE_STEP_DESCRIPTION, s.description),
        departmentId: s.departmentId,
        categoryId: s.categoryId,
        assigneeId: s.assigneeId,
        priority: s.priority,
        relativeDays: s.relativeDays,
      })),
    ),
  );
}

/** Administrators. */
export async function createTemplate(ctx: TaskContext, input: TemplateInput): Promise<FlowTemplate> {
  await validateSteps(ctx, input.steps);
  const [row] = await ctx.db
    .insert(taskFlowTemplates)
    .values({
      workspaceId: ctx.workspaceId,
      title: input.title,
      description: await encryptTaskText(ctx.cipher, TEMPLATE_DESCRIPTION, input.description),
      createdBy: ctx.userId,
      createdByName: myName(ctx),
    })
    .returning({ id: taskFlowTemplates.id });
  await insertTemplateSteps(ctx, row!.id, input.steps);
  return getTemplate(ctx, row!.id);
}

/** Replaces the steps (their order is their identity, as in Effy); applied processes keep their copies. */
export async function updateTemplate(ctx: TaskContext, id: string, input: TemplateInput): Promise<FlowTemplate> {
  await getTemplateRowOrThrow(ctx, id);
  await validateSteps(ctx, input.steps);
  await ctx.db
    .update(taskFlowTemplates)
    .set({ title: input.title, description: await encryptTaskText(ctx.cipher, TEMPLATE_DESCRIPTION, input.description) })
    .where(and(eq(taskFlowTemplates.workspaceId, ctx.workspaceId), eq(taskFlowTemplates.id, id)));
  await ctx.db
    .delete(taskFlowTemplateSteps)
    .where(and(eq(taskFlowTemplateSteps.workspaceId, ctx.workspaceId), eq(taskFlowTemplateSteps.templateId, id)));
  await insertTemplateSteps(ctx, id, input.steps);
  return getTemplate(ctx, id);
}

/** Processes already applied keep working (they lose the reference to the template). Administrators. */
export async function deleteTemplate(ctx: TaskContext, id: string): Promise<void> {
  await getTemplateRowOrThrow(ctx, id);
  await ctx.db.delete(taskFlowTemplates).where(and(eq(taskFlowTemplates.workspaceId, ctx.workspaceId), eq(taskFlowTemplates.id, id)));
}

/**
 * Applies a template to a client (any member): a real process with the steps copied, the client on
 * every step, relative deadlines; step 1 is activated now and counts from today (office time zone).
 */
export async function applyTemplate(ctx: TaskContext, id: string, input: ApplyInput): Promise<TaskFlowCreatedResponse> {
  const template = await getTemplateRowOrThrow(ctx, id);
  const client = await getTaskClientOrThrow(ctx.db, ctx.workspaceId, input.clientId);
  const steps = await ctx.db
    .select()
    .from(taskFlowTemplateSteps)
    .where(and(eq(taskFlowTemplateSteps.workspaceId, ctx.workspaceId), eq(taskFlowTemplateSteps.templateId, id)))
    .orderBy(asc(taskFlowTemplateSteps.position));
  const [flow] = await ctx.db
    .insert(taskFlows)
    .values({
      workspaceId: ctx.workspaceId,
      title: input.title ?? `${template.title} · ${clientDisplayName(client)}`.slice(0, 200),
      clientId: client.id,
      templateId: template.id,
      createdBy: ctx.userId,
      createdByName: myName(ctx),
    })
    .returning({ id: taskFlows.id });
  if (steps.length > 0) {
    await ctx.db.insert(taskFlowSteps).values(
      await Promise.all(
        steps.map(async (s, index) => ({
          workspaceId: ctx.workspaceId,
          flowId: flow!.id,
          position: index + 1,
          title: s.title,
          // Re-encrypted under the step's own table and column (the AAD binds a value to them).
          description: await encryptTaskText(
            ctx.cipher,
            FLOW_STEP_DESCRIPTION,
            await decryptTaskText(ctx.cipher, TEMPLATE_STEP_DESCRIPTION, s.description),
          ),
          clientId: client.id,
          departmentId: s.departmentId,
          categoryId: s.categoryId,
          assigneeId: s.assigneeId,
          priority: s.priority,
          relativeDays: s.relativeDays,
        })),
      ),
    );
  }
  const taskId = await activateStep(ctx, flow!.id, 1, ctx.today);
  return createdResponse(ctx, flow!.id, taskId, null);
}
