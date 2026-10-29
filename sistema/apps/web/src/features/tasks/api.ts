import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  Client,
  ClientListResponse,
  ClientResponsible,
  ClientResponsibleInput,
  ClientResponsiblesResponse,
  TaskActivityItem,
  TaskCategory,
  TaskCategoryInput,
  TaskComment,
  TaskDepartment,
  TaskDepartmentInput,
  TaskDetail,
  TaskHomeResponse,
  TaskInput,
  TaskListResponse,
  TaskMember,
  TaskOptionsResponse,
  TaskQuery,
  TaskSubtask,
  TaskUpdateInput,
} from '@effinance/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { isUuid } from '@/lib/safe-url';

// Hooks of the task module (Gestão de tarefas, phase 1). Every member reads and writes tasks; the
// registries are written by administrators (the API answers 403 otherwise, and the screens hide those
// controls). Keys live under the `tasks` domain so one invalidation refreshes lists, summaries,
// the home page and the pickers.

export function invalidateTasks(qc: QueryClient, { keepDetail }: { keepDetail?: string } = {}) {
  return qc.invalidateQueries({
    queryKey: ['tasks'],
    predicate: keepDetail ? (q) => !(q.queryKey[1] === 'detail' && q.queryKey[2] === keepDetail) : undefined,
  });
}

/** Pickers, today, who I am and whether I am an administrator: one request for the whole module. */
export function useTaskOptions() {
  return useQuery({
    queryKey: qk.taskOptions,
    queryFn: () => api<TaskOptionsResponse>('/tasks/options'),
    staleTime: 60_000,
  });
}

export function useTasks(query: TaskQuery, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.tasks(query as Record<string, unknown>),
    queryFn: () => api<TaskListResponse>('/tasks', { query: query as Record<string, string | number | boolean | undefined> }),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: qk.task(id ?? ''),
    queryFn: () => api<TaskDetail>(`/tasks/${id}`),
    enabled: isUuid(id),
  });
}

export function useTaskHome(departmentId: string | 'all' | undefined, options: { enabled?: boolean } = {}) {
  const query = departmentId ? { departmentId } : {};
  return useQuery({
    queryKey: qk.taskHome(query),
    queryFn: () => api<TaskHomeResponse>('/tasks/home', { query }),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useTaskDepartments() {
  return useQuery({ queryKey: qk.taskDepartments, queryFn: () => api<TaskDepartment[]>('/tasks/departments') });
}

export function useTaskCategories() {
  return useQuery({ queryKey: qk.taskCategories, queryFn: () => api<TaskCategory[]>('/tasks/categories') });
}

export function useTaskMembers(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.taskMembers,
    queryFn: () => api<TaskMember[]>('/tasks/members'),
    staleTime: 60_000,
    enabled: options.enabled ?? true,
  });
}

export function useClientResponsibles() {
  return useQuery({
    queryKey: qk.clientResponsibles,
    queryFn: () => api<ClientResponsiblesResponse>('/tasks/client-responsibles'),
  });
}

export function useTaskActivity(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.taskActivity,
    queryFn: () => api<TaskActivityItem[]>('/tasks/activity'),
    staleTime: 60_000,
    enabled: options.enabled ?? true,
  });
}

/**
 * Every client with its contacts (all pages of `/clients`, open to every member; fees come null for
 * collaborators and are never shown here). The Gestão filters by responsible and department, which
 * the paginated endpoint does not know, so the screen filters and pages on its own.
 */
export async function fetchAllClients(): Promise<Client[]> {
  const out: Client[] = [];
  for (let page = 1; page <= 50; page++) {
    const res = await api<ClientListResponse>('/clients', { query: { status: 'all', page, pageSize: 200 } });
    out.push(...res.items);
    if (out.length >= res.total || res.items.length === 0) break;
  }
  return out;
}

export function useAllClients() {
  return useQuery({ queryKey: qk.allClients, queryFn: fetchAllClients, staleTime: 60_000 });
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskInput) => api<TaskDetail>('/tasks', { method: 'POST', body: input }),
    onSuccess: (task) => {
      qc.setQueryData(qk.task(task.id), task);
      void invalidateTasks(qc, { keepDetail: task.id });
    },
  });
}

/** Autosave of one or more fields (PATCH sends only what changed). */
export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskUpdateInput }) =>
      api<TaskDetail>(`/tasks/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: (task) => {
      qc.setQueryData(qk.task(task.id), task);
      void invalidateTasks(qc, { keepDetail: task.id });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: (_void, id) => {
      qc.removeQueries({ queryKey: qk.task(id) });
      void invalidateTasks(qc);
    },
  });
}

function patchDetail(qc: QueryClient, id: string, fn: (t: TaskDetail) => TaskDetail) {
  qc.setQueryData<TaskDetail>(qk.task(id), (old) => (old ? fn(old) : old));
}

function subtaskCount(subtasks: TaskSubtask[]) {
  return { done: subtasks.filter((s) => s.done).length, total: subtasks.length };
}

export function useAddSubtask(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => api<TaskSubtask>(`/tasks/${taskId}/subtasks`, { method: 'POST', body: { title } }),
    onSuccess: (sub) => {
      patchDetail(qc, taskId, (t) => {
        const subtasks = [...t.subtasks, sub];
        return { ...t, subtasks, subtaskCount: subtaskCount(subtasks) };
      });
      void invalidateTasks(qc, { keepDetail: taskId });
    },
  });
}

export function useUpdateSubtask(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { title?: string; done?: boolean } }) =>
      api<TaskSubtask>(`/tasks/${taskId}/subtasks/${id}`, { method: 'PATCH', body: patch }),
    // The checkbox and the progress move at once; an error puts them back.
    onMutate: ({ id, patch }) => {
      const before = qc.getQueryData<TaskDetail>(qk.task(taskId));
      patchDetail(qc, taskId, (t) => {
        const subtasks = t.subtasks.map((s) => (s.id === id ? { ...s, ...patch } : s));
        return { ...t, subtasks, subtaskCount: subtaskCount(subtasks) };
      });
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(qk.task(taskId), ctx.before);
    },
    onSettled: () => void invalidateTasks(qc, { keepDetail: taskId }),
  });
}

export function useDeleteSubtask(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/tasks/${taskId}/subtasks/${id}`, { method: 'DELETE' }),
    onMutate: (id) => {
      const before = qc.getQueryData<TaskDetail>(qk.task(taskId));
      patchDetail(qc, taskId, (t) => {
        const subtasks = t.subtasks.filter((s) => s.id !== id);
        return { ...t, subtasks, subtaskCount: subtaskCount(subtasks) };
      });
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(qk.task(taskId), ctx.before);
    },
    onSettled: () => void invalidateTasks(qc, { keepDetail: taskId }),
  });
}

export function useAddComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api<TaskComment>(`/tasks/${taskId}/comments`, { method: 'POST', body: { text } }),
    onSuccess: (comment) => {
      patchDetail(qc, taskId, (t) => ({ ...t, comments: [...t.comments, comment], commentCount: t.commentCount + 1 }));
      void invalidateTasks(qc, { keepDetail: taskId });
    },
  });
}

// ---------------------------------------------------------------------------
// Registries (administrators)
// ---------------------------------------------------------------------------

export function useSaveDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: TaskDepartmentInput }) =>
      id
        ? api<TaskDepartment>(`/tasks/departments/${id}`, { method: 'PUT', body: input })
        : api<TaskDepartment>('/tasks/departments', { method: 'POST', body: input }),
    onSuccess: () => void invalidateTasks(qc),
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/tasks/departments/${id}`, { method: 'DELETE' }),
    onSuccess: () => void invalidateTasks(qc),
  });
}

export function useSaveTaskCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: TaskCategoryInput }) =>
      id
        ? api<TaskCategory>(`/tasks/categories/${id}`, { method: 'PUT', body: input })
        : api<TaskCategory>('/tasks/categories', { method: 'POST', body: input }),
    onSuccess: () => void invalidateTasks(qc),
  });
}

export function useDeleteTaskCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/tasks/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => void invalidateTasks(qc),
  });
}

export function useSetMemberDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, departmentId }: { userId: string; departmentId: string | null }) =>
      api<TaskMember>(`/tasks/members/${userId}/department`, { method: 'PUT', body: { departmentId } }),
    onSuccess: () => void invalidateTasks(qc),
  });
}

/**
 * Responsible of a client in a department, saved at once: the grid changes optimistically and an
 * error puts the previous member back.
 */
export function useSetClientResponsible() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ClientResponsibleInput) =>
      api<ClientResponsible | undefined>('/tasks/client-responsibles', { method: 'PUT', body: input }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: qk.clientResponsibles });
      const before = qc.getQueryData<ClientResponsiblesResponse>(qk.clientResponsibles);
      const members = qc.getQueryData<TaskOptionsResponse>(qk.taskOptions)?.members ?? [];
      qc.setQueryData<ClientResponsiblesResponse>(qk.clientResponsibles, (old) => {
        if (!old) return old;
        const rest = old.items.filter((i) => !(i.clientId === input.clientId && i.departmentId === input.departmentId));
        const member = input.userId ? members.find((m) => m.id === input.userId) : null;
        const user = input.userId ? { id: input.userId, name: member?.name ?? '…' } : null;
        return { ...old, items: user ? [...rest, { clientId: input.clientId, departmentId: input.departmentId, user }] : rest };
      });
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(qk.clientResponsibles, ctx.before);
    },
    onSettled: () => void invalidateTasks(qc),
  });
}
