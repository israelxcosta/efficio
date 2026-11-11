// Comparison of a report period with the one before it (spec §3, Q7): the previous range of the same
// length and the change of each figure of Relatórios › Visão geral. Pure and unit-tested.

import { addDays, addMonths, diffInDays, endOfMonth, MONTH_NAMES, type ISODate, type OverviewReportResponse } from '@effinance/shared';
import { changeParts, type ChangeParts } from '@/features/dashboard/kpi-logic';
import { signedMoney } from './evolution/evolution-logic';

export interface PreviousRange {
  from: ISODate;
  to: ISODate;
  /** "vs outubro", "vs 3 meses anteriores", "vs 10 dias anteriores". */
  label: string;
}

/** Whole months (1st to the last day) step back by months; any other range by days. */
export function previousRange(from: ISODate, to: ISODate): PreviousRange {
  const wholeMonths = from.endsWith('-01') && endOfMonth(to) === to;
  if (wholeMonths) {
    const months = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
    const start = addMonths(from, -months);
    const label = months === 1 ? `vs ${MONTH_NAMES[Number(start.slice(5, 7)) - 1]!.toLowerCase()}` : `vs ${months} meses anteriores`;
    return { from: start, to: addDays(from, -1), label };
  }
  const days = diffInDays(to, from) + 1;
  return { from: addDays(from, -days), to: addDays(from, -1), label: `vs ${days} dias anteriores` };
}

type Figures = Pick<OverviewReportResponse, 'income' | 'expense' | 'net' | 'savingsRate' | 'averageDailyExpense'>;
export type OverviewChanges = Record<keyof Figures, ChangeParts | null>;

const relative = (now: number, before: number, invert = false) => (before > 0 ? changeParts((now - before) / before, 'percent', invert) : null);

/** Change of each figure: relative for money (a rise of expenses is bad), points for the margin, R$ for the result. */
export function overviewChanges(now: Figures, before: Figures | undefined): OverviewChanges {
  if (!before) return { income: null, expense: null, net: null, savingsRate: null, averageDailyExpense: null };
  const netDiff = now.net - before.net;
  return {
    income: relative(now.income, before.income),
    expense: relative(now.expense, before.expense, true),
    net: { text: signedMoney(netDiff), tone: netDiff > 0 ? 'success' : netDiff < 0 ? 'danger' : 'muted', up: netDiff >= 0 },
    savingsRate: now.savingsRate !== null && before.savingsRate !== null ? changeParts(now.savingsRate - before.savingsRate, 'pp') : null,
    averageDailyExpense: relative(now.averageDailyExpense, before.averageDailyExpense, true),
  };
}
