// Migration 0024: every task has a responsible and a department. The new-task form starts with you as
// the responsible, never sends a task without one, and asks the department only when the responsible
// is in none (the API answers the same 400 otherwise).
import { describe, expect, it } from 'vitest';
import { TASK_ASSIGNEE_REQUIRED_MESSAGE, TASK_DEPARTMENT_REQUIRED_MESSAGE, type TaskMember } from '@effinance/shared';
import { newTaskDefaults, newTaskErrors, newTaskInput } from './components/task-sheet';
import { flowApiErrors, newStep, resolvedStepDepartment, validateFlow } from './flow-logic';
import { recurringInputFromForm, validateRecurring, emptyRecurringForm } from './components/recurring-sheet';
import { FISCAL, makeOptions } from './test-fixtures';

const ME = '0a000000-0000-4000-8000-000000000001';
const LOOSE = '0a000000-0000-4000-8000-000000000002';
const member = (id: string, name: string, department: TaskMember['department'], isYou = false): TaskMember => ({
  id,
  name,
  role: 'editor',
  isAdmin: false,
  department,
  isYou,
  permissionOverrides: {},
  photoUpdatedAt: null,
});
const base = makeOptions();
const o = makeOptions({
  me: { ...base.me, id: ME },
  members: [member(ME, 'Marina Costa', FISCAL, true), member(LOOSE, 'Rafael Lima', null)],
});
const fresh = (patch: Partial<ReturnType<typeof newTaskDefaults>> = {}) => ({ ...newTaskDefaults(new URLSearchParams('nova=1'), o, undefined), title: 'Balancete', ...patch });

describe('new task: responsible and department', () => {
  it('starts with you as the responsible, in any view', () => {
    expect(newTaskDefaults(new URLSearchParams('nova=1'), o, undefined).assigneeId).toBe(ME);
    expect(newTaskDefaults(new URLSearchParams('nova=1&escopo=todas'), o, undefined).assigneeId).toBe(ME);
  });

  it('does not send a task without responsible', () => {
    const input = newTaskInput(fresh({ assigneeId: '' }));
    expect(newTaskErrors(input, o)).toEqual({ assigneeId: `${TASK_ASSIGNEE_REQUIRED_MESSAGE}.` });
  });

  it('asks the department only when the responsible is in none', () => {
    expect(newTaskErrors(newTaskInput(fresh()), o)).toEqual({});
    expect(newTaskErrors(newTaskInput(fresh({ assigneeId: LOOSE })), o)).toEqual({ departmentId: `${TASK_DEPARTMENT_REQUIRED_MESSAGE}.` });
    expect(newTaskErrors(newTaskInput(fresh({ assigneeId: LOOSE, departmentId: FISCAL.id })), o)).toEqual({});
  });
});

describe('recurring task: department and default responsible', () => {
  it('requires both', () => {
    const form = { ...emptyRecurringForm('2026-10'), name: 'DCTFWeb', dueDay: '15', regimes: ['mei' as const] };
    expect(validateRecurring(form)).toMatchObject({ departmentId: 'Escolha o departamento.', assigneeId: 'Escolha o responsável padrão.' });
    expect(validateRecurring({ ...form, departmentId: FISCAL.id, assigneeId: ME })).toEqual({});
    expect(recurringInputFromForm({ ...form, departmentId: FISCAL.id, assigneeId: ME })).toMatchObject({ departmentId: FISCAL.id, assigneeId: ME });
  });
});

describe('process steps: the department', () => {
  it('resolves like the API: the responsible’s, else the step’s, else yours', () => {
    expect(resolvedStepDepartment({ assigneeId: '', departmentId: '' }, o.members)).toBe(FISCAL.id);
    expect(resolvedStepDepartment({ assigneeId: LOOSE, departmentId: '' }, o.members)).toBeNull();
    expect(resolvedStepDepartment({ assigneeId: LOOSE, departmentId: 'd2' }, o.members)).toBe('d2');
  });

  it('marks the step left without department (locally and from the 400)', () => {
    const steps = [{ ...newStep(), title: 'Coletar documentos', relativeDays: '0' }, { ...newStep(), title: 'Protocolar', assigneeId: LOOSE }];
    const e = validateFlow('Abertura', null, steps, o.members, false);
    expect(e.step[steps[1]!.key]?.department).toBe('Etapa 2: escolha o departamento.');
    expect(e.step[steps[0]!.key]?.department).toBeUndefined();
    expect(flowApiErrors({ 'steps.1.departmentId': 'Etapa 2: escolha o departamento' }, steps).step[steps[1]!.key]).toEqual({ department: 'Etapa 2: escolha o departamento.' });
  });
});
