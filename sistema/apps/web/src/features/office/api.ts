import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  ClientContractResponse,
  ContractTemplateInput,
  ContractTemplateResponse,
  Office,
  OfficeBranding,
  OfficeInput,
} from '@effinance/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';

// The office (spec §13.9): name and logo for every member (`/office/branding`); the registry, the logo
// and the contract template with the `office` permission. The contract of a client is financial
// (`finance`) and is generated on the fly (never stored).

function invalidateOffice(qc: QueryClient) {
  // The contract of each client reads the office and the template.
  return Promise.all([qc.invalidateQueries({ queryKey: ['office'] }), qc.invalidateQueries({ queryKey: ['clients', 'contract'] })]);
}

export function useOfficeBranding(options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: qk.officeBranding, queryFn: () => api<OfficeBranding>('/office/branding'), enabled: options.enabled ?? true, staleTime: 5 * 60_000 });
}

export function useOffice(enabled: boolean) {
  return useQuery({ queryKey: qk.office, queryFn: () => api<Office>('/office'), enabled });
}

export function useSaveOffice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OfficeInput) => api<Office>('/office', { method: 'PUT', body: input }),
    onSuccess: (office) => {
      qc.setQueryData(qk.office, office);
      void invalidateOffice(qc);
    },
  });
}

export function useSaveOfficeLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (logo: string) => api<Office>('/office/logo', { method: 'PUT', body: { logo } }),
    onSuccess: (office) => {
      qc.setQueryData(qk.office, office);
      void invalidateOffice(qc);
    },
  });
}

export function useRemoveOfficeLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/office/logo', { method: 'DELETE' }),
    onSuccess: () => invalidateOffice(qc),
  });
}

/** The template in use, for the editor. Never replaced by the factory one when the read fails. */
export function useContractTemplate(enabled: boolean) {
  return useQuery({
    queryKey: qk.contractTemplate,
    queryFn: () => api<ContractTemplateResponse>('/office/contract-template'),
    enabled,
    // The editor holds a draft: a background refetch must not look like "someone else saved".
    refetchOnWindowFocus: false,
  });
}

export function useSaveContractTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ContractTemplateInput) => api<ContractTemplateResponse>('/office/contract-template', { method: 'PUT', body: input }),
    onSuccess: (template) => {
      qc.setQueryData(qk.contractTemplate, template);
      void invalidateOffice(qc);
    },
  });
}

/** "Voltar ao modelo de fábrica": saved right away (spec §13.9). */
export function useResetContractTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<ContractTemplateResponse>('/office/contract-template/reset', { method: 'POST' }),
    onSuccess: (template) => {
      qc.setQueryData(qk.contractTemplate, template);
      void invalidateOffice(qc);
    },
  });
}

/** Everything to print the contract of a client (`finance`). */
export function useClientContract(id: string | null, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.clientContract(id ?? ''),
    queryFn: () => api<ClientContractResponse>(`/clients/${id}/contract`),
    enabled: Boolean(id) && (options.enabled ?? true),
  });
}

/** Optional record of an issue (printing): failures are silent, the contract was generated anyway. */
export function recordContractIssue(id: string) {
  return api<unknown>(`/clients/${id}/contract/issues`, { method: 'POST', body: {} }).catch(() => undefined);
}
