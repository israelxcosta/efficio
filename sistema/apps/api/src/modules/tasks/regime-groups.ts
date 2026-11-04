// Default groups of recurring tasks per tax regime (catalog in packages/shared, `regime-groups.ts`).
// Listing shows, per regime, the catalog items with what the office already has, the recurring tasks
// that apply to the regime and how many active clients it has (every member reads). Applying
// (`registry`) creates the missing items as recurring tasks of the regime — found again by their catalog
// key, so applying twice changes nothing — and a common obligation that already exists for another
// regime gains this one (one recurring task with several regimes, as in Effy). The recurring tasks then
// generate every month for every active client of the regime: a new client joins on its own.

import { and, eq } from 'drizzle-orm';
import {
  matchSuggestedDepartment,
  monthKey,
  recurringMonths,
  recurringTaskInputSchema,
  REGIME_GROUP_REGIMES,
  regimeGroupItems,
  SUGGESTED_DEPARTMENT_NAMES,
  TAX_REGIME_LABELS,
  taskDepartmentInputSchema,
  type regimeGroupApplySchema,
  type RegimeGroupApplyResponse,
  type RegimeGroupRecurringRef,
  type RegimeGroupRegime,
  type RegimeGroupsResponse,
  type SuggestedDepartment,
  type TaskRef,
} from '@effinance/shared';
import type { z } from 'zod';
import { recurringTasks } from '../../db/schema';
import { ValidationError } from '../../lib/errors';
import type { TaskContext } from './access';
import { clientActiveIn, defaultWindow, ensureOccurrences, loadClients, loadDefs, syncOpenOccurrences, type GenDef } from './generation';
import { insertRecurring } from './recurring';
import { createDepartment } from './registry';
import { departmentNames, getDepartmentOrThrow } from './shared';

type ApplyInput = z.output<typeof regimeGroupApplySchema>;

const isActive = (def: GenDef, current: string) => def.row.endCompetence === null || def.row.endCompetence >= current;

function recurringRef(def: GenDef, departments: Map<string, string>, current: string): RegimeGroupRecurringRef {
  const departmentName = def.row.departmentId ? departments.get(def.row.departmentId) : undefined;
  return {
    id: def.row.id,
    name: def.row.name,
    period: def.row.period,
    department: def.row.departmentId && departmentName ? { id: def.row.departmentId, name: departmentName } : null,
    active: isActive(def, current),
    regimes: def.row.regimes,
    catalogKey: def.row.catalogKey,
  };
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
  const [defs, clients, departments] = await Promise.all([loadDefs(ctx), loadClients(ctx), departmentNames(ctx.db, ctx.workspaceId)]);
  const matched = matchedDepartments(departments);
  const byKey = new Map(defs.filter((d) => d.row.catalogKey).map((d) => [d.row.catalogKey!, d]));
  const groups = REGIME_GROUP_REGIMES.map((regime) => {
    const items = regimeGroupItems(regime).map((item) => {
      const def = byKey.get(item.key);
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
        applied: Boolean(def && isActive(def, current) && def.row.regimes.includes(regime)),
      };
    });
    return {
      regime,
      label: TAX_REGIME_LABELS[regime],
      clientCount: clients.filter((c) => c.taxRegime === regime && clientActiveIn(c, current)).length,
      items,
      missing: items.filter((i) => !i.applied).length,
      recurring: defs.filter((d) => d.row.regimes.includes(regime)).map((d) => recurringRef(d, departments, current)),
    };
  });
  return { today: ctx.today, usesDepartments: departments.size > 0, groups };
}

/**
 * POST /tasks/regime-groups/:regime/apply (`registry`). Creates the missing items (from the current
 * competence, no default responsible: the department's queue), adds the regime to the existing ones of
 * the catalog and leaves the ended ones ended. Departments: the chosen one, else a match by name, else
 * created with the suggested name — only in offices that use departments.
 */
export async function applyRegimeGroup(ctx: TaskContext, regime: RegimeGroupRegime, input: ApplyInput): Promise<RegimeGroupApplyResponse> {
  const items = regimeGroupItems(regime).filter((i) => !input.keys || input.keys.includes(i.key));
  if (items.length === 0) throw new ValidationError('Nenhuma das tarefas escolhidas faz parte deste grupo.');
  const current = monthKey(ctx.today);
  const departments = await departmentNames(ctx.db, ctx.workspaceId);
  for (const id of Object.values(input.departments)) if (id) await getDepartmentOrThrow(ctx.db, ctx.workspaceId, id);
  const matched = matchedDepartments(departments);
  const defs = await loadDefs(ctx);
  const byKey = new Map(defs.filter((d) => d.row.catalogKey).map((d) => [d.row.catalogKey!, d]));

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
  for (const item of items) {
    const def = byKey.get(item.key);
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
      }),
      { catalogKey: item.key },
    );
    createdIds.push(id);
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
    departmentsCreated,
  };
}
