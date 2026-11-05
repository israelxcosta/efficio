// GET /tasks/dashboard: the data of Effy's dashboard cards for the Gestão start page, in one request and
// in SQL aggregates (Effy counted in the browser over everything it had loaded). Every member reads it;
// the task cards follow the start page's department rule (another department or all: `registry`); the
// documents, agreements and registrations are the office's. Fees need `finance`, incomplete
// registrations `registry` (Effy's "card" permissions); without them the block is null.
//
// Cards: "Situação das tarefas" (occurrences of the competence + standalone tasks due in the month),
// "Fluxo de tarefas por dia" (open items per work date, 7 days), "Processos por departamento" and
// "Pendências fiscais" (occurrences of the competence), "Agenda" (legal deadlines in the next 7 days and
// those past this month with pending work), "Visão geral dos clientes", "Certificados digitais" and
// "Laudos" (by situation, with the list), "Convenções coletivas" (the /deadlines rule), "Honorários
// próximos de vencer" and "Cadastro incompleto".

import { and, asc, desc, eq, gte, inArray, lt, lte, sql, type SQL } from 'drizzle-orm';
import {
  addDays,
  addMonthKey,
  CLIENT_COMPLETENESS_FIELDS,
  completenessFieldsOf,
  deadlineBounds,
  deadlineStatus,
  diffInDays,
  feePeriod,
  monthKey,
  monthRange,
  type ClientCompletenessField,
  type ClientOverviewStatus,
  type DashboardDocumentItem,
  type DashboardDocuments,
  type DashboardDocumentSituation,
  type DashboardFeeItem,
  type MonthKey,
  type taskDashboardQuerySchema,
  type TaskDashboardResponse,
  type TaxRegime,
} from '@effinance/shared';
import type { z } from 'zod';
import { clientDocuments, clientFees, contacts, tasks } from '../../db/schema';
import { documentName } from '../clients/fiscal';
import { conventionDeadlines } from '../deadlines/service';
import type { TaskContext } from './access';
import { clientActiveIn, defaultWindow, ensureOccurrences, loadClients } from './generation';
import { resolveView } from './home';
import { aggregateOccurrences, byUrgency } from './occurrences';
import { clientDisplayName, departmentNames } from './shared';
import { AGGREGATED_SQL, NOT_OCCURRENCE_SQL, OCCURRENCE_SQL, OPEN_SQL, WORK_DATE } from './task-rows';

type DashboardQuery = z.output<typeof taskDashboardQuerySchema>;

const count = (cond?: SQL) => (cond ? sql<number>`count(*) filter (where ${cond})` : sql<number>`count(*)`).mapWith(Number);

/** Items listed per document card (the counts cover all of them). */
export const MAX_DASHBOARD_DOCUMENTS = 500;
/** Days of the flow and of the agenda. */
const FLOW_DAYS = 7;
const AGENDA_DAYS = 7;

const activeClientOfDocument = and(eq(contacts.workspaceId, clientDocuments.workspaceId), eq(contacts.id, clientDocuments.clientId));

const situationOf = (expiresAt: string | null, today: string): DashboardDocumentSituation => {
  const { bucket } = deadlineStatus(expiresAt, today);
  return bucket === 'within60' || bucket === 'later' ? 'ok' : bucket;
};

async function documentsCard(ctx: TaskContext, certificates: boolean): Promise<DashboardDocuments> {
  const { today, soon } = deadlineBounds(ctx.today);
  const scope = and(
    eq(clientDocuments.workspaceId, ctx.workspaceId),
    eq(contacts.status, 'active'),
    certificates ? sql`${clientDocuments.kind} = 'digital_certificate'` : sql`${clientDocuments.kind} <> 'digital_certificate'`,
  );
  const [[counts], rows] = await Promise.all([
    ctx.db
      .select({
        overdue: count(sql`${clientDocuments.expiresAt} < ${today}::date`),
        within30: count(sql`${clientDocuments.expiresAt} between ${today}::date and ${soon}::date`),
        ok: count(sql`${clientDocuments.expiresAt} > ${soon}::date`),
        noDate: count(sql`${clientDocuments.expiresAt} is null`),
        total: count(),
      })
      .from(clientDocuments)
      .innerJoin(contacts, activeClientOfDocument)
      .where(scope),
    ctx.db
      .select({
        id: clientDocuments.id,
        clientId: contacts.id,
        clientName: contacts.name,
        clientTradeName: contacts.tradeName,
        kind: clientDocuments.kind,
        customName: clientDocuments.customName,
        expiresAt: clientDocuments.expiresAt,
      })
      .from(clientDocuments)
      .innerJoin(contacts, activeClientOfDocument)
      .where(scope)
      .orderBy(sql`${clientDocuments.expiresAt} asc nulls last`, sql`lower(coalesce(${contacts.tradeName}, ${contacts.name}))`, asc(clientDocuments.id))
      .limit(MAX_DASHBOARD_DOCUMENTS + 1),
  ]);
  const items: DashboardDocumentItem[] = rows.slice(0, MAX_DASHBOARD_DOCUMENTS).map((r) => ({
    id: r.id,
    client: { id: r.clientId, name: clientDisplayName({ name: r.clientName, tradeName: r.clientTradeName }) },
    kind: r.kind,
    name: documentName(r),
    expiresAt: r.expiresAt,
    situation: situationOf(r.expiresAt, ctx.today),
    days: deadlineStatus(r.expiresAt, ctx.today).days,
  }));
  const c = counts ?? { overdue: 0, within30: 0, ok: 0, noDate: 0, total: 0 };
  return {
    counts: { overdue: c.overdue, within30: c.within30, ok: c.ok, noDate: c.noDate },
    total: c.total,
    items,
    truncated: rows.length > MAX_DASHBOARD_DOCUMENTS,
  };
}

/** The latest registered fee period of each active client, by its end (finance only). */
async function feesCard(ctx: TaskContext): Promise<NonNullable<TaskDashboardResponse['fees']>> {
  const rows = await ctx.db
    .selectDistinctOn([clientFees.clientId], {
      clientId: clientFees.clientId,
      periodIndex: clientFees.periodIndex,
      amount: clientFees.amount,
      name: contacts.name,
      tradeName: contacts.tradeName,
      taxRegime: contacts.taxRegime,
      contractStartDate: contacts.contractStartDate,
    })
    .from(clientFees)
    .innerJoin(contacts, and(eq(contacts.workspaceId, clientFees.workspaceId), eq(contacts.id, clientFees.clientId)))
    .where(and(eq(clientFees.workspaceId, ctx.workspaceId), eq(contacts.kind, 'client'), eq(contacts.status, 'active')))
    .orderBy(clientFees.clientId, desc(clientFees.periodIndex));
  const items: DashboardFeeItem[] = rows
    .filter((r) => r.contractStartDate)
    .map((r) => {
      const periodEnd = feePeriod(r.contractStartDate!, r.periodIndex).endDate;
      return {
        client: { id: r.clientId, name: clientDisplayName(r) },
        taxRegime: (r.taxRegime ?? 'other') as TaxRegime,
        periodEnd,
        days: diffInDays(periodEnd, ctx.today),
        monthlyAmount: r.amount,
      };
    })
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd) || a.client.name.localeCompare(b.client.name, 'pt-BR'));
  return { within30: items.filter((i) => i.days <= 30), within60: items.filter((i) => i.days > 30 && i.days <= 60) };
}

/** Active clients with blank fiscal data or without a digital certificate (registry only). */
async function incompleteCard(ctx: TaskContext): Promise<NonNullable<TaskDashboardResponse['incomplete']>> {
  // Presence only: the encrypted accesses are never selected (spec: never in lists).
  // Outer columns spelled out: Drizzle leaves them unqualified in a single-table select (pitfall #11).
  const rows = await ctx.db
    .select({
      id: contacts.id,
      name: contacts.name,
      tradeName: contacts.tradeName,
      taxRegime: contacts.taxRegime,
      stateRegistration: sql<boolean>`(${contacts.stateRegistration} is not null or ${contacts.stateRegistrationExempt})`,
      municipalRegistration: sql<boolean>`(${contacts.municipalRegistration} is not null)`,
      accountantPassword: sql<boolean>`(${contacts.accountantPassword} is not null)`,
      simplesAccessCode: sql<boolean>`(${contacts.simplesAccessCode} is not null)`,
      simplesAnnex: sql<boolean>`(${contacts.simplesAnnex} is not null)`,
      digitalCertificate: sql<boolean>`exists (select 1 from client_documents d where d.workspace_id = contacts.workspace_id and d.client_id = contacts.id and d.kind = 'digital_certificate')`,
    })
    .from(contacts)
    .where(and(eq(contacts.workspaceId, ctx.workspaceId), eq(contacts.kind, 'client'), eq(contacts.status, 'active')))
    .orderBy(sql`lower(coalesce(${contacts.tradeName}, ${contacts.name}))`, asc(contacts.id));
  const all = rows.map((r) => {
    const regime = (r.taxRegime ?? 'other') as TaxRegime;
    const fields = completenessFieldsOf(regime);
    const missing = fields.filter((f) => !r[f]) as ClientCompletenessField[];
    const filled = fields.length - missing.length;
    return {
      client: { id: r.id, name: clientDisplayName(r), legalName: r.name, taxRegime: regime },
      missing: CLIENT_COMPLETENESS_FIELDS.filter((f) => missing.includes(f)),
      filled,
      total: fields.length,
      percent: Math.round((filled / fields.length) * 100),
    };
  });
  const items = all.filter((i) => i.missing.length > 0).sort((a, b) => a.percent - b.percent || a.client.name.localeCompare(b.client.name, 'pt-BR'));
  return {
    count: items.length,
    averagePercent: all.length ? Math.round(all.reduce((n, i) => n + i.percent, 0) / all.length) : 100,
    items,
  };
}

export async function taskDashboard(ctx: TaskContext, q: DashboardQuery): Promise<TaskDashboardResponse> {
  const t = ctx.today;
  const current = monthKey(t);
  const month: MonthKey = q.month ?? current;
  await ensureOccurrences(ctx, [...new Set([month, ...defaultWindow(t)])]);
  const { view, department } = await resolveView(ctx, q.departmentId);
  const scope = view === 'department' ? eq(tasks.departmentId, department!.id) : view === 'mine' ? eq(tasks.assigneeId, ctx.userId) : undefined;
  const { from, to } = monthRange(month);
  const overdue = sql`${OPEN_SQL} and ${tasks.dueDate} < ${t}`;
  const pending = sql`${OPEN_SQL} and not (${tasks.dueDate} is not null and ${tasks.dueDate} < ${t})`;
  // Obligations of the competence: the registry's occurrences (tasks' recurrences are tasks, migration 0019).
  const ofCompetence = and(eq(tasks.workspaceId, ctx.workspaceId), AGGREGATED_SQL, scope, eq(tasks.competence, month));
  const lastFlowDay = addDays(t, FLOW_DAYS - 1);

  const [[status], flowRows, processRows, fiscalItems, upcoming, pastThisMonth, perClient, clients, names, documents, certificates, conventions, fees, incomplete] =
    await Promise.all([
      ctx.db
        .select({ total: count(), pending: count(pending), concluded: count(sql`${tasks.status} in ('done', 'canceled')`), overdue: count(overdue) })
        .from(tasks)
        .where(
          and(
            eq(tasks.workspaceId, ctx.workspaceId),
            scope,
            sql`((${OCCURRENCE_SQL} and ${tasks.competence} = ${month}) or (${NOT_OCCURRENCE_SQL} and ${tasks.dueDate} between ${from} and ${to}))`,
          ),
        ),
      ctx.db
        .select({ date: sql<string>`(${WORK_DATE})::text`, recurring: count(OCCURRENCE_SQL), standalone: count(NOT_OCCURRENCE_SQL) })
        .from(tasks)
        .where(and(eq(tasks.workspaceId, ctx.workspaceId), scope, OPEN_SQL, sql`${WORK_DATE} between ${t}::date and ${lastFlowDay}::date`))
        .groupBy(WORK_DATE),
      ctx.db
        .select({
          departmentId: tasks.departmentId,
          recurringCount: sql<number>`count(distinct ${tasks.recurringTaskId})`.mapWith(Number),
          total: count(),
          done: count(sql`${tasks.status} = 'done'`),
          pending: count(pending),
          overdue: count(overdue),
        })
        .from(tasks)
        .where(ofCompetence)
        .groupBy(tasks.departmentId),
      aggregateOccurrences(ctx, and(scope, eq(tasks.competence, month))),
      aggregateOccurrences(
        ctx,
        and(scope, inArray(tasks.competence, [current, addMonthKey(current, 1)]), gte(tasks.dueDate, t), lte(tasks.dueDate, addDays(t, AGENDA_DAYS))),
      ),
      aggregateOccurrences(ctx, and(scope, eq(tasks.competence, current), lt(tasks.dueDate, t))),
      ctx.db
        .select({ clientId: tasks.clientId, pending: count(OPEN_SQL), overdue: count(overdue) })
        .from(tasks)
        .where(ofCompetence)
        .groupBy(tasks.clientId),
      loadClients(ctx),
      departmentNames(ctx.db, ctx.workspaceId),
      documentsCard(ctx, false),
      documentsCard(ctx, true),
      conventionDeadlines(ctx),
      ctx.permissions.finance ? feesCard(ctx) : Promise.resolve(null),
      ctx.permissions.registry ? incompleteCard(ctx) : Promise.resolve(null),
    ]);

  const processes = processRows
    .map((r) => ({
      department: r.departmentId && names.has(r.departmentId) ? { id: r.departmentId, name: names.get(r.departmentId)! } : null,
      recurringCount: r.recurringCount,
      total: r.total,
      done: r.done,
      pending: r.pending,
      overdue: r.overdue,
    }))
    .sort((a, b) => (a.department ? 0 : 1) - (b.department ? 0 : 1) || (a.department?.name ?? '').localeCompare(b.department?.name ?? '', 'pt-BR'));

  const flowByDay = new Map(flowRows.map((r) => [r.date, r]));
  const flow = Array.from({ length: FLOW_DAYS }, (_, i) => {
    const date = addDays(t, i);
    const row = flowByDay.get(date);
    return { date, recurring: row?.recurring ?? 0, standalone: row?.standalone ?? 0 };
  });

  const byClient = new Map(perClient.map((r) => [r.clientId, r]));
  const rank: Record<ClientOverviewStatus, number> = { attention: 0, pending: 1, upToDate: 2 };
  const overviewItems = clients
    .filter((c) => clientActiveIn(c, month))
    .map((c) => {
      const r = byClient.get(c.id);
      const status: ClientOverviewStatus = (r?.overdue ?? 0) > 0 ? 'attention' : (r?.pending ?? 0) > 0 ? 'pending' : 'upToDate';
      return {
        client: { id: c.id, name: clientDisplayName(c), legalName: c.name, taxRegime: c.taxRegime ?? ('other' as TaxRegime) },
        status,
        pending: r?.pending ?? 0,
        overdue: r?.overdue ?? 0,
      };
    })
    .sort((a, b) => rank[a.status] - rank[b.status] || a.client.name.localeCompare(b.client.name, 'pt-BR'));
  const overviewCounts: Record<ClientOverviewStatus, number> = { attention: 0, pending: 0, upToDate: 0 };
  for (const item of overviewItems) overviewCounts[item.status] += 1;

  return {
    today: t,
    month,
    view,
    department,
    taskStatus: status ?? { total: 0, pending: 0, concluded: 0, overdue: 0 },
    flow,
    processes,
    fiscal: {
      totals: processes.reduce(
        (acc, p) => ({ total: acc.total + p.total, done: acc.done + p.done, pending: acc.pending + p.pending, overdue: acc.overdue + p.overdue }),
        { total: 0, done: 0, pending: 0, overdue: 0 },
      ),
      items: fiscalItems.sort(byUrgency),
    },
    agenda: {
      upcoming: upcoming.sort((a, b) => a.legalDueDate.localeCompare(b.legalDueDate) || a.name.localeCompare(b.name, 'pt-BR')),
      overdue: pastThisMonth
        .filter((g) => g.pending > 0)
        .sort((a, b) => a.legalDueDate.localeCompare(b.legalDueDate) || a.name.localeCompare(b.name, 'pt-BR')),
    },
    clientsOverview: { counts: overviewCounts, items: overviewItems },
    certificates,
    documents,
    conventions: { counts: conventions.counts, noBaseMonth: conventions.noBaseMonth, total: conventions.activeUnions, items: conventions.items },
    fees,
    incomplete,
  };
}
