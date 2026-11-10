// Rework (retrabalho) of the clients: their tasks in categories flagged `is_rework` (migration 0020),
// counted by the day each task was opened in the office time zone, in the windows of the shared
// `reworkWindows` (90 days and 12 months, today included), and the latest ones. Canceled tasks (opened by
// mistake) and occurrences of recurring tasks (generated, not incidents) never count. Feeds the client
// score (shared `clientScore`) of the delinquency report and of the client report.

import { sql, type SQL } from 'drizzle-orm';
import {
  NO_REWORK,
  REWORK_LATEST_LIMIT,
  reworkPenalty,
  reworkWindows,
  TASK_TIME_ZONE,
  type ClientRework,
  type ClientReworkResponse,
  type IconName,
  type ISODate,
  type ReworkTask,
  type ReworkWindows,
  type TaskStatus,
} from '@effinance/shared';
import type { DbExecutor } from '../../db/client';
import { todayIn } from '../../lib/clock';
import { executeRows } from '../../lib/sql';
import { getClientOrThrow } from '../common/ownership';

/** Start of an office day as an instant (the filter stays on the raw column, so indexes apply). */
const dayStart = (day: ISODate) => sql`((${day}::date)::timestamp at time zone 'America/Sao_Paulo')`;

/** Rework tasks of the workspace (or of one client) opened since the start of the 12 months. */
function reworkWhere(workspaceId: string, windows: ReworkWindows, clientId?: string): SQL {
  return sql`t.workspace_id = ${workspaceId}
    and c.is_rework
    and t.client_id is not null
    ${clientId ? sql`and t.client_id = ${clientId}` : sql``}
    and t.recurring_task_id is null
    and t.status <> 'canceled'
    and t.created_at >= ${dayStart(windows.yearFrom)}`;
}

const REWORK_FROM = sql`from tasks t join task_categories c on c.workspace_id = t.workspace_id and c.id = t.category_id`;

interface LatestRow {
  id: string;
  clientId: string;
  title: string;
  status: TaskStatus;
  date: ISODate;
  dueDate: ISODate | null;
  categoryId: string;
  categoryName: string;
  categoryIcon: IconName;
  categoryColor: string;
}

/**
 * Rework per client (only clients with some rework in the 12 months are in the map; the others have
 * `NO_REWORK` and no tasks). Two aggregates: the counts (GROUP BY) and the latest per client (window
 * function), never the whole task history.
 */
export async function reworkByClient(
  db: DbExecutor,
  workspaceId: string,
  today: ISODate,
  options: { clientId?: string; canReadTasks?: boolean } = {},
): Promise<Map<string, ClientRework>> {
  const { clientId, canReadTasks = true } = options;
  const windows = reworkWindows(today);
  const where = reworkWhere(workspaceId, windows, clientId);
  const [counts, latest] = await Promise.all([
    executeRows<{ clientId: string; last90Days: number; last12Months: number }>(
      db,
      sql`select t.client_id as "clientId",
          (count(*) filter (where t.created_at >= ${dayStart(windows.recentFrom)}))::int as "last90Days",
          count(*)::int as "last12Months"
        ${REWORK_FROM}
        where ${where}
        group by t.client_id`,
    ),
    executeRows<LatestRow>(
      db,
      sql`select ranked.* from (
          select t.id, t.client_id as "clientId", t.title, t.status,
            to_char((t.created_at at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as "date",
            to_char(t.due_date, 'YYYY-MM-DD') as "dueDate",
            c.id as "categoryId", c.name as "categoryName", c.icon as "categoryIcon", c.color as "categoryColor",
            row_number() over (partition by t.client_id order by t.created_at desc, t.id desc) as n
          ${REWORK_FROM}
          where ${where}
        ) ranked
        where ranked.n <= ${REWORK_LATEST_LIMIT}
        order by ranked."clientId", ranked.n`,
    ),
  ]);
  const byClient = new Map<string, ClientRework>();
  for (const row of counts) {
    byClient.set(row.clientId, { last90Days: Number(row.last90Days), last12Months: Number(row.last12Months), latest: [] });
  }
  for (const row of latest) {
    const task: ReworkTask = {
      id: row.id,
      // Without access to the tasks the list keeps the count, date, status and category, not the title.
      title: canReadTasks ? row.title : null,
      date: row.date,
      status: row.status,
      dueDate: row.dueDate,
      category: { id: row.categoryId, name: row.categoryName, icon: row.categoryIcon, color: row.categoryColor },
    };
    byClient.get(row.clientId)?.latest.push(task);
  }
  return byClient;
}

export const noRework = (): ClientRework => ({ ...NO_REWORK, latest: [] });

/**
 * GET /reports/clients/:id/rework: the rework of one client of the workspace (404 otherwise). Titles
 * only for who can read the tasks (`canReadTasks`; null otherwise).
 */
export async function clientRework(
  db: DbExecutor,
  workspaceId: string,
  clientId: string,
  canReadTasks: boolean,
): Promise<ClientReworkResponse> {
  await getClientOrThrow(db, workspaceId, clientId);
  const today = todayIn(TASK_TIME_ZONE);
  const rework = (await reworkByClient(db, workspaceId, today, { clientId, canReadTasks })).get(clientId) ?? noRework();
  return { contactId: clientId, today, windows: reworkWindows(today), penalty: reworkPenalty(rework), rework };
}
