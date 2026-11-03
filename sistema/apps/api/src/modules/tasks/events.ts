// History of a task ("linha do tempo"), written by the services as things happen: created, fields
// changed, assignee changed, status changed, reopened (with the reason), comments and attachments,
// process steps. `data` keeps only structured facts (field names, statuses, member ids and names as
// recorded then); free text (a reason, a file name) is encrypted in `note`. Field-by-field autosave by
// the same person within a few minutes merges into one "updated" entry, so the timeline stays readable.
// Internal to the module (the services call it inside their tenant transaction).

import { and, desc, eq } from 'drizzle-orm';
import type { TaskEventKind, TaskFieldChange, TaskHistoryItem, TaskStatus } from '@effinance/shared';
import { taskEvents, type TaskEventRow } from '../../db/schema';
import { now } from '../../lib/clock';
import { inChunks } from '../../lib/sql';
import type { TaskContext } from './access';
import { decryptTaskText, encryptTaskText, EVENT_NOTE } from './encrypted-text';
import { myName, personRef } from './shared';

export interface EventInput {
  taskId: string;
  kind: TaskEventKind;
  data?: Record<string, unknown>;
  /** Free text (encrypted): a reopening reason, a file name, why an automatic change happened. */
  note?: string | null;
  /** Done by the system (generation, automatic reassignment): no actor. */
  system?: boolean;
}

/** Autosave edits by the same person within this window merge into one "updated" entry. */
const MERGE_WINDOW_MS = 5 * 60_000;

type Ctx = Pick<TaskContext, 'db' | 'workspaceId' | 'userId' | 'members' | 'cipher'>;

export async function recordEvents(ctx: Ctx, events: readonly EventInput[]): Promise<void> {
  if (events.length === 0) return;
  if (events.length === 1 && events[0]!.kind === 'updated' && !events[0]!.system) {
    if (await mergeUpdate(ctx, events[0]!)) return;
  }
  const actorName = myName(ctx);
  const rows = await Promise.all(
    events.map(async (e) => ({
      workspaceId: ctx.workspaceId,
      taskId: e.taskId,
      kind: e.kind,
      actorId: e.system ? null : ctx.userId,
      actorName: e.system ? null : actorName,
      data: e.data ?? {},
      note: e.note ? await encryptTaskText(ctx.cipher, EVENT_NOTE, e.note) : null,
      createdAt: now(),
    })),
  );
  for (const chunk of inChunks(rows, 500)) await ctx.db.insert(taskEvents).values(chunk);
}

export function recordEvent(ctx: Ctx, event: EventInput): Promise<void> {
  return recordEvents(ctx, [event]);
}

/** Folds an "updated" entry into the person's previous one when it is recent. */
async function mergeUpdate(ctx: Ctx, event: EventInput): Promise<boolean> {
  const [last] = await ctx.db
    .select()
    .from(taskEvents)
    .where(and(eq(taskEvents.workspaceId, ctx.workspaceId), eq(taskEvents.taskId, event.taskId)))
    .orderBy(desc(taskEvents.seq))
    .limit(1);
  if (
    !last ||
    last.kind !== 'updated' ||
    last.actorId !== ctx.userId ||
    now().getTime() - last.createdAt.getTime() > MERGE_WINDOW_MS
  ) {
    return false;
  }
  const before = Array.isArray(last.data.fields) ? (last.data.fields as string[]) : [];
  const added = Array.isArray(event.data?.fields) ? (event.data!.fields as string[]) : [];
  const fields = [...new Set([...before, ...added])];
  // Per field, the first "from" and the latest "to"; a field back to where it started drops out.
  const changes = new Map<string, TaskFieldChange>();
  for (const c of changesOf(last.data)) changes.set(c.field, c);
  for (const c of changesOf(event.data ?? {})) {
    const prior = changes.get(c.field);
    changes.set(c.field, prior ? { ...prior, to: c.to } : c);
  }
  const merged = [...changes.values()].filter((c) => c.from !== c.to);
  await ctx.db
    .update(taskEvents)
    .set({ data: { ...last.data, fields, changes: merged }, createdAt: now() })
    .where(and(eq(taskEvents.workspaceId, ctx.workspaceId), eq(taskEvents.id, last.id)));
  return true;
}

/** Up to this many entries per request (newest first); `total` says how many exist. */
export const HISTORY_LIMIT = 500;

function personFrom(value: unknown): { id: string | null; name: string } | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { id?: unknown; name?: unknown };
  return typeof v.name === 'string' ? { id: typeof v.id === 'string' ? v.id : null, name: v.name } : null;
}

const statusOf = (v: unknown) => (typeof v === 'string' ? (v as TaskStatus) : null);

function changesOf(data: Record<string, unknown>): TaskFieldChange[] {
  if (!Array.isArray(data.changes)) return [];
  return (data.changes as unknown[]).flatMap((c) => {
    if (!c || typeof c !== 'object') return [];
    const v = c as { field?: unknown; from?: unknown; to?: unknown };
    if (typeof v.field !== 'string') return [];
    const value = (x: unknown) => (typeof x === 'string' ? x : null);
    return [{ field: v.field as TaskFieldChange['field'], from: value(v.from), to: value(v.to) }];
  });
}

export async function toHistoryItem(ctx: Pick<TaskContext, 'members' | 'cipher'>, row: TaskEventRow): Promise<TaskHistoryItem> {
  const d = row.data;
  const flow = d.flow && typeof d.flow === 'object' ? (d.flow as { id?: unknown; title?: unknown; position?: unknown; event?: unknown }) : null;
  return {
    id: row.id,
    kind: row.kind,
    actor: row.actorName === null && row.actorId === null ? null : personRef(ctx, row.actorId, row.actorName ?? 'Usuário excluído'),
    createdAt: row.createdAt.toISOString(),
    fields: Array.isArray(d.fields) ? (d.fields as string[]) : [],
    changes: changesOf(d),
    fromStatus: statusOf(d.from),
    toStatus: statusOf(d.to),
    fromAssignee: personFrom(d.fromAssignee),
    toAssignee: personFrom(d.toAssignee),
    note: await decryptTaskText(ctx.cipher, EVENT_NOTE, row.note),
    origin: d.origin === 'manual' || d.origin === 'recurring' || d.origin === 'flow' ? d.origin : null,
    originName: typeof d.originName === 'string' ? d.originName : null,
    flow:
      flow && typeof flow.id === 'string' && typeof flow.position === 'number'
        ? {
            id: flow.id,
            title: typeof flow.title === 'string' ? flow.title : '',
            position: flow.position,
            event: flow.event === 'completed' || flow.event === 'deactivated' ? flow.event : 'activated',
          }
        : null,
  };
}
