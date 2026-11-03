// Monthly audit ("Auditoria mensal", Effy's StatusMatrixEntry + AuditConclusion): the client ×
// recurring task matrix of a competence over the generated occurrences. A cell is an occurrence (a
// task): its state is the task's status, its conclusion record is who concluded it and when (written
// by the server), and reopening it is only for who concluded it or an administrator, with a reason
// kept in the task's history (`PATCH /tasks/:id/status`, the same endpoint as the lists). The month of
// a client is concluded when every cell but the canceled ones is done.

import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import {
  type AuditClientRow,
  type AuditMatrixResponse,
  type AuditSummary,
  type OccurrenceCell,
  type taskAuditQuerySchema,
  type TaskRef,
} from '@effinance/shared';
import type { z } from 'zod';
import { contacts, tasks } from '../../db/schema';
import type { TaskContext } from './access';
import { ensureOccurrences, generationBounds } from './generation';
import { aggregateOccurrences, CELL_COLUMNS, occurrenceClients, toOccurrenceCell } from './occurrences';
import { departmentNames } from './shared';
import { OCCURRENCE_SQL } from './task-rows';

type AuditQuery = z.output<typeof taskAuditQuerySchema>;

function summarize(
  ctx: Pick<TaskContext, 'today'>,
  competence: string,
  cells: readonly (OccurrenceCell & { departmentId: string | null })[],
  departments: Map<string, string>,
): AuditSummary {
  const clients = new Set<string>();
  const pending = new Set<string>();
  const overdueClients = new Set<string>();
  const live = new Map<string, { total: number; done: number }>();
  const byDept = new Map<string | null, { total: number; done: number; overduePending: number }>();
  const s = { total: 0, done: 0, doneLate: 0, canceled: 0, inProgress: 0, pending: 0, overduePending: 0, targetMissedPending: 0 };
  for (const c of cells) {
    clients.add(c.clientId);
    s.total += 1;
    const dept = byDept.get(c.departmentId) ?? { total: 0, done: 0, overduePending: 0 };
    dept.total += 1;
    const l = live.get(c.clientId) ?? { total: 0, done: 0 };
    if (c.status !== 'canceled') l.total += 1;
    if (c.status === 'done') {
      s.done += 1;
      dept.done += 1;
      l.done += 1;
      if (c.concludedOnTime === false) s.doneLate += 1;
    } else if (c.status === 'canceled') {
      s.canceled += 1;
    } else {
      s.pending += 1;
      pending.add(c.clientId);
      if (c.status !== 'todo') s.inProgress += 1;
      if (c.overdue) {
        s.overduePending += 1;
        dept.overduePending += 1;
        overdueClients.add(c.clientId);
      }
      if (c.targetMissed) s.targetMissedPending += 1;
    }
    live.set(c.clientId, l);
    byDept.set(c.departmentId, dept);
  }
  const deptRef = (id: string | null): TaskRef | null => {
    const name = id ? departments.get(id) : undefined;
    return id && name ? { id, name } : null;
  };
  return {
    competence,
    ...s,
    overdueClients: overdueClients.size,
    clientsWithPending: pending.size,
    clientCount: clients.size,
    clientsConcluded: [...live.values()].filter((l) => l.total > 0 && l.done === l.total).length,
    byDepartment: [...byDept.entries()]
      .map(([id, counts]) => ({ department: deptRef(id), ...counts }))
      .sort((a, b) => (a.department?.name ?? '~').localeCompare(b.department?.name ?? '~', 'pt-BR')),
  };
}

/** GET /tasks/audit: the client × recurring task matrix. The summary covers the whole competence. */
export async function auditMatrix(ctx: TaskContext, q: AuditQuery): Promise<AuditMatrixResponse> {
  const { min, max } = generationBounds(ctx.today);
  if (q.competence >= min && q.competence <= max) await ensureOccurrences(ctx, [q.competence]);
  const rows = await ctx.db
    .select({ ...CELL_COLUMNS, departmentId: tasks.departmentId, taxRegime: contacts.taxRegime })
    .from(tasks)
    .innerJoin(contacts, and(eq(contacts.workspaceId, tasks.workspaceId), eq(contacts.id, tasks.clientId)))
    .where(and(eq(tasks.workspaceId, ctx.workspaceId), OCCURRENCE_SQL, eq(tasks.competence, q.competence)));
  const all = rows.map((r) => ({ ...toOccurrenceCell(ctx, r), departmentId: r.departmentId, taxRegime: r.taxRegime }));

  let filtered = all.filter(
    (c) =>
      (!q.departmentId || c.departmentId === q.departmentId) &&
      (!q.taxRegime || c.taxRegime === q.taxRegime) &&
      (!q.recurringTaskId || c.recurringTaskId === q.recurringTaskId),
  );
  if (q.assigneeId) {
    // The clients where that member answers for a cell; every cell of theirs stays (the screen dims the others).
    const theirs = new Set(filtered.filter((c) => c.assignee?.id === q.assigneeId).map((c) => c.clientId));
    filtered = filtered.filter((c) => theirs.has(c.clientId));
  }
  const clientIds = [...new Set(filtered.map((c) => c.clientId))];

  const columnWhere: SQL[] = [eq(tasks.competence, q.competence)];
  if (q.departmentId) columnWhere.push(eq(tasks.departmentId, q.departmentId));
  if (q.recurringTaskId) columnWhere.push(eq(tasks.recurringTaskId, q.recurringTaskId));
  if (q.taxRegime || q.assigneeId) columnWhere.push(clientIds.length ? inArray(tasks.clientId, clientIds) : sql`false`);

  const [columns, info, departments] = await Promise.all([
    aggregateOccurrences(ctx, and(...columnWhere)),
    occurrenceClients(ctx, clientIds),
    departmentNames(ctx.db, ctx.workspaceId),
  ]);

  const byClient = new Map<string, typeof filtered>();
  for (const c of filtered) byClient.set(c.clientId, [...(byClient.get(c.clientId) ?? []), c]);
  const clients: AuditClientRow[] = [...info.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map((client) => {
      const mine = byClient.get(client.id) ?? [];
      const live = mine.filter((c) => c.status !== 'canceled');
      const done = live.filter((c) => c.status === 'done');
      const concluded = live.length > 0 && done.length === live.length;
      return {
        ...client,
        total: mine.length,
        done: done.length,
        canceled: mine.length - live.length,
        inProgress: mine.filter((c) => c.status === 'in_progress' || c.status === 'waiting_client').length,
        overduePending: mine.filter((c) => c.overdue).length,
        targetMissedPending: mine.filter((c) => c.targetMissed).length,
        monthConcludedAt: concluded ? done.map((c) => c.concludedAt!).sort().at(-1)! : null,
      };
    });

  return {
    today: ctx.today,
    competence: q.competence,
    columns: columns.sort(
      (a, b) => a.targetDate.localeCompare(b.targetDate) || a.name.localeCompare(b.name, 'pt-BR') || a.periodKey.localeCompare(b.periodKey),
    ),
    clients,
    cells: filtered.map(({ departmentId: _d, taxRegime: _r, ...cell }) => cell),
    summary: summarize(ctx, q.competence, all, departments),
  };
}
