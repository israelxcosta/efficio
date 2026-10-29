// Builders for the task module tests.

import type { Task, TaskDetail, TaskOptionsResponse } from '@effinance/shared';

export function makeTask(patch: Partial<Task>): Task {
  return {
    id: patch.id ?? 't',
    title: 'Balancete',
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
    flow: null,
    createdBy: null,
    createdAt: '2026-10-01T12:00:00Z',
    updatedAt: '2026-10-01T12:00:00Z',
    ...patch,
  };
}

export function makeDetail(patch: Partial<TaskDetail> = {}): TaskDetail {
  return { ...makeTask(patch), description: null, subtasks: [], comments: [], flowProgress: null, ...patch };
}

export const FISCAL = { id: '11111111-1111-4111-8111-111111111111', name: 'Fiscal' };
export const CONTABIL = { id: '22222222-2222-4222-8222-222222222222', name: 'Contábil' };

export function makeOptions(patch: Partial<TaskOptionsResponse> = {}): TaskOptionsResponse {
  return {
    today: '2026-10-28',
    me: { id: 'me', name: 'Marina Costa', role: 'owner', department: FISCAL, isAdmin: true, canWrite: true },
    members: [
      { id: 'me', name: 'Marina Costa', role: 'owner', isAdmin: true, department: FISCAL, isYou: true },
      { id: 'ana', name: 'Ana Paula Ribeiro', role: 'editor', isAdmin: true, department: FISCAL, isYou: false },
      { id: 'bruno', name: 'Bruno Carvalho', role: 'viewer', isAdmin: false, department: CONTABIL, isYou: false },
      { id: 'rafael', name: 'Rafael Lima', role: 'viewer', isAdmin: false, department: null, isYou: false },
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
