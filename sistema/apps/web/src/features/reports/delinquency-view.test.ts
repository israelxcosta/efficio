import { describe, expect, it } from 'vitest';
import type { DelinquencyClient } from '@effinance/shared';
import { countByRisk, filterClients, formatChance, formatDays, normalizeText, probabilityZone, sortClients } from './delinquency-view';

function client(patch: Partial<DelinquencyClient>): DelinquencyClient {
  return {
    contactId: patch.name ?? 'x',
    name: 'Cliente',
    tradeName: null,
    document: null,
    responsibleName: null,
    phone: null,
    status: 'active',
    dueCount: 12,
    onTimeCount: 12,
    lateCount: 0,
    openCount: 0,
    openAmount: 0,
    avgDaysLate: null,
    maxDaysLate: 0,
    interestCount: 0,
    fineCount: 0,
    interestTotal: 0,
    fineTotal: 0,
    probability: 0.1,
    score: 900,
    risk: 'baixo',
    lowHistory: false,
    overdue: [],
    ...patch,
  };
}

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

describe('probabilityZone', () => {
  it('maps the chance of paying late to the score bands', () => {
    expect(probabilityZone(0)).toBe('baixo');
    expect(probabilityZone(0.199)).toBe('baixo');
    expect(probabilityZone(0.2)).toBe('moderado');
    expect(probabilityZone(0.45)).toBe('alto');
    expect(probabilityZone(0.6)).toBe('critico');
    expect(probabilityZone(1)).toBe('critico');
    expect(probabilityZone(Number.NaN)).toBe('baixo');
  });
});

describe('countByRisk', () => {
  it('counts the clients of each band', () => {
    expect(countByRisk([a, b, client({ risk: 'critico' }), client({ risk: 'moderado' }), client({ risk: 'baixo' })])).toEqual({
      baixo: 3,
      moderado: 1,
      alto: 0,
      critico: 1,
    });
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
