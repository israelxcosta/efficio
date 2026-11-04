import { describe, expect, it } from 'vitest';
import {
  matchSuggestedDepartment,
  occurrencesInCompetence,
  recurringTaskInputSchema,
  REGIME_GROUP_ITEMS,
  REGIME_GROUP_REGIMES,
  regimeGroupItems,
} from '../src';

describe('regime groups catalog', () => {
  it('every item is a valid recurring task, with a unique key and at least one regime of the catalog', () => {
    const keys = new Set<string>();
    for (const item of REGIME_GROUP_ITEMS) {
      expect(item.key).toMatch(/^[a-z0-9_]{1,60}$/);
      expect(keys.has(item.key), item.key).toBe(false);
      keys.add(item.key);
      expect(item.regimes.length, item.key).toBeGreaterThan(0);
      for (const r of item.regimes) expect(REGIME_GROUP_REGIMES).toContain(r);
      const parsed = recurringTaskInputSchema.safeParse({ ...item, regimes: item.regimes, description: item.description });
      expect(parsed.success, `${item.key}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it('groups: the employer obligations are common; each regime has its own', () => {
    const keysOf = (r: (typeof REGIME_GROUP_REGIMES)[number]) => regimeGroupItems(r).map((i) => i.key);
    const common = ['payroll', 'esocial_periodic', 'fgts_digital', 'dctfweb', 'efd_reinf'];
    for (const r of ['simples_nacional', 'presumed_profit', 'real_profit'] as const) {
      for (const key of common) expect(keysOf(r), r).toContain(key);
    }
    expect(keysOf('simples_nacional')).toEqual(expect.arrayContaining(['pgdas_das', 'defis']));
    expect(keysOf('mei')).toEqual(['das_mei', 'dasn_simei']);
    expect(keysOf('presumed_profit')).toEqual(expect.arrayContaining(['pis_cofins', 'efd_contribuicoes', 'irpj_csll_quarterly', 'ecd', 'ecf']));
    expect(keysOf('presumed_profit')).not.toContain('irpj_csll_monthly_estimate');
    expect(keysOf('real_profit')).toEqual(expect.arrayContaining(['irpj_csll_monthly_estimate', 'ecd', 'ecf']));
    expect(keysOf('real_profit')).not.toContain('pgdas_das');
  });

  it('deadlines: DAS on the 20th (postponed to a business day), DEFIS on March 31st referring to December', () => {
    const das = REGIME_GROUP_ITEMS.find((i) => i.key === 'pgdas_das')!;
    // 2026-12-20 is a Sunday: postponed to Monday the 21st.
    expect(occurrencesInCompetence(das, '2026-12')[0]).toMatchObject({ legalDueDate: '2026-12-21', referenceMonth: '2026-11' });
    const defis = REGIME_GROUP_ITEMS.find((i) => i.key === 'defis')!;
    expect(occurrencesInCompetence(defis, '2027-03')[0]).toMatchObject({ legalDueDate: '2027-03-31', referenceMonth: '2026-12' });
    expect(occurrencesInCompetence(defis, '2027-04')).toEqual([]);
  });

  it('matches the suggested department by name, without accents or case', () => {
    expect(matchSuggestedDepartment('Pessoal/DP')).toBe('personnel');
    expect(matchSuggestedDepartment('Departamento Pessoal')).toBe('personnel');
    expect(matchSuggestedDepartment('FISCAL')).toBe('fiscal');
    expect(matchSuggestedDepartment('Contábil')).toBe('accounting');
    expect(matchSuggestedDepartment('Contabilidade')).toBe('accounting');
    expect(matchSuggestedDepartment('Societário')).toBeNull();
  });
});
