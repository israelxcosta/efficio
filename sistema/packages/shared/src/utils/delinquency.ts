// Delinquency score of a client (v2): how likely the next receivable is paid late and how serious the
// delays were, from its history. Pure, shared by the API (report) and the web (client report), tested.

import type { DelinquencyRisk } from '../constants';

/** Older receivables count less: a month 6 months ago weighs half of the current one. */
export const DELINQUENCY_HALF_LIFE_MONTHS = 6;
/** Starting point without history: 1 late in 5 (20%), so a new client is neither great nor bad. */
const PRIOR_LATE = 1;
const PRIOR_ON_TIME = 4;
/** The score always reads the last 12 months, whatever period a report shows. */
export const SCORE_WINDOW_MONTHS = 12;
/** Each receivable still open past due takes 50 points, up to 250. */
export const OPEN_PENALTY = 50;
export const OPEN_PENALTY_MAX = 250;

export interface DelinquencyHistoryItem {
  /** Days paid after the due date (0 = on time); open ones count until today. */
  daysLate: number;
  /** Age of the due date in months (0 = this month). */
  monthsAgo: number;
}

export interface DelinquencyScore {
  /** 0..1: chance of paying the next receivable late (any delay counts the same). */
  probability: number;
  /** 0..1000, higher is better: punctuality − openPenalty (rounded, clamped). */
  score: number;
  risk: DelinquencyRisk;
  lowHistory: boolean;
  /** 0..1000 (rounded): the history weighed by how serious each delay was (800 without history). */
  punctuality: number;
  /** Points taken for the receivables open past due (50 each, up to 250). */
  openPenalty: number;
}

export function riskOf(score: number): DelinquencyRisk {
  if (score >= 800) return 'baixo';
  if (score >= 600) return 'moderado';
  if (score >= 400) return 'alto';
  return 'critico';
}

/** Severity of a delay: 0 on time · 0.25 for 1–5 days · 0.5 for 6–15 · 0.75 for 16–30 · 1 above 30. */
export function lateSeverity(daysLate: number): number {
  if (daysLate <= 0) return 0;
  if (daysLate <= 5) return 0.25;
  if (daysLate <= 15) return 0.5;
  if (daysLate <= 30) return 0.75;
  return 1;
}

/** Unrounded parts of the score (shared with `clientScore`, which takes the rework from the same base). */
export function scoreParts(history: readonly DelinquencyHistoryItem[], openCount: number) {
  let total = 0;
  let late = 0;
  let severity = 0;
  for (const item of history) {
    const weight = 0.5 ** (Math.max(0, item.monthsAgo) / DELINQUENCY_HALF_LIFE_MONTHS);
    total += weight;
    if (item.daysLate > 0) late += weight;
    severity += weight * lateSeverity(item.daysLate);
  }
  const prior = PRIOR_LATE + PRIOR_ON_TIME;
  return {
    probability: (late + PRIOR_LATE) / (total + prior),
    punctuality: 1000 * (1 - (severity + PRIOR_LATE) / (total + prior)),
    openPenalty: Math.min(OPEN_PENALTY_MAX, OPEN_PENALTY * Math.max(0, openCount)),
    lowHistory: history.length < 3,
  };
}

/** Rounded and clamped to 0..1000. */
export const clampScore = (raw: number) => Math.round(Math.min(1000, Math.max(0, raw)));

/**
 * Score v2 (spec §5.2), over the receivables of the last `SCORE_WINDOW_MONTHS` months:
 * weight w = 0.5^(months ago / 6); probability = (Σ w·[late] + 1) / (Σ w + 5) — the chance of paying
 * late, any delay alike; punctuality = 1000 × (1 − (Σ w·lateSeverity + 1) / (Σ w + 5)) (800 without
 * history); score = punctuality − 50 per receivable open past due (up to 250), rounded, 0..1000.
 * The client score (`clientScore`, utils/rework.ts) also takes the rework.
 */
export function delinquencyScore(history: readonly DelinquencyHistoryItem[], openCount: number): DelinquencyScore {
  const parts = scoreParts(history, openCount);
  const score = clampScore(parts.punctuality - parts.openPenalty);
  return {
    probability: parts.probability,
    score,
    risk: riskOf(score),
    lowHistory: parts.lowHistory,
    punctuality: clampScore(parts.punctuality),
    openPenalty: parts.openPenalty,
  };
}
