// What a member answers for in the task module, and handing it to someone else when they leave the
// office (removed, leaving, or deleting their account). Every open task has a responsible and every
// recurring task a default responsible (migration 0024), so a member is never removed with work still
// in their name: the removal asks for a replacement (409 with these counts without one) and the
// account deletion hands it to the owner of each office (modules/workspaces/service.ts).
// - open tasks → the replacement; a standalone task or process step follows the replacement's department
//   (when they have one, like any reassignment); an occurrence keeps its recurring task's department and
//   its `assignee_source`;
// - recurring tasks where they are the default responsible (any, ended included: the column is NOT NULL)
//   → the replacement (the not-started occurrences follow on the next generation);
// - process steps still waiting → the replacement.
// Concluded/canceled tasks keep them as responsible until the membership goes, then the foreign key
// clears it (history). Internal: runs inside the caller's tenant transaction.

import { and, count, eq, isNull } from 'drizzle-orm';
import type { MemberHandoverCounts } from '@effinance/shared';
import { recurringTasks, taskFlowSteps, tasks } from '../../db/schema';
import type { TaskContext } from './access';
import { recordEvents } from './events';
import { departmentOfMember } from './shared';
import { NOT_OCCURRENCE_SQL, OPEN_SQL } from './task-rows';

type Ctx = Pick<TaskContext, 'db' | 'workspaceId' | 'userId' | 'members' | 'cipher'>;

export async function memberWork(ctx: Pick<TaskContext, 'db' | 'workspaceId'>, userId: string): Promise<MemberHandoverCounts> {
  const [[open], [recurring], [steps]] = await Promise.all([
    ctx.db
      .select({ n: count() })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, ctx.workspaceId), eq(tasks.assigneeId, userId), OPEN_SQL)),
    ctx.db
      .select({ n: count() })
      .from(recurringTasks)
      .where(and(eq(recurringTasks.workspaceId, ctx.workspaceId), eq(recurringTasks.defaultAssigneeId, userId))),
    ctx.db
      .select({ n: count() })
      .from(taskFlowSteps)
      .where(and(eq(taskFlowSteps.workspaceId, ctx.workspaceId), eq(taskFlowSteps.assigneeId, userId), isNull(taskFlowSteps.activatedAt))),
  ]);
  return { openTasks: open?.n ?? 0, recurringTasks: recurring?.n ?? 0, flowSteps: steps?.n ?? 0 };
}

export const hasWork = (w: MemberHandoverCounts) => w.openTasks + w.recurringTasks + w.flowSteps > 0;

/** Hands the member's open tasks, recurring tasks and waiting process steps to `toId` (a current member). */
export async function handOverMemberWork(
  ctx: Ctx,
  fromId: string,
  toId: string,
  options: { system?: boolean } = {},
): Promise<MemberHandoverCounts> {
  const work = await memberWork(ctx, fromId);
  if (!hasWork(work)) return work;
  const mine = and(eq(tasks.workspaceId, ctx.workspaceId), eq(tasks.assigneeId, fromId), OPEN_SQL);
  const moved = await ctx.db.select({ id: tasks.id }).from(tasks).where(mine);
  const department = await departmentOfMember(ctx.db, ctx.workspaceId, toId);
  if (department) {
    await ctx.db.update(tasks).set({ departmentId: department }).where(and(mine, NOT_OCCURRENCE_SQL));
  }
  await ctx.db.update(tasks).set({ assigneeId: toId }).where(mine);
  await ctx.db
    .update(recurringTasks)
    .set({ defaultAssigneeId: toId })
    .where(and(eq(recurringTasks.workspaceId, ctx.workspaceId), eq(recurringTasks.defaultAssigneeId, fromId)));
  // Waiting process steps go to the successor and, like the open tasks above, to their department (the
  // step is born in it when activated).
  await ctx.db
    .update(taskFlowSteps)
    .set({ assigneeId: toId, ...(department ? { departmentId: department } : {}) })
    .where(and(eq(taskFlowSteps.workspaceId, ctx.workspaceId), eq(taskFlowSteps.assigneeId, fromId), isNull(taskFlowSteps.activatedAt)));
  const person = (id: string) => {
    const m = ctx.members.get(id);
    return m ? { id: m.id, name: m.name } : null;
  };
  const from = person(fromId);
  await recordEvents(
    ctx,
    moved.map((t) => ({
      taskId: t.id,
      kind: 'assigned' as const,
      data: { fromAssignee: from, toAssignee: person(toId) },
      note: `Reatribuída porque ${from?.name ?? 'o responsável'} saiu do espaço`,
      system: options.system,
    })),
  );
  return work;
}

