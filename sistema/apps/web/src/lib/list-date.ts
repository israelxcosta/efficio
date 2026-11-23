import { formatDateBR, todayISO } from '@effinance/shared';

/**
 * Date column of a list: "05/11" in the current year (the year repeated on every row says nothing),
 * the full date otherwise. Put the full date in the cell's `title`.
 */
export function listDate(date: string, today: string = todayISO()): string {
  return date.slice(0, 4) === today.slice(0, 4) ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : formatDateBR(date);
}
