// Pure helpers of the "Inadimplência" report: client sorting, search and scope, the bars of "Como
// cada mês foi pago", the late-rate trend, the portfolio by risk, the score composition and number
// formatting. No React here, so everything is unit-tested.

import { DELINQUENCY_RISKS, formatMonthKey, onlyDigits, type DelinquencyClient, type DelinquencyMonth, type DelinquencyRisk, type MonthKey } from '@effinance/shared';

export type DelinquencySort = 'open' | 'score' | 'late';

export const DELINQUENCY_SORT_LABELS: Record<DelinquencySort, string> = {
  open: 'Em aberto',
  score: 'Score',
  late: 'Atrasos',
};

const byName = (a: DelinquencyClient, b: DelinquencyClient) => (a.tradeName || a.name).localeCompare(b.tradeName || b.name, 'pt-BR');
const lateShare = (c: DelinquencyClient) => (c.dueCount > 0 ? c.lateCount / c.dueCount : 0);

/**
 * open: largest open amount first; score: worst payers (lowest score) first; late: most late
 * payments first. Ties fall back to the other criteria and then to the name.
 */
export function sortClients(clients: readonly DelinquencyClient[], sort: DelinquencySort): DelinquencyClient[] {
  const list = [...clients];
  if (sort === 'open') return list.sort((a, b) => b.openAmount - a.openAmount || a.score - b.score || byName(a, b));
  if (sort === 'score') return list.sort((a, b) => a.score - b.score || b.openAmount - a.openAmount || byName(a, b));
  return list.sort(
    (a, b) => b.lateCount - a.lateCount || lateShare(b) - lateShare(a) || (b.avgDaysLate ?? 0) - (a.avgDaysLate ?? 0) || byName(a, b),
  );
}

/** Lowercase without accents, for forgiving search ("sao" finds "São"). */
export function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Matches razão social, nome fantasia, responsible person and CNPJ (with or without the mask). */
export function filterClients(clients: readonly DelinquencyClient[], query: string): DelinquencyClient[] {
  const q = normalizeText(query);
  if (!q) return [...clients];
  const digits = onlyDigits(query);
  return clients.filter(
    (c) =>
      normalizeText(c.name).includes(q) ||
      normalizeText(c.tradeName).includes(q) ||
      normalizeText(c.responsibleName).includes(q) ||
      (digits.length >= 2 && onlyDigits(c.document).includes(digits)),
  );
}

const oneDecimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** 12.3 → "12,3 dias", 1 → "1 dia", null → "—". */
export function formatDays(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days)) return '—';
  return `${oneDecimal.format(days)} ${days === 1 ? 'dia' : 'dias'}`;
}

/** 0.234 → "23%" (whole percent, for chances). */
export function formatChance(probability: number): string {
  return `${Math.round(Math.max(0, Math.min(1, probability)) * 100)}%`;
}

const wholePercent = (ratio: number) => `${Math.round(ratio * 100)}%`;

/** "3 retrabalhos em 90 dias" (null without any), under the score of a client. */
export function reworkText(count: number): string | null {
  if (count <= 0) return null;
  return `${count} ${count === 1 ? 'retrabalho' : 'retrabalhos'} em 90 dias`;
}

/**
 * The score in one line, for the tooltip: "Pontualidade 608 · em aberto −100 · retrabalho −90 = 418".
 * Zero parts stay out; with nothing taken, just the punctuality.
 */
export function scoreParts(s: { punctuality: number; openPenalty: number; reworkPenalty: number; score: number }): string {
  const parts = [`Pontualidade ${s.punctuality}`];
  if (s.openPenalty > 0) parts.push(`em aberto −${s.openPenalty}`);
  if (s.reworkPenalty > 0) parts.push(`retrabalho −${s.reworkPenalty}`);
  return parts.length === 1 ? parts[0]! : `${parts.join(' · ')} = ${s.score}`;
}

export type BarMode = 'count' | 'amount';

export interface MonthBar {
  month: MonthKey;
  /** "Out/26", or "Nov/26 · parcial" for the current month. */
  label: string;
  onTime: number;
  paidLate: number;
  openLate: number;
  /** Late share of the month (by count or by value, as the bars); null in the partial month or without receivables. */
  rate: number | null;
  partial: boolean;
}

/** One stacked bar per due month: paid on time · paid late · still open past due (spec §5.1). */
export function monthBars(monthly: readonly DelinquencyMonth[], mode: BarMode): MonthBar[] {
  return monthly.map((m) => {
    const [onTime, paidLate, openLate] =
      mode === 'count' ? [m.onTimeCount, m.paidLateCount, m.openLateCount] : [m.onTimeAmount, m.paidLateAmount, m.openLateAmount];
    const total = onTime + paidLate + openLate;
    return {
      month: m.month,
      label: `${formatMonthKey(m.month, 'short')}${m.partial ? ' · parcial' : ''}`,
      onTime,
      paidLate,
      openLate,
      rate: m.partial || total === 0 ? null : (paidLate + openLate) / total,
      partial: m.partial,
    };
  });
}

/**
 * Late share (Σ late ÷ Σ due) of the last 3 complete months and of the 3 before them; null without 6
 * complete months (the partial month never counts: it had no time to be late).
 */
export function lateTrend(monthly: readonly DelinquencyMonth[]): { recent: number; previous: number } | null {
  const complete = monthly.filter((m) => !m.partial);
  if (complete.length < 6) return null;
  const share = (months: readonly DelinquencyMonth[]) => {
    const due = months.reduce((sum, m) => sum + m.dueCount, 0);
    const late = months.reduce((sum, m) => sum + m.lateCount, 0);
    return due > 0 ? late / due : 0;
  };
  return { recent: share(complete.slice(-3)), previous: share(complete.slice(-6, -3)) };
}

/** Subtitle of "Como cada mês foi pago": the trend when there are 6 complete months, else the period's rate. */
export function lateFinding(monthly: readonly DelinquencyMonth[], lateRate: number): string {
  const trend = lateTrend(monthly);
  if (trend) return `Últimos 3 meses: ${wholePercent(trend.recent)} com atraso (eram ${wholePercent(trend.previous)} nos 3 anteriores)`;
  if (lateRate <= 0) return 'Nenhuma mensalidade atrasou no período';
  return `${wholePercent(lateRate)} das mensalidades do período atrasaram`;
}

/** Clients and open amount of each risk band (Carteira por risco). */
export function riskBands(clients: readonly Pick<DelinquencyClient, 'risk' | 'openAmount'>[]): Record<DelinquencyRisk, { count: number; openAmount: number }> {
  const bands = Object.fromEntries(DELINQUENCY_RISKS.map((r) => [r, { count: 0, openAmount: 0 }])) as Record<DelinquencyRisk, { count: number; openAmount: number }>;
  for (const c of clients) {
    bands[c.risk].count += 1;
    bands[c.risk].openAmount += c.openAmount;
  }
  return bands;
}

/** Clients with rework in the last 90 days and how many tasks they add up to. */
export function reworkSummary(clients: readonly Pick<DelinquencyClient, 'rework'>[]): { clients: number; tasks: number } {
  let count = 0;
  let tasks = 0;
  for (const c of clients) {
    if (c.rework.last90Days <= 0) continue;
    count += 1;
    tasks += c.rework.last90Days;
  }
  return { clients: count, tasks };
}

/** Names of a band's clients, most open first then worst score: "Pão Quente, Alicerce, Vida Saudável e mais 5". */
export function bandNames(clients: readonly DelinquencyClient[], risk: DelinquencyRisk, max = 3): string {
  const names = clients
    .filter((c) => c.risk === risk)
    .sort((a, b) => b.openAmount - a.openAmount || a.score - b.score)
    .map((c) => c.tradeName?.trim() || c.name.trim());
  if (names.length === 0) return 'nenhum cliente';
  if (names.length <= max) return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
  return `${names.slice(0, max).join(', ')} e mais ${names.length - max}`;
}

export type ClientScope = 'active' | 'all';

export const CLIENT_SCOPE_LABELS: Record<ClientScope, string> = { active: 'Ativos', all: 'Todos' };

/** `active` hides inactive clients with nothing open (nothing to act on); inactive ones that still owe stay. */
export function scopeClients<C extends Pick<DelinquencyClient, 'status' | 'openAmount'>>(clients: readonly C[], scope: ClientScope): C[] {
  if (scope === 'all') return [...clients];
  return clients.filter((c) => c.status !== 'inactive' || c.openAmount > 0);
}
