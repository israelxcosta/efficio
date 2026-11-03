// Deadline bands of clients' documents and unions' collective agreements (spec §6.10, §13.7, §13.8).
// The API computes them in the office time zone (`todayIn(TASK_TIME_ZONE)`) and the screens show what
// comes; these pure functions are the single implementation (Effy's lesson: two implementations of the
// same rule diverge).

import type { DeadlineBucket, UnionSituation } from '../constants';
import { addDays, diffInDays, MONTH_NAMES, toISODate, type ISODate } from './dates';

/** "Vence em até 30 dias" goes up to today + 30, inclusive; "31 a 60" up to today + 60. */
export const DEADLINE_SOON_DAYS = 30;
export const DEADLINE_WATCH_DAYS = 60;

export interface DeadlineStatus {
  bucket: DeadlineBucket;
  /** Days from today to the expiry (negative when overdue; 0 = today); null without a date. */
  days: number | null;
}

/** Band of an expiry date: overdue before today, within30 today…today+30, within60 up to today+60. */
export function deadlineStatus(expiresAt: ISODate | null | undefined, today: ISODate): DeadlineStatus {
  if (!expiresAt) return { bucket: 'noDate', days: null };
  const days = diffInDays(expiresAt, today);
  if (days < 0) return { bucket: 'overdue', days };
  if (days <= DEADLINE_SOON_DAYS) return { bucket: 'within30', days };
  if (days <= DEADLINE_WATCH_DAYS) return { bucket: 'within60', days };
  return { bucket: 'later', days };
}

/** Bounds of the bands, for SQL filters: overdue `< today`, within30 `<= soon`, within60 `<= watch`. */
export function deadlineBounds(today: ISODate): { today: ISODate; soon: ISODate; watch: ISODate } {
  return { today, soon: addDays(today, DEADLINE_SOON_DAYS), watch: addDays(today, DEADLINE_WATCH_DAYS) };
}

/** "Venceu há 3 dias", "Vence hoje", "Vence em 12 dias" (null without a date). */
export function deadlineText(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return 'Vence hoje';
  if (days < 0) return `Venceu há ${-days} ${-days === 1 ? 'dia' : 'dias'}`;
  return `Vence em ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

// ---------------------------------------------------------------------------
// Unions: the collective agreement cycle being tracked
// ---------------------------------------------------------------------------

export interface ConventionCycleInput {
  /** First year of the cycle: 2026 = "Convenção Coletiva 2026/2027". */
  year: number;
  published: boolean;
}

export interface TrackedConvention {
  year: number;
  /** "2026/2027". */
  label: string;
  /** Day 1 of the base month, in the tracked year. */
  dueDate: ISODate;
  /** Days from today (negative when overdue). */
  days: number;
  bucket: Exclude<DeadlineBucket, 'noDate'>;
}

/** Steps a published streak may advance (Effy's guard against an endless loop). */
const MAX_CYCLE_STEPS = 25;

export function conventionLabel(year: number): string {
  return `${year}/${year + 1}`;
}

/**
 * The cycle a union is tracked by (Effy's `cicloEmControle`): starts at the current year and advances
 * while that year's cycle is marked as published. Until the tracked cycle is marked, the union stays in
 * the alert, even long after it expired. Without the base month (1–12) there is nothing to track.
 */
export function trackedConvention(
  baseMonth: number | null | undefined,
  cycles: readonly ConventionCycleInput[],
  today: ISODate,
): TrackedConvention | null {
  if (!baseMonth || baseMonth < 1 || baseMonth > 12) return null;
  const published = new Set(cycles.filter((c) => c.published).map((c) => c.year));
  let year = Number(today.slice(0, 4));
  for (let steps = 0; published.has(year) && steps < MAX_CYCLE_STEPS; steps++) year++;
  const dueDate = toISODate(year, baseMonth, 1);
  const { bucket, days } = deadlineStatus(dueDate, today);
  return { year, label: conventionLabel(year), dueDate, days: days!, bucket: bucket as TrackedConvention['bucket'] };
}

/** Situation of the list filter: the tracked cycle's band, `ok` beyond 60 days, `noBaseMonth` without it. */
export function unionSituationOf(tracked: TrackedConvention | null): UnionSituation {
  if (!tracked) return 'noBaseMonth';
  return tracked.bucket === 'later' ? 'ok' : tracked.bucket;
}

/** Urgency order of the union list: overdue first, then by the due date; without base month at the end. */
export function compareUnionUrgency(a: TrackedConvention | null, b: TrackedConvention | null): number {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
}

/** "Novembro" (null outside 1–12). */
export function monthName(month: number | null | undefined): string | null {
  return month && month >= 1 && month <= 12 ? MONTH_NAMES[month - 1]! : null;
}
