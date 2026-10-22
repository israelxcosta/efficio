// Pure helpers of the "Inadimplência" report: client sorting and search, risk zones of the
// thermometer and number formatting. No React here, so everything is unit-tested.

import { onlyDigits, type DelinquencyClient, type DelinquencyRisk } from '@effinance/shared';

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

/**
 * Zones of the portfolio thermometer by the chance of paying late. They mirror the score bands
 * (score ≈ 1000 × (1 − chance) before penalties: 800+ / 600+ / 400+ / below).
 */
export const PROBABILITY_ZONES: readonly { risk: DelinquencyRisk; from: number; to: number }[] = [
  { risk: 'baixo', from: 0, to: 0.2 },
  { risk: 'moderado', from: 0.2, to: 0.4 },
  { risk: 'alto', from: 0.4, to: 0.6 },
  { risk: 'critico', from: 0.6, to: 1 },
];

export function probabilityZone(probability: number): DelinquencyRisk {
  const p = Number.isFinite(probability) ? probability : 0;
  return PROBABILITY_ZONES.find((z) => p < z.to)?.risk ?? 'critico';
}

/** Clients per risk band, in the order of DELINQUENCY_RISKS. */
export function countByRisk(clients: readonly Pick<DelinquencyClient, 'risk'>[]): Record<DelinquencyRisk, number> {
  const counts: Record<DelinquencyRisk, number> = { baixo: 0, moderado: 0, alto: 0, critico: 0 };
  for (const c of clients) counts[c.risk] += 1;
  return counts;
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
