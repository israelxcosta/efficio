import { describe, expect, it } from 'vitest';
import { formatBRL, type EvolutionMonth } from '@effinance/shared';
import { evolutionFinding, evolutionKpis, evolutionRows, feeBridge, moneyFinding, signedCount, signedMoney, signedPercent } from './evolution-logic';
import { m, withLists } from './test-fixtures';

const [aug, sep, oct] = m as [EvolutionMonth, EvolutionMonth, EvolutionMonth];
/** October like September: same base, same fees. */
const flat = [aug, sep, { ...oct, partial: false, activeClients: 4, netChange: 0, newClients: 0, churnedClients: 0, churnedList: [], recurringFees: 190_000 }];
/** October with one in and one out. */
const swap = [aug, sep, { ...flat[2]!, newClients: 1, churnedClients: 1, newList: [{ id: 'n', name: 'Nova', fee: 30_000 }], churnedList: oct.churnedList }];
/** October without any fee period registered. */
const noFees = [aug, sep, { ...oct, recurringFees: 0, clientsWithFee: 0, averageFee: 0 }];

describe('signs', () => {
  it('writes counts, money and percents with the sign', () => {
    expect(signedCount(4)).toBe('+4');
    expect(signedCount(-1)).toBe('−1');
    expect(signedCount(0)).toBe('0');
    expect(signedMoney(480_000)).toBe(`+${formatBRL(480_000)}`);
    expect(signedMoney(-30_000)).toBe(`−${formatBRL(30_000)}`);
    expect(signedMoney(0)).toBe(formatBRL(0));
    expect(signedPercent(-30_000 / 190_000)).toBe('−15,8%');
    expect(signedPercent(31)).toBe('+3.100,0%');
    expect(signedPercent(0)).toBe('0,0%');
  });
});

describe('evolutionFinding', () => {
  it('says how the base and the monthly fee moved against the previous month', () => {
    expect(evolutionFinding(m, '2026-10')).toBe(`Outubro: −1 cliente (0 novos, 1 encerrado) · honorário mensal ${signedMoney(-30_000)} (−15,8%) vs setembro`);
    expect(evolutionFinding(m, '2026-09')).toBe(`Setembro: +2 clientes (2 novos, 0 encerrados) · honorário mensal ${signedMoney(30_000)} (+18,8%) vs agosto`);
  });

  it('says when the base held', () => {
    expect(evolutionFinding(flat, '2026-10')).toBe('Outubro: carteira estável em 4 clientes · honorário mensal igual a setembro');
    expect(evolutionFinding(swap, '2026-10')).toMatch(/^Outubro: base igual a setembro \(1 novo, 1 encerrado\) · honorário mensal igual a setembro$/);
  });

  it('has no comparison for the first month of the window', () => {
    expect(evolutionFinding(m, '2026-08')).toBe(`Agosto: 2 clientes ativos · honorário mensal ${formatBRL(160_000)}`);
  });
});

describe('evolutionKpis', () => {
  it('compares the reference month with the previous one, marking the partial month', () => {
    expect(evolutionKpis(m, '2026-10').map((k) => [k.key, k.label, k.value, k.footer, k.trend])).toEqual([
      ['activeClients', 'Clientes ativos', '3', '−1 vs setembro · 0 novos, 1 encerrado · parcial', 'down'],
      ['recurringFees', 'Honorário mensal recorrente', formatBRL(160_000), `${signedMoney(-30_000)} (−15,8%) vs setembro`, 'down'],
      ['averageFee', 'Ticket médio', formatBRL(80_000), '+26,3% vs setembro · 2 de 3 com vigência', 'up'],
      ['billed', 'Faturado no mês', formatBRL(140_000), `recebido ${formatBRL(159_300)} até hoje · −12,5% vs setembro`, 'down'],
    ]);
  });

  it('says when the base and the fee held', () => {
    const [active, fees] = evolutionKpis(flat, '2026-10');
    expect(active!.footer).toBe('igual a setembro · 0 novos, 0 encerrados');
    expect(fees!.footer).toBe('igual a setembro');
  });

  it('gives the received share of a complete month', () => {
    expect(evolutionKpis(m, '2026-09')[3]!.footer).toBe('recebido 69% · +3.100,0% vs agosto');
  });

  it('colours only the change of the base and of the fees', () => {
    const [active, fees, ticket] = evolutionKpis(m, '2026-10');
    expect(active!.parts[0]).toEqual({ text: '−1', tone: 'danger' });
    expect(fees!.parts[0]).toEqual({ text: `${signedMoney(-30_000)} (−15,8%)`, tone: 'danger' });
    expect(ticket!.parts.every((p) => !p.tone)).toBe(true);
  });

  it('shows the values without comparison in the first month, and "—" without fee periods', () => {
    const first = evolutionKpis(m, '2026-08');
    expect(first.map((k) => k.footer)).toEqual(['1 novo, 0 encerrados', 'sem o mês anterior na janela', 'sem o mês anterior na janela', 'recebido 100%']);
    expect(first.every((k) => k.trend === 'flat')).toBe(true);
    expect(evolutionKpis(noFees, '2026-10')[2]).toMatchObject({ value: '—', footer: 'nenhum cliente com vigência' });
  });
});

describe('feeBridge', () => {
  it('goes from the previous base to the current one: new, adjustments and churned', () => {
    expect(feeBridge(withLists.oct, withLists.sep)).toEqual([
      { key: 'previous', label: 'Base de setembro', amount: 100_000 },
      { key: 'new', label: 'Novos (1)', amount: 200_000 },
      { key: 'adjustment', label: 'Reajustes', amount: 10_000 },
      { key: 'churned', label: 'Encerrados (0)', amount: 0 },
      { key: 'current', label: 'Base de outubro', amount: 310_000 },
    ]);
  });

  it('keeps the identity with the churned fee of the previous month', () => {
    const rows = feeBridge(withLists.sepChurn, withLists.aug)!;
    const by = Object.fromEntries(rows.map((r) => [r.key, r.amount]));
    expect(by).toEqual({ previous: 150_000, new: 0, adjustment: 0, churned: 50_000, current: 100_000 });
    expect(by.previous! + by.new! + by.adjustment! - by.churned!).toBe(by.current);
  });

  it('has no bridge without the previous month', () => {
    expect(feeBridge(aug, undefined)).toBeNull();
  });
});

describe('evolutionRows', () => {
  it('lists the months newest first, each compared with the one below', () => {
    expect(evolutionRows(m).map((x) => [x.month, x.label, x.netChange, x.feesChange, x.partial])).toEqual([
      ['2026-10', 'Out/26', -1, -30_000, true],
      ['2026-09', 'Set/26', 2, 30_000, false],
      ['2026-08', 'Ago/26', 1, null, false],
    ]);
  });

  it('computes the received share and leaves the ticket empty without fee periods', () => {
    expect(evolutionRows(m)[1]!.receivedShare).toBeCloseTo(0.6875);
    expect(evolutionRows(m)[0]!.averageFee).toBe(80_000);
    expect(evolutionRows(noFees)[0]!.averageFee).toBeNull();
    expect(evolutionRows([{ ...aug, billed: 0 }])[0]!.receivedShare).toBeNull();
  });
});

describe('moneyFinding', () => {
  it('says how much of the billed came in and how the billed moved, noting the partial month', () => {
    expect(moneyFinding(m, '2026-09')).toBe('Setembro: recebido 69% do faturado · faturado +3.100,0% vs agosto · outubro parcial (até 20/10)');
    expect(moneyFinding(m, '2026-10')).toBe(`Outubro até 20/10: recebido ${formatBRL(159_300)} · faturado −12,5% vs setembro`);
    expect(moneyFinding(m, '2026-08')).toBe('Agosto: recebido 100% do faturado · outubro parcial (até 20/10)');
  });
});
