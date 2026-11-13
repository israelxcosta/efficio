import { describe, expect, it } from 'vitest';
import {
  adjustByBps,
  adjustmentFactorText,
  adjustmentNoticeDeadline,
  applyFeeAdjustmentSchema,
  chosenAdjustmentIndex,
  CLIENT_DOCUMENT_KIND_GROUP,
  CLIENT_DOCUMENT_KIND_LABELS,
  CLIENT_DOCUMENT_KINDS,
  clientDocumentInputSchema,
  feeAdjustmentPreviewQuerySchema,
  indexValuesOf,
  LATE_FEE_CATEGORY,
  occurrencesInCompetence,
  REGIME_GROUP_ITEMS,
  registerSchema,
  renewalPeriodIn,
  suggestedAdjustment,
} from '../src';

const none = { igpm: null, ipca: null, inpc: null, cct: null };

describe('yearly fee adjustment (contract clause 3)', () => {
  it('suggests the largest positive index; none positive means no adjustment', () => {
    expect(suggestedAdjustment({ igpm: 377, ipca: 468, inpc: 450, cct: 550 })).toEqual({ bps: 550, index: 'cct' });
    expect(suggestedAdjustment({ igpm: -103, ipca: 468, inpc: null, cct: null })).toEqual({ bps: 468, index: 'ipca' });
    // "Maior variação positiva" (3.3): deflation everywhere does not lower the fee.
    expect(suggestedAdjustment({ igpm: -103, ipca: -20, inpc: 0, cct: null })).toEqual({ bps: 0, index: null });
    expect(suggestedAdjustment(none)).toEqual({ bps: 0, index: null });
    // Ties: the first in the catalog order.
    expect(suggestedAdjustment({ igpm: 400, ipca: 400, inpc: null, cct: null })).toEqual({ bps: 400, index: 'igpm' });
  });

  it('names the chosen index: the suggestion, another index with the same value, or none (typed by hand)', () => {
    const indices = { igpm: 377, ipca: 468, inpc: 450, cct: 550 };
    expect(chosenAdjustmentIndex(indices, 550)).toBe('cct');
    expect(chosenAdjustmentIndex(indices, 468)).toBe('ipca');
    expect(chosenAdjustmentIndex(indices, 500)).toBeNull();
    expect(chosenAdjustmentIndex({ ...none, igpm: -50 }, 0)).toBeNull();
    expect(indexValuesOf({ igpmBps: 1, ipcaBps: null, inpcBps: 3, cctBps: -4 })).toEqual({ igpm: 1, ipca: null, inpc: 3, cct: -4 });
  });

  it('adjusts in cents, rounding half up', () => {
    expect(adjustByBps(100_000, 427)).toBe(104_270);
    expect(adjustByBps(85_000, 550)).toBe(89_675);
    // 12.345 × 1,0427 = 12.872,1315 → 12.872; 3.333 × 1,0450 = 3.482,985 → 3.483.
    expect(adjustByBps(12_345, 427)).toBe(12_872);
    expect(adjustByBps(3_333, 450)).toBe(3_483);
    // Exactly half a cent goes up: 5.000 × 1,0001 = 5.000,5 → 5.001.
    expect(adjustByBps(5_000, 1)).toBe(5_001);
    expect(adjustByBps(0, 550)).toBe(0);
    expect(adjustByBps(80_000, 0)).toBe(80_000);
    expect(adjustmentFactorText(427)).toBe('1,0427');
    expect(adjustmentFactorText(0)).toBe('1,0000');
    expect(adjustmentFactorText(1_250)).toBe('1,1250');
  });

  it('finds the period a contract renews in a month (never the first one)', () => {
    expect(renewalPeriodIn('2024-03-15', '2026-03')).toEqual({ index: 2, startDate: '2026-03-15', endDate: '2027-03-14' });
    expect(renewalPeriodIn('2024-03-15', '2026-04')).toBeNull();
    expect(renewalPeriodIn('2026-03-15', '2026-03')).toBeNull(); // the contract starts: nothing to adjust
    expect(renewalPeriodIn('2027-03-15', '2026-03')).toBeNull();
    // Feb 29 anchors fall on Feb 28 in common years (utils/fees.ts).
    expect(renewalPeriodIn('2024-02-29', '2027-02')).toEqual({ index: 3, startDate: '2027-02-28', endDate: '2028-02-28' });
    expect(renewalPeriodIn('2024-01-31', '2026-01')?.startDate).toBe('2026-01-31');
  });

  it('sets the notice 30 days before the new period (clause 3.5)', () => {
    expect(adjustmentNoticeDeadline('2026-12-10')).toBe('2026-11-10');
    expect(adjustmentNoticeDeadline('2027-03-01')).toBe('2027-01-30');
  });

  it('validates the batch: indices may be negative or blank; the applied percentage never negative', () => {
    const ids = ['8a3f2c4e-1b2d-4c5e-9f60-7a8b9c0d1e2f'];
    const ok = applyFeeAdjustmentSchema.parse({ month: '2026-12', igpmBps: -103, ipcaBps: 468, clientIds: ids });
    expect(ok).toMatchObject({ igpmBps: -103, ipcaBps: 468, inpcBps: null, cctBps: null, adjustEmployeeFee: true });
    expect(ok.appliedBps).toBeUndefined();
    const negative = applyFeeAdjustmentSchema.safeParse({ month: '2026-12', appliedBps: -50, clientIds: ids });
    expect(negative.error?.issues[0]?.message).toBe('O reajuste não pode ser negativo: o contrato só reajusta para cima');
    expect(applyFeeAdjustmentSchema.safeParse({ month: '2026-12', appliedBps: 10_001, clientIds: ids }).success).toBe(false);
    expect(applyFeeAdjustmentSchema.safeParse({ month: '2026-12', igpmBps: 4.27, clientIds: ids }).success).toBe(false);
    expect(applyFeeAdjustmentSchema.safeParse({ month: '2026-12', clientIds: [] }).error?.issues[0]?.message).toBe('Selecione ao menos um cliente');
    expect(applyFeeAdjustmentSchema.safeParse({ month: '2026-13', clientIds: ids }).success).toBe(false);
  });

  it('reads the preview query string: blank means not informed', () => {
    expect(feeAdjustmentPreviewQuerySchema.parse({ month: '2026-12' })).toEqual({
      month: '2026-12',
      igpmBps: null,
      ipcaBps: null,
      inpcBps: null,
      cctBps: null,
      appliedBps: undefined,
      adjustEmployeeFee: true,
    });
    const q = feeAdjustmentPreviewQuerySchema.parse({ month: '2026-12', igpmBps: '-103', ipcaBps: '', cctBps: '550', appliedBps: '500', adjustEmployeeFee: 'false' });
    expect(q).toMatchObject({ igpmBps: -103, ipcaBps: null, cctBps: 550, appliedBps: 500, adjustEmployeeFee: false });
    expect(feeAdjustmentPreviewQuerySchema.parse({ month: '2026-12', appliedBps: '' }).appliedBps).toBeUndefined();
    expect(feeAdjustmentPreviewQuerySchema.safeParse({ month: '2026-12', appliedBps: '-1' }).success).toBe(false);
    expect(feeAdjustmentPreviewQuerySchema.safeParse({ month: '2026-12', inpcBps: 'abc' }).success).toBe(false);
  });
});

describe('catalog fixes (13/11/2026)', () => {
  it('DCTFWeb: legal deadline on the last business day of the following month, target by the 15th', () => {
    const dctf = REGIME_GROUP_ITEMS.find((i) => i.key === 'dctfweb')!;
    expect(occurrencesInCompetence(dctf, '2026-11')[0]).toMatchObject({ legalDueDate: '2026-11-30', targetDate: '2026-11-13', referenceMonth: '2026-10' });
    // 2027-01-31 is a Sunday: the last business day is Friday the 29th.
    expect(occurrencesInCompetence(dctf, '2027-01')[0]).toMatchObject({ legalDueDate: '2027-01-29', referenceMonth: '2026-12' });
    for (let m = 1; m <= 12; m++) {
      const [o] = occurrencesInCompetence(dctf, `2027-${String(m).padStart(2, '0')}`);
      expect(Number(o!.targetDate.slice(8)), o!.targetDate).toBeLessThanOrEqual(15);
    }
    expect(dctf.description).toContain('último dia útil do mês seguinte');
  });

  it('e-CAC electronic power of attorney is a client document with an expiry date', () => {
    expect(CLIENT_DOCUMENT_KINDS).toContain('ecac_power_of_attorney');
    expect(CLIENT_DOCUMENT_KIND_LABELS.ecac_power_of_attorney).toBe('Procuração eletrônica e-CAC');
    expect(CLIENT_DOCUMENT_KIND_GROUP.ecac_power_of_attorney).toBe('certificates');
    expect(clientDocumentInputSchema.parse({ kind: 'ecac_power_of_attorney', expiresAt: '2031-11-13' })).toMatchObject({
      kind: 'ecac_power_of_attorney',
      expiresAt: '2031-11-13',
      customName: null,
    });
  });

  it('interest and fines have their own categories, by the type of the original', () => {
    expect(LATE_FEE_CATEGORY.income).toEqual({ name: 'Receitas financeiras', lateFee: 'Juros e multas recebidos' });
    expect(LATE_FEE_CATEGORY.expense).toEqual({ name: 'Despesas financeiras', lateFee: 'Juros e multas' });
  });

  it('the sign-up accepts the token of an invite link', () => {
    const base = { name: 'Bruna', email: 'Bruna@Escritorio.com', password: 'senha-segura-123', acceptTerms: true as const };
    expect(registerSchema.parse(base).inviteToken).toBeUndefined();
    expect(registerSchema.parse({ ...base, inviteToken: ` ${'a'.repeat(43)} ` }).inviteToken).toBe('a'.repeat(43));
    expect(registerSchema.safeParse({ ...base, inviteToken: 'curto' }).error?.issues[0]?.message).toBe('Convite inválido');
  });
});
