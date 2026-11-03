// LGPD data portability: every record of the workspace, decrypted, as JSON.

import { and, asc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client';
import {
  accounts,
  categories,
  clientDocuments,
  clientFees,
  contacts,
  creditCards,
  goalContributions,
  goals,
  recurrences,
  recurringTaskClients,
  recurringTasks,
  taskAttachments,
  taskCategories,
  taskClientResponsibles,
  taskComments,
  taskDepartmentMembers,
  taskDepartments,
  taskEvents,
  taskFlowSteps,
  taskFlowTemplateSteps,
  taskFlowTemplates,
  taskFlows,
  taskNotes,
  taskSubtasks,
  tasks,
  transactions,
  offices,
  unionClients,
  unionConventions,
  unions,
  userPhotos,
  workspaces,
} from '../../db/schema';
import { platformDecryptBytes } from '../../lib/crypto/platform-keys';
import { toDataUri } from '../../lib/images';
import { PHOTO_KEY } from '../profile/service';
import { getCipher } from '../../lib/crypto/keyring';
import { withTenant } from '../../lib/tenant';
import { CONTACT_ALL_ENCRYPTED_FIELDS } from '../contacts/service';
import { exportOpenFinance } from '../open-finance/service';
import {
  ATTACHMENT_NAME,
  decryptTaskText,
  EVENT_NOTE,
  FLOW_STEP_DESCRIPTION,
  NOTE_CONTENT,
  NOTE_TITLE,
  RECURRING_DESCRIPTION,
  TASK_COMMENT_TEXT,
  TASK_DESCRIPTION,
  TEMPLATE_DESCRIPTION,
  TEMPLATE_STEP_DESCRIPTION,
} from '../tasks/encrypted-text';
import { getSubscriptionRow, listMembers } from './service';
import { summarizeSubscription } from '../billing/entitlements';
import type { Access } from './access';

/**
 * Encrypted columns of `contacts` added in phase 3: the responsible's CPF and the clients' accesses.
 * Decision (spec §13.8, documented in docs/api.md): the owner's export carries them decrypted — it is
 * the portability of the workspace's own data, owner-only, rate-limited and audited (`data.exported`
 * with `includesCredentials`); leaving them out would make the export useless to migrate the office.
 */
const CONTACT_PHASE3_ENCRYPTED = ['responsibleDocument', 'simplesAccessCode', 'accountantPassword'] as const;
const UNION_ENCRYPTED = ['responsibleName', 'responsibleEmail', 'responsiblePhone', 'notes'] as const;
const OFFICE_ENCRYPTED = ['responsibleDocument', 'responsibleEmail', 'responsiblePhone', 'pixKey'] as const;

export async function exportWorkspace(db: DbExecutor, access: Access) {
  const cipher = await getCipher(access.workspaceId);
  // The requester's own profile photo (others' photos are theirs: never in someone else's export).
  const [photo] = await db.select().from(userPhotos).where(eq(userPhotos.userId, access.userId));
  const profilePhoto = photo
    ? {
        contentType: photo.contentType,
        updatedAt: photo.updatedAt,
        dataUri: toDataUri(photo.contentType, await platformDecryptBytes(db, PHOTO_KEY, access.userId, photo.content)),
      }
    : null;
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
    // Phase 3 (migration 0015): clients' documents, unions with their agreements and clients, the office
    // (images as data URIs, the template blocks as stored; null = factory).
    const [documentRows, unionRows, cycleRows, unionClientRows, [officeRow]] = await Promise.all([
      tx.select().from(clientDocuments).orderBy(asc(clientDocuments.clientId), asc(clientDocuments.createdAt)),
      tx.select().from(unions).orderBy(asc(unions.name)),
      tx.select().from(unionConventions).orderBy(asc(unionConventions.unionId), asc(unionConventions.year)),
      tx.select().from(unionClients).orderBy(asc(unionClients.unionId), asc(unionClients.clientId)),
      tx.select().from(offices),
    ]);
    const phase3 = {
      clientDocuments: await Promise.all(
        documentRows.map(async (r) => ({ ...r, note: await decrypt('client_documents', 'note', r.note) })),
      ),
      unions: await Promise.all(unionRows.map((r) => cipher.decryptFields('unions', r, UNION_ENCRYPTED))),
      unionConventions: await Promise.all(cycleRows.map(async (r) => ({ ...r, note: await decrypt('union_conventions', 'note', r.note) }))),
      unionClients: unionClientRows,
      office: officeRow
        ? await (async () => {
            const { logo, contractWatermark, ...rest } = await cipher.decryptFields('offices', officeRow, OFFICE_ENCRYPTED);
            return {
              ...rest,
              logo: logo && officeRow.logoType ? toDataUri(officeRow.logoType, logo) : null,
              contractWatermark: contractWatermark && officeRow.contractWatermarkType ? toDataUri(officeRow.contractWatermarkType, contractWatermark) : null,
            };
          })()
        : null,
    };
    // Phase 2 (migration 0014): recurring tasks, processes and templates, the history of each task,
    // attachment metadata (the files are downloaded one by one: a JSON with every file in base64 could
    // reach gigabytes) and the requester's own notes (notes are private: never someone else's).
    const [recurringRows, recurringClientRows, templateRows, templateStepRows, flowRows, flowStepRows, eventRows, attachmentRows, noteRows] =
      await Promise.all([
        tx.select().from(recurringTasks).orderBy(asc(recurringTasks.createdAt)),
        tx.select().from(recurringTaskClients).orderBy(asc(recurringTaskClients.recurringTaskId), asc(recurringTaskClients.clientId)),
        tx.select().from(taskFlowTemplates).orderBy(asc(taskFlowTemplates.createdAt)),
        tx.select().from(taskFlowTemplateSteps).orderBy(asc(taskFlowTemplateSteps.templateId), asc(taskFlowTemplateSteps.position)),
        tx.select().from(taskFlows).orderBy(asc(taskFlows.createdAt)),
        tx.select().from(taskFlowSteps).orderBy(asc(taskFlowSteps.flowId), asc(taskFlowSteps.position)),
        tx.select().from(taskEvents).orderBy(asc(taskEvents.seq)),
        tx
          .select({
            id: taskAttachments.id,
            taskId: taskAttachments.taskId,
            fileName: taskAttachments.fileName,
            contentType: taskAttachments.contentType,
            sizeBytes: taskAttachments.sizeBytes,
            uploadedBy: taskAttachments.uploadedBy,
            uploadedByName: taskAttachments.uploadedByName,
            createdAt: taskAttachments.createdAt,
          })
          .from(taskAttachments)
          .orderBy(asc(taskAttachments.createdAt)),
        tx
          .select()
          .from(taskNotes)
          .where(and(eq(taskNotes.workspaceId, access.workspaceId), eq(taskNotes.userId, access.userId)))
          .orderBy(asc(taskNotes.createdAt)),
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
        contactRows.map(async ({ documentHash: _hash, ...c }) =>
          cipher.decryptFields('contacts', c, [...CONTACT_ALL_ENCRYPTED_FIELDS, ...CONTACT_PHASE3_ENCRYPTED]),
        ),
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
      recurringTasks: await Promise.all(
        recurringRows.map(async (r) => ({ ...r, description: await decryptTaskText(cipher, RECURRING_DESCRIPTION, r.description) })),
      ),
      recurringTaskClients: recurringClientRows,
      taskFlowTemplates: await Promise.all(
        templateRows.map(async (r) => ({ ...r, description: await decryptTaskText(cipher, TEMPLATE_DESCRIPTION, r.description) })),
      ),
      taskFlowTemplateSteps: await Promise.all(
        templateStepRows.map(async (r) => ({ ...r, description: await decryptTaskText(cipher, TEMPLATE_STEP_DESCRIPTION, r.description) })),
      ),
      taskFlows: flowRows,
      taskFlowSteps: await Promise.all(
        flowStepRows.map(async (r) => ({ ...r, description: await decryptTaskText(cipher, FLOW_STEP_DESCRIPTION, r.description) })),
      ),
      taskEvents: await Promise.all(eventRows.map(async (r) => ({ ...r, note: await decryptTaskText(cipher, EVENT_NOTE, r.note) }))),
      taskAttachments: await Promise.all(
        attachmentRows.map(async (r) => ({ ...r, fileName: await decryptTaskText(cipher, ATTACHMENT_NAME, r.fileName) })),
      ),
      ...phase3,
      taskNotes: await Promise.all(
        noteRows.map(async (r) => ({
          ...r,
          title: await decryptTaskText(cipher, NOTE_TITLE, r.title),
          content: await decryptTaskText(cipher, NOTE_CONTENT, r.content),
        })),
      ),
    };
  });

  return {
    format: 'effinance-export/v1',
    exportedAt: new Date().toISOString(),
    workspace,
    subscription: summarizeSubscription(subscription),
    members: members.map(({ isYou: _you, ...m }) => m),
    profilePhoto,
    ...data,
  };
}
