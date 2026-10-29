// LGPD data portability: every record of the workspace, decrypted, as JSON.

import { asc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client';
import {
  accounts,
  categories,
  clientFees,
  contacts,
  creditCards,
  goalContributions,
  goals,
  recurrences,
  taskCategories,
  taskClientResponsibles,
  taskComments,
  taskDepartmentMembers,
  taskDepartments,
  taskSubtasks,
  tasks,
  transactions,
  workspaces,
} from '../../db/schema';
import { getCipher } from '../../lib/crypto/keyring';
import { withTenant } from '../../lib/tenant';
import { CONTACT_ALL_ENCRYPTED_FIELDS } from '../contacts/service';
import { exportOpenFinance } from '../open-finance/service';
import { decryptTaskText, TASK_COMMENT_TEXT, TASK_DESCRIPTION } from '../tasks/encrypted-text';
import { getSubscriptionRow, listMembers } from './service';
import { summarizeSubscription } from '../billing/entitlements';
import type { Access } from './access';

export async function exportWorkspace(db: DbExecutor, access: Access) {
  const cipher = await getCipher(access.workspaceId);
  const [[workspace], members, subscription] = await Promise.all([
    db
      .select({ id: workspaces.id, name: workspaces.name, kind: workspaces.kind, createdAt: workspaces.createdAt })
      .from(workspaces)
      .where(eq(workspaces.id, access.workspaceId)),
    listMembers(db, access),
    getSubscriptionRow(db, access.workspaceId),
  ]);

  const data = await withTenant(db, access.workspaceId, async (tx) => {
    const [cats, accs, cards, goalRows, contributionRows, contactRows, feeRows, seriesRows, txRows] = await Promise.all([
      tx.select().from(categories).orderBy(asc(categories.createdAt)),
      tx.select().from(accounts).orderBy(asc(accounts.createdAt)),
      tx.select().from(creditCards).orderBy(asc(creditCards.createdAt)),
      tx.select().from(goals).orderBy(asc(goals.createdAt)),
      tx.select().from(goalContributions).orderBy(asc(goalContributions.date)),
      tx.select().from(contacts).orderBy(asc(contacts.name)),
      tx.select().from(clientFees).orderBy(asc(clientFees.clientId), asc(clientFees.periodIndex)),
      tx.select().from(recurrences).orderBy(asc(recurrences.createdAt)),
      tx.select().from(transactions).orderBy(asc(transactions.date), asc(transactions.createdAt)),
    ]);
    const decrypt = (table: string, column: string, value: string | null) => cipher.decrypt(table, column, value);
    // Connections and import batches: metadata only (no aggregator ids, blind indexes or cursors).
    const integrations = await exportOpenFinance(tx);
    // Task module (migration 0011): registries, tasks with their subtasks and comments (authorship as
    // recorded: user id and the name at the time; descriptions and comments decrypted, migration 0013).
    const [departments, departmentMembers, taskCats, taskRows, subtaskRows, commentRows, responsibleRows] =
      await Promise.all([
        tx.select().from(taskDepartments).orderBy(asc(taskDepartments.createdAt)),
        tx.select().from(taskDepartmentMembers).orderBy(asc(taskDepartmentMembers.createdAt)),
        tx.select().from(taskCategories).orderBy(asc(taskCategories.createdAt)),
        tx.select().from(tasks).orderBy(asc(tasks.createdAt), asc(tasks.id)),
        tx.select().from(taskSubtasks).orderBy(asc(taskSubtasks.createdAt), asc(taskSubtasks.id)),
        tx.select().from(taskComments).orderBy(asc(taskComments.createdAt), asc(taskComments.id)),
        tx.select().from(taskClientResponsibles).orderBy(asc(taskClientResponsibles.clientId)),
      ]);
    return {
      categories: cats,
      accounts: accs,
      creditCards: cards,
      goals: await Promise.all(goalRows.map(async (g) => ({ ...g, notes: await decrypt('goals', 'notes', g.notes) }))),
      goalContributions: await Promise.all(
        contributionRows.map(async (c) => ({ ...c, note: await decrypt('goal_contributions', 'note', c.note) })),
      ),
      contacts: await Promise.all(
        contactRows.map(async ({ documentHash: _hash, ...c }) => cipher.decryptFields('contacts', c, CONTACT_ALL_ENCRYPTED_FIELDS)),
      ),
      // Fee periods (honorários): dates derive from the client's contract start + period index.
      clientFees: feeRows,
      recurrences: await Promise.all(
        seriesRows.map(async (r) => ({
          ...r,
          template: { ...r.template, notes: await decrypt('transactions', 'notes', r.template.notes) },
        })),
      ),
      // externalId is the source's identifier (FITID / aggregator transaction id): not exported.
      transactions: await Promise.all(
        txRows.map(async ({ externalId: _external, ...t }) => ({ ...t, notes: await decrypt('transactions', 'notes', t.notes) })),
      ),
      ...integrations,
      taskDepartments: departments,
      taskDepartmentMembers: departmentMembers,
      taskCategories: taskCats,
      tasks: await Promise.all(
        taskRows.map(async (t) => ({ ...t, description: await decryptTaskText(cipher, TASK_DESCRIPTION, t.description) })),
      ),
      taskSubtasks: subtaskRows,
      taskComments: await Promise.all(
        commentRows.map(async (c) => ({ ...c, text: await decryptTaskText(cipher, TASK_COMMENT_TEXT, c.text) })),
      ),
      taskClientResponsibles: responsibleRows,
    };
  });

  return {
    format: 'effinance-export/v1',
    exportedAt: new Date().toISOString(),
    workspace,
    subscription: summarizeSubscription(subscription),
    members: members.map(({ isYou: _you, ...m }) => m),
    ...data,
  };
}
