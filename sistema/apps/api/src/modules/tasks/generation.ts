// Occurrences of the recurring tasks: one row of `tasks` per recurring task, client and period
// ("Ocorrência conta 1 por cliente"), generated idempotently — the reads of a competence (list, start
// page, audit, calendar, reports) call `ensureOccurrences` first, and the unique constraint
// `tasks_occurrence_uq` with ON CONFLICT DO NOTHING keeps concurrent requests from duplicating a row.
//
// Rules (Effy's obligations):
// - a recurring task applies to the active clients of its regimes and/or the clients chosen by hand,
//   minus the exceptions, from its start competence to its end competence;
// - a client is active in a competence when its contract started by then (month of the contract start
//   ≤ competence) and it was not inactivated before the competence began;
// - the responsible is the recurring task's default responsible, else nobody — the occurrence waits in
//   the department's queue (`assignee_source` says which; `manual` = reassigned for that competence
//   only, never overwritten automatically). The responsible per client and department was removed (0017);
// - deadlines come from the schedule (utils/tasks.ts: national holidays, non-business-day rule, target).
// Generation is bounded: from 24 competences back to 2 ahead of the current one, and never for a
// workspace whose subscription does not allow writing (reads keep showing what exists).
// Tasks' recurrences (origin `task`, migration 0019) run on the same engine: one client (an `include`
// link) or none (`internal`: one occurrence per period, client null); their occurrences carry
// `occurrence_origin = 'task'`, the series' priority, time and description, and the rule's dates
// (`start_date`/`end_date`, daily, weekdays, every N) come from the shared schedule.
// Marker (migration 0018): each recurring task × competence generated is recorded with the workspace's
// generation version (bumped by database triggers when a recurring task, its client links or a client's
// regime/contract/status change) and the rules version of this code; the next reads skip those pairs, so
// a read does not recompute the window every time. The version is read before the data it guards: a
// change committed meanwhile leaves the mark stale (regenerated later), never a fresh mark over old data.
// Internal to the module: the services call these inside their tenant transaction.

import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  addMonthKey,
  monthKey,
  occurrencesInCompetence,
  type AssigneeSource,
  type MonthKey,
  type RecurrenceOrigin,
  type RecurringSchedule,
  type ScheduledOccurrence,
  type TaskStatus,
  type TaxRegime,
} from '@effinance/shared';
import {
  contacts,
  recurringTaskClients,
  recurringTasks,
  taskEvents,
  taskGenerationMarks,
  taskGenerationState,
  tasks,
  type RecurringTaskRow,
} from '../../db/schema';
import { now } from '../../lib/clock';
import { appendTo, groupBy } from '../../lib/collections';
import { inChunks } from '../../lib/sql';
import type { TaskContext } from './access';
import { decryptTaskText, encryptTaskText, RECURRING_DESCRIPTION, TASK_DESCRIPTION } from './encrypted-text';
import { recordEvents, type EventInput } from './events';
import { OPEN_SQL } from './task-rows';

/** Competences generated on demand: from 24 back to 2 ahead of the current one. */
export const PAST_COMPETENCES = 24;
export const HORIZON_COMPETENCES = 2;

/**
 * Version of the generation rules of this code (schedule, holidays, who applies). Bump it when a change
 * here alters which occurrences a competence should have: the marks of the old rules stop counting.
 */
export const GENERATION_RULES = 1;

/** Recorded as the author of generated occurrences (there is no person behind them). */
export const GENERATED_BY = 'Tarefa recorrente';

export function generationBounds(today: string): { current: MonthKey; min: MonthKey; max: MonthKey } {
  const current = monthKey(today);
  return { current, min: addMonthKey(current, -PAST_COMPETENCES), max: addMonthKey(current, HORIZON_COMPETENCES) };
}

/** The window the lists and the start page keep generated: two competences back and two ahead. */
export function defaultWindow(today: string): MonthKey[] {
  const current = monthKey(today);
  return [-2, -1, 0, 1, 2].map((n) => addMonthKey(current, n));
}

export interface GenDef {
  row: RecurringTaskRow;
  included: Set<string>;
  excluded: Set<string>;
}

export interface GenClient {
  id: string;
  name: string;
  tradeName: string | null;
  taxRegime: TaxRegime | null;
  status: 'active' | 'inactive';
  contractStartDate: string | null;
  inactivatedAt: string | null;
}

export type ScheduleColumns = Pick<
  RecurringTaskRow,
  'period' | 'dueDay' | 'dueMonth' | 'targetDaysBefore' | 'nonBusinessDayRule' | 'referenceOffset' | 'repeatInterval' | 'weekdays' | 'startDate' | 'endDate'
>;

export function scheduleOf(row: ScheduleColumns): RecurringSchedule {
  return {
    period: row.period,
    dueDay: row.dueDay,
    dueMonth: row.dueMonth,
    targetDaysBefore: row.targetDaysBefore,
    nonBusinessDayRule: row.nonBusinessDayRule,
    referenceOffset: row.referenceOffset,
    interval: row.repeatInterval,
    weekdays: row.weekdays,
    startDate: row.startDate,
    endDate: row.endDate,
  };
}

/** A client of the office in the competence: contract started by then, not inactivated before it began. */
export function clientActiveIn(client: GenClient, competence: MonthKey): boolean {
  if (!client.contractStartDate || monthKey(client.contractStartDate) > competence) return false;
  return client.status === 'active' || (client.inactivatedAt !== null && client.inactivatedAt >= `${competence}-01`);
}

export function appliesTo(def: GenDef, client: GenClient): boolean {
  if (def.excluded.has(client.id)) return false;
  return def.included.has(client.id) || (client.taxRegime !== null && def.row.regimes.includes(client.taxRegime));
}

export function defActiveIn(row: Pick<RecurringTaskRow, 'startCompetence' | 'endCompetence'>, competence: MonthKey): boolean {
  return row.startCompetence <= competence && (row.endCompetence === null || competence <= row.endCompetence);
}

/** Recurring tasks with their client links (all, or these ids; `origin`: only the registry's or the tasks'). */
export async function loadDefs(
  ctx: Pick<TaskContext, 'db' | 'workspaceId'>,
  ids?: readonly string[],
  opts: { origin?: RecurrenceOrigin } = {},
): Promise<GenDef[]> {
  if (ids && ids.length === 0) return [];
  const [rows, links] = await Promise.all([
    ctx.db
      .select()
      .from(recurringTasks)
      .where(
        and(
          eq(recurringTasks.workspaceId, ctx.workspaceId),
          ids ? inArray(recurringTasks.id, [...ids]) : undefined,
          opts.origin ? eq(recurringTasks.origin, opts.origin) : undefined,
        ),
      )
      .orderBy(sql`lower(${recurringTasks.name})`, asc(recurringTasks.id)),
    ctx.db
      .select({ id: recurringTaskClients.recurringTaskId, clientId: recurringTaskClients.clientId, mode: recurringTaskClients.mode })
      .from(recurringTaskClients)
      .where(
        and(
          eq(recurringTaskClients.workspaceId, ctx.workspaceId),
          ids ? inArray(recurringTaskClients.recurringTaskId, [...ids]) : undefined,
        ),
      ),
  ]);
  // Grouped once (a filter per recurring task would be recurring tasks × links on every read).
  const byDef = groupBy(links, (l) => l.id);
  return rows.map((row) => {
    const own = byDef.get(row.id) ?? [];
    return {
      row,
      included: new Set(own.filter((l) => l.mode === 'include').map((l) => l.clientId)),
      excluded: new Set(own.filter((l) => l.mode === 'exclude').map((l) => l.clientId)),
    };
  });
}

export async function loadClients(ctx: Pick<TaskContext, 'db' | 'workspaceId'>): Promise<GenClient[]> {
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
  return rows as GenClient[];
}

/** The default responsible of the recurring task, else nobody (the department's queue). */
export function resolveAssignee(
  def: Pick<RecurringTaskRow, 'defaultAssigneeId'>,
): { assigneeId: string | null; source: AssigneeSource | null } {
  if (def.defaultAssigneeId) return { assigneeId: def.defaultAssigneeId, source: 'default' };
  return { assigneeId: null, source: null };
}

export interface DesiredOccurrence {
  def: GenDef;
  /** null: an internal occurrence (a task's recurrence without client). */
  client: GenClient | null;
  scheduled: ScheduledOccurrence;
}

/** What should exist in these competences (pure). */
export function desiredOccurrences(defs: readonly GenDef[], clients: readonly GenClient[], competences: readonly MonthKey[]): DesiredOccurrence[] {
  const out: DesiredOccurrence[] = [];
  for (const competence of competences) {
    for (const def of defs) {
      if (!defActiveIn(def.row, competence)) continue;
      const scheduled = occurrencesInCompetence(scheduleOf(def.row), competence);
      if (scheduled.length === 0) continue;
      if (def.row.internal) {
        for (const s of scheduled) out.push({ def, client: null, scheduled: s });
        continue;
      }
      for (const client of clients) {
        if (!clientActiveIn(client, competence) || !appliesTo(def, client)) continue;
        for (const s of scheduled) out.push({ def, client, scheduled: s });
      }
    }
  }
  return out;
}

const keyOf = (defId: string, clientId: string | null, periodKey: string) => `${defId}:${clientId ?? ''}:${periodKey}`;

/**
 * The description each occurrence of a task's recurrence starts with (the series', re-encrypted for
 * `tasks.description`); null for the registry's (its description lives on the recurring task).
 */
export async function occurrenceDescriptions(
  ctx: Pick<TaskContext, 'cipher'>,
  defs: readonly GenDef[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const def of defs) {
    if (def.row.origin !== 'task' || def.row.description === null) continue;
    const text = await decryptTaskText(ctx.cipher, RECURRING_DESCRIPTION, def.row.description);
    out.set(def.row.id, await encryptTaskText(ctx.cipher, TASK_DESCRIPTION, text));
  }
  return out;
}

/**
 * Generates the missing occurrences of these competences (all recurring tasks, or the given ones).
 * Idempotent; returns how many were created.
 */
export async function ensureOccurrences(
  ctx: TaskContext,
  competences: readonly MonthKey[],
  opts: { recurringTaskIds?: readonly string[] } = {},
): Promise<number> {
  if (!ctx.canWrite) return 0;
  const { min, max } = generationBounds(ctx.today);
  const wanted = [...new Set(competences)].filter((c) => c >= min && c <= max).sort();
  if (wanted.length === 0) return 0;
  // The version first: anything committed after this read makes the marks written below stale.
  const version = await generationVersion(ctx);
  const defs = (await loadDefs(ctx, opts.recurringTaskIds)).filter((d) => wanted.some((c) => defActiveIn(d.row, c)));
  if (defs.length === 0) return 0;
  const marked = await currentMarks(ctx, wanted, version);
  // Pairs (recurring task × competence) that have periods and no current mark.
  const pending = new Map<MonthKey, GenDef[]>();
  for (const competence of wanted) {
    for (const def of defs) {
      if (!defActiveIn(def.row, competence) || marked.has(`${def.row.id}:${competence}`)) continue;
      if (occurrencesInCompetence(scheduleOf(def.row), competence).length === 0) continue;
      appendTo(pending, competence, def);
    }
  }
  if (pending.size === 0) return 0;
  const pendingDefIds = [...new Set([...pending.values()].flat().map((d) => d.row.id))];
  const [clients, existingRows] = await Promise.all([
    loadClients(ctx),
    ctx.db
      .select({ defId: tasks.recurringTaskId, clientId: tasks.clientId, periodKey: tasks.periodKey })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, ctx.workspaceId),
          inArray(tasks.recurringTaskId, pendingDefIds),
          inArray(tasks.competence, [...pending.keys()]),
        ),
      ),
  ]);
  const existing = new Set(existingRows.map((r) => keyOf(r.defId!, r.clientId, r.periodKey!)));
  const missing = [...pending].flatMap(([competence, list]) =>
    desiredOccurrences(list, clients, [competence]).filter((o) => !existing.has(keyOf(o.def.row.id, o.client?.id ?? null, o.scheduled.periodKey))),
  );
  if (missing.length === 0) {
    await writeMarks(ctx, [...pending].flatMap(([competence, list]) => list.map((d) => ({ recurringTaskId: d.row.id, competence }))), version);
    return 0;
  }
  const descriptions = await occurrenceDescriptions(ctx, [...new Set(missing.map((m) => m.def))]);

  let created = 0;
  const createdAt = now();
  for (const chunk of inChunks(missing, 200)) {
    const inserted = await ctx.db
      .insert(tasks)
      .values(
        chunk.map(({ def, client, scheduled: s }) => {
          const { assigneeId, source } = resolveAssignee(def.row);
          return {
            workspaceId: ctx.workspaceId,
            title: def.row.name,
            description: descriptions.get(def.row.id) ?? null,
            clientId: client?.id ?? null,
            categoryId: def.row.categoryId,
            departmentId: def.row.departmentId,
            assigneeId,
            assigneeSource: source,
            priority: def.row.priority,
            status: 'todo' as const,
            dueDate: s.legalDueDate,
            startTime: def.row.startTime,
            endTime: def.row.endTime,
            targetDate: s.targetDate,
            recurringTaskId: def.row.id,
            occurrenceOrigin: def.row.origin,
            competence: s.competence,
            periodKey: s.periodKey,
            referenceMonth: s.referenceMonth,
            createdBy: null,
            createdByName: GENERATED_BY,
            createdAt,
          };
        }),
      )
      // Any unique conflict means the occurrence exists: `tasks_occurrence_uq` (with client) or
      // `tasks_internal_occurrence_uq` (internal, migration 0019).
      .onConflictDoNothing()
      .returning({ id: tasks.id, title: tasks.title });
    created += inserted.length;
    await recordEvents(
      ctx,
      inserted.map((r): EventInput => ({ taskId: r.id, kind: 'created', data: { origin: 'recurring', originName: r.title }, system: true })),
    );
  }
  await writeMarks(
    ctx,
    [...pending].flatMap(([competence, list]) => list.map((d) => ({ recurringTaskId: d.row.id, competence }))),
    version,
  );
  return created;
}

/** The workspace's generation version (0 before the first change was ever recorded). */
async function generationVersion(ctx: Pick<TaskContext, 'db' | 'workspaceId'>): Promise<number> {
  const [row] = await ctx.db
    .select({ version: taskGenerationState.version })
    .from(taskGenerationState)
    .where(eq(taskGenerationState.workspaceId, ctx.workspaceId));
  return row?.version ?? 0;
}

/** `${recurringTaskId}:${competence}` of the marks computed with this version and these rules. */
async function currentMarks(ctx: Pick<TaskContext, 'db' | 'workspaceId'>, competences: MonthKey[], version: number): Promise<Set<string>> {
  const rows = await ctx.db
    .select({ id: taskGenerationMarks.recurringTaskId, competence: taskGenerationMarks.competence })
    .from(taskGenerationMarks)
    .where(
      and(
        eq(taskGenerationMarks.workspaceId, ctx.workspaceId),
        inArray(taskGenerationMarks.competence, competences),
        eq(taskGenerationMarks.version, version),
        eq(taskGenerationMarks.rules, GENERATION_RULES),
      ),
    );
  return new Set(rows.map((r) => `${r.id}:${r.competence}`));
}

/** Records the pairs as generated with `version` (a newer mark is never overwritten by an older one). */
async function writeMarks(
  ctx: Pick<TaskContext, 'db' | 'workspaceId'>,
  pairs: { recurringTaskId: string; competence: MonthKey }[],
  version: number,
): Promise<void> {
  for (const chunk of inChunks(pairs, 500)) {
    await ctx.db
      .insert(taskGenerationMarks)
      .values(chunk.map((p) => ({ workspaceId: ctx.workspaceId, ...p, version, rules: GENERATION_RULES })))
      .onConflictDoUpdate({
        target: [taskGenerationMarks.workspaceId, taskGenerationMarks.recurringTaskId, taskGenerationMarks.competence],
        set: { version, rules: GENERATION_RULES, generatedAt: sql`now()` },
        setWhere: sql`${taskGenerationMarks.version} <= ${version}`,
      });
  }
}

type SyncRow = {
  id: string;
  clientId: string | null;
  periodKey: string | null;
  competence: string | null;
  dueDate: string | null;
  status: TaskStatus;
  assigneeId: string | null;
  assigneeSource: AssigneeSource | null;
};

const memberName = (ctx: Pick<TaskContext, 'members'>, id: string | null) => {
  const m = id ? ctx.members.get(id) : undefined;
  return m ? { id: m.id, name: m.name } : null;
};

/** Canceled occurrences whose last status change was the system's (a sync), which a sync may undo. */
async function canceledBySystem(ctx: Pick<TaskContext, 'db' | 'workspaceId'>, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const chunk of inChunks(ids)) {
    const rows = await ctx.db
      .select({ taskId: taskEvents.taskId, actorId: taskEvents.actorId, data: taskEvents.data, seq: taskEvents.seq })
      .from(taskEvents)
      .where(
        and(
          eq(taskEvents.workspaceId, ctx.workspaceId),
          inArray(taskEvents.taskId, chunk),
          inArray(taskEvents.kind, ['status', 'reopened']),
        ),
      )
      .orderBy(desc(taskEvents.seq));
    const seen = new Set<string>();
    for (const r of rows) {
      if (seen.has(r.taskId)) continue;
      seen.add(r.taskId);
      if (r.actorId === null && r.data.to === 'canceled' && r.data.system === 'sync') out.add(r.taskId);
    }
  }
  return out;
}

/**
 * After a recurring task is edited (or ended), from the current competence on:
 * - occurrences not started yet ("A fazer") follow the registry: name, department, category, recomputed
 *   deadlines and reference month, and the responsible — unless it was reassigned by hand for that
 *   competence;
 * - those that no longer apply (the client entered the exceptions or left the regimes, the recurring
 *   task ended, the period no longer exists) are canceled, with the reason in their history;
 * - occurrences in progress (in progress, waiting for the client) and concluded ones never change;
 * - an occurrence the system canceled that applies again goes back to "A fazer";
 * - the missing ones are generated.
 */
export async function syncOpenOccurrences(ctx: TaskContext, recurringTaskId: string): Promise<void> {
  const [def] = await loadDefs(ctx, [recurringTaskId]);
  if (!def) return;
  const { current } = generationBounds(ctx.today);
  const [clients, rows] = await Promise.all([
    loadClients(ctx),
    ctx.db
      .select({
        id: tasks.id,
        clientId: tasks.clientId,
        periodKey: tasks.periodKey,
        competence: tasks.competence,
        dueDate: tasks.dueDate,
        status: tasks.status,
        assigneeId: tasks.assigneeId,
        assigneeSource: tasks.assigneeSource,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, ctx.workspaceId),
          eq(tasks.recurringTaskId, recurringTaskId),
          gte(tasks.competence, current),
          inArray(tasks.status, ['todo', 'canceled']),
        ),
      ),
  ]);
  const forTask = def.row.origin === 'task';
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const schedule = scheduleOf(def.row);
  // The periods each competence has now (none when the competence left the recurring task's window).
  const scheduledByCompetence = new Map<string, Map<string, ScheduledOccurrence>>();
  for (const competence of new Set(rows.map((r) => r.competence!))) {
    const list = defActiveIn(def.row, competence) ? occurrencesInCompetence(schedule, competence) : [];
    scheduledByCompetence.set(competence, new Map(list.map((x) => [x.periodKey, x])));
  }
  const notStarted: { row: SyncRow; scheduled: ScheduledOccurrence }[] = [];
  const stale: { row: SyncRow; note: string }[] = [];
  const restorable: { row: SyncRow; scheduled: ScheduledOccurrence }[] = [];
  for (const row of rows as SyncRow[]) {
    const competence = row.competence!;
    const scheduled = scheduledByCompetence.get(competence)?.get(row.periodKey!);
    const client = row.clientId ? clientById.get(row.clientId) : undefined;
    // Internal occurrences (a task's recurrence without client) apply while their period exists.
    const applies = def.row.internal
      ? Boolean(scheduled) && row.clientId === null
      : Boolean(scheduled && client && clientActiveIn(client, competence) && appliesTo(def, client));
    if (row.status === 'canceled') {
      if (applies) restorable.push({ row, scheduled: scheduled! });
      continue;
    }
    if (applies) {
      notStarted.push({ row, scheduled: scheduled! });
      continue;
    }
    const endedByDate = def.row.endDate !== null && row.dueDate !== null && row.dueDate > def.row.endDate;
    const note = !defActiveIn(def.row, competence)
      ? 'A tarefa recorrente foi encerrada antes desta competência'
      : endedByDate
        ? 'A recorrência foi encerrada antes desta data'
        : !def.row.internal && client && clientActiveIn(client, competence) && !appliesTo(def, client)
          ? forTask
            ? 'A recorrência passou para outro cliente'
            : 'A tarefa recorrente deixou de se aplicar a este cliente (exceção ou regime)'
          : 'A tarefa recorrente mudou e esta ocorrência deixou de existir';
    stale.push({ row, note });
  }
  const systemCanceled = await canceledBySystem(
    ctx,
    restorable.map((r) => r.row.id),
  );
  const restore = restorable.filter((r) => systemCanceled.has(r.row.id));
  const follow = [...notStarted, ...restore];

  // Registry fields and deadlines: one statement per period.
  const periods = new Map<string, { scheduled: ScheduledOccurrence; ids: string[] }>();
  for (const { row, scheduled } of follow) {
    const entry = periods.get(scheduled.periodKey) ?? { scheduled, ids: [] };
    entry.ids.push(row.id);
    periods.set(scheduled.periodKey, entry);
  }
  // A task's recurrence also hands down its priority, time and description (the registry's occurrences
  // keep theirs: those are per occurrence there).
  const seriesFields = forTask
    ? {
        priority: def.row.priority,
        startTime: def.row.startTime,
        endTime: def.row.endTime,
        description: (await occurrenceDescriptions(ctx, [def])).get(def.row.id) ?? null,
      }
    : {};
  for (const { scheduled, ids } of periods.values()) {
    for (const chunk of inChunks(ids)) {
      await ctx.db
        .update(tasks)
        .set({
          title: def.row.name,
          departmentId: def.row.departmentId,
          categoryId: def.row.categoryId,
          dueDate: scheduled.legalDueDate,
          targetDate: scheduled.targetDate,
          referenceMonth: scheduled.referenceMonth,
          ...seriesFields,
        })
        .where(and(eq(tasks.workspaceId, ctx.workspaceId), inArray(tasks.id, chunk)));
    }
  }

  const events: EventInput[] = [];
  // Back to "A fazer" what the system had canceled and applies again.
  if (restore.length > 0) {
    for (const chunk of inChunks(restore.map((r) => r.row.id))) {
      await ctx.db
        .update(tasks)
        .set({ status: 'todo', reopenStatus: null })
        .where(and(eq(tasks.workspaceId, ctx.workspaceId), inArray(tasks.id, chunk)));
    }
    for (const { row } of restore) {
      events.push({ taskId: row.id, kind: 'reopened', data: { from: 'canceled', to: 'todo', system: 'sync' }, note: 'A tarefa recorrente voltou a se aplicar', system: true });
    }
  }

  // Responsible (unless assigned by hand for that competence).
  const changes = new Map<string, string[]>();
  for (const { row } of follow) {
    if (row.assigneeSource === 'manual') continue;
    const next = resolveAssignee(def.row);
    if (next.assigneeId === row.assigneeId && next.source === row.assigneeSource) continue;
    const key = `${next.assigneeId ?? ''}|${next.source ?? ''}`;
    appendTo(changes, key, row.id);
    if (next.assigneeId !== row.assigneeId) {
      events.push({
        taskId: row.id,
        kind: 'assigned',
        data: { fromAssignee: memberName(ctx, row.assigneeId), toAssignee: memberName(ctx, next.assigneeId) },
        note: 'A tarefa recorrente foi alterada',
        system: true,
      });
    }
  }
  for (const [key, ids] of changes) {
    const [assigneeId, source] = key.split('|');
    for (const chunk of inChunks(ids)) {
      await ctx.db
        .update(tasks)
        .set({ assigneeId: assigneeId || null, assigneeSource: (source || null) as AssigneeSource | null })
        .where(and(eq(tasks.workspaceId, ctx.workspaceId), inArray(tasks.id, chunk)));
    }
  }

  // What no longer applies and was not started: canceled, with the reason.
  for (const chunk of inChunks(stale, 500)) {
    await ctx.db
      .update(tasks)
      .set({ status: 'canceled', reopenStatus: 'todo' })
      .where(and(eq(tasks.workspaceId, ctx.workspaceId), inArray(tasks.id, chunk.map((r) => r.row.id))));
    for (const { row, note } of chunk) {
      events.push({ taskId: row.id, kind: 'status', data: { from: 'todo', to: 'canceled', system: 'sync' }, note, system: true });
    }
  }
  await recordEvents(ctx, events);
  await ensureOccurrences(ctx, [0, 1, 2].map((n) => addMonthKey(current, n)), { recurringTaskIds: [recurringTaskId] });
}

/**
 * Occurrences of a recurring task someone worked on: status other than "A fazer", assigned by hand,
 * with comments, attachments or subtasks. Deleting the recurring task would erase them (refused).
 */
export async function workedOccurrenceCount(ctx: Pick<TaskContext, 'db' | 'workspaceId'>, recurringTaskId: string): Promise<number> {
  const [worked] = await ctx.db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, ctx.workspaceId),
        eq(tasks.recurringTaskId, recurringTaskId),
        sql`(${tasks.status} <> 'todo' or ${tasks.assigneeSource} = 'manual'
          or exists (select 1 from task_comments c where c.workspace_id = tasks.workspace_id and c.task_id = tasks.id)
          or exists (select 1 from task_attachments a where a.workspace_id = tasks.workspace_id and a.task_id = tasks.id)
          or exists (select 1 from task_subtasks s where s.workspace_id = tasks.workspace_id and s.task_id = tasks.id))`,
      ),
    );
  return worked?.n ?? 0;
}

/** Removes a recurring task with its (untouched) occurrences; links and marks go by cascade. */
export async function deleteSeriesRows(ctx: Pick<TaskContext, 'db' | 'workspaceId'>, recurringTaskId: string): Promise<void> {
  await ctx.db.delete(tasks).where(and(eq(tasks.workspaceId, ctx.workspaceId), eq(tasks.recurringTaskId, recurringTaskId)));
  await ctx.db.delete(recurringTasks).where(and(eq(recurringTasks.workspaceId, ctx.workspaceId), eq(recurringTasks.id, recurringTaskId)));
}
