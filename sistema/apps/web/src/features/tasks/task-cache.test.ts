// What a change to tasks refreshes in the `tasks` query domain: lists and summaries, never the pickers
// (`/tasks/options`), the members, the process templates or the regime groups.
import { describe, expect, it } from 'vitest';
import { qk } from '@/lib/query-keys';
import { staleAfterContentChange, staleAfterTaskChange } from './task-cache';

type Key = readonly unknown[];

const PICKERS: Key[] = [qk.taskOptions, qk.taskMembers, qk.flowTemplates, qk.regimeGroups];
const VIEWS: Key[] = [
  qk.tasks({ scope: 'mine' }),
  qk.task('t1'),
  qk.taskHome({}),
  qk.taskDashboard({}),
  qk.taskMyOverview('2026-11'),
  qk.taskCalendar({}),
  qk.taskReport({}),
  qk.taskAudit({}),
  qk.recurringTasks({}),
  qk.recurringTask('r1', '2026-11'),
  qk.recurringOccurrence('r1', '2026-11'),
  qk.taskFlows({}),
  qk.taskFlow('f1'),
  qk.taskHistory('t1'),
];

describe('a status change', () => {
  it('refreshes every view of tasks and the open/overdue counts per department', () => {
    for (const key of [...VIEWS, qk.taskDepartments]) expect(staleAfterTaskChange(key, 'status'), String(key)).toBe(true);
  });

  it('leaves the pickers, the members, the templates and the regime groups alone', () => {
    for (const key of PICKERS) expect(staleAfterTaskChange(key, 'status'), String(key)).toBe(false);
  });

  it('does not touch what a status cannot change: tasks per category and the feed of comments', () => {
    expect(staleAfterTaskChange(qk.taskCategories, 'status')).toBe(false);
    expect(staleAfterTaskChange(qk.taskActivity, 'status')).toBe(false);
  });

  it('keeps the detail the server has just answered, and only that one', () => {
    expect(staleAfterTaskChange(qk.task('t1'), 'status', 't1')).toBe(false);
    expect(staleAfterTaskChange(qk.task('t2'), 'status', 't1')).toBe(true);
    expect(staleAfterTaskChange(qk.taskHistory('t1'), 'status', 't1')).toBe(true);
  });

  it('ignores the other domains', () => {
    for (const key of [qk.taskNotes, qk.allClients, qk.clients({}), qk.report('delinquency'), qk.me]) expect(staleAfterTaskChange(key, 'status')).toBe(false);
  });
});

describe('a task created, edited or deleted', () => {
  it('also refreshes the tasks per category and the feed (titles, assignees)', () => {
    for (const key of [...VIEWS, qk.taskDepartments, qk.taskCategories, qk.taskActivity]) expect(staleAfterTaskChange(key, 'task'), String(key)).toBe(true);
  });

  it('still leaves the pickers and registries alone', () => {
    for (const key of PICKERS) expect(staleAfterTaskChange(key, 'task'), String(key)).toBe(false);
  });
});

describe('a comment, an attachment or a subtask', () => {
  const stale = (change?: Parameters<typeof staleAfterContentChange>[2]) =>
    [...VIEWS, ...PICKERS, qk.taskDepartments, qk.taskCategories, qk.taskActivity, qk.taskHistory('t2')].filter((key) => staleAfterContentChange(key, 't1', change));

  it('a subtask refreshes only the lists (their rows show the counters)', () => {
    expect(stale()).toEqual([qk.tasks({ scope: 'mine' })]);
  });

  it('a comment or an attachment adds the history of that task', () => {
    expect(stale({ history: true })).toEqual([qk.tasks({ scope: 'mine' }), qk.taskHistory('t1')]);
  });

  it('a deleted comment adds the feed of comments', () => {
    expect(stale({ history: true, activity: true })).toEqual([qk.tasks({ scope: 'mine' }), qk.taskHistory('t1'), qk.taskActivity]);
  });
});

describe('every key of the tasks domain', () => {
  it('is either a view of tasks or a known picker (classify a new key in task-cache.ts)', () => {
    const keys = Object.values(qk)
      .map((k) => (typeof k === 'function' ? (k as (...args: unknown[]) => Key)() : (k as Key)))
      .filter((k) => k[0] === 'tasks');
    expect(keys.length).toBeGreaterThan(15);
    const pickers = new Set(PICKERS.map((k) => k[1]));
    for (const key of keys) expect(staleAfterTaskChange(key, 'task') || pickers.has(key[1]), String(key)).toBe(true);
  });
});
