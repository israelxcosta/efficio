// Phrases of a task's history (spec §9.1, item 7): who did what, with the names of the screen and,
// for a single changed field, the values before and after. The description never shows its text
// (it is encrypted). Pure functions, tested in phase2-logic.test.ts.

import { formatDateBR, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, type TaskFieldChange, type TaskHistoryItem, type TaskPriority, type TaskStatus } from '@effinance/shared';
import { shortName } from './due';

export interface TimelinePhrase {
  /** Short name of who did it ("Ana P."), shown in bold; null for the system. */
  actor: string | null;
  /** The rest of the sentence. */
  text: string;
  /** The conclusion dot is the only coloured one. */
  success: boolean;
}

const FIELD_NAMES: Record<string, string> = {
  title: 'o nome',
  description: 'a descrição',
  clientId: 'o cliente',
  categoryId: 'a categoria',
  priority: 'a prioridade',
  startDate: 'o início',
  dueDate: 'o vencimento',
  startTime: 'o horário',
  endTime: 'o horário',
  departmentId: 'o departamento',
  assigneeId: 'o responsável',
};

/** "o vencimento", "o vencimento e a prioridade", "o nome, o cliente e a categoria". */
export function fieldList(fields: string[]): string {
  const names = [...new Set(fields.map((f) => FIELD_NAMES[f] ?? 'um campo'))];
  if (names.length <= 1) return names[0] ?? 'a tarefa';
  return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}

function changeValue(change: TaskFieldChange, value: string | null): string {
  if (value === null || value === '') return 'vazio';
  if (change.field === 'priority') return TASK_PRIORITY_LABELS[value as TaskPriority] ?? value;
  if (change.field === 'dueDate' || change.field === 'startDate') return formatDateBR(value);
  return value;
}

const status = (s: TaskStatus | null) => (s ? TASK_STATUS_LABELS[s] : '—');

export function timelinePhrase(item: TaskHistoryItem): TimelinePhrase {
  const actor = item.actor ? shortName(item.actor.name) : null;
  const by = (text: string, success = false): TimelinePhrase => ({ actor, text, success });
  const system = (text: string, success = false): TimelinePhrase => ({ actor: null, text, success });
  const note = item.note ? `: ${item.note}` : '';
  switch (item.kind) {
    case 'created':
      if (item.origin === 'recurring') return system(`Criada pela tarefa recorrente ${item.originName ?? ''}`.trim());
      if (item.origin === 'flow') return system(`Criada pelo processo ${item.originName ?? ''}`.trim());
      return actor ? by('criou a tarefa') : system('Tarefa criada');
    case 'updated': {
      const shown = item.changes.filter((c) => c.field !== 'endTime' || !item.changes.some((x) => x.field === 'startTime'));
      if (item.fields.length === 1 && shown.length === 1) {
        const c = shown[0]!;
        return by(`alterou ${fieldList([c.field])} de ${changeValue(c, c.from)} para ${changeValue(c, c.to)}`);
      }
      return actor ? by(`alterou ${fieldList(item.fields)}`) : system(`${capitalize(fieldList(item.fields))} mudou${note}`);
    }
    case 'assigned': {
      const to = item.toAssignee ? shortName(item.toAssignee.name) : null;
      const from = item.fromAssignee ? shortName(item.fromAssignee.name) : null;
      if (!item.actor) return system(to ? `Responsável trocado para ${to}${note}` : `Responsável removido${note}`);
      if (!to) return by(`tirou o responsável${from ? ` (estava com ${from})` : ''}`);
      if (item.toAssignee?.id && item.toAssignee.id === item.actor.id) return by('assumiu a tarefa');
      return by(`atribuiu a ${to}`);
    }
    case 'status':
      if (item.toStatus === 'done') return actor ? by('concluiu a tarefa', true) : system('Tarefa concluída', true);
      if (item.toStatus === 'canceled') return actor ? by('cancelou a tarefa') : system(`Tarefa cancelada${note}`);
      if (!actor) return system(`A situação mudou de ${status(item.fromStatus)} para ${status(item.toStatus)}${note}`);
      return by(`mudou a situação de ${status(item.fromStatus)} para ${status(item.toStatus)}`);
    case 'reopened': {
      const back = item.toStatus ? ` (voltou para ${status(item.toStatus)})` : '';
      const reason = item.note ? `: “${item.note}”` : '';
      return actor ? by(`reabriu a tarefa${back}${reason}`) : system(`Tarefa reaberta${back}${reason}`);
    }
    case 'commented':
      return by('comentou');
    case 'comment_removed':
      return by('excluiu um comentário');
    case 'attachment_added':
      return by(`anexou ${item.note ?? 'um arquivo'}`);
    case 'attachment_removed':
      return by(`removeu ${item.note ?? 'um anexo'}`);
    case 'flow_step': {
      const f = item.flow;
      if (!f) return system('Etapa de processo');
      if (f.event === 'activated') return system(`Etapa ${f.position} de ${f.title} começou`);
      if (f.event === 'completed') return actor ? by(`concluiu a etapa ${f.position} de ${f.title}`, true) : system(`Etapa ${f.position} de ${f.title} concluída`, true);
      return system(`A etapa ${f.position} de ${f.title} voltou a aguardar`);
    }
    default:
      return by('alterou a tarefa');
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Conclusions and reopenings of an occurrence (the audit's history, §11.6), newest first: "Concluída
 * por Ana P. em 12/10 às 14:32" and "Reaberta por Bruno C. em 14/10 às 09:10: “motivo”".
 */
export function auditEvents(items: TaskHistoryItem[]): { id: string; kind: 'done' | 'reopened'; who: string | null; at: string; reason: string | null }[] {
  return items
    .filter((i) => (i.kind === 'status' && i.toStatus === 'done') || i.kind === 'reopened')
    .map((i) => ({
      id: i.id,
      kind: i.kind === 'reopened' ? ('reopened' as const) : ('done' as const),
      who: i.actor ? shortName(i.actor.name) : null,
      at: i.createdAt,
      reason: i.kind === 'reopened' ? i.note : null,
    }));
}
