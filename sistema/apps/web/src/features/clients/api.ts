import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  Client,
  ClientFee,
  ClientFeeInput,
  ClientFeesResponse,
  ClientInactivationInput,
  ClientInput,
  ClientListResponse,
  ClientStatus,
  CnpjLookupResult,
  TaxRegime,
} from '@effinance/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';

export type ClientListParams = {
  search?: string;
  status?: ClientStatus | 'all';
  taxRegime?: TaxRegime;
  page?: number;
  pageSize?: number;
};

export function useClients(params: ClientListParams = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.clients(params),
    queryFn: () => api<ClientListResponse>('/clients', { query: params }),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useClient(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.client(id ?? ''),
    queryFn: () => api<Client>(`/clients/${id}`),
    enabled: Boolean(id),
  });
}

/** Clients appear in the pickers (contacts) and in the receivables: refresh both. */
function invalidateClients(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['clients'] }),
    qc.invalidateQueries({ queryKey: ['contacts'] }),
  ]);
}

export function useSaveClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ClientInput }) =>
      id
        ? api<Client>(`/clients/${id}`, { method: 'PUT', body: input })
        : api<Client>('/clients', { method: 'POST', body: input }),
    onSuccess: () => invalidateClients(qc),
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/clients/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateClients(qc),
  });
}

export function useInactivateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ClientInactivationInput }) =>
      api<Client>(`/clients/${id}/inactivate`, { method: 'POST', body: input }),
    onSuccess: () => invalidateClients(qc),
  });
}

export function useReactivateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<Client>(`/clients/${id}/reactivate`, { method: 'POST', body: {} }),
    onSuccess: () => invalidateClients(qc),
  });
}

export function useClientFees(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.clientFees(id ?? ''),
    queryFn: () => api<ClientFeesResponse>(`/clients/${id}/fees`),
    enabled: Boolean(id),
  });
}

/** Creates the next period, updates one (feeId) or removes the latest (input null). */
export function useSaveFee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      clientId,
      feeId,
      input,
    }: {
      clientId: string;
      feeId?: string;
      input: ClientFeeInput | null;
    }): Promise<ClientFee | void> =>
      input === null
        ? api<void>(`/clients/${clientId}/fees/${feeId}`, { method: 'DELETE' })
        : feeId
          ? api<ClientFee>(`/clients/${clientId}/fees/${feeId}`, { method: 'PUT', body: input })
          : api<ClientFee>(`/clients/${clientId}/fees`, { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
}

/** Company data from the Receita Federal (CNPJ digits). */
export function useCnpjLookup() {
  return useMutation({
    mutationFn: (cnpj: string) => api<CnpjLookupResult>(`/cnpj/${cnpj}`),
  });
}
