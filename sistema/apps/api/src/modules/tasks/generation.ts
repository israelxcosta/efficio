// Occurrences of the recurring tasks: one row of `tasks` per recurring task, client and period
// ("Ocorrência conta 1 por cliente"), generated idempotently — the reads of a competence (list, start
// page, audit, calendar, reports) call `ensureOccurrences` first, and the unique constraint
// `tasks_occurrence_uq` with ON CONFLICT DO NOTHING keeps concurrent requests from duplicating a row.
//
// Rules (Effy's obligations, plus the office's "carteira"):
// - a recurring task applies to the active clients of its regimes and/or the clients chosen by hand,
//   minus the exceptions, from its start competence to its end competence;
// - a client is active in a competence when its contract started by then (month of the contract start
//   ≤ competence) and it was not inactivated before the competence began;
// - the responsible is the client's responsible in the recurring task's department, else the default
//   responsible, else nobody (`assignee_source` says which; `manual` = reassigned for that competence
//   only, never overwritten automatically);
// - deadlines come from the schedule (utils/tasks.ts: national holidays, non-business-day rule, target).
// Generation is bounded: from 24 competences back to 2 ahead of the current one, and never for a
// workspace whose subscription does not allow writing (reads keep showing what exists).
// Internal to the module: the services call these inside their tenant transaction.

import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  addMonthKey,
  monthKey,
  occurrencesInCompetence,
  type AssigneeSource,
  type MonthKey,
  type RecurringSchedule,
  type ScheduledOccurrence,
  type TaskStatus,
  type TaxRegime,
} from '@effinance/shared';
import {
  contacts,
  recurringTaskClients,
  recurringTasks,
  taskClientResponsibles,
  taskEvents,
  tasks,
  type RecurringTaskRow,
} from '../../db/schema';
import { now } from '../../lib/clock';
import { inChunks } from '../../lib/sql';
import type { TaskContext } from './access';
import { recordEvents, type EventInput } from './events';
import { OPEN_SQL } from './task-rows';

/** Competences generated on demand: from 24 back to 2 ahead of the current one. */
export const PAST_COMPETENCES = 24;
export const HORIZON_COMPETENCES = 2;

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

export function scheduleOf(row: Pick<RecurringTaskRow, 'period' | 'dueDay' | 'dueMonth' | 'targetDaysBefore' | 'nonBusinessDayRule' | 'referenceOffset'>): RecurringSchedule {
  return {
    period: row.period,
    dueDay: row.dueDay,
    dueMonth: row.dueMonth,
    targetDaysBefore: row.targetDaysBefore,
    nonBusinessDayRule: row.nonBusinessDayRule,
    referenceOffset: row.referenceOffset,
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

export async function loadDefs(ctx: Pick<TaskContext, 'db' | 'workspaceId'>, ids?: readonly string[]): Promise<GenDef[]> {
  if (ids && ids.length === 0) return [];
  const [rows, links] = await Promise.all([
    ctx.db
      .select()
      .from(recurringTasks)
      .where(and(eq(recurringTasks.workspaceId, ctx.workspaceId), ids ? inArray(recurringTasks.id, [...ids]) : undefined))
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
  return rows.map((row) => ({
    row,
    included: new Set(links.filter((l) => l.id === row.id && l.mode === 'include').map((l) => l.clientId)),
    excluded: new Set(links.filter((l) => l.id === row.id && l.mode === 'exclude').map((l) => l.clientId)),
  }));
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

/** `${clientId}:${departmentId}` → responsible member. */
export async function loadResponsibles(ctx: Pick<TaskContext, 'db' | 'workspaceId'>): Promise<Map<string, string>> {
  const rows = await ctx.db
    .select({ clientId: taskClientResponsibles.clientId, departmentId: taskClientResponsibles.departmentId, userId: taskClientResponsibles.userId })
    .from(taskClientResponsibles)
    .where(eq(taskClientResponsibles.workspaceId, ctx.workspaceId));
  return new Map(rows.map((r) => [`${r.clientId}:${r.departmentId}`, r.userId]));
}

/** The client's responsible in the department, else the default responsible, else nobody. */
export function resolveAssignee(
  def: Pick<RecurringTaskRow, 'departmentId' | 'defaultAssigneeId'>,
  clientId: string,
  responsibles: ReadonlyMap<string, string>,
): { assigneeId: string | null; source: AssigneeSource | null } {
  const responsible = def.departmentId ? responsibles.get(`${clientId}:${def.departmentId}`) : undefined;
  if (responsible) return { assigneeId: responsible, source: 'client' };
  if (def.defaultAssigneeId) return { assigneeId: def.defaultAssigneeId, source: 'default' };
  return { assigneeId: null, source: null };
}

export interface DesiredOccurrence {
  def: GenDef;
  client: GenClient;
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
      for (const client of clients) {
        if (!clientActiveIn(client, competence) || !appliesTo(def, client)) continue;
        for (const s of scheduled) out.push({ def, client, scheduled: s });
      }
    }
  }
  return out;
}

const keyOf = (defId: string, clientId: string, periodKey: string) => `${defId}:${clientId}:${periodKey}`;

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
  const defs = (await loadDefs(ctx, opts.recurringTaskIds)).filter((d) => wanted.some((c) => defActiveIn(d.row, c)));
  if (defs.length === 0) return 0;
  const [clients, responsibles, existingRows] = await Promise.all([
    loadClients(ctx),
    loadResponsibles(ctx),
    ctx.db
      .select({ defId: tasks.recurringTaskId, clientId: tasks.clientId, periodKey: tasks.periodKey })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, ctx.workspaceId),
          inArray(
            tasks.recurringTaskId,
            defs.map((d) => d.row.id),
          ),
          inArray(tasks.competence, wanted),
        ),
      ),
  ]);
  const existing = new Set(existingRows.map((r) => keyOf(r.defId!, r.clientId!, r.periodKey!)));
  const missing = desiredOccurrences(defs, clients, wanted).filter(
    (o) => !existing.has(keyOf(o.def.row.id, o.client.id, o.scheduled.periodKey)),
  );
  if (missing.length === 0) return 0;

  let created = 0;
  const createdAt = now();
  for (const chunk of inChunks(missing, 200)) {
    const inserted = await ctx.db
      .insert(tasks)
      .values(
        chunk.map(({ def, client, scheduled: s }) => {
          const { assigneeId, source } = resolveAssignee(def.row, client.id, responsibles);
          return {
            workspaceId: ctx.workspaceId,
            title: def.row.name,
            clientId: client.id,
            categoryId: def.row.categoryId,
            departmentId: def.row.departmentId,
            assigneeId,
            assigneeSource: source,
            priority: 'medium' as const,
            status: 'todo' as const,
            dueDate: s.legalDueDate,
            targetDate: s.targetDate,
            recurringTaskId: def.row.id,
            competence: s.competence,
            periodKey: s.periodKey,
            referenceMonth: s.referenceMonth,
            createdBy: null,
            createdByName: GENERATED_BY,
            createdAt,
          };
        }),
      )
      .onConflictDoNothing({ target: [tasks.workspaceId, tasks.recurringTaskId, tasks.clientId, tasks.periodKey] })
      .returning({ id: tasks.id, title: tasks.title });
    created += inserted.length;
    await recordEvents(
      ctx,
      inserted.map((r): EventInput => ({ taskId: r.id, kind: 'created', data: { origin: 'recurring', originName: r.title }, system: true })),
    );
  }
  return created;
}

type SyncRow = {
  id: string;
  clientId: string | null;
  periodKey: string | null;
  competence: string | null;
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
  const [clients, responsibles, rows] = await Promise.all([
    loadClients(ctx),
    loadResponsibles(ctx),
    ctx.db
      .select({
        id: tasks.id,
        clientId: tasks.clientId,
        periodKey: tasks.periodKey,
        competence: tasks.competence,
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
    const applies = Boolean(scheduled && client && clientActiveIn(client, competence) && appliesTo(def, client));
    if (row.status === 'canceled') {
      if (applies) restorable.push({ row, scheduled: scheduled! });
      continue;
    }
    if (applies) {
      notStarted.push({ row, scheduled: scheduled! });
      continue;
    }
    const note = !defActiveIn(def.row, competence)
      ? 'A tarefa recorrente foi encerrada antes desta competência'
      : client && clientActiveIn(client, competence) && !appliesTo(def, client)
        ? 'A tarefa recorrente deixou de se aplicar a este cliente (exceção ou regime)'
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
    const next = resolveAssignee(def.row, row.clientId!, responsibles);
    if (next.assigneeId === row.assigneeId && next.source === row.assigneeSource) continue;
    const key = `${next.assigneeId ?? ''}|${next.source ?? ''}`;
    changes.set(key, [...(changes.get(key) ?? []), row.id]);
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
 * The responsible of these clients changed in these departments: their open occurrences from the
 * current competence on (of recurring tasks of the department; not those assigned by hand) go to the
 * new responsible, or to the default one when the responsible was removed. Returns how many changed.
 */
export async function reassignClientOccurrences(
  ctx: TaskContext,
  pairs: readonly { clientId: string; departmentId: string }[],
): Promise<number> {
  if (pairs.length === 0) return 0;
  const { current } = generationBounds(ctx.today);
  const wanted = new Set(pairs.map((p) => `${p.clientId}:${p.departmentId}`));
  const clientIds = [...new Set(pairs.map((p) => p.clientId))];
  const departmentIds = [...new Set(pairs.map((p) => p.departmentId))];
  const [responsibles, defs] = await Promise.all([
    loadResponsibles(ctx),
    ctx.db
      .select({ id: recurringTasks.id, departmentId: recurringTasks.departmentId, defaultAssigneeId: recurringTasks.defaultAssigneeId })
      .from(recurringTasks)
      .where(and(eq(recurringTasks.workspaceId, ctx.workspaceId), inArray(recurringTasks.departmentId, departmentIds))),
  ]);
  if (defs.length === 0) return 0;
  const defById = new Map(defs.map((d) => [d.id, d]));
  const rows: { id: string; clientId: string | null; recurringTaskId: string | null; assigneeId: string | null; assigneeSource: AssigneeSource | null }[] = [];
  for (const chunk of inChunks(clientIds)) {
    rows.push(
      ...(await ctx.db
        .select({
          id: tasks.id,
          clientId: tasks.clientId,
          recurringTaskId: tasks.recurringTaskId,
          assigneeId: tasks.assigneeId,
          assigneeSource: tasks.assigneeSource,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.workspaceId, ctx.workspaceId),
            inArray(tasks.clientId, chunk),
            inArray(
              tasks.recurringTaskId,
              defs.map((d) => d.id),
            ),
            gte(tasks.competence, current),
            OPEN_SQL,
            sql`${tasks.assigneeSource} is distinct from 'manual'`,
          ),
        )),
    );
  }
  const changes = new Map<string, string[]>();
  const events: EventInput[] = [];
  for (const row of rows) {
    const def = defById.get(row.recurringTaskId!)!;
    if (!wanted.has(`${row.clientId}:${def.departmentId}`)) continue;
    const next = resolveAssignee(def, row.clientId!, responsibles);
    if (next.assigneeId === row.assigneeId && next.source === row.assigneeSource) continue;
    const key = `${next.assigneeId ?? ''}|${next.source ?? ''}`;
    changes.set(key, [...(changes.get(key) ?? []), row.id]);
    if (next.assigneeId !== row.assigneeId) {
      events.push({
        taskId: row.id,
        kind: 'assigned',
        data: { fromAssignee: memberName(ctx, row.assigneeId), toAssignee: memberName(ctx, next.assigneeId) },
        note: 'Responsável do cliente no departamento alterado',
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
  await recordEvents(ctx, events);
  // Occurrences that changed hands (a change of source alone, e.g. client → default, is not counted).
  return events.length;
}
