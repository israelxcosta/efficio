// QA do Financeiro (agente qa-logica-financeiro): invariantes dos utilitários puros de dinheiro,
// calendário, recorrência, fatura de cartão, vigências de honorários, reajuste, juros/multa e
// inadimplência. Cada teste diz a regra que verifica; um teste falhando aqui prova um defeito.

import { describe, expect, it } from 'vitest';
import { buildOccurrenceDates, occurrenceDatesUntil } from './recurrence';
import {
  addMonths,
  daysInMonth,
  occurrenceDate,
  toISODate,
  addDays,
  diffInDays,
  monthKey,
  addMonthKey,
  type ISODate,
} from './dates';
import { splitInstallments } from './money';
import { getInvoiceDates, getInvoiceForPurchase, getInvoiceStatus, getInvoiceForSeriesOccurrence } from './invoice';
import { feePeriod, feePeriodIndexAt } from './fees';
import {
  adjustByBps,
  adjustmentFactorText,
  adjustmentNoticeDeadline,
  chosenAdjustmentIndex,
  renewalPeriodIn,
  suggestedAdjustment,
} from './fee-adjustments';
import { daysLate, discountAmount, earnsDiscount, effectiveDueDate, suggestLateFees } from './late-fees';
import { delinquencyScore, lateSeverity, riskOf } from './delinquency';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// Deterministic pseudo-random numbers (no flaky property tests).
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// ---------------------------------------------------------------------------
// Parcelamento: centavos
// ---------------------------------------------------------------------------

describe('qa-financeiro: splitInstallments (parcelas somam exatamente o total)', () => {
  it('1, 2, 12 e 24 parcelas com valores que não dividem exato: resto na 1ª, soma = total', () => {
    expect(splitInstallments(10001, 1)).toEqual([10001]);
    expect(splitInstallments(10001, 2)).toEqual([5001, 5000]);
    // 100,00 / 12 = 8,333… → 8,37 + 11 × 8,33
    const twelve = splitInstallments(10000, 12);
    expect(twelve[0]).toBe(837);
    expect(twelve.slice(1).every((v) => v === 833)).toBe(true);
    expect(sum(twelve)).toBe(10000);
    // 1.000,00 / 24 = 41,666… → 41,82 + 23 × 41,66
    const many = splitInstallments(100000, 24);
    expect(many[0]).toBe(4182);
    expect(many.slice(1).every((v) => v === 4166)).toBe(true);
    expect(sum(many)).toBe(100000);
  });

  it('valor menor que o número de parcelas: nenhuma parcela fica negativa (zeros ficam visíveis)', () => {
    // 0,05 em 12 vezes: a 1ª leva tudo, as outras 0. Nenhuma negativa, soma exata.
    const parts = splitInstallments(5, 12);
    expect(sum(parts)).toBe(5);
    expect(parts.every((v) => v >= 0)).toBe(true);
  });

  it('propriedade: para 2 000 combinações (total, n), soma exata, diferença máxima < n centavos e só a 1ª maior', () => {
    const r = rng(42);
    for (let i = 0; i < 2000; i++) {
      const n = 1 + Math.floor(r() * 360);
      const total = n + Math.floor(r() * 10_000_000);
      const parts = splitInstallments(total, n);
      expect(parts).toHaveLength(n);
      expect(sum(parts)).toBe(total);
      expect(parts.every((p) => Number.isInteger(p) && p > 0)).toBe(true);
      expect(parts[0]! - parts[n - 1]!).toBeLessThan(n);
      expect(new Set(parts.slice(1)).size).toBeLessThanOrEqual(1);
    }
  });

  it('recusa 0 parcelas', () => {
    expect(() => splitInstallments(100, 0)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Calendário da recorrência (vencimentos 29/30/31, fevereiro, meses de 30 dias)
// ---------------------------------------------------------------------------

describe('qa-financeiro: datas das ocorrências (conta fixa / parcelas)', () => {
  it('mensal no dia 31: 31/01 → 28/02 → 31/03 → 30/04 → 31/05 (âncora mantida, sem "escorregar")', () => {
    expect(buildOccurrenceDates('2027-01-31', 'monthly', 6)).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
      '2027-05-31',
      '2027-06-30',
    ]);
  });

  it('mensal no dia 29 e 30 atravessando fevereiro bissexto e não bissexto', () => {
    expect(buildOccurrenceDates('2027-01-29', 'monthly', 3)).toEqual(['2027-01-29', '2027-02-28', '2027-03-29']);
    expect(buildOccurrenceDates('2028-01-29', 'monthly', 3)).toEqual(['2028-01-29', '2028-02-29', '2028-03-29']);
    expect(buildOccurrenceDates('2027-01-30', 'monthly', 3)).toEqual(['2027-01-30', '2027-02-28', '2027-03-30']);
    expect(buildOccurrenceDates('2028-01-30', 'monthly', 3)).toEqual(['2028-01-30', '2028-02-29', '2028-03-30']);
  });

  it('anual em 29/02: 2024-02-29 → 28/02 nos anos comuns → volta a 29/02 em 2028', () => {
    expect(buildOccurrenceDates('2024-02-29', 'annual', 5)).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ]);
  });

  it('semestral em 31/08: 28/02 (ou 29/02) e de volta a 31/08', () => {
    expect(buildOccurrenceDates('2026-08-31', 'semiannual', 4)).toEqual(['2026-08-31', '2027-02-28', '2027-08-31', '2028-02-29']);
  });

  it('semanal: sempre 7 dias, inclusive na virada de ano', () => {
    const dates = buildOccurrenceDates('2026-12-24', 'weekly', 4);
    expect(dates).toEqual(['2026-12-24', '2026-12-31', '2027-01-07', '2027-01-14']);
  });

  it('propriedade: mensal nunca repete nem pula mês e nunca passa do dia âncora (todos os dias 1..31, 5 anos)', () => {
    for (let day = 1; day <= 31; day++) {
      const start = toISODate(2027, 1, Math.min(day, 31));
      const dates = buildOccurrenceDates(start, 'monthly', 60);
      for (let i = 0; i < dates.length; i++) {
        const d = dates[i]!;
        expect(monthKey(d)).toBe(addMonthKey('2027-01', i));
        const [y, m, dd] = d.split('-').map(Number) as [number, number, number];
        expect(dd).toBe(Math.min(day, daysInMonth(y, m)));
      }
    }
  });

  it('occurrenceDatesUntil gera do índice pedido até a data, sem passar do máximo', () => {
    expect(occurrenceDatesUntil('2026-01-31', 'monthly', 2, '2026-06-15')).toEqual([
      { index: 2, date: '2026-03-31' },
      { index: 3, date: '2026-04-30' },
      { index: 4, date: '2026-05-31' },
    ]);
    expect(occurrenceDatesUntil('2026-01-31', 'monthly', 0, '2030-01-01', 3)).toHaveLength(3);
  });

  it('addMonths com meses negativos e âncora', () => {
    expect(addMonths('2027-03-31', -1)).toBe('2027-02-28');
    expect(addMonths('2027-01-15', -13)).toBe('2025-12-15');
    expect(occurrenceDate('2027-01-31', 'monthly', 1)).toBe('2027-02-28');
  });
});

// ---------------------------------------------------------------------------
// Fatura do cartão
// ---------------------------------------------------------------------------

describe('qa-financeiro: fatura do cartão', () => {
  it('fechamento 10 / vencimento 17: dia 9 entra na fatura do mês, dia 10 (fechamento) e 11 vão para a próxima', () => {
    expect(getInvoiceForPurchase('2026-10-09', 10, 17)).toEqual({ month: '2026-10', closingDate: '2026-10-10', dueDate: '2026-10-17' });
    expect(getInvoiceForPurchase('2026-10-10', 10, 17).month).toBe('2026-11');
    expect(getInvoiceForPurchase('2026-10-11', 10, 17).month).toBe('2026-11');
  });

  it('vencimento antes do fechamento (fecha 25, vence 5): fatura M fecha em M−1', () => {
    expect(getInvoiceForPurchase('2026-12-24', 25, 5)).toEqual({ month: '2027-01', closingDate: '2026-12-25', dueDate: '2027-01-05' });
    expect(getInvoiceForPurchase('2026-12-25', 25, 5)).toEqual({ month: '2027-02', closingDate: '2027-01-25', dueDate: '2027-02-05' });
  });

  it('status: aberta → fechada no fechamento → vencida no vencimento com saldo; paga quando zera', () => {
    const dates = getInvoiceDates('2026-11', 5, 12);
    expect(getInvoiceStatus(dates, { total: 100, unpaidTotal: 100, today: '2026-11-04' })).toBe('open');
    expect(getInvoiceStatus(dates, { total: 100, unpaidTotal: 100, today: '2026-11-05' })).toBe('closed');
    expect(getInvoiceStatus(dates, { total: 100, unpaidTotal: 100, today: '2026-11-12' })).toBe('overdue');
    expect(getInvoiceStatus(dates, { total: 100, unpaidTotal: 0, today: '2026-11-20' })).toBe('paid');
  });

  it('propriedade: cada data de compra cai numa fatura cujo fechamento é DEPOIS dela e o anterior é ATÉ ela', () => {
    for (let closing = 1; closing <= 31; closing++) {
      for (const due of [1, 5, 10, 15, 20, 28, 31]) {
        for (let d = '2027-01-01'; d <= '2028-12-31'; d = addDays(d, 3)) {
          const inv = getInvoiceForPurchase(d, closing, due);
          expect(inv.closingDate > d).toBe(true);
          const previous = getInvoiceDates(addMonthKey(inv.month, -1), closing, due);
          expect(previous.closingDate <= d).toBe(true);
        }
      }
    }
  });

  // Parcelas no cartão: cada parcela é datada "compra + k meses" (âncora no dia da compra) e vai para a
  // fatura dessa data. Esperado: parcela k na fatura (fatura da 1ª) + k — uma por fatura, sem pular.
  it('CORRIGIDO: compra parcelada no dia 29 com fechamento dia 30 — em fevereiro a parcela cai no fechamento e pula de fatura', () => {
    const dates = buildOccurrenceDates('2027-01-29', 'monthly', 3); // 29/01, 28/02, 29/03
    const months = dates.map((d, i) => getInvoiceForSeriesOccurrence('2027-01-29', 'monthly', i, d, 30, 10).month);
    // Antes da correção (fatura por data): ['2027-02', '2027-04', '2027-04'].
    expect(months).toEqual(['2027-02', '2027-03', '2027-04']);
  });

  it('CORRIGIDO: assinatura/parcelas no dia 30 com fechamento dia 31 — todo mês de 30 dias empurra a parcela para a fatura seguinte', () => {
    const dates = buildOccurrenceDates('2027-03-30', 'monthly', 4); // 30/03, 30/04, 30/05, 30/06
    const months = dates.map((d, i) => getInvoiceForSeriesOccurrence('2027-03-30', 'monthly', i, d, 31, 8).month);
    // Vence dia 8 (antes do fechamento): a fatura M fecha em 31/M−1 (30/M−1 nos meses de 30 dias).
    // Obtido: ['2027-04', '2027-06', '2027-06', '2027-08'] — maio e julho vazias, junho e agosto em dobro.
    expect(months).toEqual(['2027-04', '2027-05', '2027-06', '2027-07']);
  });

  it('propriedade: parcelas mensais devem ocupar faturas consecutivas', () => {
    const broken: string[] = [];
    for (let closing = 1; closing <= 31; closing++) {
      for (let day = 1; day <= 31; day++) {
        const start = toISODate(2027, 1, day);
        const months = buildOccurrenceDates(start, 'monthly', 13).map((d, i) => getInvoiceForSeriesOccurrence(start, 'monthly', i, d, closing, 10).month);
        const ok = months.every((m, i) => m === addMonthKey(months[0]!, i));
        if (!ok) broken.push(`fecha ${closing}, compra dia ${day}`);
      }
    }
    // Esperado: nenhuma combinação quebrada.
    expect(broken).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Vigências de honorários e reajuste
// ---------------------------------------------------------------------------

describe('qa-financeiro: vigências anuais (feePeriod / feePeriodIndexAt)', () => {
  it('contrato que começa no meio do mês: vigências emendadas, fim = véspera do próximo início', () => {
    expect(feePeriod('2025-10-15', 0)).toEqual({ index: 0, startDate: '2025-10-15', endDate: '2026-10-14' });
    expect(feePeriod('2025-10-15', 1)).toEqual({ index: 1, startDate: '2026-10-15', endDate: '2027-10-14' });
    expect(feePeriodIndexAt('2025-10-15', '2026-10-14')).toBe(0);
    expect(feePeriodIndexAt('2025-10-15', '2026-10-15')).toBe(1);
    expect(feePeriodIndexAt('2025-10-15', '2025-10-14')).toBe(-1);
  });

  it('contrato em 29/02: 28/02 nos anos comuns, 29/02 nos bissextos, sem buraco nem sobreposição', () => {
    expect(feePeriod('2024-02-29', 0)).toEqual({ index: 0, startDate: '2024-02-29', endDate: '2025-02-27' });
    expect(feePeriod('2024-02-29', 1)).toEqual({ index: 1, startDate: '2025-02-28', endDate: '2026-02-27' });
    expect(feePeriod('2024-02-29', 3)).toEqual({ index: 3, startDate: '2027-02-28', endDate: '2028-02-28' });
    expect(feePeriod('2024-02-29', 4).startDate).toBe('2028-02-29');
  });

  it('propriedade: todo dia depois do início pertence a exatamente uma vigência (vários inícios, 6 anos)', () => {
    for (const start of ['2024-02-29', '2025-01-31', '2025-10-15', '2023-12-31', '2026-03-01']) {
      for (let d = start; d <= addDays(start, 365 * 6); d = addDays(d, 1)) {
        const i = feePeriodIndexAt(start, d);
        const p = feePeriod(start, i);
        expect(p.startDate <= d && d <= p.endDate).toBe(true);
        expect(addDays(p.endDate, 1)).toBe(feePeriod(start, i + 1).startDate);
      }
    }
  });

  it('renovação no mês: só a partir do 2º ano e no mês do início', () => {
    expect(renewalPeriodIn('2025-10-15', '2026-10')).toMatchObject({ index: 1, startDate: '2026-10-15' });
    expect(renewalPeriodIn('2025-10-15', '2025-10')).toBeNull();
    expect(renewalPeriodIn('2025-10-15', '2026-11')).toBeNull();
    expect(renewalPeriodIn('2024-02-29', '2025-02')).toMatchObject({ index: 1, startDate: '2025-02-28' });
    expect(adjustmentNoticeDeadline('2026-10-15')).toBe('2026-09-15');
  });

  it('reajuste: maior índice positivo; arredonda meio centavo para cima; fator na carta', () => {
    expect(suggestedAdjustment({ igpm: -103, ipca: 468, inpc: 450, cct: 550 })).toEqual({ bps: 550, index: 'cct' });
    expect(suggestedAdjustment({ igpm: -1, ipca: null, inpc: 0, cct: null })).toEqual({ bps: 0, index: null });
    expect(chosenAdjustmentIndex({ igpm: 427, ipca: 427, inpc: 1, cct: null }, 427)).toBe('igpm');
    expect(chosenAdjustmentIndex({ igpm: 427, ipca: 300, inpc: 1, cct: null }, 500)).toBeNull();
    // 850,00 × 1,055 = 896,75 exatos; 85.001 × 1,0050 = 85.426,005 → 85.426,01 (meio centavo para cima).
    expect(adjustByBps(85_000, 550)).toBe(89_675);
    expect(adjustByBps(8_500_100, 50)).toBe(8_542_601);
    expect(adjustByBps(12_345, 0)).toBe(12_345);
    expect(adjustmentFactorText(427)).toBe('1,0427');
    expect(adjustmentFactorText(10_000)).toBe('2,0000');
  });

  it('propriedade: reajuste nunca reduz o valor e erra no máximo meio centavo', () => {
    const r = rng(7);
    for (let i = 0; i < 2000; i++) {
      const amount = 1 + Math.floor(r() * 10_000_000);
      const bps = Math.floor(r() * 10_001);
      const out = adjustByBps(amount, bps);
      expect(out).toBeGreaterThanOrEqual(amount);
      expect(Math.abs(out - (amount * (10_000 + bps)) / 10_000)).toBeLessThanOrEqual(0.5);
    }
  });
});

// ---------------------------------------------------------------------------
// Juros, multa e desconto por pontualidade
// ---------------------------------------------------------------------------

describe('qa-financeiro: juros/multa e desconto', () => {
  it('2% de multa + 1% a.m. pro rata dia, arredondado ao centavo', () => {
    // 1.000,00 vencido em 05/10/2026 (segunda), pago em 20/10: 15 dias → multa 20,00 + juros 5,00.
    expect(suggestLateFees(100_000, '2026-10-05', '2026-10-20')).toEqual({ fine: 2000, interest: 500, days: 15 });
    // 333,33 com 7 dias: multa 6,67 (6,6666) e juros 0,78 (0,7777).
    expect(suggestLateFees(33_333, '2026-10-05', '2026-10-12')).toEqual({ fine: 667, interest: 78, days: 7 });
    // Pago no vencimento: nada.
    expect(suggestLateFees(100_000, '2026-10-05', '2026-10-05')).toEqual({ fine: 0, interest: 0, days: 0 });
  });

  it('vencimento no sábado/domingo/feriado: pagar no próximo dia útil não é atraso; depois disso conta do vencimento nominal', () => {
    // 10/10/2026 é sábado → 12/10 é feriado (N. Sra. Aparecida) → 13/10 (terça).
    expect(effectiveDueDate('2026-10-10')).toBe('2026-10-13');
    expect(daysLate('2026-10-10', '2026-10-13')).toBe(0);
    expect(daysLate('2026-10-10', '2026-10-14')).toBe(4);
    expect(earnsDiscount('2026-10-10', '2026-10-13')).toBe(true);
    expect(earnsDiscount('2026-10-10', '2026-10-14')).toBe(false);
  });

  it('desconto em pontos-base arredondado ao centavo', () => {
    expect(discountAmount(85_000, 500)).toBe(4_250);
    expect(discountAmount(33_333, 250)).toBe(833);
    expect(discountAmount(33_333, 0)).toBe(0);
    expect(discountAmount(33_333, null)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Inadimplência: faixas de atraso
// ---------------------------------------------------------------------------

describe('qa-financeiro: inadimplência (gravidade por faixa de atraso)', () => {
  it('faixas 0 · 1–5 · 6–15 · 16–30 · >30 dias', () => {
    expect([0, 1, 5, 6, 15, 16, 30, 31, 45, 61, 90].map(lateSeverity)).toEqual([0, 0.25, 0.25, 0.5, 0.5, 0.75, 0.75, 1, 1, 1, 1]);
  });

  it('cliente sem histórico: 800 (baixo risco); um atraso longo recente derruba mais que um curto', () => {
    expect(delinquencyScore([], 0).score).toBe(800);
    const short = delinquencyScore([{ monthsAgo: 0, daysLate: 3 }], 0).score;
    const long = delinquencyScore([{ monthsAgo: 0, daysLate: 75 }], 0).score;
    expect(long).toBeLessThan(short);
    expect(riskOf(800)).toBe('baixo');
    expect(riskOf(399)).toBe('critico');
  });

  it('diferença de dias para o relatório (hoje − vencimento), sem fuso', () => {
    expect(diffInDays('2026-10-20', '2026-09-20')).toBe(30);
    expect(diffInDays('2026-10-20', '2026-08-21')).toBe(60);
    expect(diffInDays('2026-03-30', '2026-03-01')).toBe(29); // horário de verão não existe mais, mas a conta é UTC
  });
});

// Utilitário local só para manter o tipo importado em uso (ISODate) e documentar a âncora.
export const QA_SAMPLE_DATE: ISODate = '2026-10-20';
