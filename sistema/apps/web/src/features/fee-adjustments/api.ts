import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApplyFeeAdjustmentInput,
  FeeAdjustment,
  FeeAdjustmentApplyResponse,
  FeeAdjustmentLettersResponse,
  FeeAdjustmentPreviewResponse,
  MonthKey,
  Paginated,
} from '@effinance/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';

/**
 * The clients whose fee period renews in `month`. Only the month goes to the API: the new values are
 * computed on screen while the indices are typed (`adjustmentRows`, the same `adjustByBps` the API
 * applies), so typing never refetches nor flickers the list.
 */
export function useFeeAdjustmentPreview(month: MonthKey) {
  return useQuery({
    queryKey: qk.feeAdjustmentPreview(month),
    queryFn: () => api<FeeAdjustmentPreviewResponse>('/fee-adjustments/preview', { query: { month } }),
    placeholderData: keepPreviousData,
  });
}

export function useFeeAdjustments(params: { page: number; pageSize: number }) {
  return useQuery({
    queryKey: qk.feeAdjustments(params),
    queryFn: () => api<Paginated<FeeAdjustment>>('/fee-adjustments', { query: params }),
    placeholderData: keepPreviousData,
  });
}

export function useFeeAdjustmentLetters(id: string | null) {
  return useQuery({
    queryKey: qk.feeAdjustmentLetters(id ?? ''),
    queryFn: () => api<FeeAdjustmentLettersResponse>(`/fee-adjustments/${id}/letters`),
    enabled: Boolean(id),
  });
}

/**
 * Registers the period of the month for the selected clients. The new periods change the clients'
 * current fee (lists, contract, dashboard cards), the reports and the fee generation previews.
 */
export function useApplyFeeAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplyFeeAdjustmentInput) => api<FeeAdjustmentApplyResponse>('/fee-adjustments', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ['fee-charges'] });
      return Promise.all([
        qc.invalidateQueries({ queryKey: ['clients'] }),
        qc.invalidateQueries({ queryKey: ['reports'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
  });
}
