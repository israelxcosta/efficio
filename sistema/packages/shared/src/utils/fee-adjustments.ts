// Yearly fee adjustment (reajuste anual dos honorários, contract clause 3). The fee periods of a client
// renew every 12 months from the contract start (utils/fees.ts), so the clients to adjust in a month are
// those whose contract started in that month of an earlier year. The contract adjusts by the largest
// positive variation accumulated in 12 months among IGP-M, IPCA, INPC and the CCT (clause 3.3), with a
// formal notice 30 days before (clause 3.5). Percentages in basis points (427 = 4,27%); money in cents.

import { FEE_ADJUSTMENT_INDEXES, FEE_ADJUSTMENT_NOTICE_DAYS, type FeeAdjustmentIndex } from '../constants';
import { addDays, type ISODate, type MonthKey } from './dates';
import { feePeriod, type FeePeriod } from './fees';

/** The four indices of a batch, in basis points; null = not informed. */
export type FeeAdjustmentIndexValues = Record<FeeAdjustmentIndex, number | null>;

/** Basis points of each index field of the API (`igpmBps`…). */
export const FEE_ADJUSTMENT_INDEX_FIELDS = {
  igpm: 'igpmBps',
  ipca: 'ipcaBps',
  inpc: 'inpcBps',
  cct: 'cctBps',
} as const satisfies Record<FeeAdjustmentIndex, string>;

/** `{ igpmBps, ipcaBps, inpcBps, cctBps }` (API shape) → by index. */
export function indexValuesOf(fields: { igpmBps: number | null; ipcaBps: number | null; inpcBps: number | null; cctBps: number | null }): FeeAdjustmentIndexValues {
  return { igpm: fields.igpmBps, ipca: fields.ipcaBps, inpc: fields.inpcBps, cct: fields.cctBps };
}

/**
 * The percentage the contract applies: the largest positive index (clause 3.3, "maior variação
 * positiva"). When none is positive (all negative, zero or not informed) there is no adjustment: 0 and
 * no index. Ties go to the first index in `FEE_ADJUSTMENT_INDEXES` order.
 */
export function suggestedAdjustment(indices: FeeAdjustmentIndexValues): { bps: number; index: FeeAdjustmentIndex | null } {
  let best: { bps: number; index: FeeAdjustmentIndex | null } = { bps: 0, index: null };
  for (const index of FEE_ADJUSTMENT_INDEXES) {
    const value = indices[index];
    if (value !== null && value > best.bps) best = { bps: value, index };
  }
  return best;
}

/**
 * The index whose value is the applied percentage, for the letter ("o escolhido"): the suggested one when
 * the percentage is the suggestion, else the first index with that exact value; null when the percentage
 * was typed by hand (negotiated) or no index is positive.
 */
export function chosenAdjustmentIndex(indices: FeeAdjustmentIndexValues, appliedBps: number): FeeAdjustmentIndex | null {
  const suggested = suggestedAdjustment(indices);
  if (suggested.index && suggested.bps === appliedBps) return suggested.index;
  if (appliedBps <= 0) return null;
  return FEE_ADJUSTMENT_INDEXES.find((index) => indices[index] === appliedBps) ?? null;
}

/** `amount` (cents) adjusted by `bps` basis points, rounded to the cent (half up). */
export function adjustByBps(amount: number, bps: number): number {
  return Math.round((amount * (10_000 + bps)) / 10_000);
}

/**
 * The fee period a contract started on `contractStart` renews in `month` (a period that starts in that
 * month, other than the first one), or null: the contract did not start in that month of an earlier year.
 */
export function renewalPeriodIn(contractStart: ISODate, month: MonthKey): FeePeriod | null {
  const index = Number(month.slice(0, 4)) - Number(contractStart.slice(0, 4));
  if (index < 1) return null;
  const period = feePeriod(contractStart, index);
  return period.startDate.slice(0, 7) === month ? period : null;
}

/** Last day to send the formal notice of the adjustment: 30 days before the new period starts. */
export function adjustmentNoticeDeadline(startDate: ISODate): ISODate {
  return addDays(startDate, -FEE_ADJUSTMENT_NOTICE_DAYS);
}

/** "1,0427": the factor of the calculation shown in the letter. */
export function adjustmentFactorText(bps: number): string {
  const factor = (10_000 + bps).toString().padStart(5, '0');
  return `${factor.slice(0, -4)},${factor.slice(-4)}`;
}
