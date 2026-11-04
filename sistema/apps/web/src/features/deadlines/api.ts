import { useQuery } from '@tanstack/react-query';
import type { ClientDocumentAlertsResponse, DeadlinesResponse, DeadlinesSummary } from '@effinance/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';

// Expiry of clients' documents and of unions' collective agreements (spec §6.10): every member reads
// them (dates of documents are not financial data). The API computes the bands in the office time zone.

/** The strip of the home page, the bell and the "Mais" count. Refreshed every few minutes. */
export function useDeadlinesSummary(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.deadlinesSummary,
    queryFn: () => api<DeadlinesSummary>('/deadlines/summary'),
    enabled: options.enabled ?? true,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

/** The deadlines sheet: documents and agreements overdue or due in up to 60 days. */
export function useDeadlines(enabled: boolean) {
  return useQuery({ queryKey: qk.deadlines(), queryFn: () => api<DeadlinesResponse>('/deadlines'), enabled });
}

/** Documents per client (the "Documentos" cell and filter of the Gestão clients screen). */
export function useClientDocumentAlerts(enabled = true) {
  return useQuery({
    queryKey: qk.deadlineClients,
    queryFn: () => api<ClientDocumentAlertsResponse>('/deadlines/clients'),
    enabled,
    staleTime: 60_000,
  });
}
