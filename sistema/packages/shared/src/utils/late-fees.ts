import { diffInDays, type ISODate } from './dates';

/** Usual charges on a late payment in Brazil: 2% fine plus 1% interest a month, pro rata by day. */
export const SUGGESTED_FINE_RATE = 0.02;
export const SUGGESTED_MONTHLY_INTEREST_RATE = 0.01;

/** Days between the due date and the payment (0 when paid on time or early). */
export function daysLate(dueDate: ISODate, paidAt: ISODate): number {
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
