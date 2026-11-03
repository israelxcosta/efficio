// Builders for the task module tests.

import { rolePermissions, type Task, type TaskDetail, type TaskOptionsResponse } from '@effinance/shared';

export function makeTask(patch: Partial<Task>): Task {
  return {
    id: patch.id ?? 't',
    title: 'Balancete',
    kind: 'standalone',
    status: 'todo',
    reopenStatus: 'todo',
    priority: 'medium',
    client: null,
    department: null,
    category: null,
    assignee: null,
    startDate: null,
    dueDate: null,
    startTime: null,
    endTime: null,
    overdue: false,
    daysOverdue: 0,
    completedAt: null,
    completedBy: null,
    subtaskCount: { done: 0, total: 0 },
    commentCount: 0,
    attachmentCount: 0,
    flow: null,
    occurrence: null,
    createdBy: null,
    createdAt: '2026-10-01T12:00:00Z',
    updatedAt: '2026-10-01T12:00:00Z',
    ...patch,
  };
}

export function makeDetail(patch: Partial<TaskDetail> = {}): TaskDetail {
  return {
    ...makeTask(patch),
    description: null,
    subtasks: [],
    comments: [],
    attachments: [],
    flowProgress: null,
    lockedFields: [],
    canReopen: false,
    ...patch,
  };
}

export const FISCAL = { id: '11111111-1111-4111-8111-111111111111', name: 'Fiscal' };
export const CONTABIL = { id: '22222222-2222-4222-8222-222222222222', name: 'Contábil' };

export function makeOptions(patch: Partial<TaskOptionsResponse> = {}): TaskOptionsResponse {
  return {
    today: '2026-10-28',
    me: { id: 'me', name: 'Marina Costa', role: 'owner', department: FISCAL, isAdmin: true, canWrite: true, permissions: rolePermissions('owner') },
    members: [
      { id: 'me', name: 'Marina Costa', role: 'owner', isAdmin: true, department: FISCAL, isYou: true, permissionOverrides: {}, photoUpdatedAt: null },
      { id: 'ana', name: 'Ana Paula Ribeiro', role: 'editor', isAdmin: true, department: FISCAL, isYou: false, permissionOverrides: {}, photoUpdatedAt: null },
      { id: 'bruno', name: 'Bruno Carvalho', role: 'viewer', isAdmin: false, department: CONTABIL, isYou: false, permissionOverrides: {}, photoUpdatedAt: null },
      { id: 'rafael', name: 'Rafael Lima', role: 'viewer', isAdmin: false, department: null, isYou: false, permissionOverrides: {}, photoUpdatedAt: null },
    ],
    departments: [CONTABIL, FISCAL],
    categories: [{ id: 'cat', name: 'Impostos', icon: 'receipt', color: '#152B61', taskCount: 0, createdAt: '2026-01-01T00:00:00Z' }],
    clients: [
      { id: 'c1', name: 'Padaria', legalName: 'Padaria Pão Quente Ltda', taxRegime: 'simples_nacional', status: 'active', contractStartDate: '2025-01-01', inactivatedAt: null },
      { id: 'c2', name: 'Antiga', legalName: 'Antiga Ltda', taxRegime: 'real_profit', status: 'inactive', contractStartDate: '2020-01-01', inactivatedAt: '2026-01-01' },
    ],
    clientResponsibles: [{ clientId: 'c1', departmentId: CONTABIL.id, user: { id: 'bruno', name: 'Bruno Carvalho' } }],
    ...patch,
  };
}

export function makeOccurrence(patch: Partial<import('@effinance/shared').RecurringOccurrence> = {}): import('@effinance/shared').RecurringOccurrence {
  return {
    recurringTaskId: 'r1',
    name: 'DCTFWeb',
    period: 'monthly',
    periodKey: '2026-10',
    competence: '2026-10',
    referenceMonth: '2026-09',
    legalDueDate: '2026-10-30',
    targetDate: '2026-10-28',
    department: FISCAL,
    category: null,
    defaultAssignee: { id: 'ana', name: 'Ana Paula Ribeiro' },
    assignees: [
      { assignee: { id: 'me', name: 'Marina Costa' }, count: 3 },
      { assignee: { id: 'ana', name: 'Ana Paula Ribeiro' }, count: 2 },
    ],
    total: 5,
    done: 1,
    doneLate: 0,
    canceled: 0,
    inProgress: 1,
    pending: 4,
    overdue: false,
    daysOverdue: 0,
    targetMissed: false,
    status: 'in_progress',
    ...patch,
  };
}

export function makeCell(patch: Partial<import('@effinance/shared').OccurrenceCell> = {}): import('@effinance/shared').OccurrenceCell {
  return {
    taskId: 'cell',
    recurringTaskId: 'r1',
    clientId: 'c1',
    periodKey: '2026-10',
    competence: '2026-10',
    status: 'todo',
    situation: 'not_started',
    assignee: { id: 'ana', name: 'Ana Paula Ribeiro' },
    assigneeSource: 'client',
    legalDueDate: '2026-10-30',
    targetDate: '2026-10-28',
    overdue: false,
    targetMissed: false,
    concludedBy: null,
    concludedAt: null,
    concludedOnTime: null,
    canReopen: false,
    ...patch,
  };
}
