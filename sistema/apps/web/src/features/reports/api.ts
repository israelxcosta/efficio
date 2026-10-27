import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  CashflowReportQuery,
  CashflowReportResponse,
  CategoryReportQuery,
  CategoryReportResponse,
  ComparisonReportQuery,
  ComparisonReportResponse,
  ContactReportQuery,
  ContactReportResponse,
  DelinquencyReportResponse,
  OverviewReportQuery,
  OverviewReportResponse,
  Transaction,
  TransactionListResponse,
} from '@effinance/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';

type Q = Record<string, string | number | boolean | undefined>;

function useReport<T>(name: string, params: object, enabled = true) {
  return useQuery({
    queryKey: qk.report(name, params as Record<string, unknown>),
    queryFn: () => api<T>(`/reports/${name}`, { query: params as Q }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export const useOverviewReport = (p: OverviewReportQuery) => useReport<OverviewReportResponse>('overview', p);
export const useCategoryReport = (p: CategoryReportQuery, enabled = true) => useReport<CategoryReportResponse>('categories', p, enabled);
export const useContactReport = (p: ContactReportQuery, enabled = true) => useReport<ContactReportResponse>('contacts', p, enabled);
export const useComparisonReport = (p: ComparisonReportQuery) => useReport<ComparisonReportResponse>('comparison', p);
export const useCashflowReport = (p: CashflowReportQuery, enabled = true) =>
  useReport<CashflowReportResponse>('cashflow', p, enabled);
/** Late payments of clients over the last `months` months (3..24), by due date up to today. */
export const useDelinquencyReport = (months: number) => useReport<DelinquencyReportResponse>('delinquency', { months });

/**
 * Every income transaction of a client, all dates (the list endpoint pages at 200: read them all).
 * Under the transactions key, so any money-moving mutation refreshes it.
 */
export function useClientHistory(contactId: string | undefined) {
  return useQuery({
    queryKey: qk.transactions({ contactId, type: 'income', view: 'client-history' }),
    queryFn: async () => {
      const items: Transaction[] = [];
      for (let page = 1; ; page++) {
        const res = await api<TransactionListResponse>('/transactions', {
          query: { type: 'income', contactId, status: 'all', sort: 'date_asc', pageSize: 200, page },
        });
        items.push(...res.items);
        if (res.items.length === 0 || items.length >= res.total) return items;
      }
    },
    enabled: Boolean(contactId),
  });
}
