// Queries shared by several widgets and by the dashboard alerts. TanStack Query dedupes identical
// keys, so a widget and the alerts reading the same list cost one request.

import { useQuery } from '@tanstack/react-query';
import { addDays, endOfMonth, todayISO, type Transaction, type TransactionListResponse, type TransactionQuery } from '@effinance/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useCashflowReport } from '@/features/reports/api';
import { useTransactions } from '@/features/transactions/api';
import { useClients } from '@/features/clients/api';

/** Most overdue receivables read for the aging bands and the debtors ranking (5 pages of 200). */
export const OVERDUE_LIST_LIMIT = 1000;
const PAGE_SIZE = 200;

export interface OverdueList {
  items: Transaction[];
  summary: TransactionListResponse['summary'];
  total: number;
  /** More than OVERDUE_LIST_LIMIT items: bands and ranking cover the oldest ones only. */
  truncated: boolean;
}

/** Every overdue receivable (up to OVERDUE_LIST_LIMIT), oldest first, read page by page. */
export function useOverdueReceivables(enabled = true) {
  const params = { type: 'income', status: 'overdue', sort: 'date_asc', pageSize: PAGE_SIZE } satisfies TransactionQuery;
  return useQuery({
    queryKey: qk.transactions({ ...params, all: OVERDUE_LIST_LIMIT }),
    enabled,
    queryFn: async (): Promise<OverdueList> => {
      const items: Transaction[] = [];
      let page = 1;
      for (;;) {
        const res = await api<TransactionListResponse>('/transactions', { query: { ...params, page } });
        items.push(...res.items);
        if (items.length >= res.total || res.items.length === 0 || items.length >= OVERDUE_LIST_LIMIT) {
          return { items: items.slice(0, OVERDUE_LIST_LIMIT), summary: res.summary, total: res.total, truncated: res.total > OVERDUE_LIST_LIMIT };
        }
        page++;
      }
    },
  });
}

/**
 * Totals only (`summary.overdue` money). For expenses the count includes each card purchase of an
 * overdue invoice: use `d.overdue.count` for counts.
 */
export function useOverdueTotal(type: 'income' | 'expense', enabled = true) {
  return useTransactions({ type, status: 'overdue', pageSize: 1 }, { enabled });
}

export function useOverduePayables(enabled = true) {
  return useOverdueTotal('expense', enabled);
}

/** Everything still open to receive until the end of the current month (overdue included). */
export function useOpenReceivables(enabled = true) {
  return useTransactions({ type: 'income', status: 'pending', to: endOfMonth(todayISO()), pageSize: 1 }, { enabled });
}

/** Horizon fetched once; 30/60 days are cut from it by `summarizeProjection`. */
export const PROJECTION_DAYS = 90;

/** Daily cash flow from today: one period per day, `balance` is the projected running balance. */
export function useProjection(enabled = true) {
  const today = todayISO();
  return useCashflowReport({ from: today, to: addDays(today, PROJECTION_DAYS), granularity: 'day' }, enabled);
}

/** Every client (the list is small; 200 is the API page limit). */
export function useOfficeClients(enabled = true) {
  return useClients({ status: 'all', pageSize: 200 }, { enabled });
}
