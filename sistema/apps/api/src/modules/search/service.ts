import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { isTaskOverdue, onlyDigits, TASK_TIME_ZONE, type SearchResponse } from '@effinance/shared';
import type { DbExecutor } from '../../db/client';
import {
  accounts,
  categories,
  contacts,
  recurringTasks,
  taskFlowSteps,
  tasks,
  transactions,
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
 * Notes and contact details are encrypted: search covers descriptions, names and exact CPF/CNPJ. Tasks
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
  const [txRows, accountRows, categoryRows, contactRows, taskRows, recurringRows] = await Promise.all([
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
      })
      .from(tasks)
      .leftJoin(contacts, and(eq(contacts.workspaceId, tasks.workspaceId), eq(contacts.id, tasks.clientId)))
      .leftJoin(taskFlowSteps, and(eq(taskFlowSteps.workspaceId, tasks.workspaceId), eq(taskFlowSteps.taskId, tasks.id)))
      .where(and(eq(tasks.workspaceId, workspaceId), sql`${tasks.recurringTaskId} is null`, ilike(tasks.title, pattern)))
      // Open first, then the closest due date to today.
      .orderBy(
        sql`case when ${tasks.status} in ('todo', 'in_progress', 'waiting_client') then 0 else 1 end`,
        sql`abs(coalesce(${tasks.dueDate}, ${day}::date) - ${day}::date)`,
        desc(tasks.createdAt),
      )
      .limit(8),
    db
      .select({ id: recurringTasks.id, name: recurringTasks.name, period: recurringTasks.period })
      .from(recurringTasks)
      .where(and(eq(recurringTasks.workspaceId, workspaceId), ilike(recurringTasks.name, pattern)))
      .orderBy(sql`lower(${recurringTasks.name})`)
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
      kind: t.inFlow ? ('flow' as const) : ('standalone' as const),
      status: t.status,
      dueDate: t.dueDate,
      overdue: isTaskOverdue(t, day),
      client: t.clientId && t.clientName ? { id: t.clientId, name: t.clientTradeName?.trim() ? t.clientTradeName : t.clientName } : null,
    })),
    recurringTasks: recurringRows,
  };
}
