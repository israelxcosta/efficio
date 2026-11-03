// Engine of the processes ("processos", Effy's task flows): only the active step is a real task;
// concluding it activates the next one. Ported from Effy's taskFlow.service:
// - a step is activated once (`activated_at`; the row is locked while activating, so two conclusions
//   racing never create the next task twice);
// - the conclusion of a step is recorded once (`completed_at`); reopening a step whose next one has not
//   started puts the next one back to waiting (its task removed) and clears the conclusion, and
//   reopening it once the next one started is refused (`beforeStepReopens`);
// - a relative deadline counts calendar days from the day the previous step was concluded (step 1: the
//   day the process was created), in the office time zone; an absolute one is kept as built;
// - the step's task is created by the process's author, as a fresh "A fazer", in the department of its
//   assignee (else the step's department); references removed meanwhile were cleared by the foreign
//   keys (category, assignee, department) or block their own deletion (client).
// Internal to the module: services/flows call it inside their tenant transaction.

import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  dateInTimeZone,
  dueFromRelativeDays,
  isTaskOverdue,
  TASK_TIME_ZONE,
  type FlowStepState,
  type ISODate,
  type TaskCategoryRef,
  type TaskFlow,
  type TaskFlowStep,
} from '@effinance/shared';
import {
  contacts,
  taskCategories,
  taskFlowSteps,
  taskFlowTemplates,
  taskFlows,
  tasks,
  type TaskFlowRow,
  type TaskFlowStepRow,
} from '../../db/schema';
import { now } from '../../lib/clock';
import { ConflictError } from '../../lib/errors';
import type { TaskContext } from './access';
import { decryptTaskText, encryptTaskText, FLOW_STEP_DESCRIPTION, TASK_DESCRIPTION } from './encrypted-text';
import { recordEvents } from './events';
import { clientRef, departmentNames, departmentOfMember, memberRef, personRef } from './shared';

/**
 * Creates the task of step `position` (once) and marks the step as activated. `base` is the day the
 * relative deadline counts from. Returns the new task's id (null when there is no such step or it was
 * already activated).
 */
export async function activateStep(ctx: TaskContext, flowId: string, position: number, base: ISODate): Promise<string | null> {
  const [step] = await ctx.db
    .select()
    .from(taskFlowSteps)
    .where(and(eq(taskFlowSteps.workspaceId, ctx.workspaceId), eq(taskFlowSteps.flowId, flowId), eq(taskFlowSteps.position, position)))
    .for('update');
  if (!step || step.activatedAt) return null;
  const [flow] = await ctx.db
    .select()
    .from(taskFlows)
    .where(and(eq(taskFlows.workspaceId, ctx.workspaceId), eq(taskFlows.id, flowId)));
  if (!flow) return null;
  const dueDate = step.relativeDays !== null ? dueFromRelativeDays(base, step.relativeDays) : step.dueDate;
  const description = await decryptTaskText(ctx.cipher, FLOW_STEP_DESCRIPTION, step.description);
  const departmentId = (await departmentOfMember(ctx.db, ctx.workspaceId, step.assigneeId)) ?? step.departmentId;
  const [task] = await ctx.db
    .insert(tasks)
    .values({
      workspaceId: ctx.workspaceId,
      title: step.title,
      description: await encryptTaskText(ctx.cipher, TASK_DESCRIPTION, description),
      clientId: step.clientId,
      categoryId: step.categoryId,
      assigneeId: step.assigneeId,
      departmentId,
      priority: step.priority,
      status: 'todo',
      dueDate,
      createdBy: flow.createdBy,
      createdByName: flow.createdByName,
      createdAt: now(),
    })
    .returning({ id: tasks.id });
  // The step shows the computed deadline too (the process panel shows the same date as the task).
  await ctx.db
    .update(taskFlowSteps)
    .set({ taskId: task!.id, activatedAt: now(), dueDate })
    .where(and(eq(taskFlowSteps.workspaceId, ctx.workspaceId), eq(taskFlowSteps.id, step.id)));
  await recordEvents(ctx, [
    { taskId: task!.id, kind: 'created', data: { origin: 'flow', originName: flow.title } },
    { taskId: task!.id, kind: 'flow_step', data: { flow: { id: flowId, title: flow.title, position, event: 'activated' } } },
  ]);
  return task!.id;
}

/**
 * Called whenever a task becomes `done`: when it is the step of a process, records the step's
 * conclusion (the first time only) and activates the next step if it was not activated yet.
 * Idempotent. Returns the id of the task created now, if any.
 */
export async function advanceOnCompletion(ctx: TaskContext, taskId: string): Promise<string | null> {
  const [step] = await ctx.db
    .select()
    .from(taskFlowSteps)
    .where(and(eq(taskFlowSteps.workspaceId, ctx.workspaceId), eq(taskFlowSteps.taskId, taskId)));
  if (!step) return null;
  let completedAt = step.completedAt;
  if (!completedAt) {
    completedAt = now();
    await ctx.db
      .update(taskFlowSteps)
      .set({ completedAt })
      .where(and(eq(taskFlowSteps.workspaceId, ctx.workspaceId), eq(taskFlowSteps.id, step.id)));
    await recordEvents(ctx, [
      { taskId, kind: 'flow_step', data: { flow: { id: step.flowId, title: await flowTitle(ctx, step.flowId), position: step.position, event: 'completed' } } },
    ]);
  }
  return activateStep(ctx, step.flowId, step.position + 1, dateInTimeZone(completedAt, TASK_TIME_ZONE));
}

async function flowTitle(ctx: Pick<TaskContext, 'db' | 'workspaceId'>, flowId: string): Promise<string> {
  const [flow] = await ctx.db
    .select({ title: taskFlows.title })
    .from(taskFlows)
    .where(and(eq(taskFlows.workspaceId, ctx.workspaceId), eq(taskFlows.id, flowId)));
  return flow?.title ?? '';
}

/**
 * Called before a concluded process step leaves `done` (reopened, moved, canceled, undone). The next
 * step, when already activated:
 * - not started (its task still "A fazer", without comments, attachments or subtasks): goes back to
 *   waiting — its task is removed, the computed deadline cleared — and the history of this step says so;
 * - started or concluded: the reopening is refused (409), so the process never runs two steps at once.
 * The step's conclusion is cleared, so concluding it again counts the next deadline from the new day.
 */
export async function beforeStepReopens(ctx: TaskContext, taskId: string): Promise<void> {
  const [step] = await ctx.db
    .select()
    .from(taskFlowSteps)
    .where(and(eq(taskFlowSteps.workspaceId, ctx.workspaceId), eq(taskFlowSteps.taskId, taskId)));
  if (!step) return;
  const [next] = await ctx.db
    .select()
    .from(taskFlowSteps)
    .where(
      and(
        eq(taskFlowSteps.workspaceId, ctx.workspaceId),
        eq(taskFlowSteps.flowId, step.flowId),
        eq(taskFlowSteps.position, step.position + 1),
      ),
    )
    .for('update');
  if (next?.activatedAt) {
    if (next.taskId) {
      const [nextTask] = await ctx.db
        .select({
          status: tasks.status,
          busy: sql<boolean>`(exists (select 1 from task_comments c where c.workspace_id = tasks.workspace_id and c.task_id = tasks.id)
            or exists (select 1 from task_attachments a where a.workspace_id = tasks.workspace_id and a.task_id = tasks.id)
            or exists (select 1 from task_subtasks s where s.workspace_id = tasks.workspace_id and s.task_id = tasks.id))`,
        })
        .from(tasks)
        .where(and(eq(tasks.workspaceId, ctx.workspaceId), eq(tasks.id, next.taskId)));
      if (nextTask && (nextTask.status !== 'todo' || nextTask.busy)) {
        throw new ConflictError(
          `Não é possível reabrir esta etapa: a etapa seguinte, “${next.title}”, já foi ${nextTask.status === 'done' ? 'concluída' : 'iniciada'}. Corrija pela etapa seguinte.`,
          { nextStep: { position: next.position, title: next.title, taskId: next.taskId, status: nextTask.status } },
        );
      }
      if (nextTask) await ctx.db.delete(tasks).where(and(eq(tasks.workspaceId, ctx.workspaceId), eq(tasks.id, next.taskId)));
    }
    await ctx.db
      .update(taskFlowSteps)
      .set({ taskId: null, activatedAt: null, dueDate: next.relativeDays !== null ? null : next.dueDate })
      .where(and(eq(taskFlowSteps.workspaceId, ctx.workspaceId), eq(taskFlowSteps.id, next.id)));
    await recordEvents(ctx, [
      {
        taskId,
        kind: 'flow_step',
        data: { flow: { id: step.flowId, title: await flowTitle(ctx, step.flowId), position: next.position, event: 'deactivated' } },
        note: `A etapa ${next.position} (${next.title}) voltou a aguardar esta etapa`,
      },
    ]);
  }
  if (step.completedAt) {
    await ctx.db
      .update(taskFlowSteps)
      .set({ completedAt: null })
      .where(and(eq(taskFlowSteps.workspaceId, ctx.workspaceId), eq(taskFlowSteps.id, step.id)));
  }
}

function stepState(step: TaskFlowStepRow): FlowStepState {
  if (step.completedAt) return 'done';
  return step.activatedAt ? 'current' : 'waiting';
}

export async function categoryRefs(ctx: Pick<TaskContext, 'db' | 'workspaceId'>): Promise<Map<string, TaskCategoryRef>> {
  const rows = await ctx.db
    .select({ id: taskCategories.id, name: taskCategories.name, icon: taskCategories.icon, color: taskCategories.color })
    .from(taskCategories)
    .where(eq(taskCategories.workspaceId, ctx.workspaceId));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Processes with their steps, clients and the state of each step's task, in the given order. */
export async function hydrateFlows(ctx: TaskContext, flows: TaskFlowRow[]): Promise<TaskFlow[]> {
  if (flows.length === 0) return [];
  const ids = flows.map((f) => f.id);
  const [steps, categories, departments] = await Promise.all([
    ctx.db
      .select({
        step: taskFlowSteps,
        clientName: contacts.name,
        clientTradeName: contacts.tradeName,
        taskStatus: tasks.status,
        taskDueDate: tasks.dueDate,
      })
      .from(taskFlowSteps)
      .leftJoin(contacts, and(eq(contacts.workspaceId, taskFlowSteps.workspaceId), eq(contacts.id, taskFlowSteps.clientId)))
      .leftJoin(tasks, and(eq(tasks.workspaceId, taskFlowSteps.workspaceId), eq(tasks.id, taskFlowSteps.taskId)))
      .where(and(eq(taskFlowSteps.workspaceId, ctx.workspaceId), inArray(taskFlowSteps.flowId, ids)))
      .orderBy(asc(taskFlowSteps.position)),
    categoryRefs(ctx),
    departmentNames(ctx.db, ctx.workspaceId),
  ]);
  const clientIds = [...new Set(flows.map((f) => f.clientId).filter((v): v is string => v !== null))];
  const templateIds = [...new Set(flows.map((f) => f.templateId).filter((v): v is string => v !== null))];
  const [flowClients, templates, descriptions] = await Promise.all([
    clientIds.length
      ? ctx.db
          .select({ id: contacts.id, name: contacts.name, tradeName: contacts.tradeName })
          .from(contacts)
          .where(and(eq(contacts.workspaceId, ctx.workspaceId), inArray(contacts.id, clientIds)))
      : Promise.resolve([]),
    templateIds.length
      ? ctx.db
          .select({ id: taskFlowTemplates.id, name: taskFlowTemplates.title })
          .from(taskFlowTemplates)
          .where(and(eq(taskFlowTemplates.workspaceId, ctx.workspaceId), inArray(taskFlowTemplates.id, templateIds)))
      : Promise.resolve([]),
    Promise.all(steps.map((s) => decryptTaskText(ctx.cipher, FLOW_STEP_DESCRIPTION, s.step.description))),
  ]);
  const descriptionOf = new Map(steps.map((s, i) => [s.step.id, descriptions[i] ?? null]));
  return flows.map((flow) => {
    const own = steps.filter((s) => s.step.flowId === flow.id);
    const shaped: TaskFlowStep[] = own.map(({ step, clientName, clientTradeName, taskStatus, taskDueDate }) => {
      const departmentName = step.departmentId ? departments.get(step.departmentId) : undefined;
      return {
        id: step.id,
        position: step.position,
        title: step.title,
        description: descriptionOf.get(step.id) ?? null,
        client: clientRef({ id: step.clientId, name: clientName, tradeName: clientTradeName }),
        department: step.departmentId && departmentName ? { id: step.departmentId, name: departmentName } : null,
        category: step.categoryId ? (categories.get(step.categoryId) ?? null) : null,
        assignee: memberRef(ctx, step.assigneeId),
        priority: step.priority,
        dueDate: step.dueDate,
        relativeDays: step.relativeDays,
        state: stepState(step),
        task:
          step.taskId && taskStatus
            ? {
                id: step.taskId,
                status: taskStatus,
                dueDate: taskDueDate,
                overdue: isTaskOverdue({ status: taskStatus, dueDate: taskDueDate }, ctx.today),
              }
            : null,
        activatedAt: step.activatedAt?.toISOString() ?? null,
        completedAt: step.completedAt?.toISOString() ?? null,
      };
    });
    const doneCount = shaped.filter((s) => s.state === 'done').length;
    const client = flowClients.find((c) => c.id === flow.clientId);
    const template = templates.find((t) => t.id === flow.templateId);
    return {
      id: flow.id,
      title: flow.title,
      client: client ? clientRef(client) : null,
      template: template ?? null,
      createdBy: personRef(ctx, flow.createdBy, flow.createdByName),
      createdAt: flow.createdAt.toISOString(),
      stepCount: shaped.length,
      doneCount,
      currentStep: shaped.find((s) => s.state === 'current') ?? null,
      completedAt: shaped.length > 0 && doneCount === shaped.length ? (shaped.at(-1)?.completedAt ?? null) : null,
      steps: shaped,
    };
  });
}

/** The process a task belongs to (its FlowStepper), or null. */
export async function flowOfTask(ctx: TaskContext, taskId: string): Promise<TaskFlow | null> {
  const [step] = await ctx.db
    .select({ flowId: taskFlowSteps.flowId })
    .from(taskFlowSteps)
    .where(and(eq(taskFlowSteps.workspaceId, ctx.workspaceId), eq(taskFlowSteps.taskId, taskId)));
  if (!step) return null;
  const rows = await ctx.db
    .select()
    .from(taskFlows)
    .where(and(eq(taskFlows.workspaceId, ctx.workspaceId), eq(taskFlows.id, step.flowId)));
  const [flow] = await hydrateFlows(ctx, rows);
  return flow ?? null;
}
