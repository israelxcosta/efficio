import { describe, expect, it } from 'vitest';
import { clientFeeInputSchema, clientInactivationSchema, clientInputSchema, feePeriod, feePeriodIndexAt } from '../src';

describe('fee periods', () => {
  it('runs one year back to back from the contract start', () => {
    expect(feePeriod('2024-03-15', 0)).toEqual({ index: 0, startDate: '2024-03-15', endDate: '2025-03-14' });
    expect(feePeriod('2024-03-15', 2)).toEqual({ index: 2, startDate: '2026-03-15', endDate: '2027-03-14' });
  });

  it('keeps a Feb 29 start contiguous across non-leap years', () => {
    expect(feePeriod('2024-02-29', 0).endDate).toBe('2025-02-27');
    expect(feePeriod('2024-02-29', 1)).toEqual({ index: 1, startDate: '2025-02-28', endDate: '2026-02-27' });
    expect(feePeriod('2024-02-29', 4).startDate).toBe('2028-02-29');
  });

  it('finds the period that contains a date', () => {
    expect(feePeriodIndexAt('2024-03-15', '2024-03-15')).toBe(0);
    expect(feePeriodIndexAt('2024-03-15', '2025-03-14')).toBe(0);
    expect(feePeriodIndexAt('2024-03-15', '2025-03-15')).toBe(1);
    expect(feePeriodIndexAt('2024-03-15', '2026-10-21')).toBe(2);
    expect(feePeriodIndexAt('2024-03-15', '2024-03-14')).toBe(-1);
  });
});

describe('client schemas', () => {
  const base = {
    name: 'Padaria Pão Quente Ltda',
    document: '11.222.333/0001-81',
    taxRegime: 'simples_nacional' as const,
    simplesAnnex: 'I' as const,
    contractStartDate: '2024-03-15',
  };

  it('requires a valid CNPJ', () => {
    expect(clientInputSchema.parse(base).document).toBe('11222333000181');
    expect(clientInputSchema.safeParse({ ...base, document: '' }).error?.issues[0]?.message).toBe('Informe o CNPJ');
    expect(clientInputSchema.safeParse({ ...base, document: '11.222.333/0001-80' }).error?.issues[0]?.message).toBe('CNPJ inválido');
    // A CPF is not a company.
    expect(clientInputSchema.safeParse({ ...base, document: '529.982.247-25' }).success).toBe(false);
  });

  it('requires the Simples annex only for the Simples Nacional', () => {
    const missing = clientInputSchema.safeParse({ ...base, simplesAnnex: '' });
    expect(missing.error?.issues[0]?.path).toEqual(['simplesAnnex']);
    expect(clientInputSchema.parse({ ...base, taxRegime: 'presumed_profit' }).simplesAnnex).toBeNull();
  });

  it('requires the contract start date', () => {
    const r = clientInputSchema.safeParse({ ...base, contractStartDate: '' });
    expect(r.error?.issues[0]?.message).toBe('Informe a data de início do contrato');
  });

  it('asks for a description when the inactivation reason is "other"', () => {
    expect(clientInactivationSchema.safeParse({ date: '2026-10-01', reason: 'contract_end' }).success).toBe(true);
    const other = clientInactivationSchema.safeParse({ date: '2026-10-01', reason: 'other', notes: '' });
    expect(other.error?.issues[0]?.path).toEqual(['notes']);
  });

  it('accepts a zero employee fee but not a zero monthly fee', () => {
    expect(clientFeeInputSchema.parse({ amount: 85000 })).toEqual({ amount: 85000, employeeFee: 0 });
    expect(clientFeeInputSchema.safeParse({ amount: 0, employeeFee: 3500 }).success).toBe(false);
  });
});
