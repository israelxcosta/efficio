// Client score with rework (retrabalho): the delinquency score of the payments (v2) minus a penalty for
// the client's tasks in rework categories. Pure, shared by the API (delinquency report) and the web
// (client report), unit-tested. The penalty is on the 0..1000 scale of the score; the weights are a
// product decision (spec §6.2) and can be tuned here.

import type { ReworkCounts, ReworkWindows } from '../types';
import { addDays, addMonths, type ISODate } from './dates';
import { clampScore, delinquencyScore, riskOf, scoreParts, type DelinquencyHistoryItem, type DelinquencyScore } from './delinquency';

/** Recent window: the last 90 days, today included. */
export const REWORK_RECENT_DAYS = 90;
/** Whole window: the last 12 months, today included. */
export const REWORK_WINDOW_MONTHS = 12;
/** Points per rework in the last 90 days, per older rework of the 12 months, and the cap. */
export const REWORK_PENALTY_RECENT = 40;
export const REWORK_PENALTY_OLDER = 10;
export const REWORK_PENALTY_MAX = 200;
/** How many of the latest rework tasks the reports list per client. */
export const REWORK_LATEST_LIMIT = 5;

export const NO_REWORK: ReworkCounts = { last90Days: 0, last12Months: 0 };

/**
 * First day of each window for `today` (the office's day): the 90 days and the 12 months end today.
 * A task counts when the day it was opened is on or after the window's first day.
 */
export function reworkWindows(today: ISODate): ReworkWindows {
  return {
    recentFrom: addDays(today, -(REWORK_RECENT_DAYS - 1)),
    yearFrom: addDays(addMonths(today, -REWORK_WINDOW_MONTHS), 1),
  };
}

/** 40 points per rework in the last 90 days + 10 per rework between 90 days and 12 months, up to 200. */
export function reworkPenalty(counts: ReworkCounts): number {
  const recent = Math.max(0, counts.last90Days);
  const older = Math.max(0, counts.last12Months - recent);
  return Math.min(REWORK_PENALTY_MAX, REWORK_PENALTY_RECENT * recent + REWORK_PENALTY_OLDER * older);
}

export interface ClientScore extends DelinquencyScore {
  /** The payments' score (`delinquencyScore`), before the rework penalty. */
  paymentScore: number;
  reworkPenalty: number;
}

/**
 * The client's score: punctuality − open penalty − rework penalty, rounded and clamped to 0..1000 (spec
 * §5.2), with the risk band of the final score. `probability`, `punctuality` and `openPenalty` stay the
 * payments' (`delinquencyScore`); `paymentScore` is its score.
 */
export function clientScore(
  history: readonly DelinquencyHistoryItem[],
  openCount: number,
  rework: ReworkCounts = NO_REWORK,
): ClientScore {
  const payment = delinquencyScore(history, openCount);
  const penalty = reworkPenalty(rework);
  const parts = scoreParts(history, openCount);
  const score = clampScore(parts.punctuality - parts.openPenalty - penalty);
  return { ...payment, score, risk: riskOf(score), paymentScore: payment.score, reworkPenalty: penalty };
}
