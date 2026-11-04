import {
  MONTH_NAMES,
  conventionLabel,
  toISODate,
  trackedConvention,
  type UnionConvention,
  type UnionListSummary,
  type UnionSituation,
} from '@effinance/shared';
import { pluralize } from '@/lib/utils';

// Unions and collective agreements (spec §13.7). Pure (tested).

/** "12 sindicatos ativos · 2 convenções vencidas, 1 vence em até 30 dias". */
export function unionsDescription(summary: UnionListSummary): string {
  const head = pluralize(summary.active, 'sindicato ativo', 'sindicatos ativos');
  const parts: string[] = [];
  if (summary.overdue) parts.push(pluralize(summary.overdue, 'convenção vencida', 'convenções vencidas'));
  if (summary.within30) parts.push(`${summary.within30} ${summary.within30 === 1 ? 'vence' : 'vencem'} em até 30 dias`);
  if (!parts.length && summary.within60) parts.push(`${summary.within60} ${summary.within60 === 1 ? 'vence' : 'vencem'} em 31 a 60 dias`);
  return `${head} · ${parts.length ? parts.join(', ') : 'nenhuma convenção vence nos próximos 60 dias'}`;
}

/** Up to three letters of the neutral circle: the acronym, else the initials of the name. */
export function unionInitials(u: { acronym: string | null; name: string }): string {
  if (u.acronym) return u.acronym.replace(/[^A-Za-zÀ-ÿ0-9]/g, '').slice(0, 2).toUpperCase();
  const words = u.name.split(/\s+/).filter((w) => w.length > 2 && !/^(dos|das|de|do|da|e)$/i.test(w));
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || u.name.slice(0, 2).toUpperCase();
}

/** "1º de novembro de 2026". */
export function longDueDate(year: number, month: number): string {
  return `1º de ${MONTH_NAMES[month - 1]!.toLowerCase()} de ${year}`;
}

export interface CycleDraft {
  year: number;
  published: boolean;
  note: string | null;
}

/** The stored cycles plus the tracked one (when not stored yet), oldest first. */
export function cyclesForDialog(stored: readonly UnionConvention[], trackedYear: number | null): CycleDraft[] {
  const list: CycleDraft[] = stored.map((c) => ({ year: c.year, published: c.published, note: c.note }));
  if (trackedYear !== null && !list.some((c) => c.year === trackedYear)) list.push({ year: trackedYear, published: false, note: null });
  return list.sort((a, b) => a.year - b.year);
}

/**
 * Checks or unchecks a cycle (Effy's rule): checking the last one adds the next year; unchecking one
 * removes the following cycles that were not published. Nothing is saved until "Salvar convenções".
 */
export function toggleCycle(cycles: readonly CycleDraft[], year: number, published: boolean): CycleDraft[] {
  let next = cycles.map((c) => (c.year === year ? { ...c, published } : c));
  if (published) {
    const last = Math.max(...next.map((c) => c.year));
    if (year === last) next.push({ year: year + 1, published: false, note: null });
  } else {
    next = next.filter((c) => c.year <= year || c.published);
  }
  return next.sort((a, b) => a.year - b.year);
}

/** The cycle tracked by the draft (the footer line and the "Acompanhando" badge). */
export function draftTracked(baseMonth: number | null, cycles: readonly CycleDraft[], today: string) {
  return trackedConvention(baseMonth, cycles, today);
}

/** Cycles checked in the draft that were not published before (the toast offers the adjustment task). */
export function newlyPublished(stored: readonly UnionConvention[], draft: readonly CycleDraft[]): number[] {
  const before = new Set(stored.filter((c) => c.published).map((c) => c.year));
  return draft.filter((c) => c.published && !before.has(c.year)).map((c) => c.year);
}

/** Whether the draft differs from what is stored (cycles not stored and unchecked do not count). */
export function cyclesChanged(stored: readonly UnionConvention[], draft: readonly CycleDraft[]): boolean {
  const a = new Map(stored.map((c) => [c.year, c.published]));
  const b = new Map(draft.map((c) => [c.year, c.published]));
  for (const [year, published] of b) if ((a.get(year) ?? false) !== published) return true;
  for (const [year, published] of a) if (published && !b.get(year)) return true;
  return false;
}

/** Due date of a cycle (day 1 of the base month in the cycle's year). */
export function cycleDueDate(year: number, baseMonth: number): string {
  return toISODate(year, baseMonth, 1);
}

export { conventionLabel };

/** Situation filter options of the list ("Todas" first). */
export const UNION_SITUATION_FILTERS: { value: UnionSituation | ''; label: string }[] = [
  { value: '', label: 'Todas as situações' },
  { value: 'overdue', label: 'Convenção vencida' },
  { value: 'within30', label: 'Vence em até 30 dias' },
  { value: 'within60', label: 'Vence em 31 a 60 dias' },
  { value: 'ok', label: 'Em dia' },
  { value: 'noBaseMonth', label: 'Sem data-base' },
];
