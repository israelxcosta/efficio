import { describe, expect, it } from 'vitest';
import type { Transaction } from '@effinance/shared';
import {
  competenceLabel,
  competenceLongLabel,
  employeesAction,
  employeesFormula,
  feeDueDate,
  findEmployeesCharge,
  isMonthKey,
  lateFeesSplit,
  lateFeesTotal,
  parseDueDay,
  parseEmployees,
  plural,
  transactionsInCacheData,
} from './fee-charges';

const tx = (patch: Partial<Transaction>): Transaction => ({ id: 'x', feeKind: null, feeOf: null, ...patch }) as Transaction;

describe('feeDueDate', () => {
  it('falls on the due day of the month after the competence', () => {
    expect(feeDueDate('2026-10', 10)).toBe('2026-11-10');
    expect(feeDueDate('2026-10', 1)).toBe('2026-11-01');
  });

  it('crosses the year after December', () => {
    expect(feeDueDate('2026-12', 10)).toBe('2027-01-10');
  });

  it('clamps the day to the length of the due month', () => {
    expect(feeDueDate('2026-10', 31)).toBe('2026-11-30');
    expect(feeDueDate('2027-01', 31)).toBe('2027-02-28');
    expect(feeDueDate('2027-01', 29)).toBe('2027-02-28');
    // 2028 is a leap year.
    expect(feeDueDate('2028-01', 31)).toBe('2028-02-29');
    expect(feeDueDate('2026-11', 31)).toBe('2026-12-31');
  });

  it('keeps out-of-range days inside the month', () => {
    expect(feeDueDate('2026-10', 0)).toBe('2026-11-01');
    expect(feeDueDate('2026-10', 45)).toBe('2026-11-30');
  });
});

describe('competence labels', () => {
  it('formats MM/AAAA and the long month name', () => {
    expect(competenceLabel('2026-10')).toBe('10/2026');
    expect(competenceLabel('2027-01')).toBe('01/2027');
    expect(competenceLongLabel('2026-10')).toBe('Outubro de 2026');
    expect(competenceLongLabel('2027-03')).toBe('Março de 2027');
  });

  it('recognizes month keys', () => {
    expect(isMonthKey('2026-10')).toBe(true);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey('2026-1')).toBe(false);
    expect(isMonthKey(null)).toBe(false);
  });
});

describe('parseDueDay', () => {
  it('accepts integers from 1 to 31', () => {
    expect(parseDueDay('10')).toBe(10);
    expect(parseDueDay(' 5 ')).toBe(5);
    expect(parseDueDay('31')).toBe(31);
  });

  it('rejects empty, zero, out of range and decimals', () => {
    for (const v of ['', '0', '32', '1.5', '-3', 'abc', '100']) expect(parseDueDay(v)).toBeNull();
  });
});

describe('parseEmployees', () => {
  it('accepts integers from 0 to 100.000', () => {
    expect(parseEmployees('0')).toBe(0);
    expect(parseEmployees('12')).toBe(12);
    expect(parseEmployees('100000')).toBe(100_000);
  });

  it('rejects empty, negatives, decimals and too many', () => {
    for (const v of ['', ' ', '-1', '2,5', '2.5', '100001', '1e3']) expect(parseEmployees(v)).toBeNull();
  });
});

describe('texts', () => {
  it('pluralizes', () => {
    expect(plural(1, 'honorário', 'honorários')).toBe('1 honorário');
    expect(plural(0, 'honorário', 'honorários')).toBe('0 honorários');
    expect(plural(1200, 'empregado', 'empregados')).toBe('1.200 empregados');
  });

  it('writes the employees formula', () => {
    expect(employeesFormula(5, 3500)).toBe('5 × R$ 35,00 = R$ 175,00');
    expect(employeesFormula(2, 4000, 8000)).toBe('2 × R$ 40,00 = R$ 80,00');
  });

  it('splits late fees', () => {
    expect(lateFeesTotal({ interest: 800, fine: 430 })).toBe(1230);
    expect(lateFeesSplit({ interest: 800, fine: 430 })).toBe('Juros R$ 8,00 · Multa R$ 4,30');
    expect(lateFeesSplit({ interest: 0, fine: 430 })).toBe('Multa R$ 4,30');
  });
});

describe('employees charge lookup', () => {
  const fee = tx({ id: 'fee-1', feeKind: 'fee' });
  const charge = tx({ id: 'emp-1', feeKind: 'employees', feeOf: 'fee-1', employees: 4 });
  const other = tx({ id: 'emp-2', feeKind: 'employees', feeOf: 'fee-2', employees: 1 });

  it('finds the charge of a fee', () => {
    expect(findEmployeesCharge('fee-1', [fee, other, charge])).toBe(charge);
    expect(findEmployeesCharge('fee-3', [fee, other, charge])).toBeNull();
  });

  it('reads transactions from list and statement cache entries', () => {
    expect(transactionsInCacheData({ items: [fee, charge] })).toEqual([fee, charge]);
    expect(transactionsInCacheData({ entries: [{ transaction: charge }, { transaction: null }] })).toEqual([charge]);
    expect(transactionsInCacheData(fee)).toEqual([]);
    expect(transactionsInCacheData(undefined)).toEqual([]);
  });
});

describe('employeesAction', () => {
  const existing = { employees: 4 };

  it('creates or updates for a positive count', () => {
    expect(employeesAction(3, null)).toBe('create');
    expect(employeesAction(3, undefined)).toBe('create');
    expect(employeesAction(3, existing)).toBe('update');
  });

  it('removes on zero unless there is known to be nothing to remove', () => {
    expect(employeesAction(0, existing)).toBe('remove');
    // Unknown (lookup still loading or failed): the API removes the charge if there is one.
    expect(employeesAction(0, undefined)).toBe('remove');
    expect(employeesAction(0, null)).toBe('none');
  });

  it('does nothing without a valid count', () => {
    expect(employeesAction(null, existing)).toBe('none');
  });
});
