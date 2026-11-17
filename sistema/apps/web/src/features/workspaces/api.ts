import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuditExportQuery,
  AuditLogEntry,
  AuditRetentionResponse,
  Invite,
  InviteInput,
  InvitePreview,
  MeResponse,
  Member,
  MemberPermissions,
  MemberPermissionsInput,
  MemberRole,
  Paginated,
  WorkspaceInput,
  WorkspaceSummary,
} from '@effinance/shared';
import { api, apiDownload, saveBlob } from '@/lib/api';
import { qk } from '@/lib/query-keys';

// The active workspace (tenant): settings, members, invites and LGPD tools. Routes act on
// `/workspaces/current`, i.e. the workspace in the session's access token.

export function useCreateWorkspace() {
  return useMutation({
    mutationFn: (input: WorkspaceInput) => api<WorkspaceSummary>('/workspaces', { method: 'POST', body: input }),
  });
}

export function useRenameWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api<WorkspaceSummary>('/workspaces/current', { method: 'PUT', body: { name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

export function useDeleteWorkspace() {
  return useMutation({
    mutationFn: (confirmName: string) => api<void>('/workspaces/current', { method: 'DELETE', body: { confirmName } }),
  });
}

export function useMembers() {
  return useQuery({ queryKey: qk.members, queryFn: () => api<Member[]>('/workspaces/current/members') });
}

function useInvalidateMembers() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['workspace'] }),
      qc.invalidateQueries({ queryKey: qk.subscription }),
    ]);
}

export function useUpdateMemberRole() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Exclude<MemberRole, 'owner'> }) =>
      api<Member>(`/workspaces/current/members/${userId}`, { method: 'PATCH', body: { role } }),
    onSuccess: invalidate,
  });
}

/** `DELETE` path of a removal; with the member who takes over the open work (`?replacementId=`). */
export function memberRemovalPath(userId: string, replacementId?: string): string {
  const base = `/workspaces/current/members/${encodeURIComponent(userId)}`;
  return replacementId ? `${base}?${new URLSearchParams({ replacementId }).toString()}` : base;
}

/**
 * Owner removes a member, or a member leaves (their own userId). Someone who still answers for open
 * tasks, recurring tasks or waiting process steps needs `replacementId` (409 with
 * `MemberHandoverCounts` otherwise; see `handoverCountsOf`). The hand-over moves tasks too.
 */
export function useRemoveMember() {
  const invalidate = useInvalidateMembers();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, replacementId }: { userId: string; replacementId?: string }) =>
      api<void>(memberRemovalPath(userId, replacementId), { method: 'DELETE' }),
    // The task module's members (and, with a hand-over, its tasks) change too.
    onSuccess: () => Promise.all([invalidate(), qc.invalidateQueries({ queryKey: ['tasks'] })]),
  });
}

/** Adjustments of one member (spec §13.10): `members` only; never for the owner nor yourself. */
export function useMemberPermissions(userId: string | null) {
  return useQuery({
    queryKey: qk.memberPermissions(userId ?? ''),
    queryFn: () => api<MemberPermissions>(`/workspaces/current/members/${userId}/permissions`),
    enabled: Boolean(userId),
  });
}

export function useSaveMemberPermissions() {
  const qc = useQueryClient();
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: MemberPermissionsInput }) =>
      api<MemberPermissions>(`/workspaces/current/members/${userId}/permissions`, { method: 'PUT', body: input }),
    onSuccess: (data) => {
      qc.setQueryData(qk.memberPermissions(data.userId), data);
      // Members list (roles, adjustments) and the task options (members' roles and departments).
      return Promise.all([invalidate(), qc.invalidateQueries({ queryKey: ['tasks'] })]);
    },
  });
}

export function useInvites(enabled: boolean) {
  return useQuery({ queryKey: qk.invites, queryFn: () => api<Invite[]>('/workspaces/current/invites'), enabled });
}

export function useCreateInvite() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: (input: InviteInput) => api<Invite>('/workspaces/current/invites', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useRevokeInvite() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/workspaces/current/invites/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: qk.invitePreview(token),
    queryFn: () => api<InvitePreview>(`/invites/${encodeURIComponent(token)}`),
    enabled: Boolean(token),
  });
}

export function acceptInvite(token: string): Promise<MeResponse> {
  return api<MeResponse>(`/invites/${encodeURIComponent(token)}/accept`, { method: 'POST' });
}

export function exportWorkspaceData(): Promise<unknown> {
  return api<unknown>('/workspaces/current/export');
}

/**
 * What the clean-up of the audit trail deletes within 30 days (`members` permission). Shared by the
 * bell and Configurações › Privacidade; a failure only hides the notice.
 */
export function useAuditRetention(enabled: boolean) {
  return useQuery({
    queryKey: qk.auditRetention,
    queryFn: () => api<AuditRetentionResponse>('/workspaces/current/audit/retention'),
    enabled,
    staleTime: 30 * 60_000,
    retry: false,
  });
}

/** CSV of the audit trail of a period (without one: the records about to be deleted). */
export async function downloadAuditCsv(query: AuditExportQuery = {}): Promise<void> {
  const fallback = query.from && query.to ? `auditoria-${query.from}-a-${query.to}.csv` : 'auditoria.csv';
  const { blob, fileName } = await apiDownload('/workspaces/current/audit/export', { query: { ...query } }, fallback);
  saveBlob(blob, fileName);
}

export function useAuditLog(page: number, enabled: boolean) {
  return useQuery({
    queryKey: qk.audit(page),
    queryFn: () => api<Paginated<AuditLogEntry>>('/workspaces/current/audit', { query: { page, pageSize: 20 } }),
    enabled,
    placeholderData: keepPreviousData,
  });
}
