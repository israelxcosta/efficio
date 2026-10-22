// Delinquency score of a client: how likely the next receivable is paid late, from its history.
// Pure, shared by the API (report) and the web (explanations), unit-tested.

import type { DelinquencyRisk } from '../constants';

/** Older receivables count less: a month 6 months ago weighs half of the current one. */
export const DELINQUENCY_HALF_LIFE_MONTHS = 6;
/** Starting point without history: 1 late in 5 (20%), so a new client is neither great nor bad. */
const PRIOR_LATE = 1;
const PRIOR_ON_TIME = 4;
/** Penalties on the 0..1000 scale: how late (up to 60 days) and what is still open. */
const SEVERITY_PENALTY = 150;
const OPEN_PENALTY = 60;

export interface DelinquencyHistoryItem {
  /** Days paid after the due date (0 = on time); open ones count until today. */
  daysLate: number;
  /** Age of the due date in months (0 = this month). */
  monthsAgo: number;
}

export interface DelinquencyScore {
  /** 0..1 */
  probability: number;
  /** 0..1000, higher is better. */
  score: number;
  risk: DelinquencyRisk;
  lowHistory: boolean;
}

export function riskOf(score: number): DelinquencyRisk {
  if (score >= 800) return 'baixo';
  if (score >= 600) return 'moderado';
  if (score >= 400) return 'alto';
  return 'critico';
}

/**
 * probability = (weighted late + 1) / (weighted total + 5): the share of late receivables with recent
 * months weighing more, pulled toward 20% when there is little history.
 * score = 1000 × (1 − probability) − up to 150 for the average delay (60+ days = all of it)
 *         − 60 for each receivable still open past due; clamped to 0..1000.
 */
export function delinquencyScore(history: readonly DelinquencyHistoryItem[], openCount: number): DelinquencyScore {
  let total = 0;
  let late = 0;
  let lateDays = 0;
  for (const item of history) {
    const weight = 0.5 ** (Math.max(0, item.monthsAgo) / DELINQUENCY_HALF_LIFE_MONTHS);
    total += weight;
    if (item.daysLate > 0) {
      late += weight;
      lateDays += weight * item.daysLate;
    }
  }
  const probability = (late + PRIOR_LATE) / (total + PRIOR_LATE + PRIOR_ON_TIME);
  const severity = late > 0 ? Math.min(1, lateDays / late / 60) : 0;
  const raw = 1000 * (1 - probability) - SEVERITY_PENALTY * severity - OPEN_PENALTY * openCount;
  const score = Math.round(Math.min(1000, Math.max(0, raw)));
  return { probability, score, risk: riskOf(score), lowHistory: history.length < 3 };
}
