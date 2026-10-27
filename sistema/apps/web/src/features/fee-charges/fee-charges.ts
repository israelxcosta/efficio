// Pure helpers of "Gerar honorários" and "+ Empregados" (no React, unit tested).

import {
  formatBRL,
  formatMonthKey,
  type ISODate,
  type MonthKey,
  type Transaction,
} from '@effinance/shared';

/** Same bound as `feeEmployeesSchema`. */
export const MAX_EMPLOYEES = 100_000;

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: unknown): value is MonthKey {
  return typeof value === 'string' && MONTH_KEY.test(value);
}

/** "10/2026" — the reference used in descriptions ("Honorários ref. 10/2026 - CLIENTE"). */
export function competenceLabel(competence: MonthKey): string {
  const [year, month] = competence.split('-');
  return `${month}/${year}`;
}

/** "Outubro de 2026" */
export function competenceLongLabel(competence: MonthKey): string {
  return formatMonthKey(competence, 'long');
}

/**
 * Due dates of a generation (each client has its own due day): "10/11/2026" when they all fall on
 * one day, else "05/11 a 20/11/2026"; null when there are none.
 */
export function dueDatesLabel(dueDates: Iterable<ISODate>): string | null {
  const sorted = [...new Set(dueDates)].sort();
  if (sorted.length === 0) return null;
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const br = (d: ISODate) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  if (first === last) return br(first);
  return first.slice(0, 4) === last.slice(0, 4) ? `${br(first).slice(0, 5)} a ${br(last)}` : `${br(first)} a ${br(last)}`;
}

/** Employee count typed by the user: an integer 0..100.000, else null (empty, decimals, negatives). */
export function parseEmployees(input: string): number | null {
  const text = input.trim();
  if (!/^\d{1,6}$/.test(text)) return null;
  const count = Number(text);
  return count <= MAX_EMPLOYEES ? count : null;
}

/** "1 honorário" / "3 honorários" */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count.toLocaleString('pt-BR')} ${count === 1 ? singular : pluralForm}`;
}

/** "5 × R$ 35,00 = R$ 175,00" */
export function employeesFormula(employees: number, rate: number, amount: number = employees * rate): string {
  return `${employees.toLocaleString('pt-BR')} × ${formatBRL(rate)} = ${formatBRL(amount)}`;
}

/** Transactions held by a cached query of unknown shape: lists (`items`) and statements (`entries[].transaction`). */
export function transactionsInCacheData(data: unknown): Transaction[] {
  if (!data || typeof data !== 'object') return [];
  const { items, entries } = data as { items?: unknown; entries?: unknown };
  if (Array.isArray(items)) return items.filter(isTransactionLike);
  if (Array.isArray(entries)) {
    return entries.map((e) => (e as { transaction?: unknown } | null)?.transaction).filter(isTransactionLike);
  }
  return [];
}

function isTransactionLike(value: unknown): value is Transaction {
  return Boolean(value) && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string';
}

/** The "+ Empregados" charge of the fee `feeId`, if one is among `transactions`. */
export function findEmployeesCharge(feeId: string, transactions: Iterable<Transaction>): Transaction | null {
  for (const tx of transactions) {
    if (tx.feeKind === 'employees' && tx.feeOf === feeId) return tx;
  }
  return null;
}

type LateFees = NonNullable<Transaction['lateFees']>;

export function lateFeesTotal(lateFees: LateFees): number {
  return lateFees.interest + lateFees.fine;
}

/** "Juros R$ 8,00 · Multa R$ 4,30" (zero parts left out). */
export function lateFeesSplit(lateFees: LateFees): string {
  const parts: string[] = [];
  if (lateFees.interest > 0) parts.push(`Juros ${formatBRL(lateFees.interest)}`);
  if (lateFees.fine > 0) parts.push(`Multa ${formatBRL(lateFees.fine)}`);
  return parts.join(' · ');
}

/** What confirming the employees dialog does, given the typed count and the existing charge. */
export type EmployeesAction = 'create' | 'update' | 'remove' | 'none';

export function employeesAction(employees: number | null, existing: Pick<Transaction, 'employees'> | null | undefined): EmployeesAction {
  if (employees === null) return 'none';
  if (employees === 0) return existing === null ? 'none' : 'remove';
  return existing ? 'update' : 'create';
}
