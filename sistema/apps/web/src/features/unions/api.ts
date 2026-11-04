import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { UnionConventionsInput, UnionDetail, UnionInput, UnionListResponse, UnionQuery } from '@effinance/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';

// Unions and their collective agreements (spec §13.7). Every member reads; `registry` writes and marks
// agreements; `deleteRegistry` deletes. A change reaches the deadlines (strip, bell, sheet), the
// clients' sheets (linked unions) and the search.

export function invalidateUnions(qc: QueryClient) {
  return Promise.all(
    ['unions', 'deadlines', 'clients', 'search'].map((d) => qc.invalidateQueries({ queryKey: [d] })),
  );
}

export function useUnions(query: UnionQuery, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.unions(query as Record<string, unknown>),
    queryFn: () => api<UnionListResponse>('/unions', { query: query as Record<string, string | number | undefined> }),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useUnion(id: string | null) {
  return useQuery({ queryKey: qk.union(id ?? ''), queryFn: () => api<UnionDetail>(`/unions/${id}`), enabled: Boolean(id) });
}

export function useSaveUnion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: UnionInput }) =>
      id ? api<UnionDetail>(`/unions/${id}`, { method: 'PUT', body: input }) : api<UnionDetail>('/unions', { method: 'POST', body: input }),
    onSuccess: (union) => {
      qc.setQueryData(qk.union(union.id), union);
      void invalidateUnions(qc);
    },
  });
}

export function useSaveConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UnionConventionsInput }) =>
      api<UnionDetail>(`/unions/${id}/conventions`, { method: 'PUT', body: input }),
    onSuccess: (union) => {
      qc.setQueryData(qk.union(union.id), union);
      void invalidateUnions(qc);
    },
  });
}

/** Marks (or unmarks) one cycle as published: the quick action of the lists, with "Desfazer". */
export function usePublishConvention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, year, published }: { id: string; year: number; published: boolean }) =>
      api<UnionDetail>(`/unions/${id}/conventions/${year}`, { method: 'PATCH', body: { published } }),
    onSuccess: (union) => {
      qc.setQueryData(qk.union(union.id), union);
      void invalidateUnions(qc);
    },
  });
}

export function useDeleteUnion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/unions/${id}`, { method: 'DELETE' }),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: qk.union(id) });
      void invalidateUnions(qc);
    },
  });
}
