import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  ApplyFlowTemplateInput,
  AuditMatrixResponse,
  Client,
  ClientListResponse,
  ClientResponsibleChangeResponse,
  ClientResponsibleInput,
  ClientResponsiblesResponse,
  FlowTemplate,
  FlowTemplateInput,
  RecurringOccurrenceDetail,
  RecurringTask,
  RecurringTaskInput,
  RecurringTaskListResponse,
  RecurringTaskQuery,
  TaskAttachment,
  TaskAttachmentInput,
  TaskAuditQuery,
  TaskCalendarQuery,
  TaskCalendarResponse,
  TaskFlow,
  TaskFlowCreatedResponse,
  TaskFlowInput,
  TaskFlowQuery,
  TaskHistoryResponse,
  TaskNote,
  TaskNoteInput,
  TaskReportQuery,
  TaskReportResponse,
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
import { api, apiDownload, saveBlob } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { isUuid } from '@/lib/safe-url';

// Hooks of the task module (Gestão de tarefas, phases 1 and 2). Every member reads and writes tasks; the
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
      api<ClientResponsibleChangeResponse>('/tasks/client-responsibles', { method: 'PUT', body: input }),
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

/**
 * Several responsibles at once (the batch dialog and its undo): one request, the grid changes
 * optimistically, and the answer says how many open recurring tasks changed hands.
 */
export function useSetClientResponsibles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: ClientResponsibleInput[]) =>
      api<ClientResponsibleChangeResponse>('/tasks/client-responsibles/batch', { method: 'PUT', body: { items } }),
    onMutate: async (items) => {
      await qc.cancelQueries({ queryKey: qk.clientResponsibles });
      const before = qc.getQueryData<ClientResponsiblesResponse>(qk.clientResponsibles);
      const members = qc.getQueryData<TaskOptionsResponse>(qk.taskOptions)?.members ?? [];
      qc.setQueryData<ClientResponsiblesResponse>(qk.clientResponsibles, (old) => {
        if (!old) return old;
        let next = old.items;
        for (const input of items) {
          next = next.filter((i) => !(i.clientId === input.clientId && i.departmentId === input.departmentId));
          if (input.userId) {
            const member = members.find((m) => m.id === input.userId);
            next = [...next, { clientId: input.clientId, departmentId: input.departmentId, user: { id: input.userId, name: member?.name ?? '…' } }];
          }
        }
        return { ...old, items: next };
      });
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(qk.clientResponsibles, ctx.before);
    },
    onSettled: () => void invalidateTasks(qc),
  });
}

// ---------------------------------------------------------------------------
// Phase 2: history, comments, attachments
// ---------------------------------------------------------------------------

export function useTaskHistory(id: string | null, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.taskHistory(id ?? ''),
    queryFn: () => api<TaskHistoryResponse>(`/tasks/${id}/history`),
    enabled: isUuid(id) && (options.enabled ?? true),
  });
}

export function useDeleteComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => api<void>(`/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' }),
    onMutate: (commentId) => {
      const before = qc.getQueryData<TaskDetail>(qk.task(taskId));
      patchDetail(qc, taskId, (t) => ({ ...t, comments: t.comments.filter((c) => c.id !== commentId), commentCount: Math.max(0, t.commentCount - 1) }));
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(qk.task(taskId), ctx.before);
    },
    onSettled: () => void invalidateTasks(qc, { keepDetail: taskId }),
  });
}

export function useUploadAttachment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, signal }: { input: TaskAttachmentInput; signal?: AbortSignal }) =>
      api<TaskAttachment>(`/tasks/${taskId}/attachments`, { method: 'POST', body: input, signal }),
    onSuccess: (attachment) => {
      patchDetail(qc, taskId, (t) => ({ ...t, attachments: [...t.attachments, attachment], attachmentCount: t.attachmentCount + 1 }));
      void invalidateTasks(qc, { keepDetail: taskId });
    },
  });
}

export function useDeleteAttachment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) => api<void>(`/tasks/${taskId}/attachments/${attachmentId}`, { method: 'DELETE' }),
    onSuccess: (_v, attachmentId) => {
      patchDetail(qc, taskId, (t) => ({
        ...t,
        attachments: t.attachments.filter((a) => a.id !== attachmentId),
        attachmentCount: Math.max(0, t.attachmentCount - 1),
      }));
      void invalidateTasks(qc, { keepDetail: taskId });
    },
  });
}

/** Downloads an attachment (always as a file; nothing is opened inside the app). */
export async function downloadAttachment(taskId: string, attachment: Pick<TaskAttachment, 'id' | 'fileName'>): Promise<void> {
  const { blob, fileName } = await apiDownload(`/tasks/${taskId}/attachments/${attachment.id}/download`, {}, attachment.fileName);
  saveBlob(blob, fileName);
}

// ---------------------------------------------------------------------------
// Phase 2: calendar, reports, audit
// ---------------------------------------------------------------------------

type Query = Record<string, string | number | boolean | undefined>;

export function useTaskCalendar(query: TaskCalendarQuery, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.taskCalendar(query as Record<string, unknown>),
    queryFn: () => api<TaskCalendarResponse>('/tasks/calendar', { query: query as Query }),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useTaskReport(query: TaskReportQuery) {
  return useQuery({
    queryKey: qk.taskReport(query as Record<string, unknown>),
    queryFn: () => api<TaskReportResponse>('/tasks/reports', { query: query as Query }),
    placeholderData: keepPreviousData,
  });
}

/** CSV of the report with the same filters, generated by the API. */
export async function exportTaskReport(query: Omit<TaskReportQuery, 'page' | 'pageSize'>, fallbackName: string): Promise<void> {
  const { blob, fileName } = await apiDownload('/tasks/reports/export.csv', { query: query as Query }, fallbackName);
  saveBlob(blob, fileName);
}

export function useTaskAudit(query: TaskAuditQuery) {
  return useQuery({
    queryKey: qk.taskAudit(query as Record<string, unknown>),
    queryFn: () => api<AuditMatrixResponse>('/tasks/audit', { query: query as Query }),
    placeholderData: keepPreviousData,
  });
}

// ---------------------------------------------------------------------------
// Phase 2: recurring tasks
// ---------------------------------------------------------------------------

export function useRecurringTasks(query: RecurringTaskQuery, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.recurringTasks(query as Record<string, unknown>),
    queryFn: () => api<RecurringTaskListResponse>('/tasks/recurring', { query: query as Query }),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useRecurringTask(id: string | null, month?: string) {
  return useQuery({
    queryKey: qk.recurringTask(id ?? '', month),
    queryFn: () => api<RecurringTask>(`/tasks/recurring/${id}`, { query: { month } }),
    enabled: isUuid(id),
  });
}

export function useSaveRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: RecurringTaskInput }) =>
      id
        ? api<RecurringTask>(`/tasks/recurring/${id}`, { method: 'PUT', body: input })
        : api<RecurringTask>('/tasks/recurring', { method: 'POST', body: input }),
    onSuccess: () => void invalidateTasks(qc),
  });
}

export function useDeleteRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/tasks/recurring/${id}`, { method: 'DELETE' }),
    onSuccess: () => void invalidateTasks(qc),
  });
}

export function useRecurringOccurrence(id: string | null, period: string | null) {
  return useQuery({
    queryKey: qk.recurringOccurrence(id ?? '', period ?? ''),
    queryFn: () => api<RecurringOccurrenceDetail>(`/tasks/recurring/${id}/occurrences/${period}`),
    enabled: isUuid(id) && Boolean(period),
    placeholderData: keepPreviousData,
  });
}

/** The fields of a recurring task as the PUT expects them (it replaces everything). */
export function recurringInputOf(r: RecurringTask, patch: Partial<RecurringTaskInput> = {}): RecurringTaskInput {
  return {
    name: r.name,
    description: r.description,
    period: r.period,
    departmentId: r.department?.id ?? null,
    categoryId: r.category?.id ?? null,
    assigneeId: r.assignee?.id ?? null,
    dueDay: r.dueDay,
    dueMonth: r.dueMonth,
    targetDaysBefore: r.targetDaysBefore,
    nonBusinessDayRule: r.nonBusinessDayRule,
    referenceOffset: r.referenceOffset,
    regimes: r.regimes,
    clientIds: r.clientIds,
    excludedClientIds: r.excludedClientIds,
    startCompetence: r.startCompetence,
    endCompetence: r.endCompetence,
    ...patch,
  };
}

// ---------------------------------------------------------------------------
// Phase 2: processes (flows) and templates
// ---------------------------------------------------------------------------

export function useTaskFlows(query: TaskFlowQuery) {
  return useQuery({
    queryKey: qk.taskFlows(query as Record<string, unknown>),
    queryFn: () => api<TaskFlow[]>('/tasks/flows', { query: query as Query }),
    placeholderData: keepPreviousData,
  });
}

export function useTaskFlow(id: string | null) {
  return useQuery({ queryKey: qk.taskFlow(id ?? ''), queryFn: () => api<TaskFlow>(`/tasks/flows/${id}`), enabled: isUuid(id) });
}

export function useCreateFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskFlowInput) => api<TaskFlowCreatedResponse>('/tasks/flows', { method: 'POST', body: input }),
    onSuccess: () => void invalidateTasks(qc),
  });
}

export function useDeleteFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/tasks/flows/${id}`, { method: 'DELETE' }),
    onSuccess: () => void invalidateTasks(qc),
  });
}

export function useFlowTemplates(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.flowTemplates,
    queryFn: () => api<FlowTemplate[]>('/tasks/flow-templates'),
    enabled: options.enabled ?? true,
  });
}

export function useSaveFlowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: FlowTemplateInput }) =>
      id
        ? api<FlowTemplate>(`/tasks/flow-templates/${id}`, { method: 'PUT', body: input })
        : api<FlowTemplate>('/tasks/flow-templates', { method: 'POST', body: input }),
    onSuccess: () => void invalidateTasks(qc),
  });
}

export function useDeleteFlowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/tasks/flow-templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => void invalidateTasks(qc),
  });
}

export function useApplyFlowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ApplyFlowTemplateInput }) =>
      api<TaskFlowCreatedResponse>(`/tasks/flow-templates/${id}/apply`, { method: 'POST', body: input }),
    onSuccess: () => void invalidateTasks(qc),
  });
}

// ---------------------------------------------------------------------------
// Phase 2: personal notes (only the author reads them)
// ---------------------------------------------------------------------------

export function useTaskNotes(options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: qk.taskNotes, queryFn: () => api<TaskNote[]>('/tasks/notes'), enabled: options.enabled ?? true });
}

export function useSaveNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: TaskNoteInput }) =>
      id ? api<TaskNote>(`/tasks/notes/${id}`, { method: 'PUT', body: input }) : api<TaskNote>('/tasks/notes', { method: 'POST', body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.taskNotes }),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/tasks/notes/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.taskNotes }),
  });
}
