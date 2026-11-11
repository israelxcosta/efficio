// The finding line under each card title of the financial dashboard (docs/dashboards-redesign.md
// §5 and §7.3): pure sentences with the number that matters; null without data.
import { describe, expect, it } from 'vitest';
import { formatBRL, type MonthSummary } from '@effinance/shared';
import {
  agingInsight,
  balancesInsight,
  cashflowInsight,
  categoryInsight,
  debtorsInsight,
  feesMonthInsight,
  fixedInsight,
  portfolioInsight,
  projectionInsight,
  summaryInsight,
  upcomingInsight,
  withWindow,
} from './insight-lines';

describe('finding lines', () => {
  it('aging: the largest bucket and its share', () => {
    expect(
      agingInsight([
        { label: 'Até 30 dias', amount: 563000 },
        { label: '31 a 60 dias', amount: 17000 },
        { label: 'Acima de 60 dias', amount: 68000 },
      ]),
    ).toBe('Maior faixa: até 30 dias (87%)');
    expect(agingInsight([{ label: 'Até 30 dias', amount: 0 }, { label: '31 a 60 dias', amount: 0 }])).toBeNull();
  });

  it('balances: total and number of accounts', () => {
    expect(balancesInsight(6465386, 4)).toBe(`${formatBRL(6465386)} em 4 contas`);
    expect(balancesInsight(1000, 1)).toBe(`${formatBRL(1000)} em 1 conta`);
    expect(balancesInsight(0, 0)).toBeNull();
  });

  it('portfolio: active clients and the average fee', () => {
    expect(portfolioInsight(8, 163714)).toBe(`8 ativos · ticket médio ${formatBRL(163714)}`);
    expect(portfolioInsight(8, null)).toBe('8 ativos');
    expect(portfolioInsight(1, null)).toBe('1 ativo');
    expect(portfolioInsight(0, 163714)).toBeNull();
  });

  it('portfolio: the change of the base against the previous month', () => {
    expect(portfolioInsight(8, 163714, { diff: 2, previous: '2026-10' })).toBe(`8 ativos · +2 vs outubro · ticket médio ${formatBRL(163714)}`);
    expect(portfolioInsight(8, null, { diff: 0, previous: '2026-10' })).toBe('8 ativos · igual a outubro');
    expect(portfolioInsight(8, 163714, { diff: -1, previous: '2026-10' })).toBe(`8 ativos · −1 vs outubro · ticket médio ${formatBRL(163714)}`);
    expect(portfolioInsight(8, 163714, null)).toBe(`8 ativos · ticket médio ${formatBRL(163714)}`);
  });

  it('cash flow: on which side most periods fall', () => {
    const rows = (up: number) =>
      Array.from({ length: 6 }, (_, i) => (i < up ? { receita: 200, despesa: 100 } : { receita: 100, despesa: 200 }));
    expect(cashflowInsight(rows(5), { many: 'meses' })).toBe('Receitas acima das despesas em 5 de 6 meses');
    expect(cashflowInsight(rows(1), { many: 'meses' })).toBe('Despesas acima das receitas em 5 de 6 meses');
    expect(cashflowInsight([], { many: 'meses' })).toBeNull();
    expect(cashflowInsight([{ receita: 0, despesa: 0 }], { many: 'meses' })).toBeNull();
  });

  it('debtors: how much of the overdue the largest debtor holds', () => {
    expect(
      debtorsInsight([
        { name: 'Transportadora Rota Sul Ltda', amount: 545000 },
        { name: 'Juliana Prado', amount: 103000 },
      ]),
    ).toBe('Transportadora Rota Sul Ltda concentra 84% do vencido');
    expect(debtorsInsight([{ name: 'Transportadora Rota Sul Ltda', amount: 545000 }])).toBe('Transportadora Rota Sul Ltda tem todo o vencido');
    expect(debtorsInsight([])).toBeNull();
  });

  it('upcoming: what is to pay and to receive', () => {
    expect(upcomingInsight({ expenseCount: 4, expense: 349990, incomeCount: 21, income: 1256500 })).toBe(
      `A pagar ${formatBRL(349990)} (4) · a receber ${formatBRL(1256500)} (21)`,
    );
    expect(upcomingInsight({ expenseCount: 0, expense: 0, incomeCount: 2, income: 5000 })).toBe(`A receber ${formatBRL(5000)} (2)`);
    expect(upcomingInsight({ expenseCount: 0, expense: 0, incomeCount: 0, income: 0 })).toBeNull();
  });

  it('categories: the share of the largest one', () => {
    expect(
      categoryInsight(
        [
          { name: 'Pessoal', amount: 910000 },
          { name: 'Ocupação', amount: 227990 },
          { name: 'Outros', amount: 248810 },
        ],
        'despesas',
      ),
    ).toBe('Pessoal soma 66% das despesas');
    expect(categoryInsight([], 'receitas')).toBeNull();
  });

  it('projection: from today to the last milestone, or when it goes negative', () => {
    const milestones = [{ dias: 90 as const, date: '2027-02-03', saldo: 4161416 }];
    expect(projectionInsight({ today: 6465386, milestones, negativeFrom: null })).toBe('De R$ 64,7 mil hoje a R$ 41,6 mil em 90 dias');
    expect(projectionInsight({ today: 6465386, milestones, negativeFrom: '2027-01-12' })).toBe('Fica negativo em 12/01');
    expect(projectionInsight({ today: 0, milestones: [], negativeFrom: null })).toBeNull();
  });

  it('fixed entries: share paid and what is left', () => {
    expect(fixedInsight(960000, 1291990)).toBe(`74% pago · falta ${formatBRL(331990)}`);
    expect(fixedInsight(500, 1000, 'recebido')).toBe(`50% recebido · falta ${formatBRL(500)}`);
    expect(fixedInsight(1000, 1000)).toBe('100% pago');
    expect(fixedInsight(0, 0)).toBeNull();
  });

  it('fees of the month: generated against planned and received against generated', () => {
    expect(feesMonthInsight(1146000, 1256500, 0)).toBe('110% do previsto gerado · 0% recebido');
    expect(feesMonthInsight(0, 1256500, 0)).toBe('Nada previsto pelas vigências');
    expect(feesMonthInsight(1146000, 0, 0)).toBe('0% do previsto gerado');
  });

  it('summary: share received and share paid', () => {
    const s = { income: 1792360, paidIncome: 535860, expense: 1386800, paidExpense: 1036810 } as MonthSummary;
    expect(summaryInsight(s)).toBe('30% das receitas recebidas · 75% das despesas pagas');
    expect(summaryInsight({ ...s, income: 0, paidIncome: 0 })).toBe('75% das despesas pagas');
    expect(summaryInsight({ ...s, income: 0, paidIncome: 0, expense: 0, paidExpense: 0 })).toBeNull();
  });
});

describe('window prefix', () => {
  it('prefixes the window and lowercases only a leading word', () => {
    expect(withWindow('Hoje', 'Maior faixa: até 30 dias (87%)')).toBe('Hoje · maior faixa: até 30 dias (87%)');
    expect(withWindow('Hoje', `${formatBRL(1000)} em 1 conta`)).toBe(`Hoje · ${formatBRL(1000)} em 1 conta`);
    expect(withWindow('Hoje', null)).toBeNull();
  });
});
