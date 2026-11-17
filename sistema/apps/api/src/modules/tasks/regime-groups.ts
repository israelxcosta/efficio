// Default groups of recurring tasks per tax regime (catalog in packages/shared, `regime-groups.ts`).
// Listing shows, per regime, the catalog items with what the office already has, the recurring tasks
// that apply to the regime and how many active clients it has (every member reads). Applying
// (`registry`) creates the missing items as recurring tasks of the regime — found again by their catalog
// key, so applying twice changes nothing — and a common obligation that already exists for another
// regime gains this one (one recurring task with several regimes, as in Effy). The recurring tasks then
// generate every month for every active client of the regime: a new client joins on its own. An item
// whose name matches an active recurring task made by hand for the regime is skipped unless forced (the
// office may have created "DAS-MEI" by hand before the catalog).
//
// The office edits its groups (`registry`): a catalog item can be removed from a regime's group
// (`regime_group_exclusions`, migration 0023 — listed apart, not counted as missing, never recreated by
// applying; restoring deletes the row and the item is "missing" again) and the group gains its own tasks:
// recurring tasks of the registry that include the regime (created with POST /tasks/recurring, or an
// existing one included here). Including/excluding changes the recurring task's `regimes` and re-syncs
// its open occurrences like an edit (`syncOpenOccurrences`): from the current competence on, the "A
// fazer" ones of the regime's clients are canceled or generated; in progress/concluded never change.
// A recurring task left without regimes nor chosen clients is ended ("Encerra em" = current competence).

import { and, eq } from 'drizzle-orm';
import {
  addMonthKey,
  matchSuggestedDepartment,
  monthKey,
  occurrencesInCompetence,
  normalizeRecurringName,
  recurringMonths,
  recurringTaskInputSchema,
  REGIME_GROUP_REGIMES,
  regimeGroupItems,
  SUGGESTED_DEPARTMENT_NAMES,
  TAX_REGIME_LABELS,
  taskDepartmentInputSchema,
  type RecurrencePeriod,
  type regimeGroupApplySchema,
  type RegimeGroupApplyResponse,
  type RegimeGroupChange,
  type RegimeGroupChangeResponse,
  type regimeGroupExcludeSchema,
  type RegimeGroupExcludedItem,
  type regimeGroupIncludeSchema,
  type RegimeGroupOwnTask,
  type regimeGroupRestoreSchema,
  type MonthKey,
  type NonBusinessDayRule,
  type ISODate,
  type RegimeGroupItem,
  type RegimeGroupItemState,
  type RegimeGroupRecurringRef,
  type RegimeGroupRegime,
  type RegimeGroupsResponse,
  type SuggestedDepartment,
  type TaskRef,
} from '@effinance/shared';
import type { z } from 'zod';
import { recurringTasks, regimeGroupExclusions } from '../../db/schema';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import type { TaskContext } from './access';
import { clientActiveIn, defaultWindow, ensureOccurrences, loadClients, loadDefs, syncOpenOccurrences, type GenDef } from './generation';
import { insertRecurring } from './recurring';
import { createDepartment } from './registry';
import { departmentNames, getDepartmentOrThrow } from './shared';

type ApplyInput = z.output<typeof regimeGroupApplySchema>;
type IncludeInput = z.output<typeof regimeGroupIncludeSchema>;
type ExcludeInput = z.output<typeof regimeGroupExcludeSchema>;
type RestoreInput = z.output<typeof regimeGroupRestoreSchema>;

/** Audit trail actions (labels in apps/web/src/features/settings/audit-labels.ts). */
export const REGIME_GROUP_INCLUDED_ACTION = 'regime_group.included';
export const REGIME_GROUP_EXCLUDED_ACTION = 'regime_group.excluded';
export const REGIME_GROUP_RESTORED_ACTION = 'regime_group.restored';

const isActive = (def: GenDef, current: string) => def.row.endCompetence === null || def.row.endCompetence >= current;

function recurringRef(def: GenDef, departments: Map<string, string>, current: string): RegimeGroupRecurringRef {
  const departmentName = def.row.departmentId ? departments.get(def.row.departmentId) : undefined;
  return {
    id: def.row.id,
    name: def.row.name,
    // Registry rows only (`loadDefs(…, { origin: 'registry' })`): never `daily` (recurring_tasks_origin_chk).
    period: def.row.period as RecurrencePeriod,
    department: def.row.departmentId && departmentName ? { id: def.row.departmentId, name: departmentName } : null,
    active: isActive(def, current),
    regimes: def.row.regimes,
    catalogKey: def.row.catalogKey,
  };
}

function ownTask(def: GenDef, departments: Map<string, string>, current: string): RegimeGroupOwnTask {
  return {
    ...recurringRef(def, departments, current),
    dueDay: def.row.dueDay,
    dueMonth: def.row.dueMonth,
    months: recurringMonths(def.row),
    targetDaysBefore: def.row.targetDaysBefore,
    // Registry rows only: never `skip` (recurring_tasks_origin_chk).
    nonBusinessDayRule: def.row.nonBusinessDayRule as NonBusinessDayRule,
  };
}

/** Catalog items removed by the office: regime → key → when. */
async function loadExclusions(ctx: TaskContext): Promise<Map<RegimeGroupRegime, Map<string, Date>>> {
  const rows = await ctx.db
    .select({ regime: regimeGroupExclusions.regime, key: regimeGroupExclusions.catalogKey, at: regimeGroupExclusions.createdAt })
    .from(regimeGroupExclusions)
    .where(eq(regimeGroupExclusions.workspaceId, ctx.workspaceId));
  const out = new Map<RegimeGroupRegime, Map<string, Date>>();
  for (const r of rows) {
    const byKey = out.get(r.regime) ?? new Map<string, Date>();
    byKey.set(r.key, r.at);
    out.set(r.regime, byKey);
  }
  return out;
}

/** Active recurring tasks made by hand (no catalog key) of the regime, by normalized name. */
function handmadeByName(defs: GenDef[], regime: RegimeGroupRegime, current: string): Map<string, GenDef> {
  const out = new Map<string, GenDef>();
  for (const def of defs) {
    if (def.row.catalogKey || !isActive(def, current) || !def.row.regimes.includes(regime)) continue;
    const key = normalizeRecurringName(def.row.name);
    if (!out.has(key)) out.set(key, def);
  }
  return out;
}

/**
 * Occurrences per client of the item in the current competence whose legal deadline is before today:
 * applying it from the current month creates them already overdue (QA #4).
 */
function currentOverdue(item: RegimeGroupItem, today: ISODate): number {
  const schedule = {
    period: item.period,
    dueDay: item.dueDay,
    dueMonth: item.dueMonth,
    targetDaysBefore: item.targetDaysBefore,
    nonBusinessDayRule: item.nonBusinessDayRule,
    referenceOffset: item.referenceOffset,
  };
  return occurrencesInCompetence(schedule, monthKey(today)).filter((o) => o.legalDueDate < today).length;
}

/** The office's department for each suggested one (first by name), when its name matches. */
function matchedDepartments(departments: Map<string, string>): Map<SuggestedDepartment, TaskRef> {
  const out = new Map<SuggestedDepartment, TaskRef>();
  const byName = [...departments].sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR'));
  for (const [id, name] of byName) {
    const key = matchSuggestedDepartment(name);
    if (key && !out.has(key)) out.set(key, { id, name });
  }
  return out;
}

/** GET /tasks/regime-groups (every member). */
export async function listRegimeGroups(ctx: TaskContext): Promise<RegimeGroupsResponse> {
  const current = monthKey(ctx.today);
  const [defs, clients, departments, exclusions] = await Promise.all([
    loadDefs(ctx, undefined, { origin: 'registry' }),
    loadClients(ctx),
    departmentNames(ctx.db, ctx.workspaceId),
    loadExclusions(ctx),
  ]);
  const matched = matchedDepartments(departments);
  const byKey = new Map(defs.filter((d) => d.row.catalogKey).map((d) => [d.row.catalogKey!, d]));
  const groups = REGIME_GROUP_REGIMES.map((regime) => {
    const handmade = handmadeByName(defs, regime, current);
    const removed = exclusions.get(regime) ?? new Map<string, Date>();
    const catalog = regimeGroupItems(regime);
    const groupKeys = new Set(catalog.map((i) => i.key));
    const excluded: RegimeGroupExcludedItem[] = catalog
      .filter((item) => removed.has(item.key))
      .map((item) => {
        const def = byKey.get(item.key);
        return {
          key: item.key,
          name: item.name,
          description: item.description,
          period: item.period,
          dueDay: item.dueDay,
          dueMonth: item.dueMonth,
          months: recurringMonths(item),
          department: { key: item.department, name: SUGGESTED_DEPARTMENT_NAMES[item.department] },
          recurringTask: def ? recurringRef(def, departments, current) : null,
          excludedAt: removed.get(item.key)!.toISOString(),
        };
      });
    const items = catalog.filter((item) => !removed.has(item.key)).map((item) => {
      const def = byKey.get(item.key);
      const twin = handmade.get(normalizeRecurringName(item.name));
      const applied = Boolean(def && isActive(def, current) && def.row.regimes.includes(regime));
      const state: RegimeGroupItemState = applied ? 'applied' : twin ? 'handmade' : def && !isActive(def, current) ? 'ended' : 'missing';
      return {
        key: item.key,
        name: item.name,
        description: item.description,
        period: item.period,
        dueDay: item.dueDay,
        dueMonth: item.dueMonth,
        months: recurringMonths(item),
        targetDaysBefore: item.targetDaysBefore,
        nonBusinessDayRule: item.nonBusinessDayRule,
        referenceOffset: item.referenceOffset,
        department: { key: item.department, name: SUGGESTED_DEPARTMENT_NAMES[item.department], match: matched.get(item.department) ?? null },
        recurringTask: def ? recurringRef(def, departments, current) : null,
        handmade: twin ? recurringRef(twin, departments, current) : null,
        applied,
        state,
        currentOverdue: currentOverdue(item, ctx.today),
      };
    });
    const clientCount = clients.filter((c) => c.taxRegime === regime && clientActiveIn(c, current)).length;
    const missing = items.filter((i) => i.state === 'missing');
    return {
      regime,
      label: TAX_REGIME_LABELS[regime],
      clientCount,
      items,
      missing: missing.length,
      currentMonthOverdue: missing.reduce((sum, i) => sum + i.currentOverdue * clientCount, 0),
      recurring: defs.filter((d) => d.row.regimes.includes(regime)).map((d) => recurringRef(d, departments, current)),
      own: defs
        .filter((d) => isActive(d, current) && d.row.regimes.includes(regime) && !(d.row.catalogKey && groupKeys.has(d.row.catalogKey)))
        .map((d) => ownTask(d, departments, current)),
      excluded,
    };
  });
  return { today: ctx.today, usesDepartments: departments.size > 0, groups };
}

/**
 * POST /tasks/regime-groups/:regime/apply (`registry`). Creates the missing items (from the current
 * competence or the next one, `fromMonth`; no default responsible: the department's queue), adds the regime to the existing ones of
 * the catalog and leaves the ended ones ended. Departments: the chosen one, else a match by name, else
 * created with the suggested name — only in offices that use departments.
 */
export async function applyRegimeGroup(ctx: TaskContext, regime: RegimeGroupRegime, input: ApplyInput): Promise<RegimeGroupApplyResponse> {
  const removed = (await loadExclusions(ctx)).get(regime) ?? new Map<string, Date>();
  const chosenItems = regimeGroupItems(regime).filter((i) => !input.keys || input.keys.includes(i.key));
  if (chosenItems.length === 0) throw new ValidationError('Nenhuma das tarefas escolhidas faz parte deste grupo.');
  // Items the office removed from the group are never recreated (restore them first).
  const items = chosenItems.filter((i) => !removed.has(i.key));
  if (items.length === 0) throw new ValidationError('As tarefas escolhidas foram removidas do grupo. Restaure-as antes de aplicar.');
  const current = monthKey(ctx.today);
  const startCompetence = input.fromMonth === 'next' ? addMonthKey(current, 1) : current;
  const departments = await departmentNames(ctx.db, ctx.workspaceId);
  for (const id of Object.values(input.departments)) if (id) await getDepartmentOrThrow(ctx.db, ctx.workspaceId, id);
  const matched = matchedDepartments(departments);
  const defs = await loadDefs(ctx, undefined, { origin: 'registry' });
  const byKey = new Map(defs.filter((d) => d.row.catalogKey).map((d) => [d.row.catalogKey!, d]));
  const handmade = handmadeByName(defs, regime, current);
  const skipped: RegimeGroupApplyResponse['skipped'] = [];

  const departmentsCreated: TaskRef[] = [];
  const chosen = new Map<SuggestedDepartment, string | null>();
  async function departmentFor(key: SuggestedDepartment): Promise<string | null> {
    if (departments.size === 0) return null;
    const known = chosen.get(key);
    if (known !== undefined) return known;
    let id = input.departments[key] ?? matched.get(key)?.id ?? null;
    if (!id) {
      const created = await createDepartment(ctx, taskDepartmentInputSchema.parse({ name: SUGGESTED_DEPARTMENT_NAMES[key] }));
      departmentsCreated.push({ id: created.id, name: created.name });
      id = created.id;
    }
    chosen.set(key, id);
    return id;
  }

  const out: RegimeGroupApplyResponse['items'] = [];
  const createdIds: string[] = [];
  // Occurrences of the current competence born overdue, per client: counted below over the regime's clients.
  const regimeClients = (await loadClients(ctx)).filter((c) => c.taxRegime === regime && clientActiveIn(c, current));
  let overdueCreated = 0;
  for (const item of items) {
    const def = byKey.get(item.key);
    const covered = !def || !isActive(def, current) || !def.row.regimes.includes(regime);
    const twin = covered ? handmade.get(normalizeRecurringName(item.name)) : undefined;
    if (twin && !(def && !isActive(def, current)) && !input.force.includes(item.key)) {
      // A recurring task made by hand already does this for the regime: no twin unless forced.
      skipped.push({ key: item.key, name: item.name, reason: 'handmade', existing: { id: twin.row.id, name: twin.row.name } });
      continue;
    }
    if (def) {
      if (!isActive(def, current)) {
        out.push({ key: item.key, recurringTaskId: def.row.id, name: def.row.name, result: 'ended' });
      } else if (def.row.regimes.includes(regime)) {
        out.push({ key: item.key, recurringTaskId: def.row.id, name: def.row.name, result: 'unchanged' });
      } else {
        await ctx.db
          .update(recurringTasks)
          .set({ regimes: [...def.row.regimes, regime] })
          .where(and(eq(recurringTasks.workspaceId, ctx.workspaceId), eq(recurringTasks.id, def.row.id)));
        // The clients of the regime get their occurrences (and a system-canceled one comes back).
        await syncOpenOccurrences(ctx, def.row.id);
        // It already runs this month: the regime's clients get this month's occurrences, whatever `fromMonth`.
        const perClient = currentOverdue(item, ctx.today);
        if (perClient > 0) overdueCreated += perClient * regimeClients.filter((c) => !def.excluded.has(c.id)).length;
        out.push({ key: item.key, recurringTaskId: def.row.id, name: def.row.name, result: 'regimeAdded' });
      }
      continue;
    }
    const id = await insertRecurring(
      ctx,
      recurringTaskInputSchema.parse({
        name: item.name,
        description: item.description,
        period: item.period,
        departmentId: await departmentFor(item.department),
        dueDay: item.dueDay,
        dueMonth: item.dueMonth,
        targetDaysBefore: item.targetDaysBefore,
        nonBusinessDayRule: item.nonBusinessDayRule,
        referenceOffset: item.referenceOffset,
        regimes: [regime],
        startCompetence,
      }),
      { catalogKey: item.key },
    );
    createdIds.push(id);
    if (startCompetence === current) overdueCreated += currentOverdue(item, ctx.today) * regimeClients.length;
    out.push({ key: item.key, recurringTaskId: id, name: item.name, result: 'created' });
  }
  if (createdIds.length > 0) await ensureOccurrences(ctx, defaultWindow(ctx.today), { recurringTaskIds: createdIds });
  const count = (result: RegimeGroupApplyResponse['items'][number]['result']) => out.filter((i) => i.result === result).length;
  return {
    regime,
    created: count('created'),
    regimeAdded: count('regimeAdded'),
    unchanged: count('unchanged'),
    ended: count('ended'),
    items: out,
    skipped,
    departmentsCreated,
    fromMonth: input.fromMonth,
    startCompetence,
    overdueCreated,
  };
}

// --- editing a group: include / exclude / restore ----------------------------------------------------

/** A recurring task of the registry of the office (a task's recurrence or another office's id: 404). */
async function registryDefOrThrow(ctx: TaskContext, id: string): Promise<GenDef> {
  const [def] = await loadDefs(ctx, [id], { origin: 'registry' });
  if (!def) throw new NotFoundError('Tarefa recorrente não encontrada');
  return def;
}

/** The recurring task created from a catalog item, if any. */
async function catalogDef(ctx: TaskContext, key: string): Promise<GenDef | undefined> {
  const [row] = await ctx.db
    .select({ id: recurringTasks.id })
    .from(recurringTasks)
    .where(and(eq(recurringTasks.workspaceId, ctx.workspaceId), eq(recurringTasks.origin, 'registry'), eq(recurringTasks.catalogKey, key)));
  return row ? (await loadDefs(ctx, [row.id], { origin: 'registry' }))[0] : undefined;
}

function assertGroupKey(regime: RegimeGroupRegime, key: string): void {
  if (!regimeGroupItems(regime).some((i) => i.key === key)) throw new ValidationError('Esta tarefa não faz parte do grupo deste regime.');
}

/** The group's catalog key a recurring task stands for (created from an item of this regime's group). */
function groupKeyOf(def: GenDef, regime: RegimeGroupRegime): string | null {
  const key = def.row.catalogKey;
  return key && regimeGroupItems(regime).some((i) => i.key === key) ? key : null;
}

/**
 * New regimes of a recurring task (and its end, when left without regimes nor chosen clients), then its
 * open occurrences follow — the edit rule of recurring tasks (generation.syncOpenOccurrences).
 */
async function setRegimes(ctx: TaskContext, def: GenDef, regimes: GenDef['row']['regimes']): Promise<RegimeGroupChange> {
  const current = monthKey(ctx.today);
  const removing = regimes.length < def.row.regimes.length;
  const end = removing && regimes.length === 0 && def.included.size === 0 && isActive(def, current);
  // "Encerra em": the current competence (its start, when it starts later) — nothing from the next one.
  const endCompetence: MonthKey | null = end
    ? def.row.startCompetence > current
      ? def.row.startCompetence
      : (current as MonthKey)
    : def.row.endCompetence;
  await ctx.db
    .update(recurringTasks)
    .set({ regimes: [...regimes], endCompetence })
    .where(and(eq(recurringTasks.workspaceId, ctx.workspaceId), eq(recurringTasks.id, def.row.id)));
  await syncOpenOccurrences(ctx, def.row.id);
  return end ? 'ended' : removing ? 'regimeRemoved' : 'regimeAdded';
}

async function changeResponse(
  ctx: TaskContext,
  regime: RegimeGroupRegime,
  out: { key: string | null; excluded: boolean; change: RegimeGroupChange; recurringTaskId: string | null },
): Promise<RegimeGroupChangeResponse> {
  const current = monthKey(ctx.today);
  const [def] = out.recurringTaskId ? await loadDefs(ctx, [out.recurringTaskId], { origin: 'registry' }) : [];
  const departments = def ? await departmentNames(ctx.db, ctx.workspaceId) : new Map<string, string>();
  return { regime, key: out.key, excluded: out.excluded, change: out.change, recurringTask: def ? recurringRef(def, departments, current) : null };
}

/**
 * POST /tasks/regime-groups/:regime/include (`registry`). An active recurring task of the registry gains
 * the regime (already in it: nothing changes); one created from an item of this group that the office had
 * removed brings the item back. An ended one is refused (reopen it by editing "Encerra em").
 */
export async function includeInRegimeGroup(ctx: TaskContext, regime: RegimeGroupRegime, input: IncludeInput): Promise<RegimeGroupChangeResponse> {
  const def = await registryDefOrThrow(ctx, input.recurringTaskId);
  if (!isActive(def, monthKey(ctx.today)))
    throw new ConflictError('Esta tarefa recorrente está encerrada. Edite "Encerra em" para reativá-la antes de incluí-la no regime.');
  const key = groupKeyOf(def, regime);
  if (key) await deleteExclusion(ctx, regime, key);
  const change: RegimeGroupChange = def.row.regimes.includes(regime) ? 'none' : await setRegimes(ctx, def, [...def.row.regimes, regime]);
  return changeResponse(ctx, regime, { key, excluded: false, change, recurringTaskId: def.row.id });
}

/**
 * POST /tasks/regime-groups/:regime/exclude (`registry`). A catalog item (`key`, or a recurring task
 * created from an item of this group) is recorded as removed from the office's group; the regime leaves
 * the recurring task, if it has it. A recurring task left without regimes nor chosen clients is ended.
 */
export async function excludeFromRegimeGroup(ctx: TaskContext, regime: RegimeGroupRegime, input: ExcludeInput): Promise<RegimeGroupChangeResponse> {
  let def: GenDef | undefined;
  let key: string | null;
  if (input.recurringTaskId) {
    def = await registryDefOrThrow(ctx, input.recurringTaskId);
    key = groupKeyOf(def, regime);
  } else {
    key = input.key!;
    assertGroupKey(regime, key);
    def = await catalogDef(ctx, key);
  }
  if (key) {
    await ctx.db
      .insert(regimeGroupExclusions)
      .values({ workspaceId: ctx.workspaceId, regime, catalogKey: key, createdBy: ctx.userId })
      .onConflictDoNothing();
  }
  const change: RegimeGroupChange =
    def && def.row.regimes.includes(regime) ? await setRegimes(ctx, def, def.row.regimes.filter((r) => r !== regime)) : 'none';
  return changeResponse(ctx, regime, { key, excluded: key !== null, change, recurringTaskId: def?.row.id ?? null });
}

async function deleteExclusion(ctx: TaskContext, regime: RegimeGroupRegime, key: string): Promise<void> {
  await ctx.db
    .delete(regimeGroupExclusions)
    .where(
      and(
        eq(regimeGroupExclusions.workspaceId, ctx.workspaceId),
        eq(regimeGroupExclusions.regime, regime),
        eq(regimeGroupExclusions.catalogKey, key),
      ),
    );
}

/**
 * POST /tasks/regime-groups/:regime/restore (`registry`). The removed item goes back to the group as
 * "Falta aplicar" (applying the group recreates it or adds the regime back); not removed: nothing changes.
 */
export async function restoreRegimeGroupItem(ctx: TaskContext, regime: RegimeGroupRegime, input: RestoreInput): Promise<RegimeGroupChangeResponse> {
  assertGroupKey(regime, input.key);
  await deleteExclusion(ctx, regime, input.key);
  const def = await catalogDef(ctx, input.key);
  return changeResponse(ctx, regime, { key: input.key, excluded: false, change: 'none', recurringTaskId: def?.row.id ?? null });
}
