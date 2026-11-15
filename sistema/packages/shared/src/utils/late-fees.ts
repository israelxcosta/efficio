import { diffInDays, type ISODate } from './dates';
import { adjustToBusinessDay } from './tasks';

/** Usual charges on a late payment in Brazil: 2% fine plus 1% interest a month, pro rata by day. */
export const SUGGESTED_FINE_RATE = 0.02;
export const SUGGESTED_MONTHLY_INTEREST_RATE = 0.01;

/**
 * Last day to pay without charges: a due date on a Saturday, Sunday or national holiday moves to the
 * next business day (bank slips are payable then without fine, interest or losing the discount).
 */
export function effectiveDueDate(dueDate: ISODate): ISODate {
  return adjustToBusinessDay(dueDate, 'postpone');
}

/**
 * Days late of a payment on `paidAt` (0 when paid by the effective due date, see `effectiveDueDate`).
 * Past that grace, the delay counts from the nominal due date, as banks charge it.
 */
export function daysLate(dueDate: ISODate, paidAt: ISODate): number {
  if (paidAt <= effectiveDueDate(dueDate)) return 0;
  return Math.max(0, diffInDays(paidAt, dueDate));
}

/** Suggested fine and interest in cents for paying `amount` (cents) on `paidAt` instead of `dueDate`. */
export function suggestLateFees(amount: number, dueDate: ISODate, paidAt: ISODate): { fine: number; interest: number; days: number } {
  const days = daysLate(dueDate, paidAt);
  if (days === 0) return { fine: 0, interest: 0, days };
  return {
    fine: Math.round(amount * SUGGESTED_FINE_RATE),
    interest: Math.round((amount * SUGGESTED_MONTHLY_INTEREST_RATE * days) / 30),
    days,
  };
}

/** Discount in cents of `bps` basis points (500 = 5%) on `amount` cents. */
export function discountAmount(amount: number, bps: number | null | undefined): number {
  return bps ? Math.round((amount * bps) / 10_000) : 0;
}

/** Whether a payment on `paidAt` still earns the discount for paying by `dueDate` (or the next business day). */
export function earnsDiscount(dueDate: ISODate, paidAt: ISODate): boolean {
  return paidAt <= effectiveDueDate(dueDate);
}

/** "5%", "2,5%" for basis points. */
export function formatBps(bps: number): string {
  return `${(bps / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}
