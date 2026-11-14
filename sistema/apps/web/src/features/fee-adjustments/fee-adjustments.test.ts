import { describe, expect, it } from 'vitest';
import type { Client, FeeAdjustmentLetterOffice, FeeAdjustmentPreviewItem } from '@effinance/shared';
import { adjustmentHref, type FeePeriodAlert } from '@/features/dashboard/widgets/clients-math';
import { addressLines, batchBasis, dateLine, letterDate, letterheadLines, noticeOnTime, recipientLines } from './letter-text';
import {
  adjustedValues,
  adjustmentPlan,
  batchIndexLabel,
  bpsToInput,
  defaultAdjustmentMonth,
  EMPTY_INDEX_TEXTS,
  formatBps,
  indexRows,
  monthParam,
  monthSummary,
  NO_INDICES,
  parseAppliedPercent,
  parseIndexPercent,
  parseIndices,
  readyIds,
  selectionTotals,
} from './logic';

function item(over: Partial<FeeAdjustmentPreviewItem> & { clientId: string }): FeeAdjustmentPreviewItem {
  return {
    name: over.clientId,
    legalName: over.clientId,
    status: 'ready',
    period: { index: 1, startDate: '2027-01-01', endDate: '2027-12-31' },
    noticeDeadline: '2026-12-02',
    noticeLate: false,
    current: { feeId: `f-${over.clientId}`, amount: 100_000, employeeFee: 5_000, discountBps: 0 },
    proposed: null,
    registered: null,
    ...over,
  };
}

describe('percentages typed in the fields', () => {
  it('reads an index with comma or dot, sign, % and blank (not informed)', () => {
    expect(parseIndexPercent('4,27')).toEqual({ ok: true, bps: 427 });
    expect(parseIndexPercent(' 4.5 % ')).toEqual({ ok: true, bps: 450 });
    expect(parseIndexPercent('-3,18')).toEqual({ ok: true, bps: -318 });
    expect(parseIndexPercent('−1,5')).toEqual({ ok: true, bps: -150 });
    expect(parseIndexPercent('-0')).toEqual({ ok: true, bps: 0 });
    expect(parseIndexPercent('')).toEqual({ ok: true, bps: null });
  });

  it('rejects text, more than two decimals and more than 100%', () => {
    expect(parseIndexPercent('abc').ok).toBe(false);
    expect(parseIndexPercent('4,275').ok).toBe(false);
    expect(parseIndexPercent('120')).toEqual({ ok: false, error: 'Use um percentual entre -100% e 100%' });
  });

  it('requires the applied percentage and never accepts it negative', () => {
    expect(parseAppliedPercent('3,5')).toEqual({ ok: true, bps: 350 });
    expect(parseAppliedPercent('0')).toEqual({ ok: true, bps: 0 });
    expect(parseAppliedPercent('')).toEqual({ ok: false, error: 'Informe o percentual a aplicar' });
    expect(parseAppliedPercent('-1')).toEqual({ ok: false, error: 'O reajuste não pode ser negativo: o contrato só reajusta para cima' });
    expect(parseAppliedPercent('101').ok).toBe(false);
  });

  it('parses the four fields together, a wrong one counting as not informed', () => {
    const parsed = parseIndices({ ...EMPTY_INDEX_TEXTS, igpm: '-3,18', ipca: '4,27', inpc: 'x' });
    expect(parsed.values).toEqual({ igpm: -318, ipca: 427, inpc: null, cct: null });
    expect(parsed.valid).toBe(false);
    expect(Object.keys(parsed.errors)).toEqual(['inpc']);
    expect(parseIndices(EMPTY_INDEX_TEXTS)).toMatchObject({ values: NO_INDICES, valid: true });
  });

  it('formats basis points for reading and for the field', () => {
    expect(formatBps(427)).toBe('4,27%');
    expect(formatBps(-150)).toBe('−1,5%');
    expect(formatBps(0)).toBe('0%');
    expect(bpsToInput(405)).toBe('4,05');
    expect(bpsToInput(-318)).toBe('-3,18');
    expect(bpsToInput(null)).toBe('');
  });
});

describe('the month and the percentage of the batch', () => {
  it('suggests the first month whose periods all keep the 30-day notice', () => {
    expect(defaultAdjustmentMonth('2026-11-14')).toBe('2027-01');
    expect(defaultAdjustmentMonth('2026-12-02')).toBe('2027-01');
    expect(defaultAdjustmentMonth('2026-12-03')).toBe('2027-02');
    expect(defaultAdjustmentMonth('2026-10-01')).toBe('2026-11');
  });

  it('accepts only a valid month in the address', () => {
    expect(monthParam('2027-03')).toBe('2027-03');
    expect(monthParam('2027-13')).toBeNull();
    expect(monthParam('março')).toBeNull();
    expect(monthParam(null)).toBeNull();
  });

  it('applies the largest positive index and writes the calculation memory', () => {
    const plan = adjustmentPlan({ igpm: -318, ipca: 427, inpc: 410, cct: null });
    expect(plan).toMatchObject({ appliedBps: 427, chosen: 'ipca', manual: false, factor: '1,0427' });
    expect(plan.memory).toBe('Maior índice: IPCA 4,27% → fator 1,0427');
  });

  it('marks a percentage typed by hand (negotiated) and says so in the memory', () => {
    const plan = adjustmentPlan({ igpm: null, ipca: 427, inpc: null, cct: null }, 350);
    expect(plan).toMatchObject({ appliedBps: 350, chosen: null, manual: true, factor: '1,0350' });
    expect(plan.memory).toBe('Maior índice: IPCA 4,27% · aplicado 3,5% → fator 1,0350');
  });

  it('does not adjust without a positive index', () => {
    expect(adjustmentPlan({ igpm: -318, ipca: 0, inpc: null, cct: null }).memory).toBe('Nenhum índice positivo · aplicado 0% → fator 1,0000');
    expect(adjustmentPlan(NO_INDICES).memory).toBe('Nenhum índice informado · aplicado 0% → fator 1,0000');
  });

  it('names how a batch got its percentage', () => {
    expect(batchIndexLabel({ chosenIndex: 'cct', appliedBps: 500 })).toBe('CCT');
    expect(batchIndexLabel({ chosenIndex: null, appliedBps: 350 })).toBe('Negociado');
    expect(batchIndexLabel({ chosenIndex: null, appliedBps: 0 })).toBe('Sem índice positivo');
  });

  it('lists the four indices for the letter, the chosen one marked', () => {
    const rows = indexRows({ igpm: -318, ipca: 427, inpc: null, cct: 500 }, 'cct');
    expect(rows.map((r) => [r.label, r.value, r.chosen])).toEqual([
      ['IGP-M (FGV)', '−3,18%', false],
      ['IPCA (IBGE)', '4,27%', false],
      ['INPC (IBGE)', 'não informado', false],
      ['Reajuste da CCT', '5%', true],
    ]);
  });
});

describe('the clients of the month', () => {
  const items = [
    item({ clientId: 'a' }),
    item({ clientId: 'b', noticeLate: true, current: { feeId: 'fb', amount: 250_050, employeeFee: 0, discountBps: 500 } }),
    item({ clientId: 'c', status: 'already_adjusted', registered: { feeId: 'r', amount: 104_270, employeeFee: 5_214, adjustmentId: 'x' } }),
    item({ clientId: 'd', status: 'no_previous_fee', current: null }),
  ];

  it('adjusts like the API: half a cent up, the fee per employee only when asked', () => {
    expect(adjustedValues({ amount: 100_000, employeeFee: 5_000 }, 427, true)).toEqual({ amount: 104_270, employeeFee: 5_214 });
    expect(adjustedValues({ amount: 100_000, employeeFee: 5_000 }, 427, false)).toEqual({ amount: 104_270, employeeFee: 5_000 });
    expect(adjustedValues({ amount: 250_050, employeeFee: 0 }, 427, true).amount).toBe(260_727);
  });

  it('checks the ready ones and totals only the selected ready ones', () => {
    expect([...readyIds(items)]).toEqual(['a', 'b']);
    expect(selectionTotals(items, new Set(['a', 'b', 'c', 'd']), 427)).toEqual({ count: 2, current: 350_050, proposed: 104_270 + 260_727, late: 1 });
    expect(selectionTotals(items, new Set(['a']), 0)).toEqual({ count: 1, current: 100_000, proposed: 100_000, late: 0 });
  });

  it('summarizes the month by situation', () => {
    expect(monthSummary(items)).toBe('4 clientes · 2 prontos · 1 já reajustado · 1 sem vigência anterior');
    expect(monthSummary([items[0]!])).toBe('1 cliente · 1 pronto');
  });

  it('links the periods card to the month the soonest ending period renews', () => {
    const ending = (date: string): FeePeriodAlert => ({ kind: 'ending', client: {} as Client, date, days: 10 });
    const missing: FeePeriodAlert = { kind: 'missing', client: {} as Client, reason: 'none', date: null };
    expect(adjustmentHref([missing, ending('2026-12-31'), ending('2027-01-09')])).toBe('/clientes/reajuste?mes=2027-01');
    expect(adjustmentHref([missing])).toBe('/clientes/reajuste');
  });
});

describe('the letter', () => {
  const office: FeeAdjustmentLetterOffice = {
    name: 'Efficio Contabilidade',
    legalName: 'Efficio Serviços Contábeis Ltda',
    document: '12345678000190',
    zipCode: '01310100',
    street: 'Avenida Paulista',
    number: '1000',
    complement: 'sala 2',
    district: 'Bela Vista',
    city: 'São Paulo',
    state: 'SP',
    phone: '11987654321',
    email: 'contato@efficio.com.br',
    website: null,
    responsibleName: 'Israel Souza',
    logo: null,
    registered: true,
  };

  it('dates the letters on the day the batch was applied, with the office city', () => {
    expect(letterDate(new Date(2026, 10, 14, 13, 5).toISOString())).toBe('2026-11-14');
    expect(dateLine('São Paulo', '2026-11-14')).toBe('São Paulo, 14 de novembro de 2026.');
    expect(dateLine(null, '2026-11-14')).toBe('14 de novembro de 2026.');
  });

  it('writes the letterhead and the addressee, leaving the blanks out', () => {
    expect(letterheadLines(office)).toEqual({
      name: 'Efficio Contabilidade',
      lines: ['Efficio Serviços Contábeis Ltda · CNPJ 12.345.678/0001-90', 'Avenida Paulista, 1000 – sala 2 · Bela Vista – São Paulo/SP · CEP 01310-100', '(11) 98765-4321 · contato@efficio.com.br'],
    });
    expect(addressLines({ street: null, number: null, complement: null, district: null, city: 'Campinas', state: 'SP', zipCode: null })).toEqual(['Campinas/SP']);
    expect(
      recipientLines({ name: 'Padaria Pão Dourado Ltda', tradeName: 'Pão Dourado', document: '11222333000181', responsibleName: 'Ana Lima', email: null, zipCode: null, street: 'Rua A', number: '5', complement: null, district: null, city: null, state: null }),
    ).toEqual(['Padaria Pão Dourado Ltda', 'CNPJ 11.222.333/0001-81', 'A/C Ana Lima', 'Rua A, 5']);
  });

  it('tells the largest index from a negotiated percentage and checks the 30-day notice', () => {
    const indices = { igpmBps: 310, ipcaBps: 427, inpcBps: null, cctBps: null };
    expect(batchBasis({ indices, appliedBps: 427 })).toBe('largest');
    expect(batchBasis({ indices, appliedBps: 310 })).toBe('negotiated');
    expect(batchBasis({ indices, appliedBps: 0 })).toBe('none');
    expect(noticeOnTime({ noticeDeadline: '2026-12-02' }, '2026-12-02')).toBe(true);
    expect(noticeOnTime({ noticeDeadline: '2026-12-02' }, '2026-12-03')).toBe(false);
  });
});
