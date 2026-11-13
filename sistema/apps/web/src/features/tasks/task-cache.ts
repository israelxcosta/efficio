// What each change to tasks makes stale in the `tasks` query domain (lib/query-keys.ts), so a status,
// a comment or an attachment refreshes only what is built from it (docs/analise-sistema-2026-11.md
// §6, item 9). Pure functions over query keys, tested in task-cache.test.ts.

/** Second segment of the keys built from tasks: lists, summaries, views and histories. */
const TASK_VIEWS = ['list', 'detail', 'home', 'dashboard', 'me', 'calendar', 'report', 'audit', 'recurring', 'flows', 'history'];

/**
 * - `status`: a task or an occurrence cell changed status: every view of tasks and the open/overdue
 *   counts per department (Cadastros).
 * - `task`: a task was created, edited or deleted, or a process (its steps are tasks): also the tasks
 *   per category (Cadastros) and the feed of comments (it shows titles and follows the assignees).
 *
 * Neither touches the pickers and registries — `/tasks/options` (clients, members, departments,
 * categories), the members, the regime groups and the process templates — which only registry
 * changes refresh.
 */
export type TaskChange = 'status' | 'task';

const STALE_AFTER: Record<TaskChange, ReadonlySet<string>> = {
  status: new Set([...TASK_VIEWS, 'departments']),
  task: new Set([...TASK_VIEWS, 'departments', 'categories', 'activity']),
};

/** Whether the query with `key` is stale after `change` (`keepDetail`: a detail already up to date). */
export function staleAfterTaskChange(key: readonly unknown[], change: TaskChange, keepDetail?: string): boolean {
  if (key[0] !== 'tasks' || typeof key[1] !== 'string' || !STALE_AFTER[change].has(key[1])) return false;
  return !(keepDetail !== undefined && key[1] === 'detail' && key[2] === keepDetail);
}

/** A comment, an attachment or a subtask of one task (its detail is patched in place). */
export interface TaskContentChange {
  /** Comments and attachments are events of the task's history; subtasks are not. */
  history?: boolean;
  /** A deleted comment leaves the feed of comments (the author's own never shows there). */
  activity?: boolean;
}

/** Only the lists (their rows show the subtask and comment counters), the task's history and the feed. */
export function staleAfterContentChange(key: readonly unknown[], taskId: string, change: TaskContentChange = {}): boolean {
  if (key[0] !== 'tasks') return false;
  if (key[1] === 'list') return true;
  if (key[1] === 'history') return Boolean(change.history) && key[2] === taskId;
  return Boolean(change.activity) && key[1] === 'activity';
}
