import { describe, expect, it } from 'vitest';
import type { DelinquencyMonth } from '@effinance/shared';
import {
  bandNames,
  filterClients,
  formatChance,
  formatDays,
  lateFinding,
  lateTrend,
  monthBars,
  normalizeText,
  reworkSummary,
  reworkText,
  riskBands,
  scopeClients,
  scoreParts,
  sortClients,
} from './delinquency-view';
import { client, demoClients as demo } from './test-fixtures';

const a = client({ name: 'Alfa Comércio LTDA', tradeName: 'Alfa', document: '11222333000181', openAmount: 0, score: 950, lateCount: 1, avgDaysLate: 3 });
const b = client({ name: 'Beta Serviços', responsibleName: 'João Conceição', openAmount: 70000, score: 420, lateCount: 6, avgDaysLate: 40 });
const c = client({ name: 'Gama Indústria', tradeName: 'São Gama', openAmount: 70000, score: 610, lateCount: 6, dueCount: 6, avgDaysLate: 10 });

describe('sortClients', () => {
  it('sorts by open amount, then the worst score', () => {
    expect(sortClients([a, c, b], 'open').map((x) => x.name)).toEqual(['Beta Serviços', 'Gama Indústria', 'Alfa Comércio LTDA']);
  });

  it('sorts by score, worst first', () => {
    expect(sortClients([a, c, b], 'score').map((x) => x.score)).toEqual([420, 610, 950]);
  });

  it('sorts by late payments, then by their share of the receivables', () => {
    // b and c were late 6 times; c in 6 of 6, b in 6 of 12.
    expect(sortClients([a, b, c], 'late').map((x) => x.name)).toEqual(['Gama Indústria', 'Beta Serviços', 'Alfa Comércio LTDA']);
  });

  it('does not change the input', () => {
    const input = [a, b, c];
    sortClients(input, 'score');
    expect(input).toEqual([a, b, c]);
  });
});

describe('filterClients', () => {
  it('finds by name, trade name and responsible person, ignoring accents and case', () => {
    expect(filterClients([a, b, c], 'sao gama').map((x) => x.name)).toEqual(['Gama Indústria']);
    expect(filterClients([a, b, c], 'SERVIÇOS').map((x) => x.name)).toEqual(['Beta Serviços']);
    expect(filterClients([a, b, c], 'conceicao').map((x) => x.name)).toEqual(['Beta Serviços']);
    expect(filterClients([a, b, c], 'alfa').map((x) => x.name)).toEqual(['Alfa Comércio LTDA']);
  });

  it('finds by CNPJ with or without the mask', () => {
    expect(filterClients([a, b, c], '11.222.333/0001-81')).toEqual([a]);
    expect(filterClients([a, b, c], '222333')).toEqual([a]);
  });

  it('returns everything for an empty query', () => {
    expect(filterClients([a, b, c], '  ')).toHaveLength(3);
  });
});

describe('formatting', () => {
  it('formats days and chances', () => {
    expect(formatDays(12.3)).toBe('12,3 dias');
    expect(formatDays(1)).toBe('1 dia');
    expect(formatDays(0)).toBe('0 dias');
    expect(formatDays(null)).toBe('—');
    expect(formatChance(0.234)).toBe('23%');
    expect(formatChance(1.4)).toBe('100%');
  });

  it('normalizes text', () => {
    expect(normalizeText('  São JOÃO ')).toBe('sao joao');
  });
});

function month(key: string, patch: Partial<DelinquencyMonth> = {}): DelinquencyMonth {
  const onTimeCount = patch.onTimeCount ?? 0;
  const paidLateCount = patch.paidLateCount ?? 0;
  const openLateCount = patch.openLateCount ?? 0;
  const dueCount = onTimeCount + paidLateCount + openLateCount;
  const lateCount = paidLateCount + openLateCount;
  const onTimeAmount = patch.onTimeAmount ?? onTimeCount * 100000;
  const paidLateAmount = patch.paidLateAmount ?? paidLateCount * 100000;
  const openLateAmount = patch.openLateAmount ?? openLateCount * 100000;
  return {
    month: key as DelinquencyMonth['month'],
    dueCount,
    lateCount,
    lateRate: dueCount > 0 ? lateCount / dueCount : 0,
    avgDaysLate: null,
    dueAmount: onTimeAmount + paidLateAmount + openLateAmount,
    lateAmount: paidLateAmount + openLateAmount,
    onTimeCount,
    paidLateCount,
    openLateCount,
    onTimeAmount,
    paidLateAmount,
    openLateAmount,
    paidLateAvgDays: null,
    partial: false,
    ...patch,
  };
}

const oct = month('2026-10', { onTimeCount: 6, paidLateCount: 2, openLateCount: 1, onTimeAmount: 600000, paidLateAmount: 240000, openLateAmount: 120000 });
const nov = month('2026-11', { onTimeCount: 1, partial: true });
/** 6 complete months of 20 receivables each, late rates 0.2 / 0.3 / 0.3 / 0.4 / 0.4 / 0.45, and the partial one. */
const lateOf = [4, 6, 6, 8, 8, 9];
const sixComplete = [
  ...lateOf.map((late, i) => month(`2026-0${i + 4}`, { onTimeCount: 20 - late, paidLateCount: late })),
  month('2026-10', { onTimeCount: 3, partial: true }),
];
const fiveComplete = sixComplete.slice(1);

describe('rework and score composition', () => {
  it('says the rework of the last 90 days', () => {
    expect(reworkText(0)).toBeNull();
    expect(reworkText(1)).toBe('1 retrabalho em 90 dias');
    expect(reworkText(3)).toBe('3 retrabalhos em 90 dias');
  });

  it('writes the parts of the score, leaving out the zero ones', () => {
    expect(scoreParts({ punctuality: 608, openPenalty: 100, reworkPenalty: 90, score: 418 })).toBe('Pontualidade 608 · em aberto −100 · retrabalho −90 = 418');
    expect(scoreParts({ punctuality: 916, openPenalty: 0, reworkPenalty: 120, score: 796 })).toBe('Pontualidade 916 · retrabalho −120 = 796');
    expect(scoreParts({ punctuality: 916, openPenalty: 0, reworkPenalty: 0, score: 916 })).toBe('Pontualidade 916');
  });
});

describe('monthBars ("Como cada mês foi pago")', () => {
  it('stacks each month by how it was paid, with the late rate on top, and marks the current month as partial', () => {
    expect(monthBars([oct, nov], 'count')).toEqual([
      { month: '2026-10', label: 'Out/26', onTime: 6, paidLate: 2, openLate: 1, rate: 0.3333333333333333, partial: false },
      { month: '2026-11', label: 'Nov/26 · parcial', onTime: 1, paidLate: 0, openLate: 0, rate: null, partial: true },
    ]);
  });

  it('switches to amounts, with the rate by value', () => {
    expect(monthBars([oct], 'amount')[0]).toMatchObject({ onTime: oct.onTimeAmount, paidLate: oct.paidLateAmount, openLate: oct.openLateAmount, rate: 0.375 });
  });

  it('has no rate for a month without receivables', () => {
    expect(monthBars([month('2026-09')], 'count')[0]!.rate).toBeNull();
  });
});

describe('lateTrend', () => {
  it('compares the last 3 complete months with the 3 before them', () => {
    expect(lateTrend(sixComplete)).toEqual({ previous: expect.closeTo(0.2667, 3), recent: expect.closeTo(0.4167, 3) });
  });

  it('needs 6 complete months', () => {
    expect(lateTrend(fiveComplete)).toBeNull();
  });

  it('writes the finding of the chart', () => {
    expect(lateFinding(sixComplete, 0.35)).toBe('Últimos 3 meses: 42% com atraso (eram 27% nos 3 anteriores)');
    expect(lateFinding(fiveComplete, 0.337)).toBe('34% das mensalidades do período atrasaram');
    expect(lateFinding([], 0)).toBe('Nenhuma mensalidade atrasou no período');
  });
});

describe('portfolio by risk', () => {
  it('counts the clients and the open amount of each band', () => {
    const bands = riskBands(demo);
    expect(bands.critico).toEqual({ count: 2, openAmount: 648000 });
    expect(bands.moderado).toEqual({ count: 1, openAmount: 0 });
    expect(bands.alto).toEqual({ count: 0, openAmount: 0 });
    expect(bands.baixo.count).toBe(7);
  });

  it('sums the rework of the last 90 days', () => {
    expect(reworkSummary(demo)).toEqual({ clients: 3, tasks: 4 });
  });

  it('names the clients of a band, most open first', () => {
    expect(bandNames(demo, 'critico')).toBe('Rota Sul e Ju Prado Design');
    expect(bandNames(demo, 'alto')).toBe('nenhum cliente');
    expect(bandNames(demo, 'baixo')).toBe('Alicerce, Vida Saudável, Instituto Aprender e mais 4');
  });
});

describe('scopeClients', () => {
  it('hides inactive clients with nothing open, keeping the inactive ones that still owe', () => {
    const owing = client({ name: 'Antiga', status: 'inactive', openAmount: 50000, openCount: 1 });
    const active = scopeClients([...demo, owing], 'active');
    expect(active.some((c) => c.status === 'inactive' && c.openAmount === 0)).toBe(false);
    expect(active).toContain(owing);
    expect(active).toHaveLength(9);
    expect(scopeClients(demo, 'all')).toHaveLength(10);
  });
});
