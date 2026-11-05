// Pure rules of the number strip on top of the financial dashboard (docs/dashboards-redesign.md
// §7.1): the change vs the previous month, the series of the sparklines and the footers.

import { formatBRL, formatPercent, type DashboardResponse, type MonthSummary } from '@effinance/shared';

export interface ChangeParts {
  /** "+20,0%", "-2,2%", "+17,6 p.p.". */
  text: string;
  /** Green when the change is good, red when bad (a rise in expenses is bad), grey when flat. */
  tone: 'success' | 'danger' | 'muted';
  up: boolean;
}

/**
 * Text and tone of a change: relative (`percent`, 0.1 = +10%) or a difference of rates (`pp`,
 * 0.046 = +4,6 p.p.). `invert` = a rise is bad. No base (null/undefined) → null.
 */
export function changeParts(change: number | null | undefined, unit: 'percent' | 'pp', invert = false): ChangeParts | null {
  if (change === null || change === undefined || !Number.isFinite(change)) return null;
  const up = change >= 0;
  const flat = Math.abs(change) < 0.0005;
  const good = invert ? !up : up;
  const tone = flat ? 'muted' : good ? 'success' : 'danger';
  const text =
    unit === 'pp'
      ? `${up ? '+' : '−'}${Math.abs(change * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`
      : `${up ? '+' : ''}${formatPercent(change)}`;
  return { text, tone, up };
}

/** One value per month of `monthly` (oldest first), for a sparkline. */
export function monthlySeries(monthly: readonly MonthSummary[], key: 'income' | 'expense' | 'net'): number[] {
  return monthly.map((m) => m[key]);
}

/** Footer of "Resultado": the margin and its change in points ("sem receitas no mês" without income). */
export function marginText(s: Pick<MonthSummary, 'savingsRate'>, p: Pick<MonthSummary, 'savingsRate'>): string {
  if (s.savingsRate === null) return 'sem receitas no mês';
  const margin = `margem ${formatPercent(s.savingsRate, 1)}`;
  if (p.savingsRate === null) return margin;
  const change = changeParts(s.savingsRate - p.savingsRate, 'pp');
  return change ? `${margin} · ${change.text} vs mês anterior` : margin;
}

/** Footer of "Patrimônio": what it is made of (the API has no balance history to compare). */
export function netWorthText(b: DashboardResponse['balances']): string {
  const parts = [`Em contas ${formatBRL(b.accounts)}`, `investido ${formatBRL(b.investments)}`];
  if (b.cardDebt > 0) parts.push(`cartão −${formatBRL(b.cardDebt)}`);
  return parts.join(' · ');
}
