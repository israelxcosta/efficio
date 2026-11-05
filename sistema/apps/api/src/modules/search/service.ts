import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { isTaskOverdue, onlyDigits, TASK_TIME_ZONE, type RecurrencePeriod, type SearchResponse } from '@effinance/shared';
import type { DbExecutor } from '../../db/client';
import {
  accounts,
  categories,
  contacts,
  recurringTasks,
  taskFlowSteps,
  tasks,
  transactions,
  unions,
  type CategoryRow,
  type TransactionRow,
} from '../../db/schema';
import { todayIn } from '../../lib/clock';
import { today } from '../../lib/clock';
import { likePattern } from '../../lib/sql';
import { listAccountsWithBalances } from '../accounts/service';
import { toCategory } from '../categories/service';
import { getCipher } from '../../lib/crypto/keyring';
import { documentIndex, toContact } from '../contacts/service';
import { toTransactions } from '../transactions/mapper';

/**
 * What the requesting member may find. Without access to the finances (lib/finance-access.ts) the
 * search covers clients only, without their notes (like `GET /clients`): transactions, accounts,
 * categories and suppliers (fornecedores) are not queried.
 */
export interface SearchScope {
  finance: boolean;
}

const none = <T>(): Promise<T[]> => Promise.resolve([]);

/**
 * Notes and contact details are encrypted: search covers descriptions, names and exact CPF/CNPJ (the
 * clients' accesses are never searched nor returned). Unions by name, acronym, category or CNPJ. Tasks
 * (standalone and process steps, by title) and recurring tasks (by name) are found by every member;
 * occurrences of recurring tasks are not listed one by one (the recurring task stands for them).
 */
export async function search(db: DbExecutor, workspaceId: string, q: string, scope: SearchScope): Promise<SearchResponse> {
  const pattern = likePattern(q);
  const digits = onlyDigits(q);
  const cipher = await getCipher(workspaceId);
  const documentHash =
    digits.length === 11 || digits.length === 14 ? await documentIndex(cipher, digits) : null;
  const day = todayIn(TASK_TIME_ZONE);
  const [txRows, accountRows, categoryRows, contactRows, taskRows, recurringRows, unionRows] = await Promise.all([
    !scope.finance
      ? none<TransactionRow>()
      : db
          .select()
          .from(transactions)
          .where(and(eq(transactions.workspaceId, workspaceId), ilike(transactions.description, pattern)))
          // Closest to today first, so far-future occurrences of a series don't crowd the results.
          .orderBy(asc(sql`abs(${transactions.date} - ${today()}::date)`), desc(transactions.date))
          .limit(8),
    !scope.finance
      ? none<{ id: string }>()
      : db
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.workspaceId, workspaceId), ilike(accounts.name, pattern)))
          .limit(5),
    !scope.finance
      ? none<CategoryRow>()
      : db
          .select()
          .from(categories)
          .where(and(eq(categories.workspaceId, workspaceId), ilike(categories.name, pattern)))
          .limit(5),
    db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, workspaceId),
          scope.finance ? undefined : eq(contacts.kind, 'client'),
          or(
            ilike(contacts.name, pattern),
            ilike(contacts.tradeName, pattern),
            documentHash ? eq(contacts.documentHash, documentHash) : undefined,
          ),
        ),
      )
      .limit(5),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        dueDate: tasks.dueDate,
        clientId: tasks.clientId,
        clientName: contacts.name,
        clientTradeName: contacts.tradeName,
        inFlow: sql<boolean>`${taskFlowSteps.id} is not null`,
        series: sql<boolean>`${tasks.recurringTaskId} is not null`,
      })
      .from(tasks)
      .leftJoin(contacts, and(eq(contacts.workspaceId, tasks.workspaceId), eq(contacts.id, tasks.clientId)))
      .leftJoin(taskFlowSteps, and(eq(taskFlowSteps.workspaceId, tasks.workspaceId), eq(taskFlowSteps.taskId, tasks.id)))
      // Registry occurrences are found through their recurring task; of a task's recurrence, only the next
      // open occurrence of each series (a daily one would fill every slot).
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          sql`(${tasks.recurringTaskId} is null or (${tasks.occurrenceOrigin} = 'task' and ${tasks.status} in ('todo', 'in_progress', 'waiting_client') and not exists (select 1 from tasks n where n.workspace_id = tasks.workspace_id and n.recurring_task_id = tasks.recurring_task_id and n.status in ('todo', 'in_progress', 'waiting_client') and (n.due_date, n.id) < (tasks.due_date, tasks.id))))`,
          ilike(tasks.title, pattern),
        ),
      )
      // Open first, then the closest due date to today.
      .orderBy(
        sql`case when ${tasks.status} in ('todo', 'in_progress', 'waiting_client') then 0 else 1 end`,
        sql`abs(coalesce(${tasks.dueDate}, ${day}::date) - ${day}::date)`,
        desc(tasks.createdAt),
      )
      .limit(8),
    db
      .select({ id: recurringTasks.id, name: recurringTasks.name, period: sql<RecurrencePeriod>`${recurringTasks.period}` })
      .from(recurringTasks)
      // The registry's (they open in "Recorrentes"); a task's recurrence is found through its tasks.
      .where(and(eq(recurringTasks.workspaceId, workspaceId), eq(recurringTasks.origin, 'registry'), ilike(recurringTasks.name, pattern)))
      .orderBy(sql`lower(${recurringTasks.name})`)
      .limit(5),
    // Unions (phase 3): public data of the entity, for every member. Name, acronym, category or CNPJ.
    db
      .select({ id: unions.id, name: unions.name, acronym: unions.acronym, category: unions.category, active: unions.active })
      .from(unions)
      .where(
        and(
          eq(unions.workspaceId, workspaceId),
          or(
            ilike(unions.name, pattern),
            ilike(unions.acronym, pattern),
            ilike(unions.category, pattern),
            digits.length >= 4 ? ilike(unions.document, likePattern(digits)) : undefined,
          ),
        ),
      )
      .orderBy(desc(unions.active), sql`lower(coalesce(${unions.acronym}, ${unions.name}))`)
      .limit(5),
  ]);

  const matchedAccounts = new Set(accountRows.map((a) => a.id));
  const allAccounts = matchedAccounts.size ? await listAccountsWithBalances(db, workspaceId, true) : [];

  return {
    transactions: await toTransactions(db, txRows),
    accounts: allAccounts.filter((a) => matchedAccounts.has(a.id)),
    categories: categoryRows.map(toCategory),
    contacts: await Promise.all(
      contactRows.map(async (r) => {
        const contact = await toContact(cipher, r);
        return scope.finance ? contact : { ...contact, notes: null };
      }),
    ),
    tasks: taskRows.map((t) => ({
      id: t.id,
      title: t.title,
      kind: t.series ? ('recurring' as const) : t.inFlow ? ('flow' as const) : ('standalone' as const),
      status: t.status,
      dueDate: t.dueDate,
      overdue: isTaskOverdue(t, day),
      client: t.clientId && t.clientName ? { id: t.clientId, name: t.clientTradeName?.trim() ? t.clientTradeName : t.clientName } : null,
    })),
    recurringTasks: recurringRows,
    unions: unionRows,
  };
}
