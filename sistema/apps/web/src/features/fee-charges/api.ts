import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { FeeEmployeesResponse, GenerateFeesResponse, MonthKey } from '@effinance/shared';
import { api } from '@/lib/api';
import { invalidateFinancialData } from '@/lib/query-keys';

/**
 * Dry-run previews. Kept out of the 'transactions' domain on purpose: code that walks every cached
 * ['transactions', …] query (optimistic paid toggle) expects transaction lists there.
 */
export const feeChargeKeys = {
  all: ['fee-charges'] as const,
  generatePreview: (competence: MonthKey) => ['fee-charges', 'generate', competence] as const,
  employeesPreview: (feeId: string, employees: number) => ['fee-charges', 'employees', feeId, employees] as const,
};

/** Each fee falls due on its client's `feeDueDay` (client registration). */
export interface GenerateFeesParams {
  competence: MonthKey;
}

const employeesPath = (feeId: string) => `/fee-charges/${encodeURIComponent(feeId)}/employees`;

/** After a real run: refresh lists/totals and drop the previews, so reopening a dialog never shows the old plan. */
function afterWrite(qc: QueryClient) {
  qc.removeQueries({ queryKey: feeChargeKeys.all });
  return invalidateFinancialData(qc);
}

/** What "Gerar honorários" would create for `params` (null while the inputs are invalid). */
export function useGenerateFeesPreview(params: GenerateFeesParams | null) {
  return useQuery({
    queryKey: feeChargeKeys.generatePreview(params?.competence ?? ''),
    queryFn: ({ signal }) =>
      api<GenerateFeesResponse>('/fee-charges/generate', { method: 'POST', body: { ...params!, dryRun: true }, signal }),
    enabled: params !== null,
    // Changing the competence keeps the previous plan on screen (dimmed) until the new one arrives.
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 60_000,
  });
}

export function useGenerateFees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: GenerateFeesParams) =>
      api<GenerateFeesResponse>('/fee-charges/generate', { method: 'POST', body: { ...params, dryRun: false } }),
    onSuccess: () => afterWrite(qc),
  });
}

/** Amount of the employee charge for `employees` (null/0 disables it: there is nothing to price). */
export function useFeeEmployeesPreview(feeId: string, employees: number | null) {
  return useQuery({
    queryKey: feeChargeKeys.employeesPreview(feeId, employees ?? -1),
    queryFn: ({ signal }) =>
      api<FeeEmployeesResponse>(employeesPath(feeId), { method: 'POST', body: { employees: employees!, dryRun: true }, signal }),
    enabled: employees !== null && employees > 0,
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 60_000,
  });
}

/** Creates, replaces (same call again) or removes (employees = 0) the employee charge of a fee. */
export function useFeeEmployees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ feeId, employees }: { feeId: string; employees: number }) =>
      api<FeeEmployeesResponse>(employeesPath(feeId), { method: 'POST', body: { employees, dryRun: false } }),
    onSuccess: () => afterWrite(qc),
  });
}
