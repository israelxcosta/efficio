// The finding line of each financial card (docs/dashboards-redesign.md §5, §7.3): the sentence
// with the number that matters, under the stable card title. Pure and tested; every function
// returns null without data and the card falls back to its short description. Windows other than
// the chosen month ("Hoje · ", "Próximos 15 dias · ") are added by the card, not here.

import { formatBRL, formatCompactBRL, MONTH_NAMES, type DashboardResponse, type ISODate, type MonthKey, type MonthSummary } from '@effinance/shared';
import type { ProjectionSummary } from '@/components/charts/chart-scale';

const pct = (part: number, total: number) => Math.round((part / total) * 100);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Receitas acima das despesas em 5 de 6 meses" (periods without movement do not count). */
export function cashflowInsight(rows: readonly { receita: number; despesa: number }[], unit: { many: string }): string | null {
  const active = rows.filter((r) => r.receita !== 0 || r.despesa !== 0);
  if (active.length === 0) return null;
  const up = active.filter((r) => r.receita > r.despesa).length;
  const down = active.filter((r) => r.despesa > r.receita).length;
  return up >= down
    ? `Receitas acima das despesas em ${up} de ${active.length} ${unit.many}`
    : `Despesas acima das receitas em ${down} de ${active.length} ${unit.many}`;
}

/** "Transportadora Rota Sul Ltda concentra 84% do vencido". */
export function debtorsInsight(debtors: readonly { name: string; amount: number }[]): string | null {
  const total = debtors.reduce((a, d) => a + d.amount, 0);
  if (debtors.length === 0 || total <= 0) return null;
  const top = [...debtors].sort((a, b) => b.amount - a.amount)[0]!;
  if (debtors.length === 1 || top.amount >= total) return `${top.name} tem todo o vencido`;
  return `${top.name} concentra ${pct(top.amount, total)}% do vencido`;
}

/** "A pagar R$ 3.499,90 (4) · a receber R$ 12.565,00 (21)". */
export function upcomingInsight(t: DashboardResponse['upcomingTotals']): string | null {
  const parts: string[] = [];
  if (t.expenseCount > 0) parts.push(`a pagar ${formatBRL(t.expense)} (${t.expenseCount})`);
  if (t.incomeCount > 0) parts.push(`a receber ${formatBRL(t.income)} (${t.incomeCount})`);
  return parts.length ? upperFirst(parts.join(' · ')) : null;
}

/** "Pessoal soma 66% das despesas". */
export function categoryInsight(items: readonly { name: string; amount: number }[], noun: 'despesas' | 'receitas'): string | null {
  const total = items.reduce((a, i) => a + i.amount, 0);
  if (items.length === 0 || total <= 0) return null;
  const top = [...items].sort((a, b) => b.amount - a.amount)[0]!;
  return `${top.name} soma ${pct(top.amount, total)}% das ${noun}`;
}

const dayMonth = (d: ISODate) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** "De R$ 64,7 mil hoje a R$ 41,6 mil em 90 dias", or "Fica negativo em 12/01". */
export function projectionInsight(s: Pick<ProjectionSummary, 'today' | 'milestones' | 'negativeFrom'>): string | null {
  if (s.negativeFrom) return `Fica negativo em ${dayMonth(s.negativeFrom)}`;
  const last = s.milestones[s.milestones.length - 1];
  if (!last) return null;
  return `De ${formatCompactBRL(s.today)} hoje a ${formatCompactBRL(last.saldo)} em ${last.dias} dias`;
}

/** "74% pago · falta R$ 3.319,90" (`recebido` for fixed income). */
export function fixedInsight(paid: number, total: number, verb: 'pago' | 'recebido' = 'pago'): string | null {
  if (total <= 0) return null;
  if (paid >= total) return `100% ${verb}`;
  return `${pct(paid, total)}% ${verb} · falta ${formatBRL(total - paid)}`;
}

/** "110% do previsto gerado · 0% recebido". */
export function feesMonthInsight(planned: number, generated: number, received: number): string | null {
  if (planned <= 0) return 'Nada previsto pelas vigências';
  const head = `${pct(generated, planned)}% do previsto gerado`;
  return generated > 0 ? `${head} · ${pct(received, generated)}% recebido` : head;
}

/** "30% das receitas recebidas · 75% das despesas pagas". */
export function summaryInsight(s: Pick<MonthSummary, 'income' | 'paidIncome' | 'expense' | 'paidExpense'>): string | null {
  const parts: string[] = [];
  if (s.income > 0) parts.push(`${pct(s.paidIncome, s.income)}% das receitas recebidas`);
  if (s.expense > 0) parts.push(`${pct(s.paidExpense, s.expense)}% das despesas pagas`);
  return parts.length ? parts.join(' · ') : null;
}

/** "Maior faixa: até 30 dias (87%)". */
export function agingInsight(buckets: readonly { label: string; amount: number }[]): string | null {
  const total = buckets.reduce((a, b) => a + b.amount, 0);
  if (total <= 0) return null;
  const top = [...buckets].sort((a, b) => b.amount - a.amount)[0]!;
  return `Maior faixa: ${lowerFirst(top.label)} (${pct(top.amount, total)}%)`;
}

/** "R$ 64.653,86 em 4 contas". */
export function balancesInsight(total: number, count: number): string | null {
  if (count <= 0) return null;
  return `${formatBRL(total)} em ${count} ${count === 1 ? 'conta' : 'contas'}`;
}

/**
 * "8 ativos · +2 vs outubro · ticket médio R$ 1.637,14" (the change of the base against the previous
 * month, from the evolution report, when given).
 */
export function portfolioInsight(active: number, averageTicket: number | null, change?: { diff: number; previous: MonthKey } | null): string | null {
  if (active <= 0) return null;
  const parts = [`${active} ${active === 1 ? 'ativo' : 'ativos'}`];
  if (change) {
    const month = MONTH_NAMES[Number(change.previous.slice(5, 7)) - 1]!.toLowerCase();
    parts.push(change.diff === 0 ? `igual a ${month}` : `${change.diff > 0 ? '+' : '−'}${Math.abs(change.diff)} vs ${month}`);
  }
  if (averageTicket !== null) parts.push(`ticket médio ${formatBRL(averageTicket)}`);
  return parts.join(' · ');
}

/**
 * "Hoje · maior faixa…": a window prefix before a finding. A leading word loses its capital; a
 * value ("R$ …") or an acronym stays as it is.
 */
export function withWindow(window: string, insight: string | null): string | null {
  if (!insight) return null;
  const word = /^\p{Lu}\p{Ll}/u.test(insight);
  return `${window} · ${word ? lowerFirst(insight) : insight}`;
}
