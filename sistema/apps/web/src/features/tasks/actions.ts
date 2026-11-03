// Which actions each menu shows, by role and record (spec §2.6): registries, deletions and editing
// templates are for administrators; every member works on tasks, occurrences and processes. A
// permanent restriction hides the control (the page says it once). Pure, tested in phase2-logic.test.ts.

import type { RecurringTask, TaskDetail, TaskFlow } from '@effinance/shared';

export type RecurringAction = 'edit' | 'view' | 'audit' | 'calendar' | 'duplicate' | 'end' | 'reactivate' | 'delete';

/** "⋯" of a recurring task: Editar (Ver), auditoria, calendário; Duplicar, Encerrar/Reativar; Excluir before any task exists. */
export function recurringActions(r: Pick<RecurringTask, 'active' | 'occurrenceCount'>, p: { canEdit: boolean; canDelete: boolean }): RecurringAction[] {
  const out: RecurringAction[] = [p.canEdit ? 'edit' : 'view', 'audit', 'calendar'];
  if (p.canEdit) {
    out.push('duplicate', r.active ? 'end' : 'reactivate');
    if (p.canDelete && r.occurrenceCount === 0) out.push('delete');
  }
  return out;
}

export type TemplateAction = 'edit' | 'duplicate' | 'view' | 'delete';

/** "⋯" of a process template ("Aplicar" is a button for everyone, outside the menu). */
export function templateActions(p: { canEdit: boolean; canDelete: boolean }): TemplateAction[] {
  const out: TemplateAction[] = p.canEdit ? ['edit', 'duplicate'] : ['view'];
  if (p.canDelete) out.push('delete');
  return out;
}

export type FlowAction = 'open-step' | 'steps' | 'delete';

/** "⋯" of a process: the current step, its steps; deleting the process is for administrators. */
export function flowActions(f: Pick<TaskFlow, 'currentStep'>, p: { canDelete: boolean }): FlowAction[] {
  const out: FlowAction[] = [];
  if (f.currentStep?.task) out.push('open-step');
  out.push('steps');
  if (p.canDelete) out.push('delete');
  return out;
}

export type DetailAction = 'duplicate' | 'copy-link' | 'cancel' | 'delete';

/** "⋯" of the task sheet's footer: an occurrence is never duplicated nor deleted (it is canceled). */
export function detailActions(t: Pick<TaskDetail, 'occurrence' | 'status'>, p: { isAdmin: boolean }): DetailAction[] {
  const out: DetailAction[] = [];
  if (!t.occurrence) out.push('duplicate');
  out.push('copy-link');
  if (t.status !== 'canceled') out.push('cancel');
  if (p.isAdmin && !t.occurrence) out.push('delete');
  return out;
}

/**
 * The main button of the task sheet: concluir an open task; reabrir a closed one; a concluded
 * occurrence (an audit record) reopens with the reason, and only for who may (`canReopen`).
 */
export function primaryAction(t: Pick<TaskDetail, 'occurrence' | 'status' | 'canReopen'>): 'conclude' | 'reopen' | 'reopen-with-reason' | 'none' {
  if (t.occurrence && t.status === 'done') return t.canReopen ? 'reopen-with-reason' : 'none';
  if (t.status === 'done' || t.status === 'canceled') return 'reopen';
  return 'conclude';
}
