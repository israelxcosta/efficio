// Recurring tasks ("tarefas recorrentes", Effy's obligations): the registry (administrators write,
// every member reads), the per-client view of one occurrence and the explicit generation. The
// occurrences themselves are rows of `tasks` (generation.ts); this module keeps the registry and the
// occurrences consistent: creating generates them, editing re-syncs the open ones from the current
// competence on (concluded ones never change), deleting is refused once there is history.

import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  competenceOfPeriod,
  monthKey,
  occurrencesInCompetence,
  recurringMonths,
  type AssigneeSource,
  type MonthKey,
  type NonBusinessDayRule,
  type RecurrencePeriod,
  type RecurringGenerateResponse,
  type RecurringOccurrenceDetail,
  type RecurringTask,
  type RecurringTaskListResponse,
  type recurringTaskInputSchema,
  type recurringTaskQuerySchema,
  type TaskMemberRef,
} from '@effinance/shared';
import type { z } from 'zod';
import { contacts, recurringTaskClients, recurringTasks, taskDepartments, tasks } from '../../db/schema';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { inChunks } from '../../lib/sql';
import type { TaskContext } from './access';
import { decryptTaskText, encryptTaskText, RECURRING_DESCRIPTION } from './encrypted-text';
import { categoryRefs } from './flow-engine';
import {
  appliesTo,
  clientActiveIn,
  defActiveIn,
  defaultWindow,
  deleteSeriesRows,
  ensureOccurrences,
  generationBounds,
  loadClients,
  loadDefs,
  resolveAssignee,
  scheduleOf,
  syncOpenOccurrences,
  workedOccurrenceCount,
  type GenClient,
  type GenDef,
} from './generation';
import { aggregateOccurrences, CELL_COLUMNS, occurrenceClients, toOccurrenceCell } from './occurrences';
import {
  assertClients,
  assertMember,
  departmentNames,
  getDepartmentOrThrow,
  getTaskCategoryOrThrow,
  memberRef,
  myName,
  personRef,
} from './shared';
import { OPEN_SQL } from './task-rows';

type RecurringInput = z.output<typeof recurringTaskInputSchema>;
type RecurringQuery = z.output<typeof recurringTaskQuerySchema>;

const count = (cond?: ReturnType<typeof sql>) =>
  (cond ? sql<number>`count(*) filter (where ${cond})` : sql<number>`count(*)`).mapWith(Number);

/**
 * A recurring task of the registry. A task's recurrence (origin `task`, migration 0019) is managed from
 * its task (`recurrence` on PATCH /tasks/:id): here it is "not found", like an id of another office.
 */
async function getDefOrThrow(ctx: Pick<TaskContext, 'db' | 'workspaceId'>, id: string): Promise<GenDef> {
  const [def] = await loadDefs(ctx, [id], { origin: 'registry' });
  if (!def) throw new NotFoundError('Tarefa recorrente não encontrada');
  return def;
}

interface MonthStats {
  total: number;
  done: number;
  canceled: number;
  inProgress: number;
  overdue: number;
}

async function monthStats(ctx: TaskContext, month: MonthKey, ids?: string[]): Promise<Map<string, MonthStats>> {
  const rows = await ctx.db
    .select({
      id: tasks.recurringTaskId,
      total: count(),
      done: count(sql`${tasks.status} = 'done'`),
      canceled: count(sql`${tasks.status} = 'canceled'`),
      inProgress: count(sql`${tasks.status} in ('in_progress', 'waiting_client')`),
      overdue: count(sql`${OPEN_SQL} and ${tasks.dueDate} < ${ctx.today}`),
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, ctx.workspaceId),
        eq(tasks.competence, month),
        ids ? inArray(tasks.recurringTaskId, ids) : sql`${tasks.recurringTaskId} is not null`,
      ),
    )
    .groupBy(tasks.recurringTaskId);
  return new Map(rows.map((r) => [r.id!, r]));
}

async function occurrenceCounts(ctx: TaskContext, ids?: string[]): Promise<Map<string, number>> {
  const rows = await ctx.db
    .select({ id: tasks.recurringTaskId, n: count() })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, ctx.workspaceId), ids ? inArray(tasks.recurringTaskId, ids) : sql`${tasks.recurringTaskId} is not null`))
    .groupBy(tasks.recurringTaskId);
  return new Map(rows.map((r) => [r.id!, r.n]));
}

interface Shared {
  clients: GenClient[];
  departments: Map<string, string>;
  categories: Awaited<ReturnType<typeof categoryRefs>>;
  stats: Map<string, MonthStats>;
  occurrences: Map<string, number>;
  descriptions: Map<string, string | null>;
}

function toRecurringTask(ctx: TaskContext, def: GenDef, month: MonthKey, shared: Shared): RecurringTask {
  const row = def.row;
  const current = monthKey(ctx.today);
  const applicable = shared.clients.filter((c) => clientActiveIn(c, current) && appliesTo(def, c));
  // Every occurrence goes to the default responsible (or waits in the department's queue).
  const { assigneeId, source } = resolveAssignee(row);
  const distribution: RecurringTask['distribution'] =
    applicable.length > 0 ? [{ assignee: memberRef(ctx, assigneeId), source, count: applicable.length }] : [];
  const scheduled = defActiveIn(row, month) ? occurrencesInCompetence(scheduleOf(row), month) : [];
  const upcoming = scheduled.find((s) => s.legalDueDate >= ctx.today) ?? scheduled.at(-1);
  const stats = shared.stats.get(row.id);
  const departmentName = row.departmentId ? shared.departments.get(row.departmentId) : undefined;
  return {
    id: row.id,
    name: row.name,
    description: shared.descriptions.get(row.id) ?? null,
    // Registry rows only (getDefOrThrow / listRecurring): never `daily` nor `skip` (recurring_tasks_origin_chk).
    period: row.period as RecurrencePeriod,
    dueDay: row.dueDay,
    dueMonth: row.dueMonth,
    months: recurringMonths(row),
    targetDaysBefore: row.targetDaysBefore,
    nonBusinessDayRule: row.nonBusinessDayRule as NonBusinessDayRule,
    referenceOffset: row.referenceOffset,
    department: row.departmentId && departmentName ? { id: row.departmentId, name: departmentName } : null,
    category: row.categoryId ? (shared.categories.get(row.categoryId) ?? null) : null,
    assignee: memberRef(ctx, row.defaultAssigneeId),
    regimes: row.regimes,
    clientIds: [...def.included],
    excludedClientIds: [...def.excluded],
    startCompetence: row.startCompetence,
    endCompetence: row.endCompetence,
    active: row.endCompetence === null || row.endCompetence >= current,
    clientCount: applicable.length,
    distribution,
    occurrenceCount: shared.occurrences.get(row.id) ?? 0,
    month: {
      competence: month,
      occurs: scheduled.length > 0,
      legalDueDate: upcoming?.legalDueDate ?? null,
      targetDate: upcoming?.targetDate ?? null,
      total: stats?.total ?? 0,
      done: stats?.done ?? 0,
      canceled: stats?.canceled ?? 0,
      inProgress: stats?.inProgress ?? 0,
      overdue: stats?.overdue ?? 0,
    },
    createdBy: personRef(ctx, row.createdBy, row.createdByName),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadShared(ctx: TaskContext, defs: GenDef[], month: MonthKey): Promise<Shared> {
  const ids = defs.map((d) => d.row.id);
  const [clients, departments, categories, stats, occurrences, descriptions] = await Promise.all([
    loadClients(ctx),
    departmentNames(ctx.db, ctx.workspaceId),
    categoryRefs(ctx),
    monthStats(ctx, month, ids.length === 1 ? ids : undefined),
    occurrenceCounts(ctx, ids.length === 1 ? ids : undefined),
    Promise.all(defs.map((d) => decryptTaskText(ctx.cipher, RECURRING_DESCRIPTION, d.row.description))),
  ]);
  return {
    clients,
    departments,
    categories,
    stats,
    occurrences,
    descriptions: new Map(defs.map((d, i) => [d.row.id, descriptions[i] ?? null])),
  };
}

const inBounds = (ctx: TaskContext, month: MonthKey) => {
  const { min, max } = generationBounds(ctx.today);
  return month >= min && month <= max;
};

export async function listRecurring(ctx: TaskContext, q: RecurringQuery): Promise<RecurringTaskListResponse> {
  const month = q.month ?? monthKey(ctx.today);
  if (inBounds(ctx, month)) await ensureOccurrences(ctx, [month]);
  const current = monthKey(ctx.today);
  const all = await loadDefs(ctx, undefined, { origin: 'registry' });
  const isActive = (d: GenDef) => d.row.endCompetence === null || d.row.endCompetence >= current;
  let assigneeDefs: Set<string> | null = null;
  if (q.assigneeId) {
    const rows = await ctx.db
      .selectDistinct({ id: tasks.recurringTaskId })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, ctx.workspaceId), eq(tasks.competence, month), eq(tasks.assigneeId, q.assigneeId)));
    assigneeDefs = new Set(rows.map((r) => r.id!));
  }
  const search = q.search?.toLocaleLowerCase('pt-BR');
  const defs = all
    .filter((d) => (q.status === 'all' ? true : q.status === 'ended' ? !isActive(d) : isActive(d)))
    .filter((d) => !q.period || d.row.period === q.period)
    .filter((d) => !q.departmentId || d.row.departmentId === q.departmentId)
    .filter((d) => !q.regime || d.row.regimes.includes(q.regime))
    .filter((d) => !q.assigneeId || d.row.defaultAssigneeId === q.assigneeId || assigneeDefs!.has(d.row.id))
    .filter((d) => !search || d.row.name.toLocaleLowerCase('pt-BR').includes(search));
  const shared = await loadShared(ctx, defs, month);
  const activeIds = new Set(all.filter(isActive).map((d) => d.row.id));
  let total = 0;
  let done = 0;
  let canceled = 0;
  for (const [id, s] of shared.stats) {
    if (!activeIds.has(id)) continue;
    total += s.total;
    done += s.done;
    canceled += s.canceled;
  }
  return {
    month,
    items: defs.map((d) => toRecurringTask(ctx, d, month, shared)),
    summary: {
      active: all.filter(isActive).length,
      ended: all.filter((d) => !isActive(d)).length,
      occurrences: { total, done, canceled },
    },
  };
}

export async function getRecurring(ctx: TaskContext, id: string, month?: MonthKey): Promise<RecurringTask> {
  const def = await getDefOrThrow(ctx, id);
  const competence = month ?? monthKey(ctx.today);
  return toRecurringTask(ctx, def, competence, await loadShared(ctx, [def], competence));
}

async function validate(ctx: TaskContext, input: RecurringInput) {
  if (input.departmentId) await getDepartmentOrThrow(ctx.db, ctx.workspaceId, input.departmentId);
  else {
    const [any] = await ctx.db
      .select({ id: taskDepartments.id })
      .from(taskDepartments)
      .where(eq(taskDepartments.workspaceId, ctx.workspaceId))
      .limit(1);
    // With departments, the occurrences must belong to one (the start page and "carteira" need it).
    if (any) throw new ValidationError('Escolha o departamento.');
  }
  if (input.categoryId) await getTaskCategoryOrThrow(ctx.db, ctx.workspaceId, input.categoryId);
  assertMember(ctx, input.assigneeId);
  await assertClients(ctx.db, ctx.workspaceId, [...input.clientIds, ...input.excludedClientIds]);
}

async function values(ctx: TaskContext, input: RecurringInput) {
  return {
    name: input.name,
    description: await encryptTaskText(ctx.cipher, RECURRING_DESCRIPTION, input.description),
    period: input.period,
    departmentId: input.departmentId,
    categoryId: input.categoryId,
    defaultAssigneeId: input.assigneeId,
    dueDay: input.dueDay,
    dueMonth: input.dueMonth,
    targetDaysBefore: input.targetDaysBefore,
    nonBusinessDayRule: input.nonBusinessDayRule,
    referenceOffset: input.referenceOffset,
    regimes: input.regimes,
    endCompetence: input.endCompetence,
  };
}

async function replaceLinks(ctx: TaskContext, id: string, input: RecurringInput) {
  await ctx.db
    .delete(recurringTaskClients)
    .where(and(eq(recurringTaskClients.workspaceId, ctx.workspaceId), eq(recurringTaskClients.recurringTaskId, id)));
  const links = [
    ...input.clientIds.map((clientId) => ({ clientId, mode: 'include' as const })),
    ...input.excludedClientIds.map((clientId) => ({ clientId, mode: 'exclude' as const })),
  ];
  for (const chunk of inChunks(links, 1000)) {
    await ctx.db
      .insert(recurringTaskClients)
      .values(chunk.map((l) => ({ workspaceId: ctx.workspaceId, recurringTaskId: id, ...l })));
  }
}

/**
 * Inserts a recurring task (validated) with its client links, without generating: the caller generates
 * (one `ensureOccurrences` for several). `catalogKey`: the regime-group item it comes from.
 */
export async function insertRecurring(ctx: TaskContext, input: RecurringInput, opts: { catalogKey?: string } = {}): Promise<string> {
  await validate(ctx, input);
  const startCompetence = input.startCompetence ?? monthKey(ctx.today);
  if (input.endCompetence && input.endCompetence < startCompetence)
    throw new ValidationError('O encerramento deve ser depois do início');
  const [row] = await ctx.db
    .insert(recurringTasks)
    .values({
      workspaceId: ctx.workspaceId,
      ...(await values(ctx, input)),
      startCompetence,
      catalogKey: opts.catalogKey ?? null,
      createdBy: ctx.userId,
      createdByName: myName(ctx),
    })
    .returning({ id: recurringTasks.id });
  await replaceLinks(ctx, row!.id, input);
  return row!.id;
}

/** Administrators. Generates the occurrences of the current window at once. */
export async function createRecurring(ctx: TaskContext, input: RecurringInput): Promise<RecurringTask> {
  const id = await insertRecurring(ctx, input);
  await ensureOccurrences(ctx, defaultWindow(ctx.today), { recurringTaskIds: [id] });
  return getRecurring(ctx, id);
}

/**
 * Administrators. Replaces every field; the open occurrences from the current competence on follow it
 * (concluded and canceled ones never change; see generation.syncOpenOccurrences).
 */
export async function updateRecurring(ctx: TaskContext, id: string, input: RecurringInput): Promise<RecurringTask> {
  const def = await getDefOrThrow(ctx, id);
  await validate(ctx, input);
  const startCompetence = input.startCompetence ?? def.row.startCompetence;
  if (input.endCompetence && input.endCompetence < startCompetence)
    throw new ValidationError('O encerramento deve ser depois do início');
  await ctx.db
    .update(recurringTasks)
    .set({ ...(await values(ctx, input)), startCompetence })
    .where(and(eq(recurringTasks.workspaceId, ctx.workspaceId), eq(recurringTasks.id, id)));
  await replaceLinks(ctx, id, input);
  await syncOpenOccurrences(ctx, id);
  return getRecurring(ctx, id);
}

/**
 * Administrators. Deleting would erase audit records (Effy cascaded them): refused once an occurrence
 * was worked on (status other than "A fazer", assigned by hand, comments, attachments or subtasks) —
 * set "Encerra em" instead, so it leaves the next competences and the history stays. Otherwise the
 * untouched occurrences go with it.
 */
export async function deleteRecurring(ctx: TaskContext, id: string): Promise<void> {
  await getDefOrThrow(ctx, id);
  const n = await workedOccurrenceCount(ctx, id);
  if (n > 0) {
    throw new ConflictError(
      `Esta tarefa recorrente já tem histórico (${n} ${n === 1 ? 'ocorrência trabalhada' : 'ocorrências trabalhadas'}). Defina "Encerra em" para que ela saia das próximas competências; o histórico fica.`,
      { occurrences: n },
    );
  }
  await deleteSeriesRows(ctx, id);
}

/** GET /tasks/recurring/:id/occurrences/:period: every client of one occurrence (RecurringOccurrenceSheet). */
export async function occurrenceDetail(ctx: TaskContext, id: string, periodKey: string): Promise<RecurringOccurrenceDetail> {
  const def = await getDefOrThrow(ctx, id);
  const competence = competenceOfPeriod(scheduleOf(def.row), periodKey);
  if (inBounds(ctx, competence)) await ensureOccurrences(ctx, [competence], { recurringTaskIds: [id] });
  const where = and(eq(tasks.recurringTaskId, id), eq(tasks.periodKey, periodKey));
  const [[aggregate], rows] = await Promise.all([
    aggregateOccurrences(ctx, where),
    ctx.db
      .select(CELL_COLUMNS)
      .from(tasks)
      .innerJoin(contacts, and(eq(contacts.workspaceId, tasks.workspaceId), eq(contacts.id, tasks.clientId)))
      .where(and(eq(tasks.workspaceId, ctx.workspaceId), where))
      .orderBy(sql`lower(coalesce(${contacts.tradeName}, ${contacts.name}))`, tasks.id),
  ]);
  if (!aggregate) throw new NotFoundError('Esta tarefa recorrente não tem ocorrências neste período');
  const [clients, description] = await Promise.all([
    occurrenceClients(
      ctx,
      rows.map((r) => r.clientId!),
    ),
    decryptTaskText(ctx.cipher, RECURRING_DESCRIPTION, def.row.description),
  ]);
  return {
    ...aggregate,
    description,
    cells: rows.flatMap((r) => {
      const client = clients.get(r.clientId!);
      return client ? [{ ...toOccurrenceCell(ctx, r), client }] : [];
    }),
  };
}

/** Administrators: generates a competence now (from 24 back to 2 ahead of the current one). */
export async function generateOccurrences(ctx: TaskContext, competence: MonthKey): Promise<RecurringGenerateResponse> {
  if (!inBounds(ctx, competence)) {
    const { min, max } = generationBounds(ctx.today);
    throw new ValidationError(`Gere competências de ${min} a ${max}.`);
  }
  return { competence, created: await ensureOccurrences(ctx, [competence]) };
}
