// Tenant boundary of the task module. Unlike the financial modules, every member of the workspace
// works here, `viewer` ("Colaborador") included: tasks, subtasks, comments, audit cells, flows and
// personal notes. Registries (departments, categories, client responsibles, recurring tasks, flow
// templates, member departments) and deletions are for administrators (owner/editor). Writes still
// need a subscription that allows writing (402), like everywhere else.
//
// Each request runs in two phases: the members of the workspace (names, roles) are read on the system
// connection — the tenant role cannot see `users`/`workspace_members` — and then the work happens in
// one tenant transaction (RLS) whose result is returned after COMMIT. Both phases work in the browser
// demo (single PGlite connection: never nested).

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { TASK_TIME_ZONE, type ISODate, type MemberRole } from '@effinance/shared';
import type { DbExecutor } from '../../db/client';
import { users, workspaceMembers } from '../../db/schema';
import { todayIn } from '../../lib/clock';
import type { FieldCipher } from '../../lib/crypto/field-cipher';
import { ForbiddenError, SubscriptionRequiredError } from '../../lib/errors';
import { inTenant } from '../../lib/tenant-scope';
import { isMutation, type Access } from '../workspaces/access';

export interface MemberInfo {
  id: string;
  name: string;
  role: MemberRole;
}

/** Everything a task service needs: the tenant transaction, who is asking and the members. */
export interface TaskContext {
  db: DbExecutor;
  workspaceId: string;
  userId: string;
  role: MemberRole;
  isAdmin: boolean;
  canWrite: boolean;
  members: ReadonlyMap<string, MemberInfo>;
  /** Today in the office time zone. */
  today: ISODate;
  /**
   * Field cipher of the workspace (task descriptions and comments: `encrypted-text.ts`), unwrapped
   * before the tenant transaction opened (the tenant role cannot read `workspaces`).
   */
  cipher: FieldCipher;
  log?: { warn: (obj: object, msg: string) => void };
}

/** Administrators of the module (and of the finances): owner and editor. An allowlist on purpose. */
export function isTaskAdmin(access: Pick<Access, 'role'> | null | undefined): boolean {
  return access?.role === 'owner' || access?.role === 'editor';
}

export const TASK_ADMIN_MESSAGE = 'Somente os administradores do espaço podem fazer isso.';

/** Route-level `onRequest` hook for registries and deletions (runs after authentication). */
export async function requireTaskAdmin(req: FastifyRequest): Promise<void> {
  if (!isTaskAdmin(req.access)) throw new ForbiddenError(TASK_ADMIN_MESSAGE);
}

/** Authentication for every route; writes by any member, as long as the subscription allows writing. */
export function taskGuards(app: Pick<FastifyInstance, 'addHook' | 'authenticate'>): void {
  app.addHook('onRequest', app.authenticate);
  app.addHook('onRequest', async (req: FastifyRequest) => {
    if (isMutation(req.method) && !req.access.subscription.canWrite)
      throw new SubscriptionRequiredError();
  });
}

/** Members of the workspace with their names (system connection). */
export async function loadMembers(
  db: DbExecutor,
  workspaceId: string,
): Promise<Map<string, MemberInfo>> {
  const rows = await db
    .select({ id: users.id, name: users.name, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId)));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Runs `fn` in the tenant transaction of the request, with the members loaded beforehand. */
export async function runTasks<T>(
  system: DbExecutor,
  req: Pick<FastifyRequest, 'workspaceId' | 'userId' | 'access'> & { log?: TaskContext['log'] },
  fn: (ctx: TaskContext) => Promise<T>,
): Promise<T> {
  const members = await loadMembers(system, req.workspaceId);
  return inTenant(system, req.workspaceId, (db, cipher) =>
    fn({
      db,
      workspaceId: req.workspaceId,
      userId: req.userId,
      role: req.access.role,
      isAdmin: isTaskAdmin(req.access),
      canWrite: req.access.subscription.canWrite,
      members,
      today: todayIn(TASK_TIME_ZONE),
      cipher,
      log: req.log,
    }),
  );
}

export function assertTaskAdmin(ctx: Pick<TaskContext, 'isAdmin'>): void {
  if (!ctx.isAdmin) throw new ForbiddenError(TASK_ADMIN_MESSAGE);
}
