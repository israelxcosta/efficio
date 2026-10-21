// Fee periods (vigências de honorários): one year each, back to back, the first one starting on the
// client's contract start date. Only the period index is stored; dates always derive from the
// contract start, so changing it moves every period with it.

import { addDays, addMonths, parseISODate, type ISODate } from './dates';

export interface FeePeriod {
  /** 0-based: 0 is the first year of the contract. */
  index: number;
  startDate: ISODate;
  /** Inclusive: the day before the next period starts. */
  endDate: ISODate;
}

/** Period `index` of a contract started on `contractStart` (Feb 29 anchors fall on Feb 28). */
export function feePeriod(contractStart: ISODate, index: number): FeePeriod {
  const anchor = parseISODate(contractStart).day;
  return {
    index,
    startDate: addMonths(contractStart, index * 12, anchor),
    endDate: addDays(addMonths(contractStart, (index + 1) * 12, anchor), -1),
  };
}

/** Index of the period that contains `date` (negative before the contract starts). */
export function feePeriodIndexAt(contractStart: ISODate, date: ISODate): number {
  const index = parseISODate(date).year - parseISODate(contractStart).year;
  return feePeriod(contractStart, index).startDate > date ? index - 1 : index;
}
