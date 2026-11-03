// Processes and templates (spec §12): the drafts of the steps editor, what goes to the API, the
// preview of the deadlines and the list of tasks an application creates. Pure functions, tested in
// phase2-logic.test.ts.

import {
  addDays,
  flowTemplateInputSchema,
  taskFlowInputSchema,
  type FlowTemplate,
  type FlowTemplateInput,
  type ISODate,
  type TaskFlowInput,
  type TaskMember,
  type TaskPriority,
} from '@effinance/shared';
import { daysText, shortDate, shortName } from './due';

export interface StepDraft {
  key: string;
  title: string;
  description: string;
  departmentId: string;
  categoryId: string;
  assigneeId: string;
  priority: TaskPriority;
  /** Builder only: a deadline in days after the previous step or a fixed date. */
  mode: 'days' | 'date';
  relativeDays: string;
  dueDate: string;
  /** Builder only: another client for this step ('' = the process's). */
  clientId: string;
  showDescription?: boolean;
  showCategory?: boolean;
  showClient?: boolean;
}

let seq = 0;
const nextKey = () => `step-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function newStep(previous?: StepDraft): StepDraft {
  return {
    key: nextKey(),
    title: '',
    description: '',
    departmentId: previous && !previous.assigneeId ? previous.departmentId : '',
    categoryId: '',
    assigneeId: previous?.assigneeId ?? '',
    priority: 'medium',
    mode: 'days',
    relativeDays: '1',
    dueDate: '',
    clientId: '',
  };
}

export function stepsOfTemplate(t: FlowTemplate): StepDraft[] {
  return t.steps.map((s) => ({
    key: nextKey(),
    title: s.title,
    description: s.description ?? '',
    departmentId: s.department?.id ?? '',
    categoryId: s.category?.id ?? '',
    assigneeId: s.assignee?.id ?? '',
    priority: s.priority,
    mode: 'days',
    relativeDays: String(s.relativeDays),
    dueDate: '',
    clientId: '',
    showDescription: Boolean(s.description),
    showCategory: Boolean(s.category),
  }));
}

/** Moves a step up or down (Alt+↑/↓ on the handle, the menu, dragging). */
export function moveStep<T>(steps: T[], from: number, to: number): T[] {
  if (to < 0 || to >= steps.length || from === to) return steps;
  const next = [...steps];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** The department of a step follows its assignee (like a task); without one, the queue chosen. */
export function stepDepartmentId(step: Pick<StepDraft, 'assigneeId' | 'departmentId'>, members: TaskMember[]): string | null {
  const member = members.find((m) => m.id === step.assigneeId);
  if (member?.department) return member.department.id;
  return step.departmentId || null;
}

export function templateInputOf(title: string, description: string, steps: StepDraft[], members: TaskMember[]): FlowTemplateInput {
  return {
    title,
    description: description.trim() || null,
    steps: steps.map((s) => ({
      title: s.title,
      description: s.description.trim() || null,
      departmentId: stepDepartmentId(s, members),
      categoryId: s.categoryId || null,
      assigneeId: s.assigneeId || null,
      priority: s.priority,
      relativeDays: s.relativeDays.trim() === '' ? (Number.NaN as number) : Number(s.relativeDays),
    })),
  };
}

export function flowInputOf(title: string, clientId: string | null, steps: StepDraft[], members: TaskMember[], saveAsTemplate: boolean): TaskFlowInput {
  return {
    title,
    clientId,
    saveAsTemplate,
    steps: steps.map((s) => ({
      title: s.title,
      description: s.description.trim() || null,
      clientId: s.clientId || null,
      departmentId: stepDepartmentId(s, members),
      categoryId: s.categoryId || null,
      assigneeId: s.assigneeId || null,
      priority: s.priority,
      dueDate: s.mode === 'date' ? s.dueDate || null : null,
      relativeDays: s.mode === 'days' ? (s.relativeDays.trim() === '' ? 0 : Number(s.relativeDays)) : null,
    })),
  };
}

export interface FlowErrors {
  title?: string;
  steps?: string;
  saveAsTemplate?: string;
  /** Per step key: the title or the deadline. */
  step: Record<string, { title?: string; deadline?: string }>;
}

const dot = (m: string) => (m.endsWith('.') ? m : `${m}.`);

/** Validation of the template editor with the contract's schema (messages of the screen). */
export function validateTemplate(title: string, description: string, steps: StepDraft[], members: TaskMember[]): FlowErrors {
  const out: FlowErrors = { step: {} };
  const parsed = flowTemplateInputSchema.safeParse(templateInputOf(title, description, steps, members));
  if (parsed.success) return out;
  for (const issue of parsed.error.issues) {
    const [head, index, field] = issue.path as (string | number)[];
    if (head === 'title') out.title ??= dot(issue.message);
    else if (head === 'steps' && index === undefined) out.steps ??= dot(issue.message);
    else if (head === 'steps' && typeof index === 'number') {
      const key = steps[index]?.key;
      if (!key) continue;
      const e = (out.step[key] ??= {});
      if (field === 'title') e.title ??= dot(issue.message);
      else e.deadline ??= 'O prazo deve ficar entre 0 e 365 dias.';
    }
  }
  return out;
}

export function validateFlow(title: string, clientId: string | null, steps: StepDraft[], members: TaskMember[], saveAsTemplate: boolean): FlowErrors {
  const out: FlowErrors = { step: {} };
  for (const s of steps) if (s.mode === 'date' && !s.dueDate) (out.step[s.key] ??= {}).deadline = 'Informe a data da etapa.';
  const parsed = taskFlowInputSchema.safeParse(flowInputOf(title, clientId, steps, members, saveAsTemplate));
  if (parsed.success) return out;
  for (const issue of parsed.error.issues) {
    const [head, index, field] = issue.path as (string | number)[];
    if (head === 'title') out.title ??= dot(issue.message);
    else if (head === 'saveAsTemplate') out.saveAsTemplate ??= dot(issue.message);
    else if (head === 'steps' && index === undefined) out.steps ??= dot(issue.message);
    else if (head === 'steps' && typeof index === 'number') {
      const key = steps[index]?.key;
      if (!key) continue;
      const e = (out.step[key] ??= {});
      if (field === 'title') e.title ??= dot(issue.message);
      else e.deadline ??= dot(issue.message);
    }
  }
  return out;
}

export const hasFlowErrors = (e: FlowErrors) => Boolean(e.title || e.steps || e.saveAsTemplate || Object.keys(e.step).length);

/** "Se aplicado hoje (29/10): a etapa 1 vence em 30/10; as outras contam da conclusão da anterior (+2, +3, +5 e +6 dias)." */
export function templatePreview(days: number[], today: ISODate): string {
  if (days.length === 0) return '';
  const first = `Se aplicado hoje (${shortDate(today, today)}): a etapa 1 vence ${days[0] === 0 ? 'no mesmo dia' : `em ${shortDate(addDays(today, days[0]!), today)}`}`;
  if (days.length === 1) return `${first}.`;
  const rest = days.slice(1).map((d) => `+${d}`);
  const list = rest.length === 1 ? rest[0]! : `${rest.slice(0, -1).join(', ')} e ${rest.at(-1)}`;
  return `${first}; ${days.length === 2 ? 'a outra conta' : 'as outras contam'} da conclusão da anterior (${list} ${rest.length === 1 && days[1] === 1 ? 'dia' : 'dias'}).`;
}

/** "1. Solicitar documentos · Marina S. · vence 30/10 (criada agora)", "2. … · 2 dias após a etapa 1". */
export function applyPreview(t: Pick<FlowTemplate, 'steps'>, today: ISODate): string[] {
  return t.steps.map((s, i) => {
    const who = s.assignee ? shortName(s.assignee.name) : 'Sem responsável';
    const when = i === 0 ? `vence ${shortDate(addDays(today, s.relativeDays), today)} (criada agora)` : s.relativeDays === 0 ? `no dia da conclusão da etapa ${i}` : `${daysText(s.relativeDays)} após a etapa ${i}`;
    return `${i + 1}. ${s.title} · ${who} · ${when}`;
  });
}

/** "Societário e Fiscal" / "Sem departamento definido". */
export function templateDepartments(t: Pick<FlowTemplate, 'departments'>): string {
  const names = t.departments.map((d) => d.name);
  if (names.length === 0) return 'Sem departamento definido';
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}
